import { formatDecimal } from "./float.js";
import { rationalOfDouble } from "./oracle.js";

const POW10 = [1n];
function pow10(power) {
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}

function compareRational(left, right) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function decimalPower(exponent) {
  return exponent >= 0
    ? { numerator: pow10(exponent), denominator: 1n }
    : { numerator: 1n, denominator: pow10(-exponent) };
}

function decimalDecade(value, rational) {
  const magnitude = rational.numerator < 0n
    ? { numerator: -rational.numerator, denominator: rational.denominator }
    : rational;
  let exponent = Math.floor(Math.log10(Math.abs(value)));
  while (compareRational(magnitude, decimalPower(exponent)) < 0) exponent--;
  while (compareRational(magnitude, decimalPower(exponent + 1)) >= 0) exponent++;
  return exponent;
}

function scaledByPower10(rational, exponent) {
  return exponent >= 0
    ? { numerator: rational.numerator * pow10(exponent), denominator: rational.denominator }
    : { numerator: rational.numerator, denominator: rational.denominator * pow10(-exponent) };
}

function roundRational(rational, mode) {
  const negative = rational.numerator < 0n;
  const magnitude = negative ? -rational.numerator : rational.numerator;
  let quotient = magnitude / rational.denominator;
  const remainder = magnitude % rational.denominator;
  const inexact = remainder !== 0n;
  if (mode === "nearest") {
    const twice = remainder * 2n;
    if (twice > rational.denominator || (twice === rational.denominator && (quotient & 1n) === 1n)) quotient++;
  } else if ((mode === "up" && !negative || mode === "down" && negative) && inexact) {
    quotient++;
  }
  return { integer: negative ? -quotient : quotient, inexact };
}

export function coonenBReference(value, digits, mode = "nearest") {
  if (!Number.isFinite(value) || value === 0) throw new RangeError("The current reference path expects a finite, nonzero input");
  if (!Number.isInteger(digits) || digits < 1 || digits > 24) throw new RangeError("digits must be an integer from 1 through 24");
  if (!["nearest", "zero", "up", "down"].includes(mode)) throw new RangeError("unsupported rounding mode");
  const exact = rationalOfDouble(value);
  let logx = decimalDecade(value, exact);
  let passes = 0;
  let scale;
  let scaled;
  let rounded;
  const limit = pow10(digits);
  const lowerLimit = pow10(digits - 1);
  do {
    passes++;
    scale = digits - logx - 1;
    scaled = scaledByPower10(exact, scale);
    rounded = roundRational(scaled, mode);
    if (rounded.integer < 0n ? -rounded.integer >= limit : rounded.integer >= limit) {
      logx++;
      continue;
    }
    break;
  } while (passes < 2);
  let coefficient = rounded.integer;
  const magnitude = coefficient < 0n ? -coefficient : coefficient;
  if (magnitude < lowerLimit) coefficient = coefficient < 0n ? -lowerLimit : lowerLimit;
  const decimalExponent = logx - digits + 1;
  return {
    coefficient,
    decimalExponent,
    scientificExponent: logx,
    digits,
    scale,
    scaled,
    inexact: rounded.inexact,
    passes,
    text: scientificText(coefficient, digits, logx),
    decimalText: formatDecimal(coefficient, decimalExponent),
  };
}

function scientificText(coefficient, digits, exponent) {
  const negative = coefficient < 0n;
  const raw = (negative ? -coefficient : coefficient).toString().padStart(digits, "0");
  const significand = digits === 1 ? raw : `${raw[0]}.${raw.slice(1)}`;
  return `${negative ? "−" : ""}${significand}e${exponent >= 0 ? "+" : ""}${exponent}`;
}

