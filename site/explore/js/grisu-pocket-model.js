// Pocket Grisu: pure computation for the Grisu explanation page (no DOM).
// Everything is BigInt so every number the page shows is exact.
//
// The 64-bit engine mirrors google/double-conversion (fast-dtoa.cc,
// cached-powers.cc, diy-fp.h) line by line. The same engine also runs with
// q-bit "DiyFp" integers on half-precision floats (the "pocket" version),
// where a simplified cache (every power of ten) and window are used.

import { shortestDecimal } from "../../js/oracle.js";

export const ALPHA = -60; // kMinimalTargetExponent
export const GAMMA = -32; // kMaximalTargetExponent
export const LOG10_2 = 0.30102999566398114; // kD_1_LOG2_10
export const CACHE_OFFSET = 348; // kCachedPowersOffset
export const CACHE_STEP = 8; // kDecimalExponentDistance

const SMALL_POWERS_OF_TEN = [0, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000];

export function bitLength(x) {
  return x <= 0n ? 0 : x.toString(2).length;
}

const POW10 = [1n];
export function pow10(n) {
  while (POW10.length <= n) POW10.push(POW10.at(-1) * 10n);
  return POW10[n];
}

// ---------------------------------------------------------------------------
// Cached powers of ten: 10^k rounded to the nearest q-bit normalized DiyFp.

const powerCache = new Map();
export function cachedPower(k, q = 64) {
  const key = `${k}:${q}`;
  if (powerCache.has(key)) return powerCache.get(key);
  const num = k >= 0 ? pow10(k) : 1n;
  const den = k >= 0 ? 1n : pow10(-k);
  let e = bitLength(num) - bitLength(den) - q;
  let result;
  for (;;) {
    let n = num, d = den;
    if (e >= 0) d <<= BigInt(e); else n <<= BigInt(-e);
    const quotient = n / d;
    if (quotient >= (1n << BigInt(q))) { e++; continue; }
    if (quotient < (1n << BigInt(q - 1))) { e--; continue; }
    const r = n - quotient * d;
    let f = 2n * r >= d ? quotient + 1n : quotient;
    let ee = e;
    if (f === 1n << BigInt(q)) { f >>= 1n; ee++; }
    // err: signed error of the stored significand, in units of its last bit.
    const bumped = ee !== e;
    const err = bumped ? ratioToNumber(2n * d * f - n, 2n * d) : ratioToNumber(f * d - n, d);
    result = { f, e: ee, k, q, exact: r === 0n, err };
    break;
  }
  powerCache.set(key, result);
  return result;
}

// The 87 entries of double-conversion's table: 10^-348, 10^-340, ..., 10^340.
export const CACHE = [];
for (let k = -CACHE_OFFSET; k <= 340; k += CACHE_STEP) CACHE.push(cachedPower(k, 64));

// ---------------------------------------------------------------------------
// Small rational helpers.

export function ratioToNumber(num, den) {
  // Accurate enough for display: scale to ~1e-12 relative.
  if (den < 0n) { num = -num; den = -den; }
  const neg = num < 0n;
  if (neg) num = -num;
  const whole = num / den;
  const rem = num % den;
  const frac = Number((rem * 1000000000000n) / den) / 1e12;
  const value = Number(whole) + frac;
  return neg ? -value : value;
}

// Exact decimal expansion of num / 2^shift (always finite). Truncated to
// maxFrac fraction digits with an ellipsis when longer.
export function binaryFractionToDecimal(num, shift, maxFrac = 30) {
  if (shift <= 0) return (num << BigInt(-shift)).toString();
  const S = BigInt(shift);
  const whole = num >> S;
  let rem = num & ((1n << S) - 1n);
  if (rem === 0n) return whole.toString();
  let digits = "";
  while (rem !== 0n && digits.length < maxFrac) {
    rem *= 10n;
    digits += (rem >> S).toString();
    rem &= (1n << S) - 1n;
  }
  return `${whole}.${digits}${rem !== 0n ? "…" : ""}`;
}

// Exact decimal of a rational num/den, truncated.
export function rationalToDecimal(num, den, maxFrac = 30) {
  const neg = num < 0n;
  if (neg) num = -num;
  const whole = num / den;
  let rem = num % den;
  let digits = "";
  while (rem !== 0n && digits.length < maxFrac) {
    rem *= 10n;
    digits += (rem / den).toString();
    rem %= den;
  }
  const s = digits ? `${whole}.${digits}${rem !== 0n ? "…" : ""}` : whole.toString();
  return neg ? `−${s}` : s;
}

