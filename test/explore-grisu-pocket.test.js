import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../site/explore/js/grisu-pocket-model.js";

// double-conversion's kCachedPowers (significand : binary exponent : decimal exponent),
// copied from cached-powers.cc.
const LIBRARY_TABLE = `
  fa8fd5a0081c0288:-1220:-348 baaee17fa23ebf76:-1193:-340 8b16fb203055ac76:-1166:-332
  cf42894a5dce35ea:-1140:-324 9a6bb0aa55653b2d:-1113:-316 e61acf033d1a45df:-1087:-308
  ab70fe17c79ac6ca:-1060:-300 ff77b1fcbebcdc4f:-1034:-292 be5691ef416bd60c:-1007:-284
  8dd01fad907ffc3c:-980:-276 d3515c2831559a83:-954:-268 9d71ac8fada6c9b5:-927:-260 ea9c227723ee8bcb:-901:-252
  aecc49914078536d:-874:-244 823c12795db6ce57:-847:-236 c21094364dfb5637:-821:-228 9096ea6f3848984f:-794:-220
  d77485cb25823ac7:-768:-212 a086cfcd97bf97f4:-741:-204 ef340a98172aace5:-715:-196 b23867fb2a35b28e:-688:-188
  84c8d4dfd2c63f3b:-661:-180 c5dd44271ad3cdba:-635:-172 936b9fcebb25c996:-608:-164 dbac6c247d62a584:-582:-156
  a3ab66580d5fdaf6:-555:-148 f3e2f893dec3f126:-529:-140 b5b5ada8aaff80b8:-502:-132 87625f056c7c4a8b:-475:-124
  c9bcff6034c13053:-449:-116 964e858c91ba2655:-422:-108 dff9772470297ebd:-396:-100 a6dfbd9fb8e5b88f:-369:-92
  f8a95fcf88747d94:-343:-84 b94470938fa89bcf:-316:-76 8a08f0f8bf0f156b:-289:-68 cdb02555653131b6:-263:-60
  993fe2c6d07b7fac:-236:-52 e45c10c42a2b3b06:-210:-44 aa242499697392d3:-183:-36 fd87b5f28300ca0e:-157:-28
  bce5086492111aeb:-130:-20 8cbccc096f5088cc:-103:-12 d1b71758e219652c:-77:-4 9c40000000000000:-50:4
  e8d4a51000000000:-24:12 ad78ebc5ac620000:3:20 813f3978f8940984:30:28 c097ce7bc90715b3:56:36
  8f7e32ce7bea5c70:83:44 d5d238a4abe98068:109:52 9f4f2726179a2245:136:60 ed63a231d4c4fb27:162:68
  b0de65388cc8ada8:189:76 83c7088e1aab65db:216:84 c45d1df942711d9a:242:92 924d692ca61be758:269:100
  da01ee641a708dea:295:108 a26da3999aef774a:322:116 f209787bb47d6b85:348:124 b454e4a179dd1877:375:132
  865b86925b9bc5c2:402:140 c83553c5c8965d3d:428:148 952ab45cfa97a0b3:455:156 de469fbd99a05fe3:481:164
  a59bc234db398c25:508:172 f6c69a72a3989f5c:534:180 b7dcbf5354e9bece:561:188 88fcf317f22241e2:588:196
  cc20ce9bd35c78a5:614:204 98165af37b2153df:641:212 e2a0b5dc971f303a:667:220 a8d9d1535ce3b396:694:228
  fb9b7cd9a4a7443c:720:236 bb764c4ca7a44410:747:244 8bab8eefb6409c1a:774:252 d01fef10a657842c:800:260
  9b10a4e5e9913129:827:268 e7109bfba19c0c9d:853:276 ac2820d9623bf429:880:284 80444b5e7aa7cf85:907:292
  bf21e44003acdd2d:933:300 8e679c2f5e44ff8f:960:308 d433179d9c8cb841:986:316 9e19db92b4e31ba9:1013:324
  eb96bf6ebadf77d9:1039:332 af87023b9bf0ee6b:1066:340
`.trim().split(/\s+/).map((s) => { const [f, e, k] = s.split(":"); return { f: BigInt("0x" + f), e: Number(e), k: Number(k) }; });

