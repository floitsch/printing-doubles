// Copyright (C) 2026 Toit contributors.
//
// Tests for the "Dragon4 · the mask" explanation page model: the Dragon4
// transcription, and every number the page's prose quotes.

import test from "node:test";
import assert from "node:assert/strict";
import {
  dragon4, dragon4Text, decodeBinary64, toyFloat, roundToToy, cellStates, ratio, log10Ratio,
  decimalLabel, formatLikeJS, parseNumberInput, TOY_PRESETS, DOUBLE_PRESETS,
} from "../site/explore/js/dragon-mask-model.js";
import { exactDecimal } from "../site/js/oracle.js";

const d = decodeBinary64;

// Deterministic 64-bit xorshift* for random bit patterns.
function rng(seed) {
  let x = BigInt(seed) || 1n;
  const M = (1n << 64n) - 1n;
  return () => {
    x ^= x >> 12n; x ^= (x << 25n) & M; x ^= x >> 27n;
    return (x * 2685821657736338717n) & M;
  };
}
function randomDouble(next) {
  const dv = new DataView(new ArrayBuffer(8));
  for (;;) {
    dv.setBigUint64(0, next() & 0x7fffffffffffffffn);
    const x = dv.getFloat64(0);
    if (Number.isFinite(x) && x > 0) return x;
  }
}

/** Independent brute-force shortest-closest in a p-bit toy format (exact rationals). */
function bruteToy(f, q, p, inclusive) {
  // v = f·2^q; neighbours; midpoints as rationals with denominator 2^(−q+2) scaled.
  const F = BigInt(f);
  const unequal = F === 1n << BigInt(p - 1);
  // work in units of 2^(q-2): v = 4F, lower mid = 4F - (unequal ? 1 : 2), upper mid = 4F + 2
  const unitExp = q - 2;
  const V = 4n * F;
  const lo = V - (unequal ? 1n : 2n);
  const hi = V + 2n;
  const inside = (num, den) => { // decimal num/den (in units) strictly/inclusively inside
    const a = num; const l = lo * den; const h = hi * den;
    return inclusive ? a >= l && a <= h : a > l && a < h;
  };
  // value of c·10^e in units: c·10^e / 2^unitExp  as num/den
  const toUnits = (c, e) => {
    let num = c; let den = 1n;
    if (e >= 0) num *= 10n ** BigInt(e); else den *= 10n ** BigInt(-e);
    if (unitExp >= 0) den *= 1n << BigInt(unitExp); else num *= 1n << BigInt(-unitExp);
    return [num, den];
  };
  const vNum = Number(F) * 2 ** q;
  const top = Math.floor(Math.log10(vNum)) + 2;
  for (let e = top; e > top - 30; e--) {
    // candidates c·10^e around v
    const c0 = BigInt(Math.floor(vNum / 10 ** e));
    let best = null;
    for (let c = c0 - 2n; c <= c0 + 3n; c++) {
      if (c <= 0n) continue;
      const [n, dd] = toUnits(c, e);
      if (!inside(n, dd)) continue;
      const dist = (x) => { const [a, b] = toUnits(x, e); const diff = a - V * b; return [diff < 0n ? -diff : diff, b]; };
      if (best === null) { best = c; continue; }
      const [da, ba] = dist(c); const [db, bb] = dist(best);
      if (da * bb < db * ba || (da * bb === db * ba && c % 2n === 0n)) best = c;
    }
    if (best !== null) {
      let s = best.toString();
      let ee = e;
      while (s.length > 1 && s.endsWith("0")) { s = s.slice(0, -1); ee++; }
      return { digits: s, exp10: ee };
    }
  }
  throw new Error("no candidate");
}

