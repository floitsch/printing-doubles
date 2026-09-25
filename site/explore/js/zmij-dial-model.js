// Copyright (C) 2026 Toit contributors.
//
// Pure model for the Żmij "dial" explanation page: a bit-exact BigInt port of
// the binary64 shortest path of Żmij's to_decimal (zmij.cc, tag v1.2, commit
// d1682cb), plus exact rational values for everything the page draws.
// No DOM access: importable by node tests.

import { bitsOf, fromBits } from "../../js/float.js";

export const M64 = (1n << 64n) - 1n;
export const TWO64 = 1n << 64n;
const EXTRA_SHIFT = 9n; // exp_shift_table::extra_shift
const BIASED_HALF = (1n << 63n) + 6n; // data::biased_half

// --- powers of ten --------------------------------------------------------

const POW10 = [1n];
export function pow10(n) {
  while (POW10.length <= n) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[n];
}

const P10_CACHE = new Map();
// 128-bit significand of 10^q, rounded down, top bit set (zmij's pow10 table).
export function pow10Significand(q) {
  if (P10_CACHE.has(q)) return P10_CACHE.get(q);
  let num = q >= 0 ? pow10(q) : 1n;
  let den = q >= 0 ? 1n : pow10(-q);
  // Normalize num/den into [2^127, 2^128).
  const bits = num.toString(2).length - den.toString(2).length;
  let s = 127 - bits;
  let n = s >= 0 ? num << BigInt(s) : num;
  let d = s >= 0 ? den : den << BigInt(-s);
  while (n / d >= 1n << 128n) { d <<= 1n; s--; }
  while (n / d < 1n << 127n) { n <<= 1n; s++; }
  const sig = n / d;
  const entry = { sig, hi: sig >> 64n, lo: sig & M64, exactInTable: n % d === 0n };
  P10_CACHE.set(q, entry);
  return entry;
}

// compute_dec_exp: floor(e·log10 2), or floor(log10(3/4·2^e)) when irregular.
export function computeDecExp(binExp, regular = true) {
  return Math.floor((binExp * 315653 - (regular ? 0 : 131072)) / 1048576);
}

// compute_exp_shift(bin_exp, dec_exp + 1) + extra_shift
export function computeShift(binExp, decExp) {
  return binExp + Math.floor((-(decExp + 1) * 217707) / 65536) + 1 + Number(EXTRA_SHIFT);
}

// --- decoding ---------------------------------------------------------------

export function decompose(x) {
  if (typeof x !== "number" || !Number.isFinite(x) || x === 0) {
    throw new RangeError("Expected a finite, nonzero double");
  }
  const bits = bitsOf(Math.abs(x));
  const rawExp = Number(bits >> 52n);
  const fraction = bits & ((1n << 52n) - 1n);
  const subnormal = rawExp === 0;
  // zmij::write: subnormals go through the regular path with raw_exp = 1;
  // normals are regular unless the stored fraction is zero (a power of two;
  // this includes the smallest normal, which the C++ treats as irregular).
  return {
    bits,
    negative: x < 0,
    rawExp,
    fraction,
    subnormal,
    m: subnormal ? fraction : fraction | (1n << 52n),
    e: (subnormal ? 1 : rawExp) - 1075,
    regular: subnormal || fraction !== 0n,
  };
}

// --- exact rationals ----------------------------------------------------------

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }
export function rat(num, den = 1n) {
  if (den < 0n) { num = -num; den = -den; }
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}
function scaled(m, e, K) {
  // m · 2^e · 10^K as a rational
  let num = m, den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  if (K >= 0) num *= pow10(K); else den *= pow10(-K);
  return rat(num, den);
}
export function ratToNumber(r) {
  // Adequate for values in about [1e-300, 1e300]; used only for drawing.
  const shift = 80n;
  return Number((r.num << shift) / r.den) / 2 ** 80;
}
// Decimal digits of a rational in [0, ∞): integer part, then `places` digits,
// truncated. Returns { text, exact }.
export function ratToDecimal(r, places) {
  const ip = r.num / r.den;
  let rem = r.num % r.den;
  let s = "";
  for (let i = 0; i < places && rem !== 0n; i++) {
    rem *= 10n;
    s += (rem / r.den).toString();
    rem %= r.den;
  }
  return { text: s ? `${ip}.${s}` : `${ip}`, exact: rem === 0n };
}

