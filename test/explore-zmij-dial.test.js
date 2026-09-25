// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import {
  zmij, jsShortest, zmijFormat, parseInput, halfUlpForExponent, pow10Significand,
  ratToDecimal, neighbour, TWO64, M64, pow10,
} from "../site/explore/js/zmij-dial-model.js";
import { fromBits } from "../site/js/float.js";

// Deterministic 64-bit generator (xorshift64*).
function rng(seed) {
  let s = BigInt(seed) || 1n;
  return () => {
    s ^= s >> 12n; s ^= (s << 25n) & M64; s ^= s >> 27n;
    return (s * 0x2545f4914f6cdd1dn) & M64;
  };
}

function sameAsJs(x) {
  const z = zmij(x, { exact: false });
  const ref = jsShortest(x);
  assert.equal(z.digits, ref.digits, `digits of ${x}`);
  assert.equal(z.leadExp, ref.leadExp, `exponent of ${x}`);
  assert.equal(Number(z.text), Math.abs(x), `round trip of ${z.text}`);
  if (z.hasLastDigit) assert.ok(z.digit >= 1 && z.digit <= 9, `appended digit of ${x} is ${z.digit}`);
  if (!z.subnormal) {
    // write(): leading exponent = k + 15 + (I >= 10^15); I has 15 or 16 digits.
    assert.equal(z.leadExp, z.k + 15 + (z.sig >= 10n ** 15n ? 1 : 0), `leading exponent of ${x}`);
    assert.ok(z.sig >= 10n ** 14n && z.sig < 10n ** 16n, `digits of I for ${x}`);
  }
  assert.ok(!(z.roundUp && z.roundDown), `exclusive flags for ${x}`);
  return z;
}

test("pow10 table entries are the rounded-down 128-bit significands", () => {
  const p = pow10Significand(16);
  assert.equal(p.hi, 0x8e1bc9bf04000000n);
  assert.equal(p.lo, 0n);
  const q = pow10Significand(-8);
  assert.equal(p.sig >> 127n, 1n);
  assert.equal(q.hi, 0xabcc77118461cefcn);
  assert.equal(q.lo, 0xfdc20d2b36ba7c3dn);
  // 10^-8 ≈ q.sig · 2^(-127-27): check floor property exactly.
  assert.ok(q.sig * pow10(8) < 1n << 154n && (q.sig + 1n) * pow10(8) > 1n << 154n);
});

test("port agrees with JavaScript's shortest output on 200k random bit patterns", () => {
  const next = rng(20260925);
  let n = 0;
  while (n < 200000) {
    const bits = next() & 0x7fffffffffffffffn;
    const x = fromBits(bits);
    if (!Number.isFinite(x) || x === 0) continue;
    sameAsJs(x);
    n++;
  }
});

test("port agrees on all powers of two, all (e<<52)|1, and subnormals", () => {
  for (let raw = 0n; raw < 2047n; raw++) {
    if (raw > 0n) sameAsJs(fromBits(raw << 52n));
    sameAsJs(fromBits((raw << 52n) | 1n));
    sameAsJs(fromBits((raw << 52n) | ((1n << 52n) - 1n)));
  }
  for (let i = 1n; i < 20000n; i++) sameAsJs(fromBits(i));
  for (const x of [Number.MAX_VALUE, Number.MIN_VALUE, 2.2250738585072014e-308, 1e23, 9007199254740993, 5.0507837461e-27]) sameAsJs(x);
});

test("port agrees on Math.random values and short decimals always take the short path", () => {
  for (let i = 0; i < 50000; i++) sameAsJs(Math.random() || 0.5);
  const next = rng(7);
  for (let i = 0; i < 50000; i++) {
    const nd = 1 + Number(next() % 15n);
    const digits = (next() % pow10(nd)).toString() || "1";
    const x = Number(`${digits}e${Number(next() % 41n) - 20}`);
    if (x === 0) continue;
    const z = sameAsJs(x);
    if (z.regular) assert.notEqual(z.decision, "digit", `short decimal ${x}`);
  }
});

test("scaled half-ulp stays in [0.05, 0.5) for every regular exponent; shift in [6, 9]", () => {
  for (let e = -1074; e <= 971; e++) {
    const h = halfUlpForExponent(e);
    // 0.05 ≤ exact h < 0.5  ⇔  den ≤ 20·num and 2·num < den
    assert.ok(h.exact.den <= 20n * h.exact.num && 2n * h.exact.num < h.exact.den, `h at e=${e}`);
    assert.ok(h.shift >= 6 && h.shift <= 9, `shift at e=${e}`);
  }
});

test("the machine decision matches the exact geometric decision (regular path)", () => {
  const next = rng(99);
  let exactIntegers = 0;
  for (let i = 0; i < 40000; i++) {
    const x = fromBits(next() & 0x7fefffffffffffffn);
    if (x === 0 || !Number.isFinite(x)) continue;
    const z = zmij(x);
    if (!z.regular) continue;
    const { frac, h } = z.exact;
    // compare frac ± h with 0 and 1 in exact arithmetic
    const L = frac.num * h.den, H = h.num * frac.den, D = frac.den * h.den;
    const up = z.rawEven ? L + H >= D : L + H > D;
    const down = z.rawEven ? L <= H : L < H;
    if (frac.num === 0n && z.F !== 0n) {
      // c is exactly an integer, but the truncated power of ten puts the
      // machine a hair below it: F ≈ 1 − ε, and the carry lands on the same integer.
      assert.equal(z.roundUp, true);
      assert.equal(z.sig, z.exact.I);
      exactIntegers++;
      continue;
    }
    assert.equal(z.roundUp, up, `up for ${x}`);
    assert.equal(z.roundDown, down, `down for ${x}`);
    if (!up && !down) {
      // nearest tenth, ties to even
      const t = frac.num * 10n, q = t / frac.den, r = t % frac.den;
      let d = 2n * r > frac.den ? q + 1n : q;
      if (2n * r === frac.den && q % 2n === 1n) d = q + 1n;
      assert.equal(BigInt(z.digit), d, `digit for ${x}`);
    }
  }
  assert.ok(exactIntegers > 0);
});

