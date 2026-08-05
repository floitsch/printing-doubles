import { decodeDouble } from "./float.js";
import { shortestDecimal } from "./oracle.js";

const FORMATS = {
  binary16: {
    label: "IEEE binary16", exponentMin: -24, exponentMax: 5, mantissaWidth: 11,
    carrierWidth: 32, storageSplit: 1, multiplierRows: 10,
    variants: {
      portable: { id: "ieee16_no_uint128", div10: "built_in_2", mshift: "built_in_2", generatedBytes: 1832 },
      uint128: { id: "ieee16_with_uint128", div10: "built_in_2", mshift: "built_in_4", generatedBytes: 1836 },
    },
  },
  bfloat16: {
    label: "bfloat16", exponentMin: -133, exponentMax: 120, mantissaWidth: 8,
    carrierWidth: 16, storageSplit: 1, multiplierRows: 78,
    variants: { fixed: { id: "bfloat16", div10: "built_in_2", mshift: "built_in_4", generatedBytes: 3564 } },
  },
  binary32: {
    label: "IEEE binary32", exponentMin: -149, exponentMax: 104, mantissaWidth: 24,
    carrierWidth: 32, storageSplit: 1, multiplierRows: 77,
    variants: {
      portable: { id: "ieee32_no_uint128", div10: "built_in_2", mshift: "built_in_2", generatedBytes: 4453 },
      uint128: { id: "ieee32_with_uint128", div10: "built_in_2", mshift: "built_in_4", generatedBytes: 4457 },
    },
  },
  binary64: {
    label: "IEEE binary64", exponentMin: -1074, exponentMax: 971, mantissaWidth: 53,
    carrierWidth: 64, storageSplit: 1, multiplierRows: 617,
    variants: {
      portable: { id: "ieee64_no_uint128", div10: "synthetic_1", mshift: "synthetic_1", generatedBytes: 35366 },
      uint128: { id: "ieee64_with_uint128", div10: "built_in_2", mshift: "built_in_2", generatedBytes: 35368 },
    },
  },
  x86extended: {
    label: "x86 extended", exponentMin: -16445, exponentMax: 16321, mantissaWidth: 64,
    carrierWidth: 128, storageSplit: 2, multiplierRows: 9865,
    variants: { fixed: { id: "x86_extended", div10: "built_in_1", mshift: "built_in_1", generatedBytes: 1231000 } },
  },
  binary128: {
    label: "IEEE binary128", exponentMin: -16494, exponentMax: 16271, mantissaWidth: 113,
    carrierWidth: 128, storageSplit: 2, multiplierRows: 9865,
    variants: { fixed: { id: "ieee128", div10: "built_in_1", mshift: "built_in_1", generatedBytes: 1233568 } },
  },
};

export function tejuFormats() {
  return Object.entries(FORMATS).map(([id, value]) => ({ id, label: value.label }));
}

export function tejuConfiguration(formatId, capability = "portable") {
  const format = FORMATS[formatId];
  if (!format) throw new RangeError(`unknown Tejú Jaguá format ${formatId}`);
  const variantKey = format.variants[capability] ? capability : Object.keys(format.variants)[0];
  const variant = format.variants[variantKey];
  return {
    formatId,
    ...format,
    variants: undefined,
    variantKey,
    configurableCapability: Object.keys(format.variants).length > 1,
    ...variant,
    runtimeShift: 2 * format.carrierWidth,
    functionName: `teju_${variant.id}`,
  };
}

function isMultipleOfPower2(value, exponent) {
  if (exponent === 0) return true;
  const mask = (1n << BigInt(exponent)) - 1n;
  return (value & mask) === 0n;
}

export function tejuRuntime(value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("Tejú Jaguá's core expects a finite, strictly positive value");
  const decoded = decodeDouble(value);
  const negatedExponent = -decoded.exponent;
  const smallInteger = negatedExponent >= 0 && negatedExponent < 53 &&
    isMultipleOfPower2(decoded.significand, negatedExponent);
  const centered = decoded.significand !== (1n << 52n) || decoded.exponent === -1074;
  const route = smallInteger ? "small" : centered ? "centered" : "uncentered";
  const decimal = shortestDecimal(value);
  return {
    value,
    decoded,
    route,
    decimal,
    binaryText: `${decoded.significand} × 2^${decoded.exponent}`,
    decimalText: `${decimal.coefficient} × 10^${decimal.exponent}`,
  };
}
