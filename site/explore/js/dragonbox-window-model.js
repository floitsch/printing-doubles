// Copyright (C) 2026 Toit contributors.
//
// Pure computation for the "Dragonbox: three digits decide" explanation page.
// No DOM access: node imports this file directly in the tests.
//
// The core is a faithful BigInt transcription of jkj::dragonbox
// impl::compute_nearest for binary64 with the default policies
// (nearest-to-even interval, round-to-even ties, full cache, trailing zeros
// removed).  Every step records the line of the displayed source (SOURCE)
// so that the page can step through it.

import { bitsOf, fromBits, nextDown, nextUp } from "../../js/float.js";

export const M64 = (1n << 64n) - 1n;
const M128 = (1n << 128n) - 1n;
export const KAPPA = 2;
export const MIN_K = -292;
export const MAX_K = 326;

// ---------------------------------------------------------------------------
// Log approximations exactly as in dragonbox.h (arithmetic shift = floor).
export const floor_log10_pow2 = (e) => Math.floor((e * 315653) / 2 ** 20);
export const floor_log2_pow10 = (k) => Math.floor((k * 1741647) / 2 ** 19);
export const floor_log10_pow2_minus_log10_4_over_3 = (e) => Math.floor((e * 631305 - 261663) / 2 ** 21);

const POW10 = [1n];
export function pow10(n) {
  while (POW10.length <= n) POW10.push(POW10.at(-1) * 10n);
  return POW10[n];
}

// ---------------------------------------------------------------------------
// Cache: phi_k = ceil(10^k * 2^(127 - floor(log2 10^k))), 128 bits.
const cacheMemo = new Map();
export function get_cache(k) {
  if (cacheMemo.has(k)) return cacheMemo.get(k);
  const s = 127 - floor_log2_pow10(k);
  let num = k >= 0 ? pow10(k) : 1n;
  let den = k >= 0 ? 1n : pow10(-k);
  if (s >= 0) num <<= BigInt(s); else den <<= BigInt(-s);
  let v = num / den;
  if (v * den !== num) v += 1n;
  cacheMemo.set(k, v);
  return v;
}

function bitLength(n) { return n === 0n ? 0 : n.toString(2).length; }
function floor_log2_pow5(k) { return k >= 0 ? bitLength(5n ** BigInt(k)) - 1 : -bitLength(5n ** BigInt(-k)); }

export const COMPRESSION_RATIO = 27;
export const FULL_CACHE_ENTRIES = MAX_K - MIN_K + 1; // 619
export const COMPACT_CACHE_ENTRIES = Math.floor((MAX_K - MIN_K + COMPRESSION_RATIO) / COMPRESSION_RATIO); // 23
export const FULL_CACHE_BYTES = FULL_CACHE_ENTRIES * 16;
export const COMPACT_CACHE_BYTES = COMPACT_CACHE_ENTRIES * 16 + COMPRESSION_RATIO * 8;

// Compact cache: recover entry k from every 27th entry and a table of 5^0..5^26
// (compressed_cache_holder<ieee754_binary64>::get_cache).
export function compact_cache(k) {
  const cache_index = (((k - MIN_K) * 607) >>> 14);
  const kb = cache_index * COMPRESSION_RATIO + MIN_K;
  const offset = k - kb;
  const base_cache = get_cache(kb);
  if (offset === 0) return { cache: base_cache, kb, offset, alpha: 0 };
  const alpha = floor_log2_pow5(k) - floor_log2_pow5(kb);
  const pow5 = 5n ** BigInt(offset);
  // 192-bit product; the header keeps its top 128 bits shifted right by alpha
  // (the bits above those 128 are zero), then adds 1 to the low word.
  const product = base_cache * pow5;
  const shifted = (product >> BigInt(alpha)) & M128;
  return { cache: shifted + 1n, kb, offset, alpha };
}

// ---------------------------------------------------------------------------
// Decoding.
export function decode(x) {
  const bits = bitsOf(Math.abs(x));
  const mant = bits & ((1n << 52n) - 1n);
  const expBits = Number(bits >> 52n);
  const subnormal = expBits === 0;
  const fc = subnormal ? mant : mant | (1n << 52n);
  const e = subnormal ? -1074 : expBits - 1075;
  return { bits, mant, expBits, fc, e, subnormal, shorter: !subnormal && mant === 0n, closed: (fc & 1n) === 0n };
}

