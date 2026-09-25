// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import {
  grisu3, grisu3Quick, grisu2, grisu1, cachedPowerFor, powerQ, exactAnswer, structuralReason,
  stripZeros, decimalText, sweepAt, makeRandom, rat, roff, rcmp, parseInput,
  PRESETS, SWEEP, SWEEP_N, SWEEP_SEED, SWEEP_FLOOR, SWEEP_G2, Q_MIN, Q_MAX,
} from "../site/explore/js/grisu-blur-model.js";
import { grisu3 as referenceGrisu3 } from "../site/js/grisu-reference.js";
import { fromBits } from "../site/js/float.js";

const off = (t, x) => roff(x, rat(t.W.f));
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test("q = 64 matches double-conversion's cache entries", () => {
  // Spot values quoted from cached-powers.cc.
  assert.equal(powerQ(-348, 64).f, 0xfa8fd5a0081c0288n);
  assert.equal(powerQ(-348, 64).e, -1220);
  assert.equal(powerQ(340, 64).f, 0xaf87023b9bf0ee6bn);
  assert.equal(powerQ(340, 64).e, 1066);
  assert.equal(powerQ(4, 64).f, 0x9c40000000000000n);
  assert.equal(powerQ(-20, 64).f, 0xbce5086492111aebn);
  assert.equal(powerQ(324, 64).f, 0x9e19db92b4e31ba9n);
});

test("a cached power fits the window for every binary exponent and every q", () => {
  const exps = [];
  for (let be = 0; be <= 0x7fe; be++) exps.push(be);
  for (let q = Q_MIN; q <= Q_MAX; q++) {
    for (const be of exps) {
      // smallest and largest significand of the binade (subnormals: several lengths)
      const lengths = be === 0 ? [1, 2, 20, 52] : [53];
      for (const L of lengths) {
        const e = (be === 0 ? -1074 : be - 1075) - (q - L);
        assert.doesNotThrow(() => cachedPowerFor(e, q));
      }
    }
  }
});

test("q = 64 Grisu3 equals the site's reference port (verdict and digits)", () => {
  const rnd = makeRandom(12345n);
  const values = [...PRESETS.map((p) => p.value), Number.MIN_VALUE, Number.MAX_VALUE, 2 ** -1022, 1, 2, 10, 1e21, 1e22, 5e22, 9007199254740993];
  for (let i = 0; i < 4000; i++) values.push(rnd());
  for (const v of values) {
    const ours = grisu3(v, 64);
    const ref = referenceGrisu3(v);
    assert.equal(ours.ok, ref.success, `verdict for ${v}`);
    const quick = grisu3Quick(v, 64);
    assert.equal(quick.verdict, ours.verdict, `quick verdict for ${v}`);
    if (ours.ok) {
      assert.equal(BigInt(ours.digits), ref.coefficient, `digits for ${v}`);
      assert.equal(ours.exp10, ref.decimalExponent, `exponent for ${v}`);
      const a = stripZeros(ours.digits, ours.exp10), b = exactAnswer(v);
      assert.deepEqual([a.digits, a.exp10], [b.digits, b.exp10], `accepted output is the exact answer for ${v}`);
    }
  }
});

test("accepted outputs are never wrong at any q", () => {
  const rnd = makeRandom(777n);
  for (const q of [56, 58, 60, 64, 72, 80]) {
    for (let i = 0; i < 600; i++) {
      const v = rnd();
      const r = grisu3Quick(v, q);
      if (r.verdict !== "ok") continue;
      const a = stripZeros(r.digits, r.exp10), b = exactAnswer(v);
      assert.deepEqual([a.digits, a.exp10], [b.digits, b.exp10], `q=${q} v=${v}`);
    }
  }
});

test("the blur is less than one unit, and too_low/too_high are outside the exact interval", () => {
  const rnd = makeRandom(99n);
  for (const q of [55, 60, 64, 80]) {
    for (let i = 0; i < 300; i++) {
      const t = grisu3(rnd(), q);
      for (const [computed, exact] of [[t.LO.f, t.ex.mMinus], [t.W.f, t.ex.v], [t.HI.f, t.ex.mPlus]]) {
        assert.ok(Math.abs(roff(rat(computed), exact)) < 1);
      }
      assert.ok(rcmp(rat(t.tooLow), t.ex.mMinus) < 0);
      assert.ok(rcmp(t.ex.mPlus, rat(t.tooHigh)) < 0);
      assert.ok(t.E >= -(q - 4) && t.E <= -(q - 32));
    }
  }
});

