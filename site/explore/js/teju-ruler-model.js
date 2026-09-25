// Copyright (C) 2026 Toit contributors.
//
// Pure model for the "Exact floors on a decade ruler" Tejú Jaguá page.
//
// A BigInt port of the Tejú Jaguá runtime for binary64 (teju/src/teju.h,
// mshift.h, div10.h at https://github.com/cassioneri/teju_jagua, commit
// 4403283), instrumented so that the page can show every variable. The table
// row formula and the per-row exactness proof follow
// cpp/generator/generator.cpp. No DOM; importable from node.

import { decodeDouble } from "../../js/float.js";

export const W = 64n;
export const MASK = (1n << W) - 1n;
export const SHIFT = 2n * W; // mshift always divides by 2^128: keep the top word.
export const MW = 53; // teju_mantissa_width
export const EMIN = -1074; // teju_exponent_min
export const EMAX = 971;
export const MMIN = 1n << 52n; // mantissa_uncentred
export const MMAX = (1n << 53n) - 1n;
export const F_MIN = -324; // teju_storage_index_offset
export const F_MAX = 292;
export const LOG10_2_Q32 = 1292913987n; // ≈ log10(2) · 2^32

const POW10 = [1n];
export function pow10(k) {
  while (POW10.length <= k) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[k];
}

// ---------------------------------------------------------------------------
// Choosing the ruler: F = ⌊e·log10 2⌋ and the residual r = e − e0.
// ---------------------------------------------------------------------------

/** teju_log10_pow2: (int64)1292913987·e >> 32 (an arithmetic, flooring shift). */
export function log10pow2(e) {
  return Number((LOG10_2_Q32 * BigInt(e)) >> 32n);
}

/** teju_log10_pow2_residual: (uint32)(1292913987·e) / 1292913987. */
export function residual(e) {
  return Number(((LOG10_2_Q32 * BigInt(e)) & 0xffffffffn) / LOG10_2_Q32);
}

/** Every intermediate of the two one-line formulas, for display. */
export function rulerArithmetic(e) {
  const product = LOG10_2_Q32 * BigInt(e);
  const high = product >> 32n;
  const low = product & 0xffffffffn;
  return { e, product, F: Number(high), low, r: Number(low / LOG10_2_Q32) };
}

/** Smallest binary exponent e0 whose F equals the given F (the stair's first step). */
export function e0OfF(F) {
  let e = Math.floor(F / Math.log10(2)) - 3;
  while (log10pow2(e) < F) e++;
  return e;
}

/** The stair of decimal exponent F: the binary exponents that share its row. */
export function stairOf(F) {
  const e0 = e0OfF(F);
  const exps = [];
  for (let e = e0; log10pow2(e) === F; e++) exps.push(e);
  return { F, e0, exps };
}

/** Number of table rows whose stair has 3 and 4 binary exponents, over the table's F range. */
export function stairCounts() {
  const counts = { 3: 0, 4: 0 };
  for (let F = F_MIN; F <= F_MAX; F++) counts[stairOf(F).exps.length]++;
  return counts;
}

// ---------------------------------------------------------------------------
// The table: one 128-bit multiplier per decimal exponent F (generator.cpp).
// ---------------------------------------------------------------------------

/** 2^(e0−1) / 10^F in lowest terms, as [alpha, delta]. */
export function alphaDelta(F) {
  const e0 = e0OfF(F);
  return F <= 0
    ? [5n ** BigInt(-F), 1n << BigInt(-(e0 - 1 - F))]
    : [1n << BigInt(e0 - 1 - F), 5n ** BigInt(F)];
}

const ROWS = new Map();
/** Row F of the multiplier table: M = ⌊alpha·2^128/delta⌋ + 1. */
export function row(F) {
  if (F < F_MIN || F > F_MAX) throw new RangeError(`no table row for F = ${F}`);
  let entry = ROWS.get(F);
  if (!entry) {
    const [alpha, delta] = alphaDelta(F);
    const scaled = alpha << SHIFT;
    const M = scaled / delta + 1n;
    entry = { F, e0: e0OfF(F), alpha, delta, M, rem: scaled % delta, upper: M >> W, lower: M & MASK };
    ROWS.set(F, entry);
  }
  return entry;
}

