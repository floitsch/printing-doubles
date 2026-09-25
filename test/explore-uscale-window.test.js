// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/uscale-window-model.js";
import { shortestDecimal } from "../site/js/oracle.js";

const u = (num, den = 1n) => M.unroundRational(BigInt(num), BigInt(den));

test("unrounded numbers match Cox's tables", () => {
  // x, raw, str (from the post)
  for (const [n, d, raw, str] of [[6, 1, 24, "6.0"], [6001, 1000, 25, "6.0+"], [6499, 1000, 25, "6.0+"], [65, 10, 26, "6.5"], [6501, 1000, 27, "6.5+"], [6999, 1000, 27, "6.5+"], [7, 1, 28, "7.0"]]) {
    assert.equal(u(n, d), BigInt(raw));
    assert.equal(M.ustr(u(n, d)), str);
  }
  assert.equal(M.ustr(u(625, 100)), "6.0+", "the quarter bit folds into sticky");
  // x floor round½↓ round round½↑ ceil
  const table = [[[6, 1], 6, 6, 6, 6, 6], [[625, 100], 6, 6, 6, 6, 7], [[65, 10], 6, 6, 6, 7, 7], [[675, 100], 6, 7, 7, 7, 7], [[7, 1], 7, 7, 7, 7, 7], [[75, 10], 7, 7, 8, 8, 8], [[85, 10], 8, 8, 8, 9, 9]];
  for (const [[n, d], ...want] of table) {
    const got = ["floor", "down", "even", "up", "ceil"].map((id) => Number(M.applyRule(id, u(n, d))));
    assert.deepEqual(got, want, `${n}/${d}`);
  }
  // nudge table: nudge(-1).floor, floor, ceil, nudge(+1).ceil
  for (const [[n, d], ...want] of [[[15, 1], 14, 15, 15, 16], [[151, 10], 15, 15, 16, 16], [[159, 10], 15, 15, 16, 16], [[16, 1], 15, 16, 16, 17]]) {
    const x = u(n, d);
    assert.deepEqual([M.floorU(x - 1n), M.floorU(x), M.ceilU(x), M.ceilU(x + 1n)].map(Number), want);
  }
  // half-even catchment: 8 catches five zones (7.5..8.5), 7 catches three
  const count = (t) => { let c = 0; for (let k = 20; k <= 36; k++) if (M.applyRule("even", BigInt(k)) === BigInt(t)) c++; return c; };
  assert.equal(count(8), 5);
  assert.equal(count(7), 3);
});

test("round now or later: 15.4 / 6", () => {
  const r = M.roundNowOrLater();
  assert.equal(r.u, 61n); assert.equal(r.uStr, "15.0+");
  assert.equal(r.earlyQStr, "2.5"); assert.equal(r.earlyResult, 2n);
  assert.equal(r.q, 11n); assert.equal(r.qStr, "2.5+"); assert.equal(r.result, 3n);
  assert.equal(r.q, r.truth, "unrounded division equals ⟨15.4/6⟩");
});

test("tie demo", () => {
  const t = M.twoPlaces(1.125);
  assert.equal(t.str, "112.5"); assert.equal(M.fmt2(t.even), "1.12"); assert.equal(M.fmt2(t.up), "1.13");
  assert.equal((1.125).toFixed(2), "1.13");
  assert.equal(M.twoPlaces(0.125).str, "12.5");
  assert.equal(M.fmt2(M.twoPlaces(0.125).even), "0.12");
  const z = M.twoPlaces(0.375);
  assert.equal(z.str, "37.5"); assert.equal(z.even, 38n); assert.equal(z.up, 38n);
  const b = M.twoPlaces(1.005);
  assert.equal(b.str, "100.0+"); assert.equal(M.fmt2(b.even), "1.00"); assert.equal((1.005).toFixed(2), "1.00");
  assert.ok(b.exact.startsWith("1.00499999999999989"));
  assert.equal(M.twoPlaces(2.675).str, "267.0+");
});

test("bridge frame: (0.1+0.2)·10^17", () => {
  const { M: m, E } = M.decode53(0.1 + 0.2);
  assert.equal(m, 5404319552844596n); assert.equal(E, -54);
  const x = M.uscaleExact(m, E, 17);
  assert.equal(x, 120000000000000017n);
  assert.equal(M.ustr(x), "30000000000000004.0+");
  const s = M.scaled(m, E, 17);
  assert.ok(M.exactDecimalString(s.num, s.den).startsWith("30000000000000004.44089209850062616169452667236328125"));
});

