import { formatDecimal } from "./float.js";
import { exactDecimalOfRational, intervalOf } from "./oracle.js";

const POW10 = [1n];

function pow10(power) {
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}

function gcd(left, right) {
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function lcm(left, right) {
  return left / gcd(left, right) * right;
}

function compare(left, right) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function decimalRational(coefficient, exponent) {
  return exponent >= 0
    ? { numerator: coefficient * pow10(exponent), denominator: 1n }
    : { numerator: coefficient, denominator: pow10(-exponent) };
}

function scaleByPower10(rational, exponent) {
  return exponent >= 0
    ? { numerator: rational.numerator * pow10(exponent), denominator: rational.denominator }
    : { numerator: rational.numerator, denominator: rational.denominator * pow10(-exponent) };
}

function decimalDecade(value, center) {
  let exponent = Math.floor(Math.log10(value));
  while (compare(center, decimalRational(1n, exponent)) < 0) exponent--;
  while (compare(center, decimalRational(1n, exponent + 1)) >= 0) exponent++;
  return exponent;
}

function commonIntegerScale(rationals) {
  const denominator = rationals.reduce((result, rational) => lcm(result, rational.denominator), 1n);
  return {
    denominator,
    integers: rationals.map((rational) => rational.numerator * (denominator / rational.denominator)),
  };
}

export function dragonShortest(value) {
  if (!Number.isFinite(value) || value === 0) throw new RangeError("The Dragon finite path expects a finite, nonzero binary64 value");
  if (value < 0) {
    const positive = dragonShortest(-value);
    const coefficient = -positive.coefficient;
    return { ...positive, negative: true, coefficient, text: formatDecimal(coefficient, positive.decimalExponent) };
  }

  const interval = intervalOf(value);
  const scientificExponent = decimalDecade(value, interval.center);
  const scaledCenter = scaleByPower10(interval.center, -scientificExponent);
  const scaledLower = scaleByPower10(interval.lower, -scientificExponent);
  const scaledUpper = scaleByPower10(interval.upper, -scientificExponent);
  const common = commonIntegerScale([scaledCenter, scaledLower, scaledUpper]);
  let [remainder, lowerBoundary, upperBoundary] = common.integers;
  const denominator = common.denominator;
  let lowerMargin = remainder - lowerBoundary;
  let upperMargin = upperBoundary - remainder;
  let coefficient = 0n;
  let digitCount = 0;
  const states = [];

  for (; digitCount < 32; digitCount++) {
    const before = remainder;
    const digit = before / denominator;
    const after = before % denominator;
    coefficient = coefficient * 10n + digit;
    const digitsSoFar = digitCount + 1;
    const decimalExponent = scientificExponent - digitsSoFar + 1;
    const lowerCandidate = coefficient;
    const upperCandidate = coefficient + 1n;
    const low = interval.closed ? after <= lowerMargin : after < lowerMargin;
    const highDistance = denominator - after;
    const high = interval.closed ? highDistance <= upperMargin : highDistance < upperMargin;
    let decision = "continue";
    let roundedUp = false;

    if (low || high) {
      if (low && high) {
        const nearest = 2n * after - denominator;
        roundedUp = nearest > 0n || (nearest === 0n && (coefficient & 1n) === 1n);
        decision = nearest === 0n
          ? `both candidates recover; exact tie, ${roundedUp ? "upper" : "lower"} has an even last digit`
          : roundedUp ? "both candidates recover; upper is nearer" : "both candidates recover; lower is nearer";
      } else if (high) {
        roundedUp = true;
        decision = "only the upper candidate recovers";
      } else {
        decision = "only the lower candidate recovers";
      }
      if (roundedUp) coefficient++;
    }

    states.push({
      index: digitsSoFar,
      before,
      denominator,
      digit,
      remainder: after,
      lowerMargin,
      upperMargin,
      low,
      high,
      lowerCandidate,
      upperCandidate,
      decimalExponent,
      lowerText: formatDecimal(lowerCandidate, decimalExponent),
      upperText: formatDecimal(upperCandidate, decimalExponent),
      prefix: lowerCandidate.toString(),
      decision,
      roundedUp,
    });

    if (low || high) {
      digitCount = digitsSoFar;
      break;
    }
    remainder = after * 10n;
    lowerMargin *= 10n;
    upperMargin *= 10n;
  }

  if (digitCount === 32) throw new Error("Dragon digit generation did not terminate");
  let decimalExponent = scientificExponent - digitCount + 1;
  while (coefficient % 10n === 0n) {
    coefficient /= 10n;
    decimalExponent++;
  }
  return {
    coefficient,
    decimalExponent,
    scientificExponent,
    digitCount,
    text: formatDecimal(coefficient, decimalExponent),
    interval,
    scaled: { numerator: common.integers[0], denominator },
    initialLowerMargin: common.integers[0] - common.integers[1],
    initialUpperMargin: common.integers[2] - common.integers[0],
    states,
  };
}

export function dragonTrace(value) {
  const result = dragonShortest(value);
  const interval = result.interval;
  const normalized = ratio(result.scaled.numerator, result.scaled.denominator);
  const steps = [
    {
      line: 1,
      label: "Exact neighborhood",
      title: "Construct the value and both parsing boundaries",
      why: "Dragon does not expand the value into decimal first. It constructs exact integer ratios for the selected value and for the two midpoint boundaries that delimit every admissible output.",
      registers: {
        input: value.toPrecision(17),
        lower_midpoint: exactDecimalOfRational(interval.lower),
        selected_value: exactDecimalOfRational(interval.center),
        upper_midpoint: exactDecimalOfRational(interval.upper),
        endpoints: interval.closed ? "included" : "excluded",
      },
      visual: { scene: intervalScene(interval.closed) },
    },
    {
      line: 2,
      label: "Decimal normalization",
      title: `Move the leading digit to decade 10^${result.scientificExponent}`,
      why: `Multiplication by 10^${-result.scientificExponent} places the exact value between 1 and 10. All three ratios receive the same scale, so their relative positions and endpoint ownership are unchanged.`,
      registers: {
        scientific_exponent: result.scientificExponent,
        scaled_value: `${result.scaled.numerator} / ${result.scaled.denominator}`,
        approximate_scaled_value: normalized,
        lower_margin: `${result.initialLowerMargin} / ${result.scaled.denominator}`,
        upper_margin: `${result.initialUpperMargin} / ${result.scaled.denominator}`,
      },
      visual: { scene: normalizedScene(result) },
    },
  ];

  for (const state of result.states) {
    const ending = state.low || state.high;
    steps.push({
      line: ending ? 5 : 6,
      label: `Digit ${state.index}`,
      title: ending ? `Digit ${state.digit}: the margins decide` : `Emit ${state.digit}; more information is required`,
      why: digitExplanation(state),
      registers: {
        division: `${state.before} = ${state.digit} × ${state.denominator} + ${state.remainder}`,
        emitted_prefix: state.prefix,
        lower_candidate: state.lowerText,
        upper_candidate: state.upperText,
        lower_test: `${state.remainder} ${state.low ? "is" : "is not"} within lower margin ${state.lowerMargin}`,
        upper_test: `${state.denominator - state.remainder} ${state.high ? "is" : "is not"} within upper margin ${state.upperMargin}`,
        decision: state.decision,
      },
      visual: { scene: digitScene(state, interval.closed) },
    });
  }
  return steps;
}

function digitExplanation(state) {
  const division = `Integer division produces digit ${state.digit} and exact remainder ${state.remainder}. `;
  if (!state.low && !state.high) return `${division}Neither the truncated candidate ${state.lowerText} nor the adjacent upper candidate ${state.upperText} is inside the parsing interval. Multiplying the remainder and both margins by ten exposes the next decimal digit without changing the invariant.`;
  if (state.low && state.high) return `${division}Both ${state.lowerText} and ${state.upperText} recover the input. Dragon therefore chooses the nearer one${2n * state.remainder === state.denominator ? ", using an even last digit for the exact decimal tie" : ""}.`;
  return `${division}${state.low ? state.lowerText : state.upperText} is the first candidate proved to lie inside the parsing interval; the other candidate does not. Digit generation stops here.`;
}

function ratio(numerator, denominator, scale = 1_000_000n) {
  return Number(numerator * scale / denominator) / Number(scale);
}

function intervalScene(closed) {
  return {
    domain: [-1.2, 1.2],
    background: "#192632",
    bands: [{ from: -.5, to: .5, top: .17, bottom: .82, color: "rgba(223,255,82,.14)", label: "PARSING INTERVAL" }],
    markers: [
      { x: -.5, from: .15, to: .84, color: "#dfff52", dash: [3, 5], endpoint: closed ? "included" : "excluded" },
      { x: .5, from: .15, to: .84, color: "#dfff52", dash: [3, 5], endpoint: closed ? "included" : "excluded" },
    ],
    lanes: [{ y: .55, color: "#8eb3ff", label: "ADJACENT BINARY64 VALUES", ticks: [
      { x: -1, height: 28, topLabel: "previous" },
      { x: 0, color: "#1565ff", width: 3, height: 54, dot: 4, topLabel: "selected" },
      { x: 1, height: 28, topLabel: "next" },
    ] }],
    footer: "THE TWO MARGINS ARE KEPT SEPARATELY",
  };
}

function normalizedScene(result) {
  const center = ratio(result.scaled.numerator, result.scaled.denominator);
  const lower = ratio(result.scaled.numerator - result.initialLowerMargin, result.scaled.denominator);
  const upper = ratio(result.scaled.numerator + result.initialUpperMargin, result.scaled.denominator);
  return {
    domain: [Math.floor(center) - .2, Math.floor(center) + 1.2],
    background: "#192632",
    bands: [{ from: lower, to: upper, top: .18, bottom: .82, color: "rgba(223,255,82,.16)", label: "SCALED PARSING INTERVAL" }],
    lanes: [{ y: .56, color: "#ff9b8e", label: "NORMALIZED DECIMAL POSITION", ticks: [
      { x: Math.floor(center), height: 30, topLabel: String(Math.floor(center)) },
      { x: center, color: "#dfff52", width: 3, height: 58, dot: 4, topLabel: center.toPrecision(8) },
      { x: Math.floor(center) + 1, height: 30, topLabel: String(Math.floor(center) + 1) },
    ] }],
    footer: "R / S IS THE SCALED VALUE · M− / S AND M+ / S ARE ITS MARGINS",
  };
}

function digitScene(state, closed) {
  const center = ratio(state.remainder, state.denominator);
  const lower = center - ratio(state.lowerMargin, state.denominator);
  const upper = center + ratio(state.upperMargin, state.denominator);
  const left = Math.min(-.12, lower - .05);
  const right = Math.max(1.12, upper + .05);
  return {
    domain: [left, right],
    background: "#192632",
    bands: [{ from: lower, to: upper, top: .16, bottom: .82, color: "rgba(223,255,82,.15)", label: "ADMISSIBLE INTERVAL IN THIS DIGIT CELL" }],
    markers: [
      { x: lower, from: .15, to: .84, color: "#dfff52", dash: [3, 5], endpoint: closed ? "included" : "excluded" },
      { x: upper, from: .15, to: .84, color: "#dfff52", dash: [3, 5], endpoint: closed ? "included" : "excluded" },
    ],
    lanes: [{ y: .58, color: "#ff9b8e", label: `PREFIX ${state.prefix} · CURRENT DECIMAL CELL`, ticks: [
      { x: 0, color: state.low ? "#ef4b35" : "#ff9b8e", width: state.low ? 3 : 1, height: state.low ? 55 : 32, dot: state.low ? 4 : undefined, topLabel: state.lowerText },
      { x: center, color: "#8eb3ff", width: 2, height: 72, dot: 4, topLabel: "exact remainder" },
      { x: 1, color: state.high ? "#ef4b35" : "#ff9b8e", width: state.high ? 3 : 1, height: state.high ? 55 : 32, dot: state.high ? 4 : undefined, topLabel: state.upperText },
    ] }],
    footer: state.low || state.high ? state.decision.toUpperCase() : "NEITHER CANDIDATE RECOVERS · GENERATE ANOTHER DIGIT",
  };
}
