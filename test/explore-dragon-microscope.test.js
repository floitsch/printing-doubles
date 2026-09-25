// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/dragon-microscope-model.js";
import { fromBits } from "../site/js/float.js";

const out = (input, opts) => M.outputText(M.dragon4(input, opts));

test("π at different precisions (the slider values quoted in the prose)", () => {
  const expected = { 4: "3.2", 8: "3.14", 12: "3.142", 16: "3.1416", 20: "3.141594", 24: "3.1415927", 32: "3.1415926535", 53: "3.141592653589793" };
  for (const [p, text] of Object.entries(expected)) assert.equal(out(M.piInput(Number(p))), text, `p=${p}`);
  // the embedded π bits agree with Math.PI (= round(π·2^51)) and with 64-bit rounding
  assert.equal(M.piToy(53).f, M.doubleInput(Math.PI).f);
  assert.equal(M.piToy(53).q, -51);
  assert.equal(M.piToy(64).f, 0xC90FDAA22168C235n); // π·2^62 = C90FDAA22168C234C4…, rounds up
  const pi8 = M.piInput(8);
  assert.equal(pi8.f, 201n); assert.equal(pi8.q, -6);
});

test("8-bit π trace: registers quoted in the page", () => {
  const t = M.dragon4(M.piInput(8));
  assert.deepEqual([t.init.R, t.init.S, t.init.Mm, t.init.Mp], [201n, 64n, 1n, 1n]);
  assert.equal(t.scaled.S, 640n); assert.equal(t.scaled.k, 1);
  assert.deepEqual(t.rows.map((r) => [r.tenR, r.U, r.R, r.Mm, r.twoR, r.twoSminusMp, r.low, r.high]), [
    [2010n, 3n, 90n, 10n, 180n, 1270n, false, false],
    [900n, 1n, 260n, 100n, 520n, 1180n, false, false],
    [2600n, 4n, 40n, 1000n, 80n, 280n, true, false],
  ]);
  const nb = M.neighbourhood(M.piInput(8));
  assert.equal(M.rationalText(nb.v), "3.140625");
  assert.equal(M.rationalText(nb.lowerNeighbour), "3.125");
  assert.equal(M.rationalText(nb.upperNeighbour), "3.15625");
  assert.equal(M.rationalText(nb.lower), "3.1328125");
  assert.equal(M.rationalText(nb.upper), "3.1484375");
});

test("worksheet tabs produce the documented outputs and rules", () => {
  const want = {
    "1.375": ["1.4", "high"], "0.34375": ["0.34", "both-down"], "3.140625": ["3.14", "low"], "0.125": ["0.13", "high"],
    "96": ["96", "both-down"], "0.3": ["0.3", "high"], "1e-6": ["1e-6", "high"], "2^64": ["18446744073709552000", "both-up"],
  };
  for (const s of M.SHEETS) {
    const t = M.dragon4(s.input());
    assert.equal(M.outputText(t), want[s.id][0], s.id);
    assert.equal(t.rule, want[s.id][1], s.id);
    assert.equal(t.carry, false); assert.equal(t.leadingZero, false);
  }
  // 1.375: truncation 1.3 outside, 1.4 inside; S goes 8 → 80
  const t1 = M.dragon4(M.toyInput(11n, -3, 4));
  assert.deepEqual(t1.rows.map((r) => [r.tenR, r.U, r.R]), [[110n, 1n, 30n], [300n, 3n, 60n]]);
  assert.equal(t1.scaled.S, 80n);
  // 0.125 unequal gaps; symmetric margins print 0.12 which reads back as 0.1171875
  const i125 = M.toyInput(8n, -6, 4);
  const t125 = M.dragon4(i125);
  assert.deepEqual([t125.afterUnequal.R, t125.afterUnequal.S, t125.afterUnequal.Mm, t125.afterUnequal.Mp], [16n, 128n, 1n, 2n]);
  const naive = M.dragon4(i125, { symmetric: true });
  assert.equal(M.outputText(naive), "0.12");
  assert.equal(M.readsBackAs(12n, -2, i125), false);
  assert.deepEqual(M.roundToPrecision(12n, 100n, 4), { f: 15n, q: -7 }); // 15/128 = 0.1171875
  // 96: S 1 → 10 → 100; the published ≥ gives a leading zero
  const t96 = M.dragon4(M.toyInput(12n, 3, 4));
  assert.deepEqual(t96.loop2.map((l) => l.S), [10n, 100n]);
  const p96 = M.dragon4(M.toyInput(12n, 3, 4), { scaleTest: "paper" });
  assert.equal(p96.digitString, "096"); assert.equal(p96.leadingZero, true);
  // 0.3: registers
  const t03 = M.dragon4(M.doubleInput(0.3));
  assert.equal(t03.init.R, 5404319552844595n); assert.equal(t03.init.S, 18014398509481984n);
  assert.equal(M.approx(t03.rows[0].R, t03.rows[0].S), "0.99999999999999988898");
  // 1e-6: scaling on v would carry
  const v6 = M.dragon4(M.doubleInput(1e-6), { scaleTest: "v" });
  assert.equal(v6.rows[0].U, 9n); assert.equal(v6.carry, true);
  const t6 = M.dragon4(M.doubleInput(1e-6));
  assert.equal(t6.rows[0].U, 0n); assert.equal(t6.loop1.length, 6); assert.equal(t6.loop2.length, 1);
  // 2^64: symmetric margins print the predecessor
  const s64 = M.dragon4(M.doubleInput(2 ** 64), { symmetric: true });
  assert.equal(M.outputText(s64), "18446744073709550000");
  assert.equal(Number("18446744073709550000"), 2 ** 64 - 4096 / 2);
  assert.notEqual(Number("18446744073709550000"), 2 ** 64);
});

