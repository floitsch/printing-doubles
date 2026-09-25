// Copyright (C) 2026 Toit contributors.

// Pure model for the Errol "microscope" lab page. No DOM.
//
// - A bit-exact port of the double-double ("HP") path of Errol
//   (github.com/marcandrysco/Errol, lib/errol.c at 5364de4): errol3u's fast
//   path and Errol1's narrowed variant, with trace hooks.
// - The 600-entry power-of-ten table of lookup.h, regenerated with BigInt.
// - The 432 inputs of enum3.h (Errol3's exception table) and the routing
//   errol3_dtoa applies before it ever reaches the double-double path.
// - Exact BigInt rationals for the microscope: interval ends, nearby short
//   decimals, and where the double-double arithmetic actually put a boundary.

import { bitsOf, fromBits, decodeDouble, nextUp, nextDown, formatDecimal } from "../../js/float.js";
import { intervalOf, shortestDecimal, rationalOfDouble } from "../../js/oracle.js";

// ---------------------------------------------------------------------------
// Exact rationals {n, d} with BigInt n and d > 0 (not reduced).

export const Q = (n, d = 1n) => ({ n: BigInt(n), d: BigInt(d) });
export const qAdd = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
export const qSub = (a, b) => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
export const qMul = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
export const qDiv = (a, b) => (b.n < 0n ? { n: -a.n * b.d, d: a.d * -b.n } : { n: a.n * b.d, d: a.d * b.n });
export const qCmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
export const qAbs = (a) => (a.n < 0n ? { n: -a.n, d: a.d } : a);
export const qSign = (a) => (a.n < 0n ? -1 : a.n > 0n ? 1 : 0);
export const qIsZero = (a) => a.n === 0n;

const POW10 = [1n];
export function pow10(k) {
  while (POW10.length <= k) POW10.push(POW10.at(-1) * 10n);
  return POW10[k];
}
export const qPow10 = (k) => (k >= 0 ? Q(pow10(k)) : Q(1n, pow10(-k)));
export const qPow2 = (k) => (k >= 0 ? Q(1n << BigInt(k)) : Q(1n, 1n << BigInt(-k)));

export function qOfDouble(x) {
  if (x === 0) return Q(0n);
  const r = rationalOfDouble(decodeDouble(x));
  return Q(r.numerator, r.denominator);
}
export const qOfDD = (h) => qAdd(qOfDouble(h.val), qOfDouble(h.off));

// Approximate a rational as a double (only used for positions and short
// readouts; ~64 correct bits before the final rounding to a double).
export function qToNumber(a) {
  if (a.n === 0n) return 0;
  const neg = a.n < 0n;
  const n = neg ? -a.n : a.n;
  const shift = BigInt(Math.max(0, 80 - (n.toString(2).length - a.d.toString(2).length)));
  const q = (n << shift) / a.d;
  const x = Number(q) / 2 ** Number(shift);
  return neg ? -x : x;
}

// log10 of |a| (approximate, but fine for choosing scales).
export function qLog10(a) {
  const n = a.n < 0n ? -a.n : a.n;
  if (n === 0n) return -Infinity;
  const digitsLog = (b) => { const s = b.toString(); return s.length - 1 + Math.log10(Number(`0.${s.slice(0, 17)}`) * 10); };
  return digitsLog(n) - digitsLog(a.d);
}

// Exact decimal of a rational whose denominator has only factors 2 and 5.
// Returns { digits, point } meaning 0.digits × 10^point, digits without
// leading/trailing zeros, or null if the expansion is infinite.
export function qDecimal(a) {
  if (a.n === 0n) return { neg: false, digits: "0", point: 1 };
  let d = a.d; let twos = 0; let fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n && a.n % d !== 0n) return null;
  const neg = a.n < 0n;
  let n = (neg ? -a.n : a.n) / d;
  const k = Math.max(twos, fives);
  n *= 2n ** BigInt(k - twos) * 5n ** BigInt(k - fives);
  // value = n / 10^k
  let s = n.toString();
  let point = s.length - k;
  s = s.replace(/0+$/, "");
  return { neg, digits: s, point };
}

// Scientific string of an exact decimal rational with at most maxDigits
// significant digits (truncated with "…" when longer).
export function qSci(a, maxDigits = 60) {
  const dec = qDecimal(a);
  if (!dec) return "(not a finite decimal)";
  if (dec.digits === "0") return "0";
  const cut = dec.digits.length > maxDigits;
  const body = cut ? dec.digits.slice(0, maxDigits) : dec.digits;
  const mant = body.length > 1 ? `${body[0]}.${body.slice(1)}` : body;
  return `${dec.neg ? "−" : ""}${mant}${cut ? "…" : ""}e${dec.point - 1}`;
}

// Significant digits of an integer coefficient (trailing zeros stripped).
export function sigDigits(k) {
  let s = (k < 0n ? -k : k).toString();
  s = s.replace(/0+$/, "");
  return s.length || 1;
}

// ---------------------------------------------------------------------------
// Double-double ("HP") arithmetic, exactly as in errol.c.

const HI_MASK = 0xFFFFFFFFF8000000n;
export const fpnext = (d) => fromBits(bitsOf(d) + 1n);
export const fpprev = (d) => fromBits(bitsOf(d) - 1n);
const gethi = (d) => fromBits(bitsOf(d) & HI_MASK);

export function hpNormalize(h) {
  const v = h.val;
  h.val += h.off;
  h.off += v - h.val;
}

// Returns the details of the step so the loom can show where the rounding
// loss went: rounded = fl(10·val), loss = rounded − 10·val (computed exactly
// as (rounded − 8·val) − 2·val), offBefore = fl(10·off) − loss.
export function hpMul10(h) {
  const val = h.val;
  const before = { val: h.val, off: h.off };
  h.val *= 10.0;
  h.off *= 10.0;
  let off = h.val;
  off -= val * 8.0;
  off -= val * 2.0;
  h.off -= off;
  const unnormalized = { val: h.val, off: h.off };
  hpNormalize(h);
  return { op: "mul10", before, rounded: unnormalized.val, loss: off, unnormalized, after: { val: h.val, off: h.off } };
}

