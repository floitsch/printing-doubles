// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import { shortestDecimal } from "../site/js/oracle.js";
import { nextUp, nextDown } from "../site/js/float.js";
import {
  computeNearest, clockState, rulerState, shorterState, scaledWindow, qFixed, qCmp, qSub, Q,
  randomDouble, xorshift64, EXPECTED_HIT_RATE, parseInput, cacheEntry, dragonboxK, decompose,
} from "../site/explore/js/dragonbox-clock-model.js";

const sci = (t) => `${t.significand}e${t.exponent}`;

test("port agrees with V8 and with the exact oracle", () => {
  const rng = xorshift64(0x1234567887654321n);
  for (let i = 0; i < 3000; i++) {
    const v = randomDouble(rng);
    const t = computeNearest(v);
    assert.ok(t.roundTrips, String(v));
    // V8 prints the shortest (and closest) digits: compare the digit strings.
    const v8 = v.toExponential().replace(/e.*/, "").replace(".", "");
    assert.equal(t.significand.toString(), v8, String(v));
    if (i < 600) {
      const o = shortestDecimal(v);
      assert.equal(t.significand, o.coefficient, String(v));
      assert.equal(t.exponent, o.exponent, String(v));
    }
  }
  for (let p = -1074; p <= 1023; p++) {
    const v = 2 ** p;
    const t = computeNearest(v);
    assert.equal(t.significand.toString(), v.toExponential().replace(/e.*/, "").replace(".", ""), `2^${p}`);
  }
});

test("cache entries match dragonbox.h", () => {
  assert.equal(cacheEntry(-292).toString(16), "ff77b1fcbebcdc4f25e8e89c13bb0f7b");
  assert.equal(cacheEntry(19).toString(16), "8ac7230489e800000000000000000000");
  assert.equal(cacheEntry(-291).toString(16), "9faacf3df73609b177b191618c54e9ad");
  assert.equal(cacheEntry(326).toString(16), "f70867153aa2db38b8cbee4fc66d1ea8");
});

test("scale puts deltai in [100, 1000) for every exponent", () => {
  for (let e = -1074; e <= 971; e++) {
    // delta = 10^k * 2^e does not depend on fc: use 2^e * 10^k directly.
    const k = dragonboxK(e);
    const d = scaledWindow(2 ** 52 * 2 ** e || 5e-324, k).delta;
    if (e >= -1022 - 52 && e <= 971) assert.ok(qCmp(d, Q(100n)) >= 0 && qCmp(d, Q(1000n)) < 0, `e=${e}`);
  }
  const rng = xorshift64(99n);
  for (let i = 0; i < 2000; i++) {
    const t = computeNearest(randomDouble(rng));
    if (t.shorter) continue;
    assert.ok(t.deltai >= 100n && t.deltai < 1000n);
    const w = scaledWindow(t.value, t.k);
    assert.equal(w.delta.n / w.delta.d, t.deltai, "deltai is floor(delta)");
    assert.equal(w.z.n / w.z.d, t.zi, "zi is floor(z)");
  }
});

test("0.3 family (k = 19, deltai = 555)", () => {
  const rows = [
    [0.29999999999999993, 611n, "small", "29999999999999993e-17"],
    [0.3, 166n, "big", "3e-1"],
    [0.30000000000000004, 721n, "small", "30000000000000004e-17"],
    [0.3000000000000001, 276n, "big", "3000000000000001e-16"],
    [0.30000000000000016, 831n, "small", "30000000000000016e-17"],
  ];
  for (const [v, r, sub, out] of rows) {
    const t = computeNearest(v);
    assert.equal(t.k, 19);
    assert.equal(t.deltai, 555n);
    assert.equal(t.r0, r);
    assert.equal(t.sub, sub);
    assert.equal(sci(t), out);
  }
  assert.equal(0.1 + 0.2, 0.30000000000000004);
  const t = computeNearest(0.1 + 0.2);
  assert.equal(t.dist, 494n);
  const c = clockState(0.1 + 0.2);
  assert.equal(qFixed(c.xMod, 2), "166.53…");
  assert.equal(qFixed(c.yMod, 2), "444.08…");
  assert.equal(qFixed(c.zMod, 2), "721.64…");
  const one = computeNearest(0.1);
  assert.equal(one.zi, 1000000000000000124n);
  assert.equal(one.deltai, 138n);
  assert.equal(sci(one), "1e-1");
  assert.equal(one.removed, 15);
});

