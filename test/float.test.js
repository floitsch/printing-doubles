import test from "node:test";
import assert from "node:assert/strict";
import {
  binaryCoordinate,
  bitsOf,
  decodeDouble,
  decimalCoordinate,
  floorAtDecimalScale,
  formatDecimal,
  fromBits,
  midpointCoordinate,
  nextDown,
  nextUp,
  parseDecimal,
  unitExponent,
} from "../site/js/float.js";
import { anchoredPan, neighboringDoubles, NumberLineExplorer } from "../site/js/explorer.js";

test("binary64 bit conversion is reversible", () => {
  for (const value of [0, -0, 0.1, 0.3, 1, -1, Number.MIN_VALUE, Number.MAX_VALUE]) {
    assert.ok(Object.is(fromBits(bitsOf(value)), value));
  }
});

test("nextUp and nextDown cross zero and binade boundaries", () => {
  assert.equal(nextUp(0), Number.MIN_VALUE);
  assert.equal(nextDown(0), -Number.MIN_VALUE);
  assert.equal(nextUp(nextDown(1)), 1);
  assert.equal(nextDown(nextUp(1)), 1);
});

test("the smallest subnormal's displayed predecessor walk stops at zero", () => {
  assert.deepEqual(neighboringDoubles(Number.MIN_VALUE, "down").map(({ value }) => value), [0]);
  assert.deepEqual(neighboringDoubles(-Number.MIN_VALUE, "up").map(({ value }) => value), [-0]);
});

test("anchored zoom preserves the coordinate under the cursor", () => {
  const position = 0.8;
  const pan = anchoredPan(12, 8, 2, position);
  assert.equal(12 + (2 * position - 1) * 8, pan + (2 * position - 1) * 2);
});

test("detailed binary ticks are generated around a panned viewport", () => {
  const explorer = Object.create(NumberLineExplorer.prototype);
  explorer.value = 0.3;
  explorer.center = decodeDouble(explorer.value);
  explorer.unitExp = unitExponent(explorer.value);
  const points = explorer.visibleBinaryPoints(996, 1004);
  assert.ok(points.length >= 8);
  assert.ok(points[0].coordinate >= 996);
  assert.ok(points.at(-1).coordinate <= 1004);
  assert.ok(points.some(({ coordinate }) => coordinate === 1000));
});

test("decimal ticks are generated around a panned viewport", () => {
  const explorer = Object.create(NumberLineExplorer.prototype);
  explorer.value = 0.3;
  explorer.center = decodeDouble(explorer.value);
  explorer.unitExp = unitExponent(explorer.value);
  explorer.lowerBoundary = -0.5;
  explorer.upperBoundary = 0.5;
  const ticks = explorer.decimalTicks(995, 1005, 5, 1000);
  assert.ok(ticks.some(({ x }) => x >= 995 && x <= 1005));
});

test("the least positive subnormal scene has zero as its only predecessor", () => {
  const explorer = Object.create(NumberLineExplorer.prototype);
  explorer.value = Number.MIN_VALUE;
  explorer.center = decodeDouble(explorer.value);
  explorer.unitExp = unitExponent(explorer.value);
  const points = explorer.visibleBinaryPoints(-8, 4);
  assert.equal(points[0].value, 0);
  assert.ok(points.slice(1).every(({ value }) => value > 0));
});

test("0.3 has the expected exact representation", () => {
  const decoded = decodeDouble(0.3);
  assert.equal(decoded.significand, 5404319552844595n);
  assert.equal(decoded.exponent, -54);
  assert.equal(decoded.bits.toString(16), "3fd3333333333333");
});

test("coordinates place neighbors and midpoint boundaries correctly", () => {
  const center = decodeDouble(0.3);
  const exponent = unitExponent(0.3);
  const lower = decodeDouble(nextDown(0.3));
  const upper = decodeDouble(nextUp(0.3));
  assert.equal(binaryCoordinate(lower, center, exponent), -1);
  assert.equal(binaryCoordinate(upper, center, exponent), 1);
  assert.equal(midpointCoordinate(lower, center, center, exponent), -0.5);
  assert.equal(midpointCoordinate(center, upper, center, exponent), 0.5);
});

test("coordinates preserve asymmetric spacing at a power-of-two transition", () => {
  const center = decodeDouble(1);
  const exponent = unitExponent(1);
  const lower = decodeDouble(nextDown(1));
  const upper = decodeDouble(nextUp(1));
  assert.equal(exponent, -52);
  assert.equal(binaryCoordinate(lower, center, exponent), -0.5);
  assert.equal(binaryCoordinate(upper, center, exponent), 1);
  assert.equal(midpointCoordinate(lower, center, center, exponent), -0.25);
  assert.equal(midpointCoordinate(center, upper, center, exponent), 0.5);
});

test("decimal coordinates are exact enough to distinguish 0.3 from its stored value", () => {
  const center = decodeDouble(0.3);
  const exponent = unitExponent(0.3);
  const decimal = parseDecimal("0.3");
  const coordinate = decimalCoordinate(decimal.coefficient, decimal.exponent, center, exponent);
  assert.ok(coordinate > 0 && coordinate < 0.5);
});

test("decimal-scale floor and labels work outside safe Number integers", () => {
  const center = decodeDouble(0.3);
  assert.equal(floorAtDecimalScale(center, -17), 29999999999999998n);
  assert.equal(formatDecimal(3n, -1), "0.3");
  assert.equal(formatDecimal(123n, 20), "1.23e+22");
});
