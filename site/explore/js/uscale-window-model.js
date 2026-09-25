// Copyright (C) 2026 Toit contributors.
//
// Pure computation for the "Four zones, then the decimal window" page
// (unrounded scaling, Russ Cox 2026). No DOM; importable from node.
//
// Everything is exact BigInt arithmetic. `uscaleExact` is the definition
// ⟨x·2^e·10^p⟩; `uscaleFast` is a port of the optimized fpfmt.go uscale
// (github.com/rsc/fpfmt at ec108cb), used only to show that the two agree.

// ---------------------------------------------------------------------------
// Unrounded numbers: ⟨x⟩ = ⌊4x⌋ | (4x ≠ ⌊4x⌋)
// ---------------------------------------------------------------------------

/** ⟨num/den⟩ for non-negative BigInts. */
export function unroundRational(num, den) {
  const q = (4n * num) / den;
  return q | ((4n * num) % den !== 0n ? 1n : 0n);
}

/** Integer part, half bit, sticky bit of a code. */
export function parts(u) {
  return { int: u >> 2n, half: Number((u >> 1n) & 1n), sticky: Number(u & 1n) };
}

/** "6.0+", "6.5", ... (without the angle brackets). */
export function ustr(u) {
  const { int, half, sticky } = parts(u);
  return `${int}.${half ? 5 : 0}${sticky ? "+" : ""}`;
}

/** The five rounding rules: add a constant, then shift right by two. */
export const RULES = [
  { id: "floor", label: "floor", add: () => 0n },
  { id: "down", label: "round ½↓", add: () => 1n },
  { id: "even", label: "round ½-even", add: (u) => 1n + ((u >> 2n) & 1n) },
  { id: "up", label: "round ½↑", add: () => 2n },
  { id: "ceil", label: "ceil", add: () => 3n },
];
export const ruleById = (id) => RULES.find((r) => r.id === id);
export const applyRule = (id, u) => (u + ruleById(id).add(u)) >> 2n;
export const floorU = (u) => u >> 2n;
export const ceilU = (u) => (u + 3n) >> 2n;
export const roundU = (u) => (u + 1n + ((u >> 2n) & 1n)) >> 2n;

/** Unrounded division: the sticky bit sticks. */
export function udiv(u, d) {
  return (u / d) | (u & 1n) | (u % d !== 0n ? 1n : 0n);
}

/** The "round now or later" example from Cox's post: 15.4 / 6. */
export function roundNowOrLater() {
  const u = unroundRational(154n, 10n); // ⟨15.4⟩
  const early = 15n; // 15.4 rounded first
  const earlyQ = unroundRational(early, 6n); // ⟨2.5⟩ exactly
  const q = udiv(u, 6n);
  return {
    u, uStr: ustr(u),
    early, earlyQ, earlyQStr: ustr(earlyQ), earlyResult: roundU(earlyQ),
    q, qStr: ustr(q), result: roundU(q),
    truth: unroundRational(154n, 60n), // ⟨15.4/6⟩ computed directly
  };
}

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);
export function bitsOf(f) { f64[0] = f; return u64[0]; }
export function fromBits(b) { u64[0] = b; return f64[0]; }

export const MIN_EXP = -1085;

/** fpfmt unpack64: m left-justified in [2^63, 2^64), f = m·2^e. */
export function unpack64(f) {
  const b = bitsOf(f);
  let m = (1n << 63n) | ((b & ((1n << 52n) - 1n)) << 11n);
  const be = Number((b >> 52n) & 0x7ffn);
  if (be === 0) {
    m &= ~(1n << 63n);
    const s = 64 - m.toString(2).length;
    return { m: m << BigInt(s), e: MIN_EXP - s };
  }
  return { m, e: be - 1 + MIN_EXP };
}

/** f = M·2^E with M the stored (53-bit or subnormal) significand. */
export function decode53(f) {
  const b = bitsOf(f);
  const frac = b & ((1n << 52n) - 1n);
  const be = Number((b >> 52n) & 0x7ffn);
  if (be === 0) return { M: frac, E: -1074 };
  return { M: (1n << 52n) | frac, E: be - 1075 };
}

export function nextUp(f) { return f === 0 ? Number.MIN_VALUE : fromBits(bitsOf(f) + 1n); }
export function nextDown(f) { return f <= Number.MIN_VALUE ? 0 : fromBits(bitsOf(f) - 1n); }