/** The generator's proof for one row (get_maximum_1/2 of generator.cpp). */
const lt = (x, y) => x[0] * y[1] < y[0] * x[1];
const maxR = (x, y) => (lt(x, y) ? y : x);
const phi1 = (a, d, n) => [n, d - (a * n) % d];
const phi2 = (a, d, n) => [n, 1n + (a * n - 1n) % d];
function max1(a1, d1, L1, U1) {
  const m1 = phi1(a1, d1, U1);
  if (a1 === 0n || L1 === U1) return m1;
  const L2 = (a1 * L1) / d1 + 1n, U2 = (a1 * U1) / d1;
  if (L2 === U2 + 1n) return m1;
  const o = max2(d1 % a1, a1, L2, U2);
  return maxR(m1, [d1 * o[0] - o[1], a1 * o[1]]);
}
function max2(a2, d2, L2, U2) {
  if (a2 === 0n) return [U2, 1n];
  const m1 = phi2(a2, d2, L2);
  if (L2 === U2) return m1;
  const L1 = (a2 * L2 - 1n) / d2 + 1n, U1 = (a2 * U2 - 1n) / d2;
  if (L1 === U1 + 1n) return m1;
  const o = max1(d2 % a2, a2, L1, U1);
  return maxR(m1, [d2 * o[0] + o[1], a2 * o[1]]);
}

/** log2 of a positive BigInt, as a Number. */
export function log2Big(x) {
  const len = x.toString(2).length;
  if (len <= 53) return Math.log2(Number(x));
  return Math.log2(Number(x >> BigInt(len - 53))) + (len - 53);
}

/**
 * Proves that mshift(n, M) = ⌊n·alpha/delta⌋ for every n the runtime can pass
 * for row F: max over n of n / (delta − (alpha·n mod delta)) must stay below
 * 2^128 / (delta − rem). Returns the worst n and the margin in bits.
 */
export function proveRow(F) {
  const { alpha, delta, rem, e0 } = row(F);
  const a = alpha % delta;
  const isMin = e0 === e0OfF(log10pow2(EMIN));
  let worst = max1(a, delta, isMin ? 1n : 2n * MMIN + 1n, (4n * MMAX) << 3n);
  for (let r = 0n; r < 4n; r++) {
    for (const n of [(4n * MMIN - 1n) << r, (2n * MMIN + 1n) << r, (4n * MMIN) << r, (40n * MMIN) << r]) {
      worst = maxR(worst, phi1(a, delta, n));
    }
  }
  const limit = [1n << SHIFT, delta - rem];
  const ok = lt(worst, limit);
  const marginBits = log2Big(limit[0] * worst[1]) - log2Big(limit[1] * worst[0]);
  return { F, ok, worstN: worst[0], worstGap: worst[1], marginBits };
}

// ---------------------------------------------------------------------------
// The divisibility tables (minverse) and the helpers of teju.h.
// ---------------------------------------------------------------------------

export const INV5 = 0xcccccccccccccccdn; // 5 · INV5 ≡ 1 (mod 2^64)

/** minverse[f] = { multiplier: 5^−f mod 2^64, bound: ⌊2^64/5^f⌋ } (−1 for f = 0), while 5^f < 320·mmax. */
export const MINVERSE = (() => {
  const rows = [];
  const limit = 320n * MMAX;
  let mult = 1n, p5 = 1n;
  for (let f = 0; p5 < limit; f++) {
    rows.push({ f, pow5: p5, multiplier: mult, bound: (1n << W) / p5 - (f === 0 ? 1n : 0n) });
    mult = (mult * INV5) & MASK;
    p5 *= 5n;
  }
  return rows;
})();

export const canTestPow5 = (f) => f >= 0 && f < MINVERSE.length;
export const mulMod64 = (x, y) => (x * y) & MASK;
export const isMultipleOfPow5 = (f, n) => mulMod64(n, MINVERSE[f].multiplier) <= MINVERSE[f].bound;
export const isTie = (f, n) => canTestPow5(f) && isMultipleOfPow5(f, n);
export const isTieUncentred = (f, n) => n % 5n === 0n && isTie(f, n);
export const ror64 = (n) => ((n << 63n) | (n >> 1n)) & MASK;
export const mshift = (n, M) => (n * M) >> SHIFT;
export const mshiftPow2 = (k, M) => (M << BigInt(k)) >> SHIFT;
export const div10 = (n) => (n * (MASK / 10n + 1n)) >> W; // Neri–Schneider Theorem 4
const even = (n) => (n & 1n) === 0n;

