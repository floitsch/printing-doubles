// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import {
  Q, qSub, qDiv, qCmp, qAbs, qMul, qPow10, qPow2, qOfDouble, qOfDD, qToNumber, qSci, qDecimal,
  lookupEntry, LOOKUP_LEN, frexpExp, hpMul10, errolDD, judge, route, enum3Entries, enum3Lookup,
  analyze, computedBoundary, verdict, outputText, fpprev, ERROL1_EPSILON, INT_LOW, INT_HIGH,
} from "../site/explore/js/errol-microscope-model.js";
import { shortestDecimal } from "../site/js/oracle.js";
import { fromBits } from "../site/js/float.js";

const ulpUnits = (a, q) => qToNumber(qDiv(q, a.ulp));
const focusB = (a) => (a.candidate.boundary === "lower" ? a.iv.lower : a.iv.upper);

test("lookup table: 10^(308-i) as nearest double plus nearest double of the residual", () => {
  // Spot values from lookup.h (5364de4).
  assert.deepEqual(lookupEntry(0), { val: 1e308, off: -1.097906362944045488e+291, k: 308 });
  assert.deepEqual(lookupEntry(1), { val: 1e307, off: 1.396894023974354241e+290, k: 307 });
  assert.equal(lookupEntry(5).off, -1.617650767864564452e+284);
  assert.equal(lookupEntry(307).off, 0);
  // Every entry: off is the correctly rounded residual 10^k − val.
  for (let i = 0; i < LOOKUP_LEN; i++) {
    const e = lookupEntry(i);
    const exact = qSub(qPow10(e.k), qOfDouble(e.val));
    const err = qAbs(qSub(exact, qOfDouble(e.off)));
    if (e.off === 0) { assert.equal(exact.n, 0n); continue; }
    // |error| ≤ half an ulp of off (2^-53 relative, generously).
    assert.ok(qCmp(err, qMul(qAbs(qOfDouble(e.off)), qPow2(-52))) <= 0, `entry ${i}`);
  }
});

test("frexp exponent, including subnormals", () => {
  assert.equal(frexpExp(1), 1);
  assert.equal(frexpExp(0.1), -3);
  assert.equal(frexpExp(3.14), 2);
  assert.equal(frexpExp(5e-324), -1073);
});

test("mul10 recovers the rounding loss exactly", () => {
  for (const x of [0.1, 1 / 3, Math.PI, 7.1234567890123, 9.999999999999998]) {
    const h = { val: x, off: 0 };
    const d = hpMul10(h);
    assert.ok(qCmp(qSub(qOfDouble(d.rounded), qMul(Q(10n), qOfDouble(x))), qOfDouble(d.loss)) === 0);
    assert.ok(qCmp(qOfDD(h), qMul(Q(10n), qOfDouble(x))) === 0, "dd result is exact here");
  }
});

// Outputs of the C code (5364de4, errol3u_dtoa / errol1_dtoa) for these inputs.
const C_ERROL3U = [
  [0.1, "1", 0], [0.3, "3", 0], [3.14, "314", 1], [Math.PI, "3141592653589793", 1], [1.1, "11", 1],
  [5e-324, "5", -323], [4.0648030339495312e68, "4064803033949531", 69],
  [9.856469199218561e-57, "985646919921856", -56], [2.215901545757777e-196, "22159015457577772", -195],
];
const C_ERROL1 = [
  [2.345678901234567e16, "23456789012345672", 17, false], [1e23, "9999999999999999", 23, false],
  [4.0648030339495312e68, "40648030339495312", 69, false], [9.856469199218561e-57, "9856469199218561", -56, false],
  [2.215901545757777e-196, "22159015457577772", -195, false], [0.1, "1", 0, true], [3.14, "314", 1, true],
];

test("double-double path matches the C code", () => {
  for (const [x, digits, exp] of C_ERROL3U) {
    const r = errolDD(x);
    assert.equal(r.digits, digits, String(x));
    assert.equal(r.exp, exp, String(x));
  }
  for (const [x, digits, exp, opt] of C_ERROL1) {
    const r = errolDD(x, { variant: "errol1" });
    assert.deepEqual([r.digits, r.exp, r.opt], [digits, exp, opt], String(x));
  }
});

test("loom toggles: deleting the negative-offset line, paper-era last digit", () => {
  assert.equal(errolDD(0.1, { negFix: false }).digits, "10000000000000001");
  assert.equal(outputText("10000000000000001", 0), "0.10000000000000001");
  assert.equal(errolDD(0.2, { negFix: false }).digits, "20000000000000001");
  assert.equal(errolDD(0.9, { negFix: false }).digits, "90000000000000002");
  const r = errolDD(0.1);
  const last = r.steps.at(-1);
  assert.equal(last.hdig, 1); assert.equal(last.ldig, 0); assert.ok(last.lfixed);
  assert.equal(last.low.val, 1); assert.ok(last.low.off < 0);
  // Paper-era rule (emit hdig) vs current rule for 5e-324.
  assert.equal(errolDD(5e-324, { lastDigit: "hdig" }).digits, "7");
  assert.equal(errolDD(5e-324).digits, "5");
  // π: 16 digit pairs then the loop stops.
  assert.equal(errolDD(Math.PI).steps.length, 16);
});