export function isUsable(x) {
  return typeof x === "number" && Number.isFinite(x) && x !== 0;
}

// ---------------------------------------------------------------------------
// The displayed source.  Each entry: [id or null, text].
export const SOURCE = [
  [null, "// jkj::dragonbox impl::compute_nearest, binary64, default policies."],
  [null, "// All integers are unsigned 64-bit (cache: 128-bit); `/` truncates."],
  ["fn", "function compute_nearest(bits) {"],
  ["two_fc", "  let two_fc = fraction_bits(bits) << 1;            // 2·m"],
  ["exp_bits", "  let binary_exponent = exponent_bits(bits);"],
  ["is_normal", "  if (binary_exponent != 0) {"],
  ["bias", "    binary_exponent += -1023 - 52;"],
  ["shorter_test", "    if (two_fc == 0)                                 // power of two"],
  ["shorter_call", "      return shorter_interval_case(binary_exponent);"],
  ["hidden", "    two_fc |= 1 << 53;                               // hidden bit"],
  [null, "  } else {"],
  ["subnormal", "    binary_exponent = -1022 - 52;                    // subnormal"],
  [null, "  }"],
  ["interval", "  const interval_type = normal_interval(two_fc);     // closed iff fc even"],
  [null, "  // Step 1: Schubfach multiplier calculation"],
  ["minus_k", "  const minus_k = floor_log10_pow2(binary_exponent) - kappa;   // kappa = 2"],
  ["cache", "  const cache = get_cache(-minus_k);                 // 128-bit phi_k"],
  ["beta", "  const beta = binary_exponent + floor_log2_pow10(-minus_k);"],
  ["deltai", "  const deltai = compute_delta(cache, beta);         // cache.high >> (63 - beta)"],
  ["z_result", "  const z_result = compute_mul((two_fc | 1) << beta, cache);  // top 128 of 192 bits"],
  [null, "  // Step 2: try the larger divisor (1000)"],
  ["div_big", "  let decimal_significand = z_result.integer_part / big_divisor;"],
  ["r", "  let r = z_result.integer_part - big_divisor * decimal_significand;"],
  [null, "  do {"],
  ["r_lt", "    if (r < deltai) {"],
  ["excl_test", "      if (r == 0 && z_result.is_integer && !interval_type.include_right_endpoint) {"],
  ["excl_dec", "        decimal_significand -= 1;"],
  ["excl_r", "        r = big_divisor;"],
  ["excl_break", "        break;"],
  [null, "      }"],
  ["r_gt", "    } else if (r > deltai) {"],
  ["gt_break", "      break;"],
  ["r_eq", "    } else {                                         // r == deltai"],
  ["x_result", "      const x_result = compute_mul_parity(two_fc - 1, cache, beta);"],
  ["x_test", "      if (!(x_result.parity || (x_result.is_integer && interval_type.include_left_endpoint)))"],
  ["x_break", "        break;"],
  [null, "    }"],
  ["big_return", "    return on_trailing_zeros(decimal_significand, minus_k + kappa + 1);"],
  [null, "  } while (false);"],
  [null, "  // Step 3: find the significand with the smaller divisor (100)"],
  ["times10", "  decimal_significand *= 10;"],
  ["dist", "  let dist = r - deltai / 2 + small_divisor / 2;     // small_divisor / 2 = 50"],
  ["approx_y", "  const approx_y_parity = ((dist ^ (small_divisor / 2)) & 1) != 0;"],
  ["divisible", "  const divisible_by_small_divisor = dist % small_divisor == 0;"],
  ["dist_div", "  dist = dist / small_divisor;"],
  ["add_dist", "  decimal_significand += dist;"],
  ["div_test", "  if (divisible_by_small_divisor) {"],
  ["y_result", "    const y_result = compute_mul_parity(two_fc, cache, beta);"],
  ["y_test", "    if (y_result.parity != approx_y_parity)"],
  ["y_dec", "      decimal_significand -= 1;"],
  ["tie_test", "    else if (decimal_significand % 2 == 1 && y_result.is_integer)   // tie: to even"],
  ["tie_dec", "      decimal_significand -= 1;"],
  [null, "  }"],
  ["small_return", "  return no_trailing_zeros(decimal_significand, minus_k + kappa);"],
  [null, "}"],
  [null, ""],
  ["s_fn", "function shorter_interval_case(binary_exponent) {   // fc = 2^52, closed"],
  ["s_minus_k", "  const minus_k = floor_log10_pow2_minus_log10_4_over_3(binary_exponent);"],
  ["s_beta", "  const beta = binary_exponent + floor_log2_pow10(-minus_k);"],
  ["s_cache", "  const cache = get_cache(-minus_k);"],
  ["s_xi", "  let xi = (cache.high - (cache.high >> 54)) >> (11 - beta);   // left end"],
  ["s_zi", "  let zi = (cache.high + (cache.high >> 53)) >> (11 - beta);   // right end"],
  ["s_xi_test", "  if (!(binary_exponent >= 2 && binary_exponent <= 3))  // left end not an integer"],
  ["s_xi_inc", "    xi += 1;"],
  ["s_div", "  let decimal_significand = zi / 10;"],
  ["s_big_test", "  if (decimal_significand * 10 >= xi)"],
  ["s_big_return", "    return on_trailing_zeros(decimal_significand, minus_k + 1);"],
  ["s_roundup", "  decimal_significand = ((cache.high >> (10 - beta)) + 1) / 2;  // round-up of y"],
  ["s_tie_test", "  if (decimal_significand % 2 == 1 && binary_exponent == -77)   // tie: to even"],
  ["s_tie_dec", "    decimal_significand -= 1;"],
  ["s_lt_test", "  else if (decimal_significand < xi)"],
  ["s_lt_inc", "    decimal_significand += 1;"],
  ["s_return", "  return no_trailing_zeros(decimal_significand, minus_k);"],
  [null, "}"],
];