export const RTZ_BOUND = MASK / 10n + 1n;
/** remove_trailing_zeros with a record of every iteration. */
export function removeTrailingZeros(f, m) {
  const iterations = [];
  for (;;) {
    const product = mulMod64(m, INV5);
    const q = ror64(product);
    const ok = q < RTZ_BOUND;
    iterations.push({ m, product, q, ok });
    if (!ok) return { c: m, f, iterations };
    f++;
    m = q;
  }
}

// ---------------------------------------------------------------------------
// Exact rationals (for drawing only: Tejú never computes these).
// ---------------------------------------------------------------------------

/** N·2^k / 10^G as { n, d }. */
export function scaled(N, k, G) {
  let n = N, d = 1n;
  if (k >= 0) n <<= BigInt(k); else d <<= BigInt(-k);
  if (G >= 0) d *= pow10(G); else n *= pow10(-G);
  return { n, d };
}

export const floorR = (r) => (r.n >= 0n ? r.n / r.d : -((-r.n + r.d - 1n) / r.d));
export const isIntR = (r) => r.n % r.d === 0n;
export const cmpR = (x, y) => {
  const l = x.n * y.d, rr = y.n * x.d;
  return l < rr ? -1 : l > rr ? 1 : 0;
};

/** Offset of rational r from the integer origin, as a Number. */
export function offsetR(r, origin) {
  const num = r.n - origin * r.d;
  const SC = 1000000n;
  return Number((num * SC) / r.d) / 1e6;
}

/** "9999999999999999.861…" (digits after the point, … when inexact). */
export function fmtR(r, digits = 3) {
  const int = floorR(r);
  let rem = r.n - int * r.d;
  if (rem === 0n) return int.toString();
  let frac = "";
  for (let i = 0; i < digits && rem !== 0n; i++) {
    rem *= 10n;
    frac += (rem / r.d).toString();
    rem %= r.d;
  }
  return `${int}.${frac}${rem !== 0n ? "…" : ""}`;
}

// ---------------------------------------------------------------------------
// The runtime, traced.
// ---------------------------------------------------------------------------

/** e and m of a positive finite double, in Tejú's convention x = m·2^e. */
export function decode(x) {
  const d = decodeDouble(x);
  return { e: d.exponent, m: d.significand < 0n ? -d.significand : d.significand };
}

function isSmallInteger(e, m) {
  return 0 <= -e && -e < MW && (m >> BigInt(-e)) << BigInt(-e) === m;
}

/**
 * Runs teju_to_decimal on x > 0 and records every variable. `route` is one of
 * small-int, centred-shortest, centred-closest, unc-shortest, unc-c-eq-a,
 * unc-closest, unc-refined-tie, unc-refined.
 */
