import test from "node:test";
import assert from "node:assert/strict";
import { burgerDybvigShortest, descendantWork } from "../site/js/dragon-descendants-reference.js";
import { fromBits, nextDown, nextUp } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";

test("Burger–Dybvig produces familiar shortest decimals", () => {
  for (const [value, expected] of [
    [0.3, "0.3"],
    [1 / 3, "0.3333333333333333"],
    [1, "1"],
    [1e23, "1e+23"],
    [Number.MIN_VALUE, "5e-324"],
    [2 ** -1022, "2.2250738585072014e-308"],
    [Number.MAX_VALUE, "1.7976931348623157e+308"],
    [-0.3, "−0.3"],
  ]) assert.equal(burgerDybvigShortest(value).text, expected);
});

test("the estimator is exact or one low and the correction restores the decade", () => {
  const values = [
    Number.MIN_VALUE,
    nextUp(Number.MIN_VALUE),
    nextDown(2 ** -1022),
    2 ** -1022,
    nextUp(2 ** -1022),
    nextDown(1),
    1,
    nextUp(1),
    nextDown(10),
    10,
    nextUp(10),
    1e23,
    nextDown(Number.MAX_VALUE),
    Number.MAX_VALUE,
  ];
  for (const value of values) {
    const result = burgerDybvigShortest(value);
    assert.ok(result.estimatorDistance === 0 || result.estimatorDistance === 1, `${value}: ${result.estimatorDistance}`);
  }
});

test("Burger–Dybvig agrees with the independent grid oracle", () => {
  let state = 0x243f6a8885a308d3n;
  for (let index = 0; index < 1800; index++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    assert.equal(burgerDybvigShortest(value).text, shortestDecimal(value).text, state.toString(16));
  }
});

test("the work model distinguishes bypass, correction, and cancellation", () => {
  const integer = descendantWork(42, "gay");
  assert.equal(integer.gaySmallInteger, true);
  assert.equal(integer.route, "exact native-double integer");
  const power = descendantWork(1e23, "burger");
  assert.equal(power.correctionNeeded, true);
  assert.ok(power.commonTwos >= 0);
  assert.equal(power.sameOutput, true);
});
