import { decodeDouble, formatDecimal } from "./float.js";
import { dragonShortest } from "./dragon-reference.js";

const POW10 = [1n];

function pow10(power) {
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}

function bitLength(value) {
  value = value < 0n ? -value : value;
  return value === 0n ? 0 : value.toString(2).length;
}

function trailingZeroBits(value) {
  let count = 0;
  while (value !== 0n && (value & 1n) === 0n) {
    count++;
    value >>= 1n;
  }
  return count;
}

function compareInteger(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function estimateBurgerDecade(binaryExponent) {
  // This is the estimator in the authors' binary64 sample C. C integer
  // conversion truncates toward zero, which matters for negative exponents.
  const estimate = binaryExponent < 0
    ? Math.trunc(binaryExponent * 0.3010299956639812)
    : 1 + Math.trunc(binaryExponent * 0.3010299956639811);
  return Object.is(estimate, -0) ? 0 : estimate;
}

function initialBurgerIntegers(decoded) {
  const f = decoded.significand < 0n ? -decoded.significand : decoded.significand;
  const e = decoded.exponent;
  const hidden = 1n << 52n;
  if (e >= 0) {
    const twoToE = 1n << BigInt(e);
    if (f !== hidden) return { r: f * twoToE * 2n, s: 2n, mPlus: twoToE, mMinus: twoToE, unequal: false };
    return { r: f * twoToE * 4n, s: 4n, mPlus: twoToE * 2n, mMinus: twoToE, unequal: true };
  }
  if (e === -1074 || f !== hidden) {
    return { r: f * 2n, s: 1n << BigInt(1 - e), mPlus: 1n, mMinus: 1n, unequal: false };
  }
  return { r: f * 4n, s: 1n << BigInt(2 - e), mPlus: 2n, mMinus: 1n, unequal: true };
}

function maxBits(state) {
  return Math.max(bitLength(state.r), bitLength(state.s), bitLength(state.mPlus), bitLength(state.mMinus));
}

function cancelCommonTwos(state) {
  const shift = Math.min(
    trailingZeroBits(state.r),
    trailingZeroBits(state.s),
    trailingZeroBits(state.mPlus),
    trailingZeroBits(state.mMinus),
  );
  if (shift === 0) return { ...state, commonTwos: 0 };
  const amount = BigInt(shift);
  return {
    r: state.r >> amount,
    s: state.s >> amount,
    mPlus: state.mPlus >> amount,
    mMinus: state.mMinus >> amount,
    unequal: state.unequal,
    commonTwos: shift,
  };
}

export function burgerDybvigShortest(value) {
  if (!Number.isFinite(value) || value === 0) throw new RangeError("Burger–Dybvig expects a finite nonzero binary64 value");
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const decoded = decodeDouble(magnitude);
  const closed = (decoded.significand & 1n) === 0n;
  const floorLog2 = decoded.exponent + bitLength(decoded.significand) - 1;
  const estimate = estimateBurgerDecade(floorLog2);
  const initial = initialBurgerIntegers(decoded);
  let r = initial.r;
  let s = initial.s;
  let mPlus = initial.mPlus;
  let mMinus = initial.mMinus;

  if (estimate >= 0) s *= pow10(estimate);
  else {
    const scale = pow10(-estimate);
    r *= scale;
    mPlus *= scale;
    mMinus *= scale;
  }
  const estimatedState = { r, s, mPlus, mMinus };
  const estimateTooLow = closed ? r + mPlus >= s : r + mPlus > s;
  let k;
  if (estimateTooLow) {
    k = estimate + 1;
  } else {
    k = estimate;
    r *= 10n;
    mPlus *= 10n;
    mMinus *= 10n;
  }
  const correctedState = { r, s, mPlus, mMinus };
  let coefficient = 0n;
  const states = [];

  for (let index = 1; index <= 32; index++) {
    const before = r;
    const digit = before / s;
    r = before % s;
    coefficient = coefficient * 10n + digit;
    const low = closed ? r <= mMinus : r < mMinus;
    const high = closed ? r + mPlus >= s : r + mPlus > s;
    let roundedUp = false;
    let decision = "continue";
    if (low || high) {
      if (low && high) {
        const nearest = compareInteger(2n * r, s);
        roundedUp = nearest > 0 || (nearest === 0 && (coefficient & 1n) === 1n);
        decision = nearest === 0 ? "both recover; decimal tie to even" : `both recover; ${roundedUp ? "upper" : "lower"} is nearer`;
      } else {
        roundedUp = high;
        decision = `${high ? "upper" : "lower"} candidate alone recovers`;
      }
      if (roundedUp) coefficient++;
    }
    states.push({ index, before, denominator: s, digit, remainder: r, mPlus, mMinus, low, high, roundedUp, decision });
    if (low || high) break;
    r *= 10n;
    mPlus *= 10n;
    mMinus *= 10n;
  }
  if (!states.at(-1)?.low && !states.at(-1)?.high) throw new Error("Burger–Dybvig digit generation did not terminate");

  let decimalExponent = k - states.length;
  while (coefficient % 10n === 0n) {
    coefficient /= 10n;
    decimalExponent++;
  }
  if (negative) coefficient = -coefficient;
  const cancelled = cancelCommonTwos(estimatedState);
  return {
    coefficient,
    decimalExponent,
    text: formatDecimal(coefficient, decimalExponent),
    digitCount: states.length,
    k,
    estimate,
    estimateTooLow,
    estimatorDistance: k - estimate,
    floorLog2,
    closed,
    unequal: initial.unequal,
    initial,
    estimatedState,
    correctedState,
    cancelled,
    bitsBeforeCancellation: maxBits(estimatedState),
    bitsAfterCancellation: maxBits(cancelled),
    denominatorIsPowerOfTwo: s > 0n && (s & (s - 1n)) === 0n,
    states,
  };
}

export function gayEstimator(value) {
  const magnitude = Math.abs(value);
  const decoded = decodeDouble(magnitude);
  const floorLog2 = decoded.exponent + bitLength(decoded.significand) - 1;
  const normalized = magnitude / 2 ** floorLog2;
  const estimateReal = (normalized - 1.5) * 0.289529654602168 +
    0.1760912590558 + floorLog2 * 0.301029995663981;
  let estimate = Math.trunc(estimateReal);
  if (estimateReal < 0 && estimateReal !== estimate) estimate--;
  if (Object.is(estimate, -0)) estimate = 0;
  let checkedWithNativePower = false;
  if (estimate >= 0 && estimate <= 22) {
    if (magnitude < 10 ** estimate) estimate--;
    checkedWithNativePower = true;
  }
  return { estimate, estimateReal, floorLog2, normalized, checkedWithNativePower };
}

export function descendantWork(value, implementation = "burger") {
  const magnitude = Math.abs(value);
  const dragon = dragonShortest(magnitude);
  const burger = burgerDybvigShortest(magnitude);
  const decoded = decodeDouble(magnitude);
  const strippedExponent = decoded.exponent + trailingZeroBits(decoded.significand);
  const gay = gayEstimator(magnitude);
  const gaySmallInteger = strippedExponent >= 0 && gay.estimate <= 14;
  const scaleWalk = Math.abs(dragon.scientificExponent);
  const route = implementation === "gay" && gaySmallInteger ? "exact native-double integer" : "exact bignum interval";
  return {
    implementation,
    value: magnitude,
    output: burger.text,
    dragonOutput: dragon.text,
    sameOutput: burger.text === dragon.text,
    dragonDigits: dragon.digitCount,
    digitCount: burger.digitCount,
    scaleWalk,
    // Present both estimators as the exponent of the leading decimal digit.
    // Burger–Dybvig's paper stores one more because it writes 0.d… × 10^k.
    estimate: implementation === "gay" ? gay.estimate : burger.estimate - 1,
    correctedK: implementation === "gay" ? dragon.scientificExponent : burger.k - 1,
    correctionNeeded: implementation === "gay"
      ? gay.estimate !== dragon.scientificExponent
      : burger.estimateTooLow,
    commonTwos: burger.cancelled.commonTwos,
    bitsBeforeCancellation: burger.bitsBeforeCancellation,
    bitsAfterCancellation: burger.bitsAfterCancellation,
    denominatorIsPowerOfTwo: burger.denominatorIsPowerOfTwo,
    gaySmallInteger,
    route,
    unequal: burger.unequal,
    burger,
    gay,
  };
}
