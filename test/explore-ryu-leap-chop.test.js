import test from "node:test";
import assert from "node:assert/strict";
import {
  NO_SABOTAGE, parseInput, decode, leap, exactFloors, ryu, whatIfScale, verdict, exactDigits,
  sciText, pow5InvSplit, pow5Split, pow5, tickFraction, tickRange,
} from "../site/explore/js/ryu-leap-chop-model.js";
import { shortestDecimal } from "../site/js/oracle.js";

function randomDouble(rand) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setUint32(0, Math.floor(rand() * 0x7fefffff));
  dv.setUint32(4, Math.floor(rand() * 2 ** 32));
  return dv.getFloat64(0);
}
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const sab = (k) => ({ ...NO_SABOTAGE, [k]: true });
const str = (x, s) => { const r = ryu(x, s); return sciText(r.digits, r.exponent); };

test("parseInput understands the preset notations", () => {
  assert.equal(parseInput("0.1+0.2"), 0.1 + 0.2);
  assert.equal(parseInput("2^-25"), 2 ** -25);
  assert.equal(parseInput("2^-1074"), 5e-324);
  assert.equal(parseInput("2^-1019"), 2 ** -1019);
  assert.equal(parseInput("max"), Number.MAX_VALUE);
  assert.equal(parseInput("1e23"), 1e23);
  assert.equal(parseInput("abc"), null);
});

test("table constants match their definitions (two spot checks from d2s_full_table.h)", () => {
  assert.equal(pow5Split(18), 5n ** 18n * 2n ** 83n);
  assert.equal(pow5Split(325), 32836294410387009994688234313321054992n);
  assert.equal(pow5InvSplit(5), (1n << 136n) / 3125n + 1n);
  // DOUBLE_POW5_INV_SPLIT[0] = { 1u, 2305843009213693952u }, [1] = { 11068046444225730970u, 1844674407370955161u }
  assert.equal(pow5InvSplit(0), (2305843009213693952n << 64n) | 1n);
  assert.equal(pow5InvSplit(1), (1844674407370955161n << 64n) | 11068046444225730970n);
  // DOUBLE_POW5_SPLIT[1] = { 0u, 1441151880758558720u }
  assert.equal(pow5Split(1), 1441151880758558720n << 64n);
});

test("leap floors equal exact rational floors, and flags equal exact divisibility", () => {
  const rand = lcg(7);
  const xs = [5e-324, 0.3, 1e23, 7e22, 2 ** -25, 1125899906842624.25, 2 ** -1017, Number.MAX_VALUE, 2.2250738585072014e-308];
  for (let i = 0; i < 4000; i++) xs.push(randomDouble(rand));
  for (let e = -1074; e <= 1023; e += 7) xs.push(e >= -1022 ? 2 ** e : 2 ** (e + 100) / 2 ** 100);
  for (const x of xs) {
    if (!(x > 0) || !Number.isFinite(x)) continue;
    const L = leap(x);
    const f = exactFloors(L, L.e10);
    assert.equal(L.raw.vm, f.vm.floor, `vm ${x}`);
    assert.equal(L.raw.vr, f.vr.floor, `vr ${x}`);
    assert.equal(L.raw.vp, f.vp.floor, `vp ${x}`);
    if (L.vrIsTrailingZeros) assert.ok(f.vr.exact, `vr flag ${x}`);
    if (L.vmIsTrailingZeros) assert.ok(f.vm.exact && L.acceptBounds, `vm flag ${x}`);
    if (L.vpExactExcluded) assert.ok(f.vp.exact && !L.acceptBounds, `vp adjust ${x}`);
    // divisibility statement shown on the page
    if (L.q > 0 && L.e2 >= 0) for (const k of ["vm", "vr", "vp"]) {
      const m = { vm: L.mm, vr: L.mv, vp: L.mp }[k];
      assert.equal(m % pow5(L.q) === 0n, f[k].exact, `5^q test ${x}`);
    }
    if (L.q > 0 && L.e2 < 0) for (const k of ["vm", "vr", "vp"]) {
      const m = { vm: L.mm, vr: L.mv, vp: L.mp }[k];
      assert.equal(m % (1n << BigInt(L.q)) === 0n, f[k].exact, `2^q test ${x}`);
    }
    // normal doubles start with 17..19 digits below 2^62
    if (x >= 2.2250738585072014e-308 && L.q > 0) {
      assert.ok(L.vp < 1n << 62n, `bits ${x}`);
      const len = L.vr.toString().length;
      assert.ok(len >= 17 && len <= 19, `digits ${x}: ${len}`);
    }
  }
});

