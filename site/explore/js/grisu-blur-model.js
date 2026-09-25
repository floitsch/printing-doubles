// Copyright (C) 2026 Toit contributors.
//
// Pure model for explore/grisu-blur.html ("Blurry fences"). No DOM.
//
// A BigInt port of Grisu3 as written in google/double-conversion
// (fast-dtoa.cc: DigitGen + RoundWeed, cached-powers.cc, diy-fp.h), generalised
// to a q-bit "DiyFp" so the page can turn the precision knob. With q = 64 it is
// the library's algorithm step for step (the tests compare it with
// site/js/grisu-reference.js). For other q the cache keeps the library's
// structure (10^k for k = -348, -340, ..., 340, rounded to nearest q bits) and
// the target window keeps its width: scaled exponent in [-(q-4), -(q-32)],
// which is [-60, -32] for q = 64.
//
// Everything the page draws is measured in "units": 1 unit = 2^E, where E is
// the exponent of the scaled DiyFp values (the weight of their last bit).
// Exact values (the true boundaries m-, m+ and v, scaled by the same power of
// ten) are BigInt rationals in the same units.

import { decodeDouble } from "../../js/float.js";
import { shortestDecimal } from "../../js/oracle.js";

export const Q_LIBRARY = 64;
export const Q_MIN = 55;
export const Q_MAX = 80;
const LOG10_2 = 0.30102999566398114; // the constant kD_1_LOG2_10 in cached-powers.cc
const CACHE_OFFSET = 348; // kCachedPowersOffset
const CACHE_STEP = 8; // kDecimalExponentDistance

const POW10 = [1n];
export function pow10(n) {
  while (POW10.length <= n) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[n];
}

// ---------------------------------------------------------------------------
// Rationals {n, d}, d > 0 (not necessarily reduced).
// ---------------------------------------------------------------------------

export const rat = (n, d = 1n) => (d < 0n ? { n: -n, d: -d } : { n, d });
export const rsub = (a, b) => (a.d === b.d ? { n: a.n - b.n, d: a.d } : { n: a.n * b.d - b.n * a.d, d: a.d * b.d });
export const radd = (a, b) => (a.d === b.d ? { n: a.n + b.n, d: a.d } : { n: a.n * b.d + b.n * a.d, d: a.d * b.d });
export const rcmp = (a, b) => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
export const rhalf = (a) => ({ n: a.n, d: a.d * 2n });

/** Correctly rounded-enough Number of a (possibly huge) rational. */
export function rnum(a) {
  const neg = a.n < 0n;
  const n = neg ? -a.n : a.n;
  const q = n / a.d;
  const r = n - q * a.d;
  const x = Number(q) + Number((r << 53n) / a.d) / 2 ** 53;
  return neg ? -x : x;
}

/** Offset a - b as a Number (exact subtraction first, so no cancellation). */
export const roff = (a, b) => rnum(rsub(a, b));

// ---------------------------------------------------------------------------
// DiyFp pieces.
// ---------------------------------------------------------------------------

function bitLength(x) {
  return x === 0n ? 0 : x.toString(2).length;
}

export function normalizeQ(x, q) {
  const shift = q - bitLength(x.f);
  return { f: x.f << BigInt(shift), e: x.e - shift };
}

/** DiyFp::Times generalised: upper q bits of the 2q-bit product, rounded half up. */
export function timesQ(a, b, q) {
  const Q = BigInt(q);
  return { f: (a.f * b.f + (1n << (Q - 1n))) >> Q, e: a.e + b.e + q };
}

const powerCache = new Map();
/** 10^k normalised to q bits, significand rounded to nearest (as in cached-powers.cc for q = 64). */
export function powerQ(k, q) {
  const key = `${k}:${q}`;
  let hit = powerCache.get(key);
  if (hit) return hit;
  const num0 = k >= 0 ? pow10(k) : 1n;
  const den0 = k >= 0 ? 1n : pow10(-k);
  let e = bitLength(num0) - bitLength(den0) - q;
  const top = 1n << BigInt(q);
  for (;;) {
    let n = num0, d = den0;
    if (e >= 0) d <<= BigInt(e); else n <<= BigInt(-e);
    const f0 = n / d;
    if (f0 >= top) { e++; continue; }
    if (f0 < top >> 1n) { e--; continue; }
    const r = n - f0 * d;
    let f = 2n * r >= d ? f0 + 1n : f0;
    if (f === top) { f >>= 1n; e++; }
    hit = { f, e, k, exact: r === 0n };
    powerCache.set(key, hit);
    return hit;
  }
}