test("near-miss and exact-hit numbers quoted in the prose", () => {
  const a = analyze(4.0648030339495312e68);
  assert.equal(a.candidate.text, "4.064803033949531e+68");
  assert.equal(a.candidate.side, "outside");
  assert.equal(a.iv.closed, false);
  assert.equal(qSci(a.iv.lower, 69).replace(".", ""), "406480303394953100000000000000003062609900768698438898776254040768512e68");
  const d = qSub(a.candidate.value, focusB(a));
  assert.equal(ulpUnits(a, d).toPrecision(2), "-6.4e-17");
  assert.equal(qToNumber(qDiv(d, focusB(a))).toPrecision(2), "-7.5e-33");
  const cb = computedBoundary(a);
  assert.equal(cb.step, 16);
  assert.equal(ulpUnits(a, qSub(cb.value, focusB(a))).toPrecision(2), "-6.9e-17");
  assert.equal(qToNumber(qDiv(qSub(cb.value, focusB(a)), focusB(a))).toPrecision(2), "-8.1e-33");
  assert.equal(Number("4.064803033949531e68"), fpprev(4.0648030339495312e68));

  const b = analyze(2.215901545757777e-196);
  assert.equal(b.candidate.side, "inside");
  assert.equal(ulpUnits(b, qSub(b.candidate.value, focusB(b))).toPrecision(2), "7.0e-19");
  assert.equal(ulpUnits(b, qSub(computedBoundary(b).value, focusB(b))).toPrecision(2), "4.6e-17");
  assert.equal(judge(b.v, b.dd.digits, b.dd.exp).text, "2.2159015457577772e-196");

  const c = analyze(9.856469199218561e-57);
  assert.equal(c.candidate.text, "9.85646919921856e-57");
  assert.equal(ulpUnits(c, qSub(c.candidate.value, focusB(c))).toPrecision(2), "-9.3e-18");
  assert.equal(Number("9.85646919921856e-57"), fpprev(9.856469199218561e-57));

  const s = analyze(3.14);
  assert.equal(s.candidate.text, "3.14");
  assert.equal(ulpUnits(s, qSub(s.candidate.value, focusB(s))).toFixed(2), "0.22");
  assert.deepEqual(["53", "64", "106", "exact"].map((p) => verdict(s, p).kind), ["near", "safe", "safe", "exact"]);
  assert.deepEqual(["53", "64", "106"].map((p) => verdict(a, p).kind), ["near", "near", "near"]);

  const p = analyze(6.62607015e-34);
  assert.equal(ulpUnits(p, qSub(computedBoundary(p).value, focusB(p))).toPrecision(2), "4.9e-17");
});

test("exact hits: 2.345678901234567e16, its odd neighbour, and 1e23", () => {
  const even = 23456789012345672;
  const odd = 23456789012345668;
  assert.equal(Number("2.345678901234567e16"), even);
  assert.equal(23456789012345670n % 4n, 2n);
  const a = analyze(even); const b = analyze(odd);
  assert.equal(a.iv.closed, true); assert.equal(b.iv.closed, false);
  assert.equal(qCmp(a.iv.lower, Q(23456789012345670n)), 0);
  assert.equal(qCmp(b.iv.upper, Q(23456789012345670n)), 0);
  assert.equal(a.candidate.side, "on-closed"); assert.equal(b.candidate.side, "on-open");
  // The fast path prints the same digits for both; only one can be right.
  assert.equal(errolDD(even).digits, "2345678901234567");
  assert.equal(errolDD(odd).digits, "2345678901234567");
  assert.equal(judge(odd, "2345678901234567", 17).roundTrips, false);
  assert.equal(shortestDecimal(odd).text, "23456789012345668");
  // Errol1 narrowing loses the closed-boundary answer.
  assert.equal(errolDD(even, { variant: "errol1" }).digits, "23456789012345672");
  // 1e23 is the upper midpoint of the double below it.
  const c = analyze(1e23);
  assert.equal(qCmp(c.iv.upper, Q(10n ** 23n)), 0);
  assert.equal(qCmp(c.iv.center, Q(99999999999999991611392n)), 0);
  assert.equal(qCmp(qOfDouble(1.0000000000000001e23), Q(100000000000000008388608n)), 0);
  assert.equal(errolDD(1.0000000000000001e23).digits, "1");
  assert.equal(route(1e23).path, "int");
});

