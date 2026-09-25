// Copyright (C) 2026 Toit contributors.
//
// Pure model for the "Pocket Ryū" explanation page. No DOM.
//
// ryu() is a BigInt transcription of d2d() in ulfjack/ryu d2s.c, parameterised
// by the floating-point format so that the very same steps run on binary16
// (half), bfloat16 and binary64. The optional table width B replaces d2s.c's
// 125-bit constants, which is what the "needle" experiments vary.

import { formatDecimal, parseDecimal } from "../../js/float.js";

export const FORMATS = {
  half: { id: "half", name: "binary16", P: 10, EB: 5, BIAS: 15, B: 21, exactPos: true, hexDigits: 4 },
  bfloat16: { id: "bfloat16", name: "bfloat16", P: 7, EB: 8, BIAS: 127, B: 40, hexDigits: 4 },
  double: { id: "double", name: "binary64", P: 52, EB: 11, BIAS: 1023, B: 125, hexDigits: 16 },
};

// The three logarithm helpers of d2s.c / common.h (valid far beyond our ranges).
export const pow5bits = (e) => Number((BigInt(e) * 1217359n) >> 19n) + 1;
export const log10Pow2 = (e) => Number((BigInt(e) * 78913n) >> 18n);
export const log10Pow5 = (e) => Number((BigInt(e) * 732923n) >> 20n);

const P5 = [1n];
export function pow5(n) {
  while (P5.length <= n) P5.push(P5[P5.length - 1] * 5n);
  return P5[n];
}
const P10 = [1n];
export function pow10(n) {
  while (P10.length <= n) P10.push(P10[P10.length - 1] * 10n);
  return P10[n];
}
export function p5(v) { let c = 0; while (v !== 0n && v % 5n === 0n) { v /= 5n; c++; } return c; }
export function p2(v) { let c = 0; while (v !== 0n && (v & 1n) === 0n) { v >>= 1n; c++; } return c; }

// ---------------------------------------------------------------- decoding

export function decode(fmt, bits) {
  bits = BigInt(bits);
  const fracMask = (1n << BigInt(fmt.P)) - 1n;
  const E = Number((bits >> BigInt(fmt.P)) & ((1n << BigInt(fmt.EB)) - 1n));
  const F = bits & fracMask;
  const sign = Number(bits >> BigInt(fmt.P + fmt.EB)) & 1;
  const Emax = (1 << fmt.EB) - 1;
  if (E === Emax) return { bits, sign, E, F, special: F === 0n ? "infinity" : "nan" };
  if (E === 0 && F === 0n) return { bits, sign, E, F, special: "zero" };
  const subnormal = E === 0;
  const m2 = subnormal ? F : (1n << BigInt(fmt.P)) | F;
  const e2 = (subnormal ? 1 : E) - fmt.BIAS - fmt.P - 2;
  return { bits, sign, E, F, special: null, subnormal, m2, e2 };
}

export function totalBits(fmt) { return 1 + fmt.EB + fmt.P; }
export function maxFiniteBits(fmt) { return (((1n << BigInt(fmt.EB)) - 2n) << BigInt(fmt.P)) | ((1n << BigInt(fmt.P)) - 1n); }

// Exact decimal string of m·2^e (m ≥ 0).
export function exactDecimalString(m, e) {
  if (m === 0n) return "0";
  if (e >= 0) return (m << BigInt(e)).toString();
  const n = -e;
  const digits = (m * pow5(n)).toString().padStart(n + 1, "0");
  const intPart = digits.slice(0, digits.length - n);
  const frac = digits.slice(digits.length - n).replace(/0+$/, "");
  return frac ? `${intPart}.${frac}` : intPart;
}

export function valueOf(fmt, bits) {
  const d = decode(fmt, bits);
  if (d.special === "zero") return d.sign ? -0 : 0;
  if (d.special === "infinity") return d.sign ? -Infinity : Infinity;
  if (d.special === "nan") return NaN;
  const v = Number(d.m2) * 2 ** (d.e2 + 2);
  return d.sign ? -v : v;
}