test("preset stories (q = 64)", () => {
  const g = (v) => grisu3(v, 64);

  const a = g(0.3);
  assert.equal(a.verdict, "ok");
  assert.equal(a.digits, "3"); assert.equal(a.exp10, -1);
  assert.equal(a.c.k, 4); assert.equal(a.E, -51); assert.equal(a.unsafe0, 1252n);
  assert.equal(a.steps.length, 1);
  assert.equal(a.steps[0].rest, 376n);
  assert.ok(near(off(a, a.candidate), 250));
  assert.ok(near(off(a, a.ex.mMinus), -625) && near(off(a, a.ex.mPlus), 625));

  const b = g(0.1 + 0.2);
  assert.equal(b.verdict, "ok");
  assert.deepEqual(b.walk.map((x) => x.digits), ["30000000000000007", "30000000000000006", "30000000000000005", "30000000000000004"]);
  assert.equal(b.steps.length, 17);

  const c = g(5e-324);
  assert.equal(c.verdict, "ok");
  assert.deepEqual(c.walk.map((x) => x.digits), ["7", "6", "5"]);
  assert.equal(c.walkStop, "farther");
  assert.equal(c.E, -60);

  const d = g(0.00093);
  assert.equal(d.verdict, "weed");
  assert.equal(d.digits, "93");
  assert.ok(d.trulyInside);
  assert.ok(near(roff(d.candidate, rat(d.tooLow)), 2.8));
  assert.ok(near(roff(d.candidate, d.ex.mMinus), 1.8));

  const e = g(3.14e-13);
  assert.equal(e.verdict, "weed");
  assert.ok(e.trulyInside);
  assert.ok(near(roff(e.candidate, rat(e.tooLow)), 3));

  const f = g(8.332404691393481);
  assert.equal(f.verdict, "round");
  // The midpoint between ...482 and ...481 lies only 0.34 units above W, inside W's +-1 unit blur.
  const ten = Number(f.tenKappa.n) / Number(f.tenKappa.d);
  assert.ok(near(off(f, f.candidate) - ten / 2, 0.34, 0.01));

  const h = g(1e23);
  assert.equal(h.verdict, "weed");
  assert.ok(h.onBoundary);
  assert.equal(rcmp(h.candidate, h.ex.mPlus), 0);
  assert.equal(rcmp(rat(h.HI.f), h.ex.mPlus), 0);
  assert.equal(structuralReason(1e23), "boundary");

  const k = g(105191451600.796875);
  assert.equal(k.verdict, "round");
  assert.equal(structuralReason(105191451600.796875), "tie");
  assert.equal(exactAnswer(105191451600.796875).text, "105191451600.79688");

  // Structural cases stay rejected at every q; the precision cases get accepted with more bits.
  for (let q = Q_MIN; q <= Q_MAX; q++) {
    assert.notEqual(grisu3Quick(1e23, q).verdict, "ok");
    assert.notEqual(grisu3Quick(105191451600.796875, q).verdict, "ok");
  }
  assert.equal(grisu3Quick(0.00093, 65).verdict, "ok");
  assert.equal(grisu3Quick(3.14e-13, 65).verdict, "ok");
  assert.equal(grisu3Quick(8.332404691393481, 65).verdict, "round");
  assert.equal(grisu3Quick(8.332404691393481, 66).verdict, "ok");
  assert.equal(grisu3Quick(0.00093, 72).verdict, "ok");
  assert.equal(grisu3Quick(3.14e-13, 72).verdict, "ok");
  assert.equal(grisu3Quick(8.332404691393481, 72).verdict, "ok");
});

test("exact answers of presets equal Number#toString", () => {
  for (const p of PRESETS) assert.equal(exactAnswer(p.value).text, String(p.value));
  assert.equal(decimalText("5", -324), "5e-324");
  assert.equal(decimalText("1", 23), "1e+23");
});