// ---------------------------------------------------------------------------
// Decoding.

const dv = new DataView(new ArrayBuffer(8));
export function decodeDouble64(v) {
  dv.setFloat64(0, v);
  const bits = dv.getBigUint64(0);
  const be = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  const f = be === 0 ? frac : frac | (1n << 52n);
  const e = be === 0 ? -1074 : be - 1075;
  return { bits, be, frac, f, e, lowerCloser: frac === 0n && be > 1, p: 53 };
}

export function decodeHalf(bits) {
  const be = (bits >> 10) & 31;
  const frac = bits & 1023;
  const f = be === 0 ? frac : frac | 1024;
  const e = be === 0 ? -24 : be - 25;
  return { bits, be, frac, f: BigInt(f), e, lowerCloser: frac === 0 && be > 1, p: 11, value: f * 2 ** e };
}

// Round a positive double to the nearest half-precision value (ties to even).
// Returns the 16-bit pattern, or null when it over- or underflows.
export function halfBitsOf(x) {
  if (!(x > 0) || !Number.isFinite(x)) return null;
  const { f, e } = decodeDouble64(x);
  const top = bitLength(f) - 1 + e; // floor(log2 x)
  let E = Math.max(top - 10, -24);
  const shift = E - e;
  let F;
  if (shift <= 0) F = f << BigInt(-shift);
  else {
    const S = BigInt(shift);
    F = f >> S;
    const rem = f & ((1n << S) - 1n);
    const half = 1n << (S - 1n);
    if (rem > half || (rem === half && (F & 1n) === 1n)) F++;
  }
  if (F === 2048n) { F = 1024n; E++; }
  if (F === 0n || E > 5) return null;
  const Fn = Number(F);
  if (Fn < 1024) return Fn; // subnormal (E === -24)
  return ((E + 25) << 10) | (Fn - 1024);
}

// ---------------------------------------------------------------------------
// DiyFp operations (q-bit).

export function normalize(x, q = 64) {
  const shift = q - bitLength(x.f);
  return { f: x.f << BigInt(shift), e: x.e - shift };
}

export function boundaries(x, q = 64) {
  const plus = normalize({ f: (x.f << 1n) + 1n, e: x.e - 1 }, q);
  let minus = x.lowerCloser ? { f: (x.f << 2n) - 1n, e: x.e - 2 } : { f: (x.f << 1n) - 1n, e: x.e - 1 };
  minus = { f: minus.f << BigInt(minus.e - plus.e), e: plus.e };
  return { minus, plus, lowerCloser: x.lowerCloser };
}

// DiyFp::Times: the upper q bits of the 2q-bit product, rounded half up.
export function times(a, b, q = 64) {
  const Q = BigInt(q);
  return { f: (a.f * b.f + (1n << (Q - 1n))) >> Q, e: a.e + b.e + q };
}

// diy-fp.h's Multiply, spelled out as four 32x32 partial products.
export function multiplyParts(x, y) {
  const M32 = 0xffffffffn;
  const a = x.f >> 32n, b = x.f & M32, c = y.f >> 32n, d = y.f & M32;
  const ac = a * c, bc = b * c, ad = a * d, bd = b * d;
  const tmp = (bd >> 32n) + (ad & M32) + (bc & M32) + (1n << 31n);
  const f = ac + (ad >> 32n) + (bc >> 32n) + (tmp >> 32n);
  const full = x.f * y.f;
  return { a, b, c, d, ac, bc, ad, bd, tmp, f, e: x.e + y.e + 64, full, low: full & ((1n << 64n) - 1n) };
}

// Exact value of x * 10^k, expressed in units of 2^t (a rational num/den).
export function exactScaled(x, k, t) {
  let num = x.f * (k >= 0 ? pow10(k) : 1n);
  let den = k >= 0 ? 1n : pow10(-k);
  const sh = x.e - t;
  if (sh >= 0) num <<= BigInt(sh); else den <<= BigInt(-sh);
  return { num, den };
}

// ---------------------------------------------------------------------------
// Choosing the cached power.

// All 87 teeth of the comb for a normalized exponent w.e.
export function combTeeth(we) {
  return CACHE.map((c, index) => {
    const t = we + c.e + 64;
    return { index, k: c.k, e: c.e, t, fits: t >= ALPHA && t <= GAMMA };
  });
}

