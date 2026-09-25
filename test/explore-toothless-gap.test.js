// Copyright (C) 2026 Toit contributors.
// Tests for site/explore/js/toothless-gap-model.js: every number the
// "Nothing lives in the gap" page shows is checked here against exact arithmetic.

import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/toothless-gap-model.js";

const refs = M.toyReferences();

test("toy reference is shortest, closest, and in the interval", () => {
  let i = 0;
  for (let e = M.TOY.eMin; e <= M.TOY.eMax; e++) {
    for (let f = M.TOY.fMin; f <= M.TOY.fMax; f++) {
      const r = refs[i++];
      assert.ok(M.toyReadsBack(f, e, r.D, r.x), `ref ${f}*2^${e} reads back`);
      // No decimal one digit shorter reads back: check the two candidates around D/10.
      const lo = Math.floor(r.D / 10), hi = lo + 1;
      for (const c of [lo, hi]) {
        if (c > 0) assert.ok(!M.toyReadsBack(f, e, c, r.x + 1), `no shorter for ${f}*2^${e}`);
      }
    }
  }
});

test("toy Toothless with the exact alpha equals the reference on all 6528 floats", () => {
  const exact = M.toyCache(Infinity);
  let i = 0;
  for (let e = M.TOY.eMin; e <= M.TOY.eMax; e++) {
    for (let f = M.TOY.fMin; f <= M.TOY.fMax; f++) {
      const run = M.toyToothless(f, e, exact);
      assert.ok(run.ok);
      assert.deepEqual(M.normalizeDec(run.D, run.x), refs[i++]);
    }
  }
});

test("budget sweep: error counts, culprits in the gap, guarantee from B = 14", () => {
  const expected = { 2: 6144, 3: 5261, 4: 4654, 5: 2409, 6: 932, 7: 143, 8: 25, 9: 3, 10: 2 };
  for (let B = 2; B <= 18; B++) {
    const s = M.toySweep(B, refs);
    assert.equal(s.wrong, expected[B] ?? 0, `B=${B}`);
    for (const c of s.cells) {
      if (c.correct) continue;
      assert.ok(c.culprit, `culprit for ${c.f}*2^${c.e} at B=${B}`);
      if (c.culprit.type === "gap") assert.ok(c.culprit.between, "gap culprit lies strictly between stand-in and alpha");
      else {
        assert.equal(c.culprit.type, "tie");
        assert.equal(c.culprit.sAlpha, 0);
      }
    }
    assert.equal(s.guaranteed, B >= 14, `guarantee at B=${B}`);
  }
  assert.equal(M.toySweep(9, refs).ties, 1);
  assert.equal(M.toySweep(8, refs).ties, 2);
});

test("story: 183*2^-18 and the 0.0007 question", () => {
  assert.equal(M.toyValueString(183, -18), "0.000698089599609375");
  assert.equal(M.toyValueString(184, -18), "0.000701904296875");
  assert.deepEqual(M.toyAlpha(6), { k: 6, ek: 19, n: 8192, d: 15625 });
  // hand checks shown on the page
  assert.equal(367 * 15625, 5734375);
  assert.equal(700 * 8192, 5734400);
  assert.equal(367 * 103, 37801);
  assert.equal(700 * 54, 37800);
  assert.equal(97 * 103 - 54 * 185, 1);
  // m+ = 367 * 2^-19
  assert.ok(!M.toyReadsBack(183, -18, 7, -4));
  assert.deepEqual(M.toyReadBackAs(7, -4), { f: 184, e: -18 });
  assert.deepEqual(M.toyReference(183, -18), { D: 698, x: -6 });
  assert.deepEqual(M.toyReference(184, -18), { D: 7, x: -4 });
  const rows = {
    5: ["11/21", "lower", "0.0007", "0.000703", "54/103"],
    6: ["32/61", "higher", "0.000698", "0.0007", "43/82"],
    7: ["54/103", "lower", "0.0007", "0.000702", "367/700"],
    8: ["54/103", "lower", "0.0007", "0.000702", "367/700"],
    9: ["259/494", "higher", "0.000698", "0.0007", "313/597"],
    10: ["313/597", "higher", "0.000698", "0.0007", "8505/16222"],
    11: ["313/597", "higher", "0.000698", "0.0007", "8505/16222"],
    12: ["313/597", "higher", "0.000698", "0.0007", "8505/16222"],
    13: ["4123/7864", "lower", "0.000698", "0.0007", "4436/8461"],
  };
  for (const [B, want] of Object.entries(rows)) {
    const ent = M.toyEntry(6, +B);
    const cache = M.toyCache(+B);
    const out = (f) => { const r = M.toyToothless(f, -18, cache); const n = M.normalizeDec(r.D, r.x); return M.formatDec(n.D, n.x); };
    assert.deepEqual([`${ent.num}/${ent.den}`, ent.higher ? "higher" : "lower", out(183), out(184), M.toyFirstIntruder(6, +B).join("/")], want, `B=${B}`);
  }
  assert.ok(M.toyEntry(6, 14).exact);
  const sb8 = M.sternBrocot(8192, 15625, 256);
  assert.deepEqual([sb8.left, sb8.right, sb8.next], [[54, 103], [97, 185], [151, 288]]);
  assert.equal(sb8.steps.map((s) => s.dir).join(""), "LRLLLLLLLLLRLLLRL");
  assert.deepEqual(M.continuedFraction(8192, 15625), [0, 1, 1, 9, 1, 3, 1, 5, 26]);
  assert.deepEqual(M.runsOf(M.sternBrocot(8192, 15625, 1 << 20).steps).map((r) => r.n), [1, 1, 9, 1, 3, 1, 5, 25]);
});

