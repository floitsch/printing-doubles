// Copyright (C) 2026 Toit contributors.
//
// Pure BigInt model of Żmij's shortest double path, following the pinned
// source (https://github.com/vitaut/zmij, tag v1.2, commit d1682cb):
// `to_decimal` (zmij.cc ~l.1236), `to_digits` / `to_bcd8` (portable SWAR
// branch) and `write` (~l.1689, portable branch, exponent-string table).
// Every intermediate register is returned so the page can show it. No DOM.

export const M64 = (1n << 64n) - 1n;
export const EXTRA_SHIFT = 9; // exp_shift_table::extra_shift
export const BIASED_HALF = (1n << 63n) + 6n; // data::biased_half
export const TIE_FRACTION = 1n << 62n; // 0.25 of a unit: 10F = 2.5
export const THRESHOLD = 10n ** 15n; // data::threshold
export const BUFFER_SIZE = 34; // zmij::double_buffer_size

const view = new DataView(new ArrayBuffer(8));
export function bitsOf(v) { view.setFloat64(0, v); return view.getBigUint64(0); }
export function fromBits(b) { view.setBigUint64(0, BigInt.asUintN(64, b)); return view.getFloat64(0); }

const P10 = [1n];
export function pow10(n) { while (P10.length <= n) P10.push(P10.at(-1) * 10n); return P10[n]; }
const bitLength = (x) => (x === 0n ? 0 : x.toString(2).length);

// ---------------------------------------------------------------- input ---

// Tiny expression parser so presets like "0.1+0.2", "2/3" or "2^64" are
// evaluated with real double arithmetic. Literals go through Number(), which
// is correctly rounded. Supports + - * / with the usual precedence, unary
// minus, parentheses and 2^n / 2**n for integer n (exact powers of two).
export function parseInput(text) {
  const src = String(text).trim();
  if (!src) throw new Error("Type a number");
  let i = 0;
  const peek = () => src[i];
  const skip = () => { while (src[i] === " ") i++; };
  function number() {
    skip();
    const m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|^(?:Infinity|NaN)/i.exec(src.slice(i));
    if (!m) throw new Error(`Cannot read “${src.slice(i) || src}”`);
    i += m[0].length;
    return Number(m[0]);
  }
  function atom() {
    skip();
    if (peek() === "(") { i++; const v = sum(); skip(); if (peek() !== ")") throw new Error("Missing )"); i++; return v; }
    if (peek() === "-") { i++; return -power(); }
    if (peek() === "+") { i++; return power(); }
    return number();
  }
  function power() {
    const base = atom();
    skip();
    let op = null;
    if (src.startsWith("**", i)) op = 2; else if (peek() === "^") op = 1;
    if (!op) return base;
    i += op;
    const exponent = atom();
    if (base !== 2 || !Number.isInteger(exponent)) throw new Error("Only 2^n with integer n is supported");
    return twoTo(exponent);
  }
  function product() {
    let v = power();
    for (;;) {
      skip();
      if (peek() === "*" && src[i + 1] !== "*") { i++; v *= power(); } else if (peek() === "/") { i++; v /= power(); } else return v;
    }
  }
  function sum() {
    let v = product();
    for (;;) {
      skip();
      if (peek() === "+") { i++; v += product(); } else if (peek() === "-") { i++; v -= product(); } else return v;
    }
  }
  const value = sum();
  skip();
  if (i !== src.length) throw new Error(`Unexpected “${src.slice(i)}”`);
  return value;
}

function twoTo(n) {
  if (n > 1023) return Infinity;
  if (n < -1074) return 0;
  if (n >= -1022) return fromBits(BigInt(n + 1023) << 52n);
  return fromBits(1n << BigInt(n + 1074));
}

// ------------------------------------------------------------- helpers ---

