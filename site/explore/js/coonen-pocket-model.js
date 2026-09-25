// Pure model for the "Pocket Coonen" page: a BigInt simulator of Coonen's
// Algorithm B (1984 dissertation, ch. 7) with the extended precision p as a
// parameter. p = 12 gives the pocket-sized toy, p = 64 the real
// double-extended register. No DOM code lives here, so node tests can import it.

import { decodeDouble } from "../../js/float.js";

const POW10 = [1n];
export function pow10n(k) {
  while (POW10.length <= k) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[k];
}

export function bitLength(n) {
  return n === 0n ? 0 : n.toString(2).length;
}

// ---------------------------------------------------------------------------
// Extended values: { m, e } means m · 2^e with m > 0 (magnitudes only).

/** Round the positive rational num/den to p significant bits.
 *  dir: "nearest" (ties to even), "chop" (toward zero) or "away" (from zero). */
export function roundBits(num, den, p, dir) {
  const P = BigInt(p);
  let e = bitLength(num) - bitLength(den) - p;
  let q; let r; let d;
  const divide = () => {
    let n = num;
    d = den;
    if (e >= 0) d = den << BigInt(e);
    else n = num << BigInt(-e);
    q = n / d;
    r = n % d;
  };
  divide();
  while (q >= (1n << P)) { e++; divide(); }
  while (q < (1n << (P - 1n))) { e--; divide(); }
  const inexact = r !== 0n;
  if (dir === "nearest") {
    const twice = 2n * r;
    if (twice > d || (twice === d && (q & 1n) === 1n)) q++;
  } else if (dir === "away") {
    if (inexact) q++;
  }
  if (q === (1n << P)) { q >>= 1n; e++; }
  return { m: q, e, inexact };
}

export function extRational(v) {
  return v.e >= 0 ? { num: v.m << BigInt(v.e), den: 1n } : { num: v.m, den: 1n << BigInt(-v.e) };
}

function mulExt(a, b, p, dir) {
  const r = roundBits(a.m * b.m, 1n, p, dir);
  return { m: r.m, e: r.e + a.e + b.e, inexact: r.inexact };
}

function divExt(a, b, p, dir) {
  const r = roundBits(a.m, b.m, p, dir);
  return { m: r.m, e: r.e + a.e - b.e, inexact: r.inexact };
}

/** Round an extended value to an integer (step B5). */
export function roundExtToInteger(v, dir) {
  if (v.e >= 0) return { q: v.m << BigInt(v.e), inexact: false };
  const shift = BigInt(-v.e);
  let q = v.m >> shift;
  const r = v.m & ((1n << shift) - 1n);
  const half = 1n << (shift - 1n);
  if (dir === "nearest") {
    if (r > half || (r === half && (q & 1n) === 1n)) q++;
  } else if (dir === "away" && r !== 0n) {
    q++;
  }
  return { q, inexact: r !== 0n };
}

/** Round a positive rational to an integer. */
export function roundRationalToInteger(num, den, dir) {
  let q = num / den;
  const r = num % den;
  if (dir === "nearest") {
    const twice = 2n * r;
    if (twice > den || (twice === den && (q & 1n) === 1n)) q++;
  } else if (dir === "away" && r !== 0n) {
    q++;
  }
  return { q, inexact: r !== 0n };
}

// ---------------------------------------------------------------------------
// Powers of ten.

/** Largest k with 5^k < 2^p: 10^0 .. 10^k are exact in a p-bit register. */
export function exactPowerLimit(p) {
  let k = 0;
  while (5n ** BigInt(k + 1) < (1n << BigInt(p))) k++;
  return k;
}

/** Coonen's Algorithm Q table (double): 10^27 exact, then 10^55, 10^108, 10^206
 *  stored rounded to nearest, as printed in the dissertation. */
export const Q_TABLE = [27, 55, 108, 206];

/** A table entry as Algorithm Q uses it: stored rounded to nearest, then fixed by
 *  ±1 in the last place (pfix) for directed rounding, which is the same as
 *  rounding 10^k once in the direction dir. */
export function qTableEntry(k, dir = "nearest") {
  return roundBits(pow10n(k), 1n, 64, dir);
}