export const windowQ = (q) => ({ alpha: -(q - 4), gamma: -(q - 32) });

/** GetCachedPowerForBinaryExponentRange, generalised to q bits. */
export function cachedPowerFor(wE, q) {
  const { alpha, gamma } = windowQ(q);
  const minExponent = alpha - (wE + q);
  const kk = Math.ceil((minExponent + q - 1) * LOG10_2);
  const index = Math.trunc((CACHE_OFFSET + kk - 1) / CACHE_STEP) + 1;
  const k = -CACHE_OFFSET + CACHE_STEP * index;
  const c = powerQ(k, q);
  const t = wE + c.e + q;
  if (t < alpha || t > gamma) throw new Error(`no cached power for q=${q}, w.e=${wE}`);
  return { ...c, index };
}

/** Decoded positive finite double plus its exact boundaries (ieee.h NormalizedBoundaries). */
export function boundariesQ(v, q) {
  const d = decodeDouble(v);
  if (d.special || d.negative) throw new RangeError("expects a positive finite double");
  const f = d.significand, e = d.exponent;
  const w = normalizeQ({ f, e }, q);
  const plus = normalizeQ({ f: 2n * f + 1n, e: e - 1 }, q);
  const lowerCloser = d.fraction === 0n && d.exponentBits > 1;
  let minus = lowerCloser ? { f: 4n * f - 1n, e: e - 2 } : { f: 2n * f - 1n, e: e - 1 };
  minus = { f: minus.f << BigInt(minus.e - plus.e), e: plus.e };
  return { d, f, e, w, plus, minus, lowerCloser };
}

// ---------------------------------------------------------------------------
// Grisu3 with a full trace.
// ---------------------------------------------------------------------------

function digitCount(x) {
  return x === 0n ? 0 : x.toString().length;
}

/**
 * Runs Grisu3 on v > 0 with q-bit DiyFps. Returns a trace:
 *   positions (in units, as rationals) of exact m-, v, m+ and computed LO, W, HI,
 *   too_low, too_high, the digit ladder, the RoundWeed walk and the verdict.
 */