export function hpDiv10(h) {
  let val = h.val;
  const before = { val: h.val, off: h.off };
  h.val /= 10.0;
  h.off /= 10.0;
  val -= h.val * 8.0;
  val -= h.val * 2.0;
  h.off += val / 10.0;
  const unnormalized = { val: h.val, off: h.off };
  hpNormalize(h);
  // val here = before.val − 10·fl(before.val/10): the part the division lost.
  return { op: "div10", before, rounded: unnormalized.val, loss: val, unnormalized, after: { val: h.val, off: h.off } };
}

export function hpProd(inp, val) {
  const hi = gethi(inp.val); const lo = inp.val - hi;
  const hi2 = gethi(val); const lo2 = val - hi2;
  const p = inp.val * val;
  const e = ((hi * hi2 - p) + lo * hi2 + hi * lo2) + lo * lo2;
  return { val: p, off: inp.off * val + e };
}

// ---------------------------------------------------------------------------
// lookup.h: entry i holds 10^(308−i) as (nearest double, nearest double to
// the residual). Regenerated here with BigInt.

export const LOOKUP_LEN = 600;
const LOOKUP = [];
export function lookupEntry(i) {
  if (LOOKUP[i]) return LOOKUP[i];
  const k = 308 - i;
  const val = Number(`1e${k}`);
  const residual = qSub(qPow10(k), qOfDouble(val));
  const off = residualToDouble(residual);
  return (LOOKUP[i] = { val, off, k });
}
function residualToDouble(r) {
  if (r.n === 0n) return 0;
  const dec = qDecimal(r);
  return Number(`${dec.neg ? "-" : ""}0.${dec.digits}e${dec.point}`);
}

// frexp exponent: x = f·2^e with f in [0.5, 1).
export function frexpExp(x) {
  const b = bitsOf(x);
  const e = Number((b >> 52n) & 0x7ffn);
  if (e === 0) {
    let m = b & ((1n << 52n) - 1n); let n = 0;
    while (!(m & (1n << 52n))) { m <<= 1n; n++; }
    return -1021 - n;
  }
  return e - 1022;
}

// ---------------------------------------------------------------------------
// The double-double path.
//
// options.variant: "errol3" (errol3u: exact midpoints, no narrowing) or
//                  "errol1" (narrowed interval, divisor 2 + ε, plus the
//                  widened interval for the optimality flag).
// options.negFix:  keep the "integer val with negative off" digit fix
//                  (default true; the loom lets the reader delete it).
// options.lastDigit: "round" (current code: round-half-even of the middle)
//                  or "hdig" (paper-era code: the high boundary's digit).
//
// The result carries a trace (for the loom) and, for every digit step, the
// exact boundary values the two double-double numbers stand for at that
// moment (for the microscope).

export const ERROL1_EPSILON = 8.77e-15;

export function errolDD(v, options = {}) {
  const variant = options.variant || "errol3";
  const negFix = options.negFix !== false;
  const lastDigit = options.lastDigit || "round";
  const trace = [];
  // DBL_MAX: next(v) is infinite, the boundary arithmetic overflows (Errol3
  // keeps DBL_MAX in its table for exactly this reason).
  if (!Number.isFinite(fpnext(v))) return { overflow: true, digits: "", exp: 0, opt: false, trace, steps: [], variant };
  const e2 = frexpExp(v);
  const raw = Math.trunc(307 + e2 * 0.30103);
  let idx = raw;
  if (idx < 20) idx = 20; else if (idx >= LOOKUP_LEN) idx = LOOKUP_LEN - 1;
  const entry = lookupEntry(idx);
  trace.push({ kind: "index", v, e2, raw, idx, k: entry.k, entry: { val: entry.val, off: entry.off } });
  const mid = hpProd(entry, v);
  const lten = entry.val;
  let ten = 1.0;
  trace.push({ kind: "prod", mid: { ...mid }, k: entry.k });
  let exp = idx - 307;
  const fix = [];
  while (mid.val > 10.0 || (mid.val === 10.0 && mid.off >= 0.0)) { exp++; fix.push(hpDiv10(mid)); ten /= 10.0; }
  while (mid.val < 1.0 || (mid.val === 1.0 && mid.off < 0.0)) { exp--; fix.push(hpMul10(mid)); ten *= 10.0; }
  if (fix.length) trace.push({ kind: "fix", steps: fix, mid: { ...mid }, exp, ten });

  const upGap = (fpnext(v) - v) * lten * ten;
  const downGap = (fpprev(v) - v) * lten * ten;
  const div = variant === "errol1" ? 2.0 + ERROL1_EPSILON : 2.0;
  const high = { val: mid.val, off: mid.off + upGap / div };
  const low = { val: mid.val, off: mid.off + downGap / div };
  const beforeNorm = { high: { ...high }, low: { ...low } };
  hpNormalize(high); hpNormalize(low);
  let outhi = null; let outlo = null;
  if (variant === "errol1") {
    outhi = { val: mid.val, off: mid.off + upGap / (2.0 - ERROL1_EPSILON) };
    outlo = { val: mid.val, off: mid.off + downGap / (2.0 - ERROL1_EPSILON) };
    hpNormalize(outhi); hpNormalize(outlo);
  }
  trace.push({ kind: "bounds", mid: { ...mid }, upTerm: upGap / div, downTerm: downGap / div, beforeNorm, high: { ...high }, low: { ...low }, exp, ten, lten });

  const rescale = [];
  while (high.val > 10.0 || (high.val === 10.0 && high.off >= 0.0)) {
    exp++; rescale.push("div10"); hpDiv10(high); hpDiv10(low);
    if (outhi) { hpDiv10(outhi); hpDiv10(outlo); }
  }
  while (high.val < 1.0 || (high.val === 1.0 && high.off < 0.0)) {
    exp--; rescale.push("mul10"); hpMul10(high); hpMul10(low);
    if (outhi) { hpMul10(outhi); hpMul10(outlo); }
  }
  if (rescale.length) trace.push({ kind: "rescale", ops: rescale, high: { ...high }, low: { ...low }, exp });

  const digitOf = (h) => {
    const t = Math.trunc(h.val) & 0xff; // (uint8_t) cast
    const fixes = negFix && h.val === t && h.off < 0;
    return { trunc: t, digit: fixes ? t - 1 : t, fixed: fixes };
  };

  let s = "";
  let opt = true;
  const steps = [];
  for (let guard = 0; guard < 40; guard++) {
    if (variant === "errol1" && high.val === 0.0 && high.off === 0.0) break;
    const h = digitOf(high); const l = digitOf(low);
    const step = { kind: "digit", index: s.length + 1, prefix: s, high: { ...high }, low: { ...low }, hdig: h.digit, ldig: l.digit, htrunc: h.trunc, ltrunc: l.trunc, hfixed: h.fixed, lfixed: l.fixed, same: h.digit === l.digit };
    steps.push(step);
    trace.push(step);
    if (h.digit !== l.digit) break;
    s += h.digit;
    high.val -= h.digit; low.val -= l.digit;
    step.mulHigh = hpMul10(high); step.mulLow = hpMul10(low);
    if (outhi) {
      const oh = digitOf(outhi); const ol = digitOf(outlo);
      if (oh.digit !== ol.digit) opt = false;
      outhi.val -= oh.digit; outlo.val -= ol.digit;
      hpMul10(outhi); hpMul10(outlo);
    }
  }
  const tmp = (high.val + low.val) / 2.0;
  let mdig;
  if (variant === "errol1") {
    mdig = Math.trunc(tmp + 0.5) & 0xff;
  } else {
    mdig = Math.trunc(tmp + 0.5) & 0xff;
    if ((mdig - tmp) === 0.5 && (mdig & 1)) mdig--;
  }
  const hdigLast = digitOf(high).digit;
  const chosen = lastDigit === "hdig" ? hdigLast : mdig;
  trace.push({ kind: "last", high: { ...high }, low: { ...low }, tmp, mdig, hdig: hdigLast, chosen, lastDigit });
  const digits = s + chosen;
  // Exact boundary values represented at each digit step:
  // B = (10·prefix + (val + off)) · 10^(exp − 1 − (index − 1)).
  for (const st of steps) {
    const p = Q(st.prefix ? BigInt(st.prefix) : 0n);
    const scale = qPow10(exp - st.index);
    st.highValue = qMul(qAdd(qMul(p, Q(10n)), qOfDD(st.high)), scale);
    st.lowValue = qMul(qAdd(qMul(p, Q(10n)), qOfDD(st.low)), scale);
  }
  return { digits, exp, opt, trace, steps, variant };
}

