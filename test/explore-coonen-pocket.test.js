import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/coonen-pocket-model.js";
import { coonenBReference } from "../site/js/coonen-reference.js";
import { nextDown, nextUp } from "../site/js/float.js";

const last = (c) => c.run.passes[c.run.passes.length - 1];

test("exact power limits: 10^5 in 12 bits, 10^27 in 64 bits", () => {
  assert.equal(M.exactPowerLimit(12), 5);
  assert.equal(M.exactPowerLimit(64), 27);
});

test("Algorithm Q table matches the corrected hex values", () => {
  const expect = {
    27: ["CECB8F27F4200F3A", 90, false],
    55: ["D0CF4B50CFE20766", 183, true],
    108: ["DA01EE641A708DEA", 359, true],
    206: ["9F79A169BD203E41", 685, true],
  };
  for (const k of M.Q_TABLE) {
    const entry = M.qTableEntry(k);
    const [hex, exp, inexact] = expect[k];
    assert.equal(entry.m.toString(16).toUpperCase(), hex, `10^${k}`);
    assert.equal(entry.e + 64, exp, `10^${k} exponent (0.hex × 2^exp)`);
    assert.equal(entry.inexact, inexact);
  }
  // signs of the table errors: 10^108 rounded up, 10^206 rounded down
  assert.ok(M.powerOfTen(108, 64, "nearest", "Q").delta > 0);
  assert.ok(M.powerOfTen(206, 64, "nearest", "Q").delta < 0);
  // directed z honours its direction for every scale up to 10^340
  for (let k = 0; k <= 340; k++) {
    assert.ok(M.powerOfTen(k, 64, "away", "Q").delta >= 0, `up ${k}`);
    assert.ok(M.powerOfTen(k, 64, "chop", "Q").delta <= 0, `down ${k}`);
    assert.equal(M.powerOfTen(k, 64, "nearest", "Q").exact, k <= 27);
    assert.ok(Math.abs(M.powerOfTen(k, 64, "nearest", "Q").delta) <= 3.5 * 2 ** -64, `nearest bound ${k}`);
    assert.ok(Math.abs(M.powerOfTen(k, 64, "away", "Q").delta) <= 5 * 2 ** -63, `directed bound ${k}`);
  }
});

test("toy powers of ten", () => {
  const z = (k, dir) => M.extToDecimal(M.powerOfTen(k, 12, dir, "direct").z);
  assert.equal(z(5, "nearest"), "100000");
  assert.equal(z(6, "nearest"), "999936");
  assert.equal(z(6, "away"), "1000192");
  assert.equal(z(7, "nearest"), "9998336");
  assert.equal(z(8, "nearest"), "100007936");
});

test("card A: wobbly power of ten gives 915 instead of 916", () => {
  const c = M.convertToy(60, -16);
  const p = last(c);
  assert.equal(M.rationalToDecimal(c.ref.scaled.num, c.ref.scaled.den), "915.52734375");
  assert.equal(c.ref.coefficient, 916n);
  assert.equal(p.scale, 6);
  assert.equal(M.extToDecimal(p.power.z), "999936");
  assert.equal(M.rationalToDecimal(p.exactProduct.num, p.exactProduct.den), "915.46875");
  assert.equal(M.extToBinary(p.chopped), "1110010011.01");
  assert.equal(M.extToDecimal(p.register), "915.25");
  assert.equal(c.run.coefficient, 915n);
  assert.equal(c.correct, false);
  assert.deepEqual(c.broken, []); // allowed: z was rounded, within the toy bound
});

test("card B: halfway trap, sticky bit gives 641", () => {
  const good = M.convertToy(41, -6);
  const p = last(good);
  assert.equal(p.power.exact, true);
  assert.equal(M.rationalToDecimal(p.exactProduct.num, p.exactProduct.den), "640.625");
  assert.equal(M.extToDecimal(p.chopped), "640.5");
  assert.equal(M.extToBinary(p.register), "1010000000.11");
  assert.equal(good.run.coefficient, 641n);
  assert.equal(good.correct, true);
  const round = M.convertToy(41, -6, "nearest", { sticky: "round" });
  assert.equal(M.extToDecimal(last(round).register), "640.5");
  assert.equal(round.run.coefficient, 640n);
  assert.ok(round.broken.includes("exact-band"));
  assert.equal(M.convertToy(41, -6, "nearest", { sticky: "chop" }).run.coefficient, 640n);
});

