import test from "node:test";
import assert from "node:assert/strict";
import { exactDecimal, exactDecimalOfRational, shortestDecimal } from "../site/js/oracle.js";
import { fromBits } from "../site/js/float.js";
import { problemTrace } from "../site/js/problem-trace.js";

test("exact decimal expansion uses only integer arithmetic", () => {
  assert.equal(exactDecimal(0.3), "0.299999999999999988897769753748434595763683319091796875");
  assert.equal(exactDecimal(0.1), "0.1000000000000000055511151231257827021181583404541015625");
  assert.equal(exactDecimal(1), "1");
  assert.equal(exactDecimal(-1.5), "-1.5");
});

test("exact midpoint rationals can be displayed for boundary inspection", () => {
  assert.equal(exactDecimalOfRational({ numerator: 3n, denominator: 8n }), "0.375");
  assert.equal(exactDecimalOfRational({ numerator: -1n, denominator: 4n }), "-0.25");
});

test("the overview trace displays exact neighboring values rather than operations", () => {
  const registers = problemTrace(0.3)[0].registers;
  assert.equal(registers.previous, "0.29999999999999993338661852249060757458209991455078125");
  assert.equal(registers.selected, "0.299999999999999988897769753748434595763683319091796875");
  assert.equal(registers.next, "0.3000000000000000444089209850062616169452667236328125");
});

test("independent interval search finds known shortest decimals", () => {
  for (const [value, expected] of [[0.3, "0.3"], [0.1, "0.1"], [1, "1"], [1.5, "1.5"], [1e23, "1e+23"], [Number.MIN_VALUE, "5e-324"], [Number.MAX_VALUE, "1.7976931348623157e+308"], [-0.3, "−0.3"]]) {
    assert.equal(shortestDecimal(value).text, expected);
  }
});

test("shortest oracle round-trips a deterministic bit-pattern sample", () => {
  let state = 0x123456789abcdef0n;
  for (let i = 0; i < 750; i++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    const text = shortestDecimal(value).text.replace("−", "-");
    assert.ok(Object.is(Number(text), value), `${state.toString(16)}: ${text}`);
  }
});
