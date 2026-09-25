// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze, countTicks, formatR, parseInput, PRESETS, javaK, floorLog10, doubleOf, decompose,
  C_MIN, Q_MIN, formatShortest,
} from "../site/explore/js/schubfach-rulers-model.js";
import { shortestDecimal } from "../site/js/oracle.js";
import { fromBits } from "../site/js/float.js";

function parseShortest(text) {
  // JS Number#toString digits and exponent, normalized (no trailing zeros).
  const m = text.match(/^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/);
  let digits = (m[1] + (m[2] || "")).replace(/^0+/, "");
  let exp = Number(m[3] || 0) - (m[2] || "").length;
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); exp++; }
  return { f: BigInt(digits), e: exp };
}

function check(v) {
  const a = analyze(v);
  const want = parseShortest(String(Math.abs(v)));
  assert.equal(a.f, want.f, `digits of ${v}`);
  assert.equal(a.fe, want.e, `exponent of ${v}`);
  assert.equal(a.text, String(Math.abs(v)), `text of ${v}`);
  // pigeonhole invariants
  assert.ok(countTicks(a, 0) >= 1n, `fine ruler hits ${v}`);
  assert.ok(countTicks(a, 1) <= 1n, `coarse ruler at most one tick ${v}`);
  assert.ok(countTicks(a, 0) <= 10n);
  assert.equal(a.k, a.javaK, `Java k formula for ${v}`);
  return a;
}

test("matches Number#toString on presets and edge values", () => {
  for (const p of PRESETS) check(parseInput(p.input));
  for (const v of [Number.MIN_VALUE, 2 * Number.MIN_VALUE, Number.MAX_VALUE, 2 ** -1022, 2 ** -1022 - 2 ** -1074, 1, 2, 10, 1e21, 1e22, 9007199254740993, 123.456, 1e-7, 5e-7]) check(v);
});

test("matches Number#toString and the oracle on random doubles", () => {
  let seed = 12345n;
  const rnd = () => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return seed; };
  let n = 0;
  while (n < 4000) {
    const bits = rnd() & ((1n << 63n) - 1n);
    const v = fromBits(bits);
    if (!Number.isFinite(v) || v === 0) continue;
    const a = check(v);
    if (n < 400) {
      const o = shortestDecimal(v);
      assert.equal(a.f, o.coefficient);
      assert.equal(a.fe, o.exponent);
    }
    n++;
  }
});

test("all powers of two (irregular spacing)", () => {
  for (let e = -1074; e <= 1023; e++) check(2 ** e);
});

test("Java's k formula equals floor(log10 width) for every exponent", () => {
  for (let q = Q_MIN; q <= 971; q++) {
    const [n, d] = q >= 0 ? [1n << BigInt(q), 1n] : [1n, 1n << BigInt(-q)];
    assert.equal(javaK(q, false), floorLog10(n, d), `regular q=${q}`);
    if (q > Q_MIN) assert.equal(javaK(q, true), floorLog10(3n * n, 4n * d), `irregular q=${q}`);
  }
});

test("k depends only on q: every c in a binade gets the same k", () => {
  for (const q of [-54, -1074, 0, 10, 500]) {
    const ks = new Set();
    for (let i = 1n; i < 200n; i++) {
      const c = C_MIN + ((C_MIN - 1n) * i) / 200n;
      ks.add(analyze(doubleOf(c, q)).k);
    }
    assert.equal(ks.size, 1, `q=${q}`);
  }
  assert.equal(decompose(doubleOf(C_MIN + 5n, -54)).c, C_MIN + 5n);
});

test("hook numbers: 0.3 and 0.1+0.2 are neighbours with touching intervals", () => {
  const a = analyze(0.3), b = analyze(0.1 + 0.2);
  assert.equal(a.c, 5404319552844595n);
  assert.equal(b.c, a.c + 1n);
  assert.equal(a.q, -54);
  assert.equal(a.k, -17);
  assert.equal(b.k, -17);
  assert.deepEqual([a.Vr.n * b.Vl.d], [b.Vl.n * a.Vr.d]); // shared endpoint
  assert.equal(formatR(a.Vl), "29999999999999996.114…");
  assert.equal(formatR(a.V), "29999999999999998.889…");
  assert.equal(formatR(a.Vr), "30000000000000001.665…");
  assert.equal(formatR(b.V), "30000000000000004.440…");
  assert.equal(formatR(b.Vr), "30000000000000007.216…");
  assert.equal(a.closed, false);
  assert.equal(b.closed, true);
  assert.equal(countTicks(a, 0), 5n);
  assert.equal(countTicks(b, 0), 6n);
  assert.equal(countTicks(a, 1), 1n);
  assert.equal(countTicks(b, 1), 0n);
  assert.equal(a.path, "w'");
  assert.equal(a.wP, 30000000000000000n);
  assert.equal(a.digits, 3000000000000000n); // s′ + 1, at 10^(k+1)
  assert.equal(a.zeros, 15);
  assert.equal(b.path, "u-closer");
  assert.equal(b.text, "0.30000000000000004");
  assert.equal(formatR({ n: b.V.n - b.s * b.V.d, d: b.V.d }), "0.440…");
  assert.equal(formatR({ n: (b.s + 1n) * b.V.d - b.V.n, d: b.V.d }), "0.559…");
});

test("preset paths described in the prose", () => {
  const p = (x) => analyze(parseInput(x));
  assert.equal(p("0.1").path, "u'");
  const t = p("2/3");
  assert.equal(t.path, "u");
  assert.equal(countTicks(t, 0), 1n);
  const e = p("1e23");
  assert.equal(e.path, "w'");
  assert.equal(e.c, 5960464477539062n);
  assert.equal(e.k, 7);
  assert.equal(formatR(e.Vr), "10000000000000000");
  assert.equal(e.closed, true);
  const tie = p("562949953421312.25");
  assert.equal(tie.path, "tie");
  assert.equal(formatR(tie.V), "5629499534213122.5");
  assert.equal(tie.text, "562949953421312.2");
  const pw = p("2^62");
  assert.equal(pw.irregular, true);
  assert.equal(pw.k, 2);
  assert.equal(formatR(pw.width), "7.68");
  assert.equal(javaK(10, false), 3);
  const tiny = p("5e-324");
  assert.equal(tiny.s, 4n);
  assert.equal(tiny.coarseChecked, false);
  assert.equal(tiny.text, "5e-324");
});

test("parseInput", () => {
  assert.equal(parseInput("0.1+0.2"), 0.1 + 0.2);
  assert.equal(parseInput("2/3"), 2 / 3);
  assert.equal(parseInput("2^-10"), 2 ** -10);
  assert.equal(parseInput("2**53"), 2 ** 53);
  assert.equal(parseInput(" 1e-5 - 2 "), 1e-5 - 2);
  assert.equal(parseInput("-0.5"), -0.5);
  assert.equal(parseInput("abc"), null);
  assert.equal(parseInput("1+"), null);
});

test("formatShortest mirrors Number#toString thresholds", () => {
  for (const v of [1e21, 1e20, 1e-6, 1e-7, 123.25, 0.5, 5e-324, 1.7976931348623157e308]) {
    const a = analyze(v);
    assert.equal(formatShortest(a.f, a.fe), String(v));
  }
});
