// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  row, proveRow, stairCounts, stairOf, log10pow2, residual, rulerArithmetic, e0OfF, MINVERSE,
  isMultipleOfPow5, mulMod64, div10, removeTrailingZeros, run, decode, scaled, floorR, fmtR,
  decadeView, clockMul, clockRor, CLOCK_BOUND5, CLOCK_BOUND10, PRESETS, parseInput, formatJs,
  F_MIN, F_MAX, EMIN, EMAX, MMAX, MASK, INV5, mshift,
} from "../site/explore/js/teju-ruler-model.js";
import { fromBits } from "../site/js/float.js";

const pow10 = (k) => 10n ** BigInt(k);

// Deterministic PRNG so failures are reproducible.
function rng(seed) {
  let s = BigInt(seed) & MASK;
  return () => {
    s ^= (s << 13n) & MASK; s ^= s >> 7n; s ^= (s << 17n) & MASK;
    return s;
  };
}

test("the table matches every row of teju/src/generated/ieee64_with_uint128.c", () => {
  const lines = [];
  for (let F = F_MIN; F <= F_MAX; F++) lines.push(`${F}:${row(F).M.toString(16).padStart(32, "0")}`);
  assert.equal(lines.length, 617);
  // SHA-256 of the 617 rows extracted from the published C file (commit 4403283).
  const hash = createHash("sha256").update(lines.join("\n")).digest("hex");
  assert.equal(hash, "0afb11ee20fd4af0b878c1102677a030d47bc2a99d66e14f005f678cd51148a2");
  assert.equal(row(-324).M, 0x9e19db92b4e31ba96c07a2c26a8346d2n);
  assert.equal(row(-199).M, 0x85c7056562757456f6872d5667844e4an);
  assert.equal(row(7).M, 0xd6bf94d5e57a42bc3d32907604691b4dn);
  assert.equal(row(292).M, 0xff77b1fcbebcdc4f25e8e89c13bb0f7bn);
  // F = −17: 2^(e0−1)/10^F is dyadic, so M is exactly 5^17 · 2^88 + 1.
  assert.equal(row(-17).M, 5n ** 17n * 2n ** 88n + 1n);
});

test("every row is proven exact; the tightest margin is 3.71 bits at F = −199", () => {
  let min = Infinity, minF = null;
  const margins = [];
  for (let F = F_MIN; F <= F_MAX; F++) {
    const p = proveRow(F);
    assert.ok(p.ok, `row ${F}`);
    margins.push(p.marginBits);
    if (p.marginBits < min) { min = p.marginBits; minF = F; }
  }
  assert.equal(minF, -199);
  assert.equal(min.toFixed(2), "3.71");
  margins.sort((a, b) => a - b);
  assert.ok(margins[308] > 13.5 && margins[308] < 14.5, `median ${margins[308]}`);
});

test("F = (1292913987·e) >> 32 is the exact ⌊e·log10 2⌋ and r ∈ {0..3}", () => {
  for (let e = EMIN; e <= EMAX; e++) {
    const F = log10pow2(e);
    const p2 = e >= 0 ? { n: 1n << BigInt(e), d: 1n } : { n: 1n, d: 1n << BigInt(-e) };
    const tenF = F >= 0 ? { n: pow10(F), d: 1n } : { n: 1n, d: pow10(-F) };
    const tenF1 = F + 1 >= 0 ? { n: pow10(F + 1), d: 1n } : { n: 1n, d: pow10(-F - 1) };
    assert.ok(tenF.n * p2.d <= p2.n * tenF.d, `10^F <= 2^e at ${e}`);
    assert.ok(p2.n * tenF1.d < tenF1.n * p2.d, `2^e < 10^(F+1) at ${e}`);
    const r = residual(e);
    assert.ok(r >= 0 && r <= 3);
    assert.equal(e - r, e0OfF(F), `e0 at ${e}`);
    const ar = rulerArithmetic(e);
    assert.equal(ar.product, BigInt(ar.F) * 2n ** 32n + ar.low);
  }
  assert.deepEqual(stairCounts(), { 3: 418, 4: 199 });
  assert.deepEqual(stairOf(-17).exps, [-56, -55, -54]);
  assert.deepEqual([residual(-8), log10pow2(-8)], [1, -3]);
});