/** Algorithm Q: z ≈ 10^n in 64 bits, all roundings in direction dir. */
export function algorithmQ(n, dir) {
  let z = { m: 1n, e: 0 };
  let rest = n;
  const steps = [];
  for (let i = Q_TABLE.length - 1; i >= 0; i--) {
    if (rest < Q_TABLE[i]) continue;
    const entry = qTableEntry(Q_TABLE[i], dir);
    z = mulExt(z, entry, 64, dir);
    steps.push({ power: Q_TABLE[i], tableInexact: entry.inexact });
    rest -= Q_TABLE[i];
  }
  z = mulExt(z, { m: 5n ** BigInt(rest), e: rest }, 64, dir);
  steps.push({ power: rest, tableInexact: false, last: true });
  return { z: { m: z.m, e: z.e }, steps };
}

/** z ≈ 10^k in a p-bit register. strategy "Q" = Coonen's Algorithm Q (p = 64);
 *  "direct" = the toy table: 10^k rounded once in direction dir. */
export function powerOfTen(k, p, dir, strategy) {
  let z; let steps;
  if (strategy === "Q") ({ z, steps } = algorithmQ(k, dir));
  else { z = roundBits(pow10n(k), 1n, p, dir); steps = [{ power: k, direct: true }]; }
  const zr = extRational(z);
  const exactValue = pow10n(k);
  const exact = zr.num === exactValue * zr.den;
  // δ = z / 10^k − 1, as a Number (tiny, so scale before converting).
  const diff = zr.num - exactValue * zr.den;
  const delta = ratioToNumber(diff, exactValue * zr.den);
  return { z, exact, delta, steps };
}

export function ratioToNumber(num, den) {
  if (num === 0n) return 0;
  const neg = (num < 0n) !== (den < 0n);
  let n = num < 0n ? -num : num;
  let d = den < 0n ? -den : den;
  const shift = bitLength(d) - bitLength(n) + 60;
  const q = shift >= 0 ? (n << BigInt(shift)) / d : n / (d << BigInt(-shift));
  const value = Number(q) * 2 ** -shift;
  return neg ? -value : value;
}

// ---------------------------------------------------------------------------
// Logarithm (Algorithm L) and the exact decade.

export const LOG2_FIXED = 0x4D104D42n; // log10(2) chopped to 32 fraction bits

/** Algorithm L for the magnitude m · 2^e. Returns every intermediate. */
export function algorithmL(m, e) {
  const b = bitLength(m);
  const E = e + b - 1; // x = 2^E × 1.f
  const top = 1n << BigInt(b - 1);
  const f32 = ((m - top) << 32n) >> BigInt(b - 1); // 0.f truncated to 32 bits
  const L2X = BigInt(E) * (1n << 32n) + f32; // "e.f" with 32 fraction bits
  const LOG2 = L2X < 0n ? LOG2_FIXED + 1n : LOG2_FIXED;
  const product = LOG2 * L2X; // 64 fraction bits
  const logx = Number(product >> 64n); // arithmetic shift = floor
  return { E, f32, L2X, LOG2, bumped: L2X < 0n, product, logx, l2xNumber: Number(L2X) / 2 ** 32, productNumber: ratioToNumber(product, 1n << 64n) };
}