export const SOURCE_INDEX = new Map(SOURCE.map(([id], i) => [id, i]).filter(([id]) => id));

// ---------------------------------------------------------------------------
// Helpers from the header.
function compute_mul(u, cache) {
  const product = u * cache; // 192 bits
  const upper = product >> 64n;
  return { integer_part: upper >> 64n, is_integer: (upper & M64) === 0n, product };
}
function compute_delta(cache, beta) {
  return (cache >> 64n) >> BigInt(63 - beta);
}
function compute_mul_parity(two_f, cache, beta) {
  const r = (two_f * cache) & M128; // umul192_lower128
  const hi = r >> 64n, lo = r & M64;
  const b = BigInt(beta);
  return {
    parity: ((hi >> (64n - b)) & 1n) === 1n,
    is_integer: ((((hi << b) & M64) | (lo >> (64n - b))) === 0n),
  };
}

export function removeTrailingZerosLoop(s) {
  let n = 0;
  while (s !== 0n && s % 10n === 0n) { s /= 10n; n++; }
  return { significand: s, removed: n };
}

// Branchless search from remove_trailing_zeros_traits<remove_t, binary64>.
export const RTZ_STEPS = [
  { n: 8, mul: 28999941890838049n, bound: 184467440738n },
  { n: 4, mul: 182622766329724561n, bound: 1844674407370956n },
  { n: 2, mul: 10330176681277348905n, bound: 184467440737095517n },
  { n: 1, mul: 14757395258967641293n, bound: 1844674407370955162n },
];
function rotr64(v, n) {
  const b = BigInt(n);
  return ((v >> b) | (v << (64n - b))) & M64;
}
export function removeTrailingZerosBranchless(significand) {
  const steps = [];
  let s = 0;
  for (const step of RTZ_STEPS) {
    const r = rotr64((significand * step.mul) & M64, step.n);
    const b = r < step.bound;
    steps.push({ ...step, before: significand, r, taken: b });
    s = s * 2 + (b ? 1 : 0);
    if (b) significand = r;
  }
  return { significand, removed: s, steps };
}

