// Copyright (C) 2026 Toit contributors.
import test from "node:test";
import assert from "node:assert/strict";
import {
  bdRun, dtoaRun, jsDigits, formatJs, decompose, exactDecimal, parseInput, pow5multParts, pow5multCount,
  bdCode, MACHINE_PRESETS, ROUTE_PRESETS,
} from "../site/explore/js/descendants-machine-model.js";

// Deterministic pseudo-random doubles (xorshift over the bit pattern).
function* randomDoubles(n, seed = 0x9e3779b97f4a7c15n) {
  const view = new DataView(new ArrayBuffer(8));
  let s = seed;
  for (let i = 0; i < n; i++) {
    s ^= (s << 13n) & 0xffffffffffffffffn; s ^= s >> 7n; s ^= (s << 17n) & 0xffffffffffffffffn;
    view.setBigUint64(0, s & 0x7fefffffffffffffn);
    const v = view.getFloat64(0);
    if (v > 0 && Number.isFinite(v)) yield v;
  }
}
function edgeDoubles() {
  const out = [];
  for (let i = -1074; i <= 1023; i++) out.push(2 ** i);
  for (let n = -323; n <= 308; n++) out.push(Number(`1e${n}`));
  for (let i = 1; i < 2000; i++) out.push(i, i / 8, i * 0.001, 123456789 * i);
  out.push(Number.MAX_VALUE, 5e-324, 2.2250738585072014e-308, 2.225073858507201e-308, 9007199254740993, 1e15, 1e16);
  return out;
}

test("dtoa mode 0 (classic path) prints exactly the digits of Number#toString", () => {
  let n = 0;
  for (const v of [...randomDoubles(20000), ...edgeDoubles()]) {
    const r = dtoaRun(v);
    const js = jsDigits(v);
    assert.equal(r.digits, js.digits, `digits of ${v}`);
    assert.equal(r.decpt, js.decpt, `decpt of ${v}`);
    for (const row of r.loop) assert.ok(row.qest === row.dig || row.qest === row.dig - 1, `quorem guess ${v}`);
    n++;
  }
  assert.ok(n > 20000);
});

test("B&D free-format matches Number#toString except on exact final-digit ties", () => {
  let ties = 0;
  for (const v of [...randomDoubles(20000, 12345n), ...edgeDoubles()]) {
    const r = bdRun(v);
    assert.ok(r.roundTrips, `round trip ${v}`);
    if (r.text !== String(v)) {
      const last = r.frames.filter((f) => f.phase === "digit").at(-1);
      assert.ok(last.tieCase, `only ties may differ: ${v}`);
      assert.equal(bdRun(v, { tie: "even" }).text, String(v));
      ties++;
    }
    assert.equal(r.carried, false, "B&D never carries");
  }
  assert.ok(ties >= 1);
});

test("0.1 walk-through numbers", () => {
  const { f, e } = decompose(0.1);
  assert.equal(f, 7205759403792794n);
  assert.equal(e, -56);
  const r = bdRun(0.1);
  const [init, est, scale, fix, dig] = r.frames;
  assert.equal(init.row, 3);
  assert.equal(init.r, 2n * f);
  assert.equal(init.s, 144115188075855872n);
  assert.equal(init.s, 2n ** 57n);
  assert.equal(init.mp, 1n);
  assert.equal(est.est, -1);
  assert.equal(est.n, -4);
  assert.equal(scale.r, 144115188075855880n);
  assert.equal(scale.mp, 10n);
  assert.equal(fix.low, true);
  assert.equal(fix.k, 0);
  assert.equal(fix.r, 144115188075855880n); // no ×10
  assert.equal(dig.d, 1);
  assert.equal(dig.r, 8n);
  assert.equal(dig.tc1, true);
  assert.equal(dig.tc2, false);
  assert.equal(r.text, "0.1");
});

