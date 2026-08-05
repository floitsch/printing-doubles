import { decodeDouble } from "./float.js";
import { shortestDecimal } from "./oracle.js";

function digitCount(value) { return (value < 0n ? -value : value).toString().length; }

// A semantic model of Żmij's public decimal record for ordinary normal
// binary64 values. Candidate selection is supplied by the independent exact
// oracle; the model then exposes the fixed-width record and the extra last
// digit used by the pinned implementation's pipeline.
export function zmijSemantic(value) {
  if (!Number.isFinite(value) || value === 0) throw new RangeError("expected a finite, nonzero binary64 value");
  const exact = shortestDecimal(value);
  const decoded = decodeDouble(Math.abs(value));
  const normal = decoded.exponent !== -1074 || decoded.significand >= (1n << 52n);
  let recordCoefficient = exact.coefficient < 0n ? -exact.coefficient : exact.coefficient;
  let recordExponent = exact.exponent;
  if (normal) {
    const zeros = 17 - digitCount(recordCoefficient);
    if (zeros > 0) { recordCoefficient *= 10n ** BigInt(zeros); recordExponent -= zeros; }
  }
  const recordDigits = recordCoefficient.toString();
  const lastDigit = Number(recordCoefficient % 10n);
  const integral = recordCoefficient / 10n;
  return {
    value,
    normal,
    shortest: exact,
    recordCoefficient,
    recordExponent,
    recordDigits,
    integral,
    lastDigit,
    hasLastDigit: lastDigit !== 0,
    highEight: integral / 100000000n,
    lowEight: integral % 100000000n,
  };
}
