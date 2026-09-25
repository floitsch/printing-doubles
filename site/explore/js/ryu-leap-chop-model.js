// Pure model for the "Ryū: leap, then chop" explanation page.
// A BigInt port of d2d() from ulfjack/ryu (ryu/d2s.c), split into the two
// acts of the page, plus exact-arithmetic helpers for the what-if views.
// No DOM access: node tests import this file directly.

import { bitsOf } from "../../js/float.js";
import { shortestDecimal } from "../../js/oracle.js";

const B = BigInt;
export const POW5_BITCOUNT = 125;      // DOUBLE_POW5_BITCOUNT in d2s.c
export const POW5_INV_BITCOUNT = 125;  // DOUBLE_POW5_INV_BITCOUNT in d2s.c

// Helpers from ryu/common.h (integer approximations of logarithms).
export const pow5bits = (e) => Number(((B(e) * 1217359n) >> 19n) + 1n); // ceil(log2 5^e), 1 for e = 0
export const log10Pow2 = (e) => Number((B(e) * 78913n) >> 18n);         // floor(e · log10 2)
export const log10Pow5 = (e) => Number((B(e) * 732923n) >> 20n);        // floor(e · log10 5)

const POW5 = [1n];
export function pow5(e) {
  while (POW5.length <= e) POW5.push(POW5.at(-1) * 5n);
  return POW5[e];
}
const POW10 = [1n];
export function pow10(e) {
  while (POW10.length <= e) POW10.push(POW10.at(-1) * 10n);
  return POW10[e];
}

// DOUBLE_POW5_SPLIT[i]: the top 125 bits of 5^i (exact while 5^i fits).
export function pow5Split(i) {
  const k = pow5bits(i) - POW5_BITCOUNT;
  return k >= 0 ? pow5(i) >> B(k) : pow5(i) << B(-k);
}
// DOUBLE_POW5_INV_SPLIT[q]: floor(2^k / 5^q) + 1, k = 125 + pow5bits(q) - 1.
export function pow5InvSplit(q) {
  const k = POW5_INV_BITCOUNT + pow5bits(q) - 1;
  return (1n << B(k)) / pow5(q) + 1n;
}

function pow5Factor(v) {
  let count = 0;
  while (v !== 0n && v % 5n === 0n) { v /= 5n; count++; }
  return count;
}

export const NO_SABOTAGE = Object.freeze({ ignoreBounds: false, symmetricPow2: false, skipBump: false, halfUp: false });

/** Parse the free-text input: decimals, "2^k", "a+b", "max", "min". Returns a number or null. */
export function parseInput(text) {
  const t = String(text).trim().toLowerCase().replace(/\s+/g, "").replace(/−/g, "-");
  if (!t) return null;
  if (t === "max" || t === "dbl_max" || t === "max_value") return Number.MAX_VALUE;
  if (t === "min" || t === "min_value") return Number.MIN_VALUE;
  let m = t.match(/^(-?)2\^\(?(-?\d+)\)?$/);
  if (m) {
    const k = Number(m[2]);
    if (k < -1074 || k > 1023) return null;
    const v = k >= -1022 ? 2 ** k : 2 ** (k + 100) / 2 ** 100;
    return m[1] ? -v : v;
  }
  const num = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?";
  m = t.match(new RegExp(`^(${num})\\+(${num})$`));
  if (m) return Number(m[1]) + Number(m[2]);
  if (!new RegExp(`^${num}$`).test(t) && !/^[-+]?infinity$|^nan$/.test(t)) return null;
  return Number(t);
}

/** Step 1 and 2: decode and build the three integer points on the 2^e2 grid. */
export function decode(x, sabotage = NO_SABOTAGE) {
  const bits = bitsOf(Math.abs(x));
  const ieeeMantissa = bits & ((1n << 52n) - 1n);
  const ieeeExponent = Number((bits >> 52n) & 0x7ffn);
  const subnormal = ieeeExponent === 0;
  const m2 = subnormal ? ieeeMantissa : (1n << 52n) | ieeeMantissa;
  const e2 = (subnormal ? 1 : ieeeExponent) - 1023 - 52 - 2;
  const evenMantissa = (m2 & 1n) === 0n;
  const acceptBounds = sabotage.ignoreBounds ? false : evenMantissa;
  const powerOfTwoGap = ieeeMantissa === 0n && ieeeExponent > 1; // lower gap is half as wide
  const mmShift = powerOfTwoGap && !sabotage.symmetricPow2 ? 0n : 1n;
  const mv = 4n * m2;
  return {
    x, negative: x < 0 || Object.is(x, -0), bits, ieeeMantissa, ieeeExponent, subnormal,
    m2, e2, evenMantissa, acceptBounds, powerOfTwoGap, mmShift,
    mv, mp: mv + 2n, mm: mv - 1n - mmShift,
    prev: powerOfTwoGap ? mv - 2n : mv - 4n, // neighbouring doubles on the same 2^e2 grid
    next: mv + 4n,
  };
}

