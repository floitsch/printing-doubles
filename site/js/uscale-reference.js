import { decodeDouble, formatDecimal } from "./float.js";

const TWO64 = 1n << 64n;
const MASK64 = TWO64 - 1n;
const TWO63 = 1n << 63n;
const POW10 = [1n];

function pow10(power) {
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}

function bitLength(value) { return value === 0n ? 0 : value.toString(2).length; }
function floorLogApprox(numerator, denominator) { return Math.floor(numerator / denominator); }
export function uscaleLog10Pow2(exponent) { return floorLogApprox(exponent * 78913, 2 ** 18); }
export function uscaleLog2Pow10(exponent) { return floorLogApprox(exponent * 108853, 2 ** 15); }
export function uscaleSkewed(exponent) { return floorLogApprox(exponent * 631305 - 261663, 2 ** 21); }

export function uscaleUnpack(value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("expected a finite, strictly positive binary64 value");
  const decoded = decodeDouble(value);
  const shift = 64 - bitLength(decoded.significand);
  return { decoded, x: decoded.significand << BigInt(shift), e: decoded.exponent - shift, leftShift: shift };
}

// Reconstructs the checked-in table generator's ceil-rounded 128-bit power.
// The optimized representation stores ceilPower = hi*2^64 - lo.
export function uscalePower(decimalExponent) {
  if (decimalExponent < -348 || decimalExponent > 347) throw new RangeError("decimal exponent is outside the pinned table");
  const lp = uscaleLog2Pow10(decimalExponent);
  const binaryScale = 127 - lp;
  let numerator = decimalExponent >= 0 ? pow10(decimalExponent) : 1n;
  let denominator = decimalExponent >= 0 ? 1n : pow10(-decimalExponent);
  if (binaryScale >= 0) numerator <<= BigInt(binaryScale);
  else denominator <<= BigInt(-binaryScale);
  const ceilPower = (numerator + denominator - 1n) / denominator;
  const ordinaryLow = ceilPower & MASK64;
  const hi = ordinaryLow === 0n ? ceilPower >> 64n : (ceilPower >> 64n) + 1n;
  const lo = ordinaryLow === 0n ? 0n : TWO64 - ordinaryLow;
  return { decimalExponent, lp, binaryScale, ceilPower, hi, lo, exact: numerator % denominator === 0n };
}

function mul64(left, right) {
  const product = left * right;
  return { high: product >> 64n, low: product & MASK64, product };
}

function exactUnrounded(x, e, p) {
  let numerator = x * 4n;
  let denominator = 1n;
  if (e >= 0) numerator <<= BigInt(e); else denominator <<= BigInt(-e);
  if (p >= 0) numerator *= pow10(p); else denominator *= pow10(-p);
  const truncated = numerator / denominator;
  return truncated | (numerator % denominator === 0n ? 0n : 1n);
}

export function uscaleProduct(x, e, p) {
  const power = uscalePower(p);
  const shift = -(e + power.lp + 3);
  if (shift < 0 || shift >= 64) throw new RangeError(`the product microscope expects a top-word shift from 0 through 63; got ${shift}`);
  const upperProduct = mul64(x, power.hi);
  const correctionProduct = mul64(x, power.lo);
  const shiftedMask = shift === 0 ? 0n : (1n << BigInt(shift)) - 1n;
  const shiftedBits = upperProduct.high & shiftedMask;
  const fastPath = shiftedBits !== 0n;
  let correctedHigh = upperProduct.high;
  let sticky = 1n;
  const wrappedDifference = (upperProduct.low - correctionProduct.high) & MASK64;
  const borrow = upperProduct.low < correctionProduct.high;
  if (!fastPath) {
    sticky = wrappedDifference > 1n ? 1n : 0n;
    if (borrow) correctedHigh--;
  }
  const optimized = (correctedHigh >> BigInt(shift)) | sticky;
  const exact = exactUnrounded(x, e, p);
  const exactProduct = x * power.ceilPower;
  return {
    x, e, p, power, shift,
    upperProduct,
    correctionProduct,
    shiftedBits,
    fastPath,
    borrow,
    wrappedDifference,
    correctedHigh,
    sticky,
    optimized,
    exact,
    agrees: optimized === exact,
    exactWords: {
      high: exactProduct >> 128n,
      middle: (exactProduct >> 64n) & MASK64,
      low: exactProduct & MASK64,
    },
  };
}

export function unroundedParts(unrounded) {
  return {
    integer: unrounded >> 2n,
    half: Number((unrounded >> 1n) & 1n),
    sticky: Number(unrounded & 1n),
    floor: unrounded >> 2n,
    nearestEven: (unrounded + 1n + ((unrounded >> 2n) & 1n)) >> 2n,
    ceil: (unrounded + 3n) >> 2n,
  };
}

function nudge(unrounded, delta) { return unrounded + BigInt(delta); }
function floorUnrounded(unrounded) { return unrounded >> 2n; }
function ceilUnrounded(unrounded) { return (unrounded + 3n) >> 2n; }
function roundUnrounded(unrounded) { return (unrounded + 1n + ((unrounded >> 2n) & 1n)) >> 2n; }

function trimZeros(coefficient, exponent) {
  while (coefficient !== 0n && coefficient % 10n === 0n) { coefficient /= 10n; exponent++; }
  return { coefficient, exponent };
}

export function unroundedScalingShort(value) {
  const unpacked = uscaleUnpack(value);
  const { x, e } = unpacked;
  const minExp = -1085;
  let p;
  let lower;
  let extraZeros = 11;
  let intervalKind = "centered";
  if (x === TWO63 && e > minExp) {
    p = -uscaleSkewed(e + extraZeros);
    lower = x - (1n << BigInt(extraZeros - 2));
    intervalKind = "uncentered";
  } else {
    if (e < minExp) extraZeros = 11 + (minExp - e);
    p = -uscaleLog10Pow2(e + extraZeros);
    lower = x - (1n << BigInt(extraZeros - 1));
  }
  const upper = x + (1n << BigInt(extraZeros - 1));
  const odd = Number((x >> BigInt(extraZeros)) & 1n);
  const lowerScale = uscaleProduct(lower, e, p);
  const upperScale = uscaleProduct(upper, e, p);
  const dmin = ceilUnrounded(nudge(lowerScale.optimized, odd));
  const dmax = floorUnrounded(nudge(upperScale.optimized, -odd));
  let coefficient = dmax / 10n;
  let exponent = -(p - 1);
  let route = "coarse";
  let centerScale = null;
  if (coefficient * 10n < dmin) {
    coefficient = dmin;
    exponent = -p;
    route = "lower";
    if (dmin < dmax) {
      centerScale = uscaleProduct(x, e, p);
      coefficient = roundUnrounded(centerScale.optimized);
      route = "nearest";
    }
  }
  const trimmed = trimZeros(coefficient, exponent);
  return {
    value, ...unpacked, p, extraZeros, intervalKind, odd,
    lower, upper, lowerScale, upperScale, centerScale,
    dmin, dmax, route,
    coefficient: trimmed.coefficient,
    exponent: trimmed.exponent,
    text: formatDecimal(trimmed.coefficient, trimmed.exponent),
  };
}

export function hex64(value) { return `0x${value.toString(16).padStart(16, "0")}`; }