export function grisu3(v, q = Q_LIBRARY) {
  const b = boundariesQ(v, q);
  const c = cachedPowerFor(b.w.e, q);
  const LO = timesQ(b.minus, c, q), W = timesQ(b.w, c, q), HI = timesQ(b.plus, c, q);
  const E = W.e;
  const sh = BigInt(-E);
  const one = 1n << sh;

  // Exact scaled values in units: x.f * 10^k / 2^(c.e + q).
  const s = c.e + q;
  const exact = (xf) => {
    let n = xf * (c.k >= 0 ? pow10(c.k) : 1n);
    let dd = c.k >= 0 ? 1n : pow10(-c.k);
    if (s >= 0) dd <<= BigInt(s); else n <<= BigInt(-s);
    return rat(n, dd);
  };
  const ex = { mMinus: exact(b.minus.f), v: exact(b.w.f), mPlus: exact(b.plus.f) };

  let unit = 1n;
  const tooLow = LO.f - unit;
  const tooHigh = HI.f + unit;
  let unsafe = tooHigh - tooLow;
  const unsafe0 = unsafe;
  let integrals = tooHigh >> sh;
  let fractionals = tooHigh & (one - 1n);
  let kappa = digitCount(integrals);
  let divisor = kappa > 0 ? pow10(kappa - 1) : 0n;
  const digits = [];
  const steps = [];
  let stop = null;

  // Integral part: digits of too_high >> -E, one division per digit.
  while (kappa > 0) {
    const digit = integrals / divisor;
    digits.push(Number(digit));
    integrals %= divisor;
    kappa--;
    const rest = (integrals << sh) + fractionals;
    const hit = rest < unsafe;
    steps.push({ phase: "int", digit: Number(digit), digits: digits.join(""), kappa, rest, unsafe, unit, hit, tenKappa: divisor << sh });
    if (hit) { stop = { rest, tenKappa: divisor << sh, dist: tooHigh - W.f }; break; }
    divisor /= 10n;
  }
  // Fractional part: multiply by 10, the bits that cross the binary point are the next digit.
  if (!stop) {
    for (;;) {
      fractionals *= 10n; unit *= 10n; unsafe *= 10n;
      const digit = fractionals >> sh;
      digits.push(Number(digit));
      fractionals &= one - 1n;
      kappa--;
      const hit = fractionals < unsafe;
      steps.push({ phase: "frac", digit: Number(digit), digits: digits.join(""), kappa, rest: fractionals, unsafe, unit, hit, tenKappa: one });
      if (hit) { stop = { rest: fractionals, tenKappa: one, dist: (tooHigh - W.f) * unit }; break; }
    }
  }
  // No leading zeros: too_high >= 2^(q-1) * 2^E >= 2^3, so the integral part is at least 8.
  const firstDigits = digits.join("");

  // RoundWeed, instrumented.
  const small = stop.dist - unit, big = stop.dist + unit;
  let rest = stop.rest;
  const tk = stop.tenKappa;
  const walk = [{ digits: firstDigits, rest }];
  const buf = digits.slice();
  const canStep = (r, target, strict) => r < target && unsafe - r >= tk &&
    (r + tk < target || (strict ? target - r > r + tk - target : target - r >= r + tk - target));
  while (canStep(rest, small, false)) {
    buf[buf.length - 1]--;
    rest += tk;
    walk.push({ digits: buf.join(""), rest });
  }
  let walkStop;
  if (!(rest < small)) walkStop = "reached";
  else if (!(unsafe - rest >= tk)) walkStop = "edge";
  else walkStop = "farther";
  const ambiguous = canStep(rest, big, true);
  const safeLow = 2n * unit <= rest; // candidate at least 2 units below too_high
  const safeHigh = rest <= unsafe - 4n * unit; // candidate at least 4 units above too_low
  let verdict;
  if (ambiguous) verdict = "round";
  else if (!safeLow || !safeHigh) verdict = "weed";
  else verdict = "ok";

  const toUnits = (x) => rat(x, unit); // current code scale -> original units
  const tooHighR = rat(tooHigh);
  const candAt = (r) => rsub(tooHighR, toUnits(r));
  const outDigits = buf.join("");
  const exp10 = kappa - c.k;

  // Ground truth (exact): is the final candidate strictly inside (m-, m+)?
  const cand = candAt(rest);
  const trulyInside = rcmp(ex.mMinus, cand) < 0 && rcmp(cand, ex.mPlus) < 0;
  const onBoundary = rcmp(ex.mMinus, cand) === 0 || rcmp(cand, ex.mPlus) === 0;

  return {
    v, q, E, one, c, b, LO, W, HI, ex,
    tooLow, tooHigh, unsafe0,
    steps, stopKappa: kappa, tenKappa: toUnits(tk), unitScale: unit,
    walk: walk.map((x) => ({ digits: x.digits, rest: toUnits(x.rest), at: candAt(x.rest) })),
    walkStop, ambiguous,
    small: toUnits(small), big: toUnits(big),
    safeLow, safeHigh,
    finalRest: toUnits(rest), candidate: cand,
    verdict, ok: verdict === "ok",
    digits: outDigits, exp10,
    trulyInside, onBoundary,
  };
}

