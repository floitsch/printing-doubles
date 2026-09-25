// Copyright (C) 2026 Toit contributors.
// Tests for site/explore/js/errol-hunt-model.js (explore/errol-hunt.html).
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/errol-hunt-model.js";
import { shortestDecimal } from "../site/js/oracle.js";

// Outputs of the reference C (github.com/marcandrysco/Errol at 5364de4, compiled with
// -ffp-contract=off) for errol1_dtoa, errol2_dtoa and errol3u_dtoa:
// "bits _digits1 exp1 opt1 _digits2 exp2 opt2 _digits3u exp3u".
const C_OUTPUTS = [
  "0000000000000001 _5 -323 1 _5 -323 1 _5 -323",
  "02529fb1e991a7e1 _17798065039344338 -296 1 _17798065039344338 -296 1 _17798065039344338 -296",
  "051062271808532a _2754408664053865 -283 1 _2754408664053865 -283 1 _2754408664053865 -283",
  "0d57d3d65aafb3fb _2181030892367573 -243 1 _2181030892367573 -243 1 _2181030892367573 -243",
  "1c28c83cd407b2f8 _50099336793451 -172 1 _50099336793451 -172 1 _50099336793451 -172",
  "1e6e52f276170dff _42126852100458 -161 1 _42126852100458 -161 1 _42126852100458 -161",
  "20b0d466000e4e5b _3213350355900537 -150 1 _3213350355900537 -150 1 _3213350355900537 -150",
  "226be2504700d715 _7145748476744648 -142 1 _7145748476744648 -142 1 _7145748476744648 -142",
  "229b8a041c9985f3 _56458871909167454 -141 1 _56458871909167454 -141 1 _56458871909167454 -141",
  "247e2e2b2dd74ea8 _66436408191139614 -132 1 _66436408191139614 -132 1 _66436408191139614 -132",
  "29065c353194f67b _4648866057654365 -110 1 _4648866057654365 -110 1 _4648866057654365 -110",
  "2d20d6a8c44e935e _2583182267181209 -90 1 _2583182267181209 -90 1 _2583182267181209 -90",
  "2d8991078ecfbc24 _25101688797617945 -88 1 _25101688797617945 -88 1 _25101688797617945 -88",
  "30bde654ba544078 _6610409241747935 -73 1 _6610409241747935 -73 1 _6610409241747935 -73",
  "335ab0b917689816 _2595223370483911 -60 1 _2595223370483911 -60 1 _2595223370483911 -60",
  "376e38c3d37baf6f _10841516837288915 -40 1 _10841516837288915 -40 1 _10841516837288915 -40",
  "39fd8846e350ffdb _23296901890024626 -28 1 _23296901890024626 -28 1 _23296901890024626 -28",
  "3fd3333333333333 _3 0 1 _3 0 1 _3 0",
  "40091eb851eb851f _314 1 1 _314 1 1 _314 1",
  "403aec52129309b7 _2692312732782167 2 1 _2692312732782167 2 1 _2692312732782167 2",
  "4063093389eda56b _15228754135527865 3 1 _15228754135527865 3 1 _15228754135527865 3",
  "4260eda3bd6da000 _581651262317 12 1 _581651262317 12 1 _581651262317 12",
  "430313cd83498afa _6712247436701113 15 1 _6712247436701113 15 1 _6712247436701112 15",
  "4317ba8e0eac8921 _16697609396639443 16 1 _16697609396639443 16 1 _16697609396639442 16",
  "4318b0e1d2d6b5b1 _17374708481181243 16 1 _17374708481181243 16 1 _17374708481181242 16",
  "435169e2717da1fb _19605983566661612 17 0 _19605983566661612 17 1 _19605983566661612 17",
  "4354d574d229bcd2 _23456789012345672 17 0 _2345678901234567 17 1 _2345678901234567 17",
  "43552407fddee7b7 _23802365014154972 17 0 _23802365014154972 17 1 _23802365014154972 17",
  "43582981c0582074 _27204146782306768 17 0 _2720414678230677 17 1 _2720414678230677 17",
  "435baedae37ef574 _31168318056158672 17 0 _3116831805615867 17 1 _3116831805615867 17",
  "436073dd02d1a1b3 _37047941597040024 17 0 _37047941597040024 17 1 _37047941597040024 17",
  "4365c1553940b4a7 _48988370302772536 17 0 _48988370302772536 17 1 _48988370302772536 17",
  "436e4dfde540a276 _68240017356821424 17 0 _6824001735682142 17 1 _6824001735682142 17",
  "43820af7fa95db1d _16251551225973238 18 0 _16251551225973238 18 1 _16251551225973238 18",
  "438cae26ffef4dc9 _25832901996037558 18 0 _25832901996037558 18 1 _25832901996037558 18",
  "43e60345413bb3ca _12689501121931006 20 1 _12689501121931006 20 1 _12689501121931006 20",
  "43f0000000000000 _18446744073709552 20 1 _1844674407370955 20 1 _1844674407370955 20",
  "4400000000000000 _36893488147419104 20 1 _368934881474191 20 1 _368934881474191 20",
  "44b52d02c7e14af6 _9999999999999999 23 0 _1: 24 1 _ 23",
  "44ba8e36ef4f9b1b _1254049246832026 24 1 _1254049246832026 24 1 _1254049246832026 24",
  "44d0f7d227e6edc3 _320517411353206 24 1 _320517411353206 24 1 _320517411353206 24",
  "45b3f781f9a904e1 _6179433654745041 28 1 _6179433654745041 28 1 _6179433654745041 28",
  "45dc6e46337b9a7e _3519557452199836 29 1 _3519557452199836 29 1 _3519557452199836 29",
  "46757dcbc268f4b4 _27243573904700684 32 1 _27243573904700684 32 1 _27243573904700684 32",
  "47601ab92a5ad574 _6689501016359925 36 1 _6689501016359925 36 1 _6689501016359925 36",
  "478fedde19a6418e _5305143368986873 37 1 _5305143368986873 37 1 _5305143368986873 37",
  "47cfbff8de7b15ed _8440568846727898 38 1 _8440568846727898 38 1 _8440568846727898 38",
  "47d2ced32a16a1b1 _1 39 1 _1: 39 1 _: 38",
  "47e2ced32a16a1b1 _2 39 1 _2: 39 1 _1: 39",
  "49483f4aa45d3026 _1081462716301679 46 1 _1081462716301679 46 1 _1081462716301679 46",
  "4e2e2785c3a2a20b _40648030339495312 69 0 _40648030339495312 69 0 _4064803033949531 69",
  "545641660c1aec7b _19014952492991793 99 1 _19014952492991793 99 1 _19014952492991793 99",
  "59eb2d3b8f995e5c _14372250550275749 126 1 _14372250550275749 126 1 _14372250550275749 126",
  "667be71ae0a58de2 _47424680588084853 186 1 _47424680588084853 186 1 _47424680588084853 186",
  "6afe96e71e4bb20a _24552114600843483 208 1 _24552114600843483 208 1 _24552114600843483 208",
  "6ddcc2b8662e8283 _16244081974341289 222 1 _16244081974341289 222 1 _16244081974341289 222",
  "715d84117c7c6322 _12012475137375126 239 1 _12012475137375126 239 1 _12012475137375126 239",
  "718e10df5c2d5f8e _9789058097799315 239 1 _9789058097799315 239 1 _9789058097799315 239",
  "7235e6ed638d9537 _14604325063503613 243 1 _14604325063503613 243 1 _14604325063503613 243",
  "72a615a04f31725c _18849230577831464 245 1 _18849230577831464 245 1 _18849230577831464 245",
  "77b9c5cb567acda6 _5318570922974387 269 1 _5318570922974387 269 1 _5318570922974387 269",
  "7cd5fb20430a620a _21935244030177447 294 1 _21935244030177447 294 1 _21935244030177447 294",
];

