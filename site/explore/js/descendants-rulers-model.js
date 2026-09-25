// Copyright (C) 2026 Toit contributors.
//
// Pure model for the "Binade meets decade" page (Gay's dtoa and Burger & Dybvig).
// No DOM. Every "truth" decision uses exact BigInt arithmetic; the estimators
// use exactly the double operations of the published code.
//
// Convention used by the page: v ≈ d.ddd × 10^E (scientific). Burger & Dybvig
// write 0.d₁d₂… × 10^k, so their k = E + 1 (dtoa's decpt is the same k).

import { decodeDouble } from "../../js/float.js";

export const LOG10_2 = Math.LN2 / Math.LN10; // B&D's (log 2)/(log 10), in doubles
const HIDDEN = 1n << 52n;

const POW10 = [1n];
export function pow10(n) {
  while (POW10.length <= n) POW10.push(POW10.at(-1) * 10n);
  return POW10[n];
}
const POW5 = [1n];
export function pow5(n) {
  while (POW5.length <= n) POW5.push(POW5.at(-1) * 5n);
  return POW5[n];
}
export const bitLength = (x) => (x === 0n ? 0 : x.toString(2).length);

// ---------- decomposition ----------

/** Positive finite nonzero double → v = f·2^e with the facts both papers need. */
export function decompose(v) {
  const d = decodeDouble(Math.abs(v));
  if (d.special) throw new RangeError("expected a finite, nonzero double");
  const f = d.significand;
  const e = d.exponent;
  const len = bitLength(f);
  return {
    v: Math.abs(v),
    f, e, len,
    s: e + len - 1,                  // binade: 2^s ≤ v < 2^(s+1)
    even: (f & 1n) === 0n,
    normal: d.exponentBits !== 0,
    // Gap below is half the gap above: a normal power of two that is not the smallest normal.
    asymmetric: f === HIDDEN && e > -1074,
  };
}