/** Exact decimal expansion of a positive rational num/den (den a power of 2 times 1). */
export function exactDecimalString(num, den) {
  const intPart = num / den;
  let rem = num % den;
  if (rem === 0n) return intPart.toString();
  let digits = "";
  // den is a power of two, so this terminates.
  while (rem !== 0n) { rem *= 10n; digits += (rem / den).toString(); rem %= den; }
  return `${intPart}.${digits}`;
}

export function exactDecimalOfDouble(f) {
  const { M, E } = decode53(f);
  return E >= 0 ? (M << BigInt(E)).toString() : exactDecimalString(M, 1n << BigInt(-E));
}

// ---------------------------------------------------------------------------
// Log approximations used by fpfmt (Go >> is an arithmetic shift = floor)
// ---------------------------------------------------------------------------
export const log10Pow2 = (x) => Math.floor((x * 78913) / 2 ** 18);
export const log2Pow10 = (x) => Math.floor((x * 108853) / 2 ** 15);
export const skewed = (e) => Math.floor((e * 631305 - 261663) / 2 ** 21);

// ---------------------------------------------------------------------------
// uscale
// ---------------------------------------------------------------------------

const P10 = new Map();
export function pow10(n) {
  let v = P10.get(n);
  if (v === undefined) { v = 10n ** BigInt(n); P10.set(n, v); }
  return v;
}

/** The exact rational x·2^e·10^p as { num, den }. */
export function scaled(x, e, p) {
  let num = x, den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  if (p >= 0) num *= pow10(p); else den *= pow10(-p);
  return { num, den };
}

/** uscale by definition: ⟨x·2^e·10^p⟩. */
export function uscaleExact(x, e, p) {
  const { num, den } = scaled(x, e, p);
  return unroundRational(num, den);
}

const M64 = (1n << 64n) - 1n;
const TAB = new Map();
/** pow10Tab entry: pm = ⌈10^p / 2^pe⌉ in [2^127, 2^128), stored as hi·2^64 − lo. */
export function pmEntry(p) {
  let t = TAB.get(p);
  if (t) return t;
  const num0 = p >= 0 ? pow10(p) : 1n, den0 = p >= 0 ? 1n : pow10(-p);
  const bl = (v) => v.toString(2).length;
  let k = 128 - (bl(num0) - bl(den0));
  let pm, exact;
  for (;;) {
    const num = k >= 0 ? num0 << BigInt(k) : num0, den = k >= 0 ? den0 : den0 << BigInt(-k);
    const q = num / den;
    if (q >= 1n << 128n) { k--; continue; }
    if (q < 1n << 127n) { k++; continue; }
    exact = q * den === num;
    pm = exact ? q : q + 1n;
    if (pm === 1n << 128n) { k--; continue; }
    break;
  }
  let hi = pm >> 64n, lo = pm & M64;
  if (lo !== 0n) { hi++; lo = ((1n << 64n) - lo) & M64; }
  t = { pm, hi, lo, exact };
  TAB.set(p, t);
  return t;
}

/** Port of fpfmt.go's optimized uscale (x left-justified, 64-bit). */
export function uscaleFast(x, e, p) {
  const { hi: pmHi, lo: pmLo } = pmEntry(p);
  const s = -(e + log2Pow10(p) + 3);
  const prod = x * pmHi;
  let hi = prod >> 64n;
  const mid = prod & M64;
  let sticky = 1n;
  const oneMultiply = (hi & ((1n << BigInt(s)) - 1n)) !== 0n;
  if (!oneMultiply) {
    const mid2 = (x * pmLo) >> 64n;
    sticky = ((mid - mid2) & M64) > 1n ? 1n : 0n;
    if (mid < mid2) hi -= 1n;
  }
  return { u: (hi >> BigInt(s)) | sticky, oneMultiply };
}

// ---------------------------------------------------------------------------
// Short(f) with everything the page draws
// ---------------------------------------------------------------------------

export function trimZeros(d, x) {
  while (d !== 0n && d % 10n === 0n) { d /= 10n; x++; }
  return { d, x };
}