// Value of Errol's output "0.d1d2… × 10^exp" as text, and as a number.
export function outputText(digits, exp) {
  if (!digits || /[^0-9]/.test(digits)) return null;
  const k = BigInt(digits);
  return formatDecimal(k, exp - digits.length);
}
export function outputNumber(digits, exp) {
  if (!digits || /[^0-9]/.test(digits)) return NaN;
  return Number(`0.${digits}e${exp}`);
}

// ---------------------------------------------------------------------------
// Errol3 routing (errol3_dtoa at 5364de4): table, then integer / fixed
// ranges, then the double-double path.

export const INT_LOW = 9.007199254740992e15; // 2^53
export const INT_HIGH = 3.40282366920938e+38; // just below 2^128

export function route(v) {
  const hit = enum3Lookup(v);
  if (hit) return { path: "table", ...hit };
  if (v > INT_LOW && v < INT_HIGH) return { path: "int" };
  if (v >= 16.0 && v <= INT_LOW) return { path: "fixed" };
  return { path: "dd" };
}

let ENUM3 = null;
export function enum3Entries() {
  if (!ENUM3) {
    ENUM3 = new Map();
    for (const item of ENUM3_DATA.split(";")) {
      const [hex, digits, exp] = item.split(",");
      ENUM3.set(BigInt(`0x${hex}`), { digits, exp: Number(exp) });
    }
  }
  return ENUM3;
}
export function enum3Lookup(v) {
  const e = enum3Entries().get(bitsOf(v));
  return e ? { digits: e.digits, exp: e.exp } : null;
}

// ---------------------------------------------------------------------------
// The microscope: exact picture of one double's rounding interval.

export function outputOf(v) {
  const s = shortestDecimal(v);
  const digits = s.coefficient.toString().replace(/0+$/, "");
  return { text: s.text, coefficient: s.coefficient, exponent: s.exponent, digits: s.digits, sig: digits.length };
}

// Classify a decimal (rational) against the exact interval.
export function sideOf(c, iv) {
  const lo = qCmp(c, iv.lower); const hi = qCmp(c, iv.upper);
  if (lo === 0 || hi === 0) return iv.closed ? "on-closed" : "on-open";
  return lo > 0 && hi < 0 ? "inside" : "outside";
}

// For a boundary B and a grid 10^q, the grid points just below and above B.
function gridAround(B, q) {
  const unit = qPow10(q);
  const t = qDiv(B, unit);
  let f = t.n / t.d; if (t.n < 0n && t.n % t.d !== 0n) f--;
  const exact = t.n % t.d === 0n;
  const list = [f];
  if (!exact) list.push(f + 1n);
  return list.map((k) => ({ k, q, value: qMul(Q(k), unit) }));
}

export function analyze(v) {
  const d = decodeDouble(v);
  if (d.special || v <= 0) throw new RangeError("Enter a positive, finite double.");
  const ivr = intervalOf(v);
  const iv = {
    lower: Q(ivr.lower.numerator, ivr.lower.denominator),
    upper: Q(ivr.upper.numerator, ivr.upper.denominator),
    center: Q(ivr.center.numerator, ivr.center.denominator),
    closed: ivr.closed,
  };
  const up = nextUp(v);
  const down = nextDown(v);
  const vPrev = qOfDouble(down);
  const vNext = Number.isFinite(up) ? qOfDouble(up) : qAdd(iv.center, qSub(iv.center, vPrev));
  const ulp = qSub(vNext, iv.center);
  const out = outputOf(v);

  // Candidates: decimals with at most as many significant digits as the
  // answer, just inside or just outside each boundary.
  const cands = [];
  for (const [name, B] of [["lower", iv.lower], ["upper", iv.upper]]) {
    const top = Math.floor(qLog10(B) + 1e-12);
    for (let n = 1; n <= out.sig; n++) {
      for (let dq = -1; dq <= 1; dq++) {
        const q = top + dq - n + 1;
        for (const g of gridAround(B, q)) {
          if (g.k <= 0n) continue;
          const sig = sigDigits(g.k);
          if (sig > out.sig) continue;
          const dist = qAbs(qSub(g.value, B));
          cands.push({ ...g, sig, boundary: name, dist, side: sideOf(g.value, iv) });
        }
      }
    }
  }
  // Nearest (in absolute distance) wins; ties prefer fewer digits.
  const keyOf = (c) => `${c.value.n * 1n}/${c.value.d}`;
  const seen = new Set();
  const unique = cands.filter((c) => { const key = `${c.boundary}:${keyOf(c)}`; if (seen.has(key)) return false; seen.add(key); return true; });
  unique.sort((a, b) => qCmp(a.dist, b.dist) || a.sig - b.sig);
  const focus = unique[0];
  // Normalise the candidate to its shortest coefficient/exponent.
  let k = focus.k; let q = focus.q;
  while (k % 10n === 0n) { k /= 10n; q++; }
  const candidate = { ...focus, k, q, text: formatDecimal(k, q) };

  const dd = errolDD(v, { variant: "errol3" });
  const dd1 = errolDD(v, { variant: "errol1" });
  const r = route(v);
  return { v, iv, vPrev, vNext, ulp, out, candidate, candidates: unique, dd, dd1, route: r };
}