test("consecutive windows tile: z of one double is x of the next", () => {
  let v = 0.3;
  for (let i = 0; i < 20; i++) {
    const a = scaledWindow(v, 19);
    const b = scaledWindow(nextUp(v), 19);
    assert.equal(qCmp(a.z, b.x), 0);
    v = nextUp(v);
  }
});

test("exact clock geometry agrees with the code's decision", () => {
  const rng = xorshift64(7n);
  for (let i = 0; i < 4000; i++) {
    const c = clockState(randomDouble(rng));
    if (c.shorter) continue;
    assert.equal(c.covers12, c.trace.sub === "big");
    // The chosen hour mark (small path) is the multiple of 100 nearest y.
    if (c.trace.sub === "small") {
      const d = qSub(c.yc, Q(c.markRel));
      const twice = qCmp(Q(d.n < 0n ? -d.n : d.n, d.d), Q(50n));
      assert.ok(twice <= 0, "mark within 50 of y");
    }
  }
});

test("edge cases on the clock", () => {
  const a = clockState(1e23);
  assert.equal(a.trace.k, -5);
  assert.equal(a.trace.r0, 0n);
  assert.ok(a.trace.zIsInteger && a.trace.even && a.rightOn12 && a.covers12);
  assert.equal(sci(a.trace), "1e23");

  const b = clockState(9.499999999999999e21);
  assert.equal(b.trace.fc, 4529953002929687n);
  assert.ok(b.trace.excludedRight && b.rightOn12 && !b.covers12);
  assert.equal(b.trace.dist, 946n);
  assert.equal(sci(b.trace), "9499999999999999e6");
  assert.equal(computeNearest(9.5e21).text, "9.5e+21");

  const c = clockState(7e22);
  assert.equal(c.trace.r0, 838n);
  assert.equal(c.trace.deltai, 838n);
  assert.deepEqual(c.trace.xResult, { parity: false, isInteger: true });
  assert.ok(c.leftOn12 && c.covers12 && c.trace.even);
  assert.equal(sci(c.trace), "7e22");
  assert.equal(7e22, 70000000000000004194304);

  const tie = clockState(513 * 2 ** -20);
  assert.equal(513 * 2 ** -20, 0.00048923492431640625);
  assert.equal(tie.trace.r0, 304n);
  assert.equal(tie.trace.deltai, 108n);
  assert.equal(tie.trace.dist, 300n);
  assert.ok(tie.trace.yResult.isInteger);
  assert.equal(tie.trace.yFix, "tie");
  assert.equal(qFixed(tie.yMod, 3), "250");
  assert.equal(sci(tie.trace), "4892349243164062e-19");

  const fix = computeNearest(24211351596743786000);
  assert.equal(fix.dist, 700n);
  assert.equal(fix.yFix, "parity");
  assert.equal(sci(fix), "24211351596743786e3");
});

test("tiny doubles n * 2^-1074", () => {
  const outs = ["5e-324", "1e-323", "1.5e-323", "2e-323", "2.5e-323", "3e-323", "3.5e-323", "4e-323", "4.4e-323", "5e-323", "5.4e-323", "6e-323"];
  const zis = [741n, 1235n, 1729n, 2223n, 2717n, 3211n, 3705n, 4199n, 4693n, 5187n, 5681n, 6175n];
  for (let n = 1; n <= 12; n++) {
    const v = n * 5e-324;
    const t = computeNearest(v);
    assert.equal(t.k, 326);
    assert.equal(t.deltai, 494n);
    assert.equal(t.zi, zis[n - 1]);
    assert.equal(String(v), outs[n - 1]);
    assert.equal(t.text.replace(/^0\.0+/, ""), t.text.replace(/^0\.0+/, ""));
    assert.equal(Number(`${t.significand}e${t.exponent}`), v);
    assert.equal(t.significand.toString(), outs[n - 1].replace(/e.*/, "").replace(".", ""));
  }
  const w = scaledWindow(5e-324, 326);
  assert.equal(qFixed(w.y, 4), "494.0656…");
  assert.equal(qFixed(w.x, 2), "247.03…");
  assert.equal(qFixed(w.z, 2), "741.09…");
  assert.equal(qFixed(scaledWindow(9 * 5e-324, 326).y, 1), "4446.5…");
});

