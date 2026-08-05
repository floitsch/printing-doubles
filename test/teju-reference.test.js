import test from "node:test";
import assert from "node:assert/strict";
import { tejuConfiguration, tejuRuntime } from "../site/js/teju-reference.js";

test("Tejú binary64 semantic pairs match the pinned native probe", () => {
  const cases = [
    [0.3, 3n, -1],
    [1 / 3, 3333333333333333n, -16],
    [1, 1n, 0],
    [2, 2n, 0],
    [1.0000000000000002, 10000000000000002n, -16],
    [1e23, 1n, 23],
    [1.2345, 12345n, -4],
    [Number.MIN_VALUE, 5n, -324],
    [Number.MAX_VALUE, 17976931348623157n, 292],
  ];
  for (const [value, coefficient, exponent] of cases) {
    const result = tejuRuntime(value);
    assert.equal(result.decimal.coefficient, coefficient);
    assert.equal(result.decimal.exponent, exponent);
  }
});

test("Tejú runtime route recognizes all three source branches", () => {
  assert.equal(tejuRuntime(1e10).route, "small");
  assert.equal(tejuRuntime(0.3).route, "centered");
  assert.equal(tejuRuntime(0.5).route, "uncentered");
  assert.equal(tejuRuntime(Number.MIN_VALUE).route, "centered");
});

test("Tejú configuration changes operations without changing binary64 format facts", () => {
  const portable = tejuConfiguration("binary64", "portable");
  const native = tejuConfiguration("binary64", "uint128");
  assert.equal(portable.exponentMin, -1074);
  assert.equal(native.exponentMin, portable.exponentMin);
  assert.equal(native.mantissaWidth, portable.mantissaWidth);
  assert.equal(portable.mshift, "synthetic_1");
  assert.equal(native.mshift, "built_in_2");
  assert.equal(native.multiplierRows, 617);
});

test("checked-in generated format facts are exposed faithfully", () => {
  assert.equal(tejuConfiguration("binary16").carrierWidth, 32);
  assert.equal(tejuConfiguration("bfloat16").multiplierRows, 78);
  assert.equal(tejuConfiguration("x86extended").storageSplit, 2);
  assert.equal(tejuConfiguration("binary128").mantissaWidth, 113);
});