/** Ryū's choice of q and of the decimal unit 10^e10. */
export function chooseScale(e2) {
  if (e2 >= 0) {
    const q = Math.max(0, log10Pow2(e2) - 1); // == log10Pow2(e2) - (e2 > 3)
    return { q, e10: q };
  }
  const q = Math.max(0, log10Pow5(-e2) - 1);  // == log10Pow5(-e2) - (-e2 > 1)
  return { q, e10: q + e2 };
}

/** Act 1: the leap. One table multiply and one shift per point. */
export function leap(x, sabotage = NO_SABOTAGE) {
  const d = decode(x, sabotage);
  const { e2, mv, mp, mm, acceptBounds, mmShift } = d;
  const { q, e10 } = chooseScale(e2);
  let kind, mul, shift, i = null, k;
  if (e2 >= 0) {
    kind = "inv";
    k = POW5_INV_BITCOUNT + pow5bits(q) - 1;
    mul = pow5InvSplit(q);
    shift = -e2 + q + k;
  } else {
    kind = "pow";
    i = -e2 - q;
    k = pow5bits(i) - POW5_BITCOUNT;
    mul = pow5Split(i);
    shift = q - k;
  }
  const f = (m) => (m * mul) >> B(shift);
  const raw = { vm: f(mm), vr: f(mv), vp: f(mp) };
  let { vm, vr, vp } = raw;

  // Exactness flags: "did the floor throw anything away?" as divisibility tests.
  let vmIsTrailingZeros = false, vrIsTrailingZeros = false, vpExactExcluded = false;
  const checks = { base: e2 >= 0 ? 5 : 2, power: q, performed: false, limit: e2 >= 0 ? "q ≤ 21" : "q < 63" };
  if (e2 >= 0) {
    if (q <= 21) {
      checks.performed = true;
      if (mv % 5n === 0n) { vrIsTrailingZeros = pow5Factor(mv) >= q; checks.tested = "mv"; }
      else if (acceptBounds) { vmIsTrailingZeros = pow5Factor(mm) >= q; checks.tested = "mm"; }
      else { vpExactExcluded = pow5Factor(mp) >= q; checks.tested = "mp"; }
    }
  } else if (q <= 1) {
    checks.performed = true;
    checks.tested = "small-q";
    vrIsTrailingZeros = true;
    if (acceptBounds) vmIsTrailingZeros = mmShift === 1n;
    else vpExactExcluded = true;
  } else if (q < 63) {
    checks.performed = true;
    checks.tested = "mv";
    vrIsTrailingZeros = (mv & ((1n << B(q)) - 1n)) === 0n;
  }
  if (vpExactExcluded) vp -= 1n;
  return {
    ...d, q, e10, kind, mul, shift, i, k,
    mulBits: mul.toString(2).length,
    raw, vm, vr, vp, vpExactExcluded, vmIsTrailingZeros, vrIsTrailingZeros, checks,
    exact: exactness(d, e10),
  };
}

/** Exact floors of mm, mv, mp · 2^e2 / 10^e10 and whether each division was exact. */
export function exactFloors(d, e10) {
  const f = (m) => {
    let num = m, den = 1n;
    if (d.e2 >= 0) num <<= B(d.e2); else den <<= B(-d.e2);
    if (e10 >= 0) den *= pow10(e10); else num *= pow10(-e10);
    return { floor: num / den, exact: num % den === 0n };
  };
  return { vm: f(d.mm), vr: f(d.mv), vp: f(d.mp) };
}

function exactness(d, e10) {
  const e = exactFloors(d, e10);
  return { vm: e.vm.exact, vr: e.vr.exact, vp: e.vp.exact };
}

