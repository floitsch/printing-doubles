// Copyright (C) 2026 Toit contributors.
//
// Pure model for the "1000-hour clock" Dragonbox explanation. No DOM access,
// so node tests can import it.
//
// computeNearest() is a BigInt transcription of impl::compute_nearest from
// jk-jeon/dragonbox (include/dragonbox/dragonbox.h) for binary64 with the
// default policies (nearest-to-even in both directions, full cache, trailing
// zeros removed). Everything else in this file is exact rational arithmetic
// that the page uses to draw the pictures (the real algorithm never computes
// these rationals).

import { formatDecimal } from "../../js/float.js";

export const KAPPA = 2;
export const BIG_DIVISOR = 1000n; // 10^(kappa + 1)
export const SMALL_DIVISOR = 100n; // 10^kappa
const M64 = (1n << 64n) - 1n;
const M128 = (1n << 128n) - 1n;

// ---------------------------------------------------------------------------
// The integer "log" helpers of dragonbox.h (exact for the exponent ranges used).
export const floorLog10Pow2 = (e) => Math.floor((e * 315653) / 2 ** 20);
export const floorLog2Pow10 = (k) => Math.floor((k * 1741647) / 2 ** 19);
export const floorLog10Pow2MinusLog10_4_3 = (e) => Math.floor((e * 631305 - 261663) / 2 ** 21);

const POW10 = [1n];
export function pow10(n) {
  while (POW10.length <= n) POW10.push(POW10.at(-1) * 10n);
  return POW10[n];
}

// ---------------------------------------------------------------------------
// Decoding.
export function bitsOf(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigUint64(0);
}

export function fromBits(bits) {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, bits);
  return view.getFloat64(0);
}

/** fc and e with value = fc * 2^e; `shorter` marks the power-of-two case. */
export function decompose(value) {
  const bits = bitsOf(Math.abs(value));
  const mantissa = bits & ((1n << 52n) - 1n);
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  if (exponentBits === 0) return { fc: mantissa, e: -1074, subnormal: true, shorter: false, even: (mantissa & 1n) === 0n };
  return {
    fc: mantissa | (1n << 52n),
    e: exponentBits - 1075,
    subnormal: false,
    shorter: mantissa === 0n,
    even: (mantissa & 1n) === 0n,
  };
}

// ---------------------------------------------------------------------------
// The cache: phi_k = ceil(10^k * 2^(127 - floor(k log2 10))), a 128-bit value.
const cacheMemo = new Map();
export function cacheEntry(k) {
  if (cacheMemo.has(k)) return cacheMemo.get(k);
  const shift = 127 - floorLog2Pow10(k);
  let num = k >= 0 ? pow10(k) : 1n;
  let den = k >= 0 ? 1n : pow10(-k);
  if (shift >= 0) num <<= BigInt(shift); else den <<= BigInt(-shift);
  let entry = num / den;
  if (entry * den !== num) entry += 1n;
  cacheMemo.set(k, entry);
  return entry;
}

function computeMulParity(twoF, cache, beta) {
  const product = (twoF * cache) & M128; // umul192_lower128
  const high = product >> 64n;
  const low = product & M64;
  const b = BigInt(beta);
  return {
    parity: ((high >> (64n - b)) & 1n) === 1n,
    isInteger: ((((high << b) & M64) | (low >> (64n - b))) === 0n),
  };
}

function removeTrailingZeros(significand, exponent) {
  let removed = 0;
  while (significand !== 0n && significand % 10n === 0n) {
    significand /= 10n;
    removed++;
  }
  return { significand, exponent: exponent + removed, removed };
}

// ---------------------------------------------------------------------------
/**
 * Faithful port of compute_nearest. Returns the decimal result plus every
 * intermediate the page shows (named as in dragonbox.h where possible).
 */