test("ports reproduce the reference C bit for bit", () => {
  for (const line of C_OUTPUTS) {
    const p = line.split(" ");
    const d = M.fromHex(p[0]);
    const r1 = M.errol1(d), r2 = M.errol2(d), r3 = M.errol3u(d);
    assert.deepEqual([r1.digits, r1.exp, r1.opt], [p[1].slice(1), +p[2], p[3] === "1"], `errol1 ${p[0]}`);
    assert.deepEqual([r2.digits, r2.exp], [p[4].slice(1), +p[5]], `errol2 ${p[0]}`);
    assert.deepEqual([r3.digits, r3.exp], [p[7].slice(1), +p[8]], `errol3u ${p[0]}`);
  }
});

test("the power-of-ten table is a correct double-double", () => {
  for (const i of [20, 100, 250, 306, 307, 308, 309, 400, 599]) {
    const k = 308 - i;
    const t = M.lookup(i);
    assert.equal(t.val, Number(`1e${k}`));
    // |10^k - val - off| must be below half an ulp of off: compare exactly with BigInt.
    const scale = 1200n;
    const exact = k >= 0 ? 10n ** BigInt(k) << scale : (1n << scale) / 10n ** BigInt(-k);
    const asBig = (x) => { if (x === 0) return 0n; const b = M.bitsOf(Math.abs(x)); let e = Number((b >> 52n) & 0x7ffn); let m = b & ((1n << 52n) - 1n); if (e) m |= 1n << 52n; else e = 1; const sh = BigInt(e - 1075) + scale; const v = sh >= 0n ? m << sh : m >> -sh; return x < 0 ? -v : v; };
    const err = exact - asBig(t.val) - asBig(t.off);
    const ulpOff = asBig(Math.abs(t.off)) >> 52n;
    assert.ok((err < 0n ? -err : err) <= ulpOff + 1n, `entry ${i}`);
  }
});