/**
 * Act 2: the chop and the round, from a start state {vm, vr, vp, flags}.
 * Faithful to d2d's general path (loop 1, loop 2, round). The common path in
 * d2s.c (both flags false) gives identical results.
 */
export function chop(start, sabotage = NO_SABOTAGE) {
  let { vm, vr, vp, vmIsTrailingZeros, vrIsTrailingZeros } = start;
  const { acceptBounds } = start;
  const states = [{ vm, vr, vp, removed: 0, lastRemovedDigit: 0n, vmIsTrailingZeros, vrIsTrailingZeros, phase: 0, removedDigits: [] }];
  let removed = 0, lastRemovedDigit = 0n;
  const removedDigits = [];
  const push = (phase, vmDigit) => states.push({ vm, vr, vp, removed, lastRemovedDigit, vmIsTrailingZeros, vrIsTrailingZeros, phase, vmDigit, removedDigits: removedDigits.slice() });
  // Loop 1: while the coarser grid still has a tick in (a, c].
  while (vp / 10n > vm / 10n) {
    const vmDigit = vm % 10n;
    vmIsTrailingZeros = vmIsTrailingZeros && vmDigit === 0n;
    vrIsTrailingZeros = vrIsTrailingZeros && lastRemovedDigit === 0n;
    lastRemovedDigit = vr % 10n;
    removedDigits.push(lastRemovedDigit);
    vr /= 10n; vp /= 10n; vm /= 10n; removed++;
    push(1, vmDigit);
  }
  // Loop 2: the lower bound is exact and included; keep chopping while a ends in 0.
  if (vmIsTrailingZeros && acceptBounds) {
    while (vm % 10n === 0n) {
      vrIsTrailingZeros = vrIsTrailingZeros && lastRemovedDigit === 0n;
      lastRemovedDigit = vr % 10n;
      removedDigits.push(lastRemovedDigit);
      vr /= 10n; vp /= 10n; vm /= 10n; removed++;
      push(2, 0n);
    }
  }
  return { states, round: roundStep(states.at(-1), acceptBounds, sabotage) };
}

/** The round step, with the rule that decided it. */
export function roundStep(s, acceptBounds, sabotage = NO_SABOTAGE) {
  const { vm, vr, vmIsTrailingZeros, vrIsTrailingZeros, lastRemovedDigit } = s;
  const tie = vrIsTrailingZeros && lastRemovedDigit === 5n;
  let effectiveDigit = lastRemovedDigit;
  if (tie && vr % 2n === 0n && !sabotage.halfUp) effectiveDigit = 4n;
  const lowerLegal = acceptBounds && vmIsTrailingZeros;
  const vmBump = vr === vm && !lowerLegal && !sabotage.skipBump;
  const byDigit = effectiveDigit >= 5n;
  const up = vmBump || byDigit;
  let rule;
  if (vmBump) rule = byDigit ? "bump+digit" : "bump";
  else if (tie) rule = sabotage.halfUp ? "tie-halfup" : vr % 2n === 0n ? "tie-even-down" : "tie-even-up";
  else rule = byDigit ? "digit-up" : "digit-down";
  return { output: vr + (up ? 1n : 0n), up, rule, tie, vmBump, lowerLegal, effectiveDigit, lastRemovedDigit };
}

/** The whole d2d: leap, chop, round. */
export function ryu(x, sabotage = NO_SABOTAGE) {
  const L = leap(x, sabotage);
  const C = chop(L, sabotage);
  const last = C.states.at(-1);
  return { leap: L, states: C.states, round: C.round, digits: C.round.output, exponent: L.e10 + last.removed };
}

/** "What if Ryū used another decimal unit?" Exact floors, exact flags, same chop and round. */
export function whatIfScale(x, e10) {
  const d = decode(x);
  const f = exactFloors(d, e10);
  let vp = f.vp.floor;
  if (!d.acceptBounds && f.vp.exact) vp -= 1n;
  const start = {
    vm: f.vm.floor, vr: f.vr.floor, vp, acceptBounds: d.acceptBounds,
    vmIsTrailingZeros: d.acceptBounds && f.vm.exact, vrIsTrailingZeros: f.vr.exact,
  };
  const C = chop(start);
  const last = C.states.at(-1);
  const legalFirst = start.vmIsTrailingZeros ? start.vm : start.vm + 1n;
  return {
    e10, start, exact: { vm: f.vm.exact, vr: f.vr.exact, vp: f.vp.exact },
    candidates: vp >= legalFirst ? vp - legalFirst + 1n : 0n,
    maxBits: [start.vm, start.vr, f.vp.floor].reduce((m, v) => Math.max(m, v === 0n ? 0 : v.toString(2).length), 0),
    chops: last.removed, digits: C.round.output, exponent: e10 + last.removed, round: C.round,
  };
}