/** sign(num·2^x2 − 10^n), exact. */
export function cmpPow10(num, x2, n) {
  let left = num, right = 1n;
  if (x2 >= 0) left <<= BigInt(x2); else right <<= BigInt(-x2);
  if (n >= 0) right *= pow10(n); else left *= pow10(-n);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** ⌊log10(num·2^x2)⌋, exact. */
export function floorLog10(num, x2) {
  let n = Math.floor((bitLength(num) - 1 + x2) * LOG10_2);
  while (cmpPow10(num, x2, n) < 0) n--;
  while (cmpPow10(num, x2, n + 1) >= 0) n++;
  return n;
}

/** Gay's target: E = ⌊log10 v⌋. */
export function exponentOfV(v) {
  const d = decompose(v);
  return floorLog10(d.f, d.e);
}

/** Upper end of the rounding interval: high = v + ulp/2 = (2f+1)·2^(e−1). */
export function highOf(v) {
  const d = decompose(v);
  return { num: 2n * d.f + 1n, x2: d.e - 1, included: d.even };
}

/**
 * B&D's target, in this page's convention. B&D's k is the smallest k with
 * high < 10^k (high ≤ 10^k when high is excluded). E = k − 1.
 */
export function exponentOfHigh(v) {
  const { num, x2, included } = highOf(v);
  const n = floorLog10(num, x2);
  if (!included && cmpPow10(num, x2, n) === 0) return n - 1; // high = 10^n, excluded
  return n;
}

// ---------- the estimators (exact double arithmetic of the published code) ----------

/** B&D Fig. 3: est = ⌈(e + len(f) − 1)·log10 2 − 1e−10⌉ (their k). */
export function bdBitsEstimate(v) {
  const { s } = decompose(v);
  const product = s * LOG10_2;
  const k = Math.ceil(product - 1e-10) + 0; // + 0 turns −0 into 0
  return { k, E: k - 1, product };
}

/** B&D Fig. 2: est = ⌈log10 v − 1e−10⌉ (their k). */
export function bdLogEstimate(v) {
  const log = Math.log10(v);
  const k = Math.ceil(log - 1e-10) + 0;
  return { k, E: k - 1, log };
}

export const GAY_SLOPE = 0.289529654602168;
export const GAY_INTERCEPT = 0.1760912590558;
export const GAY_LOG10_2 = 0.301029995663981;

/** dtoa's ds = (x − 1.5)·0.2895… + 0.1760… + i·0.30103…, v = x·2^i, 1 ≤ x < 2. */
export function gayEstimate(v) {
  const d = decompose(v);
  let x;
  if (d.normal) {
    x = Number(d.f) / 2 ** 52;
  } else {
    // dtoa keeps only the top 32 bits of a subnormal's significand here.
    const top = d.len > 32 ? d.f >> BigInt(d.len - 32) : d.f << BigInt(32 - d.len);
    x = Number(top) / 2 ** 31;
  }
  const i = d.s;
  const ds = (x - 1.5) * GAY_SLOPE + GAY_INTERCEPT + i * GAY_LOG10_2;
  let k = Math.trunc(ds);
  if (ds < 0 && ds !== k) k--;
  return { ds, E: k, x, i };
}

export const ESTIMATORS = {
  bits: { label: "B&D exponent bits (Fig. 3)", short: "B&D bits", E: (v) => bdBitsEstimate(v).E, truth: exponentOfHigh },
  log: { label: "B&D floating log10 (Fig. 2)", short: "B&D log10", E: (v) => bdLogEstimate(v).E, truth: exponentOfHigh },
  gay: { label: "Gay tangent line (dtoa)", short: "Gay tangent", E: (v) => gayEstimate(v).E, truth: exponentOfV },
};

// ---------- B&D Table 1 and scaling ----------

export function bdInit(v) {
  const d = decompose(v);
  const { f, e } = d;
  let r, s, mp, mm;
  if (e >= 0) {
    const be = 1n << BigInt(e);
    if (!d.asymmetric) { r = f * be * 2n; s = 2n; mp = be; mm = be; }
    else { r = f * be * 4n; s = 4n; mp = be * 2n; mm = be; }
  } else if (!d.asymmetric) {
    r = f * 2n; s = 1n << BigInt(1 - e); mp = 1n; mm = 1n;
  } else {
    r = f * 4n; s = 1n << BigInt(2 - e); mp = 2n; mm = 1n;
  }
  return { r, s, mp, mm, even: d.even, d };
}

/**
 * B&D Fig. 1 (Steele & White style): find k by stepping one decade at a time.
 * Counts the bignum ×10 multiplications that the scaling loop performs.
 */
export function iterativeScale(v) {
  let { r, s, mp, mm, even } = bdInit(v);
  let k = 0, steps = 0, mults = 0;
  for (;;) {
    if (even ? r + mp >= s : r + mp > s) { s *= 10n; k++; steps++; mults += 1; continue; }
    if (even ? (r + mp) * 10n < s : (r + mp) * 10n <= s) {
      r *= 10n; mp *= 10n; mm *= 10n; k--; steps++; mults += 3; continue;
    }
    break;
  }
  return { k, E: k - 1, steps, mults, bits: Math.max(bitLength(r), bitLength(s)) };
}

/**
 * B&D Fig. 3: estimate, scale by one table power, one comparison (fixup),
 * then the digit loop. Ties round up as in the paper.
 */
export function burgerDybvig(v) {
  const init = bdInit(v);
  let { r, s, mp, mm } = init;
  const even = init.even;
  const est = bdBitsEstimate(v).k;
  let tableMults;
  if (est >= 0) { s *= pow10(est); tableMults = 1; }
  else { const t = pow10(-est); r *= t; mp *= t; mm *= t; tableMults = 3; }
  const scaled = { r, s, mp, mm };
  const low = even ? r + mp >= s : r + mp > s; // "is high ≥ 10^est?"
  let k;
  if (low) k = est + 1;
  else { k = est; r *= 10n; mp *= 10n; mm *= 10n; }
  const start = { r, s, mp, mm };
  const digits = [];
  for (;;) {
    const d = r / s; r %= s;
    const tc1 = even ? r <= mm : r < mm;
    const tc2 = even ? r + mp >= s : r + mp > s;
    if (!tc1 && !tc2) { digits.push(Number(d)); r *= 10n; mp *= 10n; mm *= 10n; continue; }
    if (tc1 && !tc2) digits.push(Number(d));
    else if (!tc1 && tc2) digits.push(Number(d) + 1);
    else digits.push(r * 2n < s ? Number(d) : Number(d) + 1);
    break;
  }
  return { est, E: k - 1, k, low, tableMults, scaled, start, digits: digits.join(""), init };
}

// ---------- Gay's dtoa, mode 0, classic bignum path (-DNO_BF96) ----------

const TENS = Array.from({ length: 23 }, (_, i) => Number(`1e${i}`));
export const INT_MAX = 14;

/** The k repair only: returns the estimate, which check ran and the result. */
export function gayRepair(v) {
  const g = gayEstimate(v);
  if (g.E >= 0 && g.E <= 22) {
    const lower = v < TENS[g.E];
    return { ...g, check: "float", lowered: lower, k: lower ? g.E - 1 : g.E };
  }
  const d = decompose(v);
  const lower = cmpPow10(d.f, d.e, g.E) < 0; // b < S after scaling ⇔ v < 10^k̂
  return { ...g, check: "bignum", lowered: lower, k: lower ? g.E - 1 : g.E };
}

const hi0bits32 = (x) => 32 - bitLength(x);

/** The quotient estimate of dtoa's quorem (32-bit words). */
export function quoremEstimate(b, S) {
  const n = Math.ceil(bitLength(S) / 32);
  const bw = Math.ceil(bitLength(b) / 32);
  if (bw < n) return { qhat: 0, q: 0, corrected: false, early: true };
  const shift = BigInt(32 * (n - 1));
  const topS = S >> shift;
  const topB = b >> shift;
  const qhat = Number(topB / (topS + 1n));
  const q = Number(b / S);
  return { qhat, q, corrected: q !== qhat, early: false, topS, topB };
}

/**
 * Full classic mode-0 dtoa with a ledger of the 2/5 bookkeeping.
 * Returns digits, decpt (= E + 1) and the stages the page draws.
 */
export function gayDtoa(v) {
  const d = decompose(v);
  const f0 = d.f;
  // d2b: strip trailing zero bits → odd b.
  const tz = bitLength(f0 & -f0) - 1;
  let b = f0 >> BigInt(tz);
  const be = d.e + tz;
  const bbits = bitLength(b);
  const rep = gayRepair(v);
  const kCheck = rep.check === "bignum";
  let k = kCheck ? rep.E : rep.k; // the bignum check runs later, after scaling
  const i = d.s;
  const stages = [];
  const odd = b; // the odd mantissa tile
  stages.push({ id: "d2b", b2: 0, b5: 0, s2: 0, s5: 0, m2: null, m5: null, note: { b, be, bbits } });

  if (be >= 0 && k <= INT_MAX) {
    // Small-integer lane: plain double arithmetic, exact below 2^53.
    const ds = TENS[k];
    let u = v, out = "";
    const trace = [];
    for (;;) {
      const L = Math.trunc(u / ds);
      u -= L * ds;
      trace.push({ L, u });
      out += L;
      if (!u) break;
      u *= 10;
    }
    return { path: "small-int", digits: out.replace(/0+$/, ""), decpt: k + 1, E: k, rep, trace, stages, odd, be, bbits };
  }

  const j = bbits - i - 1;
  let b2, s2, b5, s5;
  if (j >= 0) { b2 = 0; s2 = j; } else { b2 = -j; s2 = 0; }
  if (k >= 0) { b5 = 0; s5 = k; s2 += k; } else { b2 -= k; b5 = -k; s5 = 0; }
  stages.push({ id: "place", b2, b5, s2, s5, m2: null, m5: null });
  let m2 = b2, m5 = b5;
  const add = d.normal ? 1 + 53 - bbits : be + 1075;
  b2 += add; s2 += add;
  stages.push({ id: "margin", b2, b5, s2, s5, m2, m5, add });
  let cancel = 0;
  if (m2 > 0 && s2 > 0) { cancel = Math.min(m2, s2); b2 -= cancel; m2 -= cancel; s2 -= cancel; }
  stages.push({ id: "cancel", b2, b5, s2, s5, m2, m5, cancel });
  const spec = d.asymmetric;
  if (spec) { b2 += 1; s2 += 1; }
  stages.push({ id: "spec", b2, b5, s2, s5, m2, m5, spec });
  // Build: b ← b·5^b5 (via mhi·b when m5 > 0), S ← 5^s5.
  let mhi = 1n;
  if (b5 > 0) {
    if (m5 > 0) { mhi = pow5(m5); b = mhi * b; }
    if (b5 - m5) b *= pow5(b5 - m5);
  }
  let S = pow5(s5);
  const unshifted = { b: b << BigInt(Math.max(b2, 0)), S: S << BigInt(Math.max(s2, 0)) };
  // dshift: give S's top 32-bit word exactly 4 leading zero bits.
  const topWord = S >> BigInt(32 * (Math.ceil(bitLength(S) / 32) - 1));
  let sh = hi0bits32(topWord) - 4;
  if (s2 > 0) sh -= s2;
  sh &= 31;
  b2 += sh; m2 += sh; s2 += sh;
  stages.push({ id: "dshift", b2, b5, s2, s5, m2, m5, shift: sh });
  if (b2 > 0) b <<= BigInt(b2);
  if (s2 > 0) S <<= BigInt(s2);
  let kFixed = false;
  if (kCheck && b < S) { k--; b *= 10n; mhi *= 10n; kFixed = true; }
  if (m2 > 0) mhi <<= BigInt(m2);
  let mlo = mhi;
  if (spec) mhi = mlo << 1n;
  const built = { b, S, mlo, mhi, bBits: bitLength(b), SBits: bitLength(S), unshiftedSBits: bitLength(unshifted.S), unshiftedBBits: bitLength(unshifted.b) };
  const first = quoremEstimate(b, S);
  const even = (f0 & 1n) === 0n;
  const digits = [];
  const roundoff = () => {
    while (digits.length && digits.at(-1) === 9) digits.pop();
    if (!digits.length) { k++; digits.push(1); } else digits[digits.length - 1]++;
  };
  let exit = null, loops = 0;
  for (;;) {
    loops++;
    let dig = Number(b / S); b %= S;
    const jj = b < mlo ? -1 : b > mlo ? 1 : 0;
    const delta = S - mhi;
    const j1 = delta < 0n ? 1 : b < delta ? -1 : b > delta ? 1 : 0;
    if (j1 === 0 && even) {
      exit = "upper boundary";
      if (dig === 9) { digits.push(9); roundoff(); exit += ", round_9_up"; break; }
      if (jj > 0) dig++;
      digits.push(dig); break;
    }
    if (jj < 0 || (jj === 0 && even)) {
      exit = "low side";
      if (b !== 0n && j1 > 0) {
        const c = 2n * b > S ? 1 : 2n * b < S ? -1 : 0;
        if (c > 0 || (c === 0 && (dig & 1))) {
          if (dig === 9) { digits.push(9); roundoff(); exit += ", round_9_up"; break; }
          dig++;
        }
      }
      digits.push(dig); break;
    }
    if (j1 > 0) {
      exit = "high side";
      if (dig === 9) { digits.push(9); roundoff(); exit += ", round_9_up"; break; }
      digits.push(dig + 1); break;
    }
    digits.push(dig);
    b *= 10n; mlo *= 10n; mhi *= 10n;
  }
  let text = digits.join("").replace(/0+$/, "");
  return {
    path: "bignum", digits: text, decpt: k + 1, E: k, rep, kFixed, stages, built, first, exit, loops,
    odd, be, bbits, spec, cancel, add, shift: sh,
  };
}

/** B&D paper version: bit length of the largest integer after scaling (Table 1 + 10^est). */
export function bdSizes(v) {
  const out = burgerDybvig(v);
  const { r, s, mp } = out.start;
  return { s: bitLength(s), r: bitLength(r), m: bitLength(mp) };
}

// ---------- shortest digits reference (JS) ----------

export function jsDigits(v) {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(v));
  let all = m[1] + (m[2] || "");
  let point = m[1].length + (m[3] ? +m[3] : 0);
  const lead = all.match(/^0*/)[0].length;
  all = all.slice(lead); point -= lead;
  return { digits: all.replace(/0+$/, ""), decpt: point };
}

