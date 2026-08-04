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
        prefix_history: result.states.slice(0, state.index).map((item) => item.digit).join(" → "),
        lower_candidate: state.lowerText,
        upper_candidate: state.upperText,
        lower_test: `${state.remainder} ${state.low ? "is" : "is not"} within lower margin ${state.lowerMargin}`,
        upper_test: `${state.denominator - state.remainder} ${state.high ? "is" : "is not"} within upper margin ${state.upperMargin}`,
        decision: state.decision,
      },
      visual: { scene: digitScene(state, interval.closed, result.states) },
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

export function dragonMarginScene() {
  return {
    domain: [-.78, .78],
    background: "#192632",
    bands: [{ from: -.5, to: .5, top: .14, bottom: .84, color: "rgba(223,255,82,.14)", label: "EVERY DECIMAL IN THIS INTERVAL RECOVERS THE SELECTED DOUBLE" }],
    markers: [
      { x: -.5, from: .13, to: .86, color: "#dfff52", dash: [3, 5], label: "lower boundary", labelY: .92 },
      { x: .5, from: .13, to: .86, color: "#dfff52", dash: [3, 5], label: "upper boundary", labelY: .92 },
    ],
    lanes: [{ y: .5, color: "#8eb3ff", label: "THE SELECTED DOUBLE AND ITS PARSING INTERVAL", ticks: [
      { x: 0, color: "#1565ff", width: 3, height: 58, dot: 5, topLabel: "selected value" },
    ] }],
    brackets: [
      { from: -.5, to: 0, y: .71, color: "#ff9b8e", label: "lower margin" },
      { from: 0, to: .5, y: .71, color: "#ff9b8e", label: "upper margin" },
    ],
    footer: "THE MARGINS MEASURE PERMITTED ERROR; THEY ARE NOT YET AN INTEGER REPRESENTATION",
  };
}

export function dragonStructuralTrace() {
  const scene = (previous, following, lower, upper, closed, footer) => ({
    domain: [-1.25, 1.25],
    background: "#192632",
    bands: [{ from: lower, to: upper, top: .15, bottom: .83, color: "rgba(223,255,82,.14)", label: "PARSING INTERVAL" }],
    markers: [
      { x: lower, from: .14, to: .85, color: "#dfff52", dash: [3, 5], endpoint: closed ? "included" : "excluded", endpointLabel: closed ? "included" : "excluded", endpointLabelDx: -8, endpointAlign: "right" },
      { x: upper, from: .14, to: .85, color: "#dfff52", dash: [3, 5], endpoint: closed ? "included" : "excluded", endpointLabel: closed ? "included" : "excluded", endpointLabelDx: 8, endpointAlign: "left" },
    ],
    lanes: [{ y: .58, color: "#8eb3ff", label: "ADJACENT BINARY64 VALUES", ticks: [
      { x: previous, height: 28, topLabel: "previous" },
      { x: 0, color: "#1565ff", width: 3, height: 56, dot: 5, topLabel: "selected" },
      { x: following, height: 28, topLabel: "next" },
    ] }],
    brackets: [
      { from: lower, to: 0, y: .76, color: "#ff9b8e", label: "lower margin" },
      { from: 0, to: upper, y: .76, color: "#ff9b8e", label: "upper margin" },
    ],
    footer,
  });
  return [
    {
      label: "Ordinary spacing",
      title: "Most values have equal room on both sides",
      why: "Within a binade, adjacent binary64 values are equally spaced. Both parsing boundaries are therefore half a binary step from the selected value, and Dragon begins with equal lower and upper margins.",
      registers: { predecessor_gap: "1 binary step", successor_gap: "1 binary step", margins: "equal" },
      visual: { scene: scene(-1, 1, -.5, .5, false, "ORDINARY CASE · EQUAL GAPS PRODUCE EQUAL MARGINS") },
    },
    {
      label: "Exponent transition",
      title: "At a power of two, the lower side is closer",
      why: "Immediately below a positive power of two, binary64 spacing is half the spacing immediately above it. The lower parsing boundary is therefore half as far from the selected value as the upper boundary. Separate margins preserve this asymmetry without changing the digit loop.",
      registers: { previous_gap: "1/2 step", next_gap: "1 step", margins: "lower = 1/2 upper" },
      visual: { scene: scene(-.5, 1, -.25, .5, true, "EXPONENT TRANSITION · THE LOWER MARGIN IS HALF AS LARGE") },
    },
    {
      label: "Endpoint ownership",
      title: "The last significand bit decides exact midpoint ties",
      why: "If the selected significand ends in 0, it is the even choice at either midpoint and both endpoints are included. If it ends in 1, both endpoints belong to the adjacent even values and are excluded. Interior candidates are unaffected.",
      registers: { displayed_case: "last significand bit = 0", lower_endpoint: "included", upper_endpoint: "included" },
      visual: { scene: scene(-1, 1, -.5, .5, true, "TIES TO EVEN · FILLED ENDPOINTS BELONG TO THIS SELECTED VALUE") },
    },
  ];
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

function digitScene(state, closed, states) {
  const center = ratio(state.remainder, state.denominator);
  const lower = center - ratio(state.lowerMargin, state.denominator);
  const upper = center + ratio(state.upperMargin, state.denominator);
  const left = Math.min(-.12, lower - .05);
  const right = Math.max(1.12, upper + .05);
  return {
    domain: [.25, states.length + 3.5],
    background: "#192632",
    lanes: [
      { y: .3, color: "#8eb3ff", label: "DIGITS KEPT SO FAR · EACH STEP RETAINS THE EARLIER DIGITS", ticks: [
        ...states.slice(0, state.index).map((item) => ({
          x: item.index,
          color: item.index === state.index ? "#dfff52" : "#8eb3ff",
          width: item.index === state.index ? 3 : 1,
          height: item.index === state.index ? 38 : 22,
          dot: item.index === state.index ? 4 : undefined,
          label: String(item.digit),
        })),
        { x: states.length + 2, color: "#1565ff", width: 3, height: 46, dot: 4, topLabel: "selected double" },
      ] },
      { y: .7, domain: [left, right], margin: 55, color: "#ff9b8e", label: `MAGNIFIED DECIMAL CELL AFTER ${state.index} DIGIT${state.index === 1 ? "" : "S"}`, bands: [
        { from: lower, to: upper, above: 54, below: 54, color: "rgba(223,255,82,.15)", border: "#dfff52", label: "ADMISSIBLE INTERVAL" },
      ], ticks: [
        { x: 0, color: state.low ? "#ef4b35" : "#ff9b8e", width: state.low ? 3 : 1, height: state.low ? 48 : 30, dot: state.low ? 4 : undefined, topLabel: state.lowerText },
        { x: center, color: "#8eb3ff", width: 2, height: 62, dot: 4, topLabel: "selected value" },
        { x: 1, color: state.high ? "#ef4b35" : "#ff9b8e", width: state.high ? 3 : 1, height: state.high ? 48 : 30, dot: state.high ? 4 : undefined, topLabel: state.upperText },
      ] },
    ],
    footer: state.low || state.high ? state.decision.toUpperCase() : `PREFIX ${state.prefix} IS STILL TOO COARSE · GENERATE ANOTHER DIGIT`,
  };
}
