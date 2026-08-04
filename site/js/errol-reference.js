import { bitsOf, formatDecimal } from "./float.js";
import { intervalOf, rationalOfDouble, shortestDecimal } from "./oracle.js";
import { compareRational, decimalDecade, scaleByInversePower10, subtractRational } from "./interval-core.js";

function bitLength(value) {
  return value === 0n ? 0 : value.toString(2).length;
}

function floorLog2Rational(numerator, denominator) {
  let exponent = bitLength(numerator) - bitLength(denominator);
  const comparePower = (power) => power >= 0
    ? numerator - (denominator << BigInt(power))
    : (numerator << BigInt(-power)) - denominator;
  if (comparePower(exponent) < 0n) exponent--;
  while (comparePower(exponent + 1) >= 0n) exponent++;
  return exponent;
}

function rationalToNumber(rational) {
  if (rational.numerator === 0n) return 0;
  const negative = rational.numerator < 0n;
  const numerator = negative ? -rational.numerator : rational.numerator;
  const denominator = rational.denominator;
  const exponent = floorLog2Rational(numerator, denominator);
  const precisionExponent = Math.max(exponent - 52, -1074);
  let scaledNumerator = numerator;
  let scaledDenominator = denominator;
  if (precisionExponent >= 0) scaledDenominator <<= BigInt(precisionExponent);
  else scaledNumerator <<= BigInt(-precisionExponent);
  let quotient = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  if (2n * remainder > scaledDenominator || (2n * remainder === scaledDenominator && (quotient & 1n) === 1n)) quotient++;
  const result = Number(quotient) * 2 ** precisionExponent;
  return negative ? -result : result;
}

export function ddFromRational(rational) {
  const hi = rationalToNumber(rational);
  const residual = subtractRational(rational, rationalOfDouble(hi));
  return normalizeDD({ hi, lo: rationalToNumber(residual) });
}

export function normalizeDD(value) {
  const sum = value.hi + value.lo;
  const error = value.lo + (value.hi - sum);
  return { hi: sum, lo: error };
}

function split(value) {
  const splitter = 134217729;
  const product = splitter * value;
  const hi = product - (product - value);
  return { hi, lo: value - hi };
}

export function multiplyDDByDouble(value, factor) {
  const left = split(value.hi);
  const right = split(factor);
  const product = value.hi * factor;
  const error = ((left.hi * right.hi - product) + left.lo * right.hi + left.hi * right.lo) + left.lo * right.lo;
  return normalizeDD({ hi: product, lo: value.lo * factor + error });
}

export function multiplyDDBy10(value) {
  const original = value.hi;
  const hi = value.hi * 10;
  let multiplicationError = hi - original * 8;
  multiplicationError -= original * 2;
  return normalizeDD({ hi, lo: value.lo * 10 - multiplicationError });
}

export function divideDDBy10(value) {
  const original = value.hi;
  const hi = value.hi / 10;
  let remainder = original - hi * 8;
  remainder -= hi * 2;
  return normalizeDD({ hi, lo: value.lo / 10 + remainder / 10 });
}

function subtractDigit(value, digit) {
  return normalizeDD({ hi: value.hi - digit, lo: value.lo });
}

function truncateDD(value) {
  let digit = Math.trunc(value.hi);
  if (value.hi === digit && value.lo < 0) digit--;
  return digit;
}

function roundEven(value) {
  const below = Math.floor(value);
  const fraction = value - below;
  if (fraction < .5) return below;
  if (fraction > .5) return below + 1;
  return below % 2 === 0 ? below : below + 1;
}

export function errolIdeal(value) {
  if (!Number.isFinite(value)) return { special: true, text: String(value), states: [] };
  if (value === 0) return { special: true, text: Object.is(value, -0) ? "−0" : "0", states: [] };
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const interval = intervalOf(magnitude);
  const decade = decimalDecade(magnitude, interval.center);
  const decimalExponent = decade + 1;
  const scaledLower = scaleByInversePower10(interval.lower, decade);
  const scaledUpper = scaleByInversePower10(interval.upper, decade);
  let low = ddFromRational(scaledLower);
  let high = ddFromRational(scaledUpper);
  const states = [];
  const digits = [];

  for (let index = 0; index < 18; index++) {
    const lowerDigit = truncateDD(low);
    const upperDigit = truncateDD(high);
    states.push({ index, low: { ...low }, high: { ...high }, lowerDigit, upperDigit, prefix: digits.join("") });
    if (lowerDigit !== upperDigit) {
      const midpoint = (high.hi + low.hi) / 2 + (high.lo + low.lo) / 2;
      digits.push(roundEven(midpoint));
      break;
    }
    digits.push(upperDigit);
    low = multiplyDDBy10(subtractDigit(low, lowerDigit));
    high = multiplyDDBy10(subtractDigit(high, upperDigit));
  }
  if (digits.length === 0 || digits.length > 18) throw new Error("Errol digit generation did not terminate");
  let coefficient = BigInt(digits.join(""));
  let exponent = decimalExponent - digits.length;
  while (coefficient % 10n === 0n) {
    coefficient /= 10n;
    exponent++;
  }
  if (negative) coefficient = -coefficient;
  return {
    coefficient,
    exponent,
    text: formatDecimal(coefficient, exponent),
    interval,
    decade,
    decimalExponent,
    scaledLower,
    scaledUpper,
    states,
    inputBits: bitsOf(magnitude),
  };
}