// Round an exact positive rational num/den to the nearest value of fmt (ties to even).
function roundRational(fmt, num, den) {
  if (num === 0n) return 0n;
  // Find e with 2^P ≤ num/den · 2^-e < 2^(P+1).
  let e = num.toString(2).length - den.toString(2).length - fmt.P;
  const scaled = (ex) => (ex >= 0 ? [num, den << BigInt(ex)] : [num << BigInt(-ex), den]);
  let [n, d] = scaled(e);
  while (n >= d << BigInt(fmt.P + 1)) { e++; [n, d] = scaled(e); }
  while (n < d << BigInt(fmt.P)) { e--; [n, d] = scaled(e); }
  const eMin = 1 - fmt.BIAS - fmt.P; // exponent of the subnormal unit
  if (e < eMin) { e = eMin; [n, d] = scaled(e); }
  let m = n / d;
  const r2 = 2n * (n - m * d);
  if (r2 > d || (r2 === d && (m & 1n) === 1n)) m++;
  if (m === 1n << BigInt(fmt.P + 1)) { m >>= 1n; e++; }
  if (m < 1n << BigInt(fmt.P)) return m; // subnormal (or became smallest normal below)
  const E = e + fmt.BIAS + fmt.P;
  if (E >= (1 << fmt.EB) - 1) return BigInt((1 << fmt.EB) - 1) << BigInt(fmt.P); // infinity
  return (BigInt(E) << BigInt(fmt.P)) | (m & ((1n << BigInt(fmt.P)) - 1n));
}

// Parse text into a bit pattern of fmt: a decimal (correctly rounded) or 0x… hex bits.
export function parseToBits(fmt, text) {
  const t = String(text).trim().replace(/\s+/g, "").replace(/[−–]/g, "-");
  const hex = t.match(/^0x([0-9a-f]+)$/i);
  if (hex) {
    const b = BigInt(`0x${hex[1]}`);
    if (b >= 1n << BigInt(totalBits(fmt))) return null;
    return b;
  }
  if (/^[+-]?(inf|infinity)$/i.test(t)) return (t.startsWith("-") ? 1n << BigInt(fmt.P + fmt.EB) : 0n) | (BigInt((1 << fmt.EB) - 1) << BigInt(fmt.P));
  const p = parseDecimal(t);
  if (!p) return null;
  const neg = p.coefficient < 0n || t.startsWith("-");
  const c = p.coefficient < 0n ? -p.coefficient : p.coefficient;
  let num = c, den = 1n;
  if (p.exponent >= 0) num *= pow10(p.exponent); else den = pow10(-p.exponent);
  const mag = roundRational(fmt, num, den);
  return (neg ? 1n << BigInt(fmt.P + fmt.EB) : 0n) | mag;
}

// ---------------------------------------------------------------- the algorithm

// The per-exponent part of Ryū: q, e10 and the multiplier. B = table width.
// B === Infinity means "exact": vX computed as exact floors (the pocket view).
export function scaleFor(e2, B) {
  if (e2 >= 0) {
    const q = Math.max(0, log10Pow2(e2) - 1); // == log10Pow2(e2) - (e2 > 3)
    const e10 = q;
    if (B === Infinity) {
      const M = pow5(q);
      return { case: "pos", q, e10, exact: true, f: (m) => (m << BigInt(e2 - q)) / M };
    }
    const k = B + pow5bits(q) - 1;
    const mul = (1n << BigInt(k)) / pow5(q) + 1n;
    const shift = -e2 + q + k;
    return { case: "pos", q, e10, k, mul, shift, exact: false, f: (m) => (m * mul) >> BigInt(shift) };
  }
  const q = Math.max(0, log10Pow5(-e2) - 1); // == log10Pow5(-e2) - (-e2 > 1)
  const e10 = q + e2;
  const i = -e2 - q;
  const p = pow5(i);
  if (B === Infinity) return { case: "neg", q, e10, i, exact: true, f: (m) => (m * p) >> BigInt(q) };
  const k = pow5bits(i) - B;
  const mul = k >= 0 ? p >> BigInt(k) : p << BigInt(-k);
  const shift = q - k;
  return { case: "neg", q, e10, i, k, mul, shift, exact: k <= 0, f: (m) => (m * mul) >> BigInt(shift) };
}

