import test from "node:test";
import assert from "node:assert/strict";
import { xjbMicroscope } from "../site/js/xjb-reference.js";

test("xjb semantic records match the pinned native binary64 probe", () => {
  const cases = [
    [0.3, 30000000000000000n, -17, "shorten-up"],
    [1 / 3, 33333333333333330n, -17, "shorten-down"],
    [1, 10000000000000000n, -16, "shorten-down"],
    [2, 20000000000000000n, -16, "shorten-down"],
    [1.0000000000000002, 10000000000000002n, -16, "nearest-tenth"],
    [1e23, 10000000000000000n, 7, "shorten-up"],
    [1.2345, 12345000000000000n, -16, "shorten-up"],
    [Number.MAX_VALUE, 17976931348623157n, 292, "nearest-tenth"],
  ];
  for (const [value, coefficient, exponent, decision] of cases) {
    const result = xjbMicroscope(value);
    assert.equal(result.coefficient, coefficient);
    assert.equal(result.exponent, exponent);
    assert.equal(result.decision, decision);
    assert.equal(Number(result.text), value);
  }
});

test("the endpoint outcomes and interior outcome have the expected geometry", () => {
  const down = xjbMicroscope(1 / 3);
  assert.equal(down.lowerExit, true);
  assert.equal(down.upperExit, false);
  assert.equal(down.chosenDigit, 0n);

  const up = xjbMicroscope(0.3);
  assert.equal(up.lowerExit, false);
  assert.equal(up.upperExit, true);
  assert.equal(up.chosenDigit, 10n);

  const interior = xjbMicroscope(1.0000000000000002);
  assert.equal(interior.lowerExit, false);
  assert.equal(interior.upperExit, false);
  assert.equal(interior.chosenDigit, 2n);
});

test("the power-of-two preset exposes an asymmetric interval", () => {
  const result = xjbMicroscope(1);
  assert.equal(result.irregular, true);
  assert.ok(Math.abs(result.positions.lower) < Math.abs(result.positions.upper));
});