test("full d2d is shortest and closest (against the exact oracle) and b + 1 never passes c", () => {
  const rand = lcg(11);
  for (let i = 0; i < 1500; i++) {
    const x = randomDouble(rand);
    if (!(x > 0) || !Number.isFinite(x)) continue;
    const r = ryu(x);
    const v = verdict(x, r.digits, r.exponent);
    assert.ok(v.correct, `${x}`);
    assert.ok(r.digits <= r.states.at(-1).vp, `vr+1 <= vp for ${x}`);
  }
  for (let i = 0; i < 20000; i++) {
    const x = randomDouble(rand);
    if (!(x > 0) || !Number.isFinite(x)) continue;
    const r = ryu(x);
    assert.equal(Number(`${r.digits}e${r.exponent}`), x);
    assert.equal(sciText(r.digits, r.exponent).replace("e+", "e"), x.toExponential().replace("e+", "e"), `${x}`);
    assert.ok(r.digits <= r.states.at(-1).vp);
  }
});

test("preset numbers quoted on the page", () => {
  let r = ryu(5e-324);
  assert.deepEqual([r.leap.m2, r.leap.e2, r.leap.q, r.leap.e10], [1n, -1076, 751, -325]);
  assert.deepEqual([r.leap.vm, r.leap.vr, r.leap.vp], [24n, 49n, 74n]);
  assert.deepEqual([r.states[1].vm, r.states[1].vr, r.states[1].vp, r.states[1].lastRemovedDigit], [2n, 4n, 7n, 9n]);
  assert.equal(r.states.length, 2);
  assert.equal(str(5e-324), "5e-324");

  r = ryu(0.3);
  assert.equal(r.leap.q, 38);
  assert.equal(r.leap.e10, -18);
  assert.equal(r.leap.i, 18);
  assert.equal(r.leap.shift, 121);
  assert.equal(r.leap.mv, 21617278211378380n);
  assert.equal((21617278211378380n * 5n ** 18n * 2n ** 83n) >> 121n, 299999999999999988n);
  assert.deepEqual([r.leap.vm, r.leap.vr, r.leap.vp], [299999999999999961n, 299999999999999988n, 300000000000000016n]);
  assert.equal(r.states.length - 1, 17);
  assert.equal(r.round.rule, "bump+digit");
  assert.equal(str(0.3), "3e-1");

  r = ryu(0.1 + 0.2);
  assert.equal(r.states.length - 1, 1);
  assert.equal(str(0.1 + 0.2), "3.0000000000000004e-1");

  r = ryu(1e23);
  assert.deepEqual([r.leap.q, r.leap.e10, r.leap.k, r.leap.shift], [5, 5, 136, 119]);
  assert.deepEqual([r.leap.vm, r.leap.vr, r.leap.vp], [999999999999999832n, 999999999999999916n, 1000000000000000000n]);
  assert.ok(r.leap.exact.vp && r.leap.acceptBounds);
  assert.equal(str(1e23), "1e+23");

  r = ryu(7e22);
  assert.ok(r.leap.vmIsTrailingZeros);
  assert.equal(r.states.filter((s) => s.phase === 1).length, 1);
  assert.equal(r.states.filter((s) => s.phase === 2).length, 16);
  assert.equal(str(7e22), "7e+22");

  r = ryu(2 ** -25);
  assert.equal(r.leap.mmShift, 0n);
  assert.deepEqual([r.leap.vm, r.leap.vr, r.leap.vp], [298023223876953108n, 298023223876953125n, 298023223876953158n]);
  assert.equal(r.round.rule, "tie-even-down");
  assert.equal(str(2 ** -25), "2.9802322387695312e-8");

  r = ryu(1125899906842624.25);
  assert.ok(r.leap.vpExactExcluded && r.leap.exact.vm && r.leap.exact.vr && r.leap.exact.vp);
  assert.equal(r.round.rule, "tie-even-down");
  assert.equal(str(1125899906842624.25), "1.1258999068426242e+15");

  r = ryu(2 ** -1017);
  assert.equal(r.round.rule, "bump");
  assert.equal(r.round.lastRemovedDigit, 4n);
  assert.equal(str(2 ** -1017), "7.120236347223045e-307");

  assert.equal(ryu(123.456).states.length - 1, 13);
  assert.equal(ryu(Number.MAX_VALUE).states.length - 1, 2);

  // ribbon digit counts
  assert.equal(exactDigits(0.3).digits.length, 54);
  assert.equal(exactDigits(5e-324).digits.length, 751);
  assert.equal(exactDigits(0.3).digits.slice(0, 18), "299999999999999988");
});