export function run(x) {
  const { e, m } = decode(x);
  const t = { x, e, m, closed: even(m), small: isSmallInteger(e, m) };
  if (t.small) {
    const n = m >> BigInt(-e);
    Object.assign(t, { route: "small-int", n, rtz: removeTrailingZeros(0, n) });
    t.result = { c: t.rtz.c, f: t.rtz.f };
    return finish(t);
  }
  t.centred = m !== MMIN || e === EMIN;
  const F = log10pow2(e), r = residual(e), R = row(F);
  Object.assign(t, { F, r, e0: e - r, M: R.M, allowsTies: canTestPow5(F) });
  const rb = BigInt(r);
  // Exact interval ends and x in units of 10^F.
  t.upperR = scaled(2n * m + 1n, e - 1, F);
  t.lowerR = t.centred ? scaled(2n * m - 1n, e - 1, F) : scaled(4n * m - 1n, e - 2, F);
  t.xR = scaled(m, e, F);

  if (t.centred) {
    const mb = (2n * m + 1n) << rb, ma = (2n * m - 1n) << rb;
    const b = mshift(mb, R.M), a = mshift(ma, R.M), q = div10(b), s = 10n * q;
    Object.assign(t, { mb, ma, b, a, q, s });
    t.tieB = isTie(F, mb);
    t.tieA = isTie(F, ma);
    t.shortest = decideShortest(t, s === b ? "b" : s === a ? "a" : "gt");
    if (t.shortest) {
      t.route = "centred-shortest";
      t.rtz = removeTrailingZeros(F + 1, q);
      t.result = { c: t.rtz.c, f: t.rtz.f };
      return finish(t);
    }
    t.mc = (4n * m) << rb;
    closest(t, mshift(t.mc, R.M), F);
    t.route = "centred-closest";
    t.result = { c: t.c + (t.pickLeft ? 0n : 1n), f: F };
    return finish(t);
  }

  // Uncentred: m = 2^52, the lower neighbour is half as far away.
  const ma = (4n * m - 1n) << rb, mb = (2n * m + 1n) << rb;
  const b = mshift(mb, R.M), a = mshift(ma, R.M) / 2n, q = div10(b), s = 10n * q;
  Object.assign(t, { ma, mb, b, a, q, s, sorted: a < b });
  t.tieB = isTieUncentred(F, mb);
  t.tieA = isTieUncentred(F, ma);
  if (a < b) {
    t.shortest = decideShortest(t, s === b ? "b" : s === a ? "a" : "gt");
    if (t.shortest) {
      t.route = "unc-shortest";
      t.rtz = removeTrailingZeros(F + 1, q);
      t.result = { c: t.rtz.c, f: t.rtz.f };
      return finish(t);
    }
    t.log2mc = MW + r + 1;
    t.mc = 1n << BigInt(t.log2mc);
    const c2 = mshiftPow2(t.log2mc, R.M);
    t.c2 = c2;
    t.c = c2 / 2n;
    t.cIsA = t.c === a;
    if (t.cIsA && !t.tieA) {
      t.route = "unc-c-eq-a";
      t.result = { c: t.c + 1n, f: F };
      return finish(t);
    }
    closest(t, c2, F);
    t.route = "unc-closest";
    t.result = { c: t.c + (t.pickLeft ? 0n : 1n), f: F };
    return finish(t);
  }
  // a >= b: no tick of 10^F inside (unless the lower end is one, exactly).
  if (t.tieA && even(m)) {
    t.route = "unc-refined-tie";
    t.rtz = removeTrailingZeros(F, a);
    t.result = { c: t.rtz.c, f: t.rtz.f };
    return finish(t);
  }
  t.route = "unc-refined";
  t.mc = (40n * m) << rb;
  t.upperR1 = scaled(2n * m + 1n, e - 1, F - 1);
  t.lowerR1 = scaled(4n * m - 1n, e - 2, F - 1);
  t.xR1 = scaled(m, e, F - 1);
  closest(t, mshift(t.mc, R.M), F);
  t.result = { c: t.c + (t.pickLeft ? 0n : 1n), f: F - 1 };
  return finish(t);
}

function decideShortest(t, which) {
  t.sCase = which;
  if (!t.allowsTies) return t.s > t.a;
  if (which === "b") return !t.tieB || t.closed;
  if (which === "a") return t.tieA && t.closed;
  return t.s > t.a;
}

function closest(t, c2, F) {
  t.c2 = c2;
  t.c = c2 / 2n;
  t.tieC = isTie(-F, c2);
  t.closerLeft = even(c2);
  t.pickLeft = (t.tieC && even(t.c)) || t.closerLeft;
}

function finish(t) {
  t.text = formatJs(t.result.c, t.result.f);
  t.js = String(t.x);
  t.match = sameDecimal(t.result, parseJs(t.js));
  return t;
}

/** Digits and exponent of a Number#toString output, trailing zeros removed. */
export function parseJs(text) {
  const mm = text.match(/^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/);
  if (!mm) return null;
  let digits = (mm[1] + (mm[2] || "")).replace(/^0+/, "") || "0";
  let f = Number(mm[3] || 0) - (mm[2] || "").length;
  while (digits.length > 1 && digits.endsWith("0")) { digits = digits.slice(0, -1); f++; }
  return { c: BigInt(digits), f };
}

/** Normalise (c, f) by stripping zeros, then compare. */
export function sameDecimal(x, y) {
  if (!x || !y) return false;
  const norm = ({ c, f }) => { while (c !== 0n && c % 10n === 0n) { c /= 10n; f++; } return `${c}e${f}`; };
  return norm(x) === norm(y);
}

/** Format c·10^f the way Number#toString would. */
export function formatJs(c, f) {
  const digits = c.toString();
  const k = digits.length, n = k + f;
  if (k <= n && n <= 21) return digits + "0".repeat(n - k);
  if (0 < n && n <= 21) return `${digits.slice(0, n)}.${digits.slice(n)}`;
  if (-6 < n && n <= 0) return `0.${"0".repeat(-n)}${digits}`;
  const exp = n - 1;
  return `${digits[0]}${k > 1 ? `.${digits.slice(1)}` : ""}e${exp >= 0 ? "+" : "-"}${Math.abs(exp)}`;
}

// ---------------------------------------------------------------------------
// "What-if" decades for the ruler-picking figure.
// ---------------------------------------------------------------------------

