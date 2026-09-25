// Copyright (C) 2026 Toit contributors.
//
// Bit-faithful simulation of Coonen's binary→decimal conversion (1984
// dissertation, chapter 7: Algorithms B, L, S and Q) for binary64 inputs,
// backed by an extended format with a 64-bit significand.  Pure computation,
// no DOM: importable from node for tests.
//
// All values handled here are exact: BigInt rationals and extended numbers
// {m, e} meaning m · 2^e with 2^63 <= m < 2^64.

import { decodeDouble, bitsOf, fromBits } from "../../js/float.js";

export const EXT_BITS = 64;
const TWO63 = 1n << 63n;
const TWO64 = 1n << 64n;

// ---------------------------------------------------------------- helpers

const POW10 = [1n];
export function pow10(k) {
  while (POW10.length <= k) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[k];
}

const POW5 = [1n];
export function pow5(k) {
  while (POW5.length <= k) POW5.push(POW5[POW5.length - 1] * 5n);
  return POW5[k];
}

export function bitLength(n) {
  if (n < 0n) n = -n;
  if (n === 0n) return 0;
  const hex = n.toString(16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0], 16)));
}

const abs = (n) => (n < 0n ? -n : n);

/** Exact rational n/d (d > 0) → nearest-ish Number (64 correct bits, then one Number rounding). */
export function ratToNumber(n, d) {
  if (n === 0n) return 0;
  const negative = (n < 0n) !== (d < 0n);
  n = abs(n);
  d = abs(d);
  const shift = bitLength(n) - bitLength(d) - 64;
  const q = shift >= 0 ? n / (d << BigInt(shift)) : (n << BigInt(-shift)) / d;
  const half = Math.trunc(shift / 2);
  const v = Number(q) * 2 ** half * 2 ** (shift - half);
  return negative ? -v : v;
}

/** Decimal string of a non-negative rational, truncated to `digits` fraction digits. */
export function ratToFixed(n, d, digits) {
  const t = (n * pow10(digits)) / d;
  const s = t.toString().padStart(digits + 1, "0");
  if (digits === 0) return s;
  return `${s.slice(0, s.length - digits)}.${s.slice(s.length - digits)}`;
}

/** Exact value of an extended number as a rational {n, d}. */
export function extToRat({ m, e }) {
  return e >= 0 ? { n: m << BigInt(e), d: 1n } : { n: m, d: 1n << BigInt(-e) };
}

/**
 * Round the positive rational num/den to a 64-bit significand.
 * mode is a *magnitude* mode: "nearest" (ties to even), "down" (chop,
 * toward zero), "up" (away from zero).
 */
export function roundToExt(num, den, mode) {
  let e = bitLength(num) - bitLength(den) - EXT_BITS;
  let q, r, d;
  for (;;) {
    const n = e >= 0 ? num : num << BigInt(-e);
    d = e >= 0 ? den << BigInt(e) : den;
    q = n / d;
    r = n % d;
    if (q >= TWO64) { e += 1; continue; }
    break;
  }
  const inexact = r !== 0n;
  if (inexact) {
    if (mode === "up") q += 1n;
    else if (mode === "nearest" && (2n * r > d || (2n * r === d && (q & 1n) === 1n))) q += 1n;
  }
  if (q === TWO64) { q = TWO63; e += 1; }
  return { m: q, e, inexact };
}

export function mulExt(a, b, mode) {
  const exp = a.e + b.e;
  const num = a.m * b.m;
  return exp >= 0 ? roundToExt(num << BigInt(exp), 1n, mode) : roundToExt(num, 1n << BigInt(-exp), mode);
}

/** Round a positive rational to an integer in a magnitude mode. */
export function roundToInteger(n, d, mode) {
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  if (mode === "down") return q;
  if (mode === "up") return q + 1n;
  if (2n * r > d || (2n * r === d && (q & 1n) === 1n)) return q + 1n;
  return q;
}

// ------------------------------------------------------ Algorithm Q table