function lcg(seed) {
  let s = BigInt(seed);
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return s;
  };
}
const view = new DataView(new ArrayBuffer(8));
function randomDoubles(n, seed) {
  const next = lcg(seed);
  const out = [];
  while (out.length < n) {
    view.setBigUint64(0, next() & 0x7fffffffffffffffn);
    const v = view.getFloat64(0);
    if (v > 0 && Number.isFinite(v)) out.push(v);
  }
  return out;
}
const sameDigits = (a, b) => {
  const x = M.stripZeros(a.digits, a.exp10), y = M.stripZeros(b.digits, b.exp10);
  return x.digits === y.digits && x.exp10 === y.exp10;
};
const g3 = (r) => ({ digits: r.digits, exp10: r.decimalExponent });

test("the 87 cached powers match double-conversion's table bit for bit", () => {
  assert.equal(LIBRARY_TABLE.length, 87);
  assert.equal(M.CACHE.length, 87);
  M.CACHE.forEach((c, i) => {
    assert.equal(c.f, LIBRARY_TABLE[i].f, `entry ${i}`);
    assert.equal(c.e, LIBRARY_TABLE[i].e, `entry ${i}`);
    assert.equal(c.k, LIBRARY_TABLE[i].k, `entry ${i}`);
  });
  // 10^k is exact in 64 bits for k <= 27: of the table entries, 10^4, 10^12 and 10^20.
  assert.deepEqual(M.CACHE.filter((c) => c.exact).map((c) => c.k), [4, 12, 20]);
  for (const c of M.CACHE) assert.ok(Math.abs(c.err) <= 0.5);
});

test("a tooth always fits: 8·log2(10) < 28 and the code's formula finds it", () => {
  assert.ok(8 * Math.log2(10) < 28);
  assert.ok(Math.abs(8 * Math.log2(10) - 26.575) < 0.001);
  for (let i = 1; i < 87; i++) {
    const gap = M.CACHE[i].e - M.CACHE[i - 1].e;
    assert.ok(gap === 26 || gap === 27, `gap ${gap}`);
  }
  // Every normalized exponent of a positive double: -1137 .. 960.
  for (let we = -1137; we <= 960; we++) {
    const pick = M.chooseCachedPower64(we);
    assert.ok(pick.t >= -60 && pick.t <= -32);
    // The code picks the fitting tooth with the smallest t (most fraction bits).
    const fitting = M.combTeeth(we).filter((tooth) => tooth.fits);
    assert.ok(fitting.length >= 1 && fitting.length <= 2);
    assert.equal(pick.index, fitting[0].index);
  }
});

test("0.3: the worked example of the page", () => {
  const r = M.grisu3(0.3);
  assert.equal(M.hex64(r.w.f), "0x9999999999999800");
  assert.equal(r.w.e, -65);
  assert.equal(M.hex64(r.minus.f), "0x9999999999999400");
  assert.equal(M.hex64(r.plus.f), "0x9999999999999C00");
  assert.equal(r.pick.minExp, -59);
  assert.equal(r.pick.kk, 2);
  assert.equal(r.pick.index, 44);
  assert.equal(r.power.k, 4);
  assert.equal(M.hex64(r.power.f), "0x9C40000000000000");
  assert.equal(r.power.e, -50);
  assert.equal(r.t, -51);
  assert.equal(r.sm.f, 6755399441055743125n);
  assert.equal(r.sw.f, 6755399441055743750n);
  assert.equal(r.sp.f, 6755399441055744375n);
  assert.equal(M.hex64(r.sw.f), "0x5DBFFFFFFFFFFF06");
  assert.equal(r.tooLow, 6755399441055743124n);
  assert.equal(r.tooHigh, 6755399441055744376n);
  assert.equal(r.unsafe0, 1252n);
  assert.equal(r.split.one, 1n << 51n);
  assert.equal(r.split.integrals, 3000);
  assert.equal(r.split.kappa, 4);
  assert.equal(r.steps.length, 1);
  assert.equal(r.steps[0].rest, 376n);
  assert.equal(r.weed.distTooHighW, 626n);
  assert.equal(r.weed.walk.length, 0);
  assert.ok(r.ok);
  assert.equal(r.digits, "3");
  assert.equal(r.decimalExponent, -1);
  // 1 unit = 2^-51 of the scaled value, i.e. 2^-51 * 10^-4 ≈ 4.4e-20 of the real value;
  // the scaled rounding interval is 1250 units wide (plus 2 for the widening).
  assert.equal(r.sp.f - r.sm.f, 1250n);
  assert.equal(M.binaryFractionToDecimal(r.sw.f, 51, 25), "2999.9999999999998889776975374…");
});