test("card C: directed rounding needs directed z and the sticky bit", () => {
  const good = M.convertToy(58, -16, "up");
  const p = last(good);
  assert.equal(M.rationalToDecimal(good.ref.scaled.num, good.ref.scaled.den), "885.009765625");
  assert.equal(p.zdir, "away");
  assert.equal(M.extToDecimal(p.power.z), "1000192");
  assert.equal(M.rationalToDecimal(p.exactProduct.num, p.exactProduct.den), "885.1796875");
  assert.equal(M.extToDecimal(p.chopped), "885");
  assert.equal(M.extToDecimal(p.register), "885.25");
  assert.equal(good.run.coefficient, 886n);
  assert.equal(good.correct, true);
  const nz = M.convertToy(58, -16, "up", { directedZ: false });
  assert.equal(M.rationalToDecimal(last(nz).exactProduct.num, last(nz).exactProduct.den), "884.953125");
  assert.equal(M.extToDecimal(last(nz).chopped), "884.75");
  assert.equal(nz.run.coefficient, 885n);
  assert.ok(nz.broken.includes("direction"));
  const chop = M.convertToy(58, -16, "up", { sticky: "chop" });
  assert.equal(chop.run.coefficient, 885n);
  assert.ok(chop.broken.includes("direction"));
});

test("toy survey: as designed, no promise broken, 3 digits always read back", () => {
  const s = M.toySurvey(-30, 20);
  assert.equal(s.total, 1632);
  assert.equal(s.wrong, 22);
  assert.equal(s.wrongInBand, 0);
  assert.equal(s.roundTripFail, 0);
  for (const mode of M.MODES) {
    for (let e = -30; e <= 20; e++) {
      for (let m = 32; m < 64; m++) {
        const c = M.convertToy(m, e, mode);
        assert.deepEqual(c.broken, [], `${m}·2^${e} ${mode}`);
      }
    }
  }
  assert.ok(M.toySurvey(-30, 20, "nearest", { sticky: "chop" }).wrongInBand > 0);
});

test("0.1: Algorithm L is one too low, B6 retries", () => {
  const c = M.convertDouble(0.1);
  assert.equal(c.run.logInfo.logx, -2);
  assert.equal(c.run.trueDecade, -1);
  assert.equal(c.run.passes.length, 2);
  const [a, b] = c.run.passes;
  assert.equal(a.scale, 18);
  assert.equal(M.extToDecimal(a.chopped), "100000000000000005.546875");
  assert.equal(M.extToDecimal(a.register), "100000000000000005.5546875");
  assert.equal(a.rounded, 100000000000000006n);
  assert.equal(a.check, "retry");
  assert.equal(b.scale, 17);
  assert.equal(M.extToDecimal(b.chopped), "10000000000000000.5546875");
  assert.equal(M.extToDecimal(b.register), "10000000000000000.5556640625");
  assert.equal(c.run.coefficient, 10000000000000001n);
  assert.equal(c.run.logx, -1);
  assert.equal(c.correct, true);
  assert.equal(c.roundTrip, true);
  const noB6 = M.convertDouble(0.1, 17, "nearest", { b6: false });
  assert.equal(noB6.run.coefficient, 100000000000000006n);
  assert.ok(noB6.broken.includes("digits"));
});

test("1.0439 and 0.5308290954995201: the sticky bit decides", () => {
  const c = M.convertDouble(1.0439);
  const p = last(c);
  assert.equal(p.scale, 16);
  assert.equal(M.extToDecimal(p.chopped), "10439000000000000.5");
  assert.equal(M.extToDecimal(p.register), "10439000000000000.5009765625");
  assert.equal(c.run.coefficient, 10439000000000001n);
  assert.equal(c.correct, true);
  const chop = M.convertDouble(1.0439, 17, "nearest", { sticky: "chop" });
  assert.equal(chop.run.coefficient, 10439000000000000n);
  assert.ok(chop.broken.includes("exact-band"));
  const d = M.convertDouble(0.5308290954995201);
  assert.equal(M.extToDecimal(last(d).register), "53082909549952006.50390625");
  assert.equal(d.run.coefficient, 53082909549952007n);
  const round = M.convertDouble(0.5308290954995201, 17, "nearest", { sticky: "round" });
  assert.equal(round.run.coefficient, 53082909549952006n);
});