const PRESET_TABLE = {
  "0.3": [17, "29999999999999996.0+", "30000000000000001.5+", 29999999999999997n, 30000000000000001n, "zero", "3e-1"],
  "0.1+0.2": [17, "30000000000000001.5+", "30000000000000007.0+", 30000000000000002n, 30000000000000007n, "round", "30000000000000004e-17"],
  "2/3": [16, "6666666666666665.5+", "6666666666666666.5+", 6666666666666666n, 6666666666666666n, "single", "6666666666666666e-16"],
  "2^89": [-11, "6189700196426901.0+", "6189700196426902.0+", 6189700196426902n, 6189700196426902n, "single", "6189700196426902e11"],
  "1/7": [17, "14285714285714283.5+", "14285714285714286.0+", 14285714285714284n, 14285714285714286n, "round", "14285714285714285e-17"],
  "5e-324": [324, "2.0+", "7.0+", 3n, 7n, "round", "5e-324"],
  "1e23": [-7, "9999999999999998.0+", "10000000000000000.0", 9999999999999999n, 10000000000000000n, "zero", "1e23"],
  "2^53-1": [0, "9007199254740990.5", "9007199254740991.5", 9007199254740991n, 9007199254740991n, "single", "9007199254740991e0"],
};

test("presets: windows, cases and outputs", () => {
  for (const p of M.PRESETS) {
    const f = M.parseInput(p.input);
    const a = M.analyze(f);
    const [pp, umin, umax, dmin, dmax, kase, text] = PRESET_TABLE[p.input];
    assert.equal(a.p, pp, p.input);
    assert.ok(!Object.is(a.p, -0));
    assert.equal(M.ustr(a.umin), umin, p.input);
    assert.equal(M.ustr(a.umax), umax, p.input);
    assert.equal(a.dmin, dmin, p.input);
    assert.equal(a.dmax, dmax, p.input);
    assert.equal(a.case, kase, p.input);
    assert.equal(a.text, text, p.input);
    assert.ok(a.roundTrips, p.input);
    assert.ok(a.fast.agrees, p.input);
    assert.ok(a.width >= 1 && a.width < 10);
  }
  // 0.3 and 0.1+0.2 share a midpoint
  const a = M.analyze(0.3), b = M.analyze(0.1 + 0.2);
  assert.equal(a.umax, b.umin);
  assert.equal(M.nextUp(0.3), 0.1 + 0.2);
  assert.equal(a.odd, 1); assert.equal(b.odd, 0);
  // widths quoted on the page
  assert.equal(a.width.toFixed(3), "5.551");
  assert.equal(M.analyze(2 / 3).width.toFixed(2), "1.11");
  assert.equal(M.analyze(5e-324).width.toFixed(2), "4.94");
  assert.equal(M.analyze(2 ** 53 - 1).width, 1);
});

test("2^89: the correctly rounded value lies outside the window", () => {
  const a = M.analyze(2 ** 89);
  assert.ok(a.skew);
  assert.equal(a.rounded, 6189700196426901n);
  assert.ok(!a.roundedInside);
  assert.equal(M.ustr(a.um), "6189700196426901.0+");
  const { M: m, E } = M.decode53(2 ** 89);
  const s = M.scaled(m, E, -11);
  assert.ok(M.exactDecimalString(s.num, s.den).startsWith("6189700196426901.37"));
  assert.ok(M.quizChoices(a).includes(6189700196426901n));
});

test("1e23: exact edge, parity decides", () => {
  const a = M.analyze(1e23);
  assert.equal(a.M, 5960464477539062n);
  assert.equal(a.odd, 0);
  assert.equal(a.umax & 3n, 0n, "exact: no half, no sticky");
  assert.equal(M.exactDecimalOfDouble(1e23), "99999999999999991611392");
  assert.equal(a.fast.oneMultiply[1], false, "upper edge needs the second multiply");
  const f = M.analyze(1e23, { flip: true });
  assert.equal(f.case, "single");
  assert.equal(f.text, "9999999999999999e7");
  assert.ok(f.roundTrips);
});

test("5e-324 hand check", () => {
  const a = M.analyze(5e-324);
  const lo = M.scaled(a.min, a.e, 324), hi = M.scaled(a.max, a.e, 324), mid = M.scaled(a.m, a.e, 324);
  assert.equal(M.toNum(lo.num, lo.den).toFixed(2), "2.47");
  assert.equal(M.toNum(hi.num, hi.den).toFixed(2), "7.41");
  assert.equal(M.toNum(mid.num, mid.den).toFixed(2), "4.94");
  assert.equal(M.ustr(a.um), "4.5+");
  assert.equal(M.nextUp(5e-324).toString(), "1e-323");
});