// GetCachedPowerForBinaryExponentRange, with every intermediate value.
export function chooseCachedPower64(we) {
  const minExp = ALPHA - (we + 64);
  const maxExp = GAMMA - (we + 64);
  const kReal = (minExp + 64 - 1) * LOG10_2;
  const kk = Math.ceil(kReal);
  const index = Math.trunc((CACHE_OFFSET + kk - 1) / CACHE_STEP) + 1;
  const power = CACHE[index];
  const t = we + power.e + 64;
  if (!(power.e >= minExp && power.e <= maxExp)) throw new Error(`no cached power for ${we}`);
  return { minExp, maxExp, kReal, kk, index, power, t, mk: power.k };
}

// The pocket version: a cache with every power of ten, window [-(q-4), -(q-8)].
export function pocketWindow(q) {
  return [-(q - 4), -(q - 8)];
}
export function chooseCachedPowerPocket(we, q) {
  const [alpha, gamma] = pocketWindow(q);
  const minExp = alpha - (we + q);
  const maxExp = gamma - (we + q);
  const kk = Math.ceil((minExp + q - 1) * LOG10_2);
  const power = cachedPower(kk, q);
  const t = we + power.e + q;
  if (!(t >= alpha && t <= gamma)) throw new Error(`pocket window missed: q=${q} we=${we}`);
  return { minExp, maxExp, kk, index: kk, power, t, mk: kk };
}

// ---------------------------------------------------------------------------
// Grisu3: DigitGen + RoundWeed, faithful to fast-dtoa.cc, with a trace.

function biggestPowerTen(number, numberBits) {
  let guess = ((numberBits + 1) * 1233) >> 12;
  guess++;
  if (number < SMALL_POWERS_OF_TEN[guess]) guess--;
  return { power: SMALL_POWERS_OF_TEN[guess], exponentPlusOne: guess, guess: guess };
}

function roundWeed(buffer, distTooHighW, unsafe, rest, tenKappa, unit) {
  const small = distTooHighW - unit;
  const big = distTooHighW + unit;
  const start = { digits: buffer.join(""), rest };
  const walk = [];
  while (rest < small && unsafe - rest >= tenKappa &&
         (rest + tenKappa < small || small - rest >= rest + tenKappa - small)) {
    buffer[buffer.length - 1]--;
    rest += tenKappa;
    walk.push({ digits: buffer.join(""), rest });
  }
  // Why the loop stopped (first failing condition), for the explanation.
  let stopReason;
  if (!(rest < small)) stopReason = "reached";
  else if (!(unsafe - rest >= tenKappa)) stopReason = "edge";
  else stopReason = "farther";
  const ambiguous = rest < big && unsafe - rest >= tenKappa &&
    (rest + tenKappa < big || big - rest > rest + tenKappa - big);
  const safeLow = 2n * unit;
  const safeHigh = unsafe - 4n * unit;
  const safe = safeLow <= rest && rest <= safeHigh;
  const ok = !ambiguous && safe;
  return {
    ok, reason: ambiguous ? "round" : safe ? "ok" : "weed",
    distTooHighW, small, big, unsafe, tenKappa, unit, start, walk,
    stopReason, ambiguous, safe, safeLow, safeHigh, rest,
  };
}

function digitGen(low, w, high, q) {
  const s = -w.e;
  const S = BigInt(s);
  let unit = 1n;
  const tooLow = low.f - unit;
  const tooHigh = high.f + unit;
  let unsafe = tooHigh - tooLow;
  const one = 1n << S;
  let integrals = Number(tooHigh >> S);
  let fractionals = tooHigh & (one - 1n);
  const bp = biggestPowerTen(integrals, q - s);
  let divisor = bp.power;
  let kappa = bp.exponentPlusOne;
  const split = { one, s, integrals, fractionals, divisor, kappa, integralBits: q - s };
  const buffer = [];
  const steps = [];
  const base = { tooLow, tooHigh, unsafe0: unsafe, split, steps, buffer };
  while (kappa > 0) {
    const digit = Math.floor(integrals / divisor);
    buffer.push(digit);
    integrals %= divisor;
    kappa--;
    const rest = (BigInt(integrals) << S) + fractionals;
    const stop = rest < unsafe;
    steps.push({ phase: "int", digit, digits: buffer.join(""), kappa, rest, unsafe, unit, divisor, tenKappa: BigInt(divisor) << S, stop });
    if (stop) {
      const weed = roundWeed(buffer, tooHigh - w.f, unsafe, rest, BigInt(divisor) << S, unit);
      return { ...base, weed, kappa, unit, unsafe };
    }
    divisor = Math.floor(divisor / 10);
  }
  for (;;) {
    fractionals *= 10n;
    unit *= 10n;
    unsafe *= 10n;
    const digit = Number(fractionals >> S);
    buffer.push(digit);
    fractionals &= one - 1n;
    kappa--;
    const stop = fractionals < unsafe;
    steps.push({ phase: "frac", digit, digits: buffer.join(""), kappa, rest: fractionals, unsafe, unit, tenKappa: one, stop });
    if (stop) {
      const weed = roundWeed(buffer, (tooHigh - w.f) * unit, unsafe, fractionals, one, unit);
      return { ...base, weed, kappa, unit, unsafe };
    }
  }
}

