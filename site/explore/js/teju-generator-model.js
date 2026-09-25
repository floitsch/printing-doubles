// Copyright (C) 2026 Toit contributors.
//
// Pure computation for the "Break the multiplier" Tejú Jaguá page. No DOM.
//
// A BigInt port of Tejú Jaguá's generator (cpp/generator/generator.cpp) and
// runtime kernel (teju/src/teju.h) at https://github.com/cassioneri/teju_jagua
// (commit 4403283). All arithmetic is exact. The runtime takes an optional
// shift so the page can ask "what if the multiplier had fewer bits?".

// ---------------------------------------------------------------------------
// Formats (the repo's config/*.json).

export const FORMATS = {
  binary16: { id: "binary16", label: "binary16", W: 32, MW: 11, EMIN: -24, EMAX: 5, repo: "ieee16_with_uint128" },
  bfloat16: { id: "bfloat16", label: "bfloat16", W: 16, MW: 8, EMIN: -133, EMAX: 120, repo: "bfloat16" },
  binary32: { id: "binary32", label: "binary32", W: 32, MW: 24, EMIN: -149, EMAX: 104, repo: "ieee32_with_uint128" },
  binary64: { id: "binary64", label: "binary64", W: 64, MW: 53, EMIN: -1074, EMAX: 971, repo: "ieee64_with_uint128" },
};

// The made-up format of the first lab: 5-bit significands on 16-bit words.
// Only its row F = 6 (binary exponents 20..23) is used on the page.
export const TOY_FORMAT = { id: "toy", label: "toy", W: 16, MW: 5, EMIN: 0, EMAX: 23 };

export const mantissaMin = (fmt) => 1n << BigInt(fmt.MW - 1);
export const mantissaMax = (fmt) => (1n << BigInt(fmt.MW)) - 1n;

// ---------------------------------------------------------------------------
// Exponent bookkeeping (teju/src/common.h).

export function log10pow2(e) {
  return Number((1292913987n * BigInt(e)) >> 32n);
}

export function residual(e) {
  return Number(((1292913987n * BigInt(e)) & 0xffffffffn) / 1292913987n);
}

export const e0of = (e) => e - residual(e);

// 2^(e0-1) / 10^F in lowest terms, as the generator writes it.
export function alphaDelta(e0) {
  const f = log10pow2(e0);
  if (f <= 0) return { f, alpha: 5n ** BigInt(-f), delta: 1n << BigInt(-(e0 - 1 - f)) };
  return { f, alpha: 1n << BigInt(e0 - 1 - f), delta: 5n ** BigInt(f) };
}

// Rationals are [numerator, denominator] pairs with positive denominators.
export const cmpQ = (x, y) => {
  const l = x[0] * y[1], r = y[0] * x[1];
  return l < r ? -1 : l > r ? 1 : 0;
};
const maxQ = (x, y) => (cmpQ(x, y) < 0 ? y : x);

