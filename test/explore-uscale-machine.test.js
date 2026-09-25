// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "../site/explore/js/uscale-machine-model.js";
import { shortestDecimal } from "../site/js/oracle.js";

const html = readFileSync(new URL("../site/explore/uscale-machine.html", import.meta.url), "utf8");

// Independent exact table entry: ⌈10^p / 2^pe⌉ with pe = ⌊log2 10^p⌋ − 127.
function exactPm(p) {
  const num = p >= 0 ? 10n ** BigInt(p) : 1n;
  const den = p >= 0 ? 1n : 10n ** BigInt(-p);
  // ⌊log2(num/den)⌋
  let l = num.toString(2).length - den.toString(2).length;
  if ((l >= 0 ? num : num << BigInt(-l)) < (l >= 0 ? den << BigInt(l) : den)) l--;
  const pe = l - 127;
  const n2 = pe >= 0 ? num : num << BigInt(-pe);
  const d2 = pe >= 0 ? den << BigInt(pe) : den;
  return { pm: (n2 + d2 - 1n) / d2, pe, exact: n2 % d2 === 0n };
}

test("table entries: ceil, range, stored hi·2^64 − lo form, exactness boundaries", () => {
  for (let p = M.POW10_MIN; p <= M.POW10_MAX; p++) {
    const t = M.pow10Entry(p);
    const ref = exactPm(p);
    assert.equal(t.pm, ref.pm, `pm(${p})`);
    assert.equal(t.pe, ref.pe, `pe(${p})`);
    assert.equal(t.exact, ref.exact);
    assert.ok(t.pm >= 1n << 127n && t.pm < 1n << 128n);
    assert.equal((t.hi << 64n) - t.lo, t.pm, `stored form ${p}`);
    assert.equal(t.hi, (t.pm + (1n << 64n) - 1n) >> 64n, `hi is top word rounded up ${p}`);
    assert.equal(t.exact, p >= 0 && p <= 55, `exact iff 0 ≤ p ≤ 55 (p=${p})`);
    assert.equal(t.pmLo === 0n, p >= 0 && p <= 27, `one word iff 0 ≤ p ≤ 27 (p=${p})`);
  }
  // matches the Go table's first lines (pow10tab.go at ec108cb)
  assert.equal(M.hex64(M.pow10Entry(-7).pmHi) + M.hex64(M.pow10Entry(-7).pmLo), "d6bf94d5e57a42bc3d32907604691b4d");
});

test("log approximations are exact over the ranges used", () => {
  const lg = (num, den) => { // ⌊log2(num/den)⌋ for BigInt
    let l = num.toString(2).length - den.toString(2).length;
    if ((l >= 0 ? num : num << BigInt(-l)) < (l >= 0 ? den << BigInt(l) : den)) l--;
    return l;
  };
  for (let p = -348; p <= 347; p++) {
    const want = p >= 0 ? lg(10n ** BigInt(p), 1n) : lg(1n, 10n ** BigInt(-p));
    assert.equal(M.log2Pow10(p), want, `log2Pow10(${p})`);
  }
  // ⌊x·log10 2⌋ is the largest d with 10^d ≤ 2^x: digits(2^x) − 1 for x ≥ 0, −digits(2^−x) for x < 0.
  for (let x = -1200; x <= 1100; x++) {
    const ref = x >= 0 ? (1n << BigInt(x)).toString().length - 1 : -(1n << BigInt(-x)).toString().length;
    assert.equal(M.log10Pow2(x), ref, `log10Pow2(${x})`);
  }
});