// Exact floors ⌊m·2^e2 / 10^e10⌋ (reference, independent of the table).
export function exactFloor(m, e2, e10) {
  let num = m, den = 1n;
  if (e10 >= 0) den = pow5(e10); else num *= pow5(-e10);
  const s = e2 - e10;
  if (s >= 0) num <<= BigInt(s); else den <<= BigInt(-s);
  return num / den;
}

// d2d() of d2s.c with a full trace. opts.B: table width (default fmt.B).
// For the pocket half view, opts.B = Infinity uses exact (untruncated) scaling.
export function ryu(fmt, bits, opts = {}) {
  const B = opts.B ?? fmt.B;
  const d = decode(fmt, bits);
  if (d.special) return { special: d.special, decoded: d };
  const { m2, e2 } = d;
  const acceptBounds = (m2 & 1n) === 0n;
  const mv = 4n * m2;
  const mmShift = d.F !== 0n || d.E <= 1 ? 1n : 0n;
  const mp = mv + 2n;
  const mm = mv - 1n - mmShift;
  // Halves ≥ 4096 have q = 0: nothing to divide by, so the pocket view multiplies by 1.
  const sc = scaleFor(e2, fmt.exactPos && e2 >= 0 && opts.B === undefined ? Infinity : B);
  const { q, e10 } = sc;
  let vr = sc.f(mv), vp = sc.f(mp), vm = sc.f(mm);
  const start = { vm, vr, vp };
  let vmTZ = false, vrTZ = false, vpExactDrop = false;
  let flagRule = "";
  if (e2 >= 0) {
    if (q <= 21) {
      if (mv % 5n === 0n) { vrTZ = p5(mv) >= q; flagRule = "mv"; }
      else if (acceptBounds) { vmTZ = p5(mm) >= q; flagRule = "mm"; }
      else { vpExactDrop = p5(mp) >= q; if (vpExactDrop) vp -= 1n; flagRule = "mp"; }
    } else flagRule = "none";
  } else if (q <= 1) {
    vrTZ = true;
    if (acceptBounds) { vmTZ = mmShift === 1n; flagRule = "q1-mm"; }
    else { vp -= 1n; vpExactDrop = true; flagRule = "q1-mp"; }
  } else if (q < 63) {
    vrTZ = p2(mv) >= q; flagRule = "p2";
  } else flagRule = "none";
  const afterFlags = { vm, vr, vp, vmTZ, vrTZ, vpExactDrop };

  const steps = [];
  let removed = 0, last = 0n;
  const general = vmTZ || vrTZ;
  while (vp / 10n > vm / 10n) {
    const dm = vm % 10n, dr = vr % 10n, dp = vp % 10n;
    vmTZ = vmTZ && dm === 0n;
    vrTZ = vrTZ && last === 0n;
    last = dr;
    vr /= 10n; vp /= 10n; vm /= 10n; removed++;
    steps.push({ loop: 1, vm, vr, vp, dm, dr, dp, last, vmTZ, vrTZ });
  }
  const loop1End = { vm, vr, vp };
  if (vmTZ) {
    while (vm % 10n === 0n) {
      const dm = vm % 10n, dr = vr % 10n, dp = vp % 10n;
      vrTZ = vrTZ && last === 0n;
      last = dr;
      vr /= 10n; vp /= 10n; vm /= 10n; removed++;
      steps.push({ loop: 2, vm, vr, vp, dm, dr, dp, last, vmTZ, vrTZ });
    }
  }
  let tie = false;
  if (vrTZ && last === 5n && vr % 2n === 0n) { last = 4n; tie = true; }
  const outside = vr === vm && (!acceptBounds || !vmTZ);
  const up = outside || last >= 5n;
  const output = vr + (up ? 1n : 0n);
  const exponent = e10 + removed;
  return {
    special: null, decoded: d, fmt, B,
    m2, e2, mv, mp, mm, mmShift, acceptBounds, scale: sc, q, e10,
    start, afterFlags, flagRule, general, steps, loop1End, removed,
    final: { vm, vr, vp, vmTZ, vrTZ, last },
    tie, outside, digitUp: last >= 5n, up, output, exponent,
    text: formatDecimal(d.sign ? -output : output, exponent),
  };
}

