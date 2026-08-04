import { formatDecimal } from "./float.js";
import { intervalOf } from "./oracle.js";

const POW10 = [1n];

export function pow10(power) {
  if (!Number.isInteger(power) || power < 0) throw new RangeError("power must be a nonnegative integer");
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}

export function floorDiv(numerator, denominator) {
  let quotient = numerator / denominator;
  if (numerator < 0n && numerator % denominator !== 0n) quotient--;
  return quotient;
}

export function ceilDiv(numerator, denominator) {
  return -floorDiv(-numerator, denominator);
}

export function compareRational(left, right) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function subtractRational(left, right) {
  return {
    numerator: left.numerator * right.denominator - right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

export function distanceRational(left, right) {
  const difference = subtractRational(left, right);
  return { numerator: difference.numerator < 0n ? -difference.numerator : difference.numerator, denominator: difference.denominator };
}

export function decimalRational(coefficient, exponent) {
  return exponent >= 0
    ? { numerator: coefficient * pow10(exponent), denominator: 1n }
    : { numerator: coefficient, denominator: pow10(-exponent) };
}

export function scaleByInversePower10(rational, exponent) {
  return exponent >= 0
    ? { numerator: rational.numerator, denominator: rational.denominator * pow10(exponent) }
    : { numerator: rational.numerator * pow10(-exponent), denominator: rational.denominator };
}

function isInteger(rational) {
  return rational.numerator % rational.denominator === 0n;
}

function roundNearestEven(rational) {
  const below = floorDiv(rational.numerator, rational.denominator);
  const remainder = rational.numerator - below * rational.denominator;
  const twice = 2n * remainder;
  if (twice < rational.denominator) return below;
  if (twice > rational.denominator) return below + 1n;
  return (below & 1n) === 0n ? below : below + 1n;
}

export function decimalDecade(value, center = intervalOf(value).center) {
  let exponent = Math.floor(Math.log10(value));
  while (compareRational(center, decimalRational(1n, exponent)) < 0) exponent--;
  while (compareRational(center, decimalRational(1n, exponent + 1)) >= 0) exponent++;
  return exponent;
}

export function floorLog10Rational(rational) {
  let exponent = Math.floor(Math.log10(Number(rational.numerator) / Number(rational.denominator)));
  if (!Number.isFinite(exponent)) exponent = rational.numerator.toString().length - rational.denominator.toString().length;
  while (compareRational(rational, decimalRational(1n, exponent)) < 0) exponent--;
  while (compareRational(rational, decimalRational(1n, exponent + 1)) >= 0) exponent++;
  return exponent;
}

export function isInsideInterval(interval, rational) {
  const lowerOrder = compareRational(rational, interval.lower);
  const upperOrder = compareRational(rational, interval.upper);
  return interval.closed ? lowerOrder >= 0 && upperOrder <= 0 : lowerOrder > 0 && upperOrder < 0;
}

export function projectInterval(interval, exponent) {
  const lower = scaleByInversePower10(interval.lower, exponent);
  const center = scaleByInversePower10(interval.center, exponent);
  const upper = scaleByInversePower10(interval.upper, exponent);
  let first = ceilDiv(lower.numerator, lower.denominator);
  let last = floorDiv(upper.numerator, upper.denominator);
  if (!interval.closed && isInteger(lower)) first++;
  if (!interval.closed && isInteger(upper)) last--;
  const valid = first <= last;
  const nearest = roundNearestEven(center);
  const candidate = !valid ? null : nearest < first ? first : nearest > last ? last : nearest;
  return {
    exponent,
    first,
    last,
    valid,
    nearest,
    candidate,
    text: candidate === null ? null : formatDecimal(candidate, exponent),
    lowerExact: isInteger(lower),
    upperExact: isInteger(upper),
  };
}

export function normalizeDecimal(coefficient, exponent) {
  while (coefficient !== 0n && coefficient % 10n === 0n) {
    coefficient /= 10n;
    exponent++;
  }
  return { coefficient, exponent, text: formatDecimal(coefficient, exponent) };
}