/** Interval of x on a hypothetical ruler with ticks 10^D: width and tick counts. */
export function decadeView(x, D) {
  const { e, m } = decode(x);
  const centred = m !== MMIN || e === EMIN;
  const upper = scaled(2n * m + 1n, e - 1, D);
  const lower = centred ? scaled(2n * m - 1n, e - 1, D) : scaled(4n * m - 1n, e - 2, D);
  const closed = even(m);
  // Ticks inside: integers k with lower ≤ k ≤ upper (strict when open).
  let first = floorR(lower) + 1n;
  if (closed && isIntR(lower)) first -= 1n;
  let last = floorR(upper);
  if (!closed && isIntR(upper)) last -= 1n;
  const ticks = last >= first ? last - first + 1n : 0n;
  const fd = (v) => (v >= 0n ? v / 10n : -((-v + 9n) / 10n));
  const longFirst = -fd(-first); // ceil(first/10)
  const longLast = fd(last);
  const longTicks = ticks > 0n && longLast >= longFirst ? longLast - longFirst + 1n : 0n;
  const width = { n: upper.n * lower.d - lower.n * upper.d, d: upper.d * lower.d };
  return { e, m, D, centred, closed, upper, lower, x: scaled(m, e, D), width, ticks, longTicks, first, last };
}

// ---------------------------------------------------------------------------
// The 8-bit clock of the divisibility aside.
// ---------------------------------------------------------------------------

export const INV5_8 = 205; // 5 · 205 = 1025 ≡ 1 (mod 256)
export const clockMul = (n) => (n * INV5_8) & 255;
export const clockRor = (p) => ((p >> 1) | ((p & 1) << 7)) & 255;
export const CLOCK_BOUND5 = 51; // ⌊256/5⌋: multiples of 5 land on 0..51
export const CLOCK_BOUND10 = 26; // ⌊255/10⌋ + 1: after ror, multiples of 10 land below 26

// ---------------------------------------------------------------------------
// Input parsing and presets.
// ---------------------------------------------------------------------------

export const PRESETS = [
  { label: "0.1", text: "0.1", route: "shortest" },
  { label: "0.30000000000000004", text: "0.1+0.2", route: "closest" },
  { label: "2/3", text: "2/3", route: "closest" },
  { label: "5e-324", text: "5e-324", route: "closest, odd c₂" },
  { label: "1e23", text: "1e23", route: "tie" },
  { label: "2^60", text: "2^60", route: "uncentred" },
  { label: "2^53", text: "2^53", route: "uncentred" },
  { label: "2^-1011", text: "2^-1011", route: "one decade finer" },
  { label: "123", text: "123", route: "small integer" },
];

const NUM = String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
/** Parse "0.1", "1e23", "2^-1011", "2/3", "0.1+0.2", "3*0.1". Returns { value } or { error }. */
export function parseInput(text) {
  const s = String(text).replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/\*\*/g, "^");
  let value = null;
  let mm;
  if (new RegExp(`^-?${NUM}$`, "i").test(s)) value = Number(s);
  else if ((mm = s.match(/^(\d+)\^(-?\d+)$/))) value = Number(mm[1]) ** Number(mm[2]);
  else if ((mm = s.match(new RegExp(`^(${NUM})([-+*/])(${NUM})$`, "i")))) {
    const l = Number(mm[1]), r = Number(mm[3]);
    value = mm[2] === "+" ? l + r : mm[2] === "-" ? l - r : mm[2] === "*" ? l * r : l / r;
  }
  if (value === null || Number.isNaN(value)) return { error: "Type a number such as 0.1, 1e23, 2^-1011, 2/3 or 0.1+0.2." };
  if (!Number.isFinite(value)) return { error: "That is not a finite double." };
  if (value === 0) return { error: "Tejú Jaguá only handles x > 0 (zero is printed without it)." };
  return { value: Math.abs(value), negative: value < 0 };
}

/** Label for URLs / the input box: the shortest round-trip text of x. */
export const labelOf = (x) => String(x);

export const ROUTE_NAMES = {
  "small-int": "small integer",
  "centred-shortest": "centred · shorter tick s accepted",
  "centred-closest": "centred · closest tick of 10^F",
  "unc-shortest": "uncentred · shorter tick s accepted",
  "unc-c-eq-a": "uncentred · c is below the interval, take c + 1",
  "unc-closest": "uncentred · closest tick of 10^F",
  "unc-refined-tie": "uncentred · lower end is exactly a tick",
  "unc-refined": "uncentred · no tick inside, one decade finer",
};