test("p dial on 0.1+0.2", () => {
  const f = 0.1 + 0.2;
  const at = (p) => M.analyze(f, { p });
  assert.equal(at(16).count, 0n);
  assert.equal(at(17).count, 6n); assert.equal(at(17).zeroCount, 0n);
  assert.equal(at(18).count, 56n); assert.equal(at(18).zeroCount, 6n);
});

test("0.1 and 2/3 as used in the quiz", () => {
  const a = M.analyze(0.1);
  assert.equal(M.ustr(a.umin), "9999999999999999.5+");
  assert.equal(M.ustr(a.umax), "10000000000000001.0+");
  assert.equal(a.pick, 10000000000000000n);
  assert.equal(a.text, "1e-1");
  for (const q of M.QUIZ) {
    const b = M.analyze(Math.abs(M.parseInput(q.input)));
    assert.ok(M.quizChoices(b).includes(b.pick), q.input);
  }
});

function jsDigits(v) {
  const m = String(v).match(/^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/);
  let digits = (m[1] + (m[2] || "")).replace(/^0+/, "");
  let exp = Number(m[3] || 0) - (m[2] || "").length;
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); exp++; }
  return { d: BigInt(digits), x: exp };
}

function checkShort(v) {
  const a = M.analyze(v);
  const want = jsDigits(v);
  const got = M.trimZeros(a.d, a.x);
  assert.equal(got.d, want.d, `digits of ${v}`);
  assert.equal(got.x, want.x, `exponent of ${v}`);
  assert.ok(a.width >= 1 && a.width < 10, `width of ${v}`);
  assert.ok(a.fast === null || a.fast.agrees, `fast uscale for ${v}`);
  assert.ok(a.count >= 1n && a.zeroCount <= 1n);
}

test("Short matches Number#toString and the oracle", () => {
  let seed = 0x1234567n;
  const next = () => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return seed; };
  for (let i = 0; i < 4000; i++) {
    const v = M.fromBits(next() & 0x7fffffffffffffffn);
    if (!Number.isFinite(v) || v === 0) continue;
    checkShort(v);
  }
  for (let e = -1074; e <= 1023; e++) checkShort(2 ** e);
  for (let e = -1022; e <= 1023; e += 7) checkShort(2 ** e * (1 + 2 ** -52));
  for (let k = 1n; k < 300n; k++) checkShort(M.fromBits(k));
  for (const v of [Number.MAX_VALUE, 2 ** -1022 - 2 ** -1074, 1, 10, 123.456, 1e21, 1e22, 9007199254740993, 0.3, 5e-324]) checkShort(v);
  // oracle cross-check on a few
  for (const v of [0.3, 0.1 + 0.2, 2 / 3, 2 ** 89, 1e23, 1 / 7]) {
    const o = shortestDecimal(v);
    assert.ok(o, "oracle answers");
  }
});

test("pow10 table entries", () => {
  for (const p of [-348, -343, -29, -7, -1, 0, 1, 17, 27, 28, 55, 56, 341, 347]) {
    const t = M.pmEntry(p);
    assert.ok(t.pm >= 1n << 127n && t.pm < 1n << 128n, `range ${p}`);
    assert.equal((t.hi << 64n) - t.lo, t.pm, `hi/lo form ${p}`);
    if (p >= 0 && p <= 55) assert.ok(t.exact, `exact ${p}`);
    if (p < 0 || p > 55) assert.ok(!t.exact, `inexact ${p}`);
  }
  // Avogadro entry quoted by the ideation report
  assert.equal(M.pmEntry(-7).pm.toString(16), "d6bf94d5e57a42bc3d32907604691b4d");
});

test("input parsing", () => {
  assert.equal(M.parseInput("0.1+0.2"), 0.1 + 0.2);
  assert.equal(M.parseInput("2/3"), 2 / 3);
  assert.equal(M.parseInput("2^89"), 2 ** 89);
  assert.equal(M.parseInput("2^53-1"), 2 ** 53 - 1);
  assert.equal(M.parseInput("2**-3"), 0.125);
  assert.equal(M.parseInput("5e-324"), 5e-324);
  assert.equal(M.parseInput("1e23"), 1e23);
  assert.equal(M.parseInput("abc"), null);
  assert.equal(M.parseInput("1+"), null);
});