test("oracle: toExponential length equals the exact shortest length", () => {
  const rng = M.makeRng(99n);
  for (let i = 0; i < 400; i++) {
    const d = M.fromBits(rng() & 0x7fefffffffffffffn) || 1;
    if (!Number.isFinite(d) || d === 0) continue;
    const s = M.shortestOf(d);
    assert.equal(s.digits.length, shortestDecimal(d).digits, String(d));
  }
  assert.equal(M.judge({ digits: "314", exp: 1 }, 3.14), "ok");
  assert.equal(M.judge({ digits: "31400000000000001", exp: 1 }, 3.14), "long");
  assert.equal(M.judge({ digits: "313", exp: 1 }, 3.14), "wrong");
  assert.equal(M.judge({ digits: "", exp: 23 }, 1e23), "wrong");
  for (const [digits, exp] of [["314", 1], ["5", -323], ["1844674407370955", 20], ["3", 0], ["1", -6], ["123", 25]]) {
    assert.equal(Number(M.decimalText(digits, exp)), Number(`0.${digits}e${exp}`));
  }
});

test("Errol1 at 2,000 per binade matches the C experiment for 2^54..2^58", () => {
  // C (errol1_dtoa, same xorshift64 seed, 2,000 draws in each binade -1022..1023):
  // binade: [not shortest, flagged by opt=false]
  const C = { 54: [379, 764], 55: [391, 800], 56: [82, 163], 57: [98, 183], 58: [85, 168] };
  for (const row of M.randomExperiment("errol1", 2000, M.DEFAULT_SEED, [54, 58])) {
    assert.deepEqual([row.long + row.wrong, row.flagged], C[row.e], `binade ${row.e}`);
    assert.equal(row.wrong, 0);
  }
});

test("Errol1 failures are exact midpoints of even doubles; Errol2 and errol3u have none", () => {
  let fails = 0;
  const bins = new Set();
  for (const row of M.randomExperiment("errol1", 200)) {
    for (const f of row.failures) {
      fails++;
      bins.add(row.e);
      assert.ok(M.shortestIsMidpoint(f.d), `${f.d} shortest is a midpoint`);
      assert.ok(M.midpointsOf(f.d).even);
      assert.ok(f.flagged);
    }
  }
  assert.equal(fails, 119);
  assert.ok(Math.min(...bins) === 54 && Math.max(...bins) <= 70);
  for (const v of ["errol2", "errol3u"]) {
    let n = 0;
    for (const row of M.randomExperiment(v, 200)) n += row.long + row.wrong;
    assert.equal(n, 0, v);
  }
  // The hand-checkable example from the page: v = 23456789012345672 (even), shortest is v - 2.
  const m = M.shortestIsMidpoint(2.345678901234567e16);
  assert.deepEqual(m, { side: "lower", value: 23456789012345670n });
  assert.equal(M.errol1(2.345678901234567e16).digits, "23456789012345672");
});

