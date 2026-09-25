// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as M from "../site/explore/js/toothless-trace-model.js";

const SOURCE = "/home/flo/papers/double-conversion_continued_fractions/bench/fraction_values.h";

test("embedded table equals fraction_values.h (when the source is available)", { skip: !existsSync(SOURCE) }, () => {
  const txt = readFileSync(SOURCE, "utf8");
  const arr = (n) => txt.match(new RegExp(n + "\\[\\] = \\{([\\s\\S]*?)\\};"))[1].match(/0x[0-9a-f]+/g).map(BigInt);
  assert.deepEqual(M.TAGGED_NUMERATORS, arr("tagged_numerators"));
  assert.deepEqual(M.TAGGED_DENOMINATORS, arr("tagged_denominators"));
});

test("table shape and tags", () => {
  assert.equal(M.TAGGED_NUMERATORS.length, 325);
  assert.equal(M.TAGGED_DENOMINATORS.length, 325);
  const s = M.checkSeparation();
  assert.equal(s.tagWrong, 0);
  assert.equal(s.exact, 28);
  assert.equal(s.lastExact, 27);
  assert.equal(s.inexact, 297);
  assert.equal(s.lower, 159);
  assert.equal(s.higher, 138);
  assert.equal(s.convergentCount, 220);
  assert.equal(s.semiCount, 77);
  assert.equal(s.notCoprime, 0);
  assert.equal(s.maxEntryBits, 63);
  // The two "best" definitions (ledger claim 3).
  assert.equal(s.notPaperBest, 46);
  assert.equal(s.notClosest, 114);
  assert.equal(s.notPaperBestList[0], 31);
  // One-sided separation, as quoted on the page (2^62.06, 2^63.00).
  assert.equal(s.minIntruderNum.toFixed(2), "62.06");
  assert.equal(s.minIntruderDen.toFixed(2), "63.00");
  assert.ok(s.minIntruderDen >= 63);
});

test("simplestBetween agrees with brute force", () => {
  for (let a = 1n; a < 12n; a++) for (let b = a + 1n; b < 14n; b++) for (let c = 1n; c < 9n; c++) for (let d = 1n; d < 9n; d++) {
    // lo = a/b, hi = c/d
    if (a * d >= c * b) continue;
    const s = M.simplestBetween(a, b, c, d);
    let best = null;
    for (let q = 1n; q < 200n && !best; q++) for (let p = 0n; p < 400n; p++) {
      if (p * b > a * q && p * d < c * q) { best = { n: p, d: q }; break; }
    }
    assert.equal(s.d, best.d); assert.equal(s.n, best.n);
  }
});

test("shortcuts, termination, widths", () => {
  const sc = M.checkShortcuts();
  assert.equal(sc.bad, 0);
  assert.equal(sc.count, 2049);
  assert.deepEqual(sc.diffs, [0, 1, 2, 3]);
  const tm = M.checkTermination();
  assert.equal(tm.failing.length, 1);
  assert.equal(tm.failing[0].i, 0);
  // k = 0 is only used for e_b ∈ {0, 1, 2}.
  const used = []; for (let eb = -1077; eb <= 971; eb++) if (M.pickScale(eb).index === 0) used.push(eb);
  assert.deepEqual(used, [0, 1, 2]);
  const w = M.checkWidths();
  assert.equal(w.boundary, 58);
  assert.equal(w.twoFs, 59);
  assert.equal(w.R, 58);
  assert.equal(Math.max(w.product, w.walkProduct), 121);
});

test("Planck preset (default) matches the page text", () => {
  const t = M.trace(6.62607015e-34);
  assert.equal(t.bnd.eb, -164);
  assert.equal(t.sc.k, -50); assert.equal(t.sc.ek, -166); assert.equal(t.sc.diff, 2); assert.equal(t.sc.index, 50);
  assert.equal(t.num, 9213294054356487037n); assert.equal(t.den, 8617756381217970352n);
  assert.equal(t.tableKey, "lower/odd");
  assert.equal(t.gap.log10Rel.toFixed(2), "-35.89"); // 1.3e-36
  assert.equal(t.fLs, 61977679189084292n); assert.equal(t.fs, 61977679189084296n); assert.equal(t.fUs, 61977679189084300n);
  assert.equal(t.Rfull, 66260701500000002n);
  assert.equal(t.digits, "662607015"); assert.equal(t.exponent, -42);
  const prefixes = t.rows.filter((r) => r.kind === "prefix");
  assert.equal(prefixes.length, 9);
  assert.equal(prefixes[7].cached, false); assert.equal(prefixes[8].cached, true);
  assert.ok(Math.abs(10 ** prefixes[7].margin / 7.5e-9 - 1) < 0.01);
  assert.ok(Math.abs(10 ** prefixes[8].margin / 9.0e-17 - 1) < 0.01);
  assert.equal(t.walk.length, 0);
  assert.ok(t.rows.every((r) => r.agrees));
  // The idea section's example question.
  assert.equal(prefixes[7].a, 66260701000000000n);
  assert.equal(prefixes[7].b, 61977679189084292n);
  assert.ok(M.bitLength(prefixes[7].a) < 59 && M.bitLength(prefixes[7].b) < 59);
  // "multiply by 10^50/2^166, a 167-bit denominator"
  assert.equal(M.bitLength(1n << 166n), 167);
  const d = M.decode(6.62607015e-34); assert.equal(d.e, -163);
});