test("outside the exact band: bounded misround that still reads back", () => {
  const c = M.convertDouble(1.0408207851369739e-12);
  assert.equal(last(c).scale, 28);
  assert.equal(last(c).power.exact, false);
  assert.equal(c.run.coefficient, 10408207851369738n);
  assert.equal(c.ref.coefficient, 10408207851369739n);
  assert.equal(c.roundTrip, true);
  assert.deepEqual(c.broken, []);
  const tiny = M.convertDouble(5e-324);
  assert.equal(last(tiny).scale, 340);
  assert.deepEqual(last(tiny).power.steps.map((s) => s.power), [206, 108, 26]);
  assert.equal(tiny.run.coefficient, 49406564584124654n);
  const big = M.convertDouble(1.7976931348623157e308);
  assert.equal(last(big).scale, -292);
  assert.equal(big.run.coefficient, 17976931348623157n);
  const e23 = M.convertDouble(1e23, 6);
  assert.equal(e23.run.passes[0].check, "retry");
  assert.equal(e23.run.coefficient, 100000n);
  assert.equal(e23.run.logx, 23);
});

test("directed z switched off breaks the direction promise", () => {
  const x = 4.20673349513061e-103;
  const good = M.convertDouble(x, 17, "up");
  assert.equal(good.run.coefficient, 42067334951306102n);
  assert.deepEqual(good.broken, []);
  const bad = M.convertDouble(x, 17, "up", { directedZ: false });
  assert.equal(bad.run.coefficient, 42067334951306101n);
  assert.ok(bad.broken.includes("direction"));
});

test("correctlyRounded agrees with the site's exact reference", () => {
  const rng = M.makeRng(7);
  for (let i = 0; i < 400; i++) {
    const s = M.sampleRegion(rng, M.regions(17).anywhere);
    for (const mode of M.MODES) {
      const N = 1 + (i % 17);
      const mine = M.correctlyRounded(s, N, mode);
      const theirs = coonenBReference(s.value, N, mode);
      assert.equal(mine.coefficient, theirs.coefficient, `${s.value} ${N} ${mode}`);
      assert.equal(mine.logx, theirs.scientificExponent);
    }
  }
});

test("as designed: no promise broken near powers of ten and on random doubles", () => {
  for (let k = -307; k <= 308; k += 3) {
    let x = Number(`1e${k}`);
    const around = [x, nextUp(x), nextDown(x), nextUp(nextUp(x)), nextDown(nextDown(x))];
    for (const v of around) {
      for (const mode of M.MODES) {
        const c = M.convertDouble(v, 17, mode);
        assert.deepEqual(c.broken, [], `${v} ${mode}`);
      }
      const c = M.convertDouble(v, 5, "nearest");
      assert.deepEqual(c.broken, [], `${v} N=5`);
    }
  }
  const rng = M.makeRng(99);
  for (let i = 0; i < 3000; i++) {
    const s = M.sampleRegion(rng, M.regions(17).anywhere);
    const mode = M.MODES[i % 4];
    const c = M.convertDouble(s.value, 17, mode);
    assert.deepEqual(c.broken, [], `${s.value} ${mode}`);
    if (c.run.zExact) assert.equal(c.correct, true);
  }
});

test("Algorithm L is a lower bound, at most one too low", () => {
  const rng = M.makeRng(3);
  for (let i = 0; i < 5000; i++) {
    const s = M.sampleRegion(rng, M.regions(17).anywhere);
    const L = M.algorithmL(s.m, s.e).logx;
    const t = M.exactDecade(s.m, s.e);
    assert.ok(L === t || L === t - 1, `${s.value}`);
  }
  // subnormals too
  for (const v of [5e-324, 1e-320, 2.2250738585072009e-308]) {
    const d = M.doubleInput(v);
    const L = M.algorithmL(d.m, d.e).logx;
    const t = M.exactDecade(d.m, d.e);
    assert.ok(L === t || L === t - 1, `${v}`);
  }
});

test("fuzzer variants find counterexamples", () => {
  const variants = [
    [{ sticky: "chop" }, "nearest", "exact"],
    [{ sticky: "round" }, "nearest", "exact"],
    [{ directedZ: false }, "up", "rounded"],
    [{ b6: false }, "nearest", "anywhere"],
  ];
  for (const [guards, mode, region] of variants) {
    const rng = M.makeRng(1);
    let found = false;
    for (let i = 0; i < 40000 && !found; i++) {
      const s = M.sampleRegion(rng, M.regions(17)[region]);
      const c = M.checkConversion(s, { p: 64, N: 17, mode, pow10: "Q", log: "L", safeguards: guards, roundTripValue: s.value });
      if (c.broken.length) found = true;
    }
    assert.ok(found, JSON.stringify(guards));
  }
});