test("sabotage switches fail exactly as the page says", () => {
  assert.equal(str(1e23, sab("ignoreBounds")), "9.999999999999999e+22");
  let v = verdict(1e23, ryu(1e23, sab("ignoreBounds")).digits, ryu(1e23, sab("ignoreBounds")).exponent);
  assert.ok(v.roundTrips && !v.shortest);

  let r = ryu(2 ** -1019, sab("symmetricPow2"));
  assert.equal(sciText(r.digits, r.exponent), "1.780059086805761e-307");
  assert.ok(!verdict(2 ** -1019, r.digits, r.exponent).roundTrips);
  assert.equal(str(2 ** -1019), "1.7800590868057611e-307");

  r = ryu(2 ** -1017, sab("skipBump"));
  assert.equal(sciText(r.digits, r.exponent), "7.120236347223044e-307");
  assert.ok(!verdict(2 ** -1017, r.digits, r.exponent).roundTrips);

  r = ryu(1125899906842624.25, sab("halfUp"));
  assert.equal(sciText(r.digits, r.exponent), "1.1258999068426243e+15");
  v = verdict(1125899906842624.25, r.digits, r.exponent);
  assert.ok(v.roundTrips && !v.correct);
});

test("what-if units: too coarse loses the rounding digit, too fine overflows", () => {
  const x = 2.9176505403442687e-228;
  const e10 = leap(x).e10;
  const w0 = whatIfScale(x, e10);
  assert.ok(verdict(x, w0.digits, w0.exponent).correct);
  const w1 = whatIfScale(x, e10 + 1);
  assert.equal(w1.chops, 0);
  assert.equal(sciText(w1.digits, w1.exponent), "2.9176505403442686e-228");
  const v1 = verdict(x, w1.digits, w1.exponent);
  assert.ok(v1.roundTrips && !v1.correct);
  const w2 = whatIfScale(x, e10 + 2);
  assert.equal(w2.candidates, 0n);
  assert.ok(whatIfScale(0.3, leap(0.3).e10 - 2).maxBits > 64);
  // Ryū's own unit through the what-if path equals the real run
  for (const y of [0.3, 1e23, 7e22, 2 ** -25, 5e-324, 123.456]) {
    const w = whatIfScale(y, leap(y).e10);
    const r = ryu(y);
    assert.equal(w.digits, r.digits);
    assert.equal(w.exponent, r.exponent);
  }
});

test("ruler geometry is exact at the band ends", () => {
  const d = decode(0.3);
  const L = leap(0.3);
  // tick b sits at or left of v, tick b+1 right of v
  const fv = Number(d.mv - d.mm) / Number(d.mp - d.mm);
  assert.ok(tickFraction(d, L.vr, L.e10) <= fv);
  assert.ok(tickFraction(d, L.vr + 1n, L.e10) > fv);
  assert.ok(tickFraction(d, L.vm, L.e10) <= 0 && tickFraction(d, L.vm + 1n, L.e10) > 0);
  const { nLo, nHi } = tickRange(d, L.e10, 0, 1);
  assert.equal(nLo, L.vm + 1n);
  assert.equal(nHi, L.vp);
  // 1e23: the upper end is exactly the tick c
  const d2 = decode(1e23), L2 = leap(1e23);
  assert.equal(tickFraction(d2, L2.vp, L2.e10), 1);
  assert.ok(shortestDecimal(1e23).coefficient === 1n);
});