// Exact reference: the shortest decimal in the rounding interval, closest to the
// value, ties to even digit (brute force over decimal grids, small formats only).
export function referenceShortest(fmt, bits) {
  const d = decode(fmt, bits);
  if (d.special) return null;
  const x = { m: 4n * d.m2, e: d.e2 };
  const lowGap = d.F === 0n && d.E > 1 ? 1n : 2n;
  const lo = x.m - lowGap, hi = x.m + 2n; // in units of 2^e2
  const inc = (d.m2 & 1n) === 0n;
  // value in [10^E-1, 10^E): start at a coarse grid and refine.
  for (let E10 = 40; E10 >= -400; E10--) {
    // candidates n·10^E10 with lo·2^e2 ≤ n·10^E10 ≤ hi·2^e2
    const lower = ceilScaled(lo, d.e2, E10), upper = exactFloor(hi, d.e2, E10);
    let first = lower, lastC = upper;
    if (!inc && isExact(lo, d.e2, E10)) first++;
    if (!inc && isExact(hi, d.e2, E10)) lastC--;
    if (first < 1n) first = 1n;
    if (first > lastC) continue;
    let best = null, bestDist = null;
    for (let n = first; n <= lastC; n++) {
      const dist = absDist(n, E10, x.m, x.e);
      if (best === null || cmpFrac(dist, bestDist) < 0 || (cmpFrac(dist, bestDist) === 0 && n % 2n === 0n)) { best = n; bestDist = dist; }
    }
    let n = best, e = E10;
    while (n % 10n === 0n) { n /= 10n; e++; }
    return { digits: n, exponent: e };
  }
  return null;
}
function ceilScaled(m, e2, e10) {
  const f = exactFloor(m, e2, e10);
  return isExact(m, e2, e10) ? f : f + 1n;
}
function isExact(m, e2, e10) {
  let num = m, den = 1n;
  if (e10 >= 0) den = pow5(e10); else num *= pow5(-e10);
  const s = e2 - e10;
  if (s >= 0) num <<= BigInt(s); else den <<= BigInt(-s);
  return num % den === 0n;
}
// |n·10^e10 − m·2^e2| as a fraction [num, den]
function absDist(n, e10, m, e2) {
  const minE2 = Math.min(0, e2, e10), minE5 = Math.min(0, e10);
  const a = n * pow5(e10 - minE5) << BigInt(e10 - minE2);
  const b = m * pow5(-minE5) << BigInt(e2 - minE2);
  const diff = a > b ? a - b : b - a;
  return [diff, (pow5(-minE5)) << BigInt(-minE2)];
}
function cmpFrac(a, b) { const l = a[0] * b[1], r = b[0] * a[1]; return l < r ? -1 : l > r ? 1 : 0; }

export function normalizeDigits(n, e) {
  while (n !== 0n && n % 10n === 0n) { n /= 10n; e++; }
  return { digits: n, exponent: e };
}

// ---------------------------------------------------------------- doubles

const dv = new DataView(new ArrayBuffer(8));
export function doubleBits(x) { dv.setFloat64(0, x); return dv.getBigUint64(0); }
export function doubleFromBits(b) { dv.setBigUint64(0, BigInt(b)); return dv.getFloat64(0); }
export function doubleFromFields(E, m2) {
  const frac = E === 0 ? m2 : m2 - (1n << 52n);
  return doubleFromBits((BigInt(E) << 52n) | frac);
}

// The shortest output of the chop, given starting floors (used for needles).
export function chopOutput(r, start) {
  // Re-run steps 5–7 of ryu() with different start values but the same flags.
  let { vm, vr, vp } = start;
  let vmTZ = false, vrTZ = false;
  const { e2, q, acceptBounds, mv, mm, mp, mmShift } = r;
  if (e2 >= 0) {
    if (q <= 21) {
      if (mv % 5n === 0n) vrTZ = p5(mv) >= q;
      else if (acceptBounds) vmTZ = p5(mm) >= q;
      else if (p5(mp) >= q) vp -= 1n;
    }
  } else if (q <= 1) {
    vrTZ = true;
    if (acceptBounds) vmTZ = mmShift === 1n; else vp -= 1n;
  } else if (q < 63) vrTZ = p2(mv) >= q;
  const rows = [{ vm, vr, vp, last: null }];
  let removed = 0, last = 0n;
  while (vp / 10n > vm / 10n) {
    vmTZ = vmTZ && vm % 10n === 0n; vrTZ = vrTZ && last === 0n; last = vr % 10n;
    vr /= 10n; vp /= 10n; vm /= 10n; removed++; rows.push({ vm, vr, vp, last });
  }
  if (vmTZ) while (vm % 10n === 0n) {
    vrTZ = vrTZ && last === 0n; last = vr % 10n;
    vr /= 10n; vp /= 10n; vm /= 10n; removed++; rows.push({ vm, vr, vp, last });
  }
  if (vrTZ && last === 5n && vr % 2n === 0n) last = 4n;
  const output = vr + (((vr === vm && (!acceptBounds || !vmTZ)) || last >= 5n) ? 1n : 0n);
  return { rows, output, exponent: r.e10 + removed, text: formatDecimal(output, r.e10 + removed) };
}