test("toy clock: records, descent, hits and the brute-force table", () => {
  const r = M.proofEnum(M.TOY);
  const fmt = (l) => l.filter((x) => x.idx < 16n).map((x) => `${x.idx}:${x.val}`).join(" ");
  assert.equal(fmt(r.up), "1:16 2:7 5:5 8:3 11:1");
  assert.equal(fmt(r.down), "1:-9 3:-2 14:-1");
  assert.equal(r.path.map((p) => `${p.k}:${p.r}`).join(" "), "0:-11 1:5 2:-4 4:3 7:1");
  assert.equal(r.hits.map((p) => `${p.k}:${p.r}`).join(" "), "7:1 10:-1");
  const rows = M.toyTable();
  assert.deepEqual(rows.map((x) => x.dist), [-44, 20, -16, 48, 12, -24, 40, 4, -32, 32, -4, -40, 24, -12, -48, 16]);
  assert.deepEqual(rows.map((x) => x.residue), [-11, 5, -4, 12, 3, -6, 10, 1, -8, 8, -1, -10, 6, -3, -12, 4]);
  assert.deepEqual(rows.filter((x) => Math.abs(x.dist) <= 4).map((x) => x.m), [1504, 1696]);
});

test("the search equals brute force on 3,000 small random clocks", () => {
  let seed = 7n;
  const rnd = (n) => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return (seed >> 20n) % BigInt(n); };
  for (let t = 0; t < 3000; t++) {
    const tau = BigInt(2 + Number(rnd(5000)));
    const alpha = 1n + rnd(Number(tau) - 1);
    const m0 = rnd(Number(tau) * 3);
    const p = 1 + Number(rnd(11));
    const delta = rnd(Math.max(1, Number(tau / 20n)));
    const got = new Set(M.proofEnum({ delta, m0, alpha, tau, p }).hits.map((h) => h.k));
    const want = [];
    for (let k = 0n; k < 1n << BigInt(p); k++) {
      let v = (((m0 + k * alpha) % tau) + tau) % tau;
      if (v > tau - v) v -= tau;
      if ((v < 0n ? -v : v) <= delta) want.push(k);
    }
    assert.equal(got.size, want.length, `case ${t}`);
    for (const k of want) assert.ok(got.has(k), `case ${t} k ${k}`);
  }
});

test("real binades: 2^227, 2^-650, 2^-187", () => {
  const h = M.huntBinade(227);
  assert.equal(h.params.n, 53);
  assert.equal(h.params.tau, 5n ** 53n);
  assert.equal(h.params.alpha, 2n ** 122n);
  assert.equal(h.params.delta, 179n * 2n ** 70n);
  assert.equal(h.path.length - 1, 38);
  assert.equal(h.path.at(-1).k, 32419540344722n);
  assert.equal(h.hits.length, 171);
  assert.equal(h.inputs.length, 342);
  const bad = h.inputs.filter((x) => x.verdict !== "ok");
  assert.deepEqual(bad.map((x) => [M.hex64(x.d), x.verdict, x.inTable]), [["4e2e2785c3a2a20a", "long", true], ["4e2e2785c3a2a20b", "wrong", true]]);
  const a = M.huntBinade(-650);
  assert.equal(a.hits.length, 75);
  assert.equal(a.path.at(-1).k, 0x47a032d75824n);
  const b = M.huntBinade(-187);
  assert.equal(b.hits.length, 181);
  assert.ok(b.inputs.some((x) => x.d === 9.856469199218561e-57 && x.verdict === "wrong" && x.inTable));
});

test("reference integer-path bugs are reproduced", () => {
  assert.equal(M.errolInt(1e23).digits, "");
  assert.equal(M.errolInt(1e23).outOfBounds, true);
  assert.equal(M.errolInt(1e38).digits, ":");
  assert.equal(M.errolInt(2e38).digits, "1:");
  const r = M.errolInt(2 ** 64);
  assert.deepEqual([r.digits, r.exp], ["1844674407370955", 20]);
  assert.equal(BigInt(Number("1.844674407370955e19")), 2n ** 64n - 2048n);
  assert.equal(M.judge(r, 2 ** 64), "wrong");
});

test("rebuilding the whole table reproduces enum3.h exactly", () => {
  assert.equal(M.ENUM3.size, 432);
  let last;
  for (const step of M.rebuildTable()) last = step;
  assert.equal(last.total, 1975);
  assert.equal(last.mids, 284151);
  assert.equal(last.inputs, 559713);
  assert.equal(last.fails.length, 432);
  assert.equal(last.fails.filter((f) => f.verdict === "wrong").length, 287);
  assert.equal(last.fails.filter((f) => f.manual).map((f) => f.hex).join(), "7fefffffffffffff");
  assert.deepEqual(last.missingFromTable, []);
  assert.deepEqual(last.tableNotFound, []);
});
