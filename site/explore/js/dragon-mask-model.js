// Copyright (C) 2026 Toit contributors.
//
// Dragon4 free-format digit generation (Steele & White, "How to Print
// Floating-Point Numbers Accurately", PLDI 1990, Tables 3 and 4: (FPP)² with
// Simple-Fixup), transcribed with BigInt and instrumented for "The Mask"
// explanation page.  Pure computation, no DOM: importable from node for tests.
//
// A value is v = f · 2^q with integer f > 0.  The algorithm keeps four
// integers:  v = R/S exactly, and M⁻/S, M⁺/S are the FULL gaps to the lower
// and upper neighbour (the factor ½ lives in the comparisons "2R < M⁻").

import { bitsOf } from "../../js/float.js";

// ------------------------------------------------------------------ inputs

/** Decode a positive, finite, nonzero binary64 into {f, q, unequal}. */
export function decodeBinary64(x) {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError("expects a positive finite double");
  const bits = bitsOf(x);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  if (biased === 0) return { f: fraction, q: -1074, p: 53, unequal: false, format: "binary64", value: x };
  // Unequal gaps: significand is exactly 2^52 and a smaller exponent exists
  // below.  The paper tests only f = b^(p-1); the smallest normal (biased
  // exponent 1) must be excluded because its lower neighbour is a subnormal
  // with the same spacing.
  return { f: fraction | (1n << 52n), q: biased - 1075, p: 53, unequal: fraction === 0n && biased > 1, format: "binary64", value: x };
}

/** A toy float with a p-bit significand and unbounded exponent: v = f · 2^q, 2^(p-1) ≤ f < 2^p. */
export function toyFloat(f, q, p = 5) {
  f = BigInt(f);
  return { f, q, p, unequal: f === 1n << BigInt(p - 1), format: `toy${p}`, value: Number(f) * 2 ** q };
}

/** Round a positive double to the nearest p-bit toy float (ties to even). */
export function roundToToy(x, p = 5) {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError("expects a positive finite number");
  let e = Math.floor(Math.log2(x));
  if (2 ** e > x) e--;
  if (2 ** (e + 1) <= x) e++;
  let q = e - (p - 1);
  const y = x / 2 ** q; // exact: power-of-two scaling
  let f = Math.floor(y);
  const rest = y - f;
  if (rest > 0.5 || (rest === 0.5 && f % 2 === 1)) f++;
  if (f === 2 ** p) { f /= 2; q++; }
  return toyFloat(f, q, p);
}

// ------------------------------------------------------------------ Dragon4

/**
 * Run Dragon4 and record everything the page shows.
 *
 * options.inclusive  — Burger & Dybvig refinement: when f is even the rounding
 *                      interval is closed (a parser rounding ties-to-even maps
 *                      its end points back to v).  Tests become ≤ / ≥.
 * options.scaleTest  — "strict" (default): second Fixup loop uses 2R + M⁺ > 2S
 *                      when the upper end is excluded.  "paper": the published
 *                      ≥, which emits a leading 0 digit for 1e23.
 * options.margins    — "split" (Dragon4), "symmetric" (ignore unequal gaps:
 *                      M⁻ = M⁺ = gap above), "single" (one combined stop test,
 *                      then choose by 2R vs S — the pre-Dragon4 rounding).
 * options.scaleBy    — "upper" (Dragon4: find k from the upper midpoint) or
 *                      "value" (find k from v itself; shows the first-digit carry).
 */