// Coonen's "economical" table for double: 10^27 (exact), 10^55, 10^108,
// 10^206, each kept rounded to nearest in the extended format, plus
// pfix = +1/0/-1 (entry rounded up / exact / rounded down).
// NOTE: the OCR transcription prints the last two entries as 10^110·2^366 and
// 10^210·2^698; the printed significands only match 10^108 (·2^359) and
// 10^206 (·2^685), and only 27+55+108+206 reaches 10^340 with two rounded
// entries.  We compute the entries from exact powers of ten.
export const TABLE = [27, 55, 108, 206].map((exp) => {
  const r = roundToExt(pow10(exp), 1n, "nearest");
  const rat = extToRat(r);
  const diff = rat.n - pow10(exp) * rat.d;
  return {
    exp,
    m: r.m,
    e: r.e,
    pfix: diff > 0n ? 1 : diff < 0n ? -1 : 0,
    hex: r.m.toString(16).toUpperCase(),
    binExp: r.e + EXT_BITS, // value = 0.HEX × 2^binExp
    relErr: ratToNumber(diff, pow10(exp) * rat.d),
  };
});

/** Exact 10^k (k <= 27) as an extended number. */
function exactPow10(k) {
  const r = roundToExt(pow10(k), 1n, "nearest");
  if (r.inexact) throw new Error(`10^${k} is not exact in 64 bits`);
  return r;
}

/**
 * Algorithm Q: z ≈ 10^n with at most three multiplies, every rounding in
 * zmode (nearest / up / down, magnitudes).  Returns z plus a trace of bricks.
 */
export function pow10Q(n, zmode) {
  let z = { m: TWO63, e: -63 }; // 1.0
  let rest = n;
  let ixflag = false;
  const bricks = [];
  for (let i = TABLE.length - 1; i >= 0; i--) {
    const t = TABLE[i];
    if (rest < t.exp) continue;
    let fm = t.m;
    let fix = 0;
    if (zmode === "up" && t.pfix < 0) { fm += 1n; fix = 1; }
    else if (zmode === "down" && t.pfix > 0) { fm -= 1n; fix = -1; }
    const r = mulExt(z, { m: fm, e: t.e }, zmode);
    if (t.pfix !== 0) ixflag = true;
    if (r.inexact) ixflag = true;
    const entry = extToRat({ m: fm, e: t.e });
    bricks.push({
      kind: "table", exp: t.exp, pfix: t.pfix, fix, mulInexact: r.inexact,
      entryRelErr: ratToNumber(entry.n - pow10(t.exp) * entry.d, pow10(t.exp) * entry.d),
    });
    z = { m: r.m, e: r.e };
    rest -= t.exp;
  }
  const r = mulExt(z, exactPow10(rest), zmode);
  if (r.inexact) ixflag = true;
  bricks.push({ kind: "exact", exp: rest, mulInexact: r.inexact });
  z = { m: r.m, e: r.e };
  const zr = extToRat(z);
  const target = pow10(n);
  const diffN = zr.n - target * zr.d;
  return {
    n, zmode, m: z.m, e: z.e, bricks, ixflag,
    exact: diffN === 0n,
    delta: ratToNumber(diffN, target * zr.d), // z / 10^n − 1
  };
}

const DELTA_CACHE = new Map();
/** Relative error δ(n) of Algorithm Q's 10^n in a given z rounding mode (cached). */
export function deltaOf(n, zmode) {
  const key = `${zmode}:${n}`;
  if (!DELTA_CACHE.has(key)) DELTA_CACHE.set(key, pow10Q(n, zmode).delta);
  return DELTA_CACHE.get(key);
}

/** Coonen's proven bound on |δ|: (7/2)·2^-64 to nearest, 5·2^-63 directed. */
export function deltaBound(magMode) {
  return magMode === "nearest" ? 3.5 * 2 ** -64 : 5 * 2 ** -63;
}

// ---------------------------------------------------------- Algorithm L

export const LOG2_FIXED = 0x4d10; // log10(2) = 0.4D104D42… hex, chopped to 16 bits
export const L_FRACTION_BITS = 16;