test("minverse: 27 rows of (5^−f mod 2^64, ⌊2^64/5^f⌋) and a correct divisibility test", () => {
  assert.equal(MINVERSE.length, 27);
  assert.equal(INV5 * 5n & MASK, 1n);
  for (const r of MINVERSE) assert.equal(mulMod64(r.multiplier, r.pow5), 1n);
  assert.equal(MINVERSE[7].multiplier, 0xe5032477ae8d46a5n);
  assert.equal(MINVERSE[7].bound, 0x0000d6bf94d5e57an);
  assert.equal(MINVERSE[26].multiplier, 0x01c445d3a8cc9189n);
  assert.equal(MINVERSE[26].bound, 0xcn);
  assert.equal(MINVERSE[0].bound, MASK);
  assert.ok(5n ** 27n >= 320n * MMAX && 5n ** 26n < 320n * MMAX);
  const next = rng(12345);
  for (let i = 0; i < 20000; i++) {
    const f = Number(next() % 27n);
    let n = next() % (320n * MMAX);
    if (i % 3 === 0) n = (n / MINVERSE[f].pow5) * MINVERSE[f].pow5;
    assert.equal(isMultipleOfPow5(f, n), n % MINVERSE[f].pow5 === 0n, `f=${f} n=${n}`);
  }
});

test("div10 and remove_trailing_zeros", () => {
  const next = rng(99);
  const limit = 16n * MMAX + 8n;
  for (let i = 0; i < 20000; i++) {
    const n = next() % limit;
    assert.equal(div10(n), n / 10n);
  }
  for (const n of [0n, 9n, 10n, limit - 1n]) assert.equal(div10(n), n / 10n);
  const z = removeTrailingZeros(-16, 10n ** 15n);
  assert.deepEqual([z.c, z.f, z.iterations.length], [1n, -1, 16]);
  const w = removeTrailingZeros(0, 1230n);
  assert.deepEqual([w.c, w.f], [123n, 1]);
});

function exactFloors(t) {
  // The generator's promise: a, b (and c2) are the exact floors.
  assert.equal(t.b, floorR(t.upperR), `b of ${t.x}`);
  assert.equal(t.a, floorR(t.lowerR), `a of ${t.x}`);
  if (t.c2 !== undefined) {
    const G = t.route === "unc-refined" ? t.F - 1 : t.F;
    const twoX = scaled(2n * decode(t.x).m, t.e, G);
    assert.equal(t.c2, floorR(twoX), `c2 of ${t.x}`);
    // is_tie(−f, c2) is exactly "2x / 10^G is the integer c2" when c2 is odd.
    if (t.c2 % 2n === 1n && t.tieC !== undefined) assert.equal(t.tieC, twoX.n % twoX.d === 0n, `midpoint ${t.x}`);
  }
}

function check(x) {
  const t = run(x);
  assert.ok(t.match, `digits of ${x}: ${t.text} vs ${t.js}`);
  assert.equal(t.text, String(x), `text of ${x}`);
  if (t.route !== "small-int") exactFloors(t);
  return t;
}

test("matches Number#toString on all powers of two", () => {
  const routes = {};
  for (let k = -1074; k <= 1023; k++) {
    const t = check(2 ** k);
    routes[t.route] = (routes[t.route] || 0) + 1;
  }
  assert.equal(routes["unc-refined"], 33);
  assert.equal(routes["small-int"], 53);
  assert.equal(run(2 ** 56).route, "unc-c-eq-a");
});

test("matches Number#toString on random doubles (bit patterns, subnormals, decimals)", () => {
  const next = rng(20260925);
  for (let i = 0; i < 60000; i++) {
    const bits = next() & 0x7fffffffffffffffn;
    const x = fromBits(bits);
    if (!Number.isFinite(x) || x === 0) continue;
    check(x);
  }
  for (let i = 0; i < 5000; i++) check(fromBits(next() & 0x000fffffffffffffn) || 5e-324);
  for (let i = 1; i < 3000; i++) { check(i / 1000); check(i * 1e-310); check(i * 1e20); }
  for (const x of [Number.MAX_VALUE, Number.MIN_VALUE, 2.2250738585072014e-308, 2 ** -1022, 1e21, 1e22, 1e23, 9007199254740993, 0.3]) check(x);
});

