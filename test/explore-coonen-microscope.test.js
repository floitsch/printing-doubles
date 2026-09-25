// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import {
  TABLE, pow10Q, deltaBound, estimateLog10, exactDecade, coonen, correctlyRounded,
  bandOf, randomDouble, classify, recoveryBudget, pow10, extToRat, roundToExt,
} from "../site/explore/js/coonen-microscope-model.js";
import { decodeDouble, nextUp, nextDown } from "../site/js/float.js";

// Deterministic PRNG so failures are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("Algorithm Q table matches the corrected dissertation constants", () => {
  const expected = [
    [27, "CECB8F27F4200F3A", 90, 0],
    [55, "D0CF4B50CFE20766", 183, 1],
    [108, "DA01EE641A708DEA", 359, 1],
    [206, "9F79A169BD203E41", 685, -1],
  ];
  assert.deepEqual(TABLE.map((t) => [t.exp, t.hex, t.binExp, t.pfix]), expected);
  assert.equal(TABLE[0].relErr, 0);
  assert.ok(Math.abs(Math.log2(TABLE[1].relErr) + 76.21) < 0.01);
  assert.ok(Math.abs(Math.log2(TABLE[2].relErr) + 67.19) < 0.01);
  assert.ok(Math.abs(Math.log2(-TABLE[3].relErr) + 67.41) < 0.01);
});

test("10^n is exact exactly when n <= 27 (5^27 < 2^64 < 5^28)", () => {
  assert.ok(5n ** 27n < 1n << 64n && 1n << 64n < 5n ** 28n);
  for (let n = 0; n <= 345; n++) {
    for (const zmode of ["nearest", "up", "down"]) {
      const q = pow10Q(n, zmode);
      assert.equal(q.exact, n <= 27, `n=${n}`);
      const z = extToRat(q);
      const cmp = z.n - pow10(n) * z.d;
      if (zmode === "up") assert.ok(cmp >= 0n, `z >= 10^${n} when rounding up`);
      if (zmode === "down") assert.ok(cmp <= 0n, `z <= 10^${n} when rounding down`);
      const bound = zmode === "nearest" ? deltaBound("nearest") : deltaBound("up");
      assert.ok(Math.abs(q.delta) <= bound, `|δ(${n})| within Coonen's bound`);
    }
  }
  assert.deepEqual(pow10Q(340, "nearest").bricks.map((b) => b.exp), [206, 108, 26]);
});

test("Algorithm L is never too high and at most one too low", () => {
  const rand = mulberry32(7);
  let low = 0;
  let total = 0;
  const check = (x) => {
    const d = decodeDouble(x);
    const L = estimateLog10(d.significand, d.exponent);
    const D = exactDecade(d.significand, d.exponent);
    assert.ok(L.logx === D || L.logx === D - 1, `x=${x}: L=${L.logx}, D=${D}`);
    if (L.logx < D) low++;
    total++;
  };
  for (let k = -323; k <= 308; k++) {
    let v = Number(`1e${k}`);
    for (let i = 0; i < 3; i++) { check(v); v = nextUp(v); }
    v = nextDown(Number(`1e${k}`));
    if (v > 0) check(v);
  }
  for (let i = 0; i < 4000; i++) check(randomDouble({ kind: "all" }, rand));
  assert.ok(low > 0);
  const e = estimateLog10(decodeDouble(0.1).significand, decodeDouble(0.1).exponent);
  assert.equal(e.l2x.toFixed(4), "-3.4000");
  assert.equal(e.logx, -2);
});