// Floors of one double (by fields) with a B-bit table, next to the exact floors.
const ctxCache = new Map();
function ctx(E, B) {
  const key = `${E}/${B}`;
  let c = ctxCache.get(key);
  if (!c) {
    const e2 = (E === 0 ? 1 : E) - 1023 - 52 - 2;
    const t = scaleFor(e2, B), x = scaleFor(e2, Infinity);
    c = { e2, q: t.q, e10: t.e10, trunc: t.f, exact: x.f, tableExact: t.exact && t.case === "neg" };
    if (ctxCache.size > 20000) ctxCache.clear();
    ctxCache.set(key, c);
  }
  return c;
}
export function floorsWithWidth(E, m2, B) {
  const c = ctx(E, B);
  const mv = 4n * m2, mmShift = (m2 !== 1n << 52n || E <= 1) ? 1n : 0n;
  const ms = [mv - 1n - mmShift, mv, mv + 2n];
  const exact = ms.map(c.exact), trunc = ms.map(c.trunc);
  return { exact, trunc, wrong: [0, 1, 2].filter((j) => exact[j] !== trunc[j]) };
}

// Full comparison for one double at width B: floors, both outputs, read-back.
export function needleReport(x, B) {
  const bits = doubleBits(x);
  const good = ryu(FORMATS.double, bits);
  const bad = ryu(FORMATS.double, bits, { B });
  const exact = [good.start.vm, good.start.vr, good.start.vp];
  const trunc = [bad.start.vm, bad.start.vr, bad.start.vp];
  // exact fractional parts of the three scaled values, as decimal strings
  const ms = [good.mm, good.mv, good.mp];
  const fracs = ms.map((m) => fractionOf(m, good.e2, good.e10));
  const goodChop = chopOutput(good, good.start);
  const badChop = chopOutput(good, bad.start);
  const badValue = Number(badChop.text);
  return {
    x, B, bits, e2: good.e2, q: good.q, e10: good.e10, exact, trunc, fracs,
    wrong: [0, 1, 2].filter((j) => exact[j] !== trunc[j]),
    goodText: good.text, badText: badChop.text,
    goodChop, badChop,
    outputDiffers: goodChop.output !== badChop.output || goodChop.exponent !== badChop.exponent,
    readsBack: badValue === x,
    readsBackAs: badValue,
    scale: bad.scale,
  };
}

// Fractional part of m·2^e2/10^e10 as {num, den, text}: text shows the digits
// after the decimal point up to the first significant ones.
export function fractionOf(m, e2, e10) {
  let num = m, den = 1n;
  if (e10 >= 0) den = pow5(e10); else num *= pow5(-e10);
  const s = e2 - e10;
  if (s >= 0) num <<= BigInt(s); else den <<= BigInt(-s);
  const rem = num % den;
  return { num: rem, den, text: fracText(rem, den), below: fracText(den - rem, den) };
}
function fracText(rem, den, sig = 3) {
  if (rem === 0n) return "0";
  let s = "0.", r = rem, started = 0, count = 0;
  while (started < sig && count < 200) {
    r *= 10n; const dgt = r / den; r %= den; s += dgt.toString(); count++;
    if (started || dgt !== 0n) started++;
    if (r === 0n) break;
  }
  return r === 0n ? s : `${s}…`;
}

