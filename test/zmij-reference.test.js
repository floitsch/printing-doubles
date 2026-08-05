import test from "node:test";
import assert from "node:assert/strict";
import { zmijSemantic } from "../site/js/zmij-reference.js";

test("Żmij semantic normal records match pinned native probe examples", () => {
  const cases = [
    [0.3, 30000000000000000n, -17, "0.3"],
    [1 / 3, 33333333333333330n, -17, "0.3333333333333333"],
    [1e23, 10000000000000000n, 7, "1e+23"],
    [1.0000000000000002, 10000000000000002n, -16, "1.0000000000000002"],
  ];
  for (const [value, coefficient, exponent, text] of cases) {
    const result = zmijSemantic(value);
    assert.equal(result.recordCoefficient, coefficient);
    assert.equal(result.recordExponent, exponent);
    assert.equal(result.shortest.text, text);
  }
});

test("Żmij semantic record separates an integral field and last digit", () => {
  const result = zmijSemantic(1.0000000000000002);
  assert.equal(result.integral, 1000000000000000n);
  assert.equal(result.lastDigit, 2);
  assert.equal(result.hasLastDigit, true);
});