test("the rounded multiply: four partial products, error below one unit", () => {
  const vs = [0.3, 1, 1e23, 5e-324, 1.7976931348623157e308, ...randomDoubles(3000, 7)];
  for (const v of vs) {
    const r = M.grisu3(v);
    for (const x of [r.w, r.minus, r.plus]) {
      const parts = M.multiplyParts(x, r.power);
      const prod = M.times(x, r.power);
      assert.equal(parts.f, prod.f);
      const { num, den } = M.exactScaled(x, r.power.k, r.t);
      const err = prod.f * den - num; // error * den
      assert.ok((err < 0n ? -err : err) < den, `error below 1 unit for ${v}`);
    }
  }
  // 1e23: the computed w is 0.58 unit off; the computed m+ is exactly m+.
  const r = M.grisu3(1e23);
  const ew = M.exactScaled(r.w, r.power.k, r.t);
  assert.ok(Math.abs(M.ratioToNumber(r.sw.f * ew.den - ew.num, ew.den) - 0.58) < 0.01);
  const ep = M.exactScaled(r.plus, r.power.k, r.t);
  assert.equal(r.sp.f * ep.den, ep.num);
});

test("presets of the debugger", () => {
  const third = M.grisu3(1 / 3);
  assert.ok(third.ok);
  assert.equal(third.digits, "3333333333333333");
  assert.equal(third.steps.length, 16);
  assert.equal(third.steps.filter((s) => s.phase === "int").length, 4);

  const tiny = M.grisu3(5e-324);
  assert.equal(tiny.t, -60);
  assert.equal(tiny.pick.index, 84);
  assert.equal(tiny.power.k, 324);
  assert.equal(M.hex64(tiny.power.f), "0x9E19DB92B4E31BA9");
  assert.equal(tiny.power.e, 1013);
  assert.equal(tiny.weed.start.digits, "7");
  assert.deepEqual(tiny.weed.walk.map((s) => s.digits), ["6", "5"]);
  assert.ok(tiny.ok);
  assert.equal(tiny.digits + "e" + tiny.decimalExponent, "5e-324");

  const big = M.grisu3(1e23);
  assert.equal(big.ok, false);
  assert.equal(big.reason, "weed");
  assert.equal(big.digits, "1");
  assert.equal(big.weed.rest, 1n); // the candidate sits 1 unit below too_high: exactly on m+
  assert.equal(big.fallback.text, "1e+23");

  const sum = M.grisu3(0.1 + 0.2);
  assert.equal(sum.weed.start.digits, "30000000000000007");
  assert.deepEqual(sum.weed.walk.map((s) => s.digits), ["30000000000000006", "30000000000000005", "30000000000000004"]);
});

test("loop invariant: too_high = buffer·10^κ + rest", () => {
  for (const v of [0.3, 1 / 3, 5e-324, 1e23, 0.1 + 0.2, ...randomDoubles(500, 11)]) {
    const r = M.grisu3(v);
    const one = r.split.one;
    let fracSteps = 0;
    for (const s of r.steps) {
      const buffer = BigInt(s.digits);
      if (s.phase === "int") {
        assert.equal(r.tooHigh, buffer * M.pow10(s.kappa) * one + s.rest);
      } else {
        fracSteps++;
        assert.equal(s.kappa, -fracSteps);
        assert.equal(r.tooHigh * M.pow10(fracSteps), buffer * one + s.rest);
      }
      // stop exactly when the grid point buffer·10^κ lies above too_low.
      assert.equal(s.stop, s.rest < s.unsafe);
    }
  }
});

test("Grisu3 on 20,000 random doubles: about 0.5% rejected, never wrong", () => {
  let rejected = 0, round = 0, weed = 0;
  for (const v of randomDoubles(20000, 42)) {
    const r = M.grisu3(v);
    if (r.ok) assert.ok(sameDigits(g3(r), M.jsDigits(v)), `wrong digits for ${v}`);
    else {
      rejected++;
      if (r.reason === "round") round++; else weed++;
      assert.equal(Number(r.fallback.text.replace("−", "-")), v);
    }
  }
  const rate = rejected / 20000;
  assert.ok(rate > 0.003 && rate < 0.008, `rate ${rate}`);
  assert.ok(round > 0 && weed > 0);
});

