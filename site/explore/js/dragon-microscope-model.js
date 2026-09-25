// Copyright (C) 2026 Toit contributors.
//
// Dragon4 (Steele & White, PLDI 1990: free-format (FPP)² with Fixup) as a
// traced BigInt computation, for the "Decimal microscope" explanation page.
// Pure computation, no DOM: importable from node for tests.
//
// Inputs are binary floating-point values v = f · 2^q with a precision p:
//   - toy formats (any p, unbounded exponent), used for the hand-sized examples;
//   - real binary64 doubles (p = 53, with subnormals).
//
// Boundary semantics: the paper's strict tests (low: 2R < M⁻, high:
// 2R > 2S − M⁺).  The second scaling loop uses a strict `>` by default; the
// published `≥` is available as scaleTest: "paper" (it emits a leading zero
// digit when the upper boundary is exactly a power of ten, e.g. 1e23).

import { decodeDouble, formatDecimal, parseDecimal } from "../../js/float.js";

// ---------------------------------------------------------------- helpers

const POW10 = [1n];
export function pow10(k) {
  while (POW10.length <= k) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[k];
}

export function bitLength(n) {
  if (n < 0n) n = -n;
  if (n === 0n) return 0;
  const hex = n.toString(16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0], 16)));
}

/** a/b (non-negative BigInts, b > 0) as a Number, for drawing only. */
export function ratio(a, b) {
  if (a === 0n) return 0;
  const shift = bitLength(b) - bitLength(a) + 64;
  const q = shift >= 0 ? (a << BigInt(shift)) / b : a / (b << BigInt(-shift));
  let result = Number(q);
  let s = shift;
  while (s > 1000) { result *= 2 ** -1000; s -= 1000; }
  while (s < -1000) { result *= 2 ** 1000; s += 1000; }
  return result * 2 ** -s;
}

/** Digit grouping with thin spaces (only for 5+ digit numbers). */
export function groupDigits(n) {
  const text = typeof n === "bigint" ? n.toString() : String(n);
  const negative = text.startsWith("-");
  const digits = negative ? text.slice(1) : text;
  if (digits.length <= 4) return text;
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return (negative ? "−" : "") + out;
}

/**
 * a/b rounded to `sig` significant digits, as a readable decimal string
 * (plain when the exponent is moderate, otherwise d.ddd…e±n).
 */
export function approx(a, b, sig = 20) {
  if (a === 0n) return "0";
  const negative = a < 0n;
  if (negative) a = -a;
  // e with 10^e <= a/b < 10^(e+1)
  let e = a.toString().length - b.toString().length;
  const ge = (x) => (x >= 0 ? a >= b * pow10(x) : a * pow10(-x) >= b);
  while (!ge(e)) e--;
  while (ge(e + 1)) e++;
  const shift = sig - 1 - e;
  let num = shift >= 0 ? a * pow10(shift) : a;
  let den = shift >= 0 ? b : b * pow10(-shift);
  let c = num / den;
  if ((num % den) * 2n >= den) c += 1n;
  let exp = -shift;
  if (c.toString().length > sig) { c /= 10n; exp += 1; }
  while (c % 10n === 0n && c !== 0n) { c /= 10n; exp++; }
  const text = formatDecimal(c, exp).replace(/e\+/, "e");
  return (negative ? "−" : "") + text;
}

function floorDiv(a, b) {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
}

// ---------------------------------------------------------------- inputs

// π in hexadecimal: 3.243F6A8885A308D313198A2E03707344A4093822299F31D008…
const PI_HEX = "3243F6A8885A308D313198A2E03707344A4093822299F31D008";
const PI_FRAC_BITS = (PI_HEX.length - 1) * 4;
const PI_SCALED = BigInt("0x" + PI_HEX); // π · 2^PI_FRAC_BITS, truncated

/** The p-bit float nearest π (unbounded exponent; π is irrational, so no ties). */
export function piInput(p) {
  return p === 53 ? doubleInput(Math.PI) : piToy(p);
}

export function piToy(p) {
  const q = -(p - 2); // π ∈ [2, 4) → f ∈ [2^(p−1), 2^p)
  const shift = BigInt(PI_FRAC_BITS + q);
  let f = PI_SCALED >> shift;
  if ((PI_SCALED >> (shift - 1n)) & 1n) f += 1n; // round (never an exact tie)
  return toyInput(f, q, p);
}

export function toyInput(f, q, p) {
  f = BigInt(f);
  if (f < 1n << BigInt(p - 1) || f >= 1n << BigInt(p)) throw new RangeError("f out of range for p");
  return { kind: "toy", p, f, q, unequal: f === 1n << BigInt(p - 1) };
}