// ---------------------------------------------------------------------------
// compute_nearest with a line-by-line trace.
export function compute_nearest(x, { cachePolicy = "full" } = {}) {
  const d = decode(x);
  const cacheOf = cachePolicy === "compact" ? (k) => compact_cache(k).cache : get_cache;
  const steps = [];
  const V = {};
  const at = (id, note) => steps.push({ id, vars: { ...V }, note });
  const finish = (significand, exponent, path, extra = {}) => ({ significand, exponent, path, steps, vars: { ...V }, decoded: d, ...extra });

  at("fn");
  let two_fc = d.mant << 1n; V.two_fc = two_fc; at("two_fc");
  let binary_exponent = d.expBits; V.binary_exponent = binary_exponent; at("exp_bits");
  at("is_normal", binary_exponent !== 0 ? "normal number" : "subnormal number");
  if (binary_exponent !== 0) {
    binary_exponent += -1023 - 52; V.binary_exponent = binary_exponent; at("bias");
    at("shorter_test", two_fc === 0n ? "yes: a power of two" : "no");
    if (two_fc === 0n) {
      at("shorter_call");
      return shorter_interval_case(binary_exponent, cacheOf, steps, V, at, finish);
    }
    two_fc |= 1n << 53n; V.two_fc = two_fc; at("hidden");
  } else {
    binary_exponent = -1022 - 52; V.binary_exponent = binary_exponent; at("subnormal");
  }
  const closed = (two_fc & 2n) === 0n;
  V.interval_type = closed ? "closed [x, z]" : "open (x, z)"; at("interval");
  const minus_k = floor_log10_pow2(binary_exponent) - KAPPA; V.minus_k = minus_k; at("minus_k");
  const cache = cacheOf(-minus_k); V.cache = cache; at("cache");
  const beta = binary_exponent + floor_log2_pow10(-minus_k); V.beta = beta; at("beta");
  const deltai = compute_delta(cache, beta); V.deltai = deltai; at("deltai");
  const u = (two_fc | 1n) << BigInt(beta);
  const z_result = compute_mul(u, cache);
  V.z_result = { integer_part: z_result.integer_part, is_integer: z_result.is_integer }; at("z_result");
  const big_divisor = 1000n, small_divisor = 100n;
  let decimal_significand = z_result.integer_part / big_divisor; V.decimal_significand = decimal_significand; at("div_big");
  let r = z_result.integer_part - big_divisor * decimal_significand; V.r = r; at("r");
  const extra = { u, product: z_result.product, beta, minus_k, cache, deltai, z_result, r0: r, s0: decimal_significand, closed };
  let fine = false, reason = "";
  do {
    at("r_lt", r < deltai ? "true" : "false");
    if (r < deltai) {
      const excl = r === 0n && z_result.is_integer && !closed;
      at("excl_test", excl ? "true: the tick is the excluded right endpoint" : "false");
      if (excl) {
        decimal_significand -= 1n; V.decimal_significand = decimal_significand; at("excl_dec");
        r = big_divisor; V.r = r; at("excl_r");
        at("excl_break");
        fine = true; reason = "excluded"; break;
      }
    } else {
      at("r_gt", r > deltai ? "true" : "false: r == deltai");
      if (r > deltai) { at("gt_break"); fine = true; reason = "gt"; break; }
      at("r_eq");
      const x_result = compute_mul_parity(two_fc - 1n, cache, beta);
      V.x_result = x_result; at("x_result");
      extra.x_result = x_result;
      const accept = x_result.parity || (x_result.is_integer && closed);
      at("x_test", accept ? "false: the tick is inside" : "true: the tick is outside");
      if (!accept) { at("x_break"); fine = true; reason = "eq"; break; }
    }
    const rtz = removeTrailingZerosLoop(decimal_significand);
    const exponent = minus_k + KAPPA + 1 + rtz.removed;
    V.result = `${rtz.significand} × 10^${exponent}`;
    at("big_return", `strip ${rtz.removed} trailing zero${rtz.removed === 1 ? "" : "s"}`);
    return finish(rtz.significand, exponent, "big", { ...extra, reason: r0Reason(extra.r0, deltai), bigSignificand: decimal_significand, removed: rtz.removed });
  } while (false);
  decimal_significand *= 10n; V.decimal_significand = decimal_significand; at("times10");
  let dist = r - deltai / 2n + small_divisor / 2n; V.dist = dist; at("dist");
  extra.dist = dist;
  const approx_y_parity = ((dist ^ (small_divisor / 2n)) & 1n) !== 0n; V.approx_y_parity = approx_y_parity; at("approx_y");
  const divisible_by_small_divisor = dist % small_divisor === 0n; V.divisible_by_small_divisor = divisible_by_small_divisor; at("divisible");
  dist = dist / small_divisor; V.dist = dist; at("dist_div");
  decimal_significand += dist; V.decimal_significand = decimal_significand; at("add_dist");
  extra.digit = dist;
  at("div_test", divisible_by_small_divisor ? "true: y is near a midpoint" : "false");
  extra.divisible = divisible_by_small_divisor;
  if (divisible_by_small_divisor) {
    const y_result = compute_mul_parity(two_fc, cache, beta);
    V.y_result = y_result; at("y_result");
    extra.y_result = y_result;
    extra.approx_y_parity = approx_y_parity;
    at("y_test", y_result.parity !== approx_y_parity ? "true: y is just below the midpoint" : "false");
    if (y_result.parity !== approx_y_parity) {
      decimal_significand -= 1n; V.decimal_significand = decimal_significand; at("y_dec");
      extra.yFix = "parity";
    } else {
      const tie = (decimal_significand & 1n) === 1n && y_result.is_integer;
      at("tie_test", tie ? "true: exact tie, go to even" : "false");
      if (tie) { decimal_significand -= 1n; V.decimal_significand = decimal_significand; at("tie_dec"); extra.yFix = "tie"; }
    }
  }
  const exponent = minus_k + KAPPA;
  V.result = `${decimal_significand} × 10^${exponent}`;
  at("small_return");
  return finish(decimal_significand, exponent, "small", { ...extra, reason });
}