// Fraction {num, den} as a short scientific string, e.g. "5.6e-6".
export function fracSci(num, den) {
  if (num === 0n) return "0";
  const ln = num.toString().length - den.toString().length;
  let e = ln;
  let scaledNum = num, scaledDen = den;
  const adj = (ex) => { scaledNum = ex < 0 ? num * pow10(-ex) : num; scaledDen = ex > 0 ? den * pow10(ex) : den; };
  adj(e);
  if (scaledNum < scaledDen) { e--; adj(e); }
  const lead = (scaledNum * 100n) / scaledDen; // 3 digits
  const str = lead.toString();
  return `${str[0]}.${str.slice(1)}e${e}`;
}

// Computed-minus-exact value m·mul/2^shift − m·2^e2/10^e10 as a signed fraction.
export function constantError(m, e2, e10, mul, shift) {
  let num = m, den = 1n;
  if (e10 >= 0) den = pow5(e10); else num *= pow5(-e10);
  const s = e2 - e10;
  if (s >= 0) num <<= BigInt(s); else den <<= BigInt(-s);
  // m·mul/2^shift − num/den
  const a = m * mul * den, b = num << BigInt(shift);
  return { num: a - b, den: den << BigInt(shift) };
}

// ---------------------------------------------------------------- random test

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Uniformly random positive finite double bit pattern (every exponent equally likely).
export function randomDoubleFields(rand) {
  for (;;) {
    const E = Math.floor(rand() * 2047); // 0..2046
    const hi = BigInt(Math.floor(rand() * 2 ** 26)), lo = BigInt(Math.floor(rand() * 2 ** 26));
    const frac = (hi << 26n) | lo;
    if (E === 0 && frac === 0n) continue;
    return { E, m2: E === 0 ? frac : (1n << 52n) | frac };
  }
}

export function makeRandomTester(B, seed) {
  const rand = mulberry32(seed);
  const state = { B, seed, tested: 0, wrongFloors: 0, wrongOutputs: 0, exponents: new Set(), examples: [] };
  state.run = (n) => {
    for (let t = 0; t < n; t++) {
      const { E, m2 } = randomDoubleFields(rand);
      state.tested++;
      const f = floorsWithWidth(E, m2, B);
      if (f.wrong.length) {
        state.wrongFloors++;
        state.exponents.add(E);
        const x = doubleFromFields(E, m2);
        const rep = needleReport(x, B);
        if (rep.outputDiffers) state.wrongOutputs++;
        if (state.examples.length < 400) state.examples.push({ x, E, outputDiffers: rep.outputDiffers });
      }
    }
    return state;
  };
  return state;
}

// ---------------------------------------------------------------- adversarial hunt

// Smallest x ≥ 0 with l ≤ (a·x mod m) ≤ r, for 0 ≤ l ≤ r < m (null if none).
export function solveRange(a, m, l, r) {
  a %= m;
  if (l === 0n) return 0n;
  if (a === 0n) return null;
  let x = (l + a - 1n) / a;
  if (a * x <= r) return x;
  const y = solveRange(m % a, a, (((-r) % a) + a) % a, (((-l) % a) + a) % a);
  if (y === null) return null;
  x = (l + m * y + a - 1n) / a;
  return a * x - m * y <= r ? x : null;
}
function firstInWindow(a, M, start, L, R) {
  const c0 = (a * start) % M;
  const lo = (((L - c0) % M) + M) % M, hi = (((R - c0) % M) + M) % M;
  if (lo <= hi) return solveRange(a, M, lo, hi);
  const x1 = solveRange(a, M, lo, M - 1n), x2 = solveRange(a, M, 0n, hi);
  if (x1 === null) return x2;
  if (x2 === null) return x1;
  return x1 < x2 ? x1 : x2;
}