/**
 * Algorithm L ("a poor man's logarithm") on x = m · 2^e2 (m > 0).
 * L2X = E + 0.f as 16.16 fixed point (fraction chopped), LOG2 chopped to 16
 * bits and bumped by one unit when L2X < 0, LOGX = ⌊LOG2 × L2X⌋.
 */
export function estimateLog10(m, e2) {
  const bl = bitLength(m);
  const E = bl - 1 + e2; // x = 2^E × 1.f
  const top = 1n << BigInt(bl - 1);
  const f16 = Number(((m - top) << BigInt(L_FRACTION_BITS)) / top);
  const l2x = E * 2 ** L_FRACTION_BITS + f16; // integer, 16 fraction bits
  const log2 = LOG2_FIXED + (l2x < 0 ? 1 : 0);
  const product = log2 * l2x; // integer with 32 fraction bits, |product| < 2^53
  const logx = Math.floor(product / 2 ** 32);
  return {
    E,
    f: ratToNumber(m - top, top),
    f16,
    l2x: l2x / 2 ** L_FRACTION_BITS,
    log2Fixed: log2,
    log2: log2 / 2 ** 16,
    bumped: l2x < 0,
    product: product / 2 ** 32,
    logx,
  };
}

/** Exact ⌊log10 x⌋ for x = m · 2^e2. */
export function exactDecade(m, e2, approx) {
  let k = Number.isFinite(approx) ? Math.floor(approx) : Math.floor(Math.log10(Number(m)) + e2 * Math.log10(2));
  const x = e2 >= 0 ? { n: m << BigInt(e2), d: 1n } : { n: m, d: 1n << BigInt(-e2) };
  const ge = (kk) => (kk >= 0 ? x.n >= pow10(kk) * x.d : x.n * pow10(-kk) >= x.d); // x >= 10^kk
  while (!ge(k)) k--;
  while (ge(k + 1)) k++;
  return k;
}

// --------------------------------------------------- Algorithms S and B

/** Map the user's rounding mode and the sign of x to a magnitude mode. */
export function magnitudeMode(mode, negative) {
  if (mode === "nearest") return "nearest";
  if (mode === "zero") return "down";
  if (mode === "up") return negative ? "down" : "up";
  if (mode === "down") return negative ? "up" : "down";
  throw new RangeError(`unknown rounding mode ${mode}`);
}

const flip = (m) => (m === "up" ? "down" : m === "down" ? "up" : m);

/** x · 10^s as an exact rational, x = m·2^e2. */
function scaledExact(m, e2, s) {
  let n = m;
  let d = 1n;
  if (s >= 0) n *= pow10(s); else d *= pow10(-s);
  if (e2 >= 0) n <<= BigInt(e2); else d <<= BigInt(-e2);
  return { n, d };
}

/**
 * Coonen's Algorithm B on a double x, N significant digits, rounding mode
 * "nearest" | "zero" | "up" | "down".  Options: product = "coonen" (chop +
 * sticky, as in the dissertation), "chop" (chop, no sticky bit), or
 * "nearest" (round the product to nearest) — the last two are "what if"
 * variants used to show why Algorithm S is written the way it is.
 */