test("preset routes and the numbers quoted on the page", () => {
  const want = {
    "0.1": "centred-shortest", "0.30000000000000004": "centred-closest", "2/3": "centred-closest",
    "5e-324": "centred-closest", "1e23": "centred-shortest", "2^60": "unc-shortest", "2^53": "unc-closest",
    "2^-1011": "unc-refined", "123": "small-int",
  };
  for (const p of PRESETS) {
    const t = run(parseInput(p.text).value);
    assert.equal(t.route, want[p.label], p.label);
    assert.ok(t.match, p.label);
  }
  const a = run(0.1);
  assert.deepEqual([a.F, a.r, a.a, a.b, a.s], [-17, 0, 9999999999999999n, 10000000000000001n, 10n ** 16n]);
  assert.equal(fmtR(a.lowerR), "9999999999999999.861…");
  assert.equal(fmtR(a.upperR), "10000000000000001.249…");
  assert.equal(a.rtz.iterations.length, 16);

  const b = run(0.1 + 0.2);
  assert.deepEqual([b.F, b.r, b.a, b.b, b.s, b.c2], [-17, 2, 30000000000000001n, 30000000000000007n, 30000000000000000n, 60000000000000008n]);

  const c = run(5e-324);
  assert.deepEqual([c.F, c.r, c.mb, c.ma, c.a, c.b, c.s, c.c2, c.result.c], [-324, 2, 12n, 4n, 2n, 7n, 0n, 9n, 5n]);

  const d = run(1e23);
  assert.equal(d.m, 5960464477539062n);
  assert.equal(d.mb, 5n ** 23n);
  assert.deepEqual([d.F, d.sCase, d.tieB, d.closed], [7, "b", true, true]);
  assert.equal(mulMod64(d.mb, MINVERSE[7].multiplier), 152587890625n);
  assert.equal(MINVERSE[7].bound, 236118324143482n);
  assert.equal(d.text, "1e+23");

  const e = run(2 ** -1011);
  assert.deepEqual([e.F, e.a, e.b, e.result.c, e.result.f], [-320, 4556951262222748n, 4556951262222748n, 45569512622227484n, -321]);
  assert.equal(e.text, "4.5569512622227484e-305");

  const f = run(2 / 3);
  assert.deepEqual([f.F, f.a, f.b, f.c2], [-16, 6666666666666665n, 6666666666666666n, 13333333333333332n]);
  const g = run(2 ** 60);
  assert.deepEqual([g.F, g.r, g.s], [2, 1, 11529215046068470n]);
});

test("Tejú's ruler: 1 ≤ width < 10 ticks, ≥ 1 tick and ≤ 1 long tick (centred)", () => {
  const next = rng(7);
  for (let i = 0; i < 3000; i++) {
    const x = fromBits(next() & 0x7fefffffffffffffn) || 1;
    const { e } = decode(x);
    const v = decadeView(x, log10pow2(e));
    if (!v.centred) continue;
    assert.ok(v.ticks >= 1n && v.ticks <= 10n, `ticks ${x}`);
    assert.ok(v.longTicks <= 1n, `long ${x}`);
  }
  assert.equal(decadeView(2 ** -1011, -320).ticks, 0n);
  assert.equal(decadeView(2 / 3, -15).ticks, 0n);
});

test("8-bit clock: ×205 sends multiples of 5 to 0..51, ror sends multiples of 10 below 26", () => {
  for (let n = 0; n < 256; n++) {
    const p = clockMul(n), q = clockRor(p);
    assert.equal(p <= CLOCK_BOUND5, n % 5 === 0, `n=${n}`);
    if (n % 5 === 0) assert.equal(p, n / 5);
    assert.equal(q < CLOCK_BOUND10, n % 10 === 0, `n=${n}`);
    if (n % 10 === 0) assert.equal(q, n / 10);
  }
  assert.deepEqual([clockMul(30), clockRor(clockMul(30)), clockRor(clockMul(15)), clockMul(37)], [6, 3, 129, 161]);
});

test("the stair diagram's top word is the exact floor for every exponent", () => {
  const m = 0x1199999999999an;
  for (let e = EMIN; e <= EMAX; e++) {
    const F = log10pow2(e), r = BigInt(residual(e));
    assert.equal(mshift((2n * m + 1n) << r, row(F).M), floorR(scaled(2n * m + 1n, e - 1, F)), `e=${e}`);
  }
});

test("input parsing and formatting", () => {
  assert.equal(parseInput("0.1+0.2").value, 0.30000000000000004);
  assert.equal(parseInput("2^-1011").value, 2 ** -1011);
  assert.equal(parseInput("2/3").value, 2 / 3);
  assert.equal(parseInput("-1.5").value, 1.5);
  assert.ok(parseInput("0").error);
  assert.ok(parseInput("1e400").error);
  assert.ok(parseInput("abc").error);
  assert.equal(formatJs(1n, 23), "1e+23");
  assert.equal(formatJs(12345n, 16), "123450000000000000000");
  assert.equal(formatJs(1n, -7), "1e-7");
  assert.equal(formatJs(1n, -6), "0.000001");
});
