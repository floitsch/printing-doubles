const buffer = new ArrayBuffer(8);
const view = new DataView(buffer);
const FRACTION_MASK = (1n << 52n) - 1n;
const SIGN_MASK = 1n << 63n;
const MAX_FINITE_BITS = 0x7fefffffffffffffn;

export function bitsOf(value) {
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false);
}

export function fromBits(bits) {
  view.setBigUint64(0, bits, false);
  return view.getFloat64(0, false);
}

export function decodeDouble(value) {
  const bits = bitsOf(value);
  const negative = (bits & SIGN_MASK) !== 0n;
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & FRACTION_MASK;
  if (exponentBits === 0x7ff) {
    return { value, bits, negative, special: fraction === 0n ? "infinity" : "nan" };
  }
  if (exponentBits === 0 && fraction === 0n) {
    return { value, bits, negative, special: "zero", significand: 0n, exponent: -1074 };
  }
  const significand = exponentBits === 0 ? fraction : (1n << 52n) | fraction;
  const exponent = exponentBits === 0 ? -1074 : exponentBits - 1023 - 52;
  return {
    value,
    bits,
    negative,
    special: null,
    significand: negative ? -significand : significand,
    exponent,
    exponentBits,
    fraction,
  };
}

export function nextUp(value) {
  if (Number.isNaN(value) || value === Infinity) return value;
  if (Object.is(value, -0)) return Number.MIN_VALUE;
  if (value === 0) return Number.MIN_VALUE;
  const bits = bitsOf(value);
  return fromBits(value > 0 ? bits + 1n : bits - 1n);
}

export function nextDown(value) {
  if (Number.isNaN(value) || value === -Infinity) return value;
  if (Object.is(value, 0)) return -Number.MIN_VALUE;
  const bits = bitsOf(value);
  return fromBits(value > 0 ? bits - 1n : bits + 1n);
}

function trailingZeroBits(value) {
  let count = 0;
  while (value !== 0n && (value & 1n) === 0n) {
    value >>= 1n;
    count++;
  }
  return count;
}

export function unitExponent(value) {
  const center = decodeDouble(value);
  const higher = decodeDouble(nextUp(value));
  if (center.special || higher.special) return center.exponent;
  const commonExponent = Math.min(center.exponent, higher.exponent);
  const left = center.significand << BigInt(center.exponent - commonExponent);
  const right = higher.significand << BigInt(higher.exponent - commonExponent);
  return commonExponent + trailingZeroBits(right - left);
}

export function binaryCoordinate(decoded, center, unitExp) {
  const commonExponent = Math.min(decoded.exponent, center.exponent, unitExp);
  const n = (decoded.significand << BigInt(decoded.exponent - commonExponent)) -
    (center.significand << BigInt(center.exponent - commonExponent));
  const shift = unitExp - commonExponent;
  if (shift >= 0) return Number(n) / 2 ** shift;
  return Number(n << BigInt(-shift));
}

export function midpointCoordinate(a, b, center, unitExp) {
  const commonExponent = Math.min(a.exponent, b.exponent, center.exponent, unitExp);
  const n = (a.significand << BigInt(a.exponent - commonExponent)) +
    (b.significand << BigInt(b.exponent - commonExponent)) -
    2n * (center.significand << BigInt(center.exponent - commonExponent));
  const shift = unitExp - commonExponent + 1;
  if (shift >= 0) return Number(n) / 2 ** shift;
  return Number(n << BigInt(-shift));
}

const POW5 = [1n];
function pow5(power) {
  while (POW5.length <= power) POW5.push(POW5.at(-1) * 5n);
  return POW5[power];
}

function floorDiv(numerator, denominator) {
  let quotient = numerator / denominator;
  if (numerator < 0n && numerator % denominator !== 0n) quotient--;
  return quotient;
}

export function floorAtDecimalScale(decoded, decimalExponent) {
  let numerator = decoded.significand;
  let denominator = 1n;
  let exponent2 = decoded.exponent;
  if (decimalExponent >= 0) {
    denominator = pow5(decimalExponent);
    exponent2 -= decimalExponent;
  } else {
    const power = -decimalExponent;
    numerator *= pow5(power);
    exponent2 += power;
  }
  if (exponent2 >= 0) numerator <<= BigInt(exponent2);
  else denominator <<= BigInt(-exponent2);
  return floorDiv(numerator, denominator);
}

export function decimalCoordinate(coefficient, decimalExponent, center, unitExp) {
  let numerator = coefficient;
  let denominator = 1n;
  let exponent2 = decimalExponent;
  if (decimalExponent >= 0) numerator *= pow5(decimalExponent);
  else denominator = pow5(-decimalExponent);

  const shift = exponent2 - unitExp;
  if (shift >= 0) numerator <<= BigInt(shift);
  else denominator <<= BigInt(-shift);

  const centerUnits = center.significand << BigInt(center.exponent - unitExp);
  const delta = numerator - centerUnits * denominator;
  return Number(delta) / Number(denominator);
}

export function parseDecimal(text) {
  const match = String(text).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match || (!match[2] && !match[3])) return null;
  const fraction = match[3] || "";
  const digits = `${match[2] || ""}${fraction}`.replace(/^0+(?=\d)/, "");
  const sign = match[1] === "-" ? -1n : 1n;
  return {
    coefficient: sign * BigInt(digits || "0"),
    exponent: Number(match[4] || 0) - fraction.length,
  };
}

export function formatDecimal(coefficient, exponent) {
  if (coefficient === 0n) return "0";
  const negative = coefficient < 0n;
  let digits = (negative ? -coefficient : coefficient).toString();
  const scientificExponent = digits.length - 1 + exponent;
  let body;
  if (exponent >= 0 && digits.length + exponent <= 20) {
    body = digits + "0".repeat(exponent);
  } else if (exponent < 0 && digits.length + exponent > 0 && digits.length + exponent <= 18) {
    const point = digits.length + exponent;
    body = `${digits.slice(0, point)}.${digits.slice(point)}`;
  } else if (exponent < 0 && scientificExponent >= -4) {
    body = `0.${"0".repeat(-digits.length - exponent)}${digits}`;
  } else {
    body = `${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ""}e${scientificExponent >= 0 ? "+" : ""}${scientificExponent}`;
  }
  return negative ? `−${body}` : body;
}

export function exactForm(decoded) {
  if (decoded.special) return decoded.special;
  const sign = decoded.significand < 0n ? "−" : "";
  const significand = decoded.significand < 0n ? -decoded.significand : decoded.significand;
  return `${sign}${significand} × 2${superscript(decoded.exponent)}`;
}

function superscript(number) {
  const chars = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return String(number).split("").map((char) => chars[char]).join("");
}

export function bitHex(decoded) {
  return decoded.bits.toString(16).padStart(16, "0");
}

export function isEvenSignificand(decoded) {
  return (decoded.significand & 1n) === 0n;
}

export { MAX_FINITE_BITS };