export function computeNearest(value) {
  if (!Number.isFinite(value) || value === 0) throw new RangeError("expects a finite, non-zero double");
  const { fc, e, shorter, even } = decompose(value);
  const includeEndpoints = even; // nearest-to-even: interval closed iff fc even
  const T = { value: Math.abs(value), fc, e, even, includeEndpoints, shorter };

  if (shorter) {
    const minus_k = floorLog10Pow2MinusLog10_4_3(e);
    const beta = e + floorLog2Pow10(-minus_k);
    const cache = cacheEntry(-minus_k);
    const high = cache >> 64n;
    let xi = (high - (high >> 54n)) >> BigInt(11 - beta);
    let zi = (high + (high >> 53n)) >> BigInt(11 - beta);
    Object.assign(T, { path: "shorter", k: -minus_k, minus_k, beta, cache });
    // fc = 2^52 is even, so both endpoints are included under nearest-to-even:
    // only the "left endpoint is not an integer" adjustment can apply.
    if (!includeEndpoints && e >= 0 && e <= 3) zi--;
    if (!includeEndpoints || !(e >= 2 && e <= 3)) xi++;
    Object.assign(T, { xi, zi });
    let decimal_significand = zi / 10n;
    if (decimal_significand * 10n >= xi) {
      const stripped = removeTrailingZeros(decimal_significand, minus_k + 1);
      Object.assign(T, { sub: "grid10", significand: stripped.significand, exponent: stripped.exponent, removed: stripped.removed });
      return finish(T);
    }
    decimal_significand = ((high >> BigInt(10 - beta)) + 1n) / 2n;
    T.roundUpY = decimal_significand;
    if ((decimal_significand & 1n) === 1n && e === -77) decimal_significand--;
    else if (decimal_significand < xi) decimal_significand++;
    Object.assign(T, { sub: "roundup", significand: decimal_significand, exponent: minus_k, removed: 0 });
    return finish(T);
  }

  const two_fc = 2n * fc;
  const minus_k = floorLog10Pow2(e) - KAPPA;
  const cache = cacheEntry(-minus_k);
  const beta = e + floorLog2Pow10(-minus_k);
  const deltai = (cache >> 64n) >> BigInt(63 - beta); // compute_delta: a shift, no multiply
  const product = ((two_fc | 1n) << BigInt(beta)) * cache; // the one 128-bit multiply
  const zi = product >> 128n; // z_result.integer_part
  const zIsInteger = ((product >> 64n) & M64) === 0n; // z_result.is_integer
  let decimal_significand = zi / BIG_DIVISOR;
  let r = zi - BIG_DIVISOR * decimal_significand;
  Object.assign(T, { path: "normal", k: -minus_k, minus_k, beta, cache, deltai, zi, zIsInteger, s: decimal_significand, r0: r });

  let big = true;
  if (r < deltai) {
    if (r === 0n && zIsInteger && !includeEndpoints) {
      decimal_significand--;
      r = BIG_DIVISOR;
      T.excludedRight = true;
      big = false;
    }
  } else if (r > deltai) {
    big = false;
  } else {
    const x_result = computeMulParity(two_fc - 1n, cache, beta);
    T.xResult = x_result;
    if (!(x_result.parity || (x_result.isInteger && includeEndpoints))) big = false;
  }
  T.r = r;

  if (big) {
    const stripped = removeTrailingZeros(decimal_significand, minus_k + KAPPA + 1);
    Object.assign(T, { sub: "big", significand: stripped.significand, exponent: stripped.exponent, removed: stripped.removed, bigSignificand: decimal_significand });
    return finish(T);
  }

  T.sBeforeSmall = decimal_significand;
  decimal_significand *= 10n;
  let dist = r - deltai / 2n + SMALL_DIVISOR / 2n;
  const approx_y_parity = ((dist ^ (SMALL_DIVISOR / 2n)) & 1n) === 1n;
  const divisible = dist % SMALL_DIVISOR === 0n;
  T.dist = dist;
  T.digit0 = dist / SMALL_DIVISOR;
  decimal_significand += dist / SMALL_DIVISOR;
  T.divisible = divisible;
  if (divisible) {
    const y_result = computeMulParity(two_fc, cache, beta);
    Object.assign(T, { yResult: y_result, approxYParity: approx_y_parity });
    if (y_result.parity !== approx_y_parity) { decimal_significand--; T.yFix = "parity"; }
    else if ((decimal_significand & 1n) === 1n && y_result.isInteger) { decimal_significand--; T.yFix = "tie"; }
  }
  T.digit = decimal_significand - 10n * T.sBeforeSmall;
  Object.assign(T, { sub: "small", significand: decimal_significand, exponent: minus_k + KAPPA, removed: 0 });
  return finish(T);
}

function finish(T) {
  T.text = formatDecimal(T.significand, T.exponent);
  T.digits = T.significand.toString().length;
  T.roundTrips = Number(`${T.significand}e${T.exponent}`) === T.value;
  return T;
}