test("unrounded table in the HTML is right", () => {
  const rows = [...html.matchAll(/<tr data-num="(\d+)" data-den="(\d+)" data-code="(\d+)">(.*?)<\/tr>/g)];
  assert.equal(rows.length, 6);
  for (const [, n, d, code, body] of rows) {
    const u = M.unroundRational(BigInt(n), BigInt(d));
    assert.equal(u, BigInt(code));
    const cells = [...body.matchAll(/<td>(.*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    assert.equal(cells[3], String(u));
    assert.equal(cells[4], M.ustr(u));
    assert.equal(cells[2], `${(u >> 2n).toString(2)}·${(u >> 1n) & 1n}·${u & 1n}`);
    assert.equal(cells[5], String(M.floorU(u)));
    assert.equal(cells[6], String(M.roundU(u)));
    assert.equal(cells[7], String(M.ceilU(u)));
  }
  // div keeps sticky: ⟨15.4⟩ / 6 → ⟨2.5+⟩ → 3
  const u = M.unroundRational(154n, 10n);
  assert.equal(u, 61n);
  assert.equal(M.ustr(M.divU(u, 6n)), "2.5+");
  assert.equal(M.roundU(M.divU(u, 6n)), 3n);
  assert.equal(M.floorU(M.nudgeU(28n, -1)), 6n);
});

test("fast uscale equals the exact rational for Short's calls; Short matches JS", () => {
  const next = M.makeRandomDoubles(42);
  const fs = [0.3, 0.1 + 0.2, 2 / 3, 2 ** 89, 5e-324, 1e23, 0.1, 6.02214076e23, 8.07e-23, 1 / 7, 2 ** 53 - 1, Number.MAX_VALUE, 2.2250738585072014e-308, 2.225073858507201e-308];
  for (let i = 0; i < 3000; i++) fs.push(next());
  for (let k = -1074; k <= 1023; k += 7) fs.push(2 ** k);
  for (const f of fs) {
    const T = M.Short(f);
    for (const c of [T.cmin, T.cmax, T.cm].filter(Boolean)) assert.equal(c.u, M.uscaleExact(c.x, c.e, c.p), `uscale for ${f}`);
    assert.ok(M.matchesJs(f, T.d, T.q), `Short(${f})`);
    assert.equal(M.jsString(T.d, T.q), String(f));
  }
});

test("Short agrees with the site's exact oracle", () => {
  for (const f of [0.3, 0.1 + 0.2, 2 / 3, 2 ** 89, 5e-324, 1e23, 8.07e-23]) {
    const T = M.Short(f);
    const o = shortestDecimal(f);
    const [d, q] = M.trimZeros(T.d, T.q);
    assert.equal(d, o.coefficient);
    assert.equal(q, o.exponent);
  }
});

test("trimZeros (Dragonbox inverses) equals the naive loop", () => {
  const naive = (x, p) => { while (x !== 0n && x % 10n === 0n) { x /= 10n; p++; } return [x, p]; };
  for (const x of [1n, 10n, 100n, 3000n, 10n ** 16n, 1230000000000n, 9999999999999999n, 10000000000000000n * 1n, 120n]) {
    assert.deepEqual(M.trimZeros(x, 0), naive(x, 0));
  }
});

test("page numbers: Short presets", () => {
  const t03 = M.Short(0.3);
  assert.equal(t03.p, 17); assert.equal(t03.branch, "zero");
  assert.equal(M.ustr(t03.cmin.u), "29999999999999996.0+");
  assert.equal(M.ustr(t03.cmax.u), "30000000000000001.5+");
  const t = M.Short(0.1 + 0.2);
  assert.equal(M.ustr(t.cmin.u), "30000000000000001.5+"); // shared midpoint
  assert.equal(t.cmin.x, t03.cmax.x);
  assert.equal(t.dmin, 30000000000000002n); assert.equal(t.dmax, 30000000000000007n);
  assert.equal(t.branch, "round"); assert.equal(M.ustr(t.cm.u), "30000000000000004.0+");
  const t89 = M.Short(2 ** 89);
  assert.ok(t89.skew); assert.equal(t89.branch, "single"); assert.equal(t89.d, 6189700196426902n); assert.equal(t89.p, -11);
  // the value itself scales to …901.37…
  assert.equal(M.ustr(M.uscaleExact(t89.m, t89.e, t89.p)), "6189700196426901.0+");
  assert.equal(M.exactDecimal(1n, 89).slice(0, 18), "618970019642690137");
  const tsub = M.Short(5e-324);
  assert.equal(tsub.z, 63); assert.equal(tsub.p, 324); assert.equal(M.ustr(tsub.cmin.u), "2.0+"); assert.equal(M.ustr(tsub.cmax.u), "7.0+");
  assert.equal(M.ustr(tsub.cm.u), "4.5+"); assert.equal(tsub.d, 5n);
  const t23 = M.Short(1e23);
  assert.equal(t23.odd, 0); assert.equal(M.ustr(t23.cmax.u), "10000000000000000.0"); assert.equal(t23.cmax.fast, false);
  assert.equal(M.jsString(t23.d, t23.q), "1e+23");
  assert.equal(M.Short(2 / 3).branch, "single");
});

test("page numbers: products, counterexample, 8.07e-23 corner cut", () => {
  // 0.1: exact power, one multiply
  const t1 = M.Short(0.1);
  const P1 = M.product192(t1.min, 17);
  assert.ok(P1.errorIsZero);
  assert.equal(M.hex64(P1.computed.hi), "8e1bc9bf03ffff71");
  assert.ok(t1.cmin.fast);
  // Avogadro: top and middle agree, bottoms differ, error < 2^64
  const ta = M.Short(6.02214076e23);
  const Pa = M.product192(ta.min, ta.p);
  assert.equal(ta.p, -7);
  assert.equal(Pa.ideal.hi, Pa.computed.hi); assert.equal(Pa.ideal.mid, Pa.computed.mid);
  assert.notEqual(Pa.ideal.lo, Pa.computed.lo);
  assert.ok(Pa.errorApprox > 0 && Pa.errorApprox < 2 ** 64);
  // 1e23 upper midpoint: exact result, middle zero; optimized path: mid − mid2 = 1
  const P23 = M.product192(t23max().x, -7);
  assert.equal(P23.computed.mid, 0n); assert.equal(P23.ideal.lo, 0n); assert.equal(P23.idealFrac, false);
  const c = t23max().c;
  assert.equal(M.hex64(c.hiRaw), "8e1bc9bf04000000");
  assert.equal(((c.mid - c.mid2) & M.M64), 1n); assert.equal(c.sticky, 0n);
  // counterexample from the proof post
  const C = M.product192(0xd5bc71e52b31e483n, 62);
  assert.equal(`${M.hex64(C.computed.hi)} ${M.hex64(C.computed.mid)}`, "cfd352e73dc6ddc3 0000000000000000");
  assert.equal(`${M.hex64(C.ideal.hi)} ${M.hex64(C.ideal.mid)}`, "cfd352e73dc6ddc2 ffffffffffffffff");
  assert.equal(M.hex64(C.computed.lo), "774bd77b38816199");
  // 8.07e-23
  const t8 = M.Short(8.07e-23);
  assert.equal(t8.p, 38); assert.equal(t8.s, 8); assert.equal(t8.cmin.x, 0xc31ee16e07856c00n);
  assert.equal(M.hex64(t8.cmin.hiRaw), "72ae7d2d59800000"); assert.ok(t8.cmin.borrow);
  assert.equal(M.hex64(t8.cmin.hi), "72ae7d2d597fffff");
  assert.equal(M.ustr(t8.cmin.u), "8069999999999999.5+");
  const cut = M.Short(8.07e-23, { skipCheck: true });
  assert.equal(M.ustr(cut.cmin.u), "8070000000000000.0+");
  assert.equal(M.jsString(cut.d, cut.q), "8.070000000000001e-23");
  assert.equal(M.jsString(t8.d, t8.q), "8.07e-23");
  function t23max() { const T = M.Short(1e23); return { x: T.max, c: T.cmax }; }
});

test("statistics are in the range the page text claims", () => {
  const acc = M.newStats();
  M.statsBatch(M.makeRandomDoubles(2026), 10000, acc);
  const share = acc.calls.fast / (acc.calls.fast + acc.calls.slow);
  assert.ok(share > 0.975 && share < 0.995, `one-multiply share ${share}`);
  assert.equal(acc.mismatch, 0);
  assert.ok(acc.cutWrong > 0 && acc.cutWrong / acc.n < 0.005, `cut wrong ${acc.cutWrong}`);
});

test("FixedWidth examples", () => {
  const pi = M.FixedWidth(Math.PI, 15);
  assert.equal(M.ustr(pi.u), "314159265358979.0+"); assert.equal(pi.u, M.uscaleExact(pi.m, pi.e, pi.p0));
  const t = M.FixedWidth(1.125, 3);
  assert.equal(M.ustr(t.u), "112.5"); assert.equal(t.d, 112n); assert.equal(M.roundHalfUpU(t.u), 113n);
  assert.equal((1.125).toPrecision(3), "1.13");
  const n = M.FixedWidth(9.999999, 3);
  assert.equal(M.ustr(n.u), "999.5+"); assert.equal(M.ustr(n.div), "99.5+"); assert.equal(n.d, 100n); assert.equal(n.q, -1);
  assert.equal(M.ustr(M.FixedWidth(1.005, 3).u), "100.0+");
  const next = M.makeRandomDoubles(9);
  for (let i = 0; i < 2000; i++) {
    const f = next();
    const nd = 1 + (i % 17);
    const T = M.FixedWidth(f, nd);
    assert.equal(T.u, M.uscaleExact(T.m, T.e, T.p0));
    // correctly rounded (half-even on exact ties) nd-digit value
    assert.ok(T.d >= 10n ** BigInt(nd - 1) && T.d < 10n ** BigInt(nd));
  }
});

test("Parse examples and round trips", () => {
  const { d, p } = M.parseText("1e23");
  const t = M.Parse(d, p);
  assert.equal(M.ustr(t.u0), "5960464477539062.5"); assert.equal(t.mant, 5960464477539062n);
  assert.equal(t.f, 1e23); assert.equal(M.exactDecimal(t.mant, -t.e), "99999999999999991611392");
  for (const s of ["0.1", "9007199254740993", "5e-324", "1.7976931348623157e308", "2.2250738585072011e-308", "123.456", "1e-320", "4.9406564584124654e-324"]) {
    const q = M.parseText(s);
    assert.ok(Object.is(M.Parse(q.d, q.p).f, Number(s)), s);
  }
  assert.equal(M.parseText("1.2.3"), null);
  assert.equal(M.parseText("12345678901234567890"), null);
  const acc = { n: 0, bad: 0, parseBad: 0, badExamples: [] };
  M.verifyBatch(M.makeRandomDoubles(77), 5000, acc);
  assert.equal(acc.bad, 0); assert.equal(acc.parseBad, 0);
});

test("toy ripple and expression input", () => {
  const r = M.toyRipple(0x6fa, 11, "carry");
  assert.equal(r.result, 0x705); assert.ok(r.reachedTop); assert.equal(r.seenMid, 0);
  const b = M.toyRipple(0x6b4, 11, "borrow");
  assert.equal(b.result, 0x6a9); assert.ok(b.reachedMid); assert.ok(!b.reachedTop); assert.equal(b.seenMid, 0xb);
  assert.equal(M.evalDouble("0.1+0.2"), 0.1 + 0.2);
  assert.equal(M.evalDouble("2^89"), 2 ** 89);
  assert.equal(M.evalDouble("2/3"), 2 / 3);
  assert.equal(M.evalDouble("pi"), Math.PI);
  assert.equal(M.evalDouble("0x3FD3333333333333"), 0.3);
  assert.equal(M.evalDouble("-2^2"), -4);
});