test("micro presets", () => {
  assert.equal(out(M.parseInput("1.375", 4)), "1.4");
  assert.equal(out(M.parseInput("0.34375", 4)), "0.34");
  assert.equal(out(M.parseInput("0.125", 4)), "0.13");
  assert.equal(M.parseInput("0.125", 4).unequal, true);
  assert.equal(out(M.parseInput("0.3", 53)), "0.3");
  assert.equal(out(M.parseInput("5e-324", 53)), "5e-324");
  assert.ok(M.parseInput("-1", 8).error);
  const f = M.microscopeFrames(M.dragon4(M.piInput(8)));
  assert.equal(f.length, 4);
  assert.deepEqual(f.slice(1).map((x) => [x.tickLabel(x.U), x.tickLabel(x.U + 1)]), [["3", "4"], ["3.1", "3.2"], ["3.14", "3.15"]]);
  assert.equal(f[0].right, "10");
});

test("toy formats: Dragon4 = shortest strictly inside, then closest (brute force)", () => {
  let n = 0;
  for (let p = 3; p <= 8; p++) {
    for (let q = -12; q <= 6; q++) {
      for (let f = 1n << BigInt(p - 1); f < 1n << BigInt(p); f++) {
        const input = M.toyInput(f, q, p);
        const t = M.dragon4(input);
        const mine = M.normalize(t.coefficient, t.exp10);
        const brute = M.bruteShortestStrict(input);
        // ties (2R = S) are resolved to U by both
        assert.deepEqual(mine, brute, `f=${f} q=${q} p=${p}`);
        assert.equal(M.readsBackAs(t.coefficient, t.exp10, input), true);
        assert.equal(t.carry, false); assert.equal(t.leadingZero, false);
        n++;
      }
    }
  }
  assert.ok(n > 4000);
});

test("doubles: round trip, no carry, no leading zero; brute force agreement", () => {
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 4000; i++) {
    const x = M.randomDouble(rand);
    const input = M.doubleInput(x);
    const t = M.dragon4(input);
    assert.equal(Number(`${t.coefficient}e${t.exp10}`), x);
    assert.equal(t.carry, false); assert.equal(t.leadingZero, false);
    assert.ok(t.coefficient.toString().length <= 17);
    if (i < 300) assert.deepEqual(M.normalize(t.coefficient, t.exp10), M.bruteShortestStrict(input));
  }
  for (const x of [Number.MIN_VALUE, 2.2250738585072014e-308, fromBits(0x0010000000000000n), Number.MAX_VALUE, 1, 2 ** -44, 2 ** 64, 1e23]) {
    const t = M.dragon4(M.doubleInput(x));
    assert.equal(Number(`${t.coefficient}e${t.exp10}`), x);
  }
});

test("cost numbers and boundary fine print", () => {
  const tiny = M.dragon4(M.doubleInput(5e-324));
  assert.equal(tiny.loop1.length, 323);
  assert.ok(tiny.maxBits >= 1075 && tiny.maxBits <= 1080);
  assert.equal(M.dragon4(M.doubleInput(Number.MAX_VALUE)).loop2.length, 309);
  // 1e23: upper boundary is exactly 10^23
  const nb = M.neighbourhood(M.doubleInput(1e23));
  assert.equal(nb.upper.num, 10n ** 23n * nb.upper.den);
  assert.equal(out(M.doubleInput(1e23)), "9.999999999999999e22");
  assert.equal(M.dragon4(M.doubleInput(1e23), { scaleTest: "paper" }).digitString, "09999999999999999");
  const a = M.compareWithJs(1.1364609618646e18);
  assert.equal(a.same, false); assert.equal(a.dragonText, "1136460961864600100");
  const b = M.compareWithJs(22528237593729.1875);
  assert.equal(b.same, false); assert.equal(b.dragonText, "22528237593729.187");
  // about 0.05 % of random bit patterns differ from toString
  let seed = 7;
  const rand = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  let diff = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (!M.compareWithJs(M.randomDouble(rand)).same) diff++;
  assert.ok(diff / N < 0.002, `rate ${diff / N}`);
});

test("helpers", () => {
  assert.equal(M.groupDigits(5404319552844595n), "5 404 319 552 844 595");
  assert.equal(M.groupDigits(2010n), "2010");
  assert.equal(M.approx(1n, 3n, 5), "0.33333");
  assert.equal(M.approx(10n, 2n * 18014398509481984n, 4), "2.776e-16");
  assert.equal(M.decimalText(130n, -2), "1.3");
});
