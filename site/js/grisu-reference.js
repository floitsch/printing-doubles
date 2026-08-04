import { decodeDouble, formatDecimal } from "./float.js";
import { exactDecimalOfRational, intervalOf, shortestDecimal } from "./oracle.js";

const TARGET_MIN_EXPONENT = -60;
const TARGET_MAX_EXPONENT = -32;
const UINT64_BITS = 64;
const CACHE_MIN_DECIMAL_EXPONENT = -348;
const CACHE_MAX_DECIMAL_EXPONENT = 340;
const CACHE_STEP = 8;
const POW10 = [1n];
const cachedPowers = new Map();

function pow10(power) {
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}

function bitLength(value) {
  return value.toString(2).length;
}

function compareShifted(numerator, denominator, exponent) {
  return exponent >= 0
    ? numerator - (denominator << BigInt(exponent))
    : (numerator << BigInt(-exponent)) - denominator;
}

function floorLog2Rational(numerator, denominator) {
  let exponent = bitLength(numerator) - bitLength(denominator);
  if (compareShifted(numerator, denominator, exponent) < 0n) exponent--;
  while (compareShifted(numerator, denominator, exponent + 1) >= 0n) exponent++;
  return exponent;
}

function roundedQuotient(numerator, denominator) {
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) quotient++;
  return quotient;
}

function cachedPower(decimalExponent) {
  if (cachedPowers.has(decimalExponent)) return cachedPowers.get(decimalExponent);
  const numerator = decimalExponent >= 0 ? pow10(decimalExponent) : 1n;
  const denominator = decimalExponent >= 0 ? 1n : pow10(-decimalExponent);
  let exponent = floorLog2Rational(numerator, denominator) - 63;
  const significand = exponent >= 0
    ? roundedQuotient(numerator, denominator << BigInt(exponent))
    : roundedQuotient(numerator << BigInt(-exponent), denominator);
  const power = { f: significand, e: exponent, decimalExponent };
  cachedPowers.set(decimalExponent, power);
  return power;
}

function normalize(f, e) {
  const shift = UINT64_BITS - bitLength(f);
  return { f: f << BigInt(shift), e: e - shift };
}

function normalizedDiyFp(value) {
  const decoded = decodeDouble(value);
  return normalize(decoded.significand, decoded.exponent);
}

function normalizedBoundaries(value) {
  const decoded = decodeDouble(value);
  const f = decoded.significand;
  const e = decoded.exponent;
  const plus = normalize(2n * f + 1n, e - 1);
  const lowerBoundaryIsCloser = decoded.fraction === 0n && decoded.exponent !== -1074;
  let minus = lowerBoundaryIsCloser
    ? { f: 4n * f - 1n, e: e - 2 }
    : { f: 2n * f - 1n, e: e - 1 };
  minus = { f: minus.f << BigInt(minus.e - plus.e), e: plus.e };
  return { minus, plus, lowerBoundaryIsCloser };
}

function multiply(left, right) {
  const product = left.f * right.f;
  return {
    f: (product + (1n << 63n)) >> 64n,
    e: left.e + right.e + 64,
  };
}

function selectCachedPower(wExponent) {
  const minimum = TARGET_MIN_EXPONENT - (wExponent + 64);
  const maximum = TARGET_MAX_EXPONENT - (wExponent + 64);
  for (let decimalExponent = CACHE_MIN_DECIMAL_EXPONENT; decimalExponent <= CACHE_MAX_DECIMAL_EXPONENT; decimalExponent += CACHE_STEP) {
    const power = cachedPower(decimalExponent);
    if (power.e >= minimum && power.e <= maximum) return power;
  }
  throw new Error(`No cached power for binary exponent ${wExponent}`);
}

function biggestPowerTen(number) {
  let power = 1n;
  let digits = 1;
  while (power * 10n <= number) {
    power *= 10n;
    digits++;
  }
  return { power, digits };
}

