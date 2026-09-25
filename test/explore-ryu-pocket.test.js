// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/ryu-pocket-model.js";
import { shortestDecimal } from "../site/js/oracle.js";

const H = M.FORMATS.half, D = M.FORMATS.double, BF = M.FORMATS.bfloat16;
const norm = (r) => M.normalizeDigits(r.output, r.exponent);
const steps = (r) => r.steps.map((s) => [s.vm, s.vr, s.vp, s.last].join("/"));

test("parseToBits rounds decimals to the nearest half (ties to even)", () => {
  assert.equal(M.parseToBits(H, "0.1"), 0x2e66n);
  assert.equal(M.parseToBits(H, "3.14"), 0x4248n);
  assert.equal(M.parseToBits(H, "65504"), 0x7bffn);
  assert.equal(M.parseToBits(H, "65519"), 0x7bffn);
  assert.equal(M.parseToBits(H, "65520"), 0x7c00n); // rounds to infinity
  assert.equal(M.parseToBits(H, "2049"), 0x6800n); // tie → even (2048)
  assert.equal(M.parseToBits(H, "2051"), 0x6802n); // tie → even (2052)
  assert.equal(M.parseToBits(H, "6e-8"), 1n);
  assert.equal(M.parseToBits(H, "2.98e-8"), 0n); // below half the smallest subnormal
  assert.equal(M.parseToBits(H, "-1"), 0xbc00n);
  assert.equal(M.parseToBits(H, "0x3c00"), 0x3c00n);
  assert.equal(M.valueOf(H, 0x2e66n), 0.0999755859375);
  // agree with the double parser composed with exact rounding on many values
  for (let b = 1n; b < 0x7c00n; b += 37n) assert.equal(M.parseToBits(H, M.exactDecimalString(M.decode(H, b).m2, M.decode(H, b).e2 + 2)), b);
});

test("pocket Ryū on half 0.1 matches the hand calculation", () => {
  const r = M.ryu(H, 0x2e66n);
  assert.equal(r.m2, 1638n);
  assert.equal(r.e2, -16);
  assert.deepEqual([r.mm, r.mv, r.mp], [6550n, 6552n, 6554n]);
  assert.equal(r.acceptBounds, true);
  assert.equal(r.q, 10);
  assert.equal(r.e10, -6);
  assert.equal(r.scale.i, 6);
  assert.equal(r.scale.mul, 2000000n);
  assert.equal(r.scale.shift, 17);
  assert.equal(6552n * 15625n, 102375000n);
  assert.deepEqual(r.start, { vm: 99945n, vr: 99975n, vp: 100006n });
  assert.deepEqual(steps(r), ["9994/9997/10000/5", "999/999/1000/7", "99/99/100/9", "9/9/10/9", "0/0/1/9"]);
  assert.equal(r.outside, true);
  assert.equal(r.output, 1n);
  assert.equal(r.exponent, -1);
  assert.equal(r.text, "0.1");
});

test("pocket Ryū on half 3.140625 prints 3.14", () => {
  const r = M.ryu(H, 0x4248n);
  assert.equal(M.valueOf(H, 0x4248n), 3.140625);
  assert.deepEqual(r.start, { vm: 313964n, vr: 314062n, vp: 314160n });
  assert.equal(r.scale.i, 5);
  assert.equal(r.text, "3.14");
});

test("half presets exercise the rounding rules", () => {
  const tie = M.ryu(H, M.parseToBits(H, "0.15625"));
  assert.equal(tie.tie, true);
  assert.equal(tie.text, "0.1562");
  const bound = M.ryu(H, M.parseToBits(H, "4112"));
  assert.equal(bound.e2, 0);
  assert.equal(bound.q, 0);
  assert.ok(bound.steps.some((s) => s.loop === 2));
  assert.equal(bound.text, "4110");
  const lop = M.ryu(H, M.parseToBits(H, "0.015625"));
  assert.equal(lop.mmShift, 0n);
  assert.equal(lop.outside, true);
  assert.equal(lop.final.last < 5n, true);
  assert.equal(lop.text, "0.01563");
  assert.equal(M.ryu(H, 0x7bffn).text, "65500");
  assert.equal(M.ryu(H, 1n).text, "6.0e-8".replace(".0", ""));
  const up = M.ryu(H, M.parseToBits(H, "256.25"));
  assert.equal(up.afterFlags.vpExactDrop, true);
  assert.equal(up.text, "256.2");
});

