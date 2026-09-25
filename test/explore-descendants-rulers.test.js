// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/descendants-rulers-model.js";
import { fromBits, nextUp, nextDown } from "../site/js/float.js";
import { exactDecimal, shortestDecimal } from "../site/js/oracle.js";

const N = 1n << 52n;
const dbl = (x, m) => fromBits((BigInt(x) << 52n) | m);
function firstIndex(pred, x) {
  let lo = 0n, hi = N;
  while (lo < hi) { const mid = (lo + hi) / 2n; if (pred(dbl(x, mid))) hi = mid; else lo = mid + 1n; }
  return lo;
}

function nearPowersOfTen() {
  const out = [];
  for (let n = -323; n <= 308; n++) {
    let v = Number(`1e${n}`);
    for (let i = 0; i < 3; i++) v = nextDown(v);
    for (let i = 0; i < 7; i++) { if (v > 0 && Number.isFinite(v)) out.push(v); v = nextUp(v); }
  }
  return out;
}

test("exact exponents agree with the oracle's shortest output", () => {
  for (const v of [0.1, 0.3, 700, 1000, 987.654, 1e23, 5e-324, 1.7976931348623157e308]) {
    const s = shortestDecimal(v);
    const E = s.coefficient.toString().length - 1 + s.exponent;
    // B&D's target (from high) equals the exponent of the shortest output whenever no carry is involved.
    assert.ok(M.exponentOfHigh(v) === E || M.exponentOfHigh(v) === E - 1, String(v));
  }
  assert.equal(M.exponentOfV(1e23), 22);
  assert.equal(M.exponentOfHigh(1e23), 23);
  assert.equal(exactDecimal(1e23), "99999999999999991611392");
  assert.equal(M.exponentOfV(1000), 3);
  assert.equal(M.exponentOfHigh(1000), 3);
  assert.equal(M.exponentOfV(nextDown(1000)), 2);
});

test("estimators stay within one, on the documented side", () => {
  const rand = M.mulberry32(7);
  const values = nearPowersOfTen();
  for (let i = 0; i < 20000; i++) values.push(M.randomNormal(rand));
  for (let x = 1; x <= 2046; x++) values.push(dbl(x, 0n), dbl(x, N - 1n));
  for (const v of values) {
    const eh = M.exponentOfHigh(v), ev = M.exponentOfV(v);
    const b = M.bdBitsEstimate(v).E - eh;
    assert.ok(b === 0 || b === -1, `bits ${v}`);
    const l = M.bdLogEstimate(v).E - eh;
    assert.ok(l === 0 || l === -1, `log ${v}`);
    const g = M.gayEstimate(v).E - ev;
    assert.ok(g === 0 || g === 1, `gay ${v}`);
    assert.equal(M.gayRepair(v).k, ev, `repair ${v}`);
  }
});

test("worked examples on the page", () => {
  // Binade 2^9: B&D's estimate is 2 for 700 and for 1000; 1000 is missed.
  assert.equal(M.decompose(700).s, 9);
  assert.equal(M.decompose(1000).s, 9);
  assert.equal(M.bdBitsEstimate(700).E, 2);
  assert.equal(M.bdBitsEstimate(1000).E, 2);
  assert.equal(M.exponentOfHigh(1023.9999999999999), 3);
  assert.equal(M.exponentOfHigh(nextDown(1000)), 2);
  // Gay's threshold in binade 2^9 and the ds values quoted.
  const t = M.gayThreshold(9, 3);
  assert.ok(t > 970.7255 && t < 970.7256);
  assert.equal(M.gayEstimate(970).E, 2);
  assert.equal(M.gayEstimate(971).E, 3);
  assert.equal(M.gayEstimate(1000).E, 3);
  assert.equal(M.gayEstimate(987.654).E, 3);
  assert.equal(M.gayRepair(987.654).check, "float");
  assert.equal(M.gayRepair(987.654).k, 2);
  // 1e23: Math.log10 says 23, the bignum check lowers Gay's 23 to 22.
  assert.equal(Math.log10(1e23), 23);
  const r = M.gayRepair(1e23);
  assert.equal(r.E, 23); assert.equal(r.check, "bignum"); assert.equal(r.k, 22);
  // Tangent facts.
  const tan = (x) => (x - 1.5) * M.GAY_SLOPE + M.GAY_INTERCEPT;
  assert.equal(tan(1).toFixed(4), "0.0313");
  assert.equal((tan(2) - Math.log10(2)).toFixed(4), "0.0198");
  assert.ok(Math.abs(M.GAY_SLOPE - 1 / (1.5 * Math.LN10)) < 1e-14);
});