/** Approximate a rational as a Number (fine for drawing and 3-digit readouts). */
export function toNum(num, den) {
  if (den === 0n) return NaN;
  const neg = (num < 0n) !== (den < 0n);
  let a = num < 0n ? -num : num; const b = den < 0n ? -den : den;
  const ip = a / b; a %= b;
  const frac = Number((a * 1000000000n) / b) / 1e9;
  const v = Number(ip) + frac;
  return neg ? -v : v;
}

/** The algorithm's own p for f (Short). */
export function algorithmP(f) { return analyze(f).p0; }

/**
 * Run Short(f) exactly.
 * opts.p    — use this decimal exponent instead of the algorithm's (for the p dial)
 * opts.flip — pretend the mantissa has the other parity
 */
export function analyze(f, opts = {}) {
  if (!(f > 0) || !Number.isFinite(f)) throw new RangeError("need a finite positive double");
  const { m, e } = unpack64(f);
  const { M, E } = decode53(f);
  let z = 11, skew = false, min, p0;
  if (m === 1n << 63n && e > MIN_EXP) {
    skew = true;
    p0 = -skewed(e + z);
    min = m - (1n << BigInt(z - 2));
  } else {
    if (e < MIN_EXP) z = 11 + (MIN_EXP - e);
    p0 = -log10Pow2(e + z);
    min = m - (1n << BigInt(z - 1));
  }
  const max = m + (1n << BigInt(z - 1));
  const odd = Number((m >> BigInt(z)) & 1n);
  const flip = !!opts.flip;
  const oddUsed = flip ? 1 - odd : odd;
  if (p0 === 0) p0 = 0; // normalize -0
  const p = opts.p ?? p0;
  const umin = uscaleExact(min, e, p);
  const umax = uscaleExact(max, e, p);
  const um = uscaleExact(m, e, p);
  const dmin = ceilU(umin + BigInt(oddUsed));
  const dmax = floorU(umax - BigInt(oddUsed));
  const count = dmax >= dmin ? dmax - dmin + 1n : 0n;
  const c10lo = (dmin + 9n) / 10n, c10hi = dmax / 10n;
  const zeroCount = count > 0n && c10hi >= c10lo ? c10hi - c10lo + 1n : 0n;
  // footprint · 10^p (window width in decimal units)
  const w = scaled(max - min, e, p);
  const width = toNum(w.num, w.den);
  const rounded = roundU(um);

  let kase, d, x, pick;
  if (count === 0n) {
    kase = "none";
  } else if ((dmax / 10n) * 10n >= dmin) {
    kase = "zero";
    pick = (dmax / 10n) * 10n;
    ({ d, x } = trimZeros(dmax / 10n, -(p - 1)));
  } else if (dmin === dmax) {
    kase = "single";
    pick = dmin; d = dmin; x = -p;
  } else {
    kase = "round";
    pick = rounded; d = rounded; x = -p;
  }
  if (x === 0) x = 0; // normalize -0
  const text = d === undefined ? null : `${d}e${x}`;
  const back = text === null ? NaN : Number(text);

  // Fast path check (only meaningful for the algorithm's own p and parity).
  let fast = null;
  if (p === p0 && p >= -348 && p <= 347) {
    const a = uscaleFast(min, e, p), b = uscaleFast(max, e, p), c = uscaleFast(m, e, p);
    fast = { umin: a.u, umax: b.u, um: c.u, agrees: a.u === umin && b.u === umax && c.u === um,
      oneMultiply: [a.oneMultiply, b.oneMultiply, c.oneMultiply] };
  }

  return {
    f, M, E, m, e, z, skew, min, max, odd, oddUsed, flip, p0, p,
    umin, umax, um, dmin, dmax, count, zeroCount, width, rounded,
    roundedInside: rounded >= dmin && rounded <= dmax,
    case: kase, pick, d, x, text, back, roundTrips: back === f, jsString: String(f),
    fast,
  };
}

/** Position of the real number k·10^-p on the binary axis, in units of the upper gap 2^(e+z). */
export function axisPos(a, kNum, kDen = 1n) {
  // t = (k/kDen · 10^-p − m·2^e) / 2^(e+z)
  //   = (k·10^-p·2^-(e+z) / kDen) − m·2^-z
  const s = a.e + a.z;
  let num = kNum, den = kDen;
  if (a.p >= 0) den *= pow10(a.p); else num *= pow10(-a.p);
  if (s >= 0) den <<= BigInt(s); else num <<= BigInt(-s);
  const zz = 1n << BigInt(a.z);
  // subtract m / 2^z
  num = num * zz - a.m * den;
  den *= zz;
  return toNum(num, den);
}