// Generic Grisu3 on a decoded float x = {f, e, lowerCloser} with q-bit DiyFps.
function grisu3Core(x, q, choose) {
  const w = normalize(x, q);
  const { minus, plus } = boundaries(x, q);
  const pick = choose(w.e);
  const c = pick.power;
  const sw = times(w, c, q), sm = times(minus, c, q), sp = times(plus, c, q);
  const gen = digitGen(sm, sw, sp, q);
  const digits = gen.buffer.join("");
  const t = sw.e;
  const exact = {
    w: exactScaled(w, c.k, t),
    minus: exactScaled(minus, c.k, t),
    plus: exactScaled(plus, c.k, t),
  };
  return {
    q, x, w, minus, plus, pick, power: c, mk: c.k, t, sw, sm, sp, exact,
    ...gen,
    ok: gen.weed.ok, reason: gen.weed.reason,
    digits, decimalExponent: -c.k + gen.kappa,
  };
}

export function grisu3(v) {
  if (!(v > 0) || !Number.isFinite(v)) throw new RangeError("Grisu3 expects a positive finite double");
  const x = decodeDouble64(v);
  const r = grisu3Core(x, 64, chooseCachedPower64);
  r.v = v;
  if (!r.ok) r.fallback = shortestDecimal(v);
  return r;
}

export function grisu3Half(bits, q = 16) {
  const x = decodeHalf(bits);
  const r = grisu3Core(x, q, (we) => chooseCachedPowerPocket(we, q));
  r.half = x;
  return r;
}

// Lean status for the exhaustive map: 0 accepted, 1 reject (closeness), 2 reject (safe zone).
export function pocketStatus(bits, q) {
  const r = grisu3Core(decodeHalf(bits), q, (we) => chooseCachedPowerPocket(we, q));
  return r.reason === "ok" ? 0 : r.reason === "round" ? 1 : 2;
}

export const HALF_POSITIVE_COUNT = 0x7bff; // 31,743 positive finite half-precision values