test("toy traces match the hand-checked numbers on the page", () => {
  const r = dragon4(toyFloat(19, -4));
  assert.deepEqual(r.init, { R: 19n, S: 16n, Mm: 1n, Mp: 1n });
  assert.equal(r.loops1, 0);
  assert.equal(r.loops2, 1);
  assert.equal(r.S, 160n);
  assert.equal(r.start.k, 1);
  assert.equal(r.steps[0].U, 1);
  assert.equal(r.steps[0].R, 30n);
  assert.equal(r.steps[1].U, 1);
  assert.equal(r.steps[1].R, 140n);
  assert.equal(r.steps[1].Mm, 100n);
  assert.equal(2n * r.steps[1].R, 280n);
  assert.equal(2n * r.S - r.steps[1].Mp, 220n);
  assert.equal(r.steps[1].choice, "high");
  assert.equal(r.text, "1.2");
  const st = cellStates(r);
  assert.equal(st[0].dot, 0.11875);
  assert.equal(st[1].dot, 0.1875);
  assert.equal(st[1].shadowL, 0.03125);
  assert.equal(st[2].dot, 0.875);
  assert.equal(st[2].shadowR, 0.3125);
  assert.equal(decimalLabel(st[2].leftCoef, st[2].edgeExp, 2), "1.1");
  assert.equal(decimalLabel(st[2].rightCoef, st[2].edgeExp, 2), "1.2");

  assert.equal(dragon4(toyFloat(18, -4)).text, "1.1");
  assert.equal(dragon4(toyFloat(18, -4)).steps[1].choice, "low");

  const r3 = dragon4(toyFloat(23, -4));
  const s3 = cellStates(r3);
  assert.equal(s3[2].dot, 0.375);
  assert.equal(s3[2].shadowL, 0.3125);
  assert.equal(s3[3].shadowL, 3.125);
  assert.equal(s3[3].dot, 0.75);
  assert.equal(r3.steps[2].choice, "nearer-high");
  assert.equal(r3.text, "1.44");

  const one = dragon4(toyFloat(16, -4));
  assert.equal(one.unequal, true);
  assert.deepEqual({ R: one.start.R, S: one.S, Mm: one.start.Mm, Mp: one.start.Mp }, { R: 32n, S: 320n, Mm: 1n, Mp: 2n });
  assert.equal(one.text, "1");
  const oneStates = cellStates(one);
  assert.equal(oneStates[1].shadowR, 2 * oneStates[1].shadowL);

  const big = dragon4(toyFloat(23, 3));
  assert.equal(big.loops2, 3);
  assert.equal(big.text, "184");
});

test("toy presets agree with an independent brute-force search (strict and inclusive)", () => {
  for (const p of [5, 4, 6]) {
    for (let q = -12; q <= 6; q++) {
      for (let f = 2 ** (p - 1); f < 2 ** p; f++) {
        for (const inclusive of [false, true]) {
          const r = dragon4(toyFloat(f, q, p), { inclusive });
          const b = bruteToy(f, q, p, inclusive && f % 2 === 0);
          assert.equal(r.carry, false);
          assert.equal(r.digits, b.digits, `f=${f} q=${q} p=${p} incl=${inclusive}`);
          assert.equal(r.exp10, b.exp10, `f=${f} q=${q} p=${p}`);
        }
      }
    }
  }
  for (const preset of TOY_PRESETS) assert.ok(dragon4(toyFloat(preset.f, preset.q)).text);
});