function r0Reason(r0, deltai) { return r0 < deltai ? "lt" : "eq"; }

function shorter_interval_case(binary_exponent, cacheOf, steps, V, at, finish) {
  at("s_fn");
  const minus_k = floor_log10_pow2_minus_log10_4_over_3(binary_exponent); V.minus_k = minus_k; at("s_minus_k");
  const beta = binary_exponent + floor_log2_pow10(-minus_k); V.beta = beta; at("s_beta");
  const cache = cacheOf(-minus_k); V.cache = cache; at("s_cache");
  const high = cache >> 64n;
  let xi = (high - (high >> 54n)) >> BigInt(11 - beta); V.xi = xi; at("s_xi");
  let zi = (high + (high >> 53n)) >> BigInt(11 - beta); V.zi = zi; at("s_zi");
  const xi0 = xi, zi0 = zi;
  const leftInt = binary_exponent >= 2 && binary_exponent <= 3;
  at("s_xi_test", leftInt ? "false: the left end is an integer" : "true");
  if (!leftInt) { xi += 1n; V.xi = xi; at("s_xi_inc"); }
  let decimal_significand = zi / 10n; V.decimal_significand = decimal_significand; at("s_div");
  const extra = { minus_k, beta, cache, xi0, zi0, xi, zi };
  const ok = decimal_significand * 10n >= xi;
  at("s_big_test", ok ? "true: a multiple of 10 is inside" : "false");
  if (ok) {
    const rtz = removeTrailingZerosLoop(decimal_significand);
    const exponent = minus_k + 1 + rtz.removed;
    V.result = `${rtz.significand} × 10^${exponent}`;
    at("s_big_return", `strip ${rtz.removed} trailing zero${rtz.removed === 1 ? "" : "s"}`);
    return finish(rtz.significand, exponent, "shorter-big", { ...extra, removed: rtz.removed, bigSignificand: decimal_significand });
  }
  decimal_significand = ((high >> BigInt(10 - beta)) + 1n) / 2n; V.decimal_significand = decimal_significand; at("s_roundup");
  extra.roundUp = decimal_significand;
  const tie = (decimal_significand & 1n) === 1n && binary_exponent === -77;
  at("s_tie_test", tie ? "true" : "false");
  if (tie) { decimal_significand -= 1n; V.decimal_significand = decimal_significand; at("s_tie_dec"); }
  else {
    const lt = decimal_significand < xi;
    at("s_lt_test", lt ? "true" : "false");
    if (lt) { decimal_significand += 1n; V.decimal_significand = decimal_significand; at("s_lt_inc"); }
  }
  V.result = `${decimal_significand} × 10^${minus_k}`;
  at("s_return");
  return finish(decimal_significand, minus_k, "shorter-small", extra);
}