/** Normalise digits·10^exponent: strip trailing zeros. */
export function normalize(digits, exponent) {
  while (digits !== 0n && digits % 10n === 0n) { digits /= 10n; exponent++; }
  return { digits, exponent };
}

/** Scientific text like 1.780059086805761e-307 (JS style). */
export function sciText(digits, exponent, negative = false) {
  const n = normalize(digits, exponent);
  const s = n.digits.toString();
  const e = exponent + (n.exponent - exponent) + s.length - 1;
  return `${negative ? "-" : ""}${s[0]}${s.length > 1 ? "." + s.slice(1) : ""}e${e >= 0 ? "+" : ""}${e}`;
}

/** Compare an output with the true shortest-closest answer. */
export function verdict(x, digits, exponent) {
  const ax = Math.abs(x);
  const n = normalize(digits, exponent);
  const text = `${n.digits}e${n.exponent}`;
  const back = Number(text);
  const best = shortestDecimal(ax);
  const bestN = normalize(best.coefficient, best.exponent);
  const len = n.digits.toString().length, bestLen = bestN.digits.toString().length;
  return {
    roundTrips: back === ax,
    readsAs: back,
    shortest: back === ax && len === bestLen,
    correct: n.digits === bestN.digits && n.exponent === bestN.exponent,
    best: bestN, len, bestLen,
  };
}

/** Exact decimal digits of |x|: significant digit string and the exponent of its first digit. */
export function exactDigits(x) {
  const d = decode(x);
  const m = d.mv, e2 = d.e2;
  let s, pointExp;
  if (e2 >= 0) { s = (m << B(e2)).toString(); pointExp = s.length - 1; }
  else {
    // m·2^e2 = m·5^-e2 / 10^-e2
    s = (m * pow5(-e2)).toString();
    pointExp = s.length - 1 + e2;
  }
  s = s.replace(/0+$/, "");
  return { digits: s, firstExp: pointExp };
}

/**
 * Horizontal ruler geometry, all exact: position of a real point t measured
 * on [mm, mp] in units of 2^e2 → fraction of the band (0 at mm, 1 at mp).
 * Ticks n·10^unitExp are returned for n in [nLo, nHi].
 */
export function tickFraction(d, n, unitExp, scale = 1_000_000n) {
  // n·10^unitExp / 2^e2 - mm, over (mp - mm)
  let num = n, den = 1n;
  if (unitExp >= 0) num *= pow10(unitExp); else den *= pow10(-unitExp);
  if (d.e2 >= 0) den <<= B(d.e2); else num <<= B(-d.e2);
  const top = (num - d.mm * den) * scale;
  const bottom = (d.mp - d.mm) * den;
  return Number(floorDiv(top, bottom)) / Number(scale);
}
function floorDiv(a, b) { const q = a / b; return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q; }

/** Integer tick range visible in the band-relative window [lo, hi]. */
export function tickRange(d, unitExp, lo, hi) {
  // t(n) = (n·U/2^e2 - mm)/(mp - mm); solve for n at lo and hi.
  // n = (mm + f·(mp-mm)) · 2^e2 / U. Use rationals with a 1e6 scale on f.
  const S = 1_000_000n;
  const nAt = (f, ceil) => {
    let num = d.mm * S + B(Math.round(f * 1e6)) * (d.mp - d.mm), den = S;
    if (d.e2 >= 0) num <<= B(d.e2); else den <<= B(-d.e2);
    if (unitExp >= 0) den *= pow10(unitExp); else num *= pow10(-unitExp);
    const fl = floorDiv(num, den);
    return ceil && fl * den !== num ? fl + 1n : fl;
  };
  return { nLo: nAt(lo, true), nHi: nAt(hi, false) };
}