// compute_dec_exp: floor(e·log10 2) via (e*315653) >> 20; the irregular
// variant subtracts 131072 (= 2^17, i.e. log10(3/4) ≈ −0.125 scaled by 2^20).
export function computeDecExp(binExp, regular = true) {
  return Math.floor((binExp * 315653 - (regular ? 0 : 131072)) / 2 ** 20);
}
// compute_exp_shift: bin_exp + floor(log2 10^(-dec_exp)) + 1, the log via
// (x*217707) >> 16.
export function computeExpShift(binExp, decExp) {
  return binExp + Math.floor((-decExp * 217707) / 65536) + 1;
}

// floor(log2 10^q), exact.
export function floorLog2Pow10(q) {
  if (q >= 0) return bitLength(pow10(q)) - 1;
  const p = pow10(-q);
  const b = bitLength(p);
  return (p & (p - 1n)) === 0n ? -(b - 1) : -b;
}

const P10_CACHE = new Map();
// The table entry for 10^q: the 128-bit significand floor(10^q · 2^(127−E)),
// E = floor(log2 10^q), so the top bit is set. `exact` tells whether nothing
// was dropped (true for 0 ≤ q ≤ 55).
export function pow10Entry(q) {
  if (P10_CACHE.has(q)) return P10_CACHE.get(q);
  const E = floorLog2Pow10(q);
  const s = 127 - E;
  let num = q >= 0 ? pow10(q) : 1n;
  let den = q >= 0 ? 1n : pow10(-q);
  if (s >= 0) num <<= BigInt(s); else den <<= BigInt(-s);
  const sig = num / den;
  // rem/den: the part of the last bit that was dropped (rounded down).
  const entry = { q, E, sig, hi: sig >> 64n, lo: sig & M64, exact: sig * den === num, rem: num - sig * den, den };
  P10_CACHE.set(q, entry);
  return entry;
}

function clz64(x) { return 64 - bitLength(x & M64); }
function bswap64(x) {
  let r = 0n;
  for (let i = 0; i < 8; i++) { r = (r << 8n) | (x & 0xffn); x >>= 8n; }
  return r;
}

// ----------------------------------------------------------- decoding ---

export function decode(x) {
  const bits = bitsOf(x);
  const negative = (bits >> 63n) === 1n;
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const special = rawExp === 0x7ff ? (fraction === 0n ? "infinity" : "nan") : rawExp === 0 && fraction === 0n ? "zero" : null;
  const subnormal = rawExp === 0 && !special;
  // write(): subnormals enter to_decimal with raw_exp 1 and no implicit bit.
  const coreRawExp = subnormal ? 1 : rawExp;
  const m = subnormal ? fraction : fraction | (1n << 52n);
  // Regular unless the significand is exactly the implicit bit (a power of two).
  const regular = subnormal ? true : fraction !== 0n;
  return { x, bits, negative, rawExp, fraction, special, subnormal, coreRawExp, m, e: coreRawExp - 1075, regular };
}

// ---------------------------------------------------------- to_decimal ---