// Plain result without keeping steps around (for sampling).
export function toDecimal(x, options) {
  const r = compute_nearest(x, options);
  return { significand: r.significand, exponent: r.exponent };
}

// ---------------------------------------------------------------------------
// Exact rationals (for drawing; the algorithm itself never computes x or y).
function scaled(numerator, pow2, k) {
  // numerator * 2^pow2 * 10^k as {num, den}
  let num = numerator, den = 1n;
  if (pow2 >= 0) num <<= BigInt(pow2); else den <<= BigInt(-pow2);
  if (k >= 0) num *= pow10(k); else den *= pow10(-k);
  return { num, den };
}
export function ratFloor(q) { return q.num / q.den; }
export function ratSub(a, b) { return { num: a.num * b.den - b.num * a.den, den: a.den * b.den }; }
export function ratToNumber(q, scale = 1e6) {
  // Accurate enough for drawing (values here are small after subtracting a base).
  const s = BigInt(scale);
  const neg = q.num < 0n;
  const n = neg ? -q.num : q.num;
  const v = Number((n * s) / q.den) / scale;
  return neg ? -v : v;
}
// Truncated fixed-point decimal: "986.12" (not rounded, so digits shown are true digits).
export function ratFixed(q, places = 2) {
  const neg = q.num < 0n;
  const n = neg ? -q.num : q.num;
  const scaledN = (n * pow10(places)) / q.den;
  let str = scaledN.toString().padStart(places + 1, "0");
  if (places > 0) str = `${str.slice(0, -places)}.${str.slice(-places)}`;
  return (neg ? "−" : "") + str;
}
// Scientific with n significant digits (truncated): {digits, exp10}.
export function ratSig(q, n = 20) {
  let num = q.num, den = q.den;
  // exp10 = floor(log10(q))
  let exp10 = num.toString().length - den.toString().length;
  const cmp = (e) => (e >= 0 ? num >= den * pow10(e) : num * pow10(-e) >= den);
  while (!cmp(exp10)) exp10--;
  while (cmp(exp10 + 1)) exp10++;
  const shift = n - 1 - exp10;
  const digits = shift >= 0 ? (num * pow10(shift)) / den : num / (den * pow10(-shift));
  const exact = shift >= 0 ? (num * pow10(shift)) % den === 0n : num % (den * pow10(-shift)) === 0n;
  return { digits: digits.toString(), exp10, exact };
}
export function fmtSig(q, n = 20) {
  const { digits, exp10, exact } = ratSig(q, n);
  let d = digits.replace(/0+$/, "") || "0";
  const tail = exact ? "" : "…";
  if (exp10 >= -5 && exp10 < 21) {
    if (exp10 >= 0) {
      if (d.length <= exp10 + 1) return d.padEnd(exp10 + 1, "0") + (exact ? "" : ".…");
      return `${d.slice(0, exp10 + 1)}.${d.slice(exp10 + 1)}${tail}`;
    }
    return `0.${"0".repeat(-exp10 - 1)}${d}${tail}`;
  }
  return `${d[0]}${d.length > 1 || !exact ? "." : ""}${d.slice(1)}${tail}e${exp10}`;
}

// Group a digit string in threes from the right with thin spaces.
export function group3(str) {
  const [i, f] = str.split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return f === undefined ? g : `${g}.${f}`;
}