export function errolChecked(value) {
  const core = errolIdeal(value);
  if (core.special) return core;
  const exact = shortestDecimal(value);
  if (core.text === exact.text) return { ...core, corrected: false };
  return {
    ...core,
    coreCoefficient: core.coefficient,
    coreExponent: core.exponent,
    coreText: core.text,
    coefficient: exact.coefficient,
    exponent: exact.exponent,
    text: exact.text,
    corrected: true,
  };
}

function ddText(value) {
  const hi = value.hi.toPrecision(17);
  const sign = value.lo < 0 ? "−" : "+";
  return `${hi} ${sign} ${Math.abs(value.lo).toExponential(3)}`;
}

function digitScene(state, final) {
  const lower = state.lowerDigit;
  const upper = state.upperDigit;
  return {
    domain: [-.15, 1.15],
    background: "#192632",
    bands: [{ from: .12, to: .88, top: .16, bottom: .84, color: "rgba(142,179,255,.12)", border: "#8eb3ff", label: "DOUBLE-DOUBLE NARROW INTERVAL" }],
    lanes: [{ y: .58, color: "#ff9b8e", label: `CURRENT DECIMAL DIGIT · PREFIX ${state.prefix || "(empty)"}`, ticks: [
      { x: .31, color: "#dfff52", height: 54, dot: 4, topLabel: `lower gives ${lower}` },
      { x: .69, color: final ? "#ef4b35" : "#dfff52", width: final ? 3 : 1.5, height: final ? 72 : 54, dot: 4, topLabel: `upper gives ${upper}` },
    ] }],
    footer: final ? "THE BOUNDARY DIGITS DIFFER · APPEND THE ROUNDED MIDDLE DIGIT" : "THE BOUNDARY DIGITS AGREE · APPEND IT AND MULTIPLY BOTH REMAINDERS BY TEN",
  };
}

export function errolTrace(value) {
  const result = errolChecked(value);
  const first = result.states[0];
  const steps = [
    {
      line: 1,
      label: "Represent",
      title: "Store one real quantity as a leading double and an offset",
      why: "The leading component carries the ordinary rounded value. The second component records most of what that rounding lost. Normalization keeps the components non-overlapping so the pair supplies about twice the significand precision.",
      registers: { lower_pair: ddText(first.low), upper_pair: ddText(first.high), represented_as: "hi + lo" },
      visual: { interval: [-.5, .5], binary: [-1, 0, 1], caption: "each endpoint becomes a double-double pair" },
    },
    {
      line: 2,
      label: "Scale",
      title: "Place the leading decimal digit before the point",
      why: "Errol estimates the decimal exponent, multiplies by a cached double-double power of ten, and corrects the estimate if the scaled value is outside [1,10). The idealized teaching core constructs the same scaled endpoints directly from exact rationals.",
      registers: { decade: result.decade, returned_exponent: result.decimalExponent, lower_pair: ddText(first.low), upper_pair: ddText(first.high) },
      visual: { scene: digitScene(first, first.lowerDigit !== first.upperDigit) },
    },
  ];
  for (const state of result.states) {
    steps.push({
      line: 3,
      label: `Digit ${state.index + 1}`,
      title: state.lowerDigit === state.upperDigit ? `Both endpoints begin with ${state.upperDigit}` : `The endpoint digits separate: ${state.lowerDigit} and ${state.upperDigit}`,
      why: state.lowerDigit === state.upperDigit
        ? "Every number in the represented interval has this digit. Append it, subtract it from both endpoints, and multiply the two remainders by ten."
        : "The shared prefix is complete. No shorter prefix lies strictly between the endpoints; the final digit is obtained by rounding their middle position.",
      registers: { prefix_before: state.prefix || "(empty)", lower: ddText(state.low), upper: ddText(state.high), lower_digit: state.lowerDigit, upper_digit: state.upperDigit },
      visual: { scene: digitScene(state, state.lowerDigit !== state.upperDigit) },
    });
  }
  steps.push({
    line: 4,
    label: "Correct",
      title: result.corrected ? "The checked teaching path replaces this core result" : "The checked teaching path confirms the core result",
      why: result.corrected
        ? "The idealized double-double core disagrees with the exact interval oracle for this input. The browser model records the event and returns the exact result. Production Errol3 instead performs a bit-pattern lookup in a generated table before entering its unchecked core."
        : "The idealized double-double core agrees with the exact interval oracle. Production Errol3 avoids this runtime check by looking up a generated exceptional bit-pattern table before entering its unchecked core.",
      registers: { input_bits: `0x${result.inputBits.toString(16).padStart(16, "0")}`, core_output: result.coreText || result.text, returned_output: result.text, corrected: result.corrected, artifact_table_entries: 432 },
    visual: { scene: digitScene(result.states.at(-1), true) },
  });
  return steps;
}
