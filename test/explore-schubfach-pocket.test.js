import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/schubfach-pocket-model.js";

const fmt = (dec) => M.jsFormat(dec);

test("game rounds: binary16 values, intervals and Schubfach paths", () => {
  const want = {
    "0.1": { c: 1638n, q: -14, k: -5, closed: true, path: "w′", out: "0.1", checks: 2, Vl: "9994.506", Vr: "10000.610" },
    "0.3": { c: 1229n, q: -12, k: -4, closed: false, path: "u′", out: "0.3", checks: 1, Vl: "2999.267", Vr: "3001.708" },
    "1/3": { c: 1365n, q: -12, k: -4, closed: false, path: "w (closer)", out: "0.3333", checks: 4, Vl: "3331.298", Vr: "3333.740" },
    pi: { c: 1608n, q: -9, k: -3, closed: true, path: "u′", out: "3.14", checks: 1, Vl: "3139.648", Vr: "3141.601" },
    "2.375": { c: 1216n, q: -9, k: -3, closed: true, path: "u", out: "2.375", checks: 4 },
    "2.083984375": { c: 1067n, q: -9, k: -3, closed: false, path: "w", out: "2.084", checks: 4 },
    1: { c: 1024n, q: -10, k: -4, closed: true, path: "u′", out: "1", checks: 1, irregular: true },
    "0.15625": { c: 1280n, q: -13, k: -4, closed: true, path: "tie → u (even)", out: "0.1562", checks: 4 },
    4112: { c: 1028n, q: 2, k: 0, closed: true, path: "u′", out: "4110", checks: 1 },
  };
  for (const r of M.ROUNDS) {
    const w = want[r.input];
    const { tr, cq } = M.roundInfo(r.input);
    assert.equal(cq.c, w.c, r.input);
    assert.equal(cq.q, w.q, r.input);
    assert.equal(tr.k, w.k, r.input);
    assert.equal(tr.closed, w.closed, r.input);
    assert.equal(tr.path, w.path, r.input);
    assert.equal(fmt(tr.result), w.out, r.input);
    assert.equal(tr.checks.length, w.checks, r.input);
    assert.equal(tr.irregular, !!w.irregular, r.input);
    if (w.Vl) {
      assert.equal(M.ratFixed(tr.Vl, 3).replace("…", ""), w.Vl, r.input);
      assert.equal(M.ratFixed(tr.Vr, 3).replace("…", ""), w.Vr, r.input);
    }
    // Pigeonhole: fine ruler >= 1 tick, coarse ruler <= 1 tick.
    assert.ok(M.countInside(tr, tr.k) >= 1n);
    assert.ok(M.countInside(tr, tr.k + 1) <= 1n);
    // The offered rulers always contain the fine and the coarse ruler.
    const offered = M.offeredRulers(tr);
    assert.ok(offered.includes(tr.k) && offered.includes(tr.k + 1), r.input);
  }
  assert.equal(M.exactString(M.roundInfo("0.1").cq), "0.0999755859375");
  assert.equal(M.exactString(M.roundInfo("pi").cq), "3.140625");
  assert.equal(M.exactString(M.roundInfo("1/3").cq), "0.333251953125");
});

test("bonus round 4112: 4110 reads back as 4112, 4108 must print itself", () => {
  const rb = M.readBack({ d: 411n, e: 1 }, { c: 1028n, q: 2 });
  assert.ok(rb.ok);
  assert.equal(M.exactString(M.roundToFormat(M.rat(4110n))), "4112");
  const t = M.schubfachExact({ c: 1027n, q: 2 });
  assert.equal(fmt(t.result), "4108");
});

test("all 31,743 positive binary16 values: four checks = brute-force shortest, and read back", () => {
  let n = 0;
  for (const cq of M.allValues(M.HALF)) {
    n++;
    const t = M.schubfachExact(cq, M.HALF);
    const o = M.shortestOracle(cq, M.HALF);
    assert.ok(M.decEq(t.result, o), `${M.exactString(cq)}: ${fmt(t.result)} vs ${fmt(o)}`);
    assert.ok(M.readBack(t.result, cq).ok);
    assert.ok(t.checks.length <= 4);
    assert.ok(M.countInside(t, t.k) >= 1n && M.countInside(t, t.k + 1) <= 1n);
  }
  assert.equal(n, 31743);
});

test("roundToFormat matches IEEE binary16 on a few known values", () => {
  assert.deepEqual(M.roundToFormat(M.rat(65504n)), { c: 2047n, q: 5 });
  assert.ok(M.roundToFormat(M.rat(65520n)).overflow); // halfway to 2^16 rounds up to infinity
  assert.deepEqual(M.roundToFormat(M.rat(65519n)), { c: 2047n, q: 5 });
  assert.deepEqual(M.roundToFormat(M.rat(1n, 1n << 24n)), { c: 1n, q: -24 });
});

