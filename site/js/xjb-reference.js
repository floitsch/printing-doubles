import { decodeDouble, formatDecimal } from "./float.js";
import { intervalOf, rationalOfDouble, shortestDecimal } from "./oracle.js";

const POW10 = [1n];
function pow10(power) {
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}

function scaleByPower10(rational, power) {
  return power >= 0
    ? { numerator: rational.numerator * pow10(power), denominator: rational.denominator }
    : { numerator: rational.numerator, denominator: rational.denominator * pow10(-power) };
}

function compare(leftNumerator, leftDenominator, rightNumerator, rightDenominator) {
  const difference = leftNumerator * rightDenominator - rightNumerator * leftDenominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function pointInInterval(tenths, prefix, lower, upper, closed) {
  const numerator = prefix * 10n + BigInt(tenths);
  const lowerOrder = compare(numerator, 10n, lower.numerator, lower.denominator);
  const upperOrder = compare(numerator, 10n, upper.numerator, upper.denominator);
  return (lowerOrder > 0 || (closed && lowerOrder === 0)) &&
    (upperOrder < 0 || (closed && upperOrder === 0));
}

function relativeNumber(rational, prefix) {
  const numerator = rational.numerator - prefix * rational.denominator;
  const precision = 10n ** 15n;
  return Number((numerator * precision) / rational.denominator) / 1e15;
}

function decimalApprox(numerator, denominator, places = 18) {
  const scale = 10n ** BigInt(places);
  const scaled = (numerator * scale) / denominator;
  const digits = (scaled < 0n ? -scaled : scaled).toString().padStart(places + 1, "0");
  const point = digits.length - places;
  return `${scaled < 0n ? "−" : ""}${digits.slice(0, point)}.${digits.slice(point).replace(/0+$/, "") || "0"}`;
}

// This is an exact semantic reconstruction of the decimal-space geometry in
// xjb's current binary64 path. It deliberately does not reproduce the cached
// 128-bit multiplier or its bounded fixed-width approximation.
export function xjbMicroscope(value) {
  if (!Number.isFinite(value) || value === 0) throw new RangeError("expected a finite, nonzero binary64 value");
  const magnitude = Math.abs(value);
  const decoded = decodeDouble(magnitude);
  if (decoded.exponent === -1074 && decoded.significand < (1n << 52n)) {
    throw new RangeError("the microscope currently follows xjb's normal binary64 path");
  }

  const q = decoded.exponent;
  // The pinned v2 source implements floor(q * log10(2)) with 78913 / 2^18.
  const k = Math.floor((q * 78913) / 262144);
  const scalePower = -k - 1;
  const scaled = scaleByPower10(rationalOfDouble(decoded), scalePower);
  const prefix = scaled.numerator / scaled.denominator;
  const remainder = scaled.numerator % scaled.denominator;
  const tenRemainder = remainder * 10n;
  const floorDigit = tenRemainder / scaled.denominator;
  const deltaNumerator = tenRemainder % scaled.denominator;
  const twiceDelta = deltaNumerator * 2n;
  let roundedDigit = floorDigit;
  if (twiceDelta > scaled.denominator ||
      (twiceDelta === scaled.denominator && (floorDigit & 1n) === 1n)) roundedDigit++;

  const sourceInterval = intervalOf(magnitude);
  const lower = scaleByPower10(sourceInterval.lower, scalePower);
  const upper = scaleByPower10(sourceInterval.upper, scalePower);
  const lowerExit = pointInInterval(0, prefix, lower, upper, sourceInterval.closed);
  const upperExit = pointInInterval(10, prefix, lower, upper, sourceInterval.closed);
  let chosenDigit = roundedDigit;
  let decision = "nearest-tenth";
  if (lowerExit) { chosenDigit = 0n; decision = "shorten-down"; }
  if (upperExit) { chosenDigit = 10n; decision = "shorten-up"; }

  const coefficient = prefix * 10n + chosenDigit;
  const shortest = shortestDecimal(magnitude);
  const irregular = decoded.fraction === 0n && decoded.exponentBits !== 0;
  const candidates = Array.from({ length: 11 }, (_, digit) => {
    const candidateCoefficient = prefix * 10n + BigInt(digit);
    return {
      digit,
      coefficient: candidateCoefficient,
      text: formatDecimal(candidateCoefficient, k),
      admissible: pointInInterval(digit, prefix, lower, upper, sourceInterval.closed),
      selected: BigInt(digit) === chosenDigit,
      endpoint: digit === 0 ? "prefix ending in zero" : digit === 10 ? "carry followed by zero" : null,
    };
  });

  return {
    value: magnitude,
    decoded,
    q,
    k,
    scalePower,
    irregular,
    closed: sourceInterval.closed,
    scaled,
    prefix,
    remainder,
    fractionalText: decimalApprox(remainder, scaled.denominator),
    tenFractionalText: decimalApprox(tenRemainder, scaled.denominator),
    floorDigit,
    deltaText: decimalApprox(deltaNumerator, scaled.denominator),
    roundedDigit,
    lowerExit,
    upperExit,
    chosenDigit,
    decision,
    coefficient,
    exponent: k,
    text: formatDecimal(coefficient, k),
    shortest,
    candidates,
    positions: {
      lower: relativeNumber(lower, prefix),
      value: relativeNumber(scaled, prefix),
      upper: relativeNumber(upper, prefix),
    },
  };
}