test("Grisu1 (digit-gen-mix): 18 digits that always read back", () => {
  const one = M.grisu1(1);
  assert.equal(one.digits + "e" + one.exponent, "100000000000000000e-17");
  const p3 = M.grisu1(0.3);
  assert.equal(p3.intDigits, "2999");
  assert.equal(p3.digits + "e" + p3.exponent, "299999999999999988e-18");
  for (const v of [5e-324, 1e23, 1.7976931348623157e308, ...randomDoubles(5000, 5)]) {
    const g = M.grisu1(v);
    assert.equal(g.digits.length, 18);
    assert.equal(Number(`${g.digits}e${g.exponent}`), v);
    for (const fr of g.frames) {
      assert.ok(fr.digit >= 0 && fr.digit <= 9);
      assert.ok(fr.product < 1n << 64n, "x10 never overflows 64 bits");
    }
  }
});

test("Grisu2 (paper, no rounding): always reads back; the page's examples", () => {
  assert.equal(M.digitsE(M.grisu2(1e23).digits, M.grisu2(1e23).exp10), "9999999999999999e7");
  assert.equal(M.digitsE(M.grisu2(5e-324).digits, M.grisu2(5e-324).exp10), "7e-324");
  assert.equal(M.digitsE(M.grisu2(0.3).digits, M.grisu2(0.3).exp10), "3e-1");
  for (const v of randomDoubles(5000, 9)) {
    const g = M.grisu2(v);
    assert.equal(Number(`${g.digits}e${g.exp10}`), v);
  }
});

test("exactShortest agrees with JavaScript on doubles", () => {
  for (const v of [0.3, 1e23, 5e-324, 1.7976931348623157e308, ...randomDoubles(1500, 3)]) {
    assert.ok(sameDigits(M.exactShortest(M.decodeDouble64(v)), M.jsDigits(v)), String(v));
  }
});

test("half precision: rounding into float16 and back", () => {
  for (let bits = 1; bits <= M.HALF_POSITIVE_COUNT; bits++) {
    assert.equal(M.halfBitsOf(M.decodeHalf(bits).value), bits);
  }
  assert.equal(M.halfBitsOf(0.1), 11878);
  assert.equal(M.decodeHalf(11878).value, 0.0999755859375);
  assert.equal(M.halfBitsOf(65520), null); // overflows
  assert.equal(M.halfBitsOf(1e-9), null); // underflows to 0
});

test("pocket cards: the hand-check numbers", () => {
  const a = M.grisu3Half(M.halfBitsOf(0.1), 16);
  assert.equal(a.half.f, 1638n); assert.equal(a.half.e, -14);
  assert.deepEqual([a.w.f, a.w.e, a.minus.f, a.plus.f], [52416n, -19, 52400n, 52432n]);
  assert.deepEqual([a.power.k, a.power.f, a.power.e, a.power.exact, a.t], [2, 51200n, -9, true, -12]);
  assert.deepEqual([a.sw.f, a.sm.f, a.sp.f, a.tooLow, a.tooHigh, a.unsafe0], [40950n, 40938n, 40963n, 40937n, 40964n, 27n]);
  assert.deepEqual([a.split.one, a.split.integrals, a.split.fractionals, a.split.kappa], [4096n, 10, 4n, 2]);
  assert.equal(a.steps.length, 1);
  assert.deepEqual([a.steps[0].digit, a.steps[0].kappa, a.steps[0].rest], [1, 1, 4n]);
  assert.ok(a.ok);
  assert.equal(a.digits + "e" + a.decimalExponent, "1e-1");

  const b = M.grisu3Half(M.halfBitsOf(1000), 16);
  assert.deepEqual([b.power.k, b.power.f, b.power.e, b.power.exact], [-2, 41943n, -22, false]);
  assert.ok(Math.abs(b.power.err - -0.04) < 0.001); // true significand 41943.04
  assert.deepEqual([b.sw.f, b.sm.f, b.sp.f, b.tooHigh], [40960n, 40950n, 40970n, 40971n]);
  assert.deepEqual([b.split.integrals, b.steps[0].rest, b.unsafe0], [10, 11n, 22n]);
  assert.equal(b.digits + "e" + b.decimalExponent, "1e3");

  // Reject (safe zone): the candidate 316e-4 is outside the true interval.
  const c = M.grisu3Half(M.halfBitsOf(0.0316162109375), 16);
  assert.equal(c.ok, false); assert.equal(c.reason, "weed");
  assert.equal(c.digits + "e" + c.decimalExponent, "316e-4");
  assert.equal(M.halfBitsOf(0.0316), M.halfBitsOf(0.0316162109375) - 1); // would read back as the neighbour
  assert.equal(M.exactShortest(c.half).digits, "3162");
  assert.ok(M.grisu3Half(M.halfBitsOf(0.0316162109375), 20).ok);

  // Reject (closeness): walks 3154 -> 3153, cannot tell whether 3152 is closer.
  const d = M.grisu3Half(M.halfBitsOf(0.031524658203125), 16);
  assert.equal(d.ok, false); assert.equal(d.reason, "round");
  assert.equal(d.weed.start.digits, "3154");
  assert.deepEqual(d.weed.walk.map((s) => s.digits), ["3153"]);
  assert.equal(M.exactShortest(d.half).digits, "3152");
});

