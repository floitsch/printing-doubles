// Copyright (C) 2026 Toit contributors.
//
// Register-exact BigInt model of the binary64 core of xjb (xjb64 in
// src/ftoa.cpp of https://github.com/xjb714/xjb, commit 80cc895), plus exact
// rational reference values used to explain each register. Pure computation,
// no DOM: importable from node for tests.

export const M64 = (1n << 64n) - 1n;
export const OFFSET = 9; // `const int offset = 9;` in the source (the paper uses BIT = 6)
export const HALF = (1n << 63n) + 6n; // cv->c4 in the source
export const TIE = 1n << 62n; // dot_one of n = 1/4

const view = new DataView(new ArrayBuffer(8));
export function bitsOf(v) { view.setFloat64(0, v); return view.getBigUint64(0); }
export function fromBits(b) { view.setBigUint64(0, BigInt.asUintN(64, b)); return view.getFloat64(0); }
export function nextUp(v) { return fromBits(bitsOf(v) + 1n); }
export function nextDown(v) { return fromBits(bitsOf(v) - 1n); }

const P10 = [1n];
export function pow10(e) { while (P10.length <= e) P10.push(P10.at(-1) * 10n); return P10[e]; }
const bitLength = (x) => x.toString(2).length;

// floor(e · log2 10), exact.
export function floorLog2Pow10(e) {
  if (e >= 0) return bitLength(pow10(e)) - 1;
  // 2^t <= 10^e < 2^(t+1)  <=>  2^-t >= 10^-e > 2^-(t+1)
  const p = pow10(-e);
  const b = bitLength(p); // 2^(b-1) <= p < 2^b
  return (p & (p - 1n)) === 0n ? -(b - 1) : -b;
}

const tableCache = new Map();
// pow10[e] = ceil(10^e · 2^(127 − floor(e·log2 10))), 128 bits, top bit set.
// The constexpr generator in ftoa.cpp produces exactly these words (checked in
// the tests against a port of that generator).
export function pow10Entry(e) {
  if (tableCache.has(e)) return tableCache.get(e);
  const s = 127 - floorLog2Pow10(e);
  let num = e >= 0 ? pow10(e) : 1n;
  let den = e >= 0 ? 1n : pow10(-e);
  if (s >= 0) num <<= BigInt(s); else den <<= BigInt(-s);
  const entry = { value: (num + den - 1n) / den, shift: s, exact: num % den === 0n };
  tableCache.set(e, entry);
  return entry;
}

export function decompose(v) {
  const bits = bitsOf(v);
  const sig = bits & ((1n << 52n) - 1n);
  const exp = Number((bits >> 52n) & 2047n);
  const subnormal = exp === 0;
  return {
    bits,
    negative: (bits >> 63n) === 1n,
    sig,
    exp,
    c: subnormal ? sig : sig | (1n << 52n),
    q: subnormal ? -1074 : exp - 1075,
    subnormal,
    irregular: sig === 0n && exp !== 0,
  };
}

const floorShift = (x, s) => Math.floor(x / 2 ** s); // arithmetic >> for small ints

// The twelve lines of the regular path, register for register.
export function traceRegular(v) {
  if (!Number.isFinite(v) || v === 0) throw new RangeError("expected a finite nonzero double");
  const d = decompose(Math.abs(v));
  const { c, q } = d;
  // The source computes k from exp − 1075 (also for subnormals, where q = −1074):
  // both give the same k.
  const k = floorShift((d.exp - 1075) * 78913, 18); // line 1
  const e = -k - 1;
  const h = q + floorShift(e * 217707, 16); // line 2 (the source stores h + 10 in table h7)
  const entry = pow10Entry(e); // line 3
  const pow10v = entry.value;
  const pHi = pow10v >> 64n;
  const pLo = pow10v & M64;
  const operand = (c << BigInt(h + 1 + OFFSET)) & M64; // line 4
  const prod = (operand * pow10v) >> 64n; // high 128 bits of the 192-bit product (exact)
  const hi64 = prod >> 64n;
  const lo64 = prod & M64;
  const m = hi64 >> BigInt(OFFSET); // line 5
  const dotOne = ((hi64 << BigInt(64 - OFFSET)) | (lo64 >> BigInt(OFFSET))) & M64; // line 6
  const shifted = pHi >> BigInt(-h);
  const even = (c + 1n) & 1n;
  const halfUlp = shifted + even; // line 7
  const down = halfUlp > dotOne; // line 8
  const notDot = M64 - dotOne; // ~dot_one
  const up = halfUlp > notDot; // line 9
  const half = dotOne === TIE ? 0n : HALF; // line 10
  const tenDot = dotOne * 10n + half;
  const one = tenDot >> 64n; // line 11
  const mUp = m + (up ? 1n : 0n); // line 12
  const upDown = (up ? 1 : 0) + (down ? 1 : 0);
  const coefficient = mUp * 10n + (upDown ? 0n : one);
  return {
    ...d, k, e, h, entry, pow10: pow10v, pHi, pLo, operand, prod, hi64, lo64, m, dotOne,
    shifted, even, halfUlp, down, notDot, up, half, tenDot, one, mUp, upDown, coefficient,
  };
}