// The double-double boundary that decided the digit at the candidate's last
// position (or the last comparison, if the loop stopped earlier).
export function computedBoundary(a, run = a.dd, which = a.candidate.boundary) {
  const steps = run.steps;
  if (!steps || !steps.length) return null;
  const pos = run.exp - a.candidate.q; // 1-based digit index of the candidate's last digit
  const i = Math.min(Math.max(pos, 1), steps.length) - 1;
  const st = steps[i];
  return { step: st.index, value: which === "lower" ? st.lowValue : st.highValue };
}

// Band half-widths (exact rationals) for the precision selector.
export const PRECISIONS = {
  53: { label: "53 bits (plain double)", factor: qPow2(-53) },
  64: { label: "64 bits (Grisu-like)", factor: qPow2(-64) },
  106: { label: "106 bits (Errol)", factor: qMul(Q(79n), qPow2(-106)) },
  exact: { label: "exact", factor: Q(0n) },
};
export function bandHalfWidth(B, precision) {
  return qMul(qAbs(B), PRECISIONS[precision].factor);
}

// Verdict for one precision: safe, near miss or exact hit.
export function verdict(a, precision) {
  const B = a.candidate.boundary === "lower" ? a.iv.lower : a.iv.upper;
  const dist = qAbs(qSub(a.candidate.value, B));
  const w = bandHalfWidth(B, precision);
  if (qIsZero(dist)) return { kind: "hit", dist, w };
  if (precision === "exact") return { kind: "exact", dist, w };
  return { kind: qCmp(dist, w) > 0 ? "safe" : "near", dist, w };
}

// Whether a digit string round-trips and whether it is as short as possible.
export function judge(v, digits, exp) {
  const x = outputNumber(digits, exp);
  const text = outputText(digits, exp);
  const out = outputOf(v);
  const roundTrips = x === v;
  const len = digits ? digits.replace(/0+$/, "").length : 0;
  return { text, roundTrips, shortest: roundTrips && len === out.sig, len, best: out.text, bestLen: out.sig };
}

// ---------------------------------------------------------------------------
// Bits of a double-double, for the loom's bit strips.
// Returns the binary exponent of the leading bit of val and, for each of val
// and off, the list of set-bit positions (absolute binary exponents).

export function bitPositions(x) {
  if (x === 0) return { top: null, bits: [], neg: false };
  const d = decodeDouble(x);
  let m = d.significand < 0n ? -d.significand : d.significand;
  const bits = [];
  let e = d.exponent;
  while (m > 0n) { if (m & 1n) bits.push(e); m >>= 1n; e++; }
  return { top: e - 1, bits, neg: x < 0, low: d.exponent };
}


// Inputs on which the reference C code's errol_int (5364de4) goes wrong,
// found by running the C code on c·10^k (c = 1..9) and all powers of two in
// its range: [input, printed digits, printed exponent]. An empty string or a
// ':' comes from the single-digit bug (issue #12); the powers of two from
// the swapped upper/lower gap.
export const C_INT_BUGS = [
  ["1e23", "", 23], ["1e24", "", 24], ["1e28", "", 28], ["1e29", "", 29], ["1e31", "", 31],
  ["1e33", "", 33], ["1e34", "", 34], ["1e35", "", 35], ["1e37", "", 37], ["1e38", ":", 38],
  ["2e38", "1:", 39],
  ["18446744073709552000", "1844674407370955", 20], ["36893488147419103000", "368934881474191", 20],
  ["73786976294838210000", "737869762948382", 20], ["147573952589676410000", "1475739525896764", 21],
  ["295147905179352830000", "2951479051793528", 21], ["4.835703278458517e24", "48357032784585167", 25],
  ["3.8685626227668134e25", "3868562622766813", 26], ["3.094850098213451e26", "30948500982134507", 27],
  ["6.189700196426902e26", "6189700196426901", 27], ["2.535301200456459e30", "25353012004564588", 31],
  ["5.070602400912918e30", "50706024009129176", 31], ["3.2451855365842673e32", "3245185536584267", 33],
  ["1.298074214633707e33", "12980742146337069", 34], ["2.596148429267414e33", "25961484292674138", 34],
  ["5.192296858534828e33", "51922968585348276", 34], ["1.661534994731145e35", "16615349947311448", 36],
  ["3.32306998946229e35", "33230699894622897", 36], ["6.64613997892458e35", "6646139978924579", 36],
  ["1.329227995784916e36", "13292279957849159", 37], ["2.658455991569832e36", "26584559915698317", 37],
  ["5.316911983139664e36", "5316911983139663", 37],
];
export function cIntBug(v) {
  for (const [text, digits, exp] of C_INT_BUGS) if (Number(text) === v) return { digits, exp };
  return null;
}

// ---------------------------------------------------------------------------
// enum3.h at 5364de4: bit pattern, stored digits, stored exponent.