test("pocket Ryū is shortest and closest on every positive finite half", () => {
  for (let b = 1n; b < 0x7c00n; b++) {
    const r = M.ryu(H, b);
    const ref = M.referenceShortest(H, b);
    const got = norm(r);
    assert.ok(got.digits === ref.digits && got.exponent === ref.exponent, `half 0x${b.toString(16)}`);
    // floors are exact
    assert.equal(r.start.vr, M.exactFloor(r.mv, r.e2, r.e10));
    assert.equal(r.start.vm, M.exactFloor(r.mm, r.e2, r.e10));
    // and every multiplier is exact (5^i has at most 21 bits)
    if (r.e2 < 0) assert.ok(r.scale.k <= 0);
    else assert.equal(r.q, 0);
  }
});

test("binary64: the same code with 125-bit constants matches the d2s.c table", () => {
  const inv = [
    [1n, 2305843009213693952n], [11068046444225730970n, 1844674407370955161n],
    [5165088340638674453n, 1475739525896764129n], [7821419487252849886n, 1180591620717411303n],
    [8824922364862649494n, 1888946593147858085n], [7059937891890119595n, 1511157274518286468n],
  ];
  for (let q = 0; q < inv.length; q++) {
    const k = 125 + M.pow5bits(q) - 1;
    assert.equal((1n << BigInt(k)) / M.pow5(q) + 1n, inv[q][0] + (inv[q][1] << 64n));
  }
  const r = M.ryu(D, M.doubleBits(5e-324));
  assert.equal(r.scale.mul, 32836294410387009994688234313321054992n);
  assert.equal(r.scale.shift, 121);
  assert.deepEqual(r.start, { vm: 24n, vr: 49n, vp: 74n });
  assert.equal(r.text, "5e-324");
});

test("binary64 presets", () => {
  const r3 = M.ryu(D, M.doubleBits(0.3));
  assert.deepEqual(r3.start, { vm: 299999999999999961n, vr: 299999999999999988n, vp: 300000000000000016n });
  assert.equal(r3.q, 38); assert.equal(r3.e10, -18); assert.equal(r3.scale.shift, 121);
  assert.equal(r3.scale.mul, M.pow5(18) << 83n);
  assert.equal(r3.removed, 17); assert.equal(r3.text, "0.3");
  const r23 = M.ryu(D, M.doubleBits(1e23));
  assert.deepEqual(r23.start, { vm: 999999999999999832n, vr: 999999999999999916n, vp: 1000000000000000000n });
  assert.equal(r23.q, 5); assert.equal(r23.scale.shift, 119);
  assert.equal(r23.text, "1e+23");
  const r7 = M.ryu(D, M.doubleBits(7e22));
  assert.equal(r7.afterFlags.vmTZ, true);
  assert.ok(r7.steps.some((s) => s.loop === 2));
  assert.equal(r7.text, "7e+22");
  const rt = M.ryu(D, M.doubleBits(2 ** -25));
  assert.equal(rt.tie, true); assert.equal(rt.text, "2.9802322387695312e-8");
});

test("binary64 random doubles: exact floors and shortest output", () => {
  const rand = M.mulberry32(7);
  for (let n = 0; n < 20000; n++) {
    const { E, m2 } = M.randomDoubleFields(rand);
    const x = M.doubleFromFields(E, m2);
    const r = M.ryu(D, M.doubleBits(x));
    assert.equal(r.start.vr, M.exactFloor(r.mv, r.e2, r.e10));
    assert.equal(r.start.vm, M.exactFloor(r.mm, r.e2, r.e10));
    assert.equal(Number(r.text), x);
    assert.deepEqual(norm(r), jsDigits(x));
  }
  for (const x of [0.3, 1e23, 123.456, 2 ** -1017, 1.7976931348623157e308]) {
    const s = shortestDecimal(x);
    const r = M.ryu(D, M.doubleBits(x));
    assert.deepEqual(norm(r), M.normalizeDigits(s.coefficient, s.exponent));
  }
});
// JS's own shortest digits, from toExponential() without an argument.
function jsDigits(x) {
  const [mant, exp] = x.toExponential().split("e");
  const digits = mant.replace(".", "");
  return M.normalizeDigits(BigInt(digits), Number(exp) - (digits.length - 1));
}

test("solveRange finds the smallest x with a·x mod m in [l, r]", () => {
  const rand = M.mulberry32(3);
  for (let n = 0; n < 3000; n++) {
    const m = BigInt(2 + Math.floor(rand() * 400));
    const a = BigInt(Math.floor(rand() * Number(m)));
    let l = BigInt(Math.floor(rand() * Number(m))), r = BigInt(Math.floor(rand() * Number(m)));
    if (l > r) [l, r] = [r, l];
    let want = null;
    for (let x = 0n; x < m; x++) { const c = (a * x) % m; if (c >= l && c <= r) { want = x; break; } }
    assert.equal(M.solveRange(a, m, l, r), want, `a=${a} m=${m} [${l},${r}]`);
  }
});