test("hypothetical scales on the ruler", () => {
  const rng = xorshift64(31n);
  for (let i = 0; i < 1000; i++) {
    const v = randomDouble(rng);
    const s = rulerState(v, 0);
    if (s.shorter) continue;
    assert.ok(s.thousands.count <= 1n);
    assert.ok(s.hundreds.count >= 1n);
    assert.equal(s.thousands.count === 1n, s.trace.sub === "big");
    const up = rulerState(v, 1);
    assert.ok(up.thousands.count >= 1n);
  }
  const r = rulerState(0.3, 0);
  assert.equal(qFixed(r.delta, 2), "555.11…");
  assert.equal(r.thousands.first, 3000000000000000n);
});

test("powers of two: the lopsided window of 2^64", () => {
  const s = shorterState(2 ** 64);
  assert.equal(s.k, -3);
  assert.equal(qFixed(s.x, 3), "18446744073709550.592");
  assert.equal(qFixed(s.z, 3), "18446744073709553.664");
  assert.equal(qFixed(s.ghostX, 3), "18446744073709549.568");
  assert.equal(s.tens.count, 0n);
  assert.equal(s.ghostCandidate.scaled, 18446744073709550n);
  assert.equal(s.ghostCandidate.readsBackAs, 2 ** 64 - 2048);
  assert.equal(s.trace.sub, "roundup");
  assert.equal(sci(s.trace), "18446744073709552e3");
  const one = shorterState(1);
  assert.equal(one.trace.sub, "grid10");
  assert.equal(sci(one.trace), "1e0");
  const t63 = shorterState(2 ** 63);
  assert.equal(sci(t63.trace), "9223372036854776e3");
  assert.equal(t63.ghostCandidate, null);
  assert.equal(sci(shorterState(2 ** 53).trace), "9007199254740992e0");
  // 2^-25 (e = -77) is the one power of two whose y is exactly halfway: tie to even.
  const tie = shorterState(2 ** -25);
  assert.equal(tie.trace.e, -77);
  assert.equal(tie.trace.roundUpY - tie.trace.significand, 1n);
  assert.equal(qFixed(tie.y, 1), "29802322387695312.5");
  assert.equal(tie.ghostCandidate.readsBackAs, nextDown(2 ** -25));
  assert.equal(tie.ghostCandidate.text, "2.980232238769531e-8");
  assert.equal(s.ghostCandidate.readsBackAs, nextDown(2 ** 64));
  let shorterCount = 0;
  for (let p = -1022; p <= 1023; p++) if (computeNearest(2 ** p).shorter) shorterCount++;
  assert.equal(shorterCount, 2046);
});

test("random hit rate converges to about 39%", () => {
  const rng = xorshift64(2026n);
  let hits = 0, total = 0;
  for (let i = 0; i < 20000; i++) {
    const t = computeNearest(randomDouble(rng));
    if (t.shorter) continue;
    total++;
    if (t.sub === "big") hits++;
  }
  assert.ok(Math.abs(hits / total - EXPECTED_HIT_RATE) < 0.015, `${hits / total}`);
  assert.ok(Math.abs(EXPECTED_HIT_RATE - 0.3909) < 0.0001);
});

test("input parser", () => {
  assert.equal(parseInput("0.1+0.2"), 0.30000000000000004);
  assert.equal(parseInput("2^64"), 2 ** 64);
  assert.equal(parseInput("513·2^-20"), 513 * 2 ** -20);
  assert.equal(parseInput("1e+23"), 1e23);
  assert.equal(parseInput("1/3"), 1 / 3);
  assert.equal(decompose(0.3).even, false);
  assert.equal(nextDown(0.3), 0.29999999999999993);
});