// The same algorithm with plain Numbers. For q <= 24 every intermediate value
// stays below 2^53, so this is exact; the tests check it against the BigInt
// engine for every half-precision value and every q from 13 to 24.
export function pocketStatusFast(bits, q) {
  const be = (bits >> 10) & 31, frac = bits & 1023;
  const f = be === 0 ? frac : frac | 1024;
  const e = be === 0 ? -24 : be - 25;
  const lowerCloser = frac === 0 && be > 1;
  const nlen = (n) => Math.floor(Math.log2(n)) + 1; // exact for small integers
  const shiftW = q - nlen(f);
  const wf = f * 2 ** shiftW, we = e - shiftW;
  const pf0 = 2 * f + 1;
  const shiftP = q - nlen(pf0);
  const pf = pf0 * 2 ** shiftP, pe = e - 1 - shiftP;
  const mf = lowerCloser ? (4 * f - 1) * 2 ** (e - 2 - pe) : (2 * f - 1) * 2 ** (e - 1 - pe);
  const pick = chooseCachedPowerPocket(we, q);
  const cf = Number(pick.power.f);
  const Q = 2 ** q, half = 2 ** (q - 1);
  const sw = Math.floor((wf * cf + half) / Q);
  const sm = Math.floor((mf * cf + half) / Q);
  const sp = Math.floor((pf * cf + half) / Q);
  const s = -pick.t, one = 2 ** s;
  let unit = 1;
  const tooLow = sm - unit, tooHigh = sp + unit;
  let unsafe = tooHigh - tooLow;
  let integrals = Math.floor(tooHigh / one);
  let fractionals = tooHigh - integrals * one;
  const bp = biggestPowerTen(integrals, q - s);
  let divisor = bp.power, kappa = bp.exponentPlusOne;
  let rest, tenKappa, dist;
  for (;;) {
    if (kappa > 0) {
      integrals %= divisor;
      kappa--;
      rest = integrals * one + fractionals;
      if (rest < unsafe) { tenKappa = divisor * one; dist = tooHigh - sw; break; }
      divisor = Math.floor(divisor / 10);
    } else {
      fractionals *= 10; unit *= 10; unsafe *= 10;
      fractionals %= one;
      kappa--;
      if (fractionals < unsafe) { rest = fractionals; tenKappa = one; dist = (tooHigh - sw) * unit; break; }
    }
  }
  const small = dist - unit, big = dist + unit;
  while (rest < small && unsafe - rest >= tenKappa &&
         (rest + tenKappa < small || small - rest >= rest + tenKappa - small)) rest += tenKappa;
  if (rest < big && unsafe - rest >= tenKappa &&
      (rest + tenKappa < big || big - rest > rest + tenKappa - big)) return 1;
  return 2 * unit <= rest && rest <= unsafe - 4 * unit ? 0 : 2;
}

export function pocketMap(q) {
  const out = new Uint8Array(HALF_POSITIVE_COUNT + 1);
  for (let bits = 1; bits <= HALF_POSITIVE_COUNT; bits++) out[bits] = pocketStatusFast(bits, q);
  return out;
}

export function mapCounts(map) {
  const counts = [0, 0, 0];
  for (let bits = 1; bits < map.length; bits++) counts[map[bits]]++;
  return counts;
}

// ---------------------------------------------------------------------------
// Exact shortest-and-closest for any binary float {f, e, lowerCloser}
// (interval closed when f is even), plus diagnostics.

export function exactShortest(x) {
  const { f, e, lowerCloser } = x;
  const closed = (f & 1n) === 0n;
  // Work in units of 2^(e-2): v = 4f, m+ = 4f+2, m- = 4f-2 (or 4f-1).
  const S = e - 2;
  const V = 4n * f, Hi = 4n * f + 2n, Lo = lowerCloser ? 4n * f - 1n : 4n * f - 2n;
  // Compare d*10^E against N*2^S.
  const scale = (d, E, N) => {
    let a = d, b = N;
    if (E >= 0) a *= pow10(E); else b *= pow10(-E);
    if (S >= 0) b <<= BigInt(S); else a <<= BigInt(-S);
    return [a, b];
  };
  const floorAt = (N, E) => { // floor(N*2^S / 10^E)
    let a = N, b = 1n;
    if (S >= 0) a <<= BigInt(S); else b <<= BigInt(-S);
    if (E >= 0) b *= pow10(E); else a *= pow10(-E);
    return a / b;
  };
  const approx = Number(f) * 2 ** e;
  const top = Math.floor(Math.log10(approx)) + 2;
  for (let E = top; E > top - 60; E--) {
    const cands = [];
    for (let d = floorAt(Hi, E); d >= floorAt(Lo, E) && d > 0n; d--) {
      const [ah, bh] = scale(d, E, Hi);
      const [al, bl] = scale(d, E, Lo);
      const inside = closed ? ah <= bh && al >= bl : ah < bh && al > bl;
      if (inside) cands.push({ d, onBoundary: ah === bh || al === bl });
    }
    if (!cands.length) continue;
    let best = null, bestDist = null, tie = false;
    for (const cand of cands) {
      const [a, b] = scale(cand.d, E, V);
      const dist = a > b ? a - b : b - a;
      if (bestDist === null || dist < bestDist) { best = cand; bestDist = dist; tie = false; }
      else if (dist === bestDist) {
        tie = true;
        if ((cand.d & 1n) === 0n) best = cand; // round half to even
      }
    }
    let digits = best.d.toString(), exp10 = E;
    while (digits.length > 1 && digits.endsWith("0")) { digits = digits.slice(0, -1); exp10++; }
    return { digits, exp10, tie, onBoundary: best.onBoundary, closed, count: cands.length };
  }
  throw new Error("no shortest decimal");
}