/** Grisu3 verdict only (fast path for the sampler / sweep). */
export function grisu3Quick(v, q) {
  const b = boundariesQ(v, q);
  const c = cachedPowerFor(b.w.e, q);
  const LO = timesQ(b.minus, c, q), W = timesQ(b.w, c, q), HI = timesQ(b.plus, c, q);
  const sh = BigInt(-W.e), one = 1n << sh;
  let unit = 1n;
  const tooHigh = HI.f + unit;
  let unsafe = tooHigh - (LO.f - unit);
  let integrals = tooHigh >> sh;
  let fractionals = tooHigh & (one - 1n);
  let kappa = digitCount(integrals);
  let divisor = kappa > 0 ? pow10(kappa - 1) : 0n;
  let digits = "";
  const weed = (rest, tk, dist) => {
    const small = dist - unit, big = dist + unit;
    let last = Number(digits[digits.length - 1]);
    while (rest < small && unsafe - rest >= tk && (rest + tk < small || small - rest >= rest + tk - small)) { last--; rest += tk; }
    digits = digits.slice(0, -1) + last;
    if (rest < big && unsafe - rest >= tk && (rest + tk < big || big - rest > rest + tk - big)) return { verdict: "round" };
    if (!(2n * unit <= rest && rest <= unsafe - 4n * unit)) return { verdict: "weed" };
    return { verdict: "ok", digits, exp10: kappa - c.k };
  };
  while (kappa > 0) {
    digits += String(integrals / divisor);
    integrals %= divisor;
    kappa--;
    const rest = (integrals << sh) + fractionals;
    if (rest < unsafe) return weed(rest, divisor << sh, tooHigh - W.f);
    divisor /= 10n;
  }
  for (;;) {
    fractionals *= 10n; unit *= 10n; unsafe *= 10n;
    digits += String(fractionals >> sh);
    fractionals &= one - 1n;
    kappa--;
    if (fractionals < unsafe) return weed(fractionals, one, (tooHigh - W.f) * unit);
  }
}

// ---------------------------------------------------------------------------
// Grisu2 (paper, section 6.2): shrunk interval, digits of M+ = HI - 1,
// stop at the first kappa with rest <= delta. Never rejects. The paper's
// version has no rounding step; `round` adds one (Grisu2b / RapidJSON style).
// ---------------------------------------------------------------------------

export function grisu2(v, q = Q_LIBRARY, round = false) {
  const b = boundariesQ(v, q);
  const c = cachedPowerFor(b.w.e, q);
  const LO = timesQ(b.minus, c, q), W = timesQ(b.w, c, q), HI = timesQ(b.plus, c, q);
  const sh = BigInt(-W.e), one = 1n << sh;
  const Mm = LO.f + 1n, Mp = HI.f - 1n;
  let delta = Mp - Mm;
  if (delta < 0n) return { empty: true, q, Mm, Mp, W, c };
  let wdist = Mp - W.f;
  let unit = 1n;
  let p1 = Mp >> sh, p2 = Mp & (one - 1n);
  let kappa = digitCount(p1);
  let divisor = kappa > 0 ? pow10(kappa - 1) : 0n;
  const buf = [];
  const steps = [];
  const finish = (rest, tk) => {
    let r = rest;
    if (round) {
      while (r < wdist && delta - r >= tk && (r + tk < wdist || wdist - r > r + tk - wdist)) { buf[buf.length - 1]--; r += tk; }
    }
    let digits = buf.join("").replace(/^0+(?=\d)/, "");
    return {
      empty: false, q, Mm, Mp, W, c, steps, digits, exp10: kappa - c.k, kappa,
      rest: rat(r, unit), tenKappa: rat(tk, unit), delta0: Mp - Mm,
    };
  };
  while (kappa > 0) {
    const digit = p1 / divisor;
    buf.push(Number(digit));
    p1 %= divisor;
    kappa--;
    const rest = (p1 << sh) + p2;
    const hit = rest <= delta;
    steps.push({ digits: buf.join(""), kappa, rest: rat(rest, unit), hit, tenKappa: rat(divisor << sh, unit), delta: rat(delta, unit) });
    if (hit) return finish(rest, divisor << sh);
    divisor /= 10n;
  }
  for (;;) {
    p2 *= 10n; delta *= 10n; wdist *= 10n; unit *= 10n;
    buf.push(Number(p2 >> sh));
    p2 &= one - 1n;
    kappa--;
    const hit = p2 <= delta;
    steps.push({ digits: buf.join(""), kappa, rest: rat(p2, unit), hit, tenKappa: rat(one, unit), delta: rat(delta, unit) });
    if (hit) return finish(p2, one);
  }
}

// ---------------------------------------------------------------------------
// Grisu1 (paper, Fig. 4 with window [0, 3]): print every digit of w * 10^k.
// Uses the exactly rounded 10^k (not the sparse cache), as in the paper.
// ---------------------------------------------------------------------------

