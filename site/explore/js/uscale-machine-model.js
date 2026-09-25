// Copyright (C) 2026 Toit contributors.

// Pure model for the "uscale-machine" explanation page: a line-for-line BigInt
// port of Russ Cox's fpfmt (github.com/rsc/fpfmt, fpfmt.go and pow10gen.go at
// ec108cb) with tracing, plus exact rational references. No DOM access.

export const M64 = (1n << 64n) - 1n;
export const POW10_MIN = -348;
export const POW10_MAX = 347;
const MIN_EXP = -1085; // -(1074 + 11)

// ---------------------------------------------------------------- logs

// Go's >> on a negative int is an arithmetic shift, i.e. a floor division.
export const log10Pow2 = (x) => Math.floor((x * 78913) / 2 ** 18);
export const log2Pow10 = (x) => Math.floor((x * 108853) / 2 ** 15);
export const skewed = (e) => Math.floor((e * 631305 - 261663) / 2 ** 21);

// ---------------------------------------------------------------- table

const tableCache = new Map();

// pow10gen.go: pm = ⌈10^p / 2^pe⌉ in [2^127, 2^128), pe = ⌊log2 10^p⌋ − 127.
// The optimized code stores it as hi·2^64 − lo, so that hi alone is ⌈pm / 2^64⌉.
export function pow10Entry(p) {
  if (!Number.isInteger(p) || p < POW10_MIN || p > POW10_MAX) throw new RangeError(`p=${p} outside the table`);
  let entry = tableCache.get(p);
  if (entry) return entry;
  let num = p >= 0 ? 10n ** BigInt(p) : 1n;
  let den = p >= 0 ? 1n : 10n ** BigInt(-p);
  let be = 0;
  while (num < den << 127n) { num <<= 1n; be++; }
  while (num >= den << 128n) { den <<= 1n; be--; }
  const exact = num % den === 0n;
  const pm = exact ? num / den : num / den + 1n;
  let hi = pm >> 64n;
  let lo = pm & M64;
  if (lo !== 0n) { hi += 1n; lo = (1n << 64n) - lo; }
  entry = { p, pe: -be, pm, exact, hi, lo, pmHi: pm >> 64n, pmLo: pm & M64 };
  tableCache.set(p, entry);
  return entry;
}

// ε0 = pm − 10^p/2^pe ∈ [0, 1), as a decimal string truncated to `digits` places.
export function entryError(p, digits = 6) {
  const t = pow10Entry(p);
  let num = p >= 0 ? 10n ** BigInt(p) : 1n;
  let den = p >= 0 ? 1n : 10n ** BigInt(-p);
  if (t.pe >= 0) den <<= BigInt(t.pe); else num <<= BigInt(-t.pe);
  const errNum = t.pm * den - num; // ε0 · den
  if (errNum === 0n) return "0";
  const scaled = (errNum * 10n ** BigInt(digits)) / den;
  return `0.${scaled.toString().padStart(digits, "0")}…`;
}