test("pocket map: fast engine equals the BigInt engine, rates, never wrong", () => {
  const expected = {
    13: [532, 12859, 18352], 14: [5346, 11409, 14988], 15: [16893, 8435, 6415], 16: [23932, 4351, 3460],
    17: [27163, 2463, 2117], 18: [28627, 1623, 1493], 19: [29190, 1287, 1266], 20: [29530, 1140, 1073],
    21: [29639, 1072, 1032], 22: [29695, 1049, 999], 23: [29721, 1033, 989], 24: [29729, 1028, 986],
  };
  const reference = [];
  for (let bits = 1; bits <= M.HALF_POSITIVE_COUNT; bits++) reference[bits] = M.exactShortest(M.decodeHalf(bits));
  for (let q = 13; q <= 24; q++) {
    const map = M.pocketMap(q);
    assert.deepEqual(M.mapCounts(map), expected[q], `q=${q}`);
    if (q % 4 !== 0 && q !== 13) continue; // BigInt cross-check on q = 13, 16, 20, 24
    for (let bits = 1; bits <= M.HALF_POSITIVE_COUNT; bits++) {
      const r = M.grisu3Half(bits, q);
      assert.equal(map[bits], r.reason === "ok" ? 0 : r.reason === "round" ? 1 : 2);
      if (r.ok) assert.ok(sameDigits(g3(r), reference[bits]), `wrong accept q=${q} bits=${bits}`);
    }
  }
});

test("pocket floor: 2008 values no precision can settle", () => {
  let ties = 0, closedBoundary = 0, openBoundary = 0;
  const structural = [];
  for (let bits = 1; bits <= M.HALF_POSITIVE_COUNT; bits++) {
    const x = M.decodeHalf(bits);
    const r = M.exactShortest(x);
    const open = M.openBoundaryHit(x, r.digits.length);
    if (r.tie) ties++;
    if (r.onBoundary) closedBoundary++;
    if (open) openBoundary++;
    structural[bits] = r.tie || r.onBoundary || open;
  }
  assert.deepEqual([ties, closedBoundary, openBoundary], [1024, 492, 492]);
  // With 32-bit DiyFps exactly these 2008 are rejected.
  let rejected = 0;
  for (let bits = 1; bits <= M.HALF_POSITIVE_COUNT; bits++) {
    const bad = M.pocketStatus(bits, 32) !== 0;
    assert.equal(bad, structural[bits]);
    if (bad) rejected++;
  }
  assert.equal(rejected, 2008);
  // Examples quoted on the page.
  const tie = M.exactShortest(M.decodeHalf(M.halfBitsOf(0.15625)));
  assert.ok(tie.tie); assert.equal(tie.digits, "1562");
  const closed = M.exactShortest(M.decodeHalf(M.halfBitsOf(4112)));
  assert.ok(closed.onBoundary); assert.equal(closed.digits + "e" + closed.exp10, "411e1");
  const x = M.decodeHalf(M.halfBitsOf(4108));
  assert.ok(M.openBoundaryHit(x, M.exactShortest(x).digits.length));
});