export function grisu1(v, q = Q_LIBRARY) {
  const b = boundariesQ(v, q);
  let k = Math.ceil((0 - (b.w.e + q) + q - 1) * LOG10_2) - 2;
  let c;
  for (;; k++) {
    c = powerQ(k, q);
    const t = b.w.e + c.e + q;
    if (t >= 0) {
      if (t > 3) throw new Error("grisu1 window");
      break;
    }
  }
  const D = timesQ(b.w, c, q);
  return { digits: (D.f << BigInt(D.e)).toString(), exp10: -c.k };
}

// ---------------------------------------------------------------------------
// Helpers for the page.
// ---------------------------------------------------------------------------

export function stripZeros(digits, exp10) {
  let d = digits.replace(/^0+(?=\d)/, "");
  let e = exp10;
  while (d.length > 1 && d.endsWith("0")) { d = d.slice(0, -1); e++; }
  return { digits: d, exp10: e };
}

/** "3e-1" style digits-and-exponent string. */
export function sciText(digits, exp10) {
  return `${digits}e${exp10}`;
}

/** Decimal text, like Number#toString, for digits x 10^exp10. */
export function decimalText(digits, exp10) {
  const s = stripZeros(digits, exp10);
  const n = s.digits.length;
  const sci = n - 1 + s.exp10; // exponent of the leading digit
  if (sci >= 21 || sci <= -7) return `${s.digits[0]}${n > 1 ? "." + s.digits.slice(1) : ""}e${sci >= 0 ? "+" : ""}${sci}`;
  if (s.exp10 >= 0) return s.digits + "0".repeat(s.exp10);
  if (sci >= 0) return `${s.digits.slice(0, sci + 1)}.${s.digits.slice(sci + 1)}`;
  return `0.${"0".repeat(-sci - 1)}${s.digits}`;
}

/** The exact shortest-and-closest answer (what the bignum fallback prints). */
export function exactAnswer(v) {
  const r = shortestDecimal(v);
  const s = stripZeros(r.coefficient.toString(), r.exponent);
  return { digits: s.digits, exp10: s.exp10, text: decimalText(s.digits, s.exp10) };
}

/**
 * The limit q -> infinity: blur 0. The shortest decimals in the closed interval
 * [m-, m+]; Grisu3 can only ever accept if the closest of them is unique and
 * lies strictly inside. Returns "boundary", "tie" or null (decidable).
 */
export function structuralReason(v) {
  const b = boundariesQ(v, 64);
  // Work in units of 2^(e-2): V = 4f, Hi = 4f + 2, Lo = 4f - 1 or 4f - 2.
  const S = b.e - 2;
  const V = 4n * b.f, Hi = 4n * b.f + 2n, Lo = b.lowerCloser ? 4n * b.f - 1n : 4n * b.f - 2n;
  const toRat = (N) => (S >= 0 ? rat(N << BigInt(S)) : rat(N, 1n << BigInt(-S)));
  const lo = toRat(Lo), hi = toRat(Hi), cv = toRat(V);
  const dec = (m, E) => (E >= 0 ? rat(m * pow10(E)) : rat(m, pow10(-E)));
  const floorDiv = (a, E) => { // floor(a / 10^E)
    const x = E >= 0 ? rat(a.n, a.d * pow10(E)) : rat(a.n * pow10(-E), a.d);
    return x.n / x.d;
  };
  let E = Math.floor(Math.log10(v)) + 1;
  for (;; E--) {
    const top = floorDiv(hi, E);
    const cands = [];
    for (let m = top; m > 0n; m--) {
      const x = dec(m, E);
      if (rcmp(x, lo) < 0) break;
      cands.push(x);
    }
    if (!cands.length) continue;
    const dist = (x) => { const d = rsub(x, cv); return d.n < 0n ? rat(-d.n, d.d) : d; };
    cands.sort((a, c) => rcmp(dist(a), dist(c)));
    if (cands.length > 1 && rcmp(dist(cands[0]), dist(cands[1])) === 0) return "tie";
    if (rcmp(cands[0], lo) === 0 || rcmp(cands[0], hi) === 0) return "boundary";
    return null;
  }
}

// ---------------------------------------------------------------------------
// Random doubles (deterministic, so the published sweep can be re-checked).
// ---------------------------------------------------------------------------

