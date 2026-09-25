import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze, decimalString, evaluateInput, gridRows, neighbourBars, registers, readBackReport,
  powersOfTwoStats, POWERS_OF_TWO, powerOfTwo, nextTrap, PRESETS, randomDouble, floorOf, rat, mulInt, cmp, hex64, tableEntry,
} from "../site/explore/js/xjb-ruler-model.js";
import { shortestDecimal } from "../site/js/oracle.js";

// Deterministic PRNG so failures are reproducible.
function lcg(seed) {
  let s = BigInt(seed);
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return Number(s >> 11n) / 2 ** 53;
  };
}

function jsDigits(v) {
  const [mant, exp] = v.toExponential().split("e");
  const frac = (mant.split(".")[1] || "").length;
  return { coefficient: BigInt(mant.replace(".", "")), exponent: Number(exp) - frac };
}

test("presets: verified numbers", () => {
  const expect = {
    "0.3": ["2999999999999999", "0.8889776975", "0.2775557561", "up", "0.3"],
    "0.1+0.2": ["3000000000000000", "0.4440892098", "0.2775557561", "nearest", "0.30000000000000004"],
    "1.3": ["1300000000000000", "0.0444089209", "0.1110223024", "down", "1.3"],
    "123.456": ["1234560000000000", "0.0306954461", "0.0710542735", "down", "123.456"],
    pi: ["3141592653589793", "0.1159979634", "0.2220446049", "down", "3.141592653589793"],
    "2^50+0.25": ["1125899906842624", "0.25", "0.125", "nearest", "1125899906842624.2"],
    "2^64": ["1844674407370955", "0.1616", "0.2048", "nearest", "18446744073709552000"],
    "2^89": ["618970019642690", "0.137449562112", "0.068719476736", "nearest", "6.189700196426902e+26"],
  };
  for (const preset of PRESETS) {
    const v = evaluateInput(preset.input);
    const a = analyze(v);
    const [m, n, h, outcome, text] = expect[preset.input];
    assert.equal(a.m.toString(), m, preset.input);
    assert.ok(decimalString(a.n, 12).startsWith(n), preset.input);
    assert.equal(decimalString(a.h, 12).replace("…", "").slice(0, h.length), h, preset.input);
    assert.equal(a.outcome, outcome, preset.input);
    assert.equal(a.text, text, preset.input);
    assert.equal(a.text, String(v));
    assert.ok(a.roundTrips);
  }
  const tie = analyze(evaluateInput("2^50+0.25"));
  assert.equal(tie.tie, true);
  assert.equal(tie.nearestTick, 2);
  assert.equal(tie.closed, false);
  assert.deepEqual(tie.tickInside.map(Number).join(""), "00110000000");
});

test("powers of two: the lopsided bar and the symmetric trap", () => {
  const p64 = analyze(2 ** 64);
  assert.equal(p64.k, 3);
  assert.equal(decimalString(p64.hLow), "0.1024");
  assert.equal(decimalString(p64.lower), "0.0592");
  assert.equal(decimalString(p64.upper), "0.3664");
  const s64 = analyze(2 ** 64, { symmetric: true });
  assert.equal(s64.k, 3);
  assert.equal(decimalString(s64.lower), "−0.0432");
  assert.equal(s64.outcome, "down");
  assert.equal(s64.text, "18446744073709550000");
  const r64 = readBackReport(s64);
  assert.equal(r64.same, false);
  assert.equal(r64.steps, -1);
  assert.equal(r64.exact, "18446744073709549568");
  assert.equal(r64.difference.num / r64.difference.den, -2048n);

  const p89 = analyze(2 ** 89);
  assert.equal(p89.bumped, true);
  assert.equal(p89.roundedTick, 1);
  assert.equal(p89.nearestTick, 2);
  assert.equal(decimalString(p89.lower, 5), "0.10308…");
  assert.equal(decimalString(p89.upper, 5), "0.20616…");
  assert.equal(decimalString(p89.widthTicks, 4), "1.0307…");
  const s89 = analyze(2 ** 89, { symmetric: true });
  assert.equal(s89.k, 11);
  assert.equal(s89.text, "6.189700196426901e+26");
  assert.equal(readBackReport(s89).exact, "618970019642690068730085376");

  const stats = powersOfTwoStats();
  assert.equal(stats.symmetricWrong, POWERS_OF_TWO.symmetricWrong);
  assert.equal(stats.bumped, POWERS_OF_TWO.bumped);
  assert.equal(stats.kShifted, POWERS_OF_TWO.kShifted);
  assert.ok(stats.traps.includes(64) && stats.traps.includes(89));
  assert.equal(nextTrap(63), 64);
  for (let e = -1022; e <= 1023; e++) {
    const v = powerOfTwo(e);
    assert.equal(v, 2 ** e);
    const a = analyze(v);
    assert.deepEqual(jsDigits(v), { coefficient: a.coefficient, exponent: a.exponent }, `2^${e}`);
  }
});

