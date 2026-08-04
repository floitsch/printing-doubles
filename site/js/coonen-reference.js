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
  const largeValue = 135000;
  const largeResult = coonenBReference(largeValue, digits);
  const original = Math.abs(value);
  const schematicError = Math.max(1e-12, Math.abs(scaledValue) * 2e-5);
  const integerTicks = Array.from({ length: 5 }, (_, index) => {
    const x = chosen - 2 + index;
    return { x, color: x === chosen ? "#ef4b35" : "#ff9b8e", height: x === chosen ? 48 : 24, width: x === chosen ? 3 : 1, dot: x === chosen ? 4 : undefined, topLabel: x === chosen ? `rounded: ${x}` : String(x) };
  });
  const baseScene = (lanes, caption, options = {}) => ({
    domain: [0, 1],
    background: "#192632",
    grid: true,
    lanes,
    captions: caption ? [{
      x: options.captionX ?? .02,
      y: options.captionY ?? .08,
      color: "#f4f0e8",
      text: caption,
      align: options.captionAlign || "left",
      font: options.captionFont,
    }] : [],
    footer: options.footer,
  });
  const scaleScene = (input, conversion, options = {}) => {
    const magnitude = Math.abs(input);
    const scaled = Number(conversion.scaled.numerator) / Number(conversion.scaled.denominator);
    const targetLower = 10 ** (digits - 1);
    const targetUpper = 10 ** digits;
    const sourceLimit = magnitude < 1 ? magnitude * 1.5 : magnitude * 1.35;
    return baseScene([
      {
        y: .29,
        domain: [0, sourceLimit],
        margin: 58,
        color: "#8eb3ff",
        label: "DECIMAL VALUE BEFORE THE SHIFT",
        labelOffset: 86,
        ticks: [{ x: magnitude, color: "#1565ff", width: 3, height: 48, dot: 5, topLabel: String(input) }],
      },
      {
        y: .73,
        domain: [0, targetUpper * 1.04],
        margin: 58,
        color: "#ff9b8e",
        label: `TARGET FOR ${digits} DIGITS`,
        labelOffset: 86,
        bands: [{ from: targetLower, to: targetUpper, color: "rgba(223,255,82,.14)", border: "#dfff52", label: `[${targetLower}, ${targetUpper})` }],
        ticks: [{ x: scaled, color: "#ef4b35", width: 3, height: 54, dot: 5, topLabel: String(scaled) }],
      },
    ], `MULTIPLY BY 10^${conversion.scale}  ↓`, {
      captionX: .5,
      captionY: .5,
      captionAlign: "center",
      captionFont: "600 15px 'DM Mono', monospace",
      footer: options.footer || `${input} × 10^${conversion.scale} = ${scaled}`,
    });
  };
  return [
    {
      line: 1,
      label: "Small value",
      title: "Move the decimal point right until four digits form an integer",
      why: `The value ${value} lies in the 10^-3 decade. Multiplication by 10^${result.scale} moves it into the four-digit integer range [1000, 10000). In decimal arithmetic, this is only a movement of the point: ${value} becomes ${scaledValue}.`,
      registers: { input: String(value), requested_digits: digits, decimal_decade: result.scientificExponent, shift: `× 10^${result.scale}`, scaled_value: String(scaledValue) },
      visual: { scene: scaleScene(value, result) },
    },
    {
      line: 1,
      label: "Large value",
      title: "Move the decimal point left when the value is too large",
      why: `The same target works in the other direction. ${largeValue} has six integer digits, so multiplication by 10^${largeResult.scale} moves it into the four-digit range as ${Number(largeResult.scaled.numerator) / Number(largeResult.scaled.denominator)}. The saved decimal exponent restores the original magnitude after the digits have been rounded.`,
      registers: { input: String(largeValue), requested_digits: digits, decimal_decade: largeResult.scientificExponent, shift: `× 10^${largeResult.scale}`, scaled_value: String(Number(largeResult.scaled.numerator) / Number(largeResult.scaled.denominator)) },
      visual: { scene: scaleScene(largeValue, largeResult) },
    },
    {
      line: 2,
      label: "Binary scaling",
      title: "A decimal shift is not a free operation on binary data",
      why: `The input called ${value} is actually the binary64 value ${value.toPrecision(17)}. The exact control scales that rational value to ${scaledDisplay}. A finite binary implementation may incur error when constructing a power or reciprocal of ten and again when rounding the multiplication. Here 10^${result.scale} itself is exact, but its product is not. In the large example, the reciprocal 10^${largeResult.scale} is already inexact.`,
      registers: { parsed_binary64: value.toPrecision(17), factor: `10^${result.scale}`, exact_scaled_binary_value: exactScaledText, finite_precision_error_sources: "scale factor; multiplication" },
      visual: { scene: baseScene([
        { y: .29, domain: [0, original * 1.5], margin: 58, color: "#8eb3ff", label: "STORED BINARY64 VALUE", ticks: [{ x: original, width: 3, height: 44, dot: 4, topLabel: value.toPrecision(17) }] },
        { y: .73, domain: [0, 10000 * 1.04], margin: 58, color: "#ff9b8e", label: `RESULT AFTER BINARY MULTIPLICATION BY 10^${result.scale}`, bands: [{ from: scaledValue - schematicError, to: scaledValue + schematicError, color: "rgba(223,255,82,.17)", border: "#dfff52", label: "SCHEMATIC ERROR RANGE" }], ticks: [{ x: scaledValue, width: 3, height: 44, dot: 4, topLabel: scaledValue.toPrecision(10) }] },
      ], "THE DECIMAL POINT IS CONCEPTUAL; THE MACHINE MULTIPLIES BINARY SIGNIFICANDS", { footer: "ALGORITHM S PRESERVES THE DIRECTION AND INEXACTNESS OF THIS STEP" }) },
    },
    {
      line: 3,
      label: "B5 · Round",
      title: "Round the scaled value once, to an integer",
      why: `The integer ${result.coefficient} is the complete four-digit field. Several nearby binary64 inputs may round to the same integer when only four digits are requested; this fixed-precision operation does not by itself search for a shortest recovering representation.`,
      registers: { scaled_value: scaledValue.toPrecision(17), rounded_integer: result.coefficient.toString(), discarded_fraction: result.inexact ? "nonzero" : "zero", requested_digits: digits },
      visual: { scene: baseScene([{ y: .58, domain: [chosen - 2.2, chosen + 2.2], margin: 55, color: "#ff9b8e", label: "INTEGER GRID", ticks: [...integerTicks, { x: scaledValue, color: "#dfff52", width: 2, height: 70, dot: 4, topLabel: "scaled x" }] }], "One rounding produces all requested digits") },
    },
    {
      line: 4,
      label: "B6–B8 · Emit",
      title: "Pair the integer digits with the saved exponent",
      why: `LOGX says that the first digit has weight 10^${result.scientificExponent}. Because the coefficient has ${digits} digits, its integer form must instead be multiplied by 10^(${result.scientificExponent} − ${digits - 1}) = 10^${result.decimalExponent}. Thus ${result.coefficient} × 10^${result.decimalExponent} = ${result.text}.`,
      registers: { coefficient: result.coefficient.toString(), leading_digit_weight: `10^${result.scientificExponent}`, coefficient_weight: `10^${result.decimalExponent}`, identity: `${result.coefficient} × 10^${result.decimalExponent}`, output: result.text },
      visual: { scene: baseScene([{ y: .58, domain: [chosen - 2.2, chosen + 2.2], margin: 55, color: "#ff9b8e", label: "SIGNIFICANT-DIGIT INTEGER", ticks: [{ x: chosen, color: "#ef4b35", width: 3, height: 65, dot: 5, topLabel: result.coefficient.toString() }] }], `${result.coefficient} × 10^${result.decimalExponent} = ${result.text}`, { footer: "FIXED-PRECISION OUTPUT · NOT A SHORTEST-STRING SEARCH" }) },
    },
  ];
}