// Hunt one binary exponent field E (0..2046) of binary64 at table width B.
// Works on t = mX/2 (mm, mv, mp are all even except the one power-of-two mm).
// Every candidate is verified against exact floors, so reported needles are real;
// the residue window is an upper bound on the error, so nothing is missed
// unless the candidate cap is reached ("undecided").
export function huntExponent(E, B, cap = 64) {
  const e2 = (E === 0 ? 1 : E) - 1023 - 52 - 2;
  const T0 = E === 0 ? 1n : (1n << 53n) - 1n;
  const T1 = E === 0 ? (1n << 53n) - 1n : (1n << 54n) - 1n;
  const sc = scaleFor(e2, B);
  const res = { E, e2, q: sc.q, status: "clean", candidates: 0, needle: null };
  const check = (m2) => {
    if (E === 0 ? m2 < 1n || m2 >= 1n << 52n : m2 < 1n << 52n || m2 >= 1n << 53n) return false;
    const f = floorsWithWidth(E, m2, B);
    if (f.wrong.length) { res.needle = { E, m2, x: doubleFromFields(E, m2), wrong: f.wrong }; res.status = "needle"; return true; }
    return false;
  };
  // The power-of-two double (mm = 4m2 − 1 is odd) is checked directly.
  if (E > 1 && check(1n << 52n)) return res;
  let M, a, L, R;
  if (e2 >= 0) {
    const q = sc.q;
    M = pow5(q);
    const s = e2 + 1 - q;
    const d = sc.mul * M - (1n << BigInt(sc.k)); // mul = (2^k + d)/5^q
    // Wrong iff c + e ≥ M, where c = (t·2^s mod M) ≤ M − 1 and the error
    // e = t·2^s·d/2^k (in units of 1/M) is at most T1·2^s·d/2^k. So c ≥ M − ⌊e_max⌋.
    const D = ((T1 << BigInt(s)) * d) >> BigInt(sc.k);
    if (D === 0n) return res; // the error never reaches one residue step: clean
    if (D >= M) { res.status = "undecided"; return res; }
    a = (1n << BigInt(s)) % M; L = M - D; R = M - 1n;
  } else {
    if (sc.exact) { res.status = "exact"; return res; }
    const q = sc.q;
    if (q <= 1) { res.status = "exact"; return res; }
    M = 1n << BigInt(q - 1);
    const r = pow5(sc.i) & ((1n << BigInt(sc.k)) - 1n); // truncated part of 5^i
    const D = T1 * r;
    if (D === 0n) { res.status = "exact"; return res; }
    if (D >= M) { res.status = "undecided"; return res; }
    a = pow5(sc.i) % M; L = 0n; R = D - 1n;
  }
  let start = T0;
  while (res.candidates < cap) {
    const x = firstInWindow(a, M, start, L, R);
    if (x === null) return res;
    const t = start + x;
    if (t > T1) return res;
    res.candidates++;
    const cands = (t & 1n) === 0n ? [t / 2n] : [(t + 1n) / 2n, (t - 1n) / 2n];
    for (const m2 of cands) if (check(m2)) return res;
    start = t + 1n;
  }
  res.status = "undecided";
  return res;
}

export function makeHunter(B, cap = 64) {
  const state = { B, next: 0, done: false, needles: [], exponentsWithNeedle: 0, undecided: 0, exactExponents: 0, candidates: 0, posNeedles: 0, negNeedles: 0 };
  state.run = (count) => {
    for (let n = 0; n < count && state.next <= 2046; n++, state.next++) {
      const r = huntExponent(state.next, B, cap);
      state.candidates += r.candidates;
      if (r.status === "needle") {
        state.exponentsWithNeedle++;
        if (r.e2 >= 0) state.posNeedles++; else state.negNeedles++;
        state.needles.push(r.needle);
      } else if (r.status === "undecided") state.undecided++;
      else if (r.status === "exact") state.exactExponents++;
    }
    if (state.next > 2046) state.done = true;
    return state;
  };
  return state;
}

// ---------------------------------------------------------------- small-format exhaustive lab

// Every positive finite value of a small format, every one of its three floors,
// checked against the exact floor with a B-bit table.
export function exhaustiveSmall(fmt, B) {
  const H = 1n << BigInt(fmt.P);
  const Emax = (1 << fmt.EB) - 2;
  let wrong = 0, total = 0, exps = 0;
  const examples = [];
  for (let E = 0; E <= Emax; E++) {
    const e2 = (E === 0 ? 1 : E) - fmt.BIAS - fmt.P - 2;
    const t = scaleFor(e2, B), x = scaleFor(e2, Infinity);
    let bad = 0;
    const lo = E === 0 ? 1n : H, hi = E === 0 ? H - 1n : 2n * H - 1n;
    for (let m2 = lo; m2 <= hi; m2++) {
      const mv = 4n * m2, mm = mv - 1n - (m2 !== H || E <= 1 ? 1n : 0n);
      for (const m of [mm, mv, mv + 2n]) {
        total++;
        if (t.f(m) !== x.f(m)) {
          bad++;
          if (examples.length < 50) examples.push({ E, e2, m2, m, q: t.q, exact: x.f(m), trunc: t.f(m) });
        }
      }
    }
    wrong += bad; if (bad) exps++;
  }
  return { B, wrong, total, exponentsAffected: exps, exponents: Emax + 1, examples };
}