// Exact decimal expansion of mant·2^exp2 (mant ≥ 0).
export function exactDecimal(mant, exp2) {
  if (exp2 >= 0) return (mant << BigInt(exp2)).toString();
  const k = -exp2;
  const digits = (mant * 5n ** BigInt(k)).toString().padStart(k + 1, "0");
  const int = digits.slice(0, digits.length - k);
  const frac = digits.slice(digits.length - k).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

// ---------------------------------------------------------------- floats

const view = new DataView(new ArrayBuffer(8));
export function bitsOf(f) { view.setFloat64(0, f); return view.getBigUint64(0); }
export function fromBits(b) { view.setBigUint64(0, b); return view.getFloat64(0); }
export const bitLen = (x) => (x === 0n ? 0 : x.toString(2).length);

// unpack64 returns m, e with f = m·2^e and m left-justified (top bit set).
export function unpack64(f) {
  const b = bitsOf(f);
  let m = (1n << 63n) | ((b & ((1n << 52n) - 1n)) << 11n);
  const be = Number((b >> 52n) & 0x7ffn);
  if (be === 0) {
    m &= ~(1n << 63n);
    const s = 64 - bitLen(m);
    return { m: m << BigInt(s), e: MIN_EXP - s };
  }
  return { m, e: be - 1 + MIN_EXP };
}

// pack64 takes a 53-bit mantissa and exponent; returns the double (or null on overflow).
export function pack64(m, e) {
  if ((m & (1n << 52n)) === 0n) return fromBits(m);
  const field = BigInt(1075 + e);
  if (field >= 2047n) return null;
  return fromBits((m & ~(1n << 52n)) | (field << 52n));
}

// ---------------------------------------------------------------- unrounded

export const floorU = (u) => u >> 2n;
export const roundHalfDownU = (u) => (u + 1n) >> 2n;
export const roundU = (u) => (u + 1n + ((u >> 2n) & 1n)) >> 2n;
export const roundHalfUpU = (u) => (u + 2n) >> 2n;
export const ceilU = (u) => (u + 3n) >> 2n;
export const nudgeU = (u, delta) => u + BigInt(delta);
export const divU = (u, d) => (u / d) | (u & 1n) | (u % d !== 0n ? 1n : 0n);
export const rshU = (u, s) => (u >> BigInt(s)) | (u & 1n) | ((u & ((1n << BigInt(s)) - 1n)) !== 0n ? 1n : 0n);
export const unmin = (x) => (x << 2n) - 2n;

// ⟨num/den⟩ = ⌊4·num/den⌋ | inexact
export function unroundRational(num, den) {
  const q = (4n * num) / den;
  return q | ((4n * num) % den !== 0n ? 1n : 0n);
}

export function ustr(u) {
  return `${u >> 2n}.${(u >> 1n) & 1n ? 5 : 0}${u & 1n ? "+" : ""}`;
}

// exact reference ⟨x·2^e·10^p⟩ (the unoptimized, bignum uscale0)
export function uscaleExact(x, e, p) {
  let num = 4n * x;
  let den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  if (p >= 0) num *= 10n ** BigInt(p); else den *= 10n ** BigInt(-p);
  return (num / den) | (num % den !== 0n ? 1n : 0n);
}

// ---------------------------------------------------------------- uscale

export function prescale(e, p, lp) {
  return { e, p, lp, entry: pow10Entry(p), s: -(e + lp + 3) };
}

// Optimized uscale (fpfmt.go). opts.skipCheck deletes the `if` block ("cut the corner").
// counter (optional) accumulates { fast, slow } call counts.
export function uscale(x, c, opts = {}, counter = null) {
  const s = BigInt(c.s);
  const prod = x * c.entry.hi;
  const hiRaw = prod >> 64n;
  const mid = prod & M64;
  let hi = hiRaw;
  let sticky = 1n;
  const mask = (1n << (s & 63n)) - 1n;
  const lowBits = hiRaw & mask;
  let fast = true;
  let mid2 = null;
  let borrow = false;
  if (!opts.skipCheck && lowBits === 0n) {
    fast = false;
    mid2 = (x * c.entry.lo) >> 64n;
    sticky = ((mid - mid2) & M64) > 1n ? 1n : 0n;
    borrow = mid < mid2;
    if (borrow) hi -= 1n;
  }
  if (counter) { if (fast || opts.skipCheck) counter.fast++; else counter.slow++; }
  const u = (hi >> s) | sticky;
  return { u, x, s: c.s, p: c.p, e: c.e, hiRaw, mid, lowBits, fast, mid2, borrow, hi, sticky, checkSkipped: !!opts.skipCheck && lowBits === 0n };
}

// ---------------------------------------------------------------- trimZeros

const rotr64 = (x, k) => ((x >> BigInt(k)) | (x << BigInt(64 - k))) & M64;

// Dragonbox's trailing-zero removal by multiplying with inverses of powers of 5 (fpfmt.go).
export function trimZeros(x, p) {
  const inv5p8 = 0xc767074b22e90e21n;
  const inv5p4 = 0xd288ce703afb7e91n;
  const inv5p2 = 0x8f5c28f5c28f5c29n;
  const inv5 = 0xcccccccccccccccdn;
  let d = rotr64((x * inv5) & M64, 1);
  if (d <= M64 / 10n) { x = d; p += 1; } else return [x, p];
  d = rotr64((x * inv5p8) & M64, 8);
  if (d <= M64 / 100000000n) { x = d; p += 8; }
  d = rotr64((x * inv5p4) & M64, 4);
  if (d <= M64 / 10000n) { x = d; p += 4; }
  d = rotr64((x * inv5p2) & M64, 2);
  if (d <= M64 / 100n) { x = d; p += 2; }
  d = rotr64((x * inv5) & M64, 1);
  if (d <= M64 / 10n) { x = d; p += 1; }
  return [x, p];
}

// ---------------------------------------------------------------- Short

// Short(f): shortest d·10^q that rounds back to f. f must be positive and finite.
export function Short(f, opts = {}, counter = null) {
  const { m, e } = unpack64(f);
  let min, p;
  let z = 11;
  const skew = m === 1n << 63n && e > MIN_EXP;
  const sub = !skew && e < MIN_EXP;
  if (skew) {
    p = -skewed(e + z);
    min = m - (1n << BigInt(z - 2));
  } else {
    if (sub) z = 11 + (MIN_EXP - e);
    p = -log10Pow2(e + z);
    min = m - (1n << BigInt(z - 1));
  }
  const max = m + (1n << BigInt(z - 1));
  const odd = Number((m >> BigInt(z)) & 1n);
  const lp = log2Pow10(p);
  const pre = prescale(e, p, lp);
  const cmin = uscale(min, pre, opts, counter);
  const cmax = uscale(max, pre, opts, counter);
  const dmin = ceilU(nudgeU(cmin.u, +odd));
  const dmax = floorU(nudgeU(cmax.u, -odd));
  const T = { f, m, e, z, skew, sub, p, min, max, odd, lp, s: pre.s, cmin, cmax, dmin, dmax, cm: null };
  let d = dmax / 10n;
  T.d10 = d;
  if (d * 10n >= dmin) {
    T.branch = "zero";
    const [dd, q] = trimZeros(d, -(p - 1));
    return Object.assign(T, { d: dd, q, untrimmed: d });
  }
  d = dmin;
  if (d < dmax) {
    T.branch = "round";
    T.cm = uscale(m, pre, opts, counter);
    d = roundU(T.cm.u);
  } else {
    T.branch = "single";
  }
  return Object.assign(T, { d, q: -p });
}

// ---------------------------------------------------------------- FixedWidth

export function FixedWidth(f, n, opts = {}) {
  if (n < 1 || n > 18) throw new RangeError("n must be 1..18");
  const { m, e } = unpack64(f);
  let p = n - 1 - log10Pow2(e + 63);
  const lp = log2Pow10(p);
  const pre = prescale(e, p, lp);
  const c = uscale(m, pre, opts);
  const u = c.u;
  let d = roundU(u);
  const T = { f, n, m, e, p0: p, lp, s: pre.s, call: c, u, d0: d, limit: 10n ** BigInt(n), div: null };
  if (d >= T.limit) {
    T.div = divU(u, 10n);
    d = roundU(T.div);
    p = p - 1;
  }
  return Object.assign(T, { d, p, q: -p });
}

// ---------------------------------------------------------------- Parse

// ParseText's digit reader (fpfmt.go): returns { d, p } or null if malformed.
export function parseText(s) {
  const isDigit = (c) => c >= "0" && c <= "9";
  const maxDigits = 19;
  let d = 0n;
  let frac = 0;
  let i = 0;
  for (; i < s.length && isDigit(s[i]); i++) d = d * 10n + BigInt(s.charCodeAt(i) - 48);
  if (i > maxDigits) return null;
  if (i < s.length && s[i] === ".") {
    i++;
    for (; i < s.length && isDigit(s[i]); i++) { d = d * 10n + BigInt(s.charCodeAt(i) - 48); frac++; }
    if (i === 1 || i > maxDigits + 1) return null;
  }
  if (i === 0) return null;
  let p = 0;
  if (i < s.length && (s[i] === "e" || s[i] === "E")) {
    i++;
    let sign = 1;
    if (i < s.length) {
      if (s[i] === "-") { sign = -1; i++; } else if (s[i] === "+") i++;
    }
    if (i >= s.length || s.length - i > 3) return null;
    for (; i < s.length && isDigit(s[i]); i++) p = p * 10 + (s.charCodeAt(i) - 48);
    p *= sign;
  }
  if (i !== s.length) return null;
  return { d, p: p - frac };
}

export function Parse(d, p, opts = {}) {
  if (d > 10n ** 19n) throw new RangeError("too many digits");
  const b = bitLen(d);
  const lp = log2Pow10(p);
  const e0 = Math.min(1074, 53 - b - lp);
  const x = (d << BigInt(64 - b)) & M64;
  const pre = prescale(e0 - (64 - b), p, lp);
  const c = uscale(x, pre, opts);
  const u0 = c.u;
  const sh = u0 >= unmin(1n << 53n) ? 1 : 0;
  const u = (u0 >> BigInt(sh)) | (u0 & 1n);
  const e = e0 - sh;
  const mant = roundU(u);
  const f = pack64(mant, -e);
  return { d, p, b, lp, e0, x, s: pre.s, call: c, u0, sh, u, e, mant, f };
}

// ---------------------------------------------------------------- output helpers

// d·10^q → the digit string and scientific exponent (like toExponential()).
export function sci(d, q) {
  const digits = d.toString();
  return { digits, exp: q + digits.length - 1 };
}

// Format d·10^q the way JavaScript's Number.prototype.toString would.
export function jsString(d, q) {
  const { digits, exp } = sci(d, q);
  const k = digits.length;
  const n = exp + 1;
  if (k <= n && n <= 21) return digits + "0".repeat(n - k);
  if (0 < n && n <= 21) return `${digits.slice(0, n)}.${digits.slice(n)}`;
  if (-6 < n && n <= 0) return `0.${"0".repeat(-n)}${digits}`;
  const mant = k === 1 ? digits : `${digits[0]}.${digits.slice(1)}`;
  return `${mant}e${exp >= 0 ? "+" : "-"}${Math.abs(exp)}`;
}

// Does Short's answer match JavaScript's own shortest output?
export function matchesJs(f, d, q) {
  const [mant, ex] = f.toExponential().split("e");
  const { digits, exp } = sci(d, q);
  return mant.replace(".", "") === digits && Number(ex) === exp;
}

// ---------------------------------------------------------------- 192-bit product view

export const hex64 = (x) => (x & M64).toString(16).padStart(16, "0");

// Split x·pm (the 128-bit, rounded-up table entry) and the ideal x·10^p/2^pe into
// three 64-bit words [hi | mid | lo]. The ideal bottom word may have a fraction.
export function product192(x, p) {
  const t = pow10Entry(p);
  const P = x * t.pm;
  let num = x;
  let den = 1n;
  if (p >= 0) num *= 10n ** BigInt(p); else den *= 10n ** BigInt(-p);
  if (t.pe >= 0) den <<= BigInt(t.pe); else num <<= BigInt(-t.pe);
  const I = num / den; // integer part of the ideal product
  const iFrac = num % den !== 0n;
  const words = (v) => ({ hi: (v >> 128n) & M64, mid: (v >> 64n) & M64, lo: v & M64 });
  // error = P − ideal = x·ε0, with 0 ≤ ε0 < 1
  const errNum = P * den - num; // = error · den
  return {
    x, p, entry: t,
    computed: words(P),
    ideal: words(I),
    idealFrac: iFrac,
    errorIsZero: errNum === 0n,
    errorApprox: Number(errNum * 1000n / den) / 1000, // error in units of the bottom word's last bit
    carriedIntoMid: ((P >> 64n) !== (I >> 64n)),
    carriedIntoHi: ((P >> 128n) !== (I >> 128n)),
  };
}

// ---------------------------------------------------------------- random doubles

// splitmix64 over BigInt; returns a generator of positive finite doubles from random bit patterns.
export function makeRandomDoubles(seed) {
  let state = BigInt.asUintN(64, BigInt(seed));
  const next64 = () => {
    state = (state + 0x9e3779b97f4a7c15n) & M64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M64;
    return z ^ (z >> 31n);
  };
  return () => {
    for (;;) {
      const b = next64() >> 1n; // sign bit 0
      const f = fromBits(b);
      if (Number.isFinite(f) && f !== 0) return f;
    }
  };
}

// One batch of the statistics run: Short with and without the check on each double.
export function statsBatch(nextDouble, count, acc) {
  for (let i = 0; i < count; i++) {
    const f = nextDouble();
    const before = acc.calls.slow;
    const r = Short(f, {}, acc.calls);
    acc.n++;
    if (acc.calls.slow === before) acc.allFast++;
    acc.branch[r.branch]++;
    if (!matchesJs(f, r.d, r.q)) acc.mismatch++;
    const c = Short(f, { skipCheck: true });
    const [a0, a1] = trimZeros(r.d, r.q);
    const [b0, b1] = trimZeros(c.d, c.q);
    if (a0 !== b0 || a1 !== b1) {
      acc.cutWrong++;
      if (Number(`${c.d}e${c.q}`) !== f) acc.cutNoRoundTrip++;
      if (acc.examples.length < 6) acc.examples.push(f);
    }
  }
  return acc;
}

export function newStats() {
  return { n: 0, calls: { fast: 0, slow: 0 }, allFast: 0, branch: { zero: 0, single: 0, round: 0 }, mismatch: 0, cutWrong: 0, cutNoRoundTrip: 0, examples: [] };
}

// Verify batch: Short vs JavaScript, and Parse(Short(f)) === f.
export function verifyBatch(nextDouble, count, acc) {
  for (let i = 0; i < count; i++) {
    const f = nextDouble();
    const r = Short(f);
    acc.n++;
    const ok = matchesJs(f, r.d, r.q);
    let back = null;
    try { back = Parse(r.d, r.q).f; } catch { back = null; }
    if (!ok) { acc.bad++; if (acc.badExamples.length < 5) acc.badExamples.push(f); }
    if (back !== f) { acc.parseBad++; if (acc.badExamples.length < 5) acc.badExamples.push(f); }
  }
  return acc;
}

// ---------------------------------------------------------------- toy carry sandbox

// 12-bit toy: [top 4 | middle 4 | bottom 4]. Carry mode: computed = ideal + err.
// Borrow mode: true = seen − err. Returns the resulting value and which bits the carry/borrow ran through.
export function toyRipple(value, err, mode) {
  const result = mode === "borrow" ? value - err : value + err;
  const wrapped = ((result % 4096) + 4096) % 4096;
  // positions (0 = lsb) whose bit changed because of the ripple above the bottom word
  const changed = [];
  for (let i = 0; i < 12; i++) if (((value >> i) & 1) !== ((wrapped >> i) & 1)) changed.push(i);
  const top = (v) => (v >> 8) & 15;
  const mid = (v) => (v >> 4) & 15;
  const seen = mode === "borrow" ? value : wrapped; // what the machine sees
  return {
    value, err, mode, result: wrapped,
    reachedMid: mid(value) !== mid(wrapped) || top(value) !== top(wrapped),
    reachedTop: top(value) !== top(wrapped),
    seenMid: mid(seen),
    changed,
  };
}

// ---------------------------------------------------------------- expression input

// Evaluate a small arithmetic expression in double arithmetic (like JavaScript would):
// numbers, + − * / ^ (power), parentheses, pi, and 0x… bit patterns.
export function evalDouble(text) {
  const src = String(text).trim();
  if (/^0x[0-9a-f]{1,16}$/i.test(src)) return fromBits(BigInt(src));
  const toks = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|pi|π|\*\*|[-+*/^()]|\S/gi) || [];
  let i = 0;
  const peek = () => toks[i];
  const take = () => toks[i++];
  const primary = () => {
    const t = take();
    if (t === undefined) throw new Error("unexpected end");
    if (t === "(") { const v = sum(); if (take() !== ")") throw new Error("missing )"); return v; }
    if (t === "-") return -power();
    if (t === "+") return power();
    if (/^pi$|^π$/i.test(t)) return Math.PI;
    if (/^[\d.]/.test(t)) return Number(t);
    throw new Error(`unexpected “${t}”`);
  };
  const power = () => {
    const base = primary();
    if (peek() === "^" || peek() === "**") { take(); return base ** power(); }
    return base;
  };
  const product = () => {
    let v = power();
    while (peek() === "*" || peek() === "/") { const op = take(); const r = power(); v = op === "*" ? v * r : v / r; }
    return v;
  };
  const sum = () => {
    let v = product();
    while (peek() === "+" || peek() === "-") { const op = take(); const r = product(); v = op === "+" ? v + r : v - r; }
    return v;
  };
  const v = sum();
  if (i !== toks.length) throw new Error(`unexpected “${toks[i]}”`);
  return v;
}
