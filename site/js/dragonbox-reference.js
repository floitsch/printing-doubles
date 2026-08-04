import { decodeDouble, formatDecimal } from "./float.js";
import { schubfachExact } from "./schubfach-reference.js";

function stripTrailingZeros(coefficient, exponent) {
  let removed = 0;
  while (coefficient !== 0n && coefficient % 10n === 0n) {
    coefficient /= 10n;
    exponent++;
    removed++;
  }
  return { coefficient, exponent, removed };
}

export function dragonboxExact(value, policies = {}) {
  const {
    trailingZero = "remove",
    sign = "return",
    cache = "full",
  } = policies;
  if (!new Set(["remove", "report", "ignore"]).has(trailingZero)) throw new RangeError("unknown trailing-zero policy");
  if (!new Set(["return", "ignore"]).has(sign)) throw new RangeError("unknown sign policy");
  if (!new Set(["full", "compact"]).has(cache)) throw new RangeError("unknown cache policy");

  if (!Number.isFinite(value) || value === 0) {
    return { special: true, text: Object.is(value, -0) ? "−0" : String(value), policies: { trailingZero, sign, cache } };
  }
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const decoded = decodeDouble(magnitude);
  const schubfach = schubfachExact(magnitude);
  const shorterInterval = decoded.exponentBits !== 0 && decoded.fraction === 0n;
  const divisorPath = schubfach.path === "coarse" ? "big" : "small";

  let coefficient = schubfach.selected.coefficient;
  let exponent = schubfach.selected.exponent;
  const stripped = stripTrailingZeros(coefficient, exponent);
  const mayHaveTrailingZeros = stripped.removed > 0;
  if (trailingZero === "remove") {
    coefficient = stripped.coefficient;
    exponent = stripped.exponent;
  }
  const signedCoefficient = sign === "return" && negative ? -coefficient : coefficient;
  return {
    coefficient: signedCoefficient,
    exponent,
    isNegative: sign === "return" ? negative : undefined,
    text: formatDecimal(signedCoefficient, exponent),
    mayHaveTrailingZeros: trailingZero === "report" ? mayHaveTrailingZeros : undefined,
    removedTrailingZeros: stripped.removed,
    shorterInterval,
    divisorPath,
    schubfach,
    policies: { trailingZero, sign, cache },
    cacheAccess: cache === "full" ? "direct 128-bit entry" : "reconstruct from a sparse entry and a small power of five",
  };
}

function candidateScene(result, footer) {
  const items = result.divisorPath === "big" ? result.schubfach.coarse : result.schubfach.fine;
  return {
    domain: [-.15, 1.15],
    background: "#192632",
    bands: [{ from: .1, to: .9, top: .16, bottom: .84, color: "rgba(223,255,82,.13)", border: "#dfff52", label: result.shorterInterval ? "SHORTER POWER-OF-TWO INTERVAL" : "REGULAR PARSING INTERVAL" }],
    lanes: [{ y: .58, color: "#ff9b8e", label: result.divisorPath === "big" ? "LARGE-DIVISOR CANDIDATES" : "SMALL-DIVISOR CANDIDATES", ticks: items.map((item, index) => ({
      x: index === 0 ? .31 : .69,
      color: item === result.schubfach.selected ? "#ef4b35" : item.inside ? "#dfff52" : "#ff9b8e",
      width: item === result.schubfach.selected ? 3 : 1.5,
      height: item === result.schubfach.selected ? 72 : 50,
      dot: item.inside ? 5 : 0,
      topLabel: item.text,
    })) }],
    footer,
  };
}

export function dragonboxTrace(value) {
  const result = dragonboxExact(value, { trailingZero: "remove", sign: "return", cache: "full" });
  return [
    {
      line: 1,
      label: "Classify",
      title: result.shorterInterval ? "Enter the shorter-interval path" : "Enter the regular-interval path",
      why: result.shorterInterval
        ? "A normal power of two has a predecessor at half the successor spacing. Dragonbox gives this asymmetric geometry a separate path, avoiding conditionals in the common case."
        : "The value has ordinary midpoint geometry. Dragonbox can use its shared multiplier-and-divisor path.",
      registers: { fraction_bits_zero: result.schubfach.decoded.fraction === 0n, shorter_interval: result.shorterInterval, selected_binary_exponent: result.schubfach.decoded.exponent },
      visual: { interval: result.shorterInterval ? [-.25, .5] : [-.5, .5], binary: [-1, 0, 1], caption: result.shorterInterval ? "the lower midpoint is closer" : "regular midpoint spacing" },
    },
    {
      line: 2,
      label: "Scale",
      title: "Compute the Schubfach multiplier window",
      why: "A cached power and a wide product place the right endpoint and interval width in one integer coordinate system. Dragonbox arranges the scale so fixed decimal divisors can test two candidate lengths.",
      registers: { k: result.schubfach.k, cache_policy: result.policies.cache, cache_access: result.cacheAccess, kappa: 2 },
      visual: { scene: candidateScene(result, "ONE PRODUCT WINDOW SUPPORTS BOTH DIVISOR TESTS") },
    },
    {
      line: 3,
      label: result.divisorPath === "big" ? "Large divisor" : "Large divisor fails",
      title: result.divisorPath === "big" ? "The coarser candidate is admissible" : "The coarser candidate is outside the interval",
      why: result.divisorPath === "big"
        ? "Division by 10^(κ+1) produces a shorter candidate. Endpoint and parity checks certify it, so the smaller divisor is unnecessary."
        : "The remainder and scaled interval width show that the large-divisor candidate cannot be returned. Dragonbox retains the remainder and reuses it instead of repeating the wide multiplication.",
      registers: { big_divisor: 1000, path: result.divisorPath, candidate_grid: `10^${result.schubfach.k + 1}` },
      visual: { scene: candidateScene(result, result.divisorPath === "big" ? "LARGE DIVISOR SUCCEEDS" : "REUSE THE REMAINDER WITH THE SMALL DIVISOR") },
    },
    ...(result.divisorPath === "small" ? [{
      line: 4,
      label: "Small divisor",
      title: "Refine by one decimal digit and round",
      why: "The retained remainder locates the center between the two fine candidates. A divisibility and parity test distinguishes an exact halfway case from an inexact approximation before applying the selected tie policy.",
      registers: { small_divisor: 100, candidate_grid: `10^${result.schubfach.k}`, selected: result.schubfach.selected.text },
      visual: { scene: candidateScene(result, "SMALL DIVISOR SELECTS THE FINE CANDIDATE") },
    }] : []),
    {
      line: 5,
      label: "Policy result",
      title: "Return a decimal pair, not yet a character string",
      why: "Dragonbox's core returns a decimal significand and exponent. Sign handling, trailing-zero removal, cache layout, and final character formatting are policies or separate layers.",
      registers: { coefficient: result.coefficient.toString(), exponent: result.exponent, removed_trailing_zeros: result.removedTrailingZeros, output: result.text },
      visual: { scene: candidateScene(result, "TO_DECIMAL RETURNS (SIGNIFICAND, EXPONENT)") },
    },
  ];
}