test("Java's integer log formulas equal exact logarithms", () => {
  for (let q = -1074; q <= 971; q++) {
    assert.equal(M.flog10pow2(q), M.floorLog10(M.pow2rat(q)));
    assert.equal(M.flog10threeQuartersPow2(q), M.floorLog10(mul34(q)));
  }
  for (let e = -400; e <= 400; e++) assert.equal(M.flog2pow10(e), M.floorLog2(M.pow10rat(e)));
});
function mul34(q) {
  const p = M.pow2rat(q);
  return M.rat(3n * p.n, 4n * p.d);
}

test("table: 2^125 < g < 2^126 and g overestimates 10^-k by less than one unit", () => {
  for (let k = -324; k <= 292; k++) {
    const { g, beta } = M.gOf(-k);
    assert.ok(g > 1n << 125n && g < 1n << 126n, `k=${k}`);
    assert.equal(g, M.floorRat(beta) + 1n);
  }
  assert.equal(M.gOf(0).g, (1n << 125n) + 1n);
  assert.equal(M.gOf(17).g.toString(16), "2c68af0bb14000000000000000000001");
});

const EXAMPLES = [0.3, 0.1 + 0.2, 0.1, 1e23, 1.4430606624460001e122, 18014398509481988, 1476640867921609.25,
  5e-324, 2 ** -10, 2 ** 53, Number.MAX_VALUE, 2.2250738585072014e-308, 2 / 3, 123.456, 9007199254740993];

test("binary64: exact algorithm, fast round-to-odd and String(v) agree", () => {
  const values = [...EXAMPLES];
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 20000; i++) values.push(M.randomDouble(rand));
  for (let e = -1074; e <= 1023; e += 7) values.push(2 ** e);
  for (const v of values) {
    const ex = M.exact64(v);
    const fa = M.fast64(v, "ro");
    assert.equal(fmt(ex.result), String(v), `exact ${v}`);
    assert.equal(fa.text, String(v), `fast ${v}`);
    assert.equal(fa.vbl, M.roExact(ex.Vl));
    assert.equal(fa.vb, M.roExact(ex.V));
    assert.equal(fa.vbr, M.roExact(ex.Vr));
    assert.equal(fa.k, ex.k);
    assert.ok(fa.h >= 2 && fa.h <= 5);
  }
});

test("worked double examples (Act 2)", () => {
  const e3 = M.exact64(0.3);
  assert.equal(e3.k, -17);
  assert.equal(M.ratFixed(e3.Vl, 2), "29999999999999996.11…");
  assert.equal(M.ratFixed(e3.Vr, 2), "30000000000000001.66…");

  // Truncation failure.
  const big = 1.4430606624460001e122;
  const eb = M.exact64(big);
  assert.equal(eb.c, 7864952764660002n);
  assert.equal(eb.q, 353);
  assert.equal(eb.k, 106);
  assert.equal(eb.s, 14430606624460000n);
  assert.equal(M.ratFixed(eb.Vl, 3), "14430606624460000.046…");
  const tb = M.fast64(big, "trunc");
  assert.equal(tb.vbl, 57722426497840000n);
  assert.equal(tb.text, "1.443060662446e+122");
  assert.notEqual(Number(tb.text), big);
  assert.equal(M.fast64(big, "ro").vbl, 57722426497840001n);

  // Naive sticky failure: excluded endpoint accepted.
  const x = 18014398509481988;
  assert.equal(x, 2 ** 54 + 4);
  const nx = M.fast64(x, "naive");
  assert.equal(nx.k, 0);
  assert.equal(nx.g, (1n << 125n) + 1n);
  assert.equal(nx.text, "18014398509481990");
  assert.equal(Number(nx.text), 18014398509481992);
  assert.equal(M.fast64(x, "ro").text, "18014398509481988");

  // Naive sticky breaks the exact tie.
  const tie = 1476640867921609.25;
  assert.equal(M.exact64(tie).path, "tie → u (even)");
  assert.equal(M.fast64(tie, "naive").text, "1476640867921609.3");
  assert.equal(M.fast64(tie, "ro").text, "1476640867921609.2");

  // 1e23: the right end is exactly the coarse tick and included (c even).
  const e23 = M.exact64(1e23);
  assert.equal(e23.c, 5960464477539062n);
  assert.equal(M.cmp(e23.Vr, M.rat(10n ** 16n)), 0);
  assert.equal(M.fast64(1e23, "ro").vbr, 40000000000000000n);
});

test("fuzz helper counts failures only for the shortcuts", () => {
  const st = M.fuzz([1.4430606624460001e122, 18014398509481988, 0.3]);
  assert.equal(st.ro.wrong, 0);
  assert.equal(st.trunc.noRoundTrip, 1);
  assert.equal(st.naive.noRoundTrip, 1);
});

test("jsFormat follows Number::toString", () => {
  for (const v of [1e21, 1e-7, 123e-20, 0.000001, 1.5e300, 5e-324, 100, 0.1]) {
    const e = M.exact64(v);
    assert.equal(fmt(e.result), String(v));
  }
});