function roundWeed(digits, distanceToHigh, unsafeWidth, rest, decimalUnit, unit) {
  const smallDistance = distanceToHigh - unit;
  const bigDistance = distanceToHigh + unit;
  while (rest < smallDistance &&
         unsafeWidth - rest >= decimalUnit &&
         (rest + decimalUnit < smallDistance || smallDistance - rest >= rest + decimalUnit - smallDistance)) {
    digits[digits.length - 1]--;
    rest += decimalUnit;
  }
  if (rest < bigDistance &&
      unsafeWidth - rest >= decimalUnit &&
      (rest + decimalUnit < bigDistance || bigDistance - rest > rest + decimalUnit - bigDistance)) {
    return { success: false, reason: "the approximation cannot prove which neighboring decimal is closer", rest };
  }
  const safelyInside = 2n * unit <= rest && rest <= unsafeWidth - 4n * unit;
  return {
    success: safelyInside,
    reason: safelyInside ? "candidate lies in the safe interval" : "candidate lies only in the uncertainty fringe",
    rest,
  };
}

function digitGen(low, w, high) {
  const unit0 = 1n;
  const tooLow = low.f - unit0;
  const tooHigh = high.f + unit0;
  let unsafeWidth = tooHigh - tooLow;
  const binaryShift = -w.e;
  const one = 1n << BigInt(binaryShift);
  let integrals = tooHigh >> BigInt(binaryShift);
  let fractionals = tooHigh & (one - 1n);
  let { power: divisor, digits: kappa } = biggestPowerTen(integrals);
  const digits = [];
  const states = [];

  while (kappa > 0) {
    const digit = integrals / divisor;
    digits.push(Number(digit));
    integrals %= divisor;
    kappa--;
    const rest = (integrals << BigInt(binaryShift)) + fractionals;
    const canTry = rest < unsafeWidth;
    const weed = canTry
      ? roundWeed(digits, tooHigh - w.f, unsafeWidth, rest, divisor << BigInt(binaryShift), unit0)
      : null;
    states.push({ phase: "integer", digit: Number(digit), digits: digits.join(""), rest, unsafeWidth, unit: unit0, canTry, weed: weed?.reason });
    if (weed) return { ...weed, digits, kappa, states, safeWidth: unsafeWidth - 4n * unit0, unit: unit0 };
    divisor /= 10n;
  }

  let unit = unit0;
  for (;;) {
    fractionals *= 10n;
    unit *= 10n;
    unsafeWidth *= 10n;
    const digit = fractionals >> BigInt(binaryShift);
    digits.push(Number(digit));
    fractionals &= one - 1n;
    kappa--;
    const canTry = fractionals < unsafeWidth;
    const weed = canTry
      ? roundWeed(digits, (tooHigh - w.f) * unit, unsafeWidth, fractionals, one, unit)
      : null;
    states.push({ phase: "fraction", digit: Number(digit), digits: digits.join(""), rest: fractionals, unsafeWidth, unit, canTry, weed: weed?.reason });
    if (weed) return { ...weed, digits, kappa, states, safeWidth: unsafeWidth - 4n * unit, unit };
  }
}

export function grisu3(value) {
  if (!Number.isFinite(value) || value === 0) throw new RangeError("The Grisu3 finite path expects a finite, nonzero binary64 value");
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const w = normalizedDiyFp(magnitude);
  const boundaries = normalizedBoundaries(magnitude);
  const power = selectCachedPower(w.e);
  const scaled = {
    w: multiply(w, power),
    minus: multiply(boundaries.minus, power),
    plus: multiply(boundaries.plus, power),
  };
  const generated = digitGen(scaled.minus, scaled.w, scaled.plus);
  let coefficient = BigInt(generated.digits.join(""));
  if (negative) coefficient = -coefficient;
  const decimalExponent = -power.decimalExponent + generated.kappa;
  return {
    success: generated.success,
    reason: generated.reason,
    value,
    negative,
    coefficient,
    decimalExponent,
    text: generated.success ? formatDecimal(coefficient, decimalExponent) : null,
    attemptedText: formatDecimal(coefficient, decimalExponent),
    w,
    boundaries,
    power,
    scaled,
    generated,
  };
}