export function toDecimal(m, rawExp, regular) {
  const e = rawExp - 1075;
  const k = computeDecExp(e, regular);
  const q = -k - 1; // the power of ten the value is scaled by
  const shiftBase = computeExpShift(e, k + 1);
  const shift = shiftBase + EXTRA_SHIFT;
  const p10 = pow10Entry(q);
  const even = regular ? 1n - (m & 1n) : 0n;
  const mShifted = m << BigInt(shift);
  // umul192_hi128(hi, lo, y) = hi*y + ((lo*y) >> 64) = floor(sig*y / 2^64).
  const product = p10.sig * mShifted; // full 192-bit product
  const top128 = product >> 64n;
  const discarded = product & M64;
  const integralRaw = top128 >> BigInt(64 + EXTRA_SHIFT);
  const fractional = (top128 >> BigInt(EXTRA_SHIFT)) & M64;
  const tail = top128 & ((1n << BigInt(EXTRA_SHIFT)) - 1n);
  const hShift = EXTRA_SHIFT + 1 - shift; // 10 − shift
  const halfUlpBase = p10.hi >> BigInt(hShift);
  const halfUlp = halfUlpBase + even;
  const sum = fractional + halfUlp;
  const roundUp = sum > M64; // carry out of the 64-bit add
  const downBound = regular ? halfUlp : halfUlp >> 1n;
  const roundDown = downBound > fractional;
  const integral = integralRaw + (roundUp ? 1n : 0n);
  let digit, digitProduct, tieFix = false, digitLow = null, digitNearest = null;
  if (regular) {
    digitProduct = fractional * 10n + BIASED_HALF;
    digit = Number(digitProduct >> 64n);
    if (fractional === TIE_FRACTION) { digit = 2; tieFix = true; }
  } else {
    digitProduct = fractional * 10n + (1n << 63n) - 1n;
    digitNearest = Number(digitProduct >> 64n);
    const low = (fractional - (halfUlp >> 1n)) & M64;
    digitLow = Number((low * 10n + M64) >> 64n);
    digit = Math.max(digitNearest, digitLow);
  }
  const hasLastDigit = !roundUp && !roundDown;
  return {
    m, e, rawExp, regular, k, q, shiftBase, shift, p10, even, mShifted, product, top128, discarded,
    integralRaw, fractional, tail, hShift, halfUlpBase, halfUlp, sum, roundUp, roundDown, integral,
    digitProduct, digit, digitNearest, digitLow, tieFix, hasLastDigit,
  };
}

// ------------------------------------------------------------- digits ---

// to_bcd8, portable SWAR branch (Xiang JunBo). Returns every register.
export const DIV10K_SIG = (1n << 40n) / 10000n + 1n; // 109951163
export const NEG10K = (1n << 32n) - 10000n;
export const DIV100_SIG = (1n << 19n) / 100n + 1n; // 5243
export const NEG100 = (1n << 16n) - 100n;
export const DIV10_SIG = (1n << 10n) / 10n + 1n; // 103
export const NEG10 = (1n << 8n) - 10n;
export const MASK100 = 0x7f0000007fn;
export const MASK10 = 0xf000f000f000fn;
export const ZEROS = 0x3030303030303030n;

export function toBcd8(value) {
  const x = BigInt(value);
  const q10k = (x * DIV10K_SIG) >> 40n;
  const abcdEfgh = (x + NEG10K * q10k) & M64;
  const q100 = ((abcdEfgh * DIV100_SIG) >> 19n) & MASK100;
  const abCdEfGh = (abcdEfgh + NEG100 * q100) & M64;
  const q10 = ((abCdEfGh * DIV10_SIG) >> 10n) & MASK10;
  const digits = (abCdEfGh + NEG10 * q10) & M64; // printed MSB-first: reading order
  const bcd = bswap64(digits); // memory order on little-endian
  const clz = clz64((bcd << 1n) | 1n);
  const len = Math.floor((70 - clz) / 8); // count_trailing_nonzeros
  return { x, q10k, abcdEfgh, q100, abCdEfGh, q10, digits, bcd, clz, len };
}

export function lanes(reg, width) {
  const out = [];
  const n = 64 / width;
  const mask = (1n << BigInt(width)) - 1n;
  for (let i = n - 1; i >= 0; i--) out.push((reg >> BigInt(i * width)) & mask);
  return out; // most significant lane first
}

export function toDigits(sig) {
  const hi = sig / 100000000n;
  const lo = sig % 100000000n;
  const hiBcd = toBcd8(hi);
  const loBcd = toBcd8(lo);
  const hiText = digitsText(hiBcd.digits);
  const loText = lo === 0n ? "00000000" : digitsText(loBcd.digits);
  const numDigits = lo === 0n ? hiBcd.len : 8 + loBcd.len;
  return { sig, hi, lo, hiBcd, loBcd, loSkipped: lo === 0n, text: hiText + loText, numDigits };
}
function digitsText(reg) { return lanes(reg, 8).map((b) => String.fromCharCode(Number(b) + 48)).join(""); }