/** Scaled value at axis position t (a rational tn/td), i.e. (m·2^e + t·2^(e+z))·10^p as {num, den}. */
export function scaledAt(a, tn, td) {
  const x = a.m * td + (tn << BigInt(a.z)); // (m + t·2^z)·td
  const r = scaled(x, a.e, a.p);
  return { num: r.num, den: r.den * td };
}

export function floorDiv(n, d) { const q = n / d; return (n % d !== 0n && (n < 0n) !== (d < 0n)) ? q - 1n : q; }
export function ceilDiv(n, d) { return -floorDiv(-n, d); }

/** Integers k (decimal ticks at scale 10^-p) whose axis position lies in [tLoN/den, tHiN/den]. */
export function tickRange(a, tLoN, tHiN, den = 100) {
  const lo = scaledAt(a, BigInt(tLoN), BigInt(den)), hi = scaledAt(a, BigInt(tHiN), BigInt(den));
  return { kLo: ceilDiv(lo.num, lo.den), kHi: floorDiv(hi.num, hi.den) };
}

/** Largest common prefix of two digit strings of equal length (else ""). */
export function commonPrefix(a, b) {
  if (a.length !== b.length) return "";
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

// ---------------------------------------------------------------------------
// Tie demo: two decimals after the point, ⟨x·100⟩ of the exact double
// ---------------------------------------------------------------------------
export function twoPlaces(x) {
  const { M, E } = decode53(x);
  const u = uscaleExact(M, E, 2);
  return { u, str: ustr(u), even: roundU(u), up: applyRule("up", u), exact: exactDecimalOfDouble(x) };
}
export const fmt2 = (n) => { const s = n.toString().padStart(3, "0"); return `${s.slice(0, -2)}.${s.slice(-2)}`; };

// ---------------------------------------------------------------------------
// Input parsing: numbers, 2^k, and one binary operation (0.1+0.2, 2/3, 2^53-1)
// ---------------------------------------------------------------------------
const NUM = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
function operand(src) {
  const pow = src.match(/^2(?:\^|\*\*)(-?\d+)/);
  if (pow) return { v: 2 ** Number(pow[1]), len: pow[0].length };
  const n = src.match(NUM);
  if (n) return { v: Number(n[0]), len: n[0].length };
  return null;
}
export function parseInput(text) {
  const src = String(text).replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/×/g, "*").replace(/\*\*/g, "^");
  if (!src) return null;
  const a = operand(src);
  if (!a) return null;
  const rest = src.slice(a.len);
  if (!rest) return a.v;
  const op = rest[0];
  if (!"+-*/".includes(op)) return null;
  const b = operand(rest.slice(1));
  if (!b || b.len !== rest.length - 1) return null;
  return op === "+" ? a.v + b.v : op === "-" ? a.v - b.v : op === "*" ? a.v * b.v : a.v / b.v;
}

export const PRESETS = [
  { input: "0.3", note: "ends in 0" },
  { input: "0.1+0.2", note: "round" },
  { input: "2/3", note: "only one" },
  { input: "2^89", note: "power of two" },
  { input: "1/7", note: "round" },
  { input: "5e-324", note: "smallest" },
  { input: "1e23", note: "exact edge" },
  { input: "2^53-1", note: "nudge" },
];

export const QUIZ = [
  { input: "5e-324", hint: "Every candidate is one digit long. Which one is nearest the value?" },
  { input: "0.1", hint: "Is there a tick ending in 0 inside the window?" },
  { input: "2/3", hint: "How many ticks fit inside?" },
  { input: "0.1+0.2", hint: "Several ticks, none ending in 0." },
  { input: "2^89", hint: "The gap below this power of two is half as wide." },
  { input: "1e23", hint: "Look closely at the right edge. Is it included?" },
];

/** Which ticks the quiz offers: the window plus a margin, and the nearest-rounded value. */
export function quizChoices(a) {
  const set = new Set();
  for (let k = a.dmin - 2n; k <= a.dmax + 2n; k++) if (k >= 0n) set.add(k);
  set.add(a.rounded);
  return [...set].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}