test("B = 8: the question 367/700 is the culprit for 183*2^-18; B = 9 fails 143*2^-18 via 572/1091", () => {
  const c8 = M.toyCase(183, -18, M.toyCache(8), M.toyCache(Infinity));
  assert.equal(c8.correct, false);
  assert.equal(c8.category, "roundtrip");
  assert.deepEqual([c8.culprit.kind, c8.culprit.P, c8.culprit.Q], ["floor", 367, 700]);
  const c9 = M.toyCase(143, -18, M.toyCache(9), M.toyCache(Infinity));
  assert.deepEqual([c9.culprit.kind, c9.culprit.P, c9.culprit.Q, c9.culprit.type], ["round", 572, 1091, "gap"]);
});

test("question horizons", () => {
  const all = [];
  for (let B = 2; B <= 18; B++) all.push(B);
  assert.equal(M.toyEntryHorizon(6, all), 8130);
  let max = 0;
  for (const k of M.toyEntriesUsed()) max = Math.max(max, M.toyEntryHorizon(k, all));
  assert.equal(max, 12310);
  assert.ok(max < M.TOY_HORIZON);
});

test("toy numbers stay exact in Number arithmetic", () => {
  // largest product: up' * num with num < 2^18 and up' < 2^13, doubled in the rounding test
  assert.ok(2 * (2 ** 13) * (2 ** 18) * 2 < Number.MAX_SAFE_INTEGER);
  assert.ok(10 ** 10 * 2 ** 18 < Number.MAX_SAFE_INTEGER);
});

test("real table facts", () => {
  const rows = M.realTableFacts();
  assert.equal(rows.length, 325);
  const inexact = rows.filter((r) => !r.exact);
  assert.equal(inexact.length, 297);
  assert.ok(rows.slice(0, 28).every((r) => r.exact));
  assert.ok(rows.every((r) => r.tagOk));
  assert.equal(inexact.filter((r) => r.lower).length, 159);
  assert.equal(inexact.filter((r) => r.higher).length, 138);
  assert.ok(inexact.every((r) => r.bracketEnd && r.fareyDet === 1n));
  assert.ok(inexact.every((r) => r.gapDen >= 1n << 63n));
  assert.ok(Math.min(...inexact.map((r) => r.gapNumLog2)) > 62.06);
  assert.equal(inexact.filter((r) => !r.closest).length, 114);
  assert.equal(inexact.filter((r) => !r.draftBest).length, 46);
  assert.deepEqual(rows.filter((r) => !r.closeEnough).map((r) => r.k), [0]);
  assert.ok(rows.every((r) => r.numBits <= 63 && r.denBits <= 63));
  assert.deepEqual(M.realShiftRange(), { lo: 0, hi: 3 });
  const k31 = rows[31];
  assert.equal(k31.closest, false);
  assert.equal(k31.draftBest, false);
  assert.equal(k31.otherEnd[1].toString(2).length, 62);
  // relative error of the stand-ins: all below 2^-120 or so; report the range
  const worst = Math.max(...inexact.map((r) => r.relErrLog2));
  assert.ok(worst < -119, `worst relative error 2^${worst}`);
});

test("simplestBetween agrees with brute force on small fractions", () => {
  for (let b = 2; b < 40; b++) {
    for (let a = 1; a < b; a++) {
      const [n, d] = M.simplestBetween(BigInt(a), BigInt(b), BigInt(a * 7 + 1), BigInt(b * 7));
      // brute force: smallest q with a p/q strictly inside
      let found = null;
      for (let q = 1; q < 400 && !found; q++) {
        for (let p = 0; p <= q; p++) {
          if (p * b > a * q && p * b * 7 < (a * 7 + 1) * q) { found = [p, q]; break; }
        }
      }
      assert.deepEqual([Number(n), Number(d)], found, `${a}/${b}`);
    }
  }
});

test("real question sizes: boundaries and R below 2^58, doubled tests below 2^59", () => {
  assert.deepEqual(M.realQuestionBits(), { boundary: 58, R: 58, twice: 59 });
});