const ENUM3_DATA =
  "4e2e2785c3a2a20b,40648030339495312,69;240a28877a09a4e1,4498645355592131,-134;" +
  "728fca36c06cf106,678321594594593,244;1016b100e18e5c17,36539702510912277,-230;" +
  "3159190e30e46c1d,56819570380646536,-70;64312a13daa46fe4,42452693975546964,175;" +
  "7c41926c7a7122ba,34248868699178663,291;8667a3c8dc4bc9c,34037810581283983,-267;" +
  "18dde996371c6060,67135881167178176,-188;297c2c31a31998ae,74973710847373845,-108;" +
  "368b870de5d93270,60272377639347644,-45;57d561def4a9ee32,1316415380484425,116;" +
  "6d275d226331d03a,64433314612521525,218;76703d7cb98edc59,31961502891542243,263;" +
  "7ec490abad057752,4407140524515149,303;37be9d5a60850b5,69928982131052126,-291;" +
  "c63165633977bca,5331838923808276,-248;14a048cb468bc209,24766435002945523,-208;" +
  "20dc29bc6879dfcd,21509066976048781,-149;2643dc6227de9148,2347200170470694,-123;" +
  "2d64f14348a4c5db,51404180294474556,-89;341eef5e1f90ac35,12320586499023201,-56;" +
  "4931159a8bd8a240,38099461575161174,45;503ca9bade45b94a,3318949537676913,79;" +
  "5c1af5b5378aa2e5,48988560059074597,136;6b4ef9beaa7aa584,7955843973866726,209;" +
  "6ef1c382c3819a0a,2630089515909384,227;754fe46e378bf133,11971601492124911,258;" +
  "7ace779fddf21622,35394816534699092,284;7df22815078cb97b,47497368114750945,299;" +
  "7f33c8eeb77b8d05,54271187548763685,305;11b7aa3d73f6658,2504414972009504,-302;" +
  "6ceb7f2c53db97f,69316187906522606,-275;b8f3d82e9356287,53263359599109627,-252;" +
  "e304273b18918b0,24384437085962037,-239;139fb24e492936f6,3677854139813342,-213;" +
  "176090684f5fe997,44318030915155535,-195;1e3035e7b5183922,28150140033551147,-162;" +
  "220ce77c2b3328fc,1157373742186464,-143;246441ed79830182,2229658838863212,-132;" +
  "279b5cd8bbdd8770,67817280930489786,-117;2cc7c3fba45c1272,56966478488538934,-92;" +
  "3081eab25ad0fcf7,49514357246452655,-74;329f5a18504dfaac,74426102121433776,-64;" +
  "347eef5e1f90ac35,78851753593748485,-55;3a978cfcab31064c,19024128529074359,-25;" +
  "4baa32ac316fb3ab,32118580932839778,57;4eb9a2c2a34ac2f9,17693166778887419,72;" +
  "522f6a5025e71a61,78117757194253536,88;5935ede8cce30845,56627018760181905,122;" +
  "5f9aeac2d1ea2695,35243988108650928,153;6820ee7811241ad3,38624526316654214,194;" +
  "6c06c9e14b7c22c3,2397422026462446,213;6e5a2fbffdb7580c,37862966954556723,224;" +
  "71160cf8f38b0465,56089100059334965,237;738a37935f3b71c9,3666156212014994,249;" +
  "756fe46e378bf133,47886405968499643,258;7856d2aa2fc5f2b5,48228872759189434,272;" +
  "7bd3b063946e10ae,29980574575739863,289;7d8220e1772428d7,37049827284413546,297;" +
  "7e222815078cb97b,37997894491800756,300;7ef5bc471d5456c7,37263572163337027,304;" +
  "7fb82baa4ae611dc,16973149506391291,308;bb7aa3d73f6658,391314839376485,-304;" +
  "190a0f3c55062c5,38797447671091856,-300;5898e3445512a6e,54994366114768736,-281;" +
  "7bfe89cf1bd76ac,23593494977819109,-270;8dfa7ebe304ee3e,61359116592542813,-265;" +
  "c43165633977bca,1332959730952069,-248;e104273b18918b0,6096109271490509,-240;" +
  "fd6ba8608faa6a9,22874741188249992,-231;10b4139a6b17b224,33104948806015703,-227;" +
  "1466cc4fc92a0fa6,21670630627577332,-209;162ba6008389068a,70547825868713855,-201;" +
  "1804116d591ef1fb,54981742371928845,-192;1c513770474911bd,27843818440071113,-171;" +
  "1e7035e7b5183923,4504022405368184,-161;2114dab846e19e25,2548351460621656,-148;" +
  "222ce77c2b3328fc,4629494968745856,-143;244441ed79830182,557414709715803,-133;" +
  "249b23b50fc204db,23897004381644022,-131;278aacfcb88c92d6,33057350728075958,-117;" +
  "289d52af46e5fa6a,47628822744182433,-112;2bdec922478c0421,22520091703825729,-96;" +
  "2d44f14348a4c5dc,1285104507361864,-89;2f0c1249e96b6d8d,46239793787746783,-81;" +
  "30addc7e975c5045,330095714976351,-73;322aedaa0fc32ac8,4994144928421182,-66;" +
  "33deef5e1f90ac34,77003665618895,-58;343eef5e1f90ac35,49282345996092803,-56;" +
  "35ef1de1f7f14439,66534156679273626,-48;3854faba79ea92ec,24661175471861008,-36;" +
  "47f52d02c7e14af7,45035996273704964,39;4a6bb6979ae39c49,32402369146794532,51;" +
  "4c85564fb098c955,42859354584576066,61;4e80fde34c996086,1465909318208761,71;" +
  "4ed9a2c2a34ac2f9,70772667115549675,72;51a3274280201a89,18604316837693468,86;" +
  "574fe0403124a00e,38329392744333992,113;581561def4a9ee31,21062646087750798,117;" +
  "5b55ed1f039cebff,972708181182949,132;5e2780695036a679,36683053719290777,146;" +
  "624be064a3fb2725,32106017483029628,166;674dcfee6690ffc6,41508952543121158,190;" +
  "6a6cc08102f0da5b,45072812455233127,205;6be6c9e14b7c22c4,59935550661561155,212;" +
  "6ce75d226331d03a,40270821632825953,217;6d5b9445072f4374,60846862848160256,219;" +
  "6e927edd0dbb8c09,42788225889846894,225;71060cf8f38b0465,28044550029667482,237;" +
  "71b1d7cb7eae05d9,46475406389115295,240;72fba10d818fdafd,7546114860200514,246;" +
  "739a37935f3b71c9,7332312424029988,249;755fe46e378bf133,23943202984249821,258;" +
  "76603d7cb98edc59,15980751445771122,263;78447e17e7814ce7,21652206566352648,272;" +
  "799d696737fe68c7,65171333649148234,278;7ade779fddf21622,70789633069398184,284;" +
  "7c1c283ffc61c87d,68600253110025576,290;7d1a85c6f7fba05d,4234784709771466,295;" +
  "7da220e1772428d7,14819930913765419,298;7e022815078cb97b,9499473622950189,299;" +
  "7e9a9b45a91f1700,71272819274635585,302;7ee3c8eeb77b8d05,16959746108988652,304;" +
  "7f13c8eeb77b8d05,13567796887190921,305;7f6594223f5654bf,4735325513114182,306;" +
  "7fd82baa4ae611dc,67892598025565165,308;2d243f646eaf51,81052743999542975,-307;" +
  "f5d15b26b80e30,4971131903427841,-303;180a0f3c55062c5,19398723835545928,-300;" +
  "1f393b456eef178,29232758945460627,-298;5798e3445512a6e,27497183057384368,-281;" +
  "6afdadafcacdf85,17970091719480621,-275;6e8b03fd6894b66,22283747288943228,-274;" +
  "7cfe89cf1bd76ac,47186989955638217,-270;8ac25584881552a,6819439187504402,-266;" +
  "97822507db6a8fd,47902021250710456,-262;c27b35936d56e28,41378294570975613,-249;" +
  "c53165633977bca,2665919461904138,-248;c8e9eddbbb259b4,3421423777071132,-247;" +
  "e204273b18918b0,12192218542981019,-239;f1d16d6d4b89689,7147520638007367,-235;" +
  "fe6ba8608faa6a9,45749482376499984,-231;105f48347c60a1be,80596937390013985,-229;" +
  "13627383c5456c5e,26761990828289327,-214;13f93bb1e72a2033,18738512510673039,-211;" +
  "148048cb468bc208,619160875073638,-209;1514c0b3a63c1444,403997300048931,-206;" +
  "175090684f5fe997,22159015457577768,-195;17e4116d591ef1fb,13745435592982211,-192;" +
  "18cde996371c6060,33567940583589088,-188;19aa2cf604c30d3f,4812711195250522,-184;" +
  "1d2b1ad9101b1bfd,3591036630219558,-167;1e5035e7b5183923,1126005601342046,-161;" +
  "1fe5a79c4e71d028,5047135806497922,-154;20ec29bc6879dfcd,43018133952097563,-149;" +
  "218ce77c2b3328fb,45209911804158747,-146;221ce77c2b3328fc,2314747484372928,-143;" +
  "233f346f9ed36b89,65509428048152994,-138;243441ed79830182,2787073548579015,-133;" +
  "245441ed79830182,1114829419431606,-132;247441ed79830182,4459317677726424,-132;" +
  "2541e4ee41180c0a,32269008655522087,-128;277aacfcb88c92d6,16528675364037979,-117;" +
  "279aacfcb88c92d6,66114701456151916,-117;27cbb4c6bd8601bd,54934856534126976,-116;" +
  "28c04a616046e074,21168365664081082,-111;2a4eeff57768f88c,67445733463759384,-104;" +
  "2c2379f099a86227,45590931008842566,-95;2d04f14348a4c5db,8031903171011649,-91;" +
  "2d54f14348a4c5dc,2570209014723728,-89;2d6a8c931c19b77a,6516605505584466,-89;" +
  "2fa387cf9cb4ad4e,32943123175907307,-78;308ddc7e975c5046,82523928744087755,-74;" +
  "3149190e30e46c1d,28409785190323268,-70;318d2ec75df6ba2a,52853886779813977,-69;" +
  "32548050091c3c24,30417302377115577,-65;33beef5e1f90ac34,1925091640472375,-58;" +
  "33feef5e1f90ac35,30801466247558002,-57;342eef5e1f90ac35,24641172998046401,-56;" +
  "345eef5e1f90ac35,19712938398437121,-55;35108621c4199208,43129529027318865,-52;" +
  "366b870de5d93270,15068094409836911,-45;375b20c2f4f8d4a0,48658418478920193,-41;" +
  "3864faba79ea92ec,49322350943722016,-36;3aa78cfcab31064c,38048257058148717,-25;" +
  "4919d9577de925d5,14411294198511291,45;49ccadd6dd730c96,32745697577386472,48;" +
  "4b9a32ac316fb3ab,16059290466419889,57;4bba32ac316fb3ab,64237161865679556,57;" +
  "4cff20b1a0d7f626,8003248329710242,63;4e3e2785c3a2a20b,81296060678990625,69;" +
  "4ea9a2c2a34ac2f9,8846583389443709,71;4ec9a2c2a34ac2f9,35386333557774838,72;" +
  "4f28750ea732fdae,21606114462319112,74;513843e10734fa57,18413733104063271,84;" +
  "51e71760b3c0bc13,35887030159858487,87;55693ba3249a8511,2825769263311679,104;" +
  "57763ae2caed4528,2138446062528161,114;57f561def4a9ee32,52656615219377,116;" +
  "584561def4a9ee31,16850116870200639,118;5b45ed1f039cebfe,48635409059147446,132;" +
  "5bfaf5b5378aa2e5,12247140014768649,136;5c6cf45d333da323,16836228873919609,138;" +
  "5e64ec8fd70420c7,5225574770881846,147;6009813653f62db7,42745323906998127,155;" +
  "64112a13daa46fe4,10613173493886741,175;672dcfee6690ffc6,10377238135780289,190;" +
  "677a77581053543b,29480080280199528,191;699873e3758bc6b3,4679330956996797,201;" +
  "6b3ef9beaa7aa584,3977921986933363,209;6b7b86d8c3df7cd1,56560320317673966,210;" +
  "6bf6c9e14b7c22c3,1198711013231223,213;6c16c9e14b7c22c3,4794844052924892,213;" +
  "6d075d226331d03a,16108328653130381,218;6d5a3bdac4f00f33,57878622568856074,219;" +
  "6e4a2fbffdb7580c,18931483477278361,224;6e927edd0dbb8c08,4278822588984689,225;" +
  "6ee1c382c3819a0a,1315044757954692,227;70f60cf8f38b0465,14022275014833741,237;" +
  "7114390c68b888ce,5143975308105889,237;714fb4840532a9e5,64517311884236306,238;" +
  "727fca36c06cf106,3391607972972965,244;72eba10d818fdafd,3773057430100257,246;" +
  "737a37935f3b71c9,1833078106007497,249;73972852443155ae,64766168833734675,249;" +
  "754fe46e378bf132,1197160149212491,258;755fe46e378bf132,2394320298424982,258;" +
  "756fe46e378bf132,4788640596849964,258;76603d7cb98edc58,1598075144577112,263;" +
  "76703d7cb98edc58,3196150289154224,263;782f7c6a9ad432a1,83169412421960475,271;" +
  "78547e17e7814ce7,43304413132705296,272;7964066d88c7cab8,5546524276967009,277;" +
  "7ace779fddf21621,3539481653469909,284;7ade779fddf21621,7078963306939818,284;" +
  "7bc3b063946e10ae,14990287287869931,289;7c0c283ffc61c87d,34300126555012788,290;" +
  "7c31926c7a7122ba,17124434349589332,291;7d0a85c6f7fba05d,2117392354885733,295;" +
  "7d52a5daf9226f04,47639264836707725,296;7d9220e1772428d7,7409965456882709,297;" +
  "7db220e1772428d7,29639861827530837,298;7dfe5aceedf1c1f1,79407577493590275,299;" +
  "7e122815078cb97b,18998947245900378,300;7e8a9b45a91f1700,35636409637317792,302;" +
  "7eb6202598194bee,23707742595255608,303;7ec6202598194bee,47415485190511216,303;" +
  "7ef3c8eeb77b8d05,33919492217977303,304;7f03c8eeb77b8d05,6783898443595461,304;" +
  "7f23c8eeb77b8d05,27135593774381842,305;7f5594223f5654bf,2367662756557091,306;" +
  "7f9914e03c9260ee,44032152438472327,307;7fc82baa4ae611dc,33946299012782582,308;" +
  "7fefffffffffffff,17976931348623157,309;1d243f646eaf51,40526371999771488,-307;" +
  "ab7aa3d73f6658,1956574196882425,-304;cb7aa3d73f6658,78262967875297,-304;10b7aa3d73f6658,1252207486004752,-302;" +
  "12b7aa3d73f6658,5008829944019008,-302;180a0f3c55062c6,1939872383554593,-300;" +
  "190a0f3c55062c6,3879744767109186,-300;3719f08ccdccfe5,44144884605471774,-291;" +
  "3dc25ba6a45de02,45129663866844427,-289;5798e3445512a6f,2749718305738437,-281;" +
  "5898e3445512a6f,5499436611476874,-281;6bfdadafcacdf85,35940183438961242,-275;" +
  "6cfdadafcacdf85,71880366877922484,-275;6f8b03fd6894b66,44567494577886457,-274;" +
  "7c1707c02068785,25789638850173173,-270;8567a3c8dc4bc9c,17018905290641991,-267;" +
  "89c25584881552a,3409719593752201,-266;8dfa7ebe304ee3d,6135911659254281,-265;" +
  "96822507db6a8fd,23951010625355228,-262;9e41934d77659be,51061856989121905,-260;" +
  "c27b35936d56e27,4137829457097561,-249;c43165633977bc9,13329597309520689,-248;" +
  "c53165633977bc9,26659194619041378,-248;c63165633977bc9,53318389238082755,-248;" +
  "c7e9eddbbb259b4,1710711888535566,-247;c9e9eddbbb259b4,6842847554142264,-247;" +
  "e104273b18918b1,609610927149051,-240;e204273b18918b1,1219221854298102,-239;" +
  "e304273b18918b1,2438443708596204,-239;fd6ba8608faa6a8,2287474118824999,-231;" +
  "fe6ba8608faa6a8,4574948237649998,-231;1006b100e18e5c17,18269851255456139,-230;" +
  "104f48347c60a1be,40298468695006992,-229;10a4139a6b17b224,16552474403007851,-227;" +
  "12cb91d317c8ebe9,39050270537318193,-217;138fb24e492936f6,1838927069906671,-213;" +
  "13afb24e492936f6,7355708279626684,-213;14093bb1e72a2033,37477025021346077,-211;" +
  "1476cc4fc92a0fa6,43341261255154663,-209;149048cb468bc209,12383217501472761,-208;" +
  "1504c0b3a63c1444,2019986500244655,-206;161ba6008389068a,35273912934356928,-201;" +
  "168cfab1a09b49c4,47323883490786093,-199;175090684f5fe998,2215901545757777,-195;" +
  "176090684f5fe998,4431803091515554,-195;17f4116d591ef1fb,27490871185964422,-192;" +
  "18a710b7a2ef18b7,64710073234908765,-189;18d99fccca44882a,57511323531737074,-188;" +
  "199a2cf604c30d3f,2406355597625261,-184;1b5ebddc6593c857,75862936714499446,-176;" +
  "1d1b1ad9101b1bfd,1795518315109779,-167;1d3b1ad9101b1bfd,7182073260439116,-167;" +
  "1e4035e7b5183923,563002800671023,-162;1e6035e7b5183923,2252011202684092,-161;" +
  "1fd5a79c4e71d028,2523567903248961,-154;20cc29bc6879dfcd,10754533488024391,-149;" +
  "20e8823a57adbef8,37436263604934127,-149;2104dab846e19e25,1274175730310828,-148;" +
  "2124dab846e19e25,5096702921243312,-148;220ce77c2b3328fb,11573737421864639,-143;" +
  "221ce77c2b3328fb,23147474843729279,-143;222ce77c2b3328fb,46294949687458557,-143;" +
  "229197b290631476,36067106647774144,-141;240a28877a09a4e0,44986453555921307,-134;" +
  "243441ed79830181,27870735485790148,-133;244441ed79830181,55741470971580295,-133;" +
  "245441ed79830181,11148294194316059,-132;246441ed79830181,22296588388632118,-132;" +
  "247441ed79830181,44593176777264236,-132;248b23b50fc204db,11948502190822011,-131;" +
  "24ab23b50fc204db,47794008763288043,-131;2633dc6227de9148,1173600085235347,-123;" +
  "2653dc6227de9148,4694400340941388,-123;277aacfcb88c92d7,1652867536403798,-117;" +
  "278aacfcb88c92d7,3305735072807596,-117;279aacfcb88c92d7,6611470145615192,-117;" +
  "27bbb4c6bd8601bd,27467428267063488,-116;289d52af46e5fa69,4762882274418243,-112;" +
  "28b04a616046e074,10584182832040541,-111;28d04a616046e074,42336731328162165,-111;" +
  "2a3eeff57768f88c,33722866731879692,-104;2b8e3a0aeed7be19,69097540994131414,-98;" +
  "2beec922478c0421,45040183407651457,-96;2cc7c3fba45c1271,5696647848853893,-92;" +
  "2cf4f14348a4c5db,40159515855058247,-91;2d44f14348a4c5db,12851045073618639,-89;" +
  "2d54f14348a4c5db,25702090147237278,-89;2d5a8c931c19b77a,3258302752792233,-89;" +
  "2d64f14348a4c5dc,5140418029447456,-89;2efc1249e96b6d8d,23119896893873391,-81;" +
  "2f0f6b23cfe98807,51753157237874753,-81;2fe91b9de4d5cf31,67761208324172855,-77;" +
  "308ddc7e975c5045,8252392874408775,-74;309ddc7e975c5045,1650478574881755,-73;" +
  "30bddc7e975c5045,660191429952702,-73;3150ed9bd6bfd003,3832399419240467,-70;" +
  "317d2ec75df6ba2a,26426943389906988,-69;321aedaa0fc32ac8,2497072464210591,-66;" +
  "32448050091c3c24,15208651188557789,-65;328f5a18504dfaac,37213051060716888,-64;" +
  "3336dca59d035820,55574205388093594,-61;33ceef5e1f90ac34,385018328094475,-58;" +
  "33eeef5e1f90ac35,15400733123779001,-57;340eef5e1f90ac35,61602932495116004,-57;" +
  "34228f9edfbd3420,14784703798827841,-56;34328f9edfbd3420,29569407597655683,-56;" +
  "344eef5e1f90ac35,9856469199218561,-56;346eef5e1f90ac35,39425876796874242,-55;" +
  "35008621c4199208,21564764513659432,-52;35e0ac2e7f90b8a3,35649516398744314,-48;" +
  "361dde4a4ab13e09,51091836539008967,-47;367b870de5d93270,30136188819673822,-45;" +
  "375b20c2f4f8d49f,4865841847892019,-41;37f25d342b1e33e5,33729482964455627,-38;" +
  "3854faba79ea92ed,2466117547186101,-36;3864faba79ea92ed,4932235094372202,-36;" +
  "3a978cfcab31064d,1902412852907436,-25;3aa78cfcab31064d,3804825705814872,-25;" +
  "490cd230a7ff47c3,80341375308088225,44;4929d9577de925d5,28822588397022582,45;" +
  "4939d9577de925d5,57645176794045164,45;49dcadd6dd730c96,65491395154772944,48;" +
  "4a7bb6979ae39c49,64804738293589064,51;4b9a32ac316fb3ac,1605929046641989,57;" +
  "4baa32ac316fb3ac,3211858093283978,57;4bba32ac316fb3ac,6423716186567956,57;" +
  "4cef20b1a0d7f626,4001624164855121,63;4e2e2785c3a2a20a,4064803033949531,69;" +
  "4e3e2785c3a2a20a,8129606067899062,69;4e6454b1aef62c8d,4384946084578497,70;" +
  "4e90fde34c996086,2931818636417522,71;4ea9a2c2a34ac2fa,884658338944371,71;4eb9a2c2a34ac2fa,1769316677888742,72;" +
  "4ec9a2c2a34ac2fa,3538633355777484,72;4ed9a2c2a34ac2fa,7077266711554968,72;" +
  "4f38750ea732fdae,43212228924638223,74;504ca9bade45b94a,6637899075353826,79;" +
  "514843e10734fa57,36827466208126543,84;51b3274280201a89,37208633675386937,86;" +
  "521f6a5025e71a61,39058878597126768,88;52c6a47d4e7ec633,57654578150150385,91;" +
  "55793ba3249a8511,5651538526623358,104;575fe0403124a00e,76658785488667984,113;" +
  "57863ae2caed4528,4276892125056322,114;57e561def4a9ee32,263283076096885,116;" +
  "580561def4a9ee31,10531323043875399,117;582561def4a9ee31,42125292175501597,117;" +
  "585561def4a9ee31,33700233740401277,118;59d0dd8f2788d699,44596066840334405,125;" +
  "5b55ed1f039cebfe,9727081811829489,132;5beaf5b5378aa2e5,61235700073843246,135;" +
  "5c0af5b5378aa2e5,24494280029537298,136;5c4ef3052ef0a361,4499029632233837,137;" +
  "5e1780695036a679,18341526859645389,146;5e54ec8fd70420c7,2612787385440923,147;" +
  "5e6b5e2f86026f05,6834859331393543,147;5faaeac2d1ea2695,70487976217301855,153;" +
  "611260322d04d50b,40366692112133834,160;625be064a3fb2725,64212034966059256,166;" +
  "64212a13daa46fe4,21226346987773482,175;671dcfee6690ffc6,51886190678901447,189;" +
  "673dcfee6690ffc6,20754476271560579,190;675dcfee6690ffc6,83017905086242315,190;" +
  "678a77581053543b,58960160560399056,191;682d3683fa3d1ee0,66641177824100826,194;" +
  "699cb490951e8515,5493127645170153,201;6b3ef9beaa7aa583,39779219869333628,209;" +
  "6b4ef9beaa7aa583,79558439738667255,209;6b7896beb0c66eb9,50523702331566894,210;" +
  "6bdf20938e7414bb,40933393326155808,212;6bef20938e7414bb,81866786652311615,212;" +
  "6bf6c9e14b7c22c4,11987110132312231,213;6c06c9e14b7c22c4,23974220264624462,213;" +
  "6c16c9e14b7c22c4,47948440529248924,213;6cf75d226331d03a,8054164326565191,217;" +
  "6d175d226331d03a,32216657306260762,218;6d4b9445072f4374,30423431424080128,219";