test("verified needles", () => {
  const n100 = M.needleReport(1.9939634903624638e47, 100);
  assert.deepEqual(n100.wrong, [2]);
  assert.equal(n100.badText, "1.993963490362464e+47");
  assert.equal(n100.readsBack, false);
  const n112 = M.needleReport(5.5624373126011584e212, 112);
  assert.deepEqual(n112.wrong, [1]);
  assert.equal(n112.badText, "5.5624373126011585e+212");
  assert.equal(n112.outputDiffers, true);
  const n116 = M.needleReport(1.3588129002659584e-245, 116);
  assert.deepEqual(n116.wrong, [1]);
  assert.equal(n116.badText, "1.3588129002659583e-245");
  const n123 = M.needleReport(1.85006342392073e233, 123);
  assert.deepEqual(n123.wrong, [1]);
  assert.equal(n123.outputDiffers, false);
  // at the real width nothing is wrong
  for (const x of [1.9939634903624638e47, 5.5624373126011584e212, 1.3588129002659584e-245, 1.85006342392073e233]) {
    assert.deepEqual(M.needleReport(x, 125).wrong, []);
    assert.deepEqual(M.needleReport(x, 124).wrong, []);
  }
});

test("adversarial hunt: last needles at 123 (e2 ≥ 0) and 122 (e2 < 0), none at 124", () => {
  const h123 = M.makeHunter(123).run(3000);
  assert.equal(h123.exponentsWithNeedle, 1);
  assert.equal(h123.needles[0].x, 1.85006342392073e233);
  const h122 = M.makeHunter(122).run(3000);
  assert.equal(h122.negNeedles, 1);
  assert.ok(h122.needles.some((n) => n.x === 2.1789991853451517e-166));
  for (const B of [124, 125]) {
    const h = M.makeHunter(B).run(3000);
    assert.equal(h.exponentsWithNeedle, 0);
    assert.equal(h.undecided, 0);
  }
});

test("stored chart data is reproducible (subset)", () => {
  for (const B of [100, 116, 120]) {
    const h = M.makeHunter(B).run(3000);
    assert.deepEqual([B, h.exponentsWithNeedle, h.posNeedles, h.negNeedles, h.undecided], M.CHART_HUNT.find((r) => r[0] === B));
  }
  for (const B of [64, 70, 77]) {
    const r = M.makeRandomTester(B, 1).run(100000);
    assert.deepEqual([B, r.exponents.size, r.wrongFloors, r.wrongOutputs], M.CHART_RANDOM.find((row) => row[0] === B));
  }
});

test("bfloat16 exhaustive lab", () => {
  const want = { 20: [1620, 181], 24: [83, 52], 28: [12, 9], 33: [1, 1], 34: [0, 0] };
  for (const [B, [wrong, exps]] of Object.entries(want)) {
    const r = M.exhaustiveSmall(BF, Number(B));
    assert.equal(r.total, 97917);
    assert.equal(r.wrong, wrong);
    assert.equal(r.exponentsAffected, exps);
  }
  const lone = M.exhaustiveSmall(BF, 33).examples[0];
  assert.equal(lone.m2, 172n);
  assert.equal(lone.e2, 36);
  assert.equal(172n << 38n, 47278999994368n);
  assert.deepEqual([lone.exact, lone.trunc], [47278n, 47279n]);
  for (let b = 1n; b < 0x7f80n; b += 7n) {
    const ref = M.referenceShortest(BF, b);
    const got = norm(M.ryu(BF, b, { B: 34 }));
    assert.ok(got.digits === ref.digits && got.exponent === ref.exponent);
  }
});

test("parseToBits agrees with the JS parser on binary64", () => {
  const rand = M.mulberry32(11);
  for (const t of ["0.3", "1e23", "5e-324", "2.4703282292062328e-324", "2.4703282292062327e-324", "1.7976931348623157e308", "1.7976931348623159e308", "123.456", "9007199254740993"]) {
    assert.equal(M.parseToBits(D, t), M.doubleBits(Number(t)), t);
  }
  for (let n = 0; n < 2000; n++) {
    const { E, m2 } = M.randomDoubleFields(rand);
    const x = M.doubleFromFields(E, m2);
    const t = x.toPrecision(1 + Math.floor(rand() * 20));
    assert.equal(M.parseToBits(D, t), M.doubleBits(Number(t)), t);
  }
});