const M64 = (1n << 64n) - 1n;
export function makeRandom(seed = 0x9e3779b97f4a7c15n) {
  let state = BigInt.asUintN(64, seed);
  const view = new DataView(new ArrayBuffer(8));
  const next64 = () => { // splitmix64
    state = (state + 0x9e3779b97f4a7c15n) & M64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M64;
    return z ^ (z >> 31n);
  };
  return () => {
    for (;;) {
      const bits = next64() & 0x7fffffffffffffffn; // positive
      if ((bits >> 52n) === 0x7ffn || bits === 0n) continue;
      view.setBigUint64(0, bits);
      return view.getFloat64(0);
    }
  };
}

export const SWEEP_N = 20000;
export const SWEEP_SEED = 0x9e3779b97f4a7c15n;

/**
 * Grisu3 rejections per q on the deterministic sample of SWEEP_N random bit
 * patterns: [q, "closest ambiguous" (round), "outside safe zone" (weed)].
 * Produced by sweepAt(); test/explore-grisu-blur.test.js re-checks it.
 */
export const SWEEP = [
  [55, 8587, 11410], [56, 7281, 9254], [57, 4987, 4446], [58, 2812, 2157], [59, 1490, 1043],
  [60, 767, 562], [61, 380, 293], [62, 186, 178], [63, 96, 109], [64, 46, 56], [65, 23, 38],
  [66, 15, 27], [67, 12, 23], [68, 9, 21], [69, 8, 20], [70, 8, 20], [71, 8, 20], [72, 8, 20],
  [73, 8, 20], [74, 8, 20], [75, 8, 20], [76, 8, 20], [77, 8, 20], [78, 8, 20], [79, 8, 20],
  [80, 8, 20],
];
/** In the same sample: doubles no precision can certify (structuralReason). */
export const SWEEP_FLOOR = { tie: 8, boundary: 20 };
/** In the same sample, q = 64: Grisu2 without rounding longer than shortest / same length but not closest; with rounding not closest. */
export const SWEEP_G2 = { longer: 18, notClosest: 7193, roundedNotClosest: 11 };

export function sweepAt(q, n = SWEEP_N, seed = SWEEP_SEED) {
  const rnd = makeRandom(seed);
  let round = 0, weed = 0;
  for (let i = 0; i < n; i++) {
    const r = grisu3Quick(rnd(), q);
    if (r.verdict === "round") round++;
    else if (r.verdict === "weed") weed++;
  }
  return { q, n, round, weed };
}

// ---------------------------------------------------------------------------
// Presets.
// ---------------------------------------------------------------------------

export const PRESETS = [
  { id: "0.3", label: "0.3", value: 0.3, story: "Easy: one digit, deep inside." },
  { id: "0.1+0.2", label: "0.1+0.2", value: 0.1 + 0.2, story: "17 digits; RoundWeed walks the last digit 7 → 4." },
  { id: "5e-324", label: "5e-324", value: 5e-324, story: "Smallest subnormal; RoundWeed walks 7 → 6 → 5." },
  { id: "0.00093", label: "0.00093", value: 0.00093, story: "Right answer, but too close to the lower fence to prove." },
  { id: "3.14e-13", label: "3.14e-13", value: 3.14e-13, story: "Right answer, but too close to the lower fence to prove." },
  { id: "8.332404691393481", label: "8.332404691393481", value: 8.332404691393481, story: "Coin flip: W's blur straddles the midpoint between two candidates." },
  { id: "1e23", label: "1e23", value: 1e23, story: "The candidate sits exactly on the fence m+. No precision helps." },
  { id: "105191451600.796875", label: "105191451600.796875", value: 105191451600.796875, story: "Exact tie between two 17-digit candidates. No precision helps." },
];

export function parseInput(text) {
  const t = String(text).trim().replace(/\s+/g, "");
  if (!t) return null;
  const m = /^(.+?)\+(.+)$/.exec(t);
  let v;
  if (m && !/e$/i.test(m[1])) {
    const a = Number(m[1]), b = Number(m[2]);
    if (!/^[0-9.eE+-]+$/.test(m[1]) || !/^[0-9.eE+-]+$/.test(m[2])) return null;
    v = a + b;
  } else {
    if (!/^[+]?[0-9]*\.?[0-9]*(e[+-]?[0-9]+)?$/i.test(t)) return null;
    v = Number(t);
  }
  if (!Number.isFinite(v) || !(v > 0)) return null;
  return v;
}