export function gcd(a, b) {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

// Boost's rational_t (used by the generator) keeps fractions in lowest terms.
export function reduceQ([p, q]) {
  const g = gcd(p, q);
  return g === 1n ? [p, q] : [p / g, q / g];
}

export function bitLength(x) {
  return x === 0n ? 0 : x.toString(2).length;
}

export function log2Big(x) {
  const b = bitLength(x);
  if (b <= 53) return Math.log2(Number(x));
  const s = b - 53;
  return Math.log2(Number(x >> BigInt(s))) + s;
}

export const log2Q = (q) => log2Big(q[0]) - log2Big(q[1]);

// ---------------------------------------------------------------------------
// The generator's maximiser (get_maximum_1 / get_maximum_2).
//
//   phi_1(n) = n / (delta - alpha n mod delta)
//   phi_2(n) = n / (1 + (alpha n - 1) mod delta)
//
// An optional `trace` array records one entry per call, so the page can show
// the recursion as a list of steps.

export const phi1 = (alpha, delta, n) => [n, delta - (alpha * n) % delta];
export const phi2 = (alpha, delta, n) => [n, 1n + (alpha * n - 1n) % delta];

export function getMaximum1(alpha, delta, L, U, trace = null, depth = 0) {
  const m1 = reduceQ(phi1(alpha, delta, U));
  const step = trace ? { depth, fn: 1, alpha, delta, L, U, endpoint: U, endpointValue: m1 } : null;
  if (step) trace.push(step);
  if (alpha === 0n || L === U) return m1;
  const L2 = (alpha * L) / delta + 1n, U2 = (alpha * U) / delta;
  if (L2 === U2 + 1n) return m1;
  const other = getMaximum2(delta % alpha, alpha, L2, U2, trace, depth + 1);
  const m2 = reduceQ([delta * other[0] - other[1], alpha * other[1]]);
  const best = maxQ(m1, m2);
  if (step) step.result = best;
  return best;
}

export function getMaximum2(alpha, delta, L, U, trace = null, depth = 0) {
  if (alpha === 0n) {
    if (trace) trace.push({ depth, fn: 2, alpha, delta, L, U, endpoint: U, endpointValue: [U, 1n] });
    return [U, 1n];
  }
  const m1 = reduceQ(phi2(alpha, delta, L));
  const step = trace ? { depth, fn: 2, alpha, delta, L, U, endpoint: L, endpointValue: m1 } : null;
  if (step) trace.push(step);
  if (L === U) return m1;
  const L1 = (alpha * L - 1n) / delta + 1n, U1 = (alpha * U - 1n) / delta;
  if (L1 === U1 + 1n) return m1;
  const other = getMaximum1(delta % alpha, alpha, L1, U1, trace, depth + 1);
  const m2 = reduceQ([delta * other[0] + other[1], alpha * other[1]]);
  const best = maxQ(m1, m2);
  if (step) step.result = best;
  return best;
}

// The n range the generator covers for a row, plus the "extras" it adds for
// the uncentred (power-of-two) case (generator_t::get_maximum).
export function rowDomain(fmt, isMin) {
  const mmin = mantissaMin(fmt), mmax = mantissaMax(fmt);
  const L = isMin ? 1n : 2n * mmin + 1n;
  const U = (4n * mmax) << 3n;
  const extras = [];
  for (let r = 0n; r < 4n; r++) {
    extras.push((4n * mmin - 1n) << r, (2n * mmin + 1n) << r, (4n * mmin) << r, (40n * mmin) << r);
  }
  return { L, U, extras };
}

export function worstOf(fmt, alpha, delta, isMin, trace = null) {
  const a = alpha % delta;
  const { L, U, extras } = rowDomain(fmt, isMin);
  let best = getMaximum1(a, delta, L, U, trace);
  for (const n of extras) best = maxQ(best, reduceQ(phi1(a, delta, n)));
  return best;
}

// Recover the n that attains a maximum value p/q (in lowest terms): n = p t
// and its gap is q t for some small integer t.
export function argmaxN(fmt, alpha, delta, isMin, max) {
  const a = alpha % delta;
  const { L, U, extras } = rowDomain(fmt, isMin);
  const [p, q] = max;
  for (let t = 1n; p * t <= U || t === 1n; t++) {
    const n = p * t;
    if (n >= L && n <= U && delta - (a * n) % delta === q * t) return n;
    if (t > 100000n) break;
  }
  for (const n of extras) if (cmpQ(reduceQ(phi1(a, delta, n)), max) === 0) return n;
  return null;
}

// M = floor(alpha 2^k / delta) + 1, and its excess eps = M delta - alpha 2^k.
export function fastMultiplier(alpha, delta, shift) {
  const K = BigInt(shift);
  const q = (alpha << K) / delta, r = (alpha << K) % delta;
  return { M: q + 1n, q, r, eps: delta - r };
}

// Does floor(n M / 2^k) equal floor(n alpha / delta)? Exact, for one n.
export function floorsAgree(n, alpha, delta, M, shift) {
  return (n * M) >> BigInt(shift) === (n * alpha) / delta;
}

// Prove one table row, exactly as get_fast_eaf_numerator does.
export function proveRow(fmt, e0, isMin, shift = 2 * fmt.W, trace = null) {
  const { f, alpha, delta } = alphaDelta(e0);
  const max = worstOf(fmt, alpha, delta, isMin, trace);
  const { M, eps } = fastMultiplier(alpha, delta, shift);
  const limit = [1n << BigInt(shift), eps];
  const ok = cmpQ(max, limit) < 0;
  const W = BigInt(fmt.W);
  return {
    f, e0, isMin, alpha, delta, M, eps, max, limit, ok, shift,
    upper: M >> W, lower: M & ((1n << W) - 1n),
    headroomBits: log2Q(limit) - log2Q(max),
  };
}

// The smallest shift k for which this row's proof would pass.
export function minimalShift(fmt, row) {
  for (let k = 1; k <= 4 * fmt.W + 64; k++) {
    const { eps } = fastMultiplier(row.alpha, row.delta, k);
    if (cmpQ(row.max, [1n << BigInt(k), eps]) < 0) return k;
  }
  return null;
}

export function rowExponents(fmt) {
  const out = [];
  const e0min = e0of(fmt.EMIN), e0max = e0of(fmt.EMAX);
  for (let e0 = e0min; e0 <= e0max; e0 = e0of(e0 + 4)) out.push(e0);
  return out;
}

// Static checks (generator_t::check_*).
export function checkCentred(fmt) { return 5 + fmt.MW <= fmt.W; }
export function checkUncentred(fmt) { return 4 + fmt.MW <= fmt.W; }
export function checkRefined(fmt) { return 8 + fmt.MW <= fmt.W; }
export function checkDiv10(fmt) {
  const k = BigInt(fmt.W), p2k = 1n << k;
  const a = p2k / 10n + 1n, eps = 10n - p2k % 10n;
  const U = ((a + eps - 1n) / eps) * 10n - 1n;
  const bMax = 16n * mantissaMax(fmt) + 8n;
  return { ok: eps <= a && bMax < U, bMax, U, multiplier: a };
}

// The generator's "sorted" test for one row: is a < b for the power of two?
export function sortedRow(fmt, M, shift = 2 * fmt.W) {
  const mmin = mantissaMin(fmt), K = BigInt(shift);
  const a = ((4n * mmin - 1n) * M) >> (K + 1n);
  const b = ((2n * mmin + 1n) * M) >> K;
  return a < b;
}

export function minverseTable(fmt) {
  const W = BigInt(fmt.W), p2 = 1n << W, mask = p2 - 1n;
  let inv5 = 1n;
  for (let i = 0; i < 8; i++) inv5 = (inv5 * (2n - 5n * inv5)) & mask; // Newton: 5 inv5 = 1 mod 2^W
  const bound = 320n * mantissaMax(fmt);
  const rows = [];
  let mult = 1n, p5 = 1n;
  for (let f = 0; p5 < bound; f++) {
    rows.push({ f, multiplier: mult, bound: p2 / p5 - (f === 0 ? 1n : 0n) });
    mult = (mult * inv5) & mask;
    p5 *= 5n;
  }
  return rows;
}

// The whole generator as a resumable iterator: yields one proved row at a
// time so a page can run it in slices. The final value carries the summary.
export function* generate(fmt, { shift = 2 * fmt.W } = {}) {
  const checks = [];
  const centred = checkCentred(fmt), uncentred = checkUncentred(fmt);
  checks.push({ id: "centred", label: `5 + ${fmt.MW} ≤ ${fmt.W}`, what: "centred operands (4m≪3) fit in a word", ok: centred });
  checks.push({ id: "uncentred", label: `4 + ${fmt.MW} ≤ ${fmt.W}`, what: "uncentred operands ((4m−1)≪3) fit in a word", ok: uncentred });
  if (!centred || !uncentred) {
    return { ok: false, stop: centred ? "Uncentred calculations could overflow." : "Centred calculations could overflow.", checks, rows: [] };
  }
  const div10 = checkDiv10(fmt);
  checks.push({ id: "div10", label: `b < ${div10.U}`, what: `div10 exact for every b ≤ ${div10.bMax} (16·mmax + 8)`, ok: div10.ok });
  if (!div10.ok) return { ok: false, stop: "Can't use the selected algorithm for div10.", checks, rows: [] };

  const rows = [];
  const e0s = rowExponents(fmt);
  const p2W = 1n << BigInt(fmt.W);
  let sorted = true;
  for (const e0 of e0s) {
    const row = proveRow(fmt, e0, e0 === e0s[0], shift);
    rows.push(row);
    if (!row.ok) {
      checks.push({ id: "rows", label: `row F = ${row.f}`, what: "exact floor for every n", ok: false });
      yield row;
      return { ok: false, stop: `Unable to use shift that is twice the width (row F = ${row.f}).`, checks, rows, failedRow: row };
    }
    sorted = sorted && sortedRow(fmt, row.M, shift);
    if (row.upper >= p2W) {
      checks.push({ id: "range", label: "upper < 2^W", what: "multiplier fits in two words", ok: false });
      yield row;
      return { ok: false, stop: "A multiplier is out of range.", checks, rows };
    }
    yield row;
  }
  checks.push({ id: "rows", label: `${rows.length} rows`, what: "exact floor proved for every n in every row", ok: true });
  checks.push({ id: "range", label: `upper < 2^${fmt.W}`, what: "every multiplier fits in two words", ok: true });
  const refined = checkRefined(fmt);
  checks.push({
    id: "sorted", label: `sorted = ${sorted ? 1 : 0}`,
    what: sorted ? "a < b for every power of two, so the refined branch never runs" : "some power of two has a ≥ b, so the refined branch (40m≪r) is live",
    ok: true,
  });
  checks.push({
    id: "refined", label: `8 + ${fmt.MW} ≤ ${fmt.W}`, what: sorted ? "refined operands (40m≪3) fit: not needed, sorted" : "refined operands (40m≪3) fit in a word",
    ok: sorted || refined, skipped: sorted,
  });
  if (!sorted && !refined) return { ok: false, stop: "Uncentred refined calculation could overflow.", checks, rows, sorted };
  const minverse = minverseTable(fmt);
  return { ok: true, checks, rows, sorted, minverse };
}

export function runGenerator(fmt, opts) {
  const it = generate(fmt, opts);
  for (;;) {
    const { value, done } = it.next();
    if (done) return value;
  }
}

// ---------------------------------------------------------------------------
// Emitting C (generator_t::generate_dot_c, little-endian, split 1).

export function hexWord(x, W) {
  return "0x" + x.toString(16).padStart(W / 4, "0");
}

export function emitMultiplierRow(row, W) {
  return `  { ${hexWord(row.lower, W)}, ${hexWord(row.upper, W)} }, // ${row.f}`;
}

export function emitMinverseRow(row, W) {
  return `  { ${hexWord(row.multiplier, W)}, ${hexWord(row.bound, W)} }, // ${row.f}`;
}

export function emitDefines(fmt) {
  const pad = (s) => s.padEnd(26);
  return [
    `#define ${pad("teju_width")}${fmt.W}u`,
    `#define ${pad("teju_exponent_min")}${fmt.EMIN}`,
    `#define ${pad("teju_mantissa_width")}${fmt.MW}u`,
    `#define ${pad("teju_storage_index_offset")}${log10pow2(fmt.EMIN)}`,
  ];
}

export function emitC(fmt, result) {
  const lines = [...emitDefines(fmt), "", "static const teju_multiplier_t multipliers[] = {"];
  for (const row of result.rows) lines.push(emitMultiplierRow(row, fmt.W));
  lines.push("};", "", `#define teju_calculation_sorted ${result.sorted ? 1 : 0}u`, "",
    "static struct {", "  teju_u1_t const multiplier;", "  teju_u1_t const bound;", "} const minverse[] = {");
  for (const row of result.minverse) lines.push(emitMinverseRow(row, fmt.W));
  lines.push("};", "", '#include "teju/src/teju.h"');
  return lines.join("\n");
}

// Rows copied from teju/src/generated/ieee64_with_uint128.c (commit 4403283).
export const PINNED_BINARY64 = [
  { f: -324, text: "{ 0x6c07a2c26a8346d2, 0x9e19db92b4e31ba9 }, // -324" },
  { f: -199, text: "{ 0xf6872d5667844e4a, 0x85c7056562757456 }, // -199" },
  { f: -17, text: "{ 0x0000000000000001, 0xb1a2bc2ec5000000 }, // -17" },
  { f: 7, text: "{ 0x3d32907604691b4d, 0xd6bf94d5e57a42bc }, // 7" },
  { f: 292, text: "{ 0x25e8e89c13bb0f7b, 0xff77b1fcbebcdc4f }, // 292" },
];
export const PINNED_MINVERSE = [
  { f: 1, text: "{ 0xcccccccccccccccd, 0x3333333333333333 }, // 1" },
  { f: 26, text: "{ 0x01c445d3a8cc9189, 0x000000000000000c }, // 26" },
];

// ---------------------------------------------------------------------------
// The runtime kernel (teju.h), parameterised by the shift so the page can
// run it with too-short multipliers. `table` maps F to M. `hook(n, kind)` is
// called for every multiply-and-shift operand.

export function buildTable(fmt, shift = 2 * fmt.W) {
  const table = new Map();
  let sorted = true;
  for (const e0 of rowExponents(fmt)) {
    const { f, alpha, delta } = alphaDelta(e0);
    const { M } = fastMultiplier(alpha, delta, shift);
    table.set(f, M);
    sorted = sorted && sortedRow(fmt, M, shift);
  }
  return { table, sorted, shift, minverse: minverseTable(fmt) };
}

export function toDecimal(fmt, rt, e, m, hook = null) {
  const W = BigInt(fmt.W), MASK = (1n << W) - 1n, K = BigInt(rt.shift);
  const MMIN = mantissaMin(fmt);
  const MINV = rt.minverse;
  m = BigInt(m);
  const out = { e, m };
  const mshift = (n, M, kind) => { if (hook) hook(n, kind); return (n * M) >> K; };
  const canPow5 = (f) => f >= 0 && f < MINV.length;
  const isTie = (f, n) => canPow5(f) && ((n * MINV[f].multiplier) & MASK) <= MINV[f].bound;
  const isTieUnc = (f, n) => n % 5n === 0n && isTie(f, n);
  const even = (n) => n % 2n === 0n;
  const done = (route, c, f, strip) => {
    let [cc, ff] = [c, f];
    if (strip) [cc, ff] = removeTrailingZeros(fmt, ff, cc);
    return Object.assign(out, { route, c: cc, f: ff });
  };

  if (e <= 0 && -e < fmt.MW && ((m >> BigInt(-e)) << BigInt(-e)) === m) {
    return done("small-integer", m >> BigInt(-e), 0, true);
  }
  const f = log10pow2(e), r = BigInt(residual(e)), M = rt.table.get(f);
  Object.assign(out, { F: f, r: Number(r), M });
  if (m !== MMIN || e === fmt.EMIN) {
    const mb = (2n * m + 1n) << r, ma = (2n * m - 1n) << r;
    const b = mshift(mb, M, "m_b"), a = mshift(ma, M, "m_a");
    const q = b / 10n, s = 10n * q;
    Object.assign(out, { mb, ma, a, b, s });
    const shortest = canPow5(f)
      ? (s === b ? !isTie(f, mb) || even(m) : s === a ? isTie(f, ma) && even(m) : s > a)
      : s > a;
    if (shortest) return done("centred-shortest", q, f + 1, true);
    const mc = (4n * m) << r;
    const c2 = mshift(mc, M, "m_c"), c = c2 / 2n;
    const pickLeft = (isTie(-f, c2) && even(c)) || even(c2);
    Object.assign(out, { mc, c2 });
    return done("centred-closest", c + (pickLeft ? 0n : 1n), f, false);
  }
  const ma = (4n * m - 1n) << r, mb = (2n * m + 1n) << r;
  const b = mshift(mb, M, "m_b"), a = mshift(ma, M, "m_a") / 2n;
  const q = b / 10n, s = 10n * q;
  Object.assign(out, { mb, ma, a, b, s });
  if (rt.sorted || a < b) {
    const shortest = canPow5(f)
      ? (s === b ? !isTieUnc(f, mb) || even(m) : s === a ? isTieUnc(f, ma) && even(m) : s > a)
      : s > a;
    if (shortest) return done("uncentred-shortest", q, f + 1, true);
    const c2 = (M << BigInt(fmt.MW + Number(r) + 1)) >> K; // mshift_pow2: no multiply
    const c = c2 / 2n;
    out.c2 = c2;
    if (c === a && !isTieUnc(f, ma)) return done("uncentred-c-equals-a", c + 1n, f, false);
    const pickLeft = (isTie(-f, c2) && even(c)) || even(c2);
    return done("uncentred-closest", c + (pickLeft ? 0n : 1n), f, false);
  }
  if (isTieUnc(f, ma) && even(m)) return done("uncentred-refined-tie", a, f, true);
  const mc = (40n * m) << r;
  const c2 = mshift(mc, M, "m_c refined"), c = c2 / 2n;
  const pickLeft = (isTie(-f, c2) && even(c)) || even(c2);
  out.c2 = c2;
  return done("uncentred-refined", c + (pickLeft ? 0n : 1n), f - 1, false);
}

export function removeTrailingZeros(fmt, f, m) {
  const W = BigInt(fmt.W), MASK = (1n << W) - 1n;
  const minv5 = (0n - MASK / 5n) & MASK, bound = MASK / 10n + 1n;
  for (;;) {
    const p = (m * minv5) & MASK;
    const q = ((p << (W - 1n)) | (p >> 1n)) & MASK;
    if (q >= bound) return [m, f];
    f++;
    m = q;
  }
}

export function normalize(c, f) {
  while (c !== 0n && c % 10n === 0n) { c /= 10n; f++; }
  return [c, f];
}

export function formatDecimal(c, f) {
  [c, f] = normalize(c, f);
  const d = c.toString();
  if (d.length === 1) return `${d}e${f}`;
  return `${d[0]}.${d.slice(1)}e${f + d.length - 1}`;
}

// Every positive finite value of a (small) format, as (e, m) pairs.
export function* allValues(fmt) {
  const mmin = mantissaMin(fmt), mmax = mantissaMax(fmt);
  for (let e = fmt.EMIN; e <= fmt.EMAX; e++) {
    for (let m = e === fmt.EMIN ? 1n : mmin; m <= mmax; m++) yield [e, m];
  }
}

// ---------------------------------------------------------------------------
// Lab rows: every n the generator checks for one row, with its gap.

// The two rows used by the "break it" lab.
export const LAB_ROWS = {
  toy: { id: "toy", fmt: TOY_FORMAT, e0: 20, realShift: 32, kMin: 8, kMax: 34 },
  b16: { id: "b16", fmt: FORMATS.binary16, e0: -26, realShift: 64, kMin: 14, kMax: 64 },
};

// Which n does the runtime really feed to mshift for this row? Found by
// running the kernel over every value whose exponent uses the row.
export function rowOperands(fmt, e0) {
  const rt = buildTable(fmt);
  const used = new Map(); // n -> [{ e, m, kind }]
  const mmin = mantissaMin(fmt), mmax = mantissaMax(fmt);
  for (let e = Math.max(e0, fmt.EMIN); e <= fmt.EMAX && e0of(e) === e0; e++) {
    for (let m = e === fmt.EMIN ? 1n : mmin; m <= mmax; m++) {
      toDecimal(fmt, rt, e, m, (n, kind) => {
        if (!used.has(n)) used.set(n, []);
        used.get(n).push({ e, m, kind });
      });
    }
  }
  return used;
}

export function labRow(id) {
  const spec = LAB_ROWS[id];
  const { fmt, e0 } = spec;
  const isMin = e0 === e0of(fmt.EMIN);
  const { f, alpha, delta } = alphaDelta(e0);
  const a = alpha % delta;
  const { L, U, extras } = rowDomain(fmt, isMin);
  const ns = [];
  for (let n = L; n <= U; n++) ns.push(n);
  for (const n of extras) if (n < L || n > U) ns.push(n);
  const count = ns.length;
  const n = new Float64Array(count), gap = new Float64Array(count);
  const big = new Array(count), gapBig = new Array(count);
  const used = rowOperands(fmt, e0);
  const usedFlag = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const x = ns[i];
    const g = delta - (a * x) % delta;
    big[i] = x; gapBig[i] = g;
    n[i] = Number(x); gap[i] = Number(g);
    usedFlag[i] = used.has(x) ? 1 : 0;
  }
  return { ...spec, isMin, f, alpha, delta, L, U, extras, count, n, gap, big, gapBig, used, usedFlag };
}