test("0.3 walk-through numbers", () => {
  const { f, e } = decompose(0.3);
  assert.equal(f, 5404319552844595n);
  assert.equal(e, -54);
  const r = bdRun(0.3);
  const [init, est, , fix, dig] = r.frames;
  assert.equal(init.s, 36028797018963968n);
  assert.equal(init.s, 2n ** 55n);
  assert.equal(init.r, 10808639105689190n);
  assert.equal(est.est, 0);
  assert.equal(fix.low, false);
  assert.equal(fix.r, 108086391056891900n);
  assert.equal(fix.mp, 10n);
  assert.equal(dig.d, 2);
  assert.equal(dig.r, init.s - 4n);
  assert.equal(dig.r + dig.mp, init.s + 6n);
  assert.equal(dig.tc1, false);
  assert.equal(dig.tc2, true);
  assert.equal(dig.emitted, 3);
  assert.equal(r.text, "0.3");
  assert.equal(exactDecimal(0.3), "0.299999999999999988897769753748434595763683319091796875");
});

test("switch: reader rounds ties to even (1e23)", () => {
  assert.equal(exactDecimal(1e23), "99999999999999991611392");
  const { f, e } = decompose(1e23);
  assert.equal(f % 2n, 0n);
  // Upper boundary = v + 2^e / 2 = 10^23 exactly.
  assert.equal((f << BigInt(e)) + (1n << BigInt(e - 1)), 10n ** 23n);
  assert.equal(e - 1, 23);
  assert.equal(bdRun(1e23).text, "1e+23");
  const strict = bdRun(1e23, { tiesEven: false });
  assert.equal(strict.text, "9.999999999999999e+22");
  assert.ok(strict.roundTrips);
  // B&D's own k: high = 10^23 is allowed, so k = 24 and the first quotient is 0.
  const r = bdRun(1e23);
  assert.equal(r.k, 24);
  assert.equal(r.est, 23);
  const d = r.frames.find((x) => x.phase === "digit");
  assert.equal(d.d, 0);
  assert.equal(d.emitted, 1);
  assert.equal(d.r + d.mp, d.s); // exactly on the upper boundary
});

test("switch: symmetric gaps at powers of two break 2^64", () => {
  assert.equal(bdRun(2 ** 64).text, "18446744073709552000");
  const bug = bdRun(2 ** 64, { symBug: true });
  assert.equal(bug.text, "18446744073709550000");
  assert.equal(bug.roundTrips, false);
  assert.equal(exactDecimal(bug.readsBack), "18446744073709549568");
  assert.equal(BigInt(exactDecimal(bug.readsBack)), 2n ** 64n - 2048n);
  for (const i of [-44, -25, 65, 66, 67]) assert.equal(bdRun(2 ** i, { symBug: true }).roundTrips, false, `2^${i}`);
  assert.equal(bdRun(2 ** 10, { symBug: true }).roundTrips, true);
});

test("switch: k from v needs a carry for 1e23 and for 298 of 632 powers of ten", () => {
  const r = bdRun(1e23, { kFromV: true });
  assert.equal(r.text, "1e+23");
  assert.equal(r.carried, true);
  const d = r.frames.find((x) => x.phase === "digit");
  assert.equal(d.d, 9);
  assert.equal(d.emitted, 10);
  let carries = 0, dtoaCarries = 0;
  for (let n = -323; n <= 308; n++) {
    const v = Number(`1e${n}`);
    const x = bdRun(v, { kFromV: true });
    assert.equal(x.text, String(v));
    if (x.carried) carries++;
    if (dtoaRun(v).carry) dtoaCarries++;
  }
  assert.equal(carries, 298);
  assert.equal(dtoaCarries, 298);
});

test("switch: final-digit tie rule (2237844659592604.25)", () => {
  assert.equal(exactDecimal(2237844659592604.25), "2237844659592604.25");
  assert.equal(bdRun(2237844659592604.25).text, "2237844659592604.3");
  assert.equal(bdRun(2237844659592604.25, { tie: "even" }).text, "2237844659592604.2");
  assert.equal(String(2237844659592604.25), "2237844659592604.2");
  assert.equal(Number("2237844659592604.3"), 2237844659592604.25);
  const d = dtoaRun(2237844659592604.25);
  assert.equal(d.digits, "22378446595926042");
  assert.equal(d.exit, "B");
  assert.equal(d.loop.at(-1).twoB, 0);
});

test("route: 0.3", () => {
  const r = dtoaRun(0.3);
  assert.deepEqual(r.route, ["entry", "special", "d2b", "ds", "kset", "sifork", "book", "cancel", "pow5", "specj",
    "dshift", "kfixj", "quorem", "exitC", "ret"]);
  assert.equal(r.st.ds.khat, -1);
  assert.equal(r.st.ds.ds.toFixed(5), "-0.51283");
  assert.equal(r.st.cancel.cancel, 1);
  assert.equal(r.loop[0].dig, 2);
  assert.equal(r.digits, "3");
  assert.equal(r.decpt, 0);
});

