import { decodeDouble, formatDecimal, isEvenSignificand, nextDown, nextUp } from "./float.js";

const POW10 = [1n];
function pow10(power) {
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}

export function rationalOfDouble(valueOrDecoded) {
  const decoded = typeof valueOrDecoded === "number" ? decodeDouble(valueOrDecoded) : valueOrDecoded;
  let numerator = decoded.significand;
  let denominator = 1n;
  if (decoded.exponent >= 0) numerator <<= BigInt(decoded.exponent);
  else denominator <<= BigInt(-decoded.exponent);
  return { numerator, denominator };
}

export function add(left, right) {
  return {
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

export function midpoint(left, right) {
  const sum = add(left, right);
  return { numerator: sum.numerator, denominator: sum.denominator * 2n };
}

export function intervalOf(value) {
  const center = decodeDouble(value);
  if (center.special || center.significand === 0n) throw new RangeError("The oracle currently expects a finite, nonzero double");
  const lowerValue = nextDown(value);
  const upperValue = nextUp(value);
  const lowerDecoded = Number.isFinite(lowerValue) ? decodeDouble(lowerValue) : { significand: center.significand - 1n, exponent: center.exponent };
  const upperDecoded = Number.isFinite(upperValue) ? decodeDouble(upperValue) : { significand: center.significand + 1n, exponent: center.exponent };
  return {
    center: rationalOfDouble(center),
    lower: midpoint(rationalOfDouble(lowerDecoded), rationalOfDouble(center)),
    upper: midpoint(rationalOfDouble(center), rationalOfDouble(upperDecoded)),
    closed: isEvenSignificand(center),
    decoded: center,
  };
}

export function exactDecimal(value) {
  const decoded = decodeDouble(value);
  if (decoded.special === "zero") return decoded.negative ? "-0" : "0";
  if (decoded.special) return String(value);
  const negative = decoded.significand < 0n;
  const significand = negative ? -decoded.significand : decoded.significand;
  if (decoded.exponent >= 0) return `${negative ? "-" : ""}${significand << BigInt(decoded.exponent)}`;
  const places = -decoded.exponent;
  let digits = (significand * 5n ** BigInt(places)).toString().padStart(places + 1, "0");
  const point = digits.length - places;
  digits = `${digits.slice(0, point)}.${digits.slice(point)}`.replace(/0+$/, "").replace(/\.$/, "");
  return `${negative ? "-" : ""}${digits}`;
}

function floorDiv(numerator, denominator) {
  let quotient = numerator / denominator;
  if (numerator < 0n && numerator % denominator !== 0n) quotient--;
  return quotient;
}

function ceilDiv(numerator, denominator) {
  return -floorDiv(-numerator, denominator);
}

function scaleByInversePower10(rational, exponent) {
  return exponent >= 0
    ? { numerator: rational.numerator, denominator: rational.denominator * pow10(exponent) }
    : { numerator: rational.numerator * pow10(-exponent), denominator: rational.denominator };
}

function exactInteger(rational) {
  return rational.numerator % rational.denominator === 0n;
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

function absoluteDifference(left, right) {
  const numerator = left.numerator * right.denominator - right.numerator * left.denominator;
  return { numerator: numerator < 0n ? -numerator : numerator, denominator: left.denominator * right.denominator };
}

function decimalDecade(value, center) {
  let exponent = Math.floor(Math.log10(Math.abs(value)));
  while (compare(center, decimalRational(1n, exponent)) < 0) exponent--;
  while (compare(center, decimalRational(1n, exponent + 1)) >= 0) exponent++;
  return exponent;
}

export function shortestDecimal(value) {
  if (value < 0) {
    const positive = shortestDecimal(-value);
    const coefficient = -positive.coefficient;
    return { ...positive, coefficient, text: formatDecimal(coefficient, positive.exponent), interval: intervalOf(value) };
  }
  const interval = intervalOf(value);
  const decade = decimalDecade(value, interval.center);
  for (let digits = 1; digits <= 17; digits++) {
    const exponent = decade - digits + 1;
    const scaledLower = scaleByInversePower10(interval.lower, exponent);
    const scaledUpper = scaleByInversePower10(interval.upper, exponent);
    let first = ceilDiv(scaledLower.numerator, scaledLower.denominator);
    let last = floorDiv(scaledUpper.numerator, scaledUpper.denominator);
    if (!interval.closed && exactInteger(scaledLower)) first++;
    if (!interval.closed && exactInteger(scaledUpper)) last--;
    if (first > last) continue;

    let best = first;
    for (let candidate = first + 1n; candidate <= last; candidate++) {
      const currentDistance = absoluteDifference(decimalRational(candidate, exponent), interval.center);
      const bestDistance = absoluteDifference(decimalRational(best, exponent), interval.center);
      const order = compare(currentDistance, bestDistance);
      if (order < 0 || (order === 0 && (candidate & 1n) === 0n)) best = candidate;
    }
    let removed = 0;
    while (best !== 0n && best % 10n === 0n) { best /= 10n; removed++; }
    const normalizedExponent = exponent + removed;
    return { coefficient: best, exponent: normalizedExponent, digits, text: formatDecimal(best, normalizedExponent), interval };
  }
  throw new Error("No shortest decimal found within 17 digits");
}

export function traceShortest(value) {
  const decoded = decodeDouble(value);
  const interval = intervalOf(value);
  const result = shortestDecimal(value);
  const exact = exactDecimal(value);
  return [
    { line: 1, label: "Decode", title: "Recover the exact binary rational", why: "The stored bits determine an integer significand and a power of two. No floating-point arithmetic is needed to recover this value.", registers: { bits: decoded.bits.toString(16).padStart(16, "0"), f: decoded.significand.toString(), e: decoded.exponent }, visual: { interval: [-.5,.5], caption: `${value} = ${decoded.significand} × 2^${decoded.exponent}` } },
    { line: 2, label: "Exact expansion", title: "Expand by multiplying with a power of five", why: `Because 2⁻ⁿ = 5ⁿ / 10ⁿ, the full decimal follows by integer multiplication. It is exact but contains ${exact.replace(/[-.]/g, "").length} digits.`, registers: { exact }, visual: { interval: [-.5,.5], candidates: [{ x: .2, label: "full expansion", active: true }], caption: "Exactness alone does not determine a useful printed form" } },
    { line: 3, label: "Neighbors", title: "Construct the rounding interval", why: "The midpoints to the adjacent doubles bound every real number that a round-to-nearest, ties-to-even parser maps back to the selected bits.", registers: { lower: "(previous + v) / 2", upper: "(v + next) / 2", endpoints: interval.closed ? "included" : "excluded" }, visual: { interval: [-.5,.5], binary: [-1,0,1], caption: "Replace the point v with its parser preimage" } },
    { line: 4, label: "Search grids", title: "Try decimal grids from coarse to fine", why: "A one-digit decimal grid has no point in the interval. The search increases significant digits only when the current grid cannot round-trip.", registers: { first_grid: "1 significant digit", condition: "candidate ∈ [m−, m+]" }, visual: { interval: [-.5,.5], candidates: [{ x: -1.05, label: "0.2" }, { x: 1.15, label: "0.4" }], caption: "No point from this coarse grid lies inside" } },
    { line: 5, label: "First admissible grid", title: "The decimal 0.3 enters the interval", why: "This is the first decimal grid with an admissible point. Therefore no representation with fewer significant digits can round-trip.", registers: { coefficient: result.coefficient.toString(), exponent: result.exponent, digits: result.digits }, visual: { interval: [-.5,.5], candidates: [{ x: .2, label: result.text, active: true }], caption: "The first admissible grid proves shortestness" } },
    { line: 6, label: "Choose", title: "Select the closest shortest candidate", why: "If the first admissible grid contains multiple points, compare their exact rational distances to v and break an exact tie with an even last digit.", registers: { output: result.text, parse_back: value.toString() }, visual: { interval: [-.5,.5], candidates: [{ x: .2, label: result.text, active: true }], caption: "Shortest, round-tripping, and closest" } },
  ];
}
