import test from "node:test";
import assert from "node:assert/strict";
import { fromBits, nextDown, nextUp } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";
import { schubfachExact } from "../site/js/schubfach-reference.js";

test("the exact Schubfach skeleton agrees with the independent shortest oracle", () => {
  const named = [0.3, 1.2, 1 / 3, 1, 1.25, 1e23, Number.MIN_VALUE, Number.MAX_VALUE, -0.3];
  for (const value of named) assert.equal(schubfachExact(value).text, shortestDecimal(value).text, String(value));

  let state = 0xbb67ae8584caa73bn;
  for (let index = 0; index < 10000; index++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    assert.equal(schubfachExact(value).text, shortestDecimal(value).text, state.toString(16));
  }
});

test("Schubfach handles asymmetric and subnormal intervals", () => {
  const values = [
    Number.MIN_VALUE, nextUp(Number.MIN_VALUE),
    nextDown(2 ** -1022), 2 ** -1022, nextUp(2 ** -1022),
    nextDown(1), 1, nextUp(1),
    nextDown(2), 2, nextUp(2),
    nextDown(Number.MAX_VALUE), Number.MAX_VALUE,
  ];
  for (const value of values.flatMap((item) => [item, -item])) {
    assert.equal(schubfachExact(value).text, shortestDecimal(value).text, String(value));
  }
});

test("Schubfach exercises both the coarse and fine candidate paths", () => {
  assert.equal(schubfachExact(0.3).path, "coarse");
  assert.equal(schubfachExact(nextUp(1)).path, "fine");
});