// --- Żmij's to_decimal (regular and irregular binary64 paths) -----------------

export function zmij(x, { pretendOdd = false, exact = true } = {}) {
  const d = decompose(x);
  const { m, e, regular } = d;
  const k = computeDecExp(e, regular);
  const K = -k - 1; // multiply by 10^K = 10^(-k-1)
  const shift = computeShift(e, k);
  const P = pow10Significand(K);
  const y = m << BigInt(shift);
  // umul192_hi128: top 128 bits of the 192-bit product P·y.
  const p = P.hi * y + ((P.lo * y) >> 64n);
  const integral0 = p >> (64n + EXTRA_SHIFT);
  const F = (p >> EXTRA_SHIFT) & M64;
  const tail9 = p & ((1n << EXTRA_SHIFT) - 1n);
  const rawEven = (m & 1n) === 0n;
  const out = { x, ...d, k, K, shift, P, y, p, integral0, F, tail9, rawEven };

  if (!regular) {
    const h = P.hi >> (EXTRA_SHIFT + 1n - BigInt(shift));
    const roundUp = h > M64 - F;
    const roundDown = h >> 1n > F;
    const nearest = Number((F * 10n + (1n << 63n) - 1n) >> 64n);
    const lo = Number((((F - (h >> 1n)) & M64) * 10n + M64) >> 64n);
    const digit = Math.max(nearest, lo);
    Object.assign(out, {
      even: false, evenAdd: 0n, h, sum: F + h, roundUp, roundDown,
      digitRaw: nearest, lo, clamped: lo > nearest, tieFix: false, digit,
    });
  } else {
    const evenAdd = rawEven && !pretendOdd ? 1n : 0n;
    const h = (P.hi >> (EXTRA_SHIFT + 1n - BigInt(shift))) + evenAdd;
    const sum = F + h;
    const roundUp = sum > M64; // carry out of the 64-bit add
    const roundDown = h > F;
    const digitRaw = Number((F * 10n + BIASED_HALF) >> 64n);
    const tieFix = F === 1n << 62n;
    Object.assign(out, {
      even: evenAdd === 1n, evenAdd, h, sum, roundUp, roundDown,
      digitRaw, lo: null, clamped: false, tieFix, digit: tieFix ? 2 : digitRaw,
    });
  }
  out.sig = out.integral0 + (out.roundUp ? 1n : 0n);
  out.hasLastDigit = !(out.roundUp || out.roundDown);
  out.decision = out.roundUp ? "up" : out.roundDown ? "down" : "digit";
  if (!out.hasLastDigit) out.clamped = false;

  // Resulting decimal: sig·10^(k+1), or (sig·10 + digit)·10^k.
  let coef = out.hasLastDigit ? out.sig * 10n + BigInt(out.digit) : out.sig;
  let exp = out.hasLastDigit ? k : k + 1;
  const full = { coef, exp };
  let stripped = 0;
  while (coef !== 0n && coef % 10n === 0n) { coef /= 10n; exp++; stripped++; }
  out.full = full;
  out.result = { coef, exp, stripped };
  out.digits = coef.toString();
  out.leadExp = exp + out.digits.length - 1;
  out.text = (d.negative ? "-" : "") + zmijFormat(out.digits, out.leadExp);

  if (!exact) return out;
  // Exact reals behind the picture.
  const c = scaled(m, e, K);
  const I = c.num / c.den;
  out.exact = {
    c,
    I,
    frac: rat(c.num - I * c.den, c.den),
    h: scaled(m === 0n ? 0n : 1n, e - 1, K), // half an ulp, in units of 10^(k+1)
    u: scaled(1n, e, K), // one ulp
  };
  out.exact.lowReach = regular ? out.exact.h : rat(out.exact.h.num, out.exact.h.den * 2n);
  return out;
}