test("Grisu2 and Grisu1 outputs quoted on the page", () => {
  const t = (v, round = false) => { const r = grisu2(v, 64, round); return `${r.digits}e${r.exp10}`; };
  assert.equal(t(1e23), "9999999999999999e7");
  assert.equal(t(5e-324), "7e-324");
  assert.equal(t(5e-324, true), "5e-324");
  assert.equal(t(0.1 + 0.2), "30000000000000007e-17");
  assert.equal(t(0.1 + 0.2, true), "30000000000000004e-17");
  assert.equal(t(0.3), "3e-1");
  assert.equal(t(0.00093), "93e-5");
  assert.equal(t(3.14e-13), "314e-15");
  // Grisu2 always reads back.
  const rnd = makeRandom(4242n);
  for (let i = 0; i < 2000; i++) {
    const v = rnd();
    for (const round of [false, true]) {
      const r = grisu2(v, 64, round);
      assert.equal(Number(`${r.digits}e${r.exp10}`), v);
    }
  }
  assert.deepEqual(grisu1(0.3), { digits: "29999999999999998888", exp10: -20 });
  assert.deepEqual(grisu1(1), { digits: "10000000000000000000", exp10: -19 });
  assert.equal(Number("29999999999999998888e-20"), 0.3);
});

test("published sweep numbers are reproducible", () => {
  for (const q of [55, 57, 60, 64, 70]) {
    const row = SWEEP.find((r) => r[0] === q);
    const r = sweepAt(q, SWEEP_N, SWEEP_SEED);
    assert.deepEqual([r.q, r.round, r.weed], row, `q = ${q}`);
  }
  // Floor: every rejection at q = 80 in the sample is structural.
  const rnd = makeRandom(SWEEP_SEED);
  let tie = 0, boundary = 0, rej = 0, rejStructural = 0, longer = 0, notClosest = 0, roundedNotClosest = 0;
  for (let i = 0; i < SWEEP_N; i++) {
    const v = rnd();
    const s = structuralReason(v);
    if (s === "tie") tie++; else if (s === "boundary") boundary++;
    if (grisu3Quick(v, 80).verdict !== "ok") { rej++; if (s) rejStructural++; }
    const r64 = grisu3Quick(v, 64);
    if (r64.verdict === "ok") {
      const a64 = stripZeros(r64.digits, r64.exp10), e64 = exactAnswer(v);
      assert.deepEqual([a64.digits, a64.exp10], [e64.digits, e64.exp10], `sample accepted output for ${v}`);
    }
    const ex = exactAnswer(v);
    const g = grisu2(v, 64), a = stripZeros(g.digits, g.exp10);
    const gr = grisu2(v, 64, true), b = stripZeros(gr.digits, gr.exp10);
    if (a.digits.length > ex.digits.length) longer++;
    else if (a.digits !== ex.digits || a.exp10 !== ex.exp10) notClosest++;
    if (b.digits.length === ex.digits.length && (b.digits !== ex.digits || b.exp10 !== ex.exp10)) roundedNotClosest++;
  }
  assert.deepEqual({ tie, boundary }, SWEEP_FLOOR);
  assert.equal(rej, rejStructural);
  assert.equal(rej, SWEEP.at(-1)[1] + SWEEP.at(-1)[2]);
  assert.deepEqual({ longer, notClosest, roundedNotClosest }, SWEEP_G2);
});

test("parseInput", () => {
  assert.equal(parseInput("0.1+0.2"), 0.1 + 0.2);
  assert.equal(parseInput("1e23"), 1e23);
  assert.equal(parseInput("5e-324"), 5e-324);
  assert.equal(parseInput("-1"), null);
  assert.equal(parseInput("abc"), null);
  assert.equal(parseInput("0"), null);
  assert.equal(parseInput(String(fromBits(0x7fefffffffffffffn))), Number.MAX_VALUE);
});

test("a 2-unit lower margin (the paper's prose) would reject fewer and still be right on the sample", () => {
  const rnd = makeRandom(SWEEP_SEED);
  let rej4 = 0, rej2 = 0, wrong2 = 0;
  for (let i = 0; i < SWEEP_N; i++) {
    const v = rnd();
    const t = grisu3(v, 64);
    if (!t.ok) rej4++;
    const ok2 = !t.ambiguous && t.safeLow && rcmp(t.finalRest, rat(t.unsafe0 - 2n)) <= 0;
    if (!ok2) rej2++;
    else {
      const a = stripZeros(t.digits, t.exp10), b = exactAnswer(v);
      if (a.digits !== b.digits || a.exp10 !== b.exp10) wrong2++;
    }
  }
  assert.deepEqual({ rej4, rej2, wrong2 }, { rej4: 102, rej2: 88, wrong2: 0 });
});