// -------------------------------------------------------------- write ---

// Exponent-string table entry: "e±dd" or "e±ddd" packed little-endian into
// 8 bytes with the length in byte 6.
export function expEntryBytes(decExp) {
  const a = Math.abs(decExp);
  const bytes = [101, decExp >= 0 ? 43 : 45];
  if (a >= 100) bytes.push(48 + Math.floor(a / 100));
  const bc = a % 100;
  bytes.push(48 + Math.floor(bc / 10), 48 + (bc % 10));
  while (bytes.length < 6) bytes.push(0);
  bytes.push(a >= 100 ? 5 : 4, 0);
  return bytes;
}

export function fixedLayout(decExp) {
  const startPos = decExp < 0 ? 1 - decExp : 0;
  const pointPos = decExp >= 0 ? 1 + decExp : 1;
  const shiftPos = pointPos + (decExp >= 0 ? 1 : 0);
  const endPos = [];
  for (let n = 1; n <= 17; n++) endPos.push(decExp >= 0 ? (n > decExp + 1 ? n + 1 : decExp + 1) : n);
  return { startPos, pointPos, shiftPos, endPos };
}

// A byte buffer that records a snapshot after every operation.
class Tape {
  constructor() { this.cells = new Array(BUFFER_SIZE).fill(null); this.ops = []; this.maxTouched = 0; }
  put(i, byte) { this.cells[i] = byte; this.maxTouched = Math.max(this.maxTouched, i + 1); }
  snap(code, note, info = {}) { this.ops.push({ code, note, cells: this.cells.slice(), ...info }); }
}