// Indices of the n whose floor is wrong with shift k: n eps >= 2^k gap.
export function labFailures(row, k) {
  const { eps, M } = fastMultiplier(row.alpha, row.delta, k);
  const K = BigInt(k);
  const out = [];
  // Cheap float prefilter, exact check near the line.
  const logLimit = k - Math.log2(Number(eps));
  for (let i = 0; i < row.count; i++) {
    const lhs = Math.log2(row.n[i]) - Math.log2(row.gap[i]);
    if (lhs < logLimit - 1e-6) continue;
    if (row.big[i] * eps >= row.gapBig[i] << K) out.push(i);
  }
  return { failures: out, eps, M };
}

// Record holders of phi(n) = n / gap(n) over the lab row's main range.
export function records(row) {
  const out = [];
  let best = [0n, 1n];
  for (let i = 0; i < row.count; i++) {
    const x = row.big[i];
    if (x < row.L || x > row.U) continue;
    const v = [x, row.gapBig[i]];
    if (cmpQ(v, best) > 0) { best = v; out.push({ n: x, gap: row.gapBig[i] }); }
  }
  return out;
}

// Brute-force maximum of phi over everything the generator checks.
export function bruteMaximum(row) {
  let best = [0n, 1n], arg = null;
  for (let i = 0; i < row.count; i++) {
    const v = [row.big[i], row.gapBig[i]];
    if (cmpQ(v, best) > 0) { best = v; arg = row.big[i]; }
  }
  return { max: best, n: arg };
}