// ---------------------------------------------------------------------------
// Everything the window explorable needs for one double.
export function windowModel(x) {
  const d = decode(x);
  const res = compute_nearest(x);
  const out = { x, decoded: d, result: res, shorter: d.shorter };
  out.text = decimalText(res.significand, res.exponent);
  out.readsBack = Number(`${res.significand}e${res.exponent}`) === Math.abs(x);
  const { fc, e } = d;
  // Unscaled interval.
  const lowGap = d.shorter ? 1n : 2n; // numerator of lower half-gap in units of 2^(e-2)
  out.w = scaled(fc, e, 0);
  out.lower = d.shorter ? scaled(4n * fc - 1n, e - 2, 0) : scaled(2n * fc - 1n, e - 1, 0);
  out.upper = scaled(2n * fc + 1n, e - 1, 0);
  out.prev = d.shorter ? scaled(2n * fc - 1n, e - 1, 0) : scaled(fc - 1n, e, 0);
  out.next = scaled(fc + 1n, e, 0);
  out.lowGap = lowGap;
  if (d.shorter) {
    const k = 0 - res.minus_k + 0;
    out.k = k;
    out.xs = scaled(4n * fc - 1n, e - 2, k);
    out.ys = scaled(fc, e, k);
    out.zs = scaled(2n * fc + 1n, e - 1, k);
    out.deltas = scaled(3n, e - 2, k);
    return out;
  }
  const k = 0 - res.minus_k + 0;
  out.k = k;
  out.xs = scaled(2n * fc - 1n, e - 1, k);
  out.ys = scaled(fc, e, k);
  out.zs = scaled(2n * fc + 1n, e - 1, k);
  out.deltas = scaled(1n, e, k);
  out.zi = res.z_result.integer_part;
  out.deltai = res.deltai;
  out.r = res.r0;
  out.s = res.s0;
  out.base = { num: 1000n * res.s0, den: 1n };
  out.zRel = ratToNumber(ratSub(out.zs, out.base));
  out.xRel = ratToNumber(ratSub(out.xs, out.base));
  out.yRel = ratToNumber(ratSub(out.ys, out.base));
  out.delta = ratToNumber(out.deltas);
  // Chosen candidate as a position relative to 1000·s (units of the scaled line).
  if (res.path === "big") {
    out.candidate = 0;
    out.candidateScaled = 1000n * res.bigSignificand;
  } else {
    // decimal_significand counts hundreds.
    const hundreds = res.significand; // exponent = minus_k + 2
    out.candidateScaled = hundreds * 100n;
    out.candidate = Number(out.candidateScaled - 1000n * res.s0);
  }
  // Magnifications k-1, k, k+1 for "why this k".
  out.zoomChoices = [k - 1, k, k + 1].map((kk) => ({ k: kk, delta: scaled(1n, e, kk) }));
  return out;
}

export function decimalText(significand, exponent) {
  return String(Number(`${significand}e${exponent}`));
}

// ---------------------------------------------------------------------------
// The kappa knob: the same double at magnification kappa = 0..3 (exact arithmetic).
export function kappaView(x, kappa) {
  const d = decode(x);
  const { fc, e } = d;
  const k = kappa - floor_log10_pow2(e);
  const zs = scaled(2n * fc + 1n, e - 1, k);
  const xs = scaled(2n * fc - 1n, e - 1, k);
  const ys = scaled(fc, e, k);
  const ds = scaled(1n, e, k);
  const zi = ratFloor(zs), deltai = ratFloor(ds);
  const big = pow10(kappa + 1), small = pow10(kappa);
  const s = zi / big, r = zi % big;
  const base = { num: big * s, den: 1n };
  let cat = r < deltai ? "lt" : r > deltai ? "gt" : "eq";
  const coarseInside = coarseTickInside(d, xs, zs, s * big);
  let fineCheck = false;
  if (!coarseInside) {
    // Fine path.  At kappa = 0 the fine grid is the integers themselves, so the
    // integer part of y never suffices; for kappa >= 1 use the code's test.
    if (kappa === 0) fineCheck = true;
    else {
      const rr = cat === "lt" ? r + big : r; // excluded right endpoint: r = big
      const dist = rr - deltai / 2n + small / 2n;
      fineCheck = dist % small === 0n;
    }
  }
  const beta = e + floor_log2_pow10(k);
  const uBits = bitLength((2n * fc + 1n) << BigInt(Math.max(beta, 0)));
  return {
    kappa, k, beta, zi, deltai, r, s, big, small, cat, coarseInside, fineCheck,
    zRel: ratToNumber(ratSub(zs, base)), xRel: ratToNumber(ratSub(xs, base)), yRel: ratToNumber(ratSub(ys, base)),
    delta: ratToNumber(ds), zBits: bitLength(zi), uBits,
    betaMax: Math.floor((kappa + 1) * Math.log2(10)),
    worstBits: 54 + Math.floor((kappa + 1) * Math.log2(10)),
    zs, ds,
  };
}
function coarseTickInside(d, xs, zs, tick) {
  // Is the multiple `tick` inside [x, z] (closed) or (x, z) (open)?
  const t = { num: tick, den: 1n };
  const cx = ratSub(t, xs).num, cz = ratSub(zs, t).num;
  return d.closed ? cx >= 0n && cz >= 0n : cx > 0n && cz > 0n;
}

