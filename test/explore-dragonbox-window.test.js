// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import { fromBits } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";
import * as M from "../site/explore/js/dragonbox-window-model.js";

// Shortest digits as printed by the JS engine (Number.prototype.toString).
function engineDigits(x) {
  const t = String(x);
  let [m, ex] = t.split("e");
  ex = ex ? parseInt(ex, 10) : 0;
  const [a, b = ""] = m.split(".");
  let d = (a + b).replace(/^0+/, "");
  let e10 = ex - b.length;
  while (d.endsWith("0")) { d = d.slice(0, -1); e10++; }
  return [BigInt(d), e10];
}

function assertShortest(x) {
  const r = M.toDecimal(x);
  const [d, e] = engineDigits(x);
  assert.equal(r.significand, d, `digits of ${x}`);
  assert.equal(r.exponent, e, `exponent of ${x}`);
}

test("port of compute_nearest matches the engine's shortest output", () => {
  const rand = M.mulberry32(12345);
  for (let i = 0; i < 100000; i++) assertShortest(M.randomDouble(rand));
  // Every power of two (the shorter-interval case) and its neighbours.
  for (let E = 1n; E < 2047n; E++) {
    assertShortest(fromBits(E << 52n));
    assertShortest(fromBits((E << 52n) + 1n));
    assertShortest(fromBits((E << 52n) - 1n));
  }
  for (let n = 1; n < 3000; n++) assertShortest(n * Number.MIN_VALUE);
  for (let i = 1; i < 20000; i++) { assertShortest(i); assertShortest(i / 1000); assertShortest(1 / i); }
});

test("port agrees with the exact oracle", () => {
  const rand = M.mulberry32(777);
  for (let i = 0; i < 1500; i++) {
    const x = M.randomDouble(rand);
    const r = M.toDecimal(x);
    const o = shortestDecimal(x);
    assert.equal(r.significand, o.coefficient, String(x));
    assert.equal(r.exponent, o.exponent, String(x));
  }
});

test("cache entries equal the table in dragonbox.h", () => {
  const entry = (k) => { const c = M.get_cache(k); return [M.hex64(c >> 64n), M.hex64(c & M.M64)]; };
  assert.deepEqual(entry(-292), ["0xff77b1fcbebcdc4f", "0x25e8e89c13bb0f7b"]);
  assert.deepEqual(entry(-291), ["0x9faacf3df73609b1", "0x77b191618c54e9ad"]);
  assert.deepEqual(entry(19), ["0x8ac7230489e80000", "0x0000000000000000"]);
  assert.deepEqual(entry(326), ["0xf70867153aa2db38", "0xb8cbee4fc66d1ea8"]);
  assert.equal(M.FULL_CACHE_ENTRIES, 619);
  assert.equal(M.FULL_CACHE_BYTES, 9904);
  assert.equal(M.COMPACT_CACHE_ENTRIES, 23);
  assert.equal(M.COMPACT_CACHE_BYTES, 584);
  for (let k = M.MIN_K; k <= M.MAX_K; k++) {
    const diff = M.compact_cache(k).cache - M.get_cache(k);
    assert.ok(diff >= 0n && diff <= 2n, `compact entry ${k} off by ${diff}`);
  }
});