export function grisu3WithFallback(value) {
  const fast = grisu3(value);
  if (fast.success) return { ...fast, usedFallback: false };
  const fallback = shortestDecimal(value);
  return { ...fast, usedFallback: true, coefficient: fallback.coefficient, decimalExponent: fallback.exponent, text: fallback.text };
}

function compactInteger(value) {
  const text = value.toString();
  return text.length <= 19 ? text : `${text.slice(0, 10)}…${text.slice(-6)} (${text.length} digits)`;
}

function intervalScene(kind, footer) {
  const safe = kind === "safe";
  return {
    domain: [-1.18, 1.18],
    background: "#192632",
    bands: [
      { from: -.9, to: .9, top: .13, bottom: .86, color: "rgba(142,179,255,.12)", border: "#8eb3ff", label: "UNCERTAIN OUTER INTERVAL" },
      ...(safe ? [{ from: -.68, to: .68, top: .25, bottom: .74, color: "rgba(223,255,82,.16)", border: "#dfff52", label: "PROVABLY SAFE INTERVAL" }] : []),
    ],
    lanes: [{ y: .55, color: "#8eb3ff", label: "SCALED DIY-FP COORDINATES", ticks: [
      { x: 0, color: "#1565ff", width: 3, height: 54, dot: 5, topLabel: "scaled value" },
    ] }],
    footer,
  };
}

function generatedScene(result, state) {
  const safe = state.weed === "candidate lies in the safe interval";
  const outerLeft = .08;
  const outerRight = .92;
  const span = outerRight - outerLeft;
  const fraction = (numerator, denominator) => Number(numerator * 1_000_000n / denominator) / 1_000_000;
  const safeLeft = outerLeft + span * fraction(4n * state.unit, state.unsafeWidth);
  const safeRight = outerRight - span * fraction(2n * state.unit, state.unsafeWidth);
  const candidate = outerRight - span * fraction(state.rest, state.unsafeWidth);
  return {
    domain: [-.15, 1.15],
    background: "#192632",
    bands: [
      { from: outerLeft, to: outerRight, top: .14, bottom: .84, color: "rgba(142,179,255,.11)", border: "#8eb3ff", label: "POSSIBLY VALID" },
      { from: safeLeft, to: safeRight, top: .25, bottom: .73, color: "rgba(223,255,82,.15)", border: "#dfff52", label: "PROVABLY SAFE" },
    ],
    lanes: [{ y: .58, color: "#ff9b8e", label: `DIGITS GENERATED FROM THE UPPER APPROXIMATION · ${state.digits}`, ticks: [
      { x: candidate, color: safe ? "#dfff52" : "#ef4b35", width: 3, height: 60, dot: 5, topLabel: result.attemptedText },
    ] }],
    footer: safe ? "ROUNDWEED ACCEPTS · THE FAST RESULT IS PROVED SHORTEST AND CLOSEST" : "ROUNDWEED CANNOT PROVE THE RESULT · DISCARD IT AND USE THE FALLBACK",
  };
}