// ---------- geometry helpers for drawing (doubles; never used for decisions) ----------

/** Miss zones (in log10 units) inside [lo, hi] for an estimator, per binade. */
export function missZones(kind, lo, hi) {
  const zones = [];
  const sLo = Math.max(-1074, Math.floor(lo / LOG10_2) - 1);
  const sHi = Math.min(1023, Math.ceil(hi / LOG10_2) + 1);
  for (let s = sLo; s <= sHi; s++) {
    const a = s * LOG10_2, b = (s + 1) * LOG10_2;
    if (kind === "bits") {
      const E = Math.ceil(s * LOG10_2 - 1e-10) - 1;
      const n = E + 1; // v with high ≥ 10^n are missed
      if (n < b) zones.push([Math.max(n, a), b]);
    } else if (kind === "gay") {
      // ds(x) = n at x* ; missed for x*·2^s ≤ v < 10^n.
      const i = s;
      const base = GAY_INTERCEPT + i * GAY_LOG10_2;
      const dsLo = (1 - 1.5) * GAY_SLOPE + base;
      const dsHi = (2 - 1.5) * GAY_SLOPE + base;
      for (let n = Math.ceil(dsLo); n <= Math.floor(dsHi); n++) {
        const x = 1.5 + (n - base) / GAY_SLOPE;
        const start = s * LOG10_2 + Math.log10(x);
        const end = Math.min(n, b);
        if (start < end) zones.push([Math.max(start, a), end]);
      }
    }
  }
  return zones.filter(([x, y]) => y > lo && x < hi);
}