test("other presets", () => {
  let t = M.trace(0.1);
  assert.equal(t.sc.k, -18); assert.equal(t.sc.ek, -59); assert.equal(t.sc.diff, 2); assert.ok(t.exactEntry);
  assert.equal(t.num, 3814697265625n); assert.equal(t.den, 2199023255552n);
  assert.equal(t.Rfull, 100000000000000012n); assert.equal(t.digits, "1"); assert.equal(t.exponent, -1);
  t = M.trace(1e23);
  assert.equal(t.sc.k, 7); assert.ok(t.exactEntry); assert.equal(t.Rfull, 10n ** 16n);
  assert.equal(t.rows[0].margin, -Infinity); // upper boundary exactly 1e23
  assert.equal(t.digits, "1"); assert.equal(t.exponent, 23);
  t = M.trace(5e-324);
  assert.equal(t.sc.k, -324); assert.equal(t.sc.ek, -1076); assert.equal(t.sc.diff, 1);
  assert.equal(t.num, 7902836006159754763n); assert.equal(t.den, 6398207260659526647n); assert.ok(t.higher);
  assert.equal(t.Rfull, 7n); assert.deepEqual(t.walk, [6, 5]); assert.equal(t.digits, "5");
  t = M.trace(1.7976931348623157e308);
  assert.equal(t.rows.filter((r) => r.kind === "prefix").length, 17); assert.deepEqual(t.walk, [7]);
  t = M.trace(2 ** -1022);
  assert.ok(t.d.powerOfTwo); assert.equal(t.d.biased, 1); assert.equal(M.judge(t.v, t).verdict, "ok");
});

test("hard case 3.294312317590731e-79", () => {
  const v = 3.294312317590731e-79;
  const t = M.trace(v);
  assert.equal(t.d.f, 5497350314569039n); assert.equal(t.d.e, -313); assert.ok(t.d.odd);
  assert.equal(t.sc.k, -95);
  assert.equal(t.num, 4492308886778656631n); assert.equal(t.den, 2998597982347345633n); assert.ok(t.lower);
  assert.ok(Math.abs(10 ** t.gap.log10Rel / 3.4e-39 - 1) < 0.02);
  const p = t.rows.filter((r) => r.kind === "prefix");
  assert.equal(p.length, 16);
  assert.equal(p[14].cached, false); assert.equal(p[15].cached, true);
  assert.ok(Math.abs(10 ** p[15].margin / 5.7e-34 - 1) < 0.02);
  assert.ok(p[15].margin - t.gap.log10Rel > 5); // ~10^5 times the gap
  // Exact lower boundary m⁻ = (2f − 1)·2^(e−1), printed as on the page.
  const num = (2n * t.d.f - 1n) * 10n ** 120n, den = 1n << BigInt(-(t.d.e - 1));
  const digits = (num / den).toString();
  assert.ok(digits.startsWith("329431231759073099999999999999999813"));
  assert.equal(M.judge(v, t).verdict, "ok");
});

test("tie presets and the power-of-two fix-up", () => {
  let t = M.trace(1125899906842624.25);
  assert.equal(t.tie.action, "down-even"); assert.equal(M.formatOutput(t.digits, t.exponent), "1125899906842624.2");
  t = M.trace(1125899906842624.75);
  assert.equal(t.tie.action, "keep"); assert.equal(M.formatOutput(t.digits, t.exponent), "1125899906842624.8");
  let fix = 0;
  for (let b = 1; b <= 2046; b++) {
    const v = M.fromBits(BigInt(b) << 52n);
    const tr = M.trace(v);
    assert.equal(M.judge(v, tr).verdict, "ok", String(v));
    if (tr.fixup && tr.fixup.below) fix++;
  }
  assert.equal(fix, 46);
});

test("exact entries cover about [1.46e-11, 8.9e43]", () => {
  const inside = [M.fromBits(M.bitsOf(2 ** -36) + 1n), M.fromBits(M.bitsOf(2 ** 146) - 1n)];
  for (const v of inside) assert.ok(M.trace(v).exactEntry, String(v));
  assert.ok(!M.trace(M.fromBits(M.bitsOf(2 ** -36) - 1n)).exactEntry);
  assert.ok(M.trace(2 ** 146).exactEntry);
  assert.ok(!M.trace(M.fromBits(M.bitsOf(2 ** 146) + 1n)).exactEntry);
  assert.equal((2 ** 146).toPrecision(2), "8.9e+43"); assert.equal((2 ** -36).toPrecision(3), "1.46e-11");
  assert.ok(5n ** 27n < 1n << 63n && 5n ** 28n > 1n << 63n);
});