export function write(x) {
  const d = decode(x);
  if (d.special) return { decoded: d, special: d.special };
  let dec = toDecimal(d.m, d.coreRawExp, d.regular);
  const core = dec;
  let sig = dec.integral, exp = dec.k, lastDigit = dec.digit, hasLast = dec.hasLastDigit;
  let subnormalPad = null;
  if (d.subnormal) {
    let nd = 0;
    if (sig !== 0n) nd = sig.toString().length;
    const numZeros = 17 - 3 - nd;
    if (numZeros >= 0) {
      const decSig = sig * 10n + (hasLast ? BigInt(lastDigit) : 0n);
      subnormalPad = { before: sig, numDigits: nd, numZeros, decSig };
      sig = decSig * pow10(numZeros);
      exp = exp - numZeros - 1;
      lastDigit = 0; hasLast = false;
    }
  }
  const hasExtra = sig >= THRESHOLD;
  const decExp = exp + 17 - 2 + (hasExtra ? 1 : 0); // leading digit's exponent
  const dig = toDigits(sig);
  const digitBytes = [...dig.text].map((c) => c.charCodeAt(0));
  const lastChar = 48 + (hasLast ? lastDigit : 0);
  const tape = new Tape();
  const sign = d.negative ? 1 : 0;
  tape.put(0, 45);
  tape.snap("*buffer = '-'; buffer += negative;", d.negative ? "Write the sign and step past it." : "The sign is written unconditionally; the pointer only moves for negative numbers.");
  const start = sign;
  const fixed = decExp >= -4 && decExp <= 15;
  let end;
  if (fixed) {
    const L = fixedLayout(decExp);
    for (let i = 0; i < 8; i++) tape.put(start + i, 48);
    tape.snap('memcpy(start, "00000000", 8);', "Pre-store eight '0' bytes (they become the 0.000… of small numbers).", { mark: [start, start + 8] });
    const buf = start + L.startPos;
    for (let i = 0; i < 16; i++) tape.put(buf + i, digitBytes[i]);
    tape.snap(`memcpy(buffer + ${L.startPos}, digits, 16);`, "Store all 16 digit bytes in one go, after the layout's leading zeros.", { mark: [buf, buf + 16] });
    if (!hasExtra) {
      const moved = tape.cells.slice(buf + 1, buf + 17);
      for (let i = 0; i < 16; i++) tape.put(buf + i, moved[i]);
      tape.snap("memmove(buffer, buffer + 1, 16);", "Only 15 digits: slide left over the leading '0' of the 16-byte block.", { mark: [buf, buf + 16] });
    }
    tape.put(buf + 16 + (hasExtra ? 1 : 0) - 1, lastChar);
    tape.snap(`buffer[${15 + (hasExtra ? 1 : 0)}] = '${String.fromCharCode(lastChar)}';`, hasLast ? "Place the extra last digit." : "The last-digit slot is written anyway (with '0'); the end pointer will cut it off.", { mark: [buf + 15 + (hasExtra ? 1 : 0), buf + 16 + (hasExtra ? 1 : 0)] });
    const block = tape.cells.slice(start + L.pointPos, start + L.pointPos + 16);
    for (let i = 0; i < 16; i++) tape.put(start + L.shiftPos + i, block[i]);
    tape.snap(`memmove(start + ${L.shiftPos}, start + ${L.pointPos}, 16);`, L.shiftPos === L.pointPos ? "Leading exponent < 0: the point goes after '0', nothing to shift (a no-op move)." : "Shift the digits after the point one byte right to open a gap.", { mark: [start + L.shiftPos, start + L.shiftPos + 16] });
    tape.put(start + L.pointPos, 46);
    const n = hasLast ? 16 + (hasExtra ? 1 : 0) : dig.numDigits - 1 + (hasExtra ? 1 : 0);
    end = buf + L.endPos[n - 1];
    tape.snap(`start[${L.pointPos}] = '.';`, "Drop the decimal point into the gap.", { mark: [start + L.pointPos, start + L.pointPos + 1] });
    tape.snap(`return buffer + end_pos[${n - 1}];`, `The layout table says where ${n} significant digit${n > 1 ? "s end" : " ends"} for this exponent: no loop, no trimming pass.`, { end });
    return finish({ d, core, dec, sig, exp, lastDigit, hasLast, hasExtra, decExp, dig, fixed, layout: L, tape, end, start, subnormalPad, sigDigits: n });
  }
  let buf = start + (hasExtra ? 1 : 0);
  for (let i = 0; i < 16; i++) tape.put(buf + i, digitBytes[i]);
  tape.snap(`memcpy(start + ${hasExtra ? 1 : 0}, digits, 16);`, hasExtra ? "16 digits: store them one byte to the right, leaving room for the point." : "15 digits: the block's leading '0' lands in byte 0 and will be overwritten.", { mark: [buf, buf + 16] });
  tape.put(buf + 16, 48 + lastDigit);
  tape.snap(`buffer[16] = '0' + last_digit;`, hasLast ? "Append the extra digit." : "Written unconditionally; ignored unless there is a last digit.", { mark: [buf + 16, buf + 17] });
  const sigDigits = hasLast ? 16 + (hasExtra ? 1 : 0) : dig.numDigits - (hasExtra ? 0 : 1);
  buf += hasLast ? 17 : dig.numDigits;
  tape.put(start, tape.cells[start + 1]);
  tape.snap("start[0] = start[1];", "Copy the leading digit one byte left …", { mark: [start, start + 1], end: buf });
  tape.put(start + 1, 46);
  tape.snap("start[1] = '.';", "… and put the point where it was.", { mark: [start + 1, start + 2], end: buf });
  if (buf - 1 === start + 1) {
    buf -= 1;
    tape.snap("buffer -= (buffer - 1 == start + 1);", "A single digit: back up over the point.", { end: buf });
  }
  const eb = expEntryBytes(decExp);
  for (let i = 0; i < 8; i++) tape.put(buf + i, eb[i]);
  const len = eb[6];
  end = buf + len;
  tape.snap(`memcpy(buffer, &exp_strings[${decExp}], 8);`, `Stamp the 8-byte table entry for ${decExp}: "${String.fromCharCode(...eb.slice(0, len))}" plus padding and its length byte (${len}).`, { mark: [buf, buf + 8], end });
  return finish({ d, core, dec, sig, exp, lastDigit, hasLast, hasExtra, decExp, dig, fixed, tape, end, start, subnormalPad, sigDigits, expBytes: eb });
}

