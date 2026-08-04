import test from "node:test";
import assert from "node:assert/strict";
import { fromBits, nextDown, nextUp } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";
import { ryuExact } from "../site/js/ryu-reference.js";

test("the exact Ryū specification agrees with the independent shortest oracle", () => {
  const named = [0.3, 1 / 3, 1, 1.25, 1e23, Number.MIN_VALUE, Number.MAX_VALUE, -0.3];
  for (const value of named) assert.equal(ryuExact(value).text, shortestDecimal(value).text, String(value));

  let state = 0x6a09e667f3bcc909n;
  for (let index = 0; index < 10000; index++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    assert.equal(ryuExact(value).text, shortestDecimal(value).text, state.toString(16));
  }
});

test("the exact Ryū specification handles binary and decimal transitions", () => {
  const values = [
    Number.MIN_VALUE,
    nextUp(Number.MIN_VALUE),
    nextDown(2 ** -1022),
    2 ** -1022,
    nextUp(2 ** -1022),
    nextDown(1), 1, nextUp(1),
    nextDown(10), 10, nextUp(10),
    nextDown(Number.MAX_VALUE), Number.MAX_VALUE,
  ];
  for (const value of values.flatMap((item) => [item, -item])) {
    assert.equal(ryuExact(value).text, shortestDecimal(value).text, String(value));
  }
});

test("Ryū removes digits coarseward instead of searching fineward", () => {
  const result = ryuExact(0.3);
  assert.equal(result.text, "0.3");
  assert.ok(result.states.length > 10);
  for (let index = 1; index < result.states.length; index++) {
    assert.equal(result.states[index].exponent, result.states[index - 1].exponent + 1);
  }
});