export function doubleInput(x) {
  const d = decodeDouble(x);
  if (d.special || d.negative) throw new RangeError("expects a finite positive double");
  const f = d.significand;
  return { kind: "double", p: 53, f, q: d.exponent, unequal: d.exponentBits > 1 && d.fraction === 0n, value: x };
}

/** Round the positive rational num/den to p bits (round-half-even, unbounded exponent). */
export function roundToPrecision(num, den, p) {
  let q = bitLength(num) - bitLength(den) - p;
  const scaled = (qq) => (qq >= 0 ? [num, den << BigInt(qq)] : [num << BigInt(-qq), den]);
  const lo = 1n << BigInt(p - 1);
  const hi = 1n << BigInt(p);
  for (;;) {
    const [n, d] = scaled(q);
    const t = n / d;
    if (t < lo) { q--; continue; }
    if (t >= hi) { q++; continue; }
    let f = t;
    const r2 = (n % d) * 2n;
    if (r2 > d || (r2 === d && (f & 1n))) f += 1n;
    if (f === hi) { f = lo; q++; }
    return { f, q };
  }
}

/**
 * Parse user text ("pi", "π", a decimal like 0.1 or 1e-6, or "2^64") and round it
 * to p bits.  p = 53 uses the real double (subnormals included).
 */
export function parseInput(text, p) {
  const t = String(text).trim().toLowerCase();
  if (t === "pi" || t === "π") return piInput(p);
  let num, den;
  const pow = t.match(/^2\s*\^\s*([+-]?\d+)$/);
  if (pow) {
    const e = Number(pow[1]);
    if (Math.abs(e) > 1100) return { error: "exponent too large" };
    [num, den] = e >= 0 ? [1n << BigInt(e), 1n] : [1n, 1n << BigInt(-e)];
  } else {
    const dec = parseDecimal(t);
    if (!dec) return { error: "not a number" };
    if (dec.coefficient <= 0n) return { error: "enter a positive number" };
    if (dec.exponent > 400 || dec.exponent < -420) return { error: "exponent too large" };
    [num, den] = dec.exponent >= 0 ? [dec.coefficient * pow10(dec.exponent), 1n] : [dec.coefficient, pow10(-dec.exponent)];
  }
  if (p === 53) {
    const x = pow ? 2 ** Number(pow[1]) : Number(t);
    if (!(x > 0) || !Number.isFinite(x)) return { error: "outside the double range" };
    return doubleInput(x);
  }
  const { f, q } = roundToPrecision(num, den, p);
  return toyInput(f, q, p);
}

/** v, its neighbours and the rounding-interval boundaries, as exact rationals over one denominator. */
export function neighbourhood(input) {
  const { f, q } = input;
  // Work in units of 2^(q−2) so every quantity is an integer.
  const unit = q - 2;
  const v = f << 2n;
  const up = 4n;
  const down = input.unequal ? 2n : 4n;
  const den = unit >= 0 ? 1n : 1n << BigInt(-unit);
  const mul = unit >= 0 ? 1n << BigInt(unit) : 1n;
  const R = (n) => ({ num: n * mul, den });
  return {
    v: R(v),
    lowerNeighbour: R(v - down),
    upperNeighbour: R(v + up),
    lower: R(v - down / 2n), // exclusive
    upper: R(v + up / 2n), // exclusive
  };
}

export function rationalText(r, sig) {
  if (sig) return approx(r.num, r.den, sig);
  // exact decimal (denominators are powers of two)
  let num = r.num;
  let den = r.den;
  let places = 0;
  while (den > 1n) { den /= 2n; num *= 5n; places++; }
  return decimalText(num, -places);
}

// ---------------------------------------------------------------- Dragon4

/**
 * Traced Dragon4 free-format digit generation.
 * options.scaleTest: "strict" (2R + M⁺ > 2S, default), "paper" (≥, as published),
 *                    "v" (R ≥ S: a broken variant that scales on v instead of the upper end)
 * options.symmetric: skip the unequal-gap adjustment (a broken variant).
 */
