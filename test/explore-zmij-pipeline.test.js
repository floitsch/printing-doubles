// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import * as Z from "../site/explore/js/zmij-pipeline-model.js";

const rnd64 = () => (BigInt(Math.floor(Math.random() * 2 ** 32)) << 32n) | BigInt(Math.floor(Math.random() * 2 ** 32));

function sample() {
  const out = [];
  for (let i = 0; i < 20000; i++) {
    const b = rnd64() & ~(1n << 63n);
    if ((b >> 52n) === 0x7ffn || b === 0n) continue;
    out.push(Z.fromBits(b));
  }
  for (let e = 1n; e < 2047n; e++) out.push(Z.fromBits(e << 52n)); // all powers of two (normal)
  for (let i = 1n; i < 600n; i++) out.push(Z.fromBits(i)); // smallest subnormals
  for (let i = 0; i < 2000; i++) out.push(Z.fromBits(rnd64() & ((1n << 52n) - 1n)) || 5e-324);
  for (let i = 0; i < 4000; i++) out.push(Number(`${Math.floor(Math.random() * 1e6)}e${Math.floor(Math.random() * 60) - 30}`) || 1);
  return out;
}

// Strings produced by the compiled C++ library (v1.2, commit d1682cb).
const NATIVE = [
  [0.1, "0.1"], [0.3, "0.3"], [0.1 + 0.2, "0.30000000000000004"], [1e23, "1e+23"],
  [5.0507837461e-27, "5.0507837461e-27"], [Number.MAX_VALUE, "1.7976931348623157e+308"],
  [2 / 3, "0.6666666666666666"], [2 ** 64, "1.8446744073709552e+19"], [5e-324, "5e-324"],
  [1e15, "1000000000000000"], [1e16, "1e+16"], [1e-4, "0.0001"], [1e-5, "1e-05"], [1, "1"],
  [123456, "123456"], [-0.3, "-0.3"],
];

test("write() reproduces the native Żmij strings", () => {
  for (const [x, s] of NATIVE) assert.equal(Z.write(x).text, s, String(x));
});

test("digits and exponent equal JavaScript's shortest output; strings follow the layout rules", () => {
  for (const x of sample()) {
    const r = Z.write(x);
    const mine = Z.resultDigits(r);
    const js = Z.jsShortest(x);
    assert.equal(mine.digits, js.digits, `${x}`);
    assert.equal(mine.leadExp, js.leadExp, `${x}`);
    assert.equal(r.text, Z.formatLikeZmij(x), `${x}`);
  }
});

test("decision registers agree with exact rational arithmetic", () => {
  for (const x of sample().slice(0, 3000)) {
    const c = Z.decode(x);
    const core = Z.toDecimal(c.m, c.coreRawExp, c.regular);
    const exact = Z.exactScaled(x, core.q);
    // I:F as one fixed-point number is at most 2 units of 2^-64 below the
    // exact c (so I can be ⌊c⌋ − 1 with F = 0.999… when c is an integer).
    const cExact = (exact.int << 64n) + (exact.num << 64n) / exact.den;
    const diff = cExact - ((core.integralRaw << 64n) + core.fractional);
    assert.ok(diff >= 0n && diff <= 2n, `I:F for ${x}: ${diff}`);
    assert.ok(core.shift >= 6 && core.shift <= 9, "shift in [6, 9]");
    assert.equal(Math.floor((core.q * 217707) / 65536), core.p10.E, "log2 approximation");
    if (core.hasLastDigit && c.regular) assert.ok(core.digit >= 1 && core.digit <= 9, `digit ${core.digit} for ${x}`);
  }
});

test("worked examples on the page", () => {
  const c03 = Z.write(0.3).core;
  assert.equal(c03.k, -17);
  assert.equal(c03.integralRaw, 2999999999999999n);
  assert.equal(c03.roundUp, true);
  assert.equal(c03.p10.hi, 0x8e1bc9bf04000000n);
  assert.equal(c03.fractional, 0xe3940ad9cc000000n);
  assert.equal(c03.halfUlp, 0x470de4df82000000n);
  const c01 = Z.write(0.1).core;
  assert.equal(c01.shift, 7);
  assert.equal(c01.roundDown, true);
  // 1e23: F + h = 2^64 exactly, the carry only happens because of +even.
  const c23 = Z.write(1e23).core;
  assert.equal(c23.fractional + c23.halfUlp, 1n << 64n);
  assert.equal(c23.even, 1n);
  assert.equal(c23.fractional + c23.halfUlpBase, Z.M64);
  const c3 = Z.write(0.1 + 0.2).core;
  assert.equal(c3.hasLastDigit, true);
  assert.equal(c3.digit, 4);
  const p = Z.write(2 ** 64).core;
  assert.equal(p.regular, false);
  assert.equal(p.digit, 2);
  // Tie fix: fraction exactly 1/4.
  const t = Z.write(70368744177664.125);
  assert.equal(t.core.tieFix, true);
  assert.equal(t.text, "70368744177664.12");
  // Source comment example: nonzero 9-bit tail.
  assert.equal(Z.write(5.0507837461e-27).core.tail, 0b011011010n);
});

test("SWAR to_bcd8 turns every tested 8-digit value into its digits", () => {
  const values = [0, 1, 9, 10, 99, 100, 9999, 10000, 12345678, 17976931, 34862315, 50507837, 46100000, 99999999];
  for (let i = 0; i < 100000; i++) values.push(Math.floor(Math.random() * 1e8));
  for (let v = 0; v < 100000000; v += 9973) values.push(v);
  for (const v of values) {
    const b = Z.toBcd8(v);
    assert.equal(Z.lanes(b.digits, 8).join(""), String(v).padStart(8, "0"), `${v}`);
    const lanes32 = Z.lanes(b.abcdEfgh, 32);
    assert.deepEqual(lanes32, [BigInt(Math.floor(v / 10000)), BigInt(v % 10000)]);
    const trimmed = String(v).padStart(8, "0").replace(/0+$/, "");
    assert.equal(b.len, trimmed.length, `len ${v}`);
  }
  assert.equal(Z.toBcd8(17976931).abcdEfgh, 0x0000070500001b13n);
  assert.equal(Z.toBcd8(17976931).abCdEfGh, 0x001100610045001fn);
  assert.equal(Z.toBcd8(17976931).digits, 0x0107090706090301n);
});

test("input parser evaluates presets in double arithmetic", () => {
  assert.equal(Z.parseInput("0.1+0.2"), 0.1 + 0.2);
  assert.equal(Z.parseInput("2/3"), 2 / 3);
  assert.equal(Z.parseInput("2^64"), 2 ** 64);
  assert.equal(Z.parseInput("2**-1074"), 5e-324);
  assert.equal(Z.parseInput("-1e23"), -1e23);
  assert.throws(() => Z.parseInput("3^2"));
});