export function continuedFraction(p, q) {
  const out = [];
  while (q !== 0n) { out.push(p / q); [p, q] = [q, p % q]; }
  return out;
}

// All conversions of a format under shift k, compared with the proven table.
export function conversionsWrong(fmt, k, reference = null) {
  const rt = buildTable(fmt, k);
  const ref = reference || buildTable(fmt);
  let wrong = 0, total = 0;
  const examples = [];
  for (const [e, m] of allValues(fmt)) {
    total++;
    const got = toDecimal(fmt, rt, e, m), want = toDecimal(fmt, ref, e, m);
    const [gc, gf] = normalize(got.c, got.f), [wc, wf] = normalize(want.c, want.f);
    if (gc !== wc || gf !== wf) {
      wrong++;
      if (examples.length < 8) examples.push({ e, m, got, want });
    }
  }
  return { wrong, total, examples };
}

// Proof status of every row of a format at shift k.
export function proofAtShift(fmt, k) {
  const e0s = rowExponents(fmt);
  const failing = [];
  for (const e0 of e0s) {
    const row = proveRow(fmt, e0, e0 === e0s[0], k);
    if (!row.ok) failing.push(row.f);
  }
  return { rows: e0s.length, failing };
}

// ---------------------------------------------------------------------------
// Presentation helpers.

export function shortBig(x, keep = 6) {
  const s = x.toString();
  if (s.length <= 2 * keep + 3) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)} (${s.length} digits)`;
}

export function powerName(x) {
  // "2^40" or "5^17" when x is a pure power of 2 or 5, else null.
  if (x > 0n && (x & (x - 1n)) === 0n) return `2^${bitLength(x) - 1}`;
  let k = 0, y = x;
  while (y > 1n && y % 5n === 0n) { y /= 5n; k++; }
  return y === 1n && k > 0 ? `5^${k}` : null;
}

export function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