// The [[unlikely]] branch for powers of two (sig == 0, exp in [1, 2046]),
// transcribed from the source. Only the high table word is used.
export function irregularBranch(v) {
  const d = decompose(Math.abs(v));
  if (!d.irregular) throw new RangeError("not a power of two with a lopsided interval");
  const { q } = d;
  const k = floorShift(q * 315653 - 131072, 20);
  const h = q + floorShift(k * -217707 - 217707, 16);
  const pHi = pow10Entry(-k - 1).value >> 64n;
  const halfUlp = pHi >> BigInt(-h);
  const dotOne = (pHi << BigInt(53 + h)) & M64;
  const up = halfUlp > M64 - dotOne;
  const down = (halfUlp >> 1n) > dotOne;
  const m = pHi >> BigInt(11 - h);
  const mUp = m + (up ? 1n : 0n);
  const upDown = (up ? 1 : 0) + (down ? 1 : 0);
  const nearest = ((dotOne >> BigInt(53 + h)) * 5n + (1n << BigInt(9 - h))) >> BigInt(10 - h);
  let one = nearest;
  let bumped = false;
  if ((((dotOne >> 54n) * 5n) & 511n) > ((halfUlp >> 55n) * 5n)) {
    one = (((dotOne >> 54n) * 5n) >> 9n) + 1n;
    bumped = one !== nearest;
  }
  if (dotOne === TIE) one = 2n;
  const coefficient = mUp * 10n + (upDown ? 0n : one);
  return { ...d, k, h, pHi, halfUlp, dotOne, up, down, m, mUp, upDown, nearest, one, bumped, coefficient };
}

export function stripZeros(coefficient, k) {
  let digits = coefficient;
  let exp = k;
  while (digits !== 0n && digits % 10n === 0n) { digits /= 10n; exp++; }
  return { digits, exp };
}

// Full conversion (positive or negative finite doubles), as xjb64 decides it.
export function xjb64(v) {
  if (v === 0) return { digits: 0n, exp: 0, negative: Object.is(v, -0) };
  const d = decompose(v);
  if (d.irregular) {
    const r = irregularBranch(v);
    return { ...stripZeros(r.coefficient, r.k), negative: d.negative, path: "irregular" };
  }
  const r = traceRegular(v);
  return { ...stripZeros(r.coefficient, r.k), negative: d.negative, path: r.up ? "up" : r.down ? "down" : "nearest" };
}

// What the regular (symmetric) lines alone would print for a power of two.
export function symmetricResult(v) {
  const r = traceRegular(v);
  return stripZeros(r.coefficient, r.k);
}

// ECMAScript Number::toString layout for digits · 10^exp.
export function formatJs(digits, exp, negative = false) {
  if (digits === 0n) return "0";
  const s = digits.toString();
  const k = s.length;
  const n = exp + k;
  let body;
  if (k <= n && n <= 21) body = s + "0".repeat(n - k);
  else if (0 < n && n <= 21) body = `${s.slice(0, n)}.${s.slice(n)}`;
  else if (-6 < n && n <= 0) body = `0.${"0".repeat(-n)}${s}`;
  else {
    const e = n - 1;
    body = `${s[0]}${k > 1 ? `.${s.slice(1)}` : ""}e${e >= 0 ? "+" : "-"}${Math.abs(e)}`;
  }
  return negative ? `-${body}` : body;
}

// --- exact rational companions (for explaining what the registers mean) ----

// v · 10^e as num/den, exactly.
function scaled(c, q, e) {
  let num = c;
  let den = 1n;
  if (q >= 0) num <<= BigInt(q); else den <<= BigInt(-q);
  if (e >= 0) num *= pow10(e); else den *= pow10(-e);
  return { num, den };
}

// Exact m, n, H (half-gap) and L (lower half-gap) in units of 10^(k+1).
export function exactCell(c, q, k, lopsided = false) {
  const e = -k - 1;
  const s = scaled(c, q, e);
  const m = s.num / s.den;
  const n = { num: s.num - m * s.den, den: s.den };
  const H = scaled(1n, q - 1, e);
  const L = lopsided ? scaled(1n, q - 2, e) : H;
  return { m, n, H, L };
}

// Decimal expansion of num/den (0 <= num/den < 10^something), truncated.
export function fracString(num, den, places = 16) {
  const neg = num < 0n;
  const a = neg ? -num : num;
  const int = a / den;
  const scaledFrac = ((a - int * den) * pow10(places)) / den;
  return `${neg ? "−" : ""}${int}.${scaledFrac.toString().padStart(places, "0")}`;
}