test("route: 1e23 takes every special branch", () => {
  const r = dtoaRun(1e23);
  assert.equal(r.st.ds.ds.toFixed(5), "23.00327");
  assert.equal(r.st.ds.khat, 23);
  assert.equal(r.st.ds.trueK, 22);
  assert.ok(r.route.includes("kset") && r.route.includes("kfix") && r.route.includes("round9"));
  assert.equal(r.st.cancel.cancel, 25);
  assert.equal(r.exit, "A");
  assert.equal(r.loop[0].dig, 9);
  assert.equal(r.loop[0].j1, 0);
  assert.equal(r.digits, "1");
  assert.equal(r.decpt, 24);
  assert.deepEqual(pow5multParts(23), [3, 4, 16]);
});

test("route: 5e-324", () => {
  const r = dtoaRun(5e-324);
  assert.equal(r.st.ds.ds.toFixed(5), "-323.27489");
  assert.equal(r.st.ds.khat, -324);
  assert.equal(r.st.ds.trueK, -324);
  assert.equal(r.st.cancel.cancel, 324);
  assert.equal(r.st.dshift.SBits, 764);
  assert.equal(r.st.dshift.bBits, 766);
  assert.equal(r.st.dshift.ghostS, 1076);
  assert.equal(r.st.dshift.ghostB, 1078);
  assert.deepEqual(pow5multParts(324), [4, 64, 256]);
  assert.equal(pow5multCount(324), 3);
  assert.equal(r.loop[0].dig, 4);
  assert.equal(r.loop[0].twoB, 1);
  assert.equal(r.exit, "B");
  assert.equal(r.digits, "5");
  assert.equal(r.decpt, -323);
});

test("route: 987.654, 123456, 1e-300, 2^64, DBL_MAX", () => {
  const a = dtoaRun(987.654);
  assert.equal(a.st.tens.khat, 3);
  assert.equal(a.st.tens.fired, true);
  assert.equal(a.st.tens.k, 2);
  assert.equal(a.digits, "987654");
  assert.equal(a.exit, "C");
  assert.equal(a.loop.length, 6);

  const b = dtoaRun(123456);
  assert.ok(b.route.includes("smallint") && !b.route.includes("quorem"));
  assert.equal(b.digits, "123456");
  assert.equal(b.decpt, 6);

  const c = dtoaRun(1e-300);
  assert.equal(c.loop[0].qest, 0);
  assert.equal(c.loop[0].dig, 1);
  assert.equal(c.exit, "B");
  assert.equal(c.decpt, -299);

  const d = dtoaRun(2 ** 64);
  assert.ok(d.route.includes("spec"));
  assert.equal(d.digits, "18446744073709552");

  const m = dtoaRun(Number.MAX_VALUE);
  assert.equal(m.loop.length, 17);
  assert.equal(m.digits, "17976931348623157");
  assert.equal(m.decpt, 309);
  assert.equal(m.st.dshift.SBits, 732);
  assert.equal(m.st.dshift.ghostS, 1025);
});

test("specials, presets, parsing and formatting", () => {
  assert.equal(dtoaRun(0).digits, "0");
  assert.equal(dtoaRun(Infinity).decpt, 9999);
  assert.equal(dtoaRun(-0.3).digits, "3");
  for (const p of [...MACHINE_PRESETS, ...ROUTE_PRESETS]) assert.equal(parseInput(p.label), p.value, p.label);
  assert.equal(parseInput("2^-1074"), 5e-324);
  assert.ok(Number.isNaN(parseInput("abc")));
  assert.equal(formatJs("1", 24), "1e+23");
  assert.equal(formatJs("3", 0), "0.3");
  assert.equal(formatJs("5", -323), "5e-324");
  assert.equal(formatJs("123", 1), "1.23");
  const code = bdCode({ kFromV: true, tie: "even" });
  assert.ok(code.some((l) => l.tag === "carry"));
  assert.ok(code.filter((l) => l.changed).length >= 2);
  assert.ok(!bdCode().some((l) => l.tag === "carry"));
});