// Does a decimal shorter than the answer sit exactly on an (open) boundary?
export function openBoundaryHit(x, answerLength) {
  const { f, e, lowerCloser } = x;
  if ((f & 1n) === 0n) return false;
  const S = e - 2;
  const ends = [4n * f + 2n, lowerCloser ? 4n * f - 1n : 4n * f - 2n];
  for (const N of ends) {
    // N * 2^S as an exact decimal: count significant digits.
    let num = N, den = 1n;
    if (S >= 0) num <<= BigInt(S); else den <<= BigInt(-S);
    // den is a power of two: num/den terminates.
    let fracDigits = 0;
    while (num % den !== 0n) { num *= 10n; fracDigits++; }
    let digits = (num / den).toString().replace(/0+$/, "");
    if (digits.length < answerLength) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Grisu1 with the paper's digit-gen-mix (Figure 6): print the integral part,
// then fractional digits by x10-and-mask, until 18 digits are written.

export function grisu1(v) {
  const x = decodeDouble64(v);
  const w = normalize(x, 64);
  const pick = chooseCachedPower64(w.e);
  const D = times(w, pick.power, 64);
  const s = -D.e, S = BigInt(s);
  const one = 1n << S;
  const part1 = D.f >> S;
  let frac = D.f & (one - 1n);
  const intDigits = part1.toString();
  let digits = intDigits;
  const frames = [];
  while (digits.length < 18) {
    const before = frac;
    const product = frac * 10n;
    const digit = Number(product >> S);
    frac = product & (one - 1n);
    frames.push({ before, product, digit, after: frac });
    digits += digit;
  }
  const exponent = -pick.mk - (digits.length - intDigits.length);
  return { x, w, pick, D, s, one, part1, fraction0: D.f & (one - 1n), intDigits, frames, digits, exponent };
}

// ---------------------------------------------------------------------------
// Grisu2 as in the paper (Figure 7, no rounding step), on the library's cache.

export function grisu2(v) {
  const x = decodeDouble64(v);
  const w = normalize(x, 64);
  const { minus, plus } = boundaries(x, 64);
  const pick = chooseCachedPower64(w.e);
  const c = pick.power;
  const Mm = times(minus, c).f + 1n;
  const Mp = times(plus, c).f - 1n;
  let delta = Mp - Mm;
  const S = BigInt(-(plus.e + c.e + 64));
  const one = 1n << S;
  let p1 = Mp >> S, p2 = Mp & (one - 1n);
  let kappa = 10, div = 1000000000n;
  const buf = [];
  const done = () => {
    let digits = buf.join("");
    let exp10 = -pick.mk + kappa;
    return { digits, exp10 };
  };
  while (kappa > 0) {
    const d = p1 / div;
    if (d || buf.length) buf.push(Number(d));
    p1 %= div; kappa--; div /= 10n;
    if ((p1 << S) + p2 <= delta) return done();
  }
  do {
    p2 *= 10n;
    const d = p2 >> S;
    if (d || buf.length) buf.push(Number(d));
    p2 &= one - 1n; kappa--; delta *= 10n;
  } while (p2 > delta);
  return done();
}

// ---------------------------------------------------------------------------
// Formatting helpers.

export function stripZeros(digits, exp10) {
  while (digits.length > 1 && digits.endsWith("0")) { digits = digits.slice(0, -1); exp10++; }
  return { digits, exp10 };
}

export function digitsE(digits, exp10) {
  return `${digits}e${exp10}`;
}

// Shortest-closest digits of a double according to JavaScript.
export function jsDigits(v) {
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(v.toExponential());
  const digits = m[1] + (m[2] || "");
  return { digits, exp10: Number(m[3]) - (digits.length - 1) };
}

// Human-friendly decimal for digits x 10^exp10.
export function plainDecimal(digits, exp10) {
  const n = digits.length;
  const point = n + exp10;
  if (exp10 >= 0 && point <= 21) return digits + "0".repeat(exp10);
  if (point > 0 && point <= 21) return `${digits.slice(0, point)}.${digits.slice(point)}`;
  if (point <= 0 && point > -6) return `0.${"0".repeat(-point)}${digits}`;
  return `${digits[0]}${n > 1 ? "." + digits.slice(1) : ""}e${point - 1}`;
}

export function hex64(x) {
  return "0x" + x.toString(16).toUpperCase().padStart(16, "0");
}