export function coonen(x, N, mode = "nearest", { product = "coonen" } = {}) {
  const d = decodeDouble(x);
  if (d.special) return { special: d.special, x };
  const negative = d.negative;
  const m = negative ? -d.significand : d.significand;
  const e2 = d.exponent;
  const magMode = magnitudeMode(mode, negative);
  const L = estimateLog10(m, e2);
  const trueDecade = exactDecade(m, e2, Math.log10(Math.abs(x)));
  const passes = [];
  let logx = L.logx;
  const tenN = pow10(N);
  const tenN1 = pow10(N - 1);
  for (let guard = 0; guard < 4; guard++) {
    const scale = N - 1 - logx; // B3
    const zmode = magMode === "nearest" ? "nearest" : (scale < 0 ? flip(magMode) : magMode); // S0
    const q = pow10Q(Math.abs(scale), zmode); // S1
    // S2: x·z or x/z, exact, then rounded toward zero to 64 bits.
    let pn, pd;
    if (scale >= 0) {
      pn = m * q.m; pd = 1n;
      const ex = e2 + q.e;
      if (ex >= 0) pn <<= BigInt(ex); else pd <<= BigInt(-ex);
    } else {
      pn = m; pd = q.m;
      const ex = e2 - q.e;
      if (ex >= 0) pn <<= BigInt(ex); else pd <<= BigInt(-ex);
    }
    const chopped = roundToExt(pn, pd, product === "nearest" ? "nearest" : "down");
    let regM = chopped.m;
    const sticky = product === "coonen" && chopped.inexact;
    if (sticky) regM |= 1n; // S3: OR the inexact flag into the last bit
    const reg = { m: regM, e: chopped.e };
    const rr = extToRat(reg);
    let r = roundToInteger(rr.n, rr.d, magMode); // B5
    const exact = scaledExact(m, e2, scale);
    const pass = { logx, scale, zmode, q, product: { n: pn, d: pd }, chopped, sticky, reg, exact, rounded: r };
    passes.push(pass);
    if (r >= tenN) { pass.check = "retry"; logx += 1; continue; } // B6
    if (r < tenN1) { pass.check = "forced"; r = tenN1; } else pass.check = "ok";
    const correct = correctlyRounded(x, N, mode, { m, e2, trueDecade });
    const readBack = Number(`${negative ? "-" : ""}${r}e${logx - N + 1}`);
    return {
      x, N, mode, magMode, negative, m, e2, L, trueDecade,
      logxLow: L.logx < trueDecade,
      passes,
      digits: r,
      logx,
      correct,
      isCorrect: correct.digits === r && correct.logx === logx,
      roundTrips: readBack === x,
      readBack,
    };
  }
  throw new Error("Algorithm B did not terminate");
}

/** Exact reference: x correctly rounded to N significant digits in `mode`. */
export function correctlyRounded(x, N, mode = "nearest", pre) {
  let m, e2, D, negative;
  if (pre) { ({ m, e2 } = pre); D = pre.trueDecade; negative = x < 0; }
  else {
    const d = decodeDouble(x);
    negative = d.negative;
    m = negative ? -d.significand : d.significand;
    e2 = d.exponent;
    D = exactDecade(m, e2, Math.log10(Math.abs(x)));
  }
  const s = scaledExact(m, e2, N - 1 - D);
  let r = roundToInteger(s.n, s.d, magnitudeMode(mode, negative));
  if (r >= pow10(N)) { r /= 10n; D += 1; }
  return { digits: r, logx: D };
}

/**
 * Fuzz-band geometry of one pass (all in ulp₁₀ units, i.e. units of the
 * last printed digit): exact Y = x·10^SCALE, product P = x·z, register R.
 */