export function dragon4(v, options = {}) {
  const { inclusive: wantInclusive = false, scaleTest = "strict", margins = "split", scaleBy = "upper" } = options;
  const { f, q } = v;
  if (f <= 0n) throw new RangeError("Dragon4 requires f ≠ 0");
  const inclusive = wantInclusive && (f & 1n) === 0n;

  let R = f << BigInt(Math.max(q, 0));
  let S = 1n << BigInt(Math.max(-q, 0));
  let Mm = 1n << BigInt(Math.max(q, 0));
  let Mp = Mm;
  const init = { R, S, Mm, Mp };

  const unequal = v.unequal && margins !== "symmetric";
  if (unequal) { Mp *= 2n; R *= 2n; S *= 2n; }
  const afterGap = { R, S, Mm, Mp };

  let k = 0;
  let loops1 = 0;
  let loops2 = 0;
  while (R < (S + 9n) / 10n) { k--; R *= 10n; Mm *= 10n; Mp *= 10n; loops1++; }
  const geq = inclusive || scaleTest === "paper";
  const needsScale = scaleBy === "value"
    ? () => R >= S
    : () => (geq ? 2n * R + Mp >= 2n * S : 2n * R + Mp > 2n * S);
  while (needsScale()) { S *= 10n; k++; loops2++; }
  const H = k - 1;
  const start = { R, S, Mm, Mp, k };

  const steps = [];
  const digits = [];
  for (;;) {
    k--;
    const tenR = R * 10n;
    const U = tenR / S;
    R = tenR % S;
    Mm *= 10n;
    Mp *= 10n;
    const low = inclusive ? 2n * R <= Mm : 2n * R < Mm;
    const high = inclusive ? 2n * R >= 2n * S - Mp : 2n * R > 2n * S - Mp;
    const step = { k, U: Number(U), tenR, R, Mm, Mp, low, high, final: false, out: Number(U), choice: null };
    steps.push(step);
    if (!(low || high)) { digits.push(Number(U)); continue; }
    step.final = true;
    let out;
    if (margins === "single") {
      out = 2n * R < S ? U : 2n * R > S ? U + 1n : (U % 2n === 0n ? U : U + 1n);
      step.choice = out === U ? "nearer-low" : "nearer-high";
    } else if (low && !high) { out = U; step.choice = "low"; }
    else if (high && !low) { out = U + 1n; step.choice = "high"; }
    else if (2n * R < S) { out = U; step.choice = "nearer-low"; }
    else if (2n * R > S) { out = U + 1n; step.choice = "nearer-high"; }
    else { out = U % 2n === 0n ? U : U + 1n; step.choice = "tie-even"; }
    step.out = Number(out);
    step.carry = out > 9n; // never true for Dragon4 proper
    digits.push(Number(out));
    break;
  }
  const digitText = digits.join("");
  return {
    v, inclusive, unequal, init, afterGap, loops1, loops2, H, start, S, steps,
    digits: digitText,
    carry: steps.at(-1).carry,
    exp10: H - digits.length + 1,
    text: steps.at(-1).carry ? null : formatLikeJS(digitText, H + 1),
  };
}

/** Number.prototype.toString layout for digits d1…dk with the decimal point after n digits. */
export function formatLikeJS(digits, n) {
  const k = digits.length;
  if (k <= n && n <= 21) return digits + "0".repeat(n - k);
  if (0 < n && n <= 21) return `${digits.slice(0, n)}.${digits.slice(n)}`;
  if (-6 < n && n <= 0) return `0.${"0".repeat(-n)}${digits}`;
  const e = n - 1;
  return `${digits[0]}${k > 1 ? `.${digits.slice(1)}` : ""}e${e >= 0 ? "+" : "-"}${Math.abs(e)}`;
}

/** Shortest-form text for a binary64 under Dragon4 (strict unless inclusive). */
export function dragon4Text(x, options = {}) {
  return dragon4(decodeBinary64(x), options).text;
}

// ------------------------------------------------------------------ display helpers

export function bitLength(n) {
  if (n < 0n) n = -n;
  if (n === 0n) return 0;
  const hex = n.toString(16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0], 16)));
}

/** n/d as a Number, correct to ~1 ulp even when n and d have thousands of bits. */
export function ratio(n, d) {
  if (n === 0n) return 0;
  const shift = bitLength(d) - bitLength(n) + 64;
  const qt = shift >= 0 ? (n << BigInt(shift)) / d : n / (d << BigInt(-shift));
  return Number(qt) * 2 ** -shift;
}

/** log10(n/d) for positive BigInts, robust against under/overflow of n/d. */
export function log10Ratio(n, d) {
  if (n <= 0n) return -Infinity;
  const shift = bitLength(d) - bitLength(n) + 64;
  const qt = shift >= 0 ? (n << BigInt(shift)) / d : n / (d << BigInt(-shift));
  const top = bitLength(qt) - 60;
  const mant = top > 0 ? Number(qt >> BigInt(top)) : Number(qt);
  return Math.log10(mant) + ((top > 0 ? top : 0) - shift) * Math.log10(2);
}

/**
 * Per-state geometry for the unit cell.  State 0 is the scaled start (no digit
 * yet, cell = [0, 10^k]); state j ≥ 1 is after the j-th digit of the loop.
 */
export function cellStates(run) {
  const S = run.S;
  const states = [{
    j: 0, R: run.start.R, Mm: run.start.Mm, Mp: run.start.Mp, U: null, low: false, high: false, final: false,
  }];
  run.steps.forEach((s, i) => states.push({ j: i + 1, ...s }));
  let prefix = "";
  return states.map((st) => {
    const dot = ratio(st.R, S);
    const out = {
      ...st,
      prefix,
      dot,
      shadowL: ratio(st.Mm, 2n * S),
      shadowR: ratio(st.Mp, 2n * S),
      distL: dot,
      distR: ratio(S - st.R, S),
      logDistL: log10Ratio(st.R, S),
      logDistR: log10Ratio(S - st.R, S),
      logShadowL: log10Ratio(st.Mm, 2n * S),
      logShadowR: log10Ratio(st.Mp, 2n * S),
    };
    if (st.j >= 1) {
      prefix += String(st.U);
      out.prefix = prefix;
    }
    // Cell edges as decimals: [P, P+1] · 10^(H - j + 1)
    const exp = run.H - st.j + 1;
    out.leftCoef = BigInt(out.prefix || "0");
    out.rightCoef = out.leftCoef + 1n;
    out.edgeExp = exp;
    return out;
  });
}