test("preset walk-throughs", () => {
  const r01 = coonen(0.1, 17);
  assert.deepEqual(r01.passes.map((p) => [p.scale, p.check, p.rounded]), [[18, "retry", 100000000000000006n], [17, "ok", 10000000000000001n]]);
  const b01 = bandOf(r01);
  assert.equal(b01.fracBits, 10);
  assert.equal(b01.pass.chopped.m & 1023n, 568n);
  assert.equal(b01.pass.reg.m & 1023n, 569n);

  const sticky = coonen(1.0439, 17);
  assert.equal(sticky.digits, 10439000000000001n);
  assert.equal(bandOf(sticky).pass.chopped.m & 1023n, 512n); // a fake tie after chopping
  assert.equal(coonen(1.0439, 17, "nearest", { product: "chop" }).digits, 10439000000000000n);
  assert.equal(coonen(1.0439, 17, "nearest", { product: "nearest" }).digits, 10439000000000001n);
  assert.equal(coonen(0.5308290954995201, 17, "nearest", { product: "nearest" }).digits, 53082909549952006n);
  assert.equal(coonen(0.5308290954995201, 17).digits, 53082909549952007n);

  const mis = coonen(8.767230337125793e-12, 17);
  assert.equal(mis.passes.at(-1).scale, 28);
  assert.equal(mis.digits, 87672303371257930n);
  assert.equal(mis.correct.digits, 87672303371257931n);
  assert.equal(mis.isCorrect, false);
  assert.equal(mis.roundTrips, true);
  const bm = bandOf(mis);
  assert.ok(bm.straddles);
  assert.ok(bm.yOff > 0 && bm.pOff < 0);
  assert.ok(Math.abs(bm.delta + 2.68435456e-20) < 1e-28);
  // z = 10^28 − 2^28 exactly
  const z = extToRat(mis.passes.at(-1).q);
  assert.equal(z.n, (pow10(28) - (1n << 28n)) * z.d);

  const tiny = coonen(5e-324, 17);
  assert.equal(tiny.digits, 49406564584124654n);
  assert.equal(tiny.logx, -324);
  assert.equal(tiny.passes.at(-1).scale, 340);
  assert.ok(tiny.isCorrect);

  const huge = coonen(1.7976931348623157e308, 17);
  assert.equal(huge.passes.at(-1).scale, -292);
  assert.equal(huge.digits, 17976931348623157n);

  const carry = coonen(1e23, 6);
  assert.deepEqual(carry.passes.map((p) => p.check), ["retry", "ok"]);
  assert.equal(carry.logxLow, false);
  assert.equal(carry.digits, 100000n);
  assert.equal(carry.logx, 23);

  const pi = coonen(Math.PI, 5);
  assert.equal(pi.digits, 31416n);
  assert.equal(pi.logx, 0);
});

test("correctly rounded whenever |SCALE| <= 27; bounded extra error elsewhere; 17 digits round-trip", () => {
  const rand = mulberry32(42);
  const modes = ["nearest", "zero", "up", "down"];
  let misrounds = 0;
  for (let i = 0; i < 2500; i++) {
    const x = (i & 1 ? -1 : 1) * randomDouble(i % 3 ? { kind: "all" } : { kind: "decade", k: Math.floor(rand() * 60) - 12 }, rand);
    const mode = modes[i % 4];
    const N = i % 5 === 0 ? 1 + Math.floor(rand() * 17) : 17;
    const r = coonen(x, N, mode);
    const b = bandOf(r);
    assert.ok(r.passes.length <= 2);
    assert.ok(r.passes.every((p) => p.check !== "forced"));
    if (Math.abs(b.pass.scale) <= 27) assert.ok(r.isCorrect, `x=${x} N=${N} ${mode}`);
    if (!r.isCorrect) misrounds++;
    // |shift| never exceeds the drawn band
    assert.ok(Math.abs(b.shift) <= b.h * (1 + 1e-12) + 1e-300, `shift ${b.shift} > h ${b.h}`);
    // the register lies on the same side of the decision point as the product
    if (b.pOff !== 0) assert.equal(Math.sign(b.rOff), Math.sign(b.pOff));
    if (N === 17 && mode === "nearest") assert.ok(r.roundTrips, `x=${x} does not round-trip`);
    if (r.logx === r.correct.logx) {
      const err = Math.abs(Number(r.digits - r.correct.digits));
      assert.ok(err <= 1);
    }
  }
  assert.ok(misrounds < 25);
});

test("correctlyRounded agrees with toPrecision for nearest", () => {
  const rand = mulberry32(3);
  for (let i = 0; i < 300; i++) {
    const x = randomDouble({ kind: "all" }, rand);
    const c = correctlyRounded(x, 17);
    const [mant, exp] = x.toExponential(16).split("e");
    assert.equal(c.digits, BigInt(mant.replace(".", "")));
    assert.equal(c.logx, Number(exp));
  }
});

test("classify, roundToExt and the recovery budget", () => {
  const c = classify(8.767230337125793e-12, 17, "nearest");
  assert.equal(c.isCorrect, false);
  assert.equal(c.roundTrips, true);
  assert.equal(c.zExact, false);
  assert.equal(roundToExt(3n, 1n, "nearest").inexact, false);
  const b64 = recoveryBudget(64);
  assert.ok(Math.abs(b64.printExtra - 0.018973) < 1e-6);
  assert.ok(Math.abs(b64.total - 0.9692) < 1e-4);
  assert.ok(recoveryBudget(63).total < 1);
  assert.ok(recoveryBudget(62).total > 1);
});