test("double presets: outputs and quoted figures", () => {
  const out = (x, o) => dragon4Text(x, o);
  assert.equal(out(0.1), "0.1");
  assert.equal(out(0.3), "0.3");
  assert.equal(out(1 / 3), "0.3333333333333333");
  assert.equal(out(0.1 + 0.2), "0.30000000000000004");
  assert.equal(out(2 ** -44), "5.684341886080802e-14");
  assert.equal(out(2 ** 64), "18446744073709552000");
  assert.equal(out(5e-324), "5e-324");
  assert.equal(out(1e23), "9.999999999999999e+22");
  assert.equal(out(1e23, { inclusive: true }), "1e+23");
  assert.equal(out(1e-6), "0.000001");

  // 0.1: dot 5.55e-17 inside left shadow 6.94e-17
  let st = cellStates(dragon4(d(0.1)));
  assert.equal(st.length, 2);
  assert.equal(st[1].distL.toPrecision(3), "5.55e-17");
  assert.equal(st[1].shadowL.toPrecision(3), "6.94e-17");
  assert.equal(st[1].choice, "low");

  // 0.3: U = 2, distance to right edge 1.11e-16 < 2.78e-16
  st = cellStates(dragon4(d(0.3)));
  assert.equal(st[1].U, 2);
  assert.equal(st[1].distR.toPrecision(3), "1.11e-16");
  assert.equal(st[1].shadowR.toPrecision(3), "2.78e-16");
  assert.equal(st[1].choice, "high");
  assert.ok(exactDecimal(0.3).startsWith("0.29999999999999998889"));

  // 1/3: 16 digits, low at the end
  st = cellStates(dragon4(d(1 / 3)));
  assert.equal(st.length - 1, 16);
  assert.equal(st.at(-1).choice, "low");

  // 0.1+0.2: 17 digits, both lamps; distance to the left edge grows 10x per digit from digit 11
  st = cellStates(dragon4(d(0.1 + 0.2)));
  assert.equal(st.length - 1, 17);
  assert.ok(st.at(-1).low && st.at(-1).high);
  assert.equal(st.at(-1).choice, "nearer-low");
  for (let j = 12; j <= 16; j++) {
    const growth = st[j].distL / st[j - 1].distL;
    assert.ok(Math.abs(growth - 10) < 0.01, `digit ${j} growth ${growth}`);
    assert.ok(st[j].distL > st[j].shadowL, `digit ${j} stays ahead of the mask`);
  }

  // 2^-44: last dot 0.487, shadows 0.316 / 0.631, only high
  st = cellStates(dragon4(d(2 ** -44)));
  const last = st.at(-1);
  assert.equal(last.dot.toFixed(3), "0.487");
  assert.equal(last.shadowL.toFixed(3), "0.316");
  assert.equal(last.shadowR.toFixed(3), "0.631");
  assert.equal(last.choice, "high");

  // 2^64 ends with both lamps and rounds up
  st = cellStates(dragon4(d(2 ** 64)));
  assert.equal(st.length - 1, 17);
  assert.equal(st.at(-1).choice, "nearer-high");

  // 5e-324: 323 first-loop iterations, shadows 2.47 cells at the first digit
  const tiny = dragon4(d(5e-324));
  assert.equal(tiny.loops1, 323);
  st = cellStates(tiny);
  assert.equal(st[1].shadowL.toFixed(2), "2.47");
  assert.ok(tiny.S.toString(2).length <= 1100 && tiny.start.R.toString(2).length > 1070);

  // DBL_MAX: 309 second-loop iterations
  assert.equal(dragon4(d(Number.MAX_VALUE)).loops2, 309);

  for (const p of DOUBLE_PRESETS) {
    const r = dragon4(d(p.x));
    assert.equal(Number(r.text), p.x, p.id);
  }
});

test("starting shadows lie between 5e-18 and 1.1e-16 cells for normal doubles", () => {
  const next = rng(7);
  for (let i = 0; i < 600; i++) {
    const x = randomDouble(next);
    if (x < 2.2250738585072014e-308) continue;
    const st = cellStates(dragon4(d(x)))[0];
    assert.ok(st.shadowL >= 5e-18 && st.shadowR <= 1.12e-16, `${x}: ${st.shadowL} ${st.shadowR}`);
  }
});

test("setup: the upper-end Fixup avoids the first-digit carry of 1e-6", () => {
  assert.ok(exactDecimal(1e-6).startsWith("0.000000999999999999999954748"));
  const naive = dragon4(d(1e-6), { scaleBy: "value" });
  assert.equal(naive.steps[0].U, 9);
  assert.equal(naive.carry, true);
  assert.equal(cellStates(naive)[1].distR.toPrecision(2), "4.5e-16");
  const real = dragon4(d(1e-6));
  assert.equal(real.steps[0].U, 0);
  assert.equal(real.steps[0].choice, "high");
  assert.equal(real.carry, false);
});