/**
 * Decimal label for coef · 10^exp: plain when short, else scientific.
 * keepDigits: keep trailing zeros up to this many significant digits (a
 * digit prefix like "1.10" should not be shortened to "1.1").
 */
export function decimalLabel(coef, exp, keepDigits = 0) {
  if (coef === 0n) return "0";
  let digits = coef.toString();
  while (digits.length > Math.max(1, keepDigits) && digits.endsWith("0")) { digits = digits.slice(0, -1); exp++; }
  const n = digits.length + exp; // position of the decimal point
  if (exp >= 0 && n <= 21) return digits + "0".repeat(exp);
  if (n > 0 && n <= 21) return `${digits.slice(0, n)}.${digits.slice(n)}`;
  if (n <= 0 && n > -6) return `0.${"0".repeat(-n)}${digits}`;
  const e = n - 1;
  return `${digits[0]}${digits.length > 1 ? "." + digits.slice(1) : ""}e${e}`;
}

/** Group a BigInt's decimal digits in threes with thin spaces. */
export function groupDigits(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ------------------------------------------------------------------ presets

export const TOY_PRESETS = [
  { id: "1.1875", label: "1.1875", f: 19, q: -4, note: "Two digits; the dot slides into the right shadow: high fires and the last digit is bumped to 2." },
  { id: "1.125", label: "1.125", f: 18, q: -4, note: "The dot falls into the left shadow on the second digit: low fires, keep U = 1." },
  { id: "1.4375", label: "1.4375", f: 23, q: -4, note: "A near miss at digit 2, then the shadows cover the whole cell: both lamps on, the dot is right of centre, round up." },
  { id: "1", label: "1.0 (unequal gaps)", f: 16, q: -4, note: "A power of two: the gap below is half the gap above, so the left shadow is half as wide as the right one." },
  { id: "184", label: "184", f: 23, q: 3, note: "A large value: the Fixup loop multiplies S by 10 three times before the first digit." },
];

export const DOUBLE_PRESETS = [
  { id: "0.1", label: "0.1", x: 0.1, note: "After digit 1 the dot sits 5.55·10⁻¹⁷ from the left edge, inside a left shadow of 6.94·10⁻¹⁷: low fires, output 1." },
  { id: "0.3", label: "0.3", x: 0.3, note: "The stored double is 0.2999…; its first digit is U = 2, but the dot is 1.1·10⁻¹⁶ from the right edge, inside the right shadow: high fires and the output is 3." },
  { id: "1/3", label: "1/3", x: 1 / 3, note: "The dot stays near 0.333 while the mask line climbs one decade per digit; they meet at digit 16." },
  { id: "0.1+0.2", label: "0.1+0.2", x: 0.1 + 0.2, note: "The remainder runs just ahead of the mask line until digit 17, where both lamps fire and the dot is nearer the right edge." },
  { id: "2^-44", label: "2⁻⁴⁴", x: 2 ** -44, note: "Unequal gaps: at the last digit the dot is left of centre, but only the (wider) right shadow reaches it, so Dragon4 must round up." },
  { id: "2^64", label: "2⁶⁴", x: 2 ** 64, note: "Unequal gaps at a large power of two; symmetric masks would print the predecessor (see “Why is it like this?”)." },
  { id: "5e-324", label: "5e-324", x: 5e-324, note: "The smallest subnormal: 323 Fixup iterations before the first digit, then the shadows cover the whole first cell." },
  { id: "1e23", label: "1e23", x: 1e23, note: "The upper midpoint is exactly 10²³. Strict Dragon4 may not use it and prints 9.999999999999999e+22; the inclusive refinement prints 1e+23." },
];

/** Parse the free input box: decimal literal, "a/b", "2^n", "a+b". Returns a positive finite double or null. */
export function parseNumberInput(text) {
  const t = String(text).trim().replace(/\s+/g, "").replace(/[−–]/g, "-")
    .replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => "^" + run.replace(/⁻/g, "-").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)));
  let m;
  let x = null;
  if ((m = t.match(/^2\^\(?(-?\d+)\)?$/)) || (m = t.match(/^2\*\*\(?(-?\d+)\)?$/))) x = 2 ** Number(m[1]);
  else if ((m = t.match(/^([0-9.eE+-]+)\/([0-9.eE+-]+)$/))) x = Number(m[1]) / Number(m[2]);
  else if ((m = t.match(/^([0-9.]+(?:[eE][+-]?\d+)?)\+([0-9.]+(?:[eE][+-]?\d+)?)$/))) x = Number(m[1]) + Number(m[2]);
  else if (/^[+]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) x = Number(t);
  if (x === null || !Number.isFinite(x) || !(x > 0)) return null;
  return x;
}
