import test from "node:test";
import assert from "node:assert/strict";
import { coonenBReference } from "../site/js/coonen-reference.js";
import { fromBits, nextDown, nextUp } from "../site/js/float.js";

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

test("Coonen B exact control round-trips difficult values at 17 digits", () => {
  const values = [
    Number.MIN_VALUE,
    nextUp(Number.MIN_VALUE),
    2 ** -1022,
    nextDown(2 ** -1022),
    nextDown(1),
    1,
    nextUp(1),
    nextDown(10),
    10,
    nextUp(10),
    0.1,
    0.3,
    1e23,
    nextDown(Number.MAX_VALUE),
    Number.MAX_VALUE,
  ];
  for (const value of values.flatMap((item) => [item, -item])) {
    const text = coonenBReference(value, 17).decimalText.replace("−", "-");
    assert.ok(Object.is(Number(text), value), `${value}: ${text}`);
  }
});

test("Coonen B exact control round-trips a deterministic bit-pattern sample", () => {
  let state = 0xd1b54a32d192ed03n;
  for (let index = 0; index < 1200; index++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    const text = coonenBReference(value, 17).decimalText.replace("−", "-");
    assert.ok(Object.is(Number(text), value), `${state.toString(16)}: ${text}`);
  }
});