test("preset numbers shown on the page", () => {
  const w = (x) => M.windowModel(x);
  const a = w(0.1);
  assert.equal(a.k, 19); assert.equal(a.decoded.e, -56);
  assert.equal(a.zi, 1000000000000000124n); assert.equal(a.deltai, 138n); assert.equal(a.r, 124n);
  assert.equal(M.ratFixed(a.xs), "999999999999999986.12");
  assert.equal(M.ratFixed(a.zs), "1000000000000000124.90");
  assert.equal(M.ratFixed(a.deltas), "138.77");
  assert.equal(a.result.path, "big"); assert.equal(a.result.removed, 15); assert.equal(a.text, "0.1");

  const b = w(2 / 3);
  assert.equal(b.r, 685n); assert.equal(b.deltai, 111n); assert.equal(b.result.dist, 680n);
  assert.equal(b.result.significand, 6666666666666666n); assert.equal(b.result.exponent, -16);
  assert.equal(M.ratFixed(b.ys), "666666666666666629.65");

  const c = w(5e-324);
  assert.equal(c.k, 326); assert.equal(c.zi, 741n); assert.equal(c.deltai, 494n);
  assert.equal(c.result.dist, 544n); assert.equal(c.result.significand, 5n); assert.equal(c.result.exponent, -324);
  assert.equal(M.ratFixed(c.xs), "247.03"); assert.equal(M.ratFixed(c.ys), "494.06"); assert.equal(M.ratFixed(c.zs), "741.09");
  for (const s of ["3e-324", "4e-324", "5e-324", "6e-324", "7e-324"]) assert.equal(Number(s), 5e-324, s);
  assert.equal(Number("2e-324"), 0); assert.equal(Number("8e-324"), 1e-323);

  const pi = w(Math.PI);
  assert.equal(pi.r, 338n); assert.equal(pi.deltai, 444n); assert.equal(pi.result.path, "big");
  const p3 = w(0.3);
  assert.equal(p3.r, 166n); assert.equal(p3.deltai, 555n); assert.equal(p3.text, "0.3");
  const mx = w(Number.MAX_VALUE);
  assert.equal(mx.r, 807n); assert.equal(mx.deltai, 199n); assert.equal(mx.result.dist, 758n);
  assert.equal(mx.result.significand, 17976931348623157n); assert.equal(mx.result.exponent, 292);
  const q = w(123.456);
  assert.equal(q.r, 101n); assert.equal(q.deltai, 142n); assert.equal(q.result.significand, 123456n);

  // Rare cases.
  const f1 = w(0.00093);
  assert.equal(f1.r, 108n); assert.equal(f1.deltai, 108n); assert.equal(f1.result.reason, "eq");
  assert.deepEqual(f1.result.x_result, { parity: true, is_integer: false });
  assert.equal(M.ratFixed(f1.xs), "929999999999999999.84");
  assert.equal(f1.text, "0.00093");
  const f2 = w(0.0013800000000000002);
  assert.equal(f2.r, 258n); assert.equal(f2.deltai, 216n); assert.equal(f2.result.dist, 200n);
  assert.equal(f2.result.divisible, true); assert.equal(f2.result.approx_y_parity, false);
  assert.deepEqual(f2.result.y_result, { parity: false, is_integer: false });
  assert.equal(M.ratFixed(f2.ys), "1380000000000000150.15");
  assert.equal(f2.result.significand, 13800000000000002n); assert.equal(f2.result.exponent, -19);
  const f3 = w(18014398509481988);
  assert.equal(f3.r, 0n); assert.equal(f3.result.z_result.is_integer, true); assert.equal(f3.decoded.closed, false);
  assert.equal(f3.result.reason, "excluded"); assert.equal(f3.result.significand, 18014398509481988n);
  assert.equal(f3.candidate, -200);

  // Shorter interval.
  const one = w(1);
  assert.equal(one.k, 16); assert.equal(one.result.path, "shorter-big");
  assert.equal(M.ratFixed(one.xs, 3), "9999999999999999.444"); assert.equal(M.ratFixed(one.zs, 3), "10000000000000001.110");
  const p53 = w(2 ** 53);
  assert.equal(p53.k, 0); assert.equal(p53.result.path, "shorter-small");
  assert.equal(M.ratFixed(p53.xs, 1), "9007199254740991.5"); assert.equal(p53.result.zi, 9007199254740993n);
  assert.equal(p53.result.significand, 9007199254740992n);
  const p64 = w(2 ** 64);
  assert.equal(p64.k, -3); assert.equal(p64.result.path, "shorter-small");
  assert.equal(M.ratFixed(p64.xs, 3), "18446744073709550.592");
  assert.equal(M.ratFixed(p64.zs, 3), "18446744073709553.664");
  assert.equal(p64.result.significand, 18446744073709552n); assert.equal(p64.result.exponent, 3);
  // A symmetric interval would admit 18446744073709550000, which reads back as the predecessor.
  assert.equal(Number("18446744073709550000"), 2 ** 64 - 2048);
  assert.equal(M.ratFixed(M.windowModel(2 ** 64).lower, 0), "18446744073709550592");
});

test("192-bit product of 0.1", () => {
  const p = M.productLimbs(0.1);
  assert.equal(M.hex64(p.cacheHigh), "0x8ac7230489e80000");
  assert.equal(p.cacheLow, 0n);
  assert.equal(M.hex64(p.u), "0x1999999999999a80");
  assert.equal(p.beta, 7);
  assert.equal(p.top, 1000000000000000124n);
  assert.equal(M.hex64(p.middle), "0xe66c50e284000000");
  assert.equal(p.deltai, 138n);
});