test("an exact-integer c shows up as F just below a full turn", () => {
  const z = zmij(12619493120514930);
  assert.equal(z.F, M64);
  assert.equal(z.integral0 + 1n, z.exact.I);
  assert.equal(z.decision, "up");
  assert.equal(z.text, "1.261949312051493e+16");
});

test("worked examples shown on the page", () => {
  const z3 = zmij(0.3);
  assert.equal(z3.integral0, 2999999999999999n);
  assert.equal(z3.sig, 3000000000000000n);
  assert.equal(z3.F, 0xe3940ad9cc000000n);
  assert.equal(z3.h, 0x470de4df82000000n);
  assert.equal(z3.sum, 0x12aa1efb94e000000n);
  assert.equal(z3.decision, "up");
  assert.equal(ratToDecimal(z3.exact.frac, 10).text, "0.8889776975");
  assert.equal(ratToDecimal(z3.exact.h, 10).text, "0.2775557561");
  assert.equal(z3.k, -17);
  assert.equal(z3.text, "0.3");

  const z1 = zmij(0.1);
  assert.equal(z1.decision, "down");
  assert.equal(z1.integral0, 1000000000000000n);

  const z23 = zmij(1e23);
  assert.equal(z23.e, 24);
  assert.equal(z23.rawEven, true);
  assert.equal(z23.k, 7);
  assert.equal(z23.F, 0xea86711dcf73c620n);
  assert.equal(z23.h, 0x15798ee2308c39dfn + 1n);
  assert.equal(z23.sum, TWO64);
  assert.equal(z23.evenAdd, 1n);
  assert.equal(z23.decision, "up");
  assert.equal(ratToDecimal(z23.exact.frac, 20).text, "0.91611392");
  assert.equal(ratToDecimal(z23.exact.h, 20).text, "0.08388608");
  const odd = zmij(1e23, { pretendOdd: true });
  assert.equal(odd.sum, TWO64 - 1n);
  assert.equal(odd.decision, "digit");
  assert.equal(odd.text, "9.999999999999999e+22");

  const t = zmij(70368744177664.125);
  assert.equal(t.F, 1n << 62n);
  assert.equal(t.digitRaw, 3);
  assert.equal(t.digit, 2);
  assert.equal(t.text, "70368744177664.12");

  const s = zmij(1 / 7);
  assert.equal(s.digit, 5);
  assert.equal(ratToDecimal(s.exact.frac, 4).text, "0.4921");

  assert.equal(zmij(0.3).m, 5404319552844595n);
  assert.equal(zmij(0.3).e, -54);
  let bumped = 0;
  for (let raw = 1n; raw < 2047n; raw++) if (zmij(fromBits(raw << 52n), { exact: false }).clamped) bumped++;
  assert.equal(bumped, 26);
  assert.notEqual(Number("7.120236347223044e-307"), 2 ** -1017);
  const p = zmij(2 ** -1017);
  assert.equal(p.regular, false);
  assert.equal(p.digitRaw, 4);
  assert.equal(p.digit, 5);
  assert.equal(p.clamped, true);
  assert.equal(p.text, "7.120236347223045e-307");

  const tiny = zmij(5e-324);
  assert.equal(tiny.integral0, 0n);
  assert.equal(tiny.digit, 5);

  assert.equal(zmij(2 / 3).digit, 6);
  assert.equal(zmij(0.1 + 0.2).digit, 4);
});

test("Żmij layout and input parsing", () => {
  assert.equal(zmijFormat("1", 15), "1000000000000000");
  assert.equal(zmijFormat("1", 16), "1e+16");
  assert.equal(zmijFormat("1", -4), "0.0001");
  assert.equal(zmijFormat("1", -5), "1e-05");
  assert.equal(zmijFormat("5", -324), "5e-324");
  assert.equal(zmijFormat("17976931348623157", 308), "1.7976931348623157e+308");
  assert.equal(parseInput("2/3"), 2 / 3);
  assert.equal(parseInput("0.1+0.2"), 0.30000000000000004);
  assert.equal(parseInput("2^-1017"), 2 ** -1017);
  assert.equal(parseInput("0x3fd3333333333333"), 0.3);
  assert.equal(parseInput("abc"), null);
  assert.equal(neighbour(0.3, 1), 0.30000000000000004);
});

test("walking to the next double moves the point by exactly one ulp (2h)", () => {
  let x = 0.3;
  for (let i = 0; i < 40; i++) {
    const a = zmij(x), y = neighbour(x, 1), b = zmij(y);
    if (a.e !== b.e || !a.regular || !b.regular) { x = y; continue; }
    // (I_b + frac_b) − (I_a + frac_a) = 2h exactly
    const lhs = (b.exact.I - a.exact.I) * a.exact.frac.den * b.exact.frac.den
      + b.exact.frac.num * a.exact.frac.den - a.exact.frac.num * b.exact.frac.den;
    const D = a.exact.frac.den * b.exact.frac.den;
    assert.equal(lhs * a.exact.u.den, a.exact.u.num * D);
    x = y;
  }
});