// ---------------------------------------------------------------------------
// Exact rationals {n, d}, d > 0.
export const Q = (n, d = 1n) => {
  if (d < 0n) { n = -n; d = -d; }
  return { n, d };
};
export const qSub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
export const qAdd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
export const qMulInt = (a, m) => Q(a.n * m, a.d);
export const qDivInt = (a, m) => Q(a.n, a.d * m);
export const qCmp = (a, b) => {
  const diff = a.n * b.d - b.n * a.d;
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
};
export function qFloor(a) {
  let q = a.n / a.d;
  if (a.n < 0n && q * a.d !== a.n) q--;
  return q;
}
export function qCeil(a) { return -qFloor(Q(-a.n, a.d)); }
export const qIsInteger = (a) => a.n % a.d === 0n;
/** Double-precision approximation, accurate for values of moderate size. */
export function qToNumber(a) {
  const scaled = (a.n * 1000000000n) / a.d;
  return Number(scaled) / 1e9;
}

/** Decimal text, truncated after `places` digits; "…" marks an inexact cut. */
export function qFixed(a, places = 2) {
  const negative = a.n < 0n;
  const n = negative ? -a.n : a.n;
  const scale = pow10(places);
  const scaled = (n * scale) / a.d;
  const exact = scaled * a.d === n * scale;
  const int = scaled / scale;
  let frac = (scaled % scale).toString().padStart(places, "0");
  let text = int.toString();
  if (exact) frac = frac.replace(/0+$/, "");
  if (frac) text += `.${frac}`;
  if (!exact) text += "…";
  return (negative && n !== 0n ? "−" : "") + text;
}

/** m * 2^(e-1) * 10^k as an exact rational (m = 2fc-1, 2fc, 2fc+1, 2). */
export function scaled(m, e, k) {
  let n = m;
  let d = 1n;
  if (e - 1 >= 0) n <<= BigInt(e - 1); else d <<= BigInt(1 - e);
  if (k >= 0) n *= pow10(k); else d *= pow10(-k);
  return Q(n, d);
}

/** k that Dragonbox uses for a regular interval: kappa - floor(e log10 2). */
export const dragonboxK = (e) => KAPPA - floorLog10Pow2(e);

/** The scaled rounding window of a regular-interval double at scale 10^k. */
export function scaledWindow(value, k) {
  const { fc, e, even } = decompose(value);
  const x = scaled(2n * fc - 1n, e, k);
  const y = scaled(2n * fc, e, k);
  const z = scaled(2n * fc + 1n, e, k);
  const delta = scaled(2n, e, k);
  return { x, y, z, delta, closed: even, k, e, fc };
}

/** Multiples of `unit` inside [lo, hi] (endpoints only if closed). */
export function multiplesInside(lo, hi, unit, closed) {
  let first = qCeil(qDivInt(lo, unit));
  let last = qFloor(qDivInt(hi, unit));
  if (!closed && qIsInteger(qDivInt(lo, unit))) first++;
  if (!closed && qIsInteger(qDivInt(hi, unit))) last--;
  const count = last >= first ? last - first + 1n : 0n;
  return { first, last, count };
}

// ---------------------------------------------------------------------------
/** The two-scale ruler, possibly at a hypothetical scale 10^(k + dk). */
export function rulerState(value, dk = 0) {
  const trace = computeNearest(value);
  if (trace.shorter) return { shorter: true, trace };
  const k = trace.k + dk;
  const w = scaledWindow(value, k);
  const thousands = multiplesInside(w.x, w.z, 1000n, w.closed);
  const hundreds = multiplesInside(w.x, w.z, 100n, w.closed);
  return { shorter: false, trace, dk, k, ...w, thousands, hundreds, deltaNumber: qToNumber(w.delta) };
}

// ---------------------------------------------------------------------------
/**
 * Everything the clock shows, measured relative to B = 1000 * floor(zi / 1000)
 * ("12 o'clock"). Positions are exact rationals; *Mod values are in [0, 1000).
 */
export function clockState(value) {
  const trace = computeNearest(value);
  if (trace.shorter) return { shorter: true, trace };
  const w = scaledWindow(value, trace.k);
  const B = 1000n * trace.s;
  const base = Q(B);
  const zc = qSub(w.z, base);
  const xc = qSub(w.x, base);
  const yc = qSub(w.y, base);
  // Exact geometry: is 12 o'clock (relative position 0) inside the arc?
  const zCmp = qCmp(zc, Q(0n));
  const xCmp = qCmp(xc, Q(0n));
  const covers12 = w.closed ? (xCmp <= 0 && zCmp >= 0) : (xCmp < 0 && zCmp > 0);
  const rightOn12 = zCmp === 0;
  const leftOn12 = xCmp === 0;
  let markRel;
  if (trace.sub === "big") markRel = 0n;
  else markRel = 1000n * (trace.sBeforeSmall - trace.s) + 100n * trace.digit;
  const markMod = ((markRel % 1000n) + 1000n) % 1000n;
  const mod = (q) => {
    const f = qFloor(qDivInt(q, 1000n));
    return qSub(q, Q(1000n * f));
  };
  return {
    shorter: false,
    trace,
    ...w,
    B,
    zc, xc, yc,
    zMod: mod(zc), xMod: mod(xc), yMod: mod(yc),
    covers12, rightOn12, leftOn12,
    markRel, markMod,
    prefix: trace.s.toString(),
    rText: trace.r0.toString().padStart(Math.min(3, trace.zi.toString().length), "0"),
  };
}

