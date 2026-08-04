import { formatDecimal } from "./float.js";
import { exactDecimalOfRational, rationalOfDouble } from "./oracle.js";

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
  const exactScaledText = exactDecimalOfRational(result.scaled);
  const scaledDisplay = exactScaledText.length > 24 ? `${exactScaledText.slice(0, 24)}…` : exactScaledText;
  const chosen = Number(result.coefficient);
  const original = Math.abs(value);
  const decadeStart = 10 ** result.scientificExponent;
  const decadeEnd = decadeStart * 10;
  const sourceDomain = [original * .9, original * 1.1];
  const scaledDomain = sourceDomain.map((point) => point * 10 ** result.scale);
  const schematicError = (scaledDomain[1] - scaledDomain[0]) * .035;
  const integerTicks = Array.from({ length: 5 }, (_, index) => {
    const x = chosen - 2 + index;
    return { x, color: x === chosen ? "#ef4b35" : "#ff9b8e", height: x === chosen ? 48 : 24, width: x === chosen ? 3 : 1, dot: x === chosen ? 4 : undefined, topLabel: x === chosen ? `rounded: ${x}` : String(x) };
  });
  const baseScene = (lanes, caption, options = {}) => ({
    domain: [0, 1],
    background: "#192632",
    grid: true,
    lanes,
    captions: caption ? [{ x: .02, y: .08, color: "#f4f0e8", text: caption }] : [],
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
      title: "Identify the decimal decade",
      why: "LOGX identifies the position of the leading decimal digit. The estimate is allowed to be one decade too low because the later range check detects and corrects exactly that error.",
      registers: { input: value.toPrecision(17), LOGX: result.scientificExponent, decade: `[${decadeStart}, ${decadeEnd})`, estimate_for_this_input: "correct" },
      visual: { scene: baseScene([{ y: .58, domain: [decadeStart, decadeEnd], margin: 55, color: "#8eb3ff", label: "SELECTED DECIMAL DECADE", ticks: [{ x: decadeStart, height: 35, topLabel: `10^${result.scientificExponent}` }, { x: original, color: "#dfff52", width: 3, height: 55, dot: 5, topLabel: "x" }, { x: decadeEnd, height: 35, topLabel: `10^${result.scientificExponent + 1}` }] }], "LOGX fixes the scientific exponent") },
    },
    {
      line: 3,
      label: "B3–B4 · Scale",
      title: `Move the desired ${digits} digits left of the point`,
      why: "SCALE = N − LOGX − 1. Multiplication by the corresponding power of ten maps the source value to the N-digit integer range. In the historical finite-precision path, approximation of that power can begin the error budget at this step.",
      registers: { input: value.toPrecision(17), factor: `10^${result.scale}`, exact_scaled_value: exactScaledText, exact_control_error: "0", historical_path: "bounded scale-factor error may already be present" },
      visual: { scene: baseScene([
        { y: .35, domain: sourceDomain, margin: 55, color: "#8eb3ff", label: "BEFORE SCALING", ticks: [{ x: original, width: 3, height: 42, dot: 4, topLabel: value.toPrecision(8) }] },
        { y: .7, domain: scaledDomain, margin: 55, color: "#ff9b8e", label: `AFTER MULTIPLICATION BY 10^${result.scale}`, bands: [{ from: scaledValue - schematicError, to: scaledValue + schematicError, color: "rgba(223,255,82,.17)", border: "#dfff52", label: "SCHEMATIC ERROR BUDGET" }], ticks: [{ x: scaledValue, width: 3, height: 42, dot: 4, topLabel: scaledValue.toFixed(6) }] },
      ], `${value.toPrecision(17)} × 10^${result.scale} = ${scaledDisplay}`) },
    },
    {
      line: 4,
      label: "B5 · Round",
      title: "Round the scaled value once, to an integer",
      why: "The integer is the complete significant-digit field. With only five requested digits, many nearby binary64 inputs can round to the same integer; fixed-precision output does not promise recovery. This exact control performs rational rounding, whereas Coonen's implementation rounds after bounded extended-precision scaling.",
      registers: { scaled_value: scaledValue.toPrecision(17), rounded_integer: result.coefficient.toString(), discarded_fraction: result.inexact ? "nonzero" : "zero", round_trip_at_N_5: "not promised" },
      visual: { scene: baseScene([{ y: .58, domain: [chosen - 2.2, chosen + 2.2], margin: 55, color: "#ff9b8e", label: "INTEGER GRID", ticks: [...integerTicks, { x: scaledValue, color: "#dfff52", width: 2, height: 70, dot: 4, topLabel: "scaled x" }] }], "One rounding produces all requested digits") },
    },
    {
      line: 5,
      label: "B6–B8 · Emit",
      title: "Pair the integer digits with the saved exponent",
      why: `LOGX says that the first digit has weight 10^${result.scientificExponent}. Because the coefficient has ${digits} digits, its integer form must instead be multiplied by 10^(${result.scientificExponent} − ${digits - 1}) = 10^${result.decimalExponent}. Thus ${result.coefficient} × 10^${result.decimalExponent} = ${result.text}.`,
      registers: { coefficient: result.coefficient.toString(), leading_digit_weight: `10^${result.scientificExponent}`, coefficient_weight: `10^${result.decimalExponent}`, identity: `${result.coefficient} × 10^${result.decimalExponent}`, output: result.text },
      visual: { scene: baseScene([{ y: .58, domain: [chosen - 2.2, chosen + 2.2], margin: 55, color: "#ff9b8e", label: "SIGNIFICANT-DIGIT INTEGER", ticks: [{ x: chosen, color: "#ef4b35", width: 3, height: 65, dot: 5, topLabel: result.coefficient.toString() }] }], `${result.coefficient} × 10^${result.decimalExponent} = ${result.text}`, { footer: "FIXED-PRECISION OUTPUT · NOT A SHORTEST-STRING SEARCH" }) },
    },
  ];
}