test("the race: iterative scaling counts", () => {
  const c = (v) => M.iterativeScale(v);
  assert.deepEqual([c(1e23).steps, c(1e23).mults], [24, 24]);
  assert.deepEqual([c(5e-324).steps, c(5e-324).mults], [323, 969]);
  assert.deepEqual([c(1.7976931348623157e308).steps], [309]);
  assert.deepEqual([c(1e-100).steps, c(1e-100).mults], [99, 297]);
  for (const v of [0.3, 1e23, 5e-324, 123.456, 1e-300]) assert.equal(c(v).k, M.burgerDybvig(v).k);
});

test("B&D and classic dtoa print the shortest digits", () => {
  const rand = M.mulberry32(11);
  const values = nearPowersOfTen();
  for (let i = 0; i < 15000; i++) values.push(M.randomNormal(rand));
  for (let i = 0; i < 2000; i++) values.push(Math.floor(rand() * 1e15), Math.floor(rand() * 1e6) + 0.5);
  values.push(5e-324, 2.2250738585072014e-308, 2 ** 64, 2 ** -25, 2 ** -44);
  for (const v of values) {
    if (!(v > 0)) continue;
    const js = M.jsDigits(v);
    const g = M.gayDtoa(v);
    assert.equal(`${g.digits}e${g.decpt}`, `${js.digits}e${js.decpt}`, `dtoa ${v}`);
    const b = M.burgerDybvig(v);
    if (`${b.digits}e${b.k}` !== `${js.digits}e${js.decpt}`) {
      // Only exact ties may differ (B&D rounds up, JS/dtoa pick even).
      assert.equal(b.digits.length, js.digits.length, `bd ${v}`);
    }
  }
});

test("factor ledger numbers", () => {
  const g = M.gayDtoa(0.1);
  assert.equal(g.odd, 3602879701896397n);
  assert.equal(g.be, -55);
  assert.equal(g.bbits, 52);
  assert.equal(g.cancel, 1);
  assert.equal(g.shift, 3);
  assert.equal(g.built.S, 1n << 59n);
  assert.equal(g.built.b, 72057594037927940n * 8n);
  assert.equal(g.built.mlo, 40n);
  assert.equal(g.first.qhat, 0);
  assert.equal(g.first.q, 1);
  assert.equal(g.exit, "low side");
  // Size payoffs quoted (dtoa S before dshift vs B&D s).
  const sizes = (v) => [M.gayDtoa(v).built.unshiftedSBits, M.bdSizes(v).s];
  assert.deepEqual(sizes(1.7976931348623157e308), [716, 1025]);
  assert.deepEqual(sizes(5e-324), [752, 1076]);
  assert.deepEqual(sizes(2.2250738585072014e-308), [768, 1076]);
  // Small-integer lane.
  assert.equal(M.gayDtoa(123456).path, "small-int");
  assert.equal(M.gayDtoa(1000).digits, "1");
  assert.equal(M.gayDtoa(1e15).path, "bignum");
  // 1e23 takes the k_check and round_9_up route.
  const h = M.gayDtoa(1e23);
  assert.ok(h.kFixed);
  assert.equal(h.exit, "upper boundary, round_9_up");
  assert.equal(h.decpt, 24);
  const b = M.burgerDybvig(1e23);
  assert.equal(b.est, 23);
  assert.equal(b.scaled.r + b.scaled.mp, b.scaled.s);
  assert.equal(b.k, 24);
  // spec_case for a normal power of two.
  assert.ok(M.gayDtoa(2 ** 64).spec);
  assert.ok(!M.gayDtoa(2.2250738585072014e-308).spec);
});

test("exact miss shares over all normal doubles (quoted in the prose)", () => {
  let bd = 0n, gay = 0n, bdBinades = 0, pow10Binades = 0, gaySpill = 0;
  for (let x = 1; x <= 2046; x++) {
    const v0 = dbl(x, 0n), v1 = dbl(x, N - 1n);
    const Eb = M.bdBitsEstimate(v0).E;
    const a = firstIndex((v) => M.exponentOfHigh(v) > Eb, x);
    if (a < N) { bd += N - a; bdBinades++; }
    const n = M.gayEstimate(v1).E;
    const ga = firstIndex((v) => M.gayEstimate(v).E >= n, x);
    const gb = firstIndex((v) => M.exponentOfV(v) >= n, x);
    if (gb > ga) { gay += gb - ga; if (gb === N) gaySpill++; }
    if (M.exponentOfV(v0) !== M.exponentOfV(v1) || M.exponentOfV(v0) !== M.exponentOfV(v0 * 0.9999999999)) pow10Binades++;
  }
  const total = 2046n * N;
  assert.equal((Number(bd * 100000n / total) / 1000).toFixed(1), "16.8");
  assert.equal((Number(gay * 1000000n / total) / 10000).toFixed(2), "0.83");
  assert.equal(bdBinades, 616);
  assert.equal(pow10Binades, 616);
  assert.equal(gaySpill, 41); // miss zone at the top of a binade with no power of ten inside
});