export function bandOf(result, passIndex = result.passes.length - 1) {
  const pass = result.passes[passIndex];
  const { exact: Y, product: P, reg, q } = pass;
  const R = extToRat(reg);
  const k = Y.n / Y.d; // ⌊Y⌋
  const nearest = result.magMode === "nearest";
  // decision point nearest to Y: k + ½ (to nearest) or the nearest integer (directed)
  let c;
  if (nearest) c = { n: 2n * k + 1n, d: 2n };
  else c = { n: (2n * (Y.n - k * Y.d) >= Y.d ? k + 1n : k), d: 1n };
  const off = (A) => ratToNumber(A.n * c.d - c.n * A.d, A.d * c.d);
  const minus = (A, B) => ratToNumber(A.n * B.d - B.n * A.d, A.d * B.d);
  const yNum = ratToNumber(Y.n, Y.d);
  const intPart = R.n / R.d;
  const intBits = bitLength(intPart);
  // fraction of the register in units of its last place, and chopped tail
  const lastPlace = reg.e; // value of the last bit is 2^e
  const fracUnits = reg.e < 0 ? reg.m & ((1n << BigInt(-reg.e)) - 1n) : 0n;
  const choppedR = extToRat({ m: pass.chopped.m, e: pass.chopped.e });
  const tail = { n: P.n * choppedR.d - choppedR.n * P.d, d: P.d * choppedR.d }; // P − chop(P) ≥ 0 (chop variants)
  const tailBits = reg.e < 0 && tail.n > 0n ? (tail.n << BigInt(-reg.e + 12)) / tail.d : 0n;
  const dBound = q.exact ? 0 : deltaBound(result.magMode);
  const h = yNum * dBound;
  const side = nearest ? 0 : result.magMode === "up" ? 1 : -1;
  const yOff = off(Y);
  return {
    pass, k, c, decisionIsHalf: nearest,
    Y, P, R,
    yNum,
    yOff, // Y − c
    pOff: off(P),
    rOff: off(R),
    shift: minus(P, Y), // P − Y: the power of ten's lie
    rMinusY: minus(R, Y),
    yFrac: ratToNumber(Y.n - k * Y.d, Y.d),
    delta: q.delta,
    deltaBound: dBound,
    h,
    bandLo: side === 1 ? 0 : -h, // relative to Y
    bandHi: side === -1 ? 0 : h,
    // can the power of ten's error (on its known side) carry P across c?
    straddles: h > 0 && (nearest ? Math.abs(yOff) <= h : side === 1 ? (yOff <= 0 && -yOff <= h) : (yOff >= 0 && yOff <= h)),
    intBits,
    fracBits: -lastPlace,
    fracUnits,
    grid: 2 ** lastPlace,
    tailBits, // first 12 bits of the chopped-off tail
    gridPhaseY: reg.e < 0 ? ratToNumber((Y.n << BigInt(-reg.e)) % Y.d, Y.d << BigInt(-reg.e)) : 0, // Y mod grid
  };
}

// --------------------------------------------------------------- sampling

/** Random finite positive double; range = {kind:"decade", k} or {kind:"all"}. */
export function randomDouble(range, rand = Math.random) {
  const r53 = () => BigInt(Math.floor(rand() * 2 ** 26)) * (1n << 27n) + BigInt(Math.floor(rand() * 2 ** 27));
  if (range.kind === "decade") {
    const lo = bitsOf(Number(`1e${range.k}`));
    const hi = bitsOf(Number(`1e${range.k + 1}`));
    const span = hi - lo;
    const off = (r53() * (1n << 11n) + BigInt(Math.floor(rand() * 2048))) % span;
    return fromBits(lo + off);
  }
  for (;;) {
    const exp = BigInt(Math.floor(rand() * 2047));
    const frac = r53() & ((1n << 52n) - 1n);
    const v = fromBits((exp << 52n) | frac);
    if (v > 0 && Number.isFinite(v)) return v;
  }
}

/** Condensed verdict for one sample (used by the misround catcher). */
export function classify(x, N, mode) {
  const res = coonen(x, N, mode);
  const b = bandOf(res);
  return {
    x,
    isCorrect: res.isCorrect,
    roundTrips: res.roundTrips,
    scale: b.pass.scale,
    zExact: b.pass.q.exact,
    offset: b.yOff,
    shift: b.shift,
    h: b.h,
  };
}

// --------------------------------------------------------- round-trip budget

/** Coonen's recovery budget (§3.4) in ulp₂ for a p-bit extended significand. */
export function recoveryBudget(p = 64) {
  const ratio = 2 ** 53 / 1e16; // ulp₁₀/ulp₂ ≤ 10^-16 / 2^-53 for 17 digits
  const printExtra = 1e17 * 3.5 * 2 ** -p; // ulp₁₀
  const readExtra = 2 ** 53 * 3.5 * 2 ** -p; // ulp₂ (Algorithm D)
  const print = ratio * (0.5 + printExtra);
  const read = 0.5 + readExtra;
  return { ratio, printExtra, readExtra, print, read, total: print + read };
}