export function grisuTrace(value) {
  const result = grisu3(value);
  const exactInterval = intervalOf(Math.abs(value));
  const states = result.generated.states;
  const final = states.at(-1);
  return [
    {
      line: 1,
      label: "DiyFp",
      title: "Widen the 53-bit significand to 64 bits",
      why: "A DiyFp stores an unsigned integer significand and a separate binary exponent. Shifting the input's significand until its leading 1 reaches the top bit does not change the value; it exposes eleven spare low bits for approximate arithmetic.",
      registers: { input: Math.abs(value).toPrecision(17), diy_significand_hex: `0x${result.w.f.toString(16)}`, diy_exponent: result.w.e, value_identity: `${result.w.f} × 2^${result.w.e}` },
      visual: { scene: intervalScene("outer", "64 SIGNIFICAND BITS · 53 INPUT BITS PLUS 11 WORKING BITS") },
    },
    {
      line: 2,
      label: "Boundaries",
      title: "Construct lower and upper DiyFp boundaries",
      why: "As in Dragon, the parser interval determines which decimals may be printed. The boundaries are normalized to the same binary exponent as the center so subtraction becomes an integer operation.",
      registers: { lower_midpoint: exactDecimalOfRational(exactInterval.lower), upper_midpoint: exactDecimalOfRational(exactInterval.upper), unequal_spacing: result.boundaries.lowerBoundaryIsCloser ? "yes" : "no" },
      visual: { scene: intervalScene("outer", "THE TRUE INTERVAL IS KNOWN; ITS DIY-FP REPRESENTATION WILL BE APPROXIMATE") },
    },
    {
      line: 3,
      label: "Cached power",
      title: `Select the cached approximation of 10^${result.power.decimalExponent}`,
      why: `Multiplying by this power places the result at binary exponent ${result.scaled.w.e}, where integer and fractional digits can be extracted with shifts. The cached power and the high 64 bits of each product are rounded, so the scaled center and boundaries are each known only within one final DiyFp unit.`,
      registers: { cached_significand_hex: `0x${result.power.f.toString(16)}`, cached_binary_exponent: result.power.e, scaled_binary_exponent: result.scaled.w.e, maximum_error: "strictly less than 1 DiyFp unit per scaled value" },
      visual: { scene: intervalScene("safe", "INWARD SHRINKING LEAVES A REGION WHOSE MEMBERS ARE CERTAINLY VALID") },
    },
    ...states.map((state, index) => ({
      line: 4,
      label: `${state.phase === "integer" ? "Integer" : "Fractional"} digit ${index + 1}`,
      title: state.canTry ? `Test the prefix ${state.digits}` : `Generate ${state.digit}; the interval has not been reached`,
      why: state.canTry
        ? `The remaining distance is now smaller than the uncertain interval, so digit generation may stop. RoundWeed moves the last digit toward the center when that is unambiguous, then asks whether the candidate is far enough from every uncertainty fringe. Its conclusion is: ${state.weed}.`
        : "The generated prefix is still too far from the upper boundary approximation. Grisu retains it, advances one decimal place with fixed-width arithmetic, and tries again.",
      registers: { digits: state.digits, remainder_units: compactInteger(state.rest), uncertain_interval_units: compactInteger(state.unsafeWidth), stopping_test: state.canTry ? "reached" : "not yet", conclusion: state.weed || "continue" },
      visual: { scene: generatedScene(result, state) },
    })),
    {
      line: 5,
      label: result.success ? "Fast-path proof" : "Fallback",
      title: result.success ? `Accept ${result.text}` : `Discard ${result.attemptedText}`,
      why: result.success
        ? "The candidate lies in the safe interval, and the rounding comparison is decisive throughout the possible location of the true input. Grisu3 has proved recovery, shortestness, and the closest choice; no bignum work is needed."
        : "The attempted digits may be correct, but fixed-width approximation is not precise enough to prove that fact. Grisu3 reports failure without exposing the candidate. A complete formatter now invokes an exact fallback.",
      registers: { fast_path: result.success ? "accepted" : "rejected", result: result.success ? result.text : "no result", reason: result.reason },
      visual: { scene: generatedScene(result, final) },
    },
  ];
}

export const grisuConstants = {
  targetExponentRange: [TARGET_MIN_EXPONENT, TARGET_MAX_EXPONENT],
  cachedDecimalRange: [CACHE_MIN_DECIMAL_EXPONENT, CACHE_MAX_DECIMAL_EXPONENT],
  cachedDecimalStep: CACHE_STEP,
};