// ---------------------------------------------------------------------------
/** Exact picture of the lopsided power-of-two window at Dragonbox's scale. */
export function shorterState(value) {
  const trace = computeNearest(value);
  if (!trace.shorter) return { shorter: false, trace };
  const { fc, e } = decompose(value);
  const k = trace.k;
  // [ (fc - 1/4) 2^e, (fc + 1/2) 2^e ] scaled by 10^k; m in units of 2^(e-2).
  const at = (m) => {
    let n = m;
    let d = 1n;
    if (e - 2 >= 0) n <<= BigInt(e - 2); else d <<= BigInt(2 - e);
    if (k >= 0) n *= pow10(k); else d *= pow10(-k);
    return Q(n, d);
  };
  const x = at(4n * fc - 1n);
  const y = at(4n * fc);
  const z = at(4n * fc + 2n);
  const ghostX = at(4n * fc - 2n); // where a symmetric window would start
  const tens = multiplesInside(x, z, 10n, true);
  const ghostTens = multiplesInside(ghostX, z, 10n, true);
  // A candidate in the ghost part only: the one a symmetric window would pick.
  let ghostCandidate = null;
  if (tens.count === 0n && ghostTens.count > 0n) {
    const scaledValue = ghostTens.last * 10n;
    const back = Number(`${scaledValue}e${-k}`);
    const stripped = removeTrailingZeros(scaledValue, -k);
    ghostCandidate = { scaled: scaledValue, text: formatDecimal(stripped.significand, stripped.exponent), readsBackAs: back };
  }
  return { shorter: true, trace, k, e, fc, x, y, z, ghostX, tens, ghostTens, ghostCandidate };
}

// ---------------------------------------------------------------------------
/** Random positive finite double with uniformly random bits (rng returns a 64-bit BigInt). */
export function randomDouble(rng) {
  for (;;) {
    const bits = rng() & ((1n << 63n) - 1n);
    const exponentBits = Number(bits >> 52n);
    if (exponentBits === 0x7ff || bits === 0n) continue;
    return fromBits(bits);
  }
}

/** Deterministic xorshift64 for tests and reproducible samples. */
export function xorshift64(seed = 0x9e3779b97f4a7c15n) {
  let state = seed & M64 || 1n;
  return () => {
    state ^= (state << 13n) & M64;
    state ^= state >> 7n;
    state ^= (state << 17n) & M64;
    return state;
  };
}

/** The limit of the hit rate for uniformly random bits: E[delta]/1000 = 0.9/ln 10. */
export const EXPECTED_HIT_RATE = 0.9 / Math.LN10;

/** Split a scaled integer into the part Dragonbox keeps and the last three digits. */
export function splitThousands(n) {
  const s = n.toString();
  if (s.length <= 3) return { prefix: "0", last: s.padStart(3, "0") };
  return { prefix: s.slice(0, -3), last: s.slice(-3) };
}

/** Parse a user expression: a number, a+b, a*b, a/b, 2^n / 2**n, or n·2^m. */
export function parseInput(text) {
  const t = String(text).trim().replace(/\s+/g, "").replace(/[·×]/g, "*").replace(/−/g, "-");
  if (!t) return NaN;
  const pow = t.match(/^(?:(\d+(?:\.\d*)?)\*)?2(?:\^|\*\*)(-?\d+)$/);
  if (pow) {
    const factor = pow[1] ? Number(pow[1]) : 1;
    return factor * 2 ** Number(pow[2]);
  }
  const bin = t.match(/^([^+*/]+?)([+*/])([^+*/]+)$/);
  if (bin && !/e$/i.test(bin[1])) {
    const a = Number(bin[1]);
    const b = Number(bin[3]);
    if (bin[2] === "+") return a + b;
    if (bin[2] === "*") return a * b;
    return a / b;
  }
  return Number(t);
}
