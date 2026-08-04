import test from "node:test";
import assert from "node:assert/strict";
import { coonenBReference } from "../site/js/coonen-reference.js";

test("Coonen B exact control produces a requested significant-digit field", () => {
  const result = coonenBReference(1 / 3, 5);
  assert.equal(result.coefficient, 33333n);
  assert.equal(result.scientificExponent, -1);
  assert.equal(result.decimalExponent, -5);
  assert.equal(result.text, "3.3333e-1");
});

test("Coonen B exact control is fixed precision rather than shortest", () => {
  const result = coonenBReference(0.3, 17);
  assert.equal(result.coefficient, 29999999999999999n);
  assert.equal(result.text, "2.9999999999999999e-1");
});

test("Coonen B correction loop handles a carry into the next decade", () => {
  const result = coonenBReference(9.999, 3);
  assert.equal(result.coefficient, 100n);
  assert.equal(result.scientificExponent, 1);
  assert.equal(result.text, "1.00e+1");
  assert.equal(result.passes, 2);
});