// num/den as a JS number (for drawing only; never shown as text).
export function ratioNumber(num, den) {
  const shift = Math.max(0, bitLength(den) - 60);
  return Number(num >> BigInt(shift)) / Number(den >> BigInt(shift));
}

export function wordFraction(word, places = 16) { return fracString(word, 1n << 64n, places); }

// round(10n) with ties to even, exactly.
export function exactNearestDigit(n) {
  const t = n.num * 10n;
  const fl = t / n.den;
  const rem2 = 2n * (t - fl * n.den);
  if (rem2 < n.den) return fl;
  if (rem2 > n.den) return fl + 1n;
  return fl % 2n === 0n ? fl : fl + 1n;
}

// The README's corrected Algorithm 1 for a power of two, in exact rationals:
// lower half-gap L = 2^(q-2)·10^(-k-1), upper half-gap H = 2^(q-1)·10^(-k-1).
export function exactIrregular(v) {
  const d = decompose(Math.abs(v));
  const k = floorShift(d.q * 315653 - 131072, 20);
  const { m, n, H, L } = exactCell(d.c, d.q, k, true);
  const ten = n.num * 10n;
  const floor10 = ten / n.den;
  const nearest = exactNearestDigit(n);
  // δ = frac(10n) > 10·L  <=>  the tick floor(10n)/10 lies below n − L
  const deltaNum = ten - floor10 * n.den; // δ = deltaNum / n.den
  const tenL = { num: L.num * 10n, den: L.den };
  const belowLower = deltaNum * tenL.den > tenL.num * n.den;
  let one = belowLower ? floor10 + 1n : nearest;
  const down = L.num * n.den >= n.num * L.den; // L >= n (c = 2^52 is even: closed)
  const oneMinusN = { num: n.den - n.num, den: n.den };
  const up = H.num * oneMinusN.den >= oneMinusN.num * H.den; // H >= 1 − n
  if (down) one = 0n;
  if (up) one = 10n;
  return { ...d, k, m, n, H, L, floor10, nearest, belowLower, down, up, one, coefficient: 10n * m + one };
}

// Statistics over all 2046 lopsided powers of two.
export function powerOfTwoCensus() {
  let symmetricWrong = 0;
  let symmetricBadReadBack = 0;
  let kDiffers = 0;
  let bumps = 0;
  let carries = 0;
  let publishedWrong = 0;
  for (let exp = 1; exp <= 2046; exp++) {
    const v = fromBits(BigInt(exp) << 52n);
    const good = xjb64(v);
    const sym = symmetricResult(v);
    if (sym.digits !== good.digits || sym.exp !== good.exp) {
      symmetricWrong++;
      if (Number(formatJs(sym.digits, sym.exp)) !== v) symmetricBadReadBack++;
    }
    const irr = irregularBranch(v);
    if (irr.k !== traceRegular(v).k) kDiffers++;
    if (irr.bumped && !irr.upDown) bumps++;
    if (irr.up) carries++;
    // The paper's published Algorithm 1 has no carry test for powers of two.
    const ex = exactIrregular(v);
    const published = ex.down ? 10n * ex.m : 10n * ex.m + (ex.belowLower ? ex.floor10 + 1n : ex.nearest);
    if (published !== ex.coefficient) publishedWrong++;
  }
  return { total: 2046, symmetricWrong, symmetricBadReadBack, kDiffers, bumps, carries, publishedWrong };
}

// --- input parsing: numbers, 0x-bit patterns, + - * / ** ^ and parentheses ---
export function parseInput(text) {
  const src = String(text).trim();
  if (/^0x[0-9a-f]{1,16}$/i.test(src)) return fromBits(BigInt(src));
  const tokens = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|\*\*|pi|π|[-+*/^()]|\S/gi) || [];
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const fail = () => { throw new SyntaxError("Could not read that number"); };
  function primary() {
    const t = take();
    if (t === undefined) fail();
    if (t === "(") { const x = sum(); if (take() !== ")") fail(); return x; }
    if (t === "-") return -power();
    if (t === "+") return power();
    if (/^(?:pi|π)$/i.test(t)) return Math.PI;
    if (!/^[\d.]/.test(t)) fail();
    return Number(t);
  }
  function power() {
    const base = primary();
    if (peek() === "**" || peek() === "^") { take(); return base ** power(); }
    return base;
  }
  function product() {
    let x = power();
    while (peek() === "*" || peek() === "/") x = take() === "*" ? x * power() : x / power();
    return x;
  }
  function sum() {
    let x = product();
    while (peek() === "+" || peek() === "-") x = take() === "+" ? x + product() : x - product();
    return x;
  }
  const value = sum();
  if (i !== tokens.length || Number.isNaN(value)) fail();
  return value;
}