/** Smallest v in binade 2^i where ⌊ds⌋ reaches n (bisection on doubles; monotone). */
export function gayThreshold(i, n) {
  const base = GAY_INTERCEPT + i * GAY_LOG10_2;
  let lo = 1, hi = 2;
  const ds = (x) => (x - 1.5) * GAY_SLOPE + base;
  if (ds(lo) >= n) return 2 ** i;
  for (let t = 0; t < 80; t++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (ds(mid) >= n) hi = mid; else lo = mid;
  }
  return hi * 2 ** i;
}

// ---------- random sampling for the sweep ----------

/** A random normal double, uniform over bit patterns (all binades equally likely). */
export function randomNormal(rand = Math.random) {
  const exp = 1 + Math.floor(rand() * 2046);
  const hi = Math.floor(rand() * 2 ** 20);
  const lo = Math.floor(rand() * 2 ** 32);
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, (exp << 20) | hi);
  view.setUint32(4, lo);
  return view.getFloat64(0);
}

/** Tally estimate − truth for n random doubles. */
export function sweep(n, rand = Math.random, counts = null) {
  const c = counts || { n: 0, bits: {}, log: {}, gay: {} };
  for (let t = 0; t < n; t++) {
    const v = randomNormal(rand);
    const eHigh = exponentOfHigh(v);
    const eV = exponentOfV(v);
    const db = bdBitsEstimate(v).E - eHigh;
    const dl = bdLogEstimate(v).E - eHigh;
    const dg = gayEstimate(v).E - eV;
    c.bits[db] = (c.bits[db] || 0) + 1;
    c.log[dl] = (c.log[dl] || 0) + 1;
    c.gay[dg] = (c.gay[dg] || 0) + 1;
    c.n++;
  }
  return c;
}

/** A tiny deterministic PRNG (mulberry32) so tests and deep links are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parse a user literal into a positive finite double (or null). */
export function parseInput(text) {
  const t = String(text).trim().replace(/\s|_/g, "").replace(/×10\^/, "e").replace(/−/g, "-");
  if (!/^[+]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}