// Żmij's output layout: fixed notation when the leading digit's exponent is in
// [-4, 15], otherwise d.ddde±XX with at least two exponent digits.
export function zmijFormat(digits, leadExp) {
  const n = digits.length;
  if (leadExp >= -4 && leadExp <= 15) {
    if (leadExp < 0) return `0.${"0".repeat(-leadExp - 1)}${digits}`;
    if (n <= leadExp + 1) return digits + "0".repeat(leadExp + 1 - n);
    return `${digits.slice(0, leadExp + 1)}.${digits.slice(leadExp + 1)}`;
  }
  const a = Math.abs(leadExp);
  return `${digits[0]}${n > 1 ? `.${digits.slice(1)}` : ""}e${leadExp < 0 ? "-" : "+"}${a < 10 ? "0" : ""}${a}`;
}

// Shortest digits and leading exponent according to JavaScript (the reference).
export function jsShortest(x) {
  const [mant, ex] = Math.abs(x).toExponential().split("e");
  return { digits: mant.replace(".", ""), leadExp: Number(ex) };
}

// Lightweight classification for the decision map (machine values as fractions of a turn).
export function classify(x) {
  const z = zmij(x, { exact: false });
  return {
    decision: z.decision,
    regular: z.regular,
    e: z.e,
    Fn: Number(z.F) / 2 ** 64,
    hn: Number(z.h) / 2 ** 64,
    digit: z.digit,
    ndigits: z.digits.length,
  };
}

// Half-ulp for a given binary exponent (regular path), exact and machine.
export function halfUlpForExponent(e) {
  const k = computeDecExp(e, true);
  const K = -k - 1;
  const shift = computeShift(e, k);
  const P = pow10Significand(K);
  const machine = P.hi >> (EXTRA_SHIFT + 1n - BigInt(shift));
  const exact = scaled(1n, e - 1, K);
  return { e, k, K, shift, machine, exact, hn: ratToNumber(exact) };
}

// --- input parsing ----------------------------------------------------------

// Accepts a decimal literal, "a/b", "a+b", "a*b", "2^n" (evaluated in double
// arithmetic, like JavaScript would), and "0x…" raw bit patterns (16 hex digits).
export function parseInput(text) {
  const s = String(text).trim().replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/\*\*/g, "^");
  if (!s) return null;
  const hex = s.match(/^0x([0-9a-f]{1,16})$/i);
  if (hex) return fromBits(BigInt(`0x${hex[1]}`));
  const num = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?";
  const atom = (t) => {
    const pw = t.match(new RegExp(`^(${num})\\^(${num})$`, "i"));
    if (pw) return Number(pw[1]) ** Number(pw[2]);
    if (new RegExp(`^${num}$`, "i").test(t)) return Number(t);
    return NaN;
  };
  const bin = s.match(new RegExp(`^(${num}(?:\\^${num})?)([/+*])(${num}(?:\\^${num})?)$`, "i"));
  if (bin) {
    const a = atom(bin[1]), b = atom(bin[3]);
    const v = bin[2] === "/" ? a / b : bin[2] === "+" ? a + b : a * b;
    return Number.isNaN(v) ? null : v;
  }
  const v = atom(s);
  return Number.isNaN(v) ? null : v;
}

export function hex64(v, { groups = true } = {}) {
  const s = v.toString(16).padStart(16, "0");
  const body = s.length > 16 ? `${s.slice(0, s.length - 16)}_${s.slice(-16)}` : s;
  return groups ? `0x${body.replace(/([0-9a-f]{4})(?=[0-9a-f])/g, "$1_").replace(/__/g, "_")}` : `0x${body}`;
}

// Neighbouring doubles (positive only; the page works with |x|).
export function neighbour(x, dir) {
  const b = bitsOf(Math.abs(x)) + BigInt(dir);
  if (b <= 0n || b >= 0x7ff0000000000000n) return null;
  return fromBits(b);
}