test("why callouts: symmetric masks, single test, floating-point prescale, published ≥", () => {
  const sym = dragon4(d(2 ** 64), { margins: "symmetric" });
  assert.equal(sym.text, "18446744073709550000");
  assert.equal(sym.digits.length, 16);
  assert.equal(18446744073709551616n - 18446744073709550000n, 1616n);
  assert.equal(Number(sym.text), 2 ** 64 - 2048);

  const single = dragon4(d(2 ** -44), { margins: "single" });
  assert.equal(single.text, "5.684341886080801e-14");
  assert.ok(Number(single.text) < 2 ** -44);

  let symFails = 0;
  let singleFails = 0;
  let count = 0;
  for (let e = -1022; e <= 1023; e++) {
    const x = 2 ** e;
    count++;
    if (Number(dragon4(d(x), { margins: "symmetric" }).text) !== x) symFails++;
    if (Number(dragon4(d(x), { margins: "single" }).text) !== x) singleFails++;
    assert.equal(Number(dragon4(d(x)).text), x);
  }
  assert.equal(count, 2046);
  assert.equal(symFails, 255);
  assert.equal(singleFails, 46);

  assert.equal(1.23e202 / 1e202, 1.2300000000000002);
  assert.notEqual(Number("1.2300000000000002e202"), 1.23e202);
  assert.equal(String(Number("1.2300000000000002e202")), "1.2300000000000003e+202");

  const paper = dragon4(d(1e23), { scaleTest: "paper" });
  assert.equal(paper.digits, "09999999999999999");
  assert.equal(paper.H, 23);
  assert.equal(exactDecimal(1e23), "99999999999999991611392");
});

test("strict Dragon4 round-trips; inclusive matches JS; strict differs rarely and only by length", () => {
  const next = rng(20260925);
  let n = 0;
  let diff = 0;
  for (let i = 0; i < 12000; i++) {
    const x = randomDouble(next);
    n++;
    const strict = dragon4(d(x));
    const incl = dragon4(d(x), { inclusive: true });
    assert.equal(strict.carry, false);
    assert.notEqual(strict.digits[0], "0");
    assert.equal(Number(strict.text), x);
    assert.equal(incl.text, String(x));
    if (strict.text !== String(x)) {
      diff++;
      assert.ok(strict.digits.length > incl.digits.length);
    }
  }
  const rate = diff / n;
  assert.ok(diff >= 1 && rate < 0.0008, `rate ${rate} (${diff} of ${n})`);
});

test("helpers", () => {
  assert.equal(ratio(1n, 3n), 1 / 3);
  assert.ok(Math.abs(log10Ratio(1n, 1n << 3000n) + 3000 * Math.log10(2)) < 1e-9);
  assert.equal(formatLikeJS("1", 24), "1e+23");
  assert.equal(formatLikeJS("5", -323), "5e-324");
  assert.equal(formatLikeJS("1", -5), "0.000001");
  assert.equal(parseNumberInput("2^-44"), 2 ** -44);
  assert.equal(parseNumberInput("1/3"), 1 / 3);
  assert.equal(parseNumberInput("0.1+0.2"), 0.1 + 0.2);
  assert.equal(parseNumberInput("2⁶⁴"), 2 ** 64);
  assert.equal(parseNumberInput("-1"), null);
  assert.equal(parseNumberInput("abc"), null);
  const t = roundToToy(0.1);
  assert.equal(t.f, 26n);
  assert.equal(t.q, -8);
  assert.equal(roundToToy(1.1875).f, 19n);
  assert.equal(decimalLabel(110n, -2, 3), "1.10");
  assert.equal(decimalLabel(1n, -13), "1e-13");
});