function finish(r) {
  r.text = String.fromCharCode(...r.tape.cells.slice(0, r.end));
  r.decoded = r.d;
  return r;
}

// ------------------------------------------------ exact reference values ---

// The exact value |x|·10^p as {int, num, den} (fraction num/den).
export function exactScaled(x, p) {
  const d = decode(Math.abs(x));
  let num = d.m, den = 1n;
  if (d.e >= 0) num <<= BigInt(d.e); else den <<= BigInt(-d.e);
  if (p >= 0) num *= pow10(p); else den *= pow10(-p);
  return { int: num / den, num: num % den, den };
}

// Decimal digits of a fraction num/den in [0,1): truncated to `places`,
// with a flag telling whether anything was cut.
export function fractionDigits(num, den, places) {
  let s = "";
  let r = num;
  for (let i = 0; i < places && r !== 0n; i++) { r *= 10n; s += (r / den).toString(); r %= den; }
  return { digits: s || "0", cut: r !== 0n };
}

export function unitFraction(x64, places = 10) {
  const f = fractionDigits(x64, 1n << 64n, places);
  return `0.${f.digits}${f.cut ? "…" : ""}`;
}

// Exact half-ulp in units of 10^(k+1) (regular: 2^(e−1)·10^q).
export function exactHalfUlp(core) {
  let num = 1n, den = 1n;
  const e1 = core.e - 1;
  if (e1 >= 0) num <<= BigInt(e1); else den <<= BigInt(-e1);
  if (core.q >= 0) num *= pow10(core.q); else den *= pow10(-core.q);
  return { num, den };
}

// yy-style reading of the same product one place to the right: v·10^(−k).
export function yyReading(x, core) {
  const s = exactScaled(x, core.q + 1);
  const one = s.int % 10n;
  return { int: s.int, frac: s, one, d0: s.int - one, u0: s.int - one + 10n, d1: s.int, u1: s.int + 1n };
}

// Reference shortest digits from JavaScript (Number#toExponential).
export function jsShortest(x) {
  const [mant, e] = Math.abs(x).toExponential().split("e");
  return { digits: mant.replace(".", ""), leadExp: Number(e) };
}

// Digits and leading exponent from a Żmij write() result.
export function resultDigits(r) {
  // write() works with value = (sig·10 + last digit) · 10^exp.
  const full = r.sig * 10n + (r.hasLast ? BigInt(r.lastDigit) : 0n);
  const s = full.toString();
  return { digits: s.replace(/0+$/, "") || "0", leadExp: r.exp + s.length - 1 };
}

// Independent formatter for the string shape: shortest digits, fixed when
// the leading exponent is in [−4, 15], otherwise d.ddde±XX (at least two
// exponent digits); no ".0" on integers.
export function formatLikeZmij(x) {
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  const { digits, leadExp } = jsShortest(x);
  const sign = x < 0 ? "-" : "";
  if (leadExp >= -4 && leadExp <= 15) {
    if (leadExp < 0) return `${sign}0.${"0".repeat(-leadExp - 1)}${digits}`;
    const intPart = digits.slice(0, leadExp + 1).padEnd(leadExp + 1, "0");
    const rest = digits.slice(leadExp + 1);
    return sign + intPart + (rest ? `.${rest}` : "");
  }
  const a = Math.abs(leadExp);
  return `${sign}${digits[0]}${digits.length > 1 ? "." + digits.slice(1) : ""}e${leadExp < 0 ? "-" : "+"}${String(a).padStart(2, "0")}`;
}