export function coonenBTrace(value, digits) {
  const result = coonenBReference(value, digits);
  const scaledValue = Number(result.scaled.numerator) / Number(result.scaled.denominator);
  const chosen = Number(result.coefficient);
  const original = Math.abs(value);
  const decadeStart = 10 ** result.scientificExponent;
  const decadeEnd = decadeStart * 10;
  const sourceDomain = [original * .9, original * 1.1];
  const scaledDomain = sourceDomain.map((point) => point * 10 ** result.scale);
  const integerTicks = Array.from({ length: 5 }, (_, index) => {
    const x = chosen - 2 + index;
    return { x, color: x === chosen ? "#ef4b35" : "#ff9b8e", height: x === chosen ? 48 : 24, width: x === chosen ? 3 : 1, dot: x === chosen ? 4 : undefined, topLabel: x === chosen ? `rounded: ${x}` : String(x) };
  });
  const baseScene = (lanes, caption, options = {}) => ({
    domain: [0, 1],
    background: "#192632",
    grid: true,
    lanes,
    captions: [{ x: .02, y: .08, color: "#f4f0e8", text: caption }],
    footer: options.footer,
  });
  return [
    {
      line: 1,
      label: "B1 · Extend",
      title: "Preserve the input in a wider format",
      why: "Coonen first widens the input and saves a copy. The economical path will scale and round this value instead of constructing its complete decimal expansion.",
      registers: { input: value.toPrecision(17), requested_digits: digits, working_contract: "fixed significant digits" },
      visual: { scene: baseScene([{ y: .58, domain: sourceDomain, margin: 55, color: "#8eb3ff", label: "ORIGINAL VALUE", ticks: [{ x: original, color: "#1565ff", width: 3, height: 55, dot: 5, topLabel: value.toPrecision(8) }] }], "One input value; no decimal digits generated yet") },
    },
    {
      line: 2,
      label: "B2 · Decimal decade",
      title: "Estimate the base-ten exponent from below",
      why: "Algorithm L supplies floor(log10(|x|)) or one less. An underestimate is permitted because B6 detects an oversized integer and retries once.",
      registers: { LOGX: result.scientificExponent, decade: `[${decadeStart}, ${decadeEnd})`, estimate_error: "0 for this input" },
      visual: { scene: baseScene([{ y: .58, domain: [decadeStart, decadeEnd], margin: 55, color: "#8eb3ff", label: "SELECTED DECIMAL DECADE", ticks: [{ x: decadeStart, height: 35, topLabel: `10^${result.scientificExponent}` }, { x: original, color: "#dfff52", width: 3, height: 55, dot: 5, topLabel: "x" }, { x: decadeEnd, height: 35, topLabel: `10^${result.scientificExponent + 1}` }] }], "LOGX fixes the scientific exponent") },
    },
    {
      line: 3,
      label: "B3–B4 · Scale",
      title: `Move the desired ${digits} digits left of the point`,
      why: "SCALE = N − LOGX − 1. Multiplication by the corresponding power of ten maps the source decade to the N-digit integer decade.",
      registers: { N: digits, LOGX: result.scientificExponent, SCALE: result.scale, factor: `10^${result.scale}` },
      visual: { scene: baseScene([
        { y: .35, domain: sourceDomain, margin: 55, color: "#8eb3ff", label: "BEFORE SCALING", ticks: [{ x: original, width: 3, height: 42, dot: 4, topLabel: value.toPrecision(8) }] },
        { y: .7, domain: scaledDomain, margin: 55, color: "#ff9b8e", label: `AFTER MULTIPLICATION BY 10^${result.scale}`, ticks: [{ x: scaledValue, width: 3, height: 42, dot: 4, topLabel: scaledValue.toFixed(6) }] },
      ], "Lane-local domains show the change of scale", { footer: "THE TWO MARKERS HAVE THE SAME RELATIVE POSITION IN THEIR RESPECTIVE DECADES" }) },
    },
    {
      line: 4,
      label: "B5 · Round",
      title: "Round the scaled value once, to an integer",
      why: "The integer is the complete significant-digit field. This exact-control implementation performs rational rounding; Coonen's implementation uses extended precision and a bounded scale-factor error.",
      registers: { scaled_value: scaledValue.toPrecision(12), rounded_integer: result.coefficient.toString(), inexact: result.inexact },
      visual: { scene: baseScene([{ y: .58, domain: [chosen - 2.2, chosen + 2.2], margin: 55, color: "#ff9b8e", label: "INTEGER GRID", ticks: [...integerTicks, { x: scaledValue, color: "#dfff52", width: 2, height: 70, dot: 4, topLabel: "scaled x" }] }], "One rounding produces all requested digits") },
    },
    {
      line: 5,
      label: "B6–B8 · Emit",
      title: "Pair the integer digits with the saved exponent",
      why: "The range check guarantees exactly N digits. The digit string and LOGX form the requested scientific result; Algorithm B does not search for a shorter representation.",
      registers: { coefficient: result.coefficient.toString(), exponent: result.scientificExponent, output: result.text, passes: result.passes },
      visual: { scene: baseScene([{ y: .58, domain: [chosen - 2.2, chosen + 2.2], margin: 55, color: "#ff9b8e", label: "SIGNIFICANT-DIGIT INTEGER", ticks: [{ x: chosen, color: "#ef4b35", width: 3, height: 65, dot: 5, topLabel: result.coefficient.toString() }] }], `${result.coefficient} together with exponent ${result.scientificExponent} gives ${result.text}`, { footer: "FIXED-PRECISION OUTPUT · NOT A SHORTEST-STRING SEARCH" }) },
    },
  ];
}