export function dragon4(input, { scaleTest = "strict", symmetric = false } = {}) {
  const { f, q } = input;
  const unequal = input.unequal && !symmetric;
  let maxBits = 0;
  const track = (...xs) => { for (const x of xs) maxBits = Math.max(maxBits, bitLength(x)); };

  let R = f << BigInt(Math.max(q, 0));
  let S = 1n << BigInt(Math.max(0, -q));
  let Mm = 1n << BigInt(Math.max(q, 0));
  let Mp = Mm;
  const init = { R, S, Mm, Mp };
  if (unequal) { Mp *= 2n; R *= 2n; S *= 2n; }
  const afterUnequal = { R, S, Mm, Mp };
  track(R, S, Mm, Mp);

  let k = 0;
  const loop1 = [];
  while (R < (S + 9n) / 10n) {
    k--; R *= 10n; Mm *= 10n; Mp *= 10n;
    loop1.push({ k, R, Mm, Mp });
  }
  const loop2 = [];
  const scaleMore = scaleTest === "paper" ? () => 2n * R + Mp >= 2n * S
    : scaleTest === "v" ? () => R >= S
    : () => 2n * R + Mp > 2n * S;
  while (scaleMore()) {
    S *= 10n; k++;
    loop2.push({ k, S });
  }
  track(R, S, Mm, Mp);
  const scaled = { R, S, Mm, Mp, k };
  const H = k - 1;

  const rows = [];
  const digits = [];
  let U, low, high;
  for (;;) {
    const R0 = R, Mm0 = Mm, Mp0 = Mp;
    k--;
    const tenR = R * 10n;
    U = tenR / S;
    R = tenR % S;
    Mm *= 10n; Mp *= 10n;
    low = 2n * R < Mm;
    high = 2n * R > 2n * S - Mp;
    track(tenR, Mm, Mp);
    rows.push({ pos: k, R0, Mm0, Mp0, tenR, U, R, S, Mm, Mp, twoR: 2n * R, twoSminusMp: 2n * S - Mp, low, high });
    if (low || high) break;
    digits.push(U);
    if (rows.length > 400) throw new Error("runaway digit loop");
  }
  let last, rule;
  if (low && !high) { last = U; rule = "low"; }
  else if (high && !low) { last = U + 1n; rule = "high"; }
  else if (2n * R < S) { last = U; rule = "both-down"; }
  else if (2n * R > S) { last = U + 1n; rule = "both-up"; }
  else { last = U; rule = "both-tie"; }
  digits.push(last);

  let coefficient = 0n;
  for (const d of digits) coefficient = coefficient * 10n + d;
  const exp10 = k; // value = coefficient · 10^exp10
  return {
    input, unequal, init, afterUnequal, loop1, loop2, scaled, H, rows, rule,
    digits: digits.map(Number),
    lastDigit: Number(last),
    carry: last === 10n,
    leadingZero: digits[0] === 0n,
    coefficient, exp10,
    text: formatDecimal(coefficient, exp10),
    digitString: digits.map(String).join(""),
    maxBits,
  };
}

/** c · 10^e as a short decimal string (trailing zeros stripped). */
export function decimalText(c, e) {
  const n = normalize(c, e);
  return formatDecimal(n.coefficient, n.exp10).replace("e+", "e");
}

/** Dragon4 output as a decimal string without the "e+" plus sign. */
export function outputText(trace) {
  return trace.text.replace("e+", "e");
}

// ---------------------------------------------------------------- brute force (for tests and cross-checks)

/**
 * The shortest decimal strictly inside the rounding interval; among those of that
 * length the one closest to v (ties: the smaller).  Returns {coefficient, exp10}.
 */
export function bruteShortestStrict(input) {
  const nb = neighbourhood(input);
  const den = nb.v.den;
  const lo = nb.lower.num, hi = nb.upper.num, v = nb.v.num;
  // start well above the upper boundary
  let e = Math.ceil(Math.log10(ratio(hi, den))) + 1;
  for (;; e--) {
    // candidates c · 10^e with lo < c·10^e·den' < hi, all over den
    const [scaleNum, scaleDen] = e >= 0 ? [pow10(e), 1n] : [1n, pow10(-e)];
    // c·scaleNum/scaleDen > lo/den  ⇔  c > lo·scaleDen / (den·scaleNum)
    const first = floorDiv(lo * scaleDen, den * scaleNum) + 1n;
    const lastC = -floorDiv(-(hi * scaleDen), den * scaleNum) - 1n;
    if (first > lastC) continue;
    let best = null, bestDist = null;
    for (let c = first; c <= lastC; c++) {
      const diff = c * scaleNum * den - v * scaleDen; // (c·10^e − v)·den·scaleDen
      const dist = diff < 0n ? -diff : diff;
      if (best === null || dist < bestDist) { best = c; bestDist = dist; }
      if (lastC - first > 20n && c > first + 20n) break;
    }
    let c = best, x = e;
    while (c % 10n === 0n) { c /= 10n; x++; }
    return { coefficient: c, exp10: x };
  }
}

/** Normalize (strip trailing zeros) for comparisons. */
export function normalize(coefficient, exp10) {
  while (coefficient !== 0n && coefficient % 10n === 0n) { coefficient /= 10n; exp10++; }
  return { coefficient, exp10 };
}