// ---------------------------------------------------------------- stored chart data
// Produced by this module: makeHunter(B).run(3000) → [B, exponents with a needle,
// of which e2 ≥ 0, of which e2 < 0, undecided (candidate cap reached)], and
// makeRandomTester(B, 1).run(100000) → [B, exponents with a wrong floor,
// doubles with a wrong floor, doubles with a wrong output]. Re-verified in
// test/explore-ryu-pocket.test.js.
export const CHART_HUNT = [[64,1936,956,980,14],[65,1931,950,981,16],[66,1927,946,981,16],[67,1920,943,977,22],[68,1905,932,973,28],[69,1898,928,970,33],[70,1904,937,967,23],[71,1904,938,966,23],[72,1905,941,964,19],[73,1910,943,967,13],[74,1906,939,967,14],[75,1909,938,971,8],[76,1911,939,972,6],[77,1902,936,966,9],[78,1901,934,967,8],[79,1895,930,965,11],[80,1888,926,962,17],[81,1879,920,959,24],[82,1878,920,958,21],[83,1883,923,960,14],[84,1878,921,957,12],[85,1872,919,953,16],[86,1854,905,949,29],[87,1859,906,953,20],[88,1857,905,952,22],[89,1852,900,952,24],[90,1854,902,952,21],[91,1857,907,950,14],[92,1864,914,950,6],[93,1863,917,946,3],[94,1860,915,945,4],[95,1850,906,944,8],[96,1848,905,943,6],[97,1847,906,941,4],[98,1843,906,937,4],[99,1842,906,936,4],[100,1836,906,930,4],[101,1836,904,932,4],[102,1836,903,933,2],[103,1830,900,930,3],[104,1826,898,928,3],[105,1822,898,924,2],[106,1810,890,920,1],[107,1796,885,911,1],[108,1760,860,900,0],[109,1690,827,863,0],[110,1581,783,798,0],[111,1380,676,704,0],[112,1071,526,545,0],[113,751,374,377,0],[114,426,211,215,0],[115,231,115,116,1],[116,114,55,59,0],[117,41,31,10,0],[118,18,16,2,0],[119,8,7,1,0],[120,3,2,1,0],[121,2,1,1,0],[122,2,1,1,0],[123,1,1,0,0],[124,0,0,0,0],[125,0,0,0,0]];
export const CHART_RANDOM = [[64,1668,10877,61],[65,1449,5628,23],[66,1142,2901,14],[67,831,1449,7],[68,528,722,2],[69,297,343,1],[70,153,165,0],[71,77,81,0],[72,42,43,0],[73,20,21,0],[74,8,8,0],[75,2,2,0],[76,1,1,0],[77,0,0,0],[78,0,0,0],[79,0,0,0],[80,0,0,0],[81,0,0,0],[82,0,0,0],[83,0,0,0],[84,0,0,0],[85,0,0,0],[86,0,0,0],[87,0,0,0],[88,0,0,0],[89,0,0,0],[90,0,0,0],[91,0,0,0],[92,0,0,0],[93,0,0,0],[94,0,0,0],[95,0,0,0],[96,0,0,0],[97,0,0,0],[98,0,0,0],[99,0,0,0],[100,0,0,0],[101,0,0,0],[102,0,0,0],[103,0,0,0],[104,0,0,0],[105,0,0,0],[106,0,0,0],[107,0,0,0],[108,0,0,0],[109,0,0,0],[110,0,0,0],[111,0,0,0],[112,0,0,0],[113,0,0,0],[114,0,0,0],[115,0,0,0],[116,0,0,0],[117,0,0,0],[118,0,0,0],[119,0,0,0],[120,0,0,0],[121,0,0,0],[122,0,0,0],[123,0,0,0],[124,0,0,0],[125,0,0,0]];