test("fast path equals trace and toString on random doubles", () => {
  const rnd = M.makeRandom(99);
  for (let i = 0; i < 20000; i++) {
    const v = rnd();
    const c = M.convert(v);
    assert.equal(M.judge(v, c).verdict, "ok", String(v));
    if (i % 20 === 0) {
      const t = M.trace(v);
      assert.equal(t.digits, c.digits); assert.equal(t.exponent, c.exponent);
      assert.ok(t.rows.every((r) => r.agrees));
      assert.ok(M.certifyShortest(v).ok);
    }
  }
});

test("budget toggle: verified hard cases", () => {
  const cases = [3.294312317590731e-79, 3.7299018480438463e+228, 6.1359116592542813e-266];
  const verdicts = (B) => cases.map((v) => M.judge(v, M.convert(v, M.buildTable(B))).verdict);
  assert.deepEqual(verdicts(50), ["too long", "no round trip", "ok"]);
  assert.equal(M.formatOutput(...Object.values(M.convert(cases[0], M.buildTable(50)))), "3.2943123175907313e-79");
  assert.equal(M.formatOutput(...Object.values(M.convert(cases[1], M.buildTable(50)))), "3.729901848043846e+228");
  assert.deepEqual(verdicts(52), ["ok", "ok", "no round trip"]);
  assert.equal(M.formatOutput(...Object.values(M.convert(cases[2], M.buildTable(52)))), "6.135911659254281e-266");
  // HARD_CASES "why" notes on the page.
  const failing = (i) => { const out = []; for (let B = 44; B <= 63; B++) if (M.judge(cases[i], M.convert(cases[i], M.buildTable(B))).verdict !== "ok") out.push(B); return out; };
  assert.deepEqual(failing(0), [44, 47, 48, 50]);
  assert.deepEqual(failing(1), [44, 45, 50]);
  assert.deepEqual(failing(2), [51, 52, 53]);
  for (let B = 54; B <= 63; B++) assert.deepEqual(verdicts(B), ["ok", "ok", "ok"]);
  // The failing comparison is a prefix test that the exact α answers differently.
  const t = M.trace(cases[0], M.buildTable(50));
  assert.deepEqual(t.rows.filter((r) => !r.agrees).map((r) => r.kind), ["prefix"]);
  // Rebuilt 63-bit table differs from the original in 114 entries.
  const t63 = M.buildTable(63); let diff = 0;
  for (let i = 0; i < 325; i++) if (t63.tn[i] !== M.ORIGINAL.tn[i] || t63.td[i] !== M.ORIGINAL.td[i]) diff++;
  assert.equal(diff, 114);
});

test("budget: separation guarantee from 59 bits on", () => {
  assert.ok(M.gapSummary(M.ORIGINAL).guaranteed);
  for (const B of [59, 60, 63]) assert.ok(M.gapSummary(M.buildTable(B)).guaranteed, String(B));
  for (const B of [50, 54, 58]) assert.ok(!M.gapSummary(M.buildTable(B)).guaranteed, String(B));
});

test("random testing is weak: the 50-bit table passes random doubles", () => {
  const table = M.buildTable(50);
  const rnd = M.makeRandom(7);
  let bad = 0;
  for (let i = 0; i < 30000; i++) { const v = rnd(); if (M.judge(v, M.convert(v, table)).verdict !== "ok") bad++; }
  assert.equal(bad, 0);
});

test("staircase for entry 50", () => {
  const { P, T } = M.alphaOfIndex(50);
  assert.equal(P, 1n << 166n);
  const conv = M.convergents(P, T);
  assert.deepEqual(conv.slice(0, 7).map((c) => c.a), [0n, 1n, 14n, 2n, 7n, 1n, 84n]);
  const j = conv.findIndex((c) => c.a === 479n);
  assert.equal(j, 31);
  assert.equal(M.bitLength(conv[30].k), 55);
  assert.equal(M.bitLength(conv[31].k), 64);
  const e = M.entryOf(M.ORIGINAL, 50);
  assert.ok(e.higher);
  const c = (e.num - conv[29].h) / conv[30].h;
  assert.equal(c, 329n);
  assert.equal(c * conv[30].h + conv[29].h, e.num);
  assert.equal(c * conv[30].k + conv[29].k, e.den);
  assert.ok(e.den < 1n << 63n && (c + 1n) * conv[30].k + conv[29].k >= 1n << 63n);
  assert.equal(M.log2Big(e.den).toFixed(3), "62.998");
  // Farey neighbours, and the sum of denominators exceeds 2^63.
  const det = e.num * conv[30].k - e.den * conv[30].h;
  assert.ok(det === 1n || det === -1n);
  assert.ok(e.den + conv[30].k > 1n << 63n);
});