test("kappa knob for 0.1", () => {
  const v = [0, 1, 2, 3].map((k) => M.kappaView(0.1, k));
  assert.equal(v[0].zi, 10000000000000001n); assert.equal(v[0].deltai, 1n); assert.equal(v[0].cat, "eq");
  assert.equal(v[1].r, 12n); assert.equal(v[1].deltai, 13n); assert.equal(v[1].cat, "lt");
  assert.equal(v[2].r, 124n); assert.equal(v[2].deltai, 138n);
  assert.deepEqual(v.map((x) => x.worstBits), [57, 60, 63, 67]);
  // kappa = 2 in exact arithmetic agrees with the algorithm.
  const rand = M.mulberry32(99);
  for (let i = 0; i < 3000; i++) {
    const x = M.randomDouble(rand);
    if (M.decode(x).shorter) continue;
    const kv = M.kappaView(x, 2);
    const r = M.compute_nearest(x);
    assert.equal(kv.zi, r.z_result.integer_part);
    assert.equal(kv.deltai, r.deltai);
    assert.equal(kv.coarseInside, r.path === "big");
  }
});

test("frequency constants are reproducible", () => {
  assert.deepEqual(M.branchStats(M.BRANCH_STATS_N, M.STATS_SEED), M.BRANCH_STATS);
  assert.deepEqual(M.kappaStats(M.KAPPA_STATS_N, M.STATS_SEED), M.KAPPA_STATS);
});

test("branchless trailing-zero removal equals the loop", () => {
  const rand = M.mulberry32(5);
  for (let i = 0; i < 20000; i++) {
    const base = BigInt(Math.floor(rand() * 1e6)) + 1n;
    const zeros = Math.floor(rand() * 11);
    let s = base * 10n ** BigInt(zeros);
    if (s >= 10n ** 16n) s = base;
    const a = M.removeTrailingZerosLoop(s), b = M.removeTrailingZerosBranchless(s);
    assert.equal(b.significand, a.significand); assert.equal(b.removed, a.removed);
  }
  assert.equal(M.removeTrailingZerosBranchless(10n ** 15n).removed, 15);
});

test("the stepper's source covers every traced line", () => {
  const ids = M.SOURCE.map(([id]) => id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  const seen = new Set();
  for (const x of [0.1, 2 / 3, 0.00093, 0.0013800000000000002, 18014398509481988, 1, 2 ** 53, 5e-324, 7e22, 1e23, 0.00048923492431640625]) {
    for (const step of M.compute_nearest(x).steps) {
      assert.ok(M.SOURCE_INDEX.has(step.id), step.id);
      seen.add(step.id);
    }
  }
  assert.ok(seen.has("tie_dec"), "exact tie example reaches the tie line");
});

test("compact cache gives identical output", () => {
  const rand = M.mulberry32(4242);
  for (let i = 0; i < 20000; i++) {
    const x = M.randomDouble(rand);
    assert.deepEqual(M.toDecimal(x, { cachePolicy: "compact" }), M.toDecimal(x), String(x));
  }
  for (let E = 1n; E < 2047n; E++) {
    const x = fromBits(E << 52n);
    assert.deepEqual(M.toDecimal(x, { cachePolicy: "compact" }), M.toDecimal(x), String(x));
  }
});

test("short decimals take the coarse path; the fine path prints 16 or 17 digits", () => {
  const rand = M.mulberry32(31337);
  for (let i = 0; i < 20000; i++) {
    const digits = 1 + Math.floor(rand() * 15);
    const mant = BigInt(Math.floor(rand() * 10 ** digits)) || 1n;
    const x = Number(`${mant}e${Math.floor(rand() * 600) - 300}`);
    if (!(x > 0) || !Number.isFinite(x) || M.decode(x).subnormal || M.decode(x).shorter) continue;
    assert.equal(M.compute_nearest(x).path, "big", String(x));
  }
  for (let i = 0; i < 20000; i++) {
    const x = M.randomDouble(rand);
    const r = M.compute_nearest(x);
    if (r.path === "small" && !M.decode(x).subnormal) {
      const len = r.significand.toString().length;
      assert.ok(len === 16 || len === 17, String(x));
    }
  }
});