/** Does the decimal c·10^e read back (round-to-nearest-even) as the given toy/double input? */
export function readsBackAs(coefficient, exp10, input) {
  if (input.kind === "double") return Number(`${coefficient}e${exp10}`) === input.value;
  const [num, den] = exp10 >= 0 ? [coefficient * pow10(exp10), 1n] : [coefficient, pow10(-exp10)];
  const r = roundToPrecision(num, den, input.p);
  return r.f === input.f && r.q === input.q;
}

/** JS's Number.prototype.toString digits for a double, normalized. */
export function jsDigits(x) {
  const d = parseDecimal(String(x));
  return normalize(d.coefficient, d.exponent);
}

// ---------------------------------------------------------------- microscope frames

/**
 * One frame per digit row (plus frame 0 = the starting ruler).  All positions are
 * fractions of the current cell [0, 1]; ticks sit at j/10.
 */
export function microscopeFrames(trace) {
  const { rows, digits, scaled, H } = trace;
  const S = scaled.S;
  const frames = [];
  const cellLabel = (prefix, pos, j) => formatDecimal(prefix * 10n + BigInt(j), pos).replace("e+", "e");
  const firstRow = rows[0];
  frames.push({
    index: 0,
    r: ratio(firstRow.R0, S), mMinus: ratio(firstRow.Mm0, 2n * S), mPlus: ratio(firstRow.Mp0, 2n * S),
    pos: firstRow.pos, prefix: 0n, left: "0", right: formatDecimal(1n, scaled.k).replace("e+", "e"),
    tickLabel: (j) => cellLabel(0n, firstRow.pos, j),
  });
  let prefix = 0n;
  rows.forEach((row, i) => {
    const pre = prefix;
    frames.push({
      index: i + 1,
      row,
      r: ratio(row.R0, S),
      mMinus: ratio(row.Mm0, 2n * S),
      mPlus: ratio(row.Mp0, 2n * S),
      rNext: ratio(row.R, S),
      U: Number(row.U),
      low: row.low,
      high: row.high,
      pos: row.pos,
      prefix: pre,
      left: cellLabel(pre, row.pos, 0),
      right: cellLabel(pre, row.pos, 10),
      tickLabel: (j) => cellLabel(pre, row.pos, j),
      final: i === rows.length - 1,
    });
    prefix = prefix * 10n + row.U;
  });
  frames.H = H;
  return frames;
}

// ---------------------------------------------------------------- worksheet tabs and presets

export const MICRO_PRESETS = [
  { id: "pi", label: "π", x: "pi", p: 8 },
  { id: "1.375", label: "1.375 (p=4)", x: "1.375", p: 4 },
  { id: "0.34375", label: "0.34375 (p=4)", x: "0.34375", p: 4 },
  { id: "0.125", label: "0.125 (p=4)", x: "0.125", p: 4 },
  { id: "0.3", label: "0.3 (double)", x: "0.3", p: 53 },
];

export const SHEETS = [
  { id: "1.375", label: "1.375", input: () => toyInput(11n, -3, 4), practice: true },
  { id: "0.34375", label: "0.34375", input: () => toyInput(11n, -5, 4), practice: true },
  { id: "3.140625", label: "3.140625", input: () => toyInput(201n, -6, 8), practice: true },
  { id: "0.125", label: "0.125", input: () => toyInput(8n, -6, 4), practice: true, variant: { symmetric: true } },
  { id: "96", label: "96", input: () => toyInput(12n, 3, 4), practice: true, variant: { scaleTest: "paper" } },
  { id: "0.3", label: "0.3 (double)", input: () => doubleInput(0.3), practice: false },
  { id: "1e-6", label: "1e-6 (double)", input: () => doubleInput(1e-6), practice: false, variant: { scaleTest: "v" } },
  { id: "2^64", label: "2⁶⁴ (double)", input: () => doubleInput(2 ** 64), practice: false, variant: { symmetric: true } },
];

export const COST_EXAMPLES = [5e-324, 2.2250738585072014e-308, 1e-6, 0.1, 123.456, 1e100, 1.7976931348623157e308];

/** Random finite positive double from uniformly random bit patterns. */
export function randomDouble(rand = Math.random) {
  for (;;) {
    const hi = Math.floor(rand() * 0x7ff00000); // exponent < 0x7ff
    const lo = Math.floor(rand() * 0x100000000);
    const bits = (BigInt(hi) << 32n) | BigInt(lo);
    if (bits === 0n) continue;
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, bits);
    return view.getFloat64(0);
  }
}

/** Compare strict Dragon4 with Number.prototype.toString for one double. */
export function compareWithJs(x) {
  const t = dragon4(doubleInput(x));
  const mine = normalize(t.coefficient, t.exp10);
  const js = jsDigits(x);
  const same = mine.coefficient === js.coefficient && mine.exp10 === js.exp10;
  return { same, mine, js, dragonText: outputText(t), jsText: String(x) };
}
