// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import * as X from "../site/explore/js/xjb-registers-model.js";
import { shortestDecimal } from "../site/js/oracle.js";

const M64 = X.M64;

// Port of the constexpr table generator of src/ftoa.cpp (double_table_t).
function generatorTable() {
  const hi = (a, b) => (a * b) >> 64n;
  let [w0, w1, w2] = [0xb2e28cedd086d011n, 0x1e53ed49a96272c8n, 0xcc5fc196fefd7d0cn];
  const ten = 0xa000000000000000n;
  const table = new Map();
  for (let i = 0; i < 617; i++) {
    const e10 = i - 293;
    const top = e10 === 0 ? 1n << 63n : (w2 + (e10 >= 0 && e10 <= 27 ? 1n : 0n)) & M64;
    table.set(e10, (top << 64n) | ((w1 + 1n) & M64));
    const h0 = hi(w0, ten), h1 = hi(w1, ten);
    const c0 = (h0 + w1 * ten) & M64;
    const c1 = ((c0 < h0 ? 1n : 0n) + h1 + w2 * ten) & M64;
    const c2 = ((c1 < h1 ? 1n : 0n) + hi(w2, ten)) & M64;
    if (c2 >> 63n) [w0, w1, w2] = [c0, c1, c2];
    else [w0, w1, w2] = [(c0 << 1n) & M64, ((c1 << 1n) | (c0 >> 63n)) & M64, ((c2 << 1n) | (c1 >> 63n)) & M64];
  }
  return table;
}

function reference(v) {
  // Parse String(v) into digits · 10^exp (ECMAScript prints shortest-closest).
  const [mant, e = "0"] = Math.abs(v).toString().split("e");
  const [a, b = ""] = mant.split(".");
  return X.stripZeros(BigInt(a + b), Number(e) - b.length);
}