test("routing of errol3_dtoa", () => {
  assert.equal(route(123.456).path, "fixed");
  assert.equal(route(0.1).path, "dd");
  assert.equal(route(16).path, "fixed");
  assert.equal(route(2 ** 53).path, "fixed");
  assert.equal(route(2 ** 53 + 2).path, "int");
  assert.equal(route(2 ** 64).path, "int");
  assert.equal(route(1e300).path, "dd");
  assert.equal(route(4.0648030339495312e68).path, "table");
  assert.ok(INT_HIGH < 2 ** 128 && INT_HIGH > 2 ** 127);
  assert.equal(INT_LOW, 2 ** 53);
});

test("enum3 table: 432 entries, stored answers are correct and shortest, fast path fails on each", () => {
  const entries = enum3Entries();
  assert.equal(entries.size, 432);
  let wrong = 0; let long = 0; let overflow = 0;
  for (const [bits, e] of entries) {
    const x = fromBits(bits);
    const j = judge(x, e.digits, e.exp);
    assert.ok(j.roundTrips && j.shortest, `table answer for ${x}`);
    const r = errolDD(x);
    if (r.overflow) { overflow++; continue; }
    const f = judge(x, r.digits, r.exp);
    if (!f.roundTrips) wrong++; else if (!f.shortest) long++;
  }
  assert.deepEqual([wrong, long, overflow], [286, 145, 1]);
  assert.ok(enum3Lookup(Number.MAX_VALUE));
});

test("closest is best effort: 2^-1019 and non-closest powers of two", () => {
  const x = 2 ** -1019;
  assert.equal(String(x), "1.7800590868057611e-307");
  const r = errolDD(x);
  const j = judge(x, r.digits, r.exp);
  assert.equal(j.text, "1.7800590868057612e-307");
  assert.ok(j.roundTrips && j.shortest);
  assert.equal(route(x).path, "dd");
  let notClosest = 0; let fail = 0;
  for (let e = -1074; e <= 1023; e++) {
    const v = 2 ** e;
    if (route(v).path !== "dd") continue;
    const d = errolDD(v);
    const jj = judge(v, d.digits, d.exp);
    if (!jj.roundTrips || !jj.shortest) fail++;
    else if (jj.text !== jj.best) notClosest++;
  }
  assert.equal(fail, 0);
  assert.equal(notClosest, 499);
});

test("reference-implementation facts quoted in the caveats", () => {
  // 2^64 printed by errol_int as 1.844674407370955e19 reads back as 2^64 − 2048.
  assert.equal(Number("1.844674407370955e19"), 2 ** 64 - 2048);
  // Errol1's ε is the paper's 79·2^-106 bound, expressed relative to 2^-53.
  assert.equal((79 * 2 ** -53).toPrecision(3), ERROL1_EPSILON.toPrecision(3));
  // Five-adic bound of the paper: 5^23 < 2^54 < 5^24.
  assert.ok(5n ** 23n < 2n ** 54n && 2n ** 54n < 5n ** 24n);
  // 0.1's upper midpoint.
  const a = analyze(0.1);
  const dec = qDecimal(a.iv.upper);
  assert.equal(`0.${dec.digits}`, "0.100000000000000012490009027033011079765856266021728515625");
});

test("random doubles: the fast path round-trips and is shortest outside the table", () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  let n = 0;
  while (n < 3000) {
    const hi = BigInt(rnd() % 0x7fe) + 1n; // exponent field 1..0x7fe
    const bits = (hi << 52n) | (BigInt(rnd()) << 21n) | BigInt(rnd() % 2097152);
    const x = fromBits(bits);
    if (route(x).path !== "dd") continue;
    n++;
    const r = errolDD(x);
    const j = judge(x, r.digits, r.exp);
    assert.ok(j.roundTrips && j.shortest, String(x));
  }
});

test("recorded errol_int bugs are all wrong or too long, and all take the integer path", async () => {
  const { C_INT_BUGS, cIntBug } = await import("../site/explore/js/errol-microscope-model.js");
  assert.equal(C_INT_BUGS.length, 32);
  for (const [text, digits, exp] of C_INT_BUGS) {
    const v = Number(text);
    assert.equal(route(v).path, "int", text);
    const j = /^[0-9]+$/.test(digits) ? judge(v, digits, exp) : { roundTrips: false, shortest: false };
    assert.ok(!j.roundTrips || !j.shortest, text);
  }
  assert.deepEqual(cIntBug(2 ** 64), { digits: "1844674407370955", exp: 20 });
  assert.deepEqual(cIntBug(1e23), { digits: "", exp: 23 });
});