function compareScaled(m, e, k) {
  // compare m·2^e with 10^k
  let ln = m; let ld = 1n; let rn = 1n; let rd = 1n;
  if (e >= 0) ln <<= BigInt(e); else ld <<= BigInt(-e);
  if (k >= 0) rn = pow10n(k); else rd = pow10n(-k);
  const diff = ln * rd - rn * ld;
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/** Exact ⌊log10(m·2^e)⌋. */
export function exactDecade(m, e) {
  let k = Math.floor((bitLength(m) - 1 + e) * Math.LOG10E * Math.LN2);
  while (compareScaled(m, e, k) < 0) k--;
  while (compareScaled(m, e, k + 1) >= 0) k++;
  return k;
}

// ---------------------------------------------------------------------------
// Rounding modes.

export const MODES = ["nearest", "zero", "up", "down"];
export const MODE_LABEL = { nearest: "to nearest", zero: "toward 0", up: "toward +∞", down: "toward −∞" };

/** The direction the user's mode means for the magnitude of x. */
export function magnitudeDirection(mode, negative) {
  if (mode === "nearest") return "nearest";
  if (mode === "zero") return "chop";
  if (mode === "up") return negative ? "chop" : "away";
  return negative ? "away" : "chop";
}

/** Step S0: which way to round z = 10^|SCALE|. */
export function scaleFactorDirection(mode, negative, scale) {
  if (mode === "nearest") return "nearest";
  const grow = (mode === "up" && !negative) || (mode === "down" && negative);
  let dir = grow ? "away" : "chop";
  if (scale < 0) dir = dir === "away" ? "chop" : "away";
  return dir;
}

// ---------------------------------------------------------------------------
// Algorithm B.

export const DEFAULT_SAFEGUARDS = Object.freeze({ sticky: "on", directedZ: true, b6: true });

/**
 * Coonen's Algorithm B on the binary value (−1)^neg · m · 2^e.
 * opts.p: register precision; opts.N: digits; opts.mode: rounding mode;
 * opts.pow10: "Q" | "direct"; opts.log: "L" | "exact";
 * opts.safeguards: { sticky: "on" | "chop" | "round", directedZ, b6 }.
 */
export function coonenB(input, opts = {}) {
  const { p = 64, N = 17, mode = "nearest", pow10 = "Q", log = "L" } = opts;
  const guards = { ...DEFAULT_SAFEGUARDS, ...(opts.safeguards || {}) };
  const { neg = false, m, e } = input;
  if (bitLength(m) > p) throw new RangeError("input does not fit the register");
  const dir = magnitudeDirection(mode, neg);
  const logInfo = log === "L" ? algorithmL(m, e) : null;
  const trueDecade = exactDecade(m, e);
  let logx = logInfo ? logInfo.logx : trueDecade;
  const limit = pow10n(N);
  const lower = pow10n(N - 1);
  const passes = [];
  let result = null;
  for (let pass = 1; pass <= 3; pass++) {
    const scale = N - logx - 1;
    let zdir = scaleFactorDirection(mode, neg, scale);
    if (!guards.directedZ) zdir = "nearest";
    const k = Math.abs(scale);
    const power = powerOfTen(k, p, zdir, pow10);
    const x = { m, e };
    // exact product (what an infinitely precise multiply would give)
    const xr = extRational(x);
    const zr = extRational(power.z);
    const exact = scale >= 0
      ? { num: xr.num * zr.num, den: xr.den * zr.den }
      : { num: xr.num * zr.den, den: xr.den * zr.num };
    const productDir = guards.sticky === "round" ? dir : "chop";
    const reg = scale >= 0 ? mulExt(x, power.z, p, productDir) : divExt(x, power.z, p, productDir);
    const chopped = { m: reg.m, e: reg.e };
    let register = chopped;
    let stickySet = false;
    if (guards.sticky === "on" && reg.inexact) {
      stickySet = (reg.m & 1n) === 0n;
      register = { m: reg.m | 1n, e: reg.e };
    }
    const rounded = roundExtToInteger(register, dir);
    let q = rounded.q;
    let check = "ok";
    if (guards.b6) {
      if (q >= limit && pass === 1) check = "retry";
      else if (q < lower) { check = "forced"; q = lower; }
    }
    passes.push({ pass, logx, scale, zdir, power, exactProduct: exact, productDir, inexact: reg.inexact, chopped, register, stickySet, rounded: rounded.q, q, check });
    if (check === "retry") { logx++; continue; }
    result = { coefficient: q, logx };
    break;
  }
  const last = passes[passes.length - 1];
  return {
    input: { neg, m, e }, p, N, mode, dir, guards, logInfo, trueDecade, passes,
    coefficient: result.coefficient, logx: result.logx, exp10: result.logx - N + 1,
    zExact: last.power.exact, digitsOK: result.coefficient >= lower && result.coefficient < limit,
  };
}

/** Correctly rounded N-digit result (the exact reference). */
export function correctlyRounded(input, N, mode) {
  const { neg = false, m, e } = input;
  const dir = magnitudeDirection(mode, neg);
  let logx = exactDecade(m, e);
  const scale = N - logx - 1;
  let num = m; let den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  if (scale >= 0) num *= pow10n(scale); else den *= pow10n(-scale);
  let { q } = roundRationalToInteger(num, den, dir);
  if (q === pow10n(N)) { q = pow10n(N - 1); logx++; }
  return { coefficient: q, logx, exp10: logx - N + 1, scaled: { num, den } };
}

/** Compare c1·10^a1 with c2·10^a2 (non-negative coefficients). */
export function compareDecimal(c1, a1, c2, a2) {
  const a = Math.min(a1, a2);
  const l = c1 * pow10n(a1 - a);
  const r = c2 * pow10n(a2 - a);
  return l < r ? -1 : l > r ? 1 : 0;
}

/** Compare the decimal c·10^a with the binary m·2^e. */
export function compareDecimalBinary(c, a, m, e) {
  let ln = c; let ld = 1n; let rn = m; let rd = 1n;
  if (a >= 0) ln *= pow10n(a); else ld = pow10n(-a);
  if (e >= 0) rn <<= BigInt(e); else rd <<= BigInt(-e);
  const diff = ln * rd - rn * ld;
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/** |c·10^a − m·2^e| measured in units of 10^a, as a Number. */
export function errorInUlps(c, a, m, e) {
  let xn = m; let xd = 1n;
  if (e >= 0) xn <<= BigInt(e); else xd <<= BigInt(-e);
  // x / 10^a
  if (a >= 0) xd *= pow10n(a); else xn *= pow10n(-a);
  const diff = c * xd - xn;
  return Math.abs(ratioToNumber(diff, xd));
}

export const BOUND = { nearest: 0.5 + 0.019, directed: 1 + 0.054 };

/** Run Coonen and check every promise the algorithm makes. */
export function checkConversion(input, opts = {}) {
  const run = coonenB(input, opts);
  const { N = 17, mode = "nearest" } = opts;
  const ref = correctlyRounded(input, N, mode);
  const correct = compareDecimal(run.coefficient, run.exp10, ref.coefficient, ref.exp10) === 0;
  const { m, e, neg = false } = input;
  const cmp = compareDecimalBinary(run.coefficient, run.exp10, m, e); // magnitudes
  let directionOK = true;
  if (mode !== "nearest") {
    const wantBigger = (mode === "up" && !neg) || (mode === "down" && neg);
    directionOK = wantBigger ? cmp >= 0 : cmp <= 0;
  }
  const error = errorInUlps(run.coefficient, run.exp10, m, e);
  const bounds = opts.bounds || BOUND;
  const bound = mode === "nearest" ? bounds.nearest : bounds.directed;
  const broken = [];
  if (!run.digitsOK) broken.push("digits");
  if (run.zExact && !correct) broken.push("exact-band");
  if (!directionOK) broken.push("direction");
  if (run.digitsOK && error > bound) broken.push("bound");
  let roundTrip = null;
  if (opts.roundTripValue !== undefined && N >= 17 && mode === "nearest") {
    roundTrip = Number(`${neg ? "-" : ""}${run.coefficient}e${run.exp10}`) === opts.roundTripValue;
    if (!roundTrip) broken.push("round-trip");
  }
  return { run, ref, correct, directionOK, error, bound, roundTrip, broken };
}

// ---------------------------------------------------------------------------
// Doubles.

/** A finite nonzero double as { neg, m, e } (the exact value m·2^e). */
export function doubleInput(value) {
  const d = decodeDouble(value);
  if (d.special) throw new RangeError("needs a finite, nonzero double");
  const neg = d.negative;
  const m = d.significand < 0n ? -d.significand : d.significand;
  return { neg, m, e: d.exponent };
}

export function convertDouble(value, N = 17, mode = "nearest", safeguards = {}) {
  return checkConversion(doubleInput(value), { p: 64, N, mode, pow10: "Q", log: "L", safeguards, roundTripValue: value });
}

// ---------------------------------------------------------------------------
// The pocket toy: 6-bit input, N = 3 digits, 12-bit register.

export const TOY = Object.freeze({ inputBits: 6, N: 3, p: 12 });
/** Toy error bounds in units of the last digit: 0.5 (or 1) plus 10^3 · δ, with a
 *  toy z rounded once: δ ≤ 2^−12 to nearest, 2^−11 directed. */
export const TOY_BOUND = Object.freeze({ nearest: 0.5 + 1000 * 2 ** -12, directed: 1 + 1000 * 2 ** -11 });

export function toyInput(m, e) {
  return { neg: false, m: BigInt(m), e };
}

export function convertToy(m, e, mode = "nearest", safeguards = {}) {
  return checkConversion(toyInput(m, e), { p: TOY.p, N: TOY.N, mode, pow10: "direct", log: "exact", safeguards, bounds: TOY_BOUND });
}

/** Exhaustive toy statistics over all 6-bit significands 32..63 and exponents. */
export function toySurvey(eMin = -30, eMax = 20, mode = "nearest", safeguards = {}) {
  let total = 0; let exactBand = 0; let wrong = 0; let wrongInBand = 0; let roundTripFail = 0;
  for (let e = eMin; e <= eMax; e++) {
    for (let m = 32; m < 64; m++) {
      const c = convertToy(m, e, mode, safeguards);
      total++;
      if (c.run.zExact) exactBand++;
      if (!c.correct) { wrong++; if (c.run.zExact) wrongInBand++; }
      if (mode === "nearest" && !toyReadsBack(c.run.coefficient, c.run.exp10, m, e)) roundTripFail++;
    }
  }
  return { total, exactBand, wrong, wrongInBand, roundTripFail };
}

/** Does the decimal c·10^a read back (correctly rounded to 6 bits) as m·2^e? */
export function toyReadsBack(c, a, m, e) {
  // round c·10^a to 6 significant bits, nearest-even
  let num = c; let den = 1n;
  if (a >= 0) num *= pow10n(a); else den = pow10n(-a);
  const r = roundBits(num, den, 6, "nearest");
  // compare r.m·2^r.e with m·2^e
  const shift = r.e - e;
  return shift >= 0 ? (r.m << BigInt(shift)) === BigInt(m) : r.m === (BigInt(m) << BigInt(-shift));
}

// ---------------------------------------------------------------------------
// Formatting helpers (pure strings).

/** Exact decimal string of num/den when den is a power of two; else truncated. */
export function rationalToDecimal(num, den, maxFrac = 40) {
  const neg = num < 0n;
  let n = neg ? -num : num;
  const ip = n / den;
  let r = n % den;
  let frac = "";
  let k = 0;
  while (r !== 0n && k < maxFrac) { r *= 10n; frac += String(r / den); r %= den; k++; }
  const tail = r !== 0n ? "…" : "";
  return `${neg ? "−" : ""}${ip}${frac ? `.${frac}` : ""}${tail}`;
}

export function extToDecimal(v, maxFrac = 40) {
  const r = extRational(v);
  return rationalToDecimal(r.num, r.den, maxFrac);
}

/** Binary digits of an extended value with a binary point, e.g. "1110010011.01". */
export function extToBinary(v) {
  const bits = v.m.toString(2);
  if (v.e >= 0) return bits + "0".repeat(v.e);
  const fracLen = -v.e;
  if (fracLen >= bits.length) return `0.${"0".repeat(fracLen - bits.length)}${bits}`;
  return `${bits.slice(0, bits.length - fracLen)}.${bits.slice(bits.length - fracLen)}`;
}

/** Number of fraction bits the register holds (−e of the normalized value). */
export function fractionBits(v) {
  return Math.max(0, -v.e);
}

export function scientific(coefficient, logx, N) {
  const digits = coefficient.toString();
  const body = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${body}e${logx < 0 ? "−" : ""}${Math.abs(logx)}`;
}

// ---------------------------------------------------------------------------
// Seeded random doubles for the fuzzer.

export function makeRng(seed = 1) {
  let s = BigInt.asUintN(64, BigInt(seed) * 0x9E3779B97F4A7C15n + 0x2545F4914F6CDD1Dn) || 1n;
  return () => {
    s ^= s << 13n; s = BigInt.asUintN(64, s);
    s ^= s >> 7n;
    s ^= s << 17n; s = BigInt.asUintN(64, s);
    return s;
  };
}

/** A random positive double m·2^e with binary exponent in [eLo, eHi] (normal range). */
export function randomDouble(rng, eLo, eHi) {
  const bits = rng();
  const span = BigInt(eHi - eLo + 1);
  const E = eLo + Number((bits >> 52n) % span);
  const m = (1n << 52n) | (bits & ((1n << 52n) - 1n));
  const e = E - 52;
  return { neg: false, m, e, value: Number(m) * 2 ** e };
}

/** Sampling regions for N digits: where z = 10^|SCALE| is exact or rounded. */
export function regions(N = 17) {
  const k = exactPowerLimit(64); // 27
  // |SCALE| ≤ 27  ⇔  N−1−27 ≤ LOGX ≤ N−1+27
  const lo = N - 1 - k; const hi = N - 1 + k;
  const e2 = (d) => Math.floor(d / Math.log10(2));
  return {
    exact: { label: `z exact (10^${lo} … 10^${hi + 1})`, ranges: [[e2(lo) + 1, e2(hi + 1) - 1]] },
    rounded: { label: "z rounded (outside that band)", ranges: [[-1022, e2(lo) - 1], [e2(hi + 1) + 1, 1023]] },
    anywhere: { label: "anywhere", ranges: [[-1022, 1023]] },
  };
}

export function sampleRegion(rng, region) {
  const total = region.ranges.reduce((s, [a, b]) => s + (b - a + 1), 0);
  let pick = Number(rng() % BigInt(total));
  for (const [a, b] of region.ranges) {
    const width = b - a + 1;
    if (pick < width) return randomDouble(rng, a + pick, a + pick);
    pick -= width;
  }
  return randomDouble(rng, region.ranges[0][0], region.ranges[0][1]);
}
