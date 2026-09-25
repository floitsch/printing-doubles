// Copyright (C) 2026 Toit contributors.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as T from "../site/explore/js/teju-generator-model.js";

const B64 = T.FORMATS.binary64;
const B16 = T.FORMATS.binary16;
const sha = (text) => createHash("sha256").update(text).digest("hex");

// Computed once: the whole binary64 generator run.
const gen64 = T.runGenerator(B64);

test("binary64 generator reproduces the repo tables byte for byte", () => {
  assert.equal(gen64.ok, true);
  assert.equal(gen64.rows.length, 617);
  assert.equal(gen64.rows[0].f, -324);
  assert.equal(gen64.rows.at(-1).f, 292);
  assert.equal(gen64.sorted, false);
  assert.equal(gen64.minverse.length, 27);
  // sha256 of the 617 multiplier lines and the 27 minverse lines of
  // teju/src/generated/ieee64_with_uint128.c at commit 4403283.
  const rows = gen64.rows.map((r) => T.emitMultiplierRow(r, 64)).join("\n") + "\n";
  assert.equal(sha(rows), "f46cf16a2ea5da118a921af7f379204cdd696480419e3a1e0b907ac4d480d0dd");
  const minv = gen64.minverse.map((r) => T.emitMinverseRow(r, 64)).join("\n") + "\n";
  assert.equal(sha(minv), "4a40b00840a3878515c8ebe6df1aa789230a4b9d67eed1b3ac4749c28588b93f");
  for (const pin of T.PINNED_BINARY64) {
    const row = gen64.rows.find((r) => r.f === pin.f);
    assert.equal(T.emitMultiplierRow(row, 64).trim(), pin.text);
  }
  for (const pin of T.PINNED_MINVERSE) {
    assert.equal(T.emitMinverseRow(gen64.minverse[pin.f], 64).trim(), pin.text);
  }
  const text = T.emitC(B64, gen64);
  assert.match(text, /#define teju_calculation_sorted 0u/);
  assert.match(text, /#define teju_storage_index_offset -324/);
});

test("binary64 checks and headroom facts quoted on the page", () => {
  const ids = Object.fromEntries(gen64.checks.map((c) => [c.id, c]));
  for (const id of ["centred", "uncentred", "div10", "rows", "range", "refined"]) assert.equal(ids[id].ok, true, id);
  assert.equal(ids.centred.label, "5 + 53 ≤ 64");
  assert.equal(ids.uncentred.label, "4 + 53 ≤ 64");
  assert.equal(ids.refined.label, "8 + 53 ≤ 64");
  const bits = gen64.rows.map((r) => r.headroomBits);
  const min = Math.min(...bits);
  const tight = gen64.rows[bits.indexOf(min)];
  assert.equal(tight.f, -199);
  assert.equal(min.toFixed(2), "3.71");
  assert.equal(T.argmaxN(B64, tight.alpha, tight.delta, false, tight.max), 272104041512242479n);
  // Factor 13.05 between the limit and the worst phi.
  const factor = Number((tight.limit[0] * tight.max[1] * 10000n) / (tight.limit[1] * tight.max[0])) / 10000;
  assert.equal(factor.toFixed(2), "13.05");
  assert.equal(T.median(bits).toFixed(1), "14.1");
  let maxShift = 0;
  for (const row of gen64.rows) maxShift = Math.max(maxShift, T.minimalShift(B64, row));
  assert.equal(maxShift, 125);
  const r17 = gen64.rows.find((r) => r.f === -17);
  assert.equal(r17.M, 5n ** 17n * 2n ** 88n + 1n);
  assert.equal(r17.headroomBits.toFixed(1), "30.0");
  assert.equal(gen64.rows.find((r) => r.f === 7).headroomBits.toFixed(1), "54.9");
  // Recursion depth: at most 49 calls per row.
  let depth = 0;
  const e0s = T.rowExponents(B64);
  for (const e0 of e0s) {
    const trace = [];
    T.proveRow(B64, e0, e0 === e0s[0], 128, trace);
    depth = Math.max(depth, trace.length);
  }
  assert.equal(depth, 49);
});

test("the toy row: failures, records and continued fraction", () => {
  const row = T.labRow("toy");
  assert.equal(row.alpha, 8192n);
  assert.equal(row.delta, 15625n);
  assert.equal(row.f, 6);
  const main = (k) => T.labFailures(row, k).failures.map((i) => row.big[i]).filter((n) => n <= 992n);
  const all = (k) => T.labFailures(row, k).failures.length;
  for (const k of [10, 11, 12]) { assert.equal(main(k).length, 63); assert.equal(all(k), 64); }
  for (const k of [13, 14, 15, 16, 17]) assert.deepEqual(main(k), [494n, 597n, 988n]);
  for (const k of [18, 19, 20, 21, 22]) assert.deepEqual(main(k), [597n]);
  for (const k of [18, 22]) assert.equal(all(k), 1);
  for (let k = 23; k <= 34; k++) assert.equal(all(k), 0);
  // The wrong floor for n = 597 at k = 22.
  const { M } = T.fastMultiplier(8192n, 15625n, 22);
  assert.equal((597n * M) >> 22n, 313n);
  assert.equal((597n * 8192n) / 15625n, 312n);
  assert.equal((597n * 8192n) % 15625n, 15624n);
  assert.deepEqual(T.records(row).map((r) => r.n), [33n, 34n, 36n, 38n, 40n, 61n, 82n, 185n, 288n, 391n, 494n, 597n]);
  assert.equal((21n * 8192n) % 15625n, 157n);
  assert.equal((103n * 8192n) % 15625n, 26n);
  assert.deepEqual(T.continuedFraction(8192n, 15625n), [0n, 1n, 1n, 9n, 1n, 3n, 1n, 5n, 26n]);
});

test("the recursion's maximum equals brute force on the toy and all binary16 rows", () => {
  const toy = T.labRow("toy");
  const trace = [];
  const mx = T.worstOf(toy.fmt, toy.alpha, toy.delta, toy.isMin, trace);
  const brute = T.bruteMaximum(toy);
  assert.equal(T.cmpQ(mx, brute.max), 0);
  assert.equal(brute.n, 597n);
  assert.equal(trace.length, 8);
  // Every binary16 row, brute force over the generator's whole domain.
  const e0s = T.rowExponents(B16);
  for (const e0 of e0s) {
    const { alpha, delta } = T.alphaDelta(e0);
    const isMin = e0 === e0s[0];
    const a = alpha % delta;
    const { L, U, extras } = T.rowDomain(B16, isMin);
    let best = [0n, 1n];
    for (let n = L; n <= U; n++) { const v = [n, delta - (a * n) % delta]; if (T.cmpQ(v, best) > 0) best = v; }
    for (const n of extras) { const v = [n, delta - (a * n) % delta]; if (T.cmpQ(v, best) > 0) best = v; }
    assert.equal(T.cmpQ(T.worstOf(B16, alpha, delta, isMin), best), 0, `row e0=${e0}`);
  }
  const b16 = T.labRow("b16");
  assert.equal(b16.f, -8);
  assert.equal(b16.count, 65504 + 3);
  assert.equal(T.bruteMaximum(b16).n, 40217n);
});

// Exact shortest-closest reference for a small format (ties to even digit).
function reference(fmt, e, m) {
  const mmin = T.mantissaMin(fmt);
  const uncentred = m === mmin && e !== fmt.EMIN;
  // Work in units of 2^(e-2): x = 4m, bounds.
  const lo = uncentred ? 4n * m - 1n : 4n * m - 2n, hi = 4n * m + 2n, x = 4n * m;
  const incl = m % 2n === 0n;
  // value(u) = u * 2^(e-2). Compare c*10^j with u*2^(e-2) exactly.
  const scale = (c, j) => {
    // returns [num, den] of c*10^j / 2^(e-2)
    let num = c, den = 1n;
    if (j >= 0) num *= 10n ** BigInt(j); else den *= 10n ** BigInt(-j);
    if (e - 2 >= 0) den *= 2n ** BigInt(e - 2); else num *= 2n ** BigInt(2 - e);
    return [num, den];
  };
  const inside = (c, j) => {
    const [n, d] = scale(c, j);
    const l = n * 1n - lo * d, h = hi * d - n;
    return incl ? l >= 0n && h >= 0n : l > 0n && h > 0n;
  };
  for (let j = 10; j >= -40; j--) {
    // candidates c with c*10^j in [lo, hi]
    const [n1, d1] = scale(1n, j);
    const cLo = (lo * d1) / n1, cHi = (hi * d1) / n1 + 1n;
    const cands = [];
    for (let c = cLo; c <= cHi; c++) if (c > 0n && inside(c, j)) cands.push(c);
    if (cands.length) {
      let best = null, bestDist = null;
      for (const c of cands) {
        const [n, d] = scale(c, j);
        const dist = [n > x * d ? n - x * d : x * d - n, d];
        const cmp = bestDist ? T.cmpQ(dist, bestDist) : -1;
        if (cmp < 0 || (cmp === 0 && c % 2n === 0n)) { best = c; bestDist = dist; }
      }
      return T.normalize(best, j);
    }
  }
  throw new Error("no candidate");
}

test("binary16 runtime at the real shift equals an exact reference, exhaustively", () => {
  const rt = T.buildTable(B16);
  let n = 0;
  for (const [e, m] of T.allValues(B16)) {
    const got = T.toDecimal(B16, rt, e, m);
    assert.deepEqual(T.normalize(got.c, got.f), reference(B16, e, m), `e=${e} m=${m}`);
    n++;
  }
  assert.equal(n, 31743);
});

test("binary16 under shorter shifts: proof from 33, conversions from 24", () => {
  const ref = T.buildTable(B16);
  assert.deepEqual(T.proofAtShift(B16, 23).failing, [-8, -7, -6, -5, -4]);
  assert.deepEqual(T.proofAtShift(B16, 32).failing, [-7]);
  for (let k = 33; k <= 64; k++) assert.deepEqual(T.proofAtShift(B16, k).failing, [], `k=${k}`);
  const w23 = T.conversionsWrong(B16, 23, ref);
  assert.equal(w23.wrong, 4);
  const ex = w23.examples.find((x) => x.m === 645n);
  assert.equal(ex.e, -24);
  assert.equal(T.formatDecimal(ex.got.c, ex.got.f), "3.845e-5");
  assert.equal(T.formatDecimal(ex.want.c, ex.want.f), "3.844e-5");
  assert.equal(ex.got.c2, 7689n);
  assert.equal(ex.want.c2, 7688n);
  for (let k = 24; k <= 34; k++) assert.equal(T.conversionsWrong(B16, k, ref).wrong, 0, `k=${k}`);
  // Row F = -8 at k = 23 and k = 24: dots below the line, and the used ones.
  const row = T.labRow("b16");
  const used = (k) => T.labFailures(row, k).failures.filter((i) => row.usedFlag[i]).map((i) => row.big[i]);
  assert.equal(T.labFailures(row, 23).failures.length, 256);
  assert.deepEqual(used(23), [6880n, 10320n, 13760n, 16188n, 30960n]);
  assert.equal(T.labFailures(row, 24).failures.length, 127);
  assert.deepEqual(used(24), [16188n]);
  assert.equal(T.labFailures(row, 32).failures.length, 0);
  // 10320 = m_c = (4 * 645) << 2 for x = 645 * 2^-24; exact value 7688.99918...
  assert.equal((4n * 645n) << 2n, 10320n);
  assert.equal((10320n * 390625n) / 524288n, 7688n);
});

test("binary64 runtime agrees with JavaScript's shortest output", () => {
  const rt = { table: new Map(gen64.rows.map((r) => [r.f, r.M])), sorted: gen64.sorted, shift: 128, minverse: gen64.minverse };
  const dv = new DataView(new ArrayBuffer(8));
  const check = (x) => {
    dv.setFloat64(0, x);
    const bits = dv.getBigUint64(0);
    const be = Number(bits >> 52n);
    let m = bits & ((1n << 52n) - 1n), e;
    if (be) { m |= 1n << 52n; e = be - 1075; } else e = -1074;
    const out = T.toDecimal(B64, rt, e, m);
    const [c, f] = T.normalize(out.c, out.f);
    assert.equal(Number(`${c}e${f}`), x);
    const js = x.toExponential().replace(/\.|e.*$/g, "").replace(/0+$/, "");
    assert.equal(c.toString(), js, `x=${x}`);
    return out;
  };
  for (const x of [0.1, 0.3, 0.30000000000000004, 1e23, 5e-324, 2 ** 60, 2 ** 53, 2 ** -1011, 123, 1.7976931348623157e308, 2.2250738585072014e-308]) check(x);
  let s = 12345;
  for (let i = 0; i < 3000; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    dv.setUint32(0, (s * 2654435761) >>> 0 & 0x7fefffff);
    dv.setUint32(4, (s ^ 0x9e3779b9) >>> 0);
    const x = dv.getFloat64(0);
    if (x > 0 && Number.isFinite(x)) check(x);
  }
  assert.equal(check(2 ** -1011).route, "uncentred-refined");
});

test("the 0.1 walkthrough numbers", () => {
  const m = 7205759403792794n, e = -56;
  assert.equal(T.log10pow2(e), -17);
  assert.equal(T.residual(e), 0);
  const { alpha, delta } = T.alphaDelta(-56);
  assert.equal(alpha, 5n ** 17n);
  assert.equal(delta, 2n ** 40n);
  const n = 2n * m + 1n;
  const M = gen64.rows.find((r) => r.f === -17).M;
  assert.equal((n * M) >> 128n, 10000000000000001n);
  assert.equal((n * alpha) / delta, 10000000000000001n);
});

test("format factory: sizes, flags and the ways to break it", () => {
  const expect = { binary16: [10, true, 9], bfloat16: [78, false, 8], binary32: [77, false, 14], binary64: [617, false, 27] };
  for (const [id, [rows, sorted, minv]] of Object.entries(expect)) {
    const r = T.runGenerator(T.FORMATS[id]);
    assert.equal(r.ok, true, id);
    assert.equal(r.rows.length, rows, id);
    assert.equal(r.sorted, sorted, id);
    assert.equal(r.minverse.length, minv, id);
  }
  assert.equal(T.runGenerator({ ...B64, MW: 60 }).stop, "Centred calculations could overflow.");
  const r55 = T.runGenerator({ ...B64, MW: 55 });
  assert.equal(r55.ok, false);
  assert.equal(r55.failedRow.f, 54);
  assert.equal(T.runGenerator({ ...B16, W: 16 }).stop, "Can't use the selected algorithm for div10.");
  assert.equal(T.runGenerator({ ...T.FORMATS.bfloat16, MW: 9 }).failedRow.f, 17);
  assert.equal(Math.min(...T.runGenerator(T.FORMATS.bfloat16).rows.map((r) => r.headroomBits)).toFixed(2), "1.16");
  assert.equal(Math.min(...T.runGenerator(B16).rows.map((r) => r.headroomBits)).toFixed(2), "31.47");
});

test("prose facts: refined powers of two, near-tie distances, headroom of 10320", () => {
  const rt = { table: new Map(gen64.rows.map((r) => [r.f, r.M])), sorted: gen64.sorted, shift: 128, minverse: gen64.minverse };
  let refined = 0;
  for (let e = -1073; e <= 971; e++) {
    const out = T.toDecimal(B64, rt, e, 1n << 52n);
    if (out.route === "uncentred-refined") refined++;
  }
  assert.equal(refined, 33);
  // x = 645 * 2^-24. Distances to 3.845e-5 and 3.844e-5, in units of 1e-9.
  const xs = 645 / 2 ** 24;
  assert.equal(((3.845e-5 - xs) * 1e9).toFixed(3), "5.004");
  assert.equal(((xs - 3.844e-5) * 1e9).toFixed(3), "4.996");
  // Exact: 10320 * 5^8 / 2^19 = 7688.99918..., headroom 0.00082, overshoot 0.00123 at k = 23.
  const num = 10320n * 390625n, den = 524288n;
  assert.equal(((num * 100000n) / den).toString(), "768899917");
  assert.equal(((den - num % den) * 100000n / den).toString(), "82");
  assert.equal(((10320n * 100000n) / 2n ** 23n).toString(), "123");
});

test("the other repo formats match their generated files byte for byte", () => {
  // sha256 of all "{ 0x..." lines (multipliers then minverse) of the repo's
  // ieee16_with_uint128.c, bfloat16.c and ieee32_with_uint128.c at 4403283.
  const want = {
    binary16: "b3960cadfb7774f006fc52ff7cf85f9c67344adddc0f8bf46bd94c678c5a01b3",
    bfloat16: "27fbc66b304cddbb809dae58625ccb50e09a2a03f95e182a01992d105e60276c",
    binary32: "80e2cc6bde71e8a8d7b72deea4ea76f42ebf166cfe21f59ce2415cfaa1d6e5a3",
  };
  for (const [id, hash] of Object.entries(want)) {
    const fmt = T.FORMATS[id], r = T.runGenerator(fmt);
    const text = r.rows.map((x) => T.emitMultiplierRow(x, fmt.W)).join("\n") + "\n"
      + r.minverse.map((x) => T.emitMinverseRow(x, fmt.W)).join("\n") + "\n";
    assert.equal(sha(text), hash, id);
  }
  // binary64 rows whose M is the exact ratio plus 1: F = -55 ... 0.
  const exact = gen64.rows.filter((r) => r.eps === r.delta).map((r) => r.f);
  assert.equal(exact.length, 56);
  assert.deepEqual([exact[0], exact.at(-1)], [-55, 0]);
});