function randomDouble(rand) {
  const bits = (BigInt(Math.floor(rand() * 2 ** 32)) << 32n) | BigInt(Math.floor(rand() * 2 ** 32));
  return X.fromBits(bits & ((1n << 63n) - 1n));
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("table entries equal the source's constexpr generator for every exponent", () => {
  const table = generatorTable();
  for (let e = -293; e <= 323; e++) assert.equal(X.pow10Entry(e).value, table.get(e), `e=${e}`);
  for (let e = 0; e <= 55; e++) assert.equal(X.pow10Entry(e).exact, true);
  assert.equal(X.pow10Entry(56).exact, false);
});

test("xjb64 port prints the same digits as Number.prototype.toString", () => {
  const rand = mulberry32(714);
  let checked = 0;
  const check = (v) => {
    if (!Number.isFinite(v) || v === 0 || v === 5e-324) return; // 5e-324 is a string constant in the source
    const got = X.xjb64(v);
    const want = reference(v);
    assert.equal(got.digits, want.digits, `digits of ${v}`);
    assert.equal(got.exp, want.exp, `exponent of ${v}`);
    assert.equal(X.formatJs(got.digits, got.exp, v < 0), String(v));
    checked++;
  };
  for (let i = 0; i < 200000; i++) check(randomDouble(rand));
  for (let exp = 1; exp <= 2046; exp++) check(X.fromBits(BigInt(exp) << 52n));
  for (let i = 0; i < 3000; i++) check(X.fromBits(BigInt(Math.floor(rand() * 2 ** 52)) + 2n)); // subnormals
  for (let i = 0; i < 3000; i++) check(Number((rand() * 1000).toFixed(1 + (i % 6)))); // short decimals
  for (const v of [0.3, 0.1 + 0.2, 1.3, 1.5, Math.PI, 123.456, 2 ** 50 + 0.25, 3 * 2 ** -24, 5e-323,
    Number.MAX_VALUE, 2 ** -1022, 1e23, 9007199254740993, -0.3, -(2 ** 64)]) check(v);
  assert.ok(checked > 200000);
});

test("registers of the presets (cross-checked with two independent Python emulations)", () => {
  const a = X.traceRegular(0.1 + 0.2);
  assert.equal(a.c, 5404319552844596n);
  assert.equal(a.q, -54);
  assert.equal(a.k, -17);
  assert.equal(a.h, -1);
  assert.equal(a.pow10, 0x8e1bc9bf04n << 88n); // 10^16 · 2^74, exact
  assert.equal(a.pow10, 10n ** 16n << 74n);
  assert.equal(a.hi64, 0x1550f7dca70000e3n);
  assert.equal(a.lo64, 0x5fa931a000000000n);
  assert.equal(a.m, 3000000000000000n);
  assert.equal(a.dotOne, 0x71afd498d0000000n);
  assert.equal(a.halfUlp, 0x470de4df82000001n);
  assert.equal(a.down, false);
  assert.equal(a.up, false);
  assert.equal(a.one, 4n);

  const b = X.traceRegular(0.3);
  assert.equal(b.dotOne, 0xe3940ad9cc000000n);
  assert.equal(b.halfUlp, 0x470de4df82000000n);
  assert.equal(b.up, true);
  assert.equal(b.mUp, 3000000000000000n);

  const c = X.traceRegular(1.3);
  assert.equal(c.h, -3);
  assert.equal(c.dotOne, 0x0b5e620f48000000n);
  assert.equal(c.halfUlp, 0x1c6bf52634000000n);
  assert.equal(c.down, true);

  const tie = X.traceRegular(2 ** 50 + 0.25);
  assert.equal(tie.dotOne, X.TIE);
  assert.equal(tie.half, 0n);
  assert.equal(tie.one, 2n);
  assert.equal(((tie.dotOne * 10n + X.HALF) >> 64n), 3n); // without the fix: 3 (wrong)
  const tie2 = X.traceRegular(3 * 2 ** -24);
  assert.equal(tie2.dotOne, 3n << 62n);
  assert.equal(tie2.one, 8n);

  const irr = X.irregularBranch(2 ** 89);
  assert.equal(irr.k, 11);
  assert.equal(irr.dotOne, 0x232c000000000000n);
  assert.equal(irr.halfUlp, 0x119799812dea1119n);
  assert.equal(irr.nearest, 1n);
  assert.equal(irr.one, 2n);
  assert.equal(irr.bumped, true);
});

test("registers mean what the page says they mean", () => {
  const rand = mulberry32(99);
  const seenH = new Set();
  for (let i = 0; i < 20000; i++) {
    const v = randomDouble(rand);
    if (!Number.isFinite(v) || v === 0) continue;
    const d = X.decompose(v);
    if (d.irregular) continue;
    const r = X.traceRegular(v);
    assert.ok(r.h >= -4 && r.h <= -1);
    assert.ok(r.c << BigInt(r.h + 10) <= M64, "c << (h+10) never overflows");
    const cell = X.exactCell(r.c, r.q, r.k);
    assert.equal(r.m, cell.m, "m is exact");
    const nFloor = (cell.n.num << 64n) / cell.n.den;
    const diff = r.dotOne - nFloor;
    assert.ok(diff >= 0n && diff <= 1n, `dot_one = floor(n·2^64) + {0,1}, got +${diff}`);
    if (!seenH.has(r.q)) {
      seenH.add(r.q);
      assert.equal(r.shifted, (cell.H.num << 64n) / cell.H.den, "p_hi >> -h is floor(H·2^64)");
    }
    // tie detection: dot_one == 2^62 exactly when n == 1/4
    assert.equal(r.dotOne === X.TIE, cell.n.num * 4n === cell.n.den);
    // H in [0.05, 0.5)
    assert.ok(cell.H.num * 20n >= cell.H.den && cell.H.num * 2n < cell.H.den);
    assert.ok(!(r.up && r.down));
  }
});

test("p_hi >> -h equals floor(H·2^64) for every binary exponent", () => {
  for (let exp = 0; exp <= 2046; exp++) {
    const v = X.fromBits((BigInt(exp) << 52n) | 1n);
    const r = X.traceRegular(v);
    const cell = X.exactCell(r.c, r.q, r.k);
    assert.equal(r.shifted, (cell.H.num << 64n) / cell.H.den, `exp=${exp}`);
  }
});

// Exact shortest-closest search in an arbitrary closed interval (for the
// symmetric-rule counterfactual on powers of two).
function shortestIn(start, center, lo, hi) {
  for (let exp = start; exp >= start - 20; exp--) {
    // candidates t · 10^exp with lo <= t·10^exp <= hi
    const scale = (r) => (exp >= 0 ? { num: r.num, den: r.den * 10n ** BigInt(exp) } : { num: r.num * 10n ** BigInt(-exp), den: r.den });
    const L = scale(lo), H = scale(hi), C = scale(center);
    const first = (L.num + L.den - 1n) / L.den;
    const last = H.num / H.den;
    if (first > last) continue;
    let best = first;
    let bestDist = null;
    for (let t = first; t <= last; t++) {
      const dist = t * C.den - C.num < 0n ? C.num - t * C.den : t * C.den - C.num;
      if (bestDist === null || dist < bestDist || (dist === bestDist && t % 2n === 0n)) { best = t; bestDist = dist; }
    }
    return X.stripZeros(best, exp);
  }
  throw new Error("none");
}

test("power-of-two census: counts shown on the page", () => {
  const census = X.powerOfTwoCensus();
  assert.deepEqual(census, { total: 2046, symmetricWrong: 255, symmetricBadReadBack: 255, kDiffers: 256, bumps: 26, carries: 582, publishedWrong: 476 });
  let publishedWrong = 0;
  const bumpExps = [];
  for (let exp = 1; exp <= 2046; exp++) {
    const v = X.fromBits(BigInt(exp) << 52n);
    const irr = X.irregularBranch(v);
    if (irr.bumped && !irr.upDown) bumpExps.push(exp);
    // The README's exact algorithm agrees with the register branch.
    const ex = X.exactIrregular(v);
    assert.equal(ex.k, irr.k);
    assert.equal(ex.up, irr.up);
    // The published Algorithm 1 has no carry test for irregular numbers.
    const published = ex.down ? 10n * ex.m : 10n * ex.m + (ex.belowLower ? ex.floor10 + 1n : ex.nearest);
    if (published !== ex.coefficient) {
      publishedWrong++;
      // …and the published answer is not the shortest: the correct one has fewer digits.
      assert.ok(X.stripZeros(published, ex.k).digits.toString().length > X.stripZeros(ex.coefficient, ex.k).digits.toString().length);
    }
    assert.equal(ex.coefficient, irr.coefficient, `exp=${exp}`);
    // k' = floor(log10(3/4 · 2^q))
    const r = { num: 3n << BigInt(Math.max(ex.q, 0)), den: 4n << BigInt(Math.max(-ex.q, 0)) };
    const p = (e) => (e >= 0 ? { num: 10n ** BigInt(e), den: 1n } : { num: 1n, den: 10n ** BigInt(-e) });
    const le = (a, b) => a.num * b.den <= b.num * a.den;
    assert.ok(le(p(ex.k), r) && !le(p(ex.k + 1), r));
    // symmetric counterfactual = exact shortest in [v − 2^(q−1), v + 2^(q−1)]
    const sym = X.symmetricResult(v);
    const q = ex.q;
    // Build everything over a common denominator 2^D.
    const D = BigInt(Math.max(0, -(q - 1)) + 2);
    const center = { num: (1n << 52n) << (BigInt(q) + D), den: 1n << D };
    const half = { num: 1n << (BigInt(q - 1) + D), den: 1n << D };
    const want = shortestIn(Math.floor(Math.log10(v)) + 1, center, { num: center.num - half.num, den: center.den }, { num: center.num + half.num, den: center.den });
    assert.equal(sym.digits, want.digits, `sym exp=${exp}`);
    assert.equal(sym.exp, want.exp, `sym exp=${exp}`);
    if (sym.digits !== X.xjb64(v).digits || sym.exp !== X.xjb64(v).exp) {
      assert.equal(Number(X.formatJs(sym.digits, sym.exp)), X.nextDown(v), "wrong symmetric answers read back as the lower neighbour");
    }
  }
  assert.equal(publishedWrong, 476);
  assert.deepEqual(bumpExps, [6, 16, 66, 232, 235, 245, 328, 534, 657, 727, 883, 926, 946, 1112, 1205, 1298, 1328, 1368, 1401, 1421, 1428, 1504, 1597, 1617, 1886, 1999]);
});

test("worked examples of the power-of-two panel", () => {
  const a = X.exactIrregular(2 ** 64);
  assert.equal(a.k, 3);
  assert.equal(X.fracString(a.n.num, a.n.den, 4), "0.1616");
  assert.equal(X.formatJs(...Object.values(X.stripZeros(a.coefficient, a.k))), "18446744073709552000");
  const s64 = X.symmetricResult(2 ** 64);
  assert.equal(X.formatJs(s64.digits, s64.exp), "18446744073709550000");
  assert.equal(Number("18446744073709550000"), 2 ** 64 - 2048);
  const b = X.exactIrregular(2 ** 89);
  assert.equal(b.nearest, 1n);
  assert.equal(b.belowLower, true);
  assert.equal(b.one, 2n);
  const s89 = X.symmetricResult(2 ** 89);
  assert.equal(X.formatJs(s89.digits, s89.exp), "6.189700196426901e+26");
  assert.equal(Number("6.189700196426901e+26"), X.nextDown(2 ** 89));
});

test("oracle agreement on a few presets", () => {
  for (const v of [0.3, 0.1 + 0.2, 1.3, 2 ** 89, 2 ** 64]) {
    const s = shortestDecimal(v);
    const got = X.xjb64(v);
    assert.equal(got.digits, s.coefficient);
    assert.equal(got.exp, s.exponent);
  }
});

test("input parser", () => {
  assert.equal(X.parseInput("0.1+0.2"), 0.1 + 0.2);
  assert.equal(X.parseInput("2**64"), 2 ** 64);
  assert.equal(X.parseInput("2^89"), 2 ** 89);
  assert.equal(X.parseInput("2^50 + 1/4"), 2 ** 50 + 0.25);
  assert.equal(X.parseInput("3*2^-24"), 3 * 2 ** -24);
  assert.equal(X.parseInput("-2^3"), -8);
  assert.equal(X.parseInput("pi"), Math.PI);
  assert.equal(X.parseInput("1e-7"), 1e-7);
  assert.equal(X.parseInput("0x3FD3333333333334"), 0.1 + 0.2);
  assert.throws(() => X.parseInput("alert(1)"));
  assert.throws(() => X.parseInput("1+"));
});