test("random doubles: same digits as JavaScript and as the exact oracle", () => {
  const random = lcg(42);
  for (let i = 0; i < 20000; i++) {
    const v = randomDouble(random);
    const a = analyze(v);
    assert.deepEqual({ coefficient: a.coefficient, exponent: a.exponent }, jsDigits(v), `${v}`);
    assert.ok(a.roundTrips);
    // Geometry facts the page states.
    assert.ok(!(a.downHit && a.upHit));
    if (!a.lopsided) {
      assert.ok(cmp(a.h, rat(1n, 20n)) >= 0 && cmp(a.h, rat(1n, 2n)) < 0, "h in [0.05, 0.5)");
      assert.equal(a.bumped, false);
    }
    assert.ok(cmp(a.widthTicks, rat(1n)) >= 0 && cmp(a.widthTicks, rat(10n)) < 0, "1 to 10 ticks wide");
    if (a.tie) assert.ok(cmp(a.n, rat(1n, 4n)) === 0 || cmp(a.n, rat(3n, 4n)) === 0);
    if (a.outcome === "nearest" && !a.lopsided) assert.ok(a.nearestTick >= 1 && a.nearestTick <= 9);
  }
  const random2 = lcg(7);
  for (let i = 0; i < 1500; i++) {
    const v = randomDouble(random2);
    const a = analyze(v);
    const o = shortestDecimal(v);
    assert.equal(a.coefficient, o.coefficient, `${v}`);
    assert.equal(a.exponent, o.exponent, `${v}`);
  }
});

test("zoom rows: at most one coarse point, 1 to 10 fine points", () => {
  const random = lcg(3);
  const values = [0.3, 0.1 + 0.2, Math.PI, 2 ** 64, 2 ** 89, 5e-324];
  for (let i = 0; i < 400; i++) values.push(randomDouble(random));
  for (const v of values) {
    const a = analyze(v);
    const [, coarse, fine, finer] = gridRows(a);
    assert.ok(coarse.count <= 1);
    assert.ok(fine.count >= 1 && fine.count <= 10);
    assert.ok(finer.count >= 10 && finer.count <= 100);
    assert.equal(coarse.count, (a.downHit ? 1 : 0) + (a.upHit ? 1 : 0));
  }
  const a = analyze(0.1 + 0.2);
  assert.deepEqual(gridRows(a).map((r) => r.count), [0, 0, 6, 56]);
  assert.deepEqual(gridRows(analyze(0.3)).map((r) => r.count), [1, 1, 5, 55]);
});

test("neighbour bars tile the ruler", () => {
  for (const v of [0.3, 0.1 + 0.2, 2 ** 64, 1.5, 123.456]) {
    const a = analyze(v);
    const nb = neighbourBars(a);
    assert.equal(cmp(nb.prev.upper, a.lower), 0);
    assert.equal(cmp(nb.next.lower, a.upper), 0);
  }
});

test("register view agrees with the exact ruler", () => {
  const cases = { 0.3: ["0xe3940ad9cc000000", "0x470de4df82000000"], 0.30000000000000004: ["0x71afd498d0000000", "0x470de4df82000001"], 1.3: ["0x0b5e620f48000000", "0x1c6bf52634000000"] };
  for (const [v, [dot, half]] of Object.entries(cases)) {
    const r = registers(analyze(Number(v)));
    assert.equal(hex64(r.dotOne), dot);
    assert.equal(hex64(r.halfUlp), half);
  }
  assert.equal(tableEntry(16).toString(16), "8e1bc9bf04" + "0".repeat(22));
  const random = lcg(99);
  for (let i = 0; i < 20000; i++) {
    const v = randomDouble(random);
    const a = analyze(v);
    const r = registers(a);
    if (!r) continue;
    assert.equal(r.m, a.m);
    assert.equal(r.down, a.downHit, `${v}`);
    assert.equal(r.up, a.upHit, `${v}`);
    if (a.outcome === "nearest") assert.equal(Number(r.one), a.nearestTick, `${v}`);
    assert.ok(r.h >= -4 && r.h <= -1);
    const exactDot = floorOf(mulInt(a.n, 1n << 64n));
    const diff = r.dotOne - exactDot;
    assert.ok(diff >= -16n && diff <= 16n, `${v} dot_one off by ${diff}`);
  }
  // half_ulp minus the even bit is exactly ⌊h·2^64⌋ for every exponent.
  for (let bits = 0; bits < 2047; bits++) {
    const v = Number.parseFloat(new Float64Array(new BigUint64Array([(BigInt(bits) << 52n) | 1n]).buffer)[0]);
    const a = analyze(v);
    const r = registers(a);
    assert.equal(r.halfUlp - r.evenBit, floorOf(mulInt(a.h, 1n << 64n)), `exponent code ${bits}`);
  }
});

test("k formulas from the source are exact", () => {
  for (let q = -1074; q <= 971; q++) {
    const a = analyze(q === -1074 ? 5e-324 * 3 : 2 ** q * 1.5);
    if (q > -1074 && a.q !== q) continue;
    assert.equal((q * 78913) >> 18, a.kRegular, `q=${q}`);
  }
  for (let e = -1022; e <= 1023; e++) {
    const a = analyze(powerOfTwo(e));
    assert.equal((a.q * 315653 - 131072) >> 20, a.kLopsided, `2^${e}`);
    assert.equal(a.k, a.kLopsided);
  }
});

test("input expressions use double arithmetic", () => {
  assert.equal(evaluateInput("0.1+0.2"), 0.30000000000000004);
  assert.equal(evaluateInput("2^64"), 2 ** 64);
  assert.equal(evaluateInput("2**50+0.25"), 2 ** 50 + 0.25);
  assert.equal(evaluateInput("-2^3"), -8);
  assert.equal(evaluateInput("π"), Math.PI);
  assert.equal(evaluateInput("(1+2)*3/4"), 2.25);
  assert.equal(evaluateInput("5e-324"), 5e-324);
  assert.throws(() => evaluateInput("alert(1)"));
  assert.throws(() => evaluateInput("1+"));
});