// ---------------------------------------------------------------------------
// The 192-bit product, split in 64-bit limbs.
export function productLimbs(x) {
  const res = compute_nearest(x);
  if (res.path !== "big" && res.path !== "small") return null;
  const p = res.product;
  return {
    cacheHigh: res.cache >> 64n, cacheLow: res.cache & M64,
    u: res.u, beta: res.beta,
    top: p >> 128n, middle: (p >> 64n) & M64, low: p & M64,
    deltai: res.deltai,
    k: 0 - res.minus_k,
  };
}
export const hex64 = (v) => "0x" + v.toString(16).padStart(16, "0");

// ---------------------------------------------------------------------------
// Doubles for the controls.
export function nudge(x, dir) {
  const y = dir > 0 ? nextUp(x) : nextDown(x);
  return isUsable(y) && y > 0 ? y : x;
}
export function randomDouble(rand = Math.random) {
  for (;;) {
    const hi = Math.floor(rand() * 0x7ff00000); // exponent < 0x7ff, sign 0
    const lo = Math.floor(rand() * 2 ** 32);
    const v = fromBits((BigInt(hi) << 32n) | BigInt(lo));
    if (v > 0 && Number.isFinite(v)) return v;
  }
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Frequencies.  The constants below are what the functions return for the
// stated seed and sample size; the test suite recomputes them.
export function branchStats(n, seed) {
  const rand = mulberry32(seed);
  const c = { n, big: 0, small: 0, lt: 0, gt: 0, eq: 0, eqAccept: 0, eqReject: 0, excluded: 0, divisible: 0, yParityFix: 0, tie: 0, shorter: 0 };
  for (let i = 0; i < n; i++) {
    const x = randomDouble(rand);
    const r = compute_nearest(x);
    if (r.path.startsWith("shorter")) { c.shorter++; continue; }
    c[r.path]++;
    if (r.path === "big") { if (r.reason === "eq") { c.eq++; c.eqAccept++; } else c.lt++; }
    else if (r.reason === "gt") c.gt++;
    else if (r.reason === "eq") { c.eq++; c.eqReject++; }
    else if (r.reason === "excluded") c.excluded++;
    if (r.divisible) c.divisible++;
    if (r.yFix === "parity") c.yParityFix++;
    if (r.yFix === "tie") c.tie++;
  }
  return c;
}
export function kappaStats(n, seed) {
  const rand = mulberry32(seed);
  const rows = [0, 1, 2, 3].map((kappa) => ({ kappa, eq: 0, fineCheck: 0, coarse: 0, maxZBits: 0 }));
  let used = 0;
  for (let i = 0; i < n; i++) {
    const x = randomDouble(rand);
    if (decode(x).shorter) continue;
    used++;
    for (const row of rows) {
      const v = kappaView(x, row.kappa);
      if (v.cat === "eq") row.eq++;
      if (v.fineCheck) row.fineCheck++;
      if (v.coarseInside) row.coarse++;
      if (v.zBits > row.maxZBits) row.maxZBits = v.zBits;
    }
  }
  return { n: used, rows };
}

export const STATS_SEED = 20260925;
export const BRANCH_STATS = {"n":500000,"big":195627,"small":304373,"lt":195327,"gt":304002,"eq":618,"eqAccept":300,"eqReject":318,"excluded":53,"divisible":3136,"yParityFix":1461,"tie":116,"shorter":0};
export const KAPPA_STATS = {"n":200000,"rows":[{"kappa":0,"eq":19979,"fineCheck":121681,"coarse":78319,"maxZBits":57},{"kappa":1,"eq":2031,"fineCheck":11879,"coarse":78319,"maxZBits":60},{"kappa":2,"eq":243,"fineCheck":1261,"coarse":78319,"maxZBits":63},{"kappa":3,"eq":65,"fineCheck":214,"coarse":78319,"maxZBits":67}]};
export const BRANCH_STATS_N = 500000;
export const KAPPA_STATS_N = 200000;
