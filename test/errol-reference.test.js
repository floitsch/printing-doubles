import test from "node:test";
import assert from "node:assert/strict";
import { fromBits, nextDown, nextUp } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";
import { errolChecked, errolIdeal } from "../site/js/errol-reference.js";

test("the idealized Errol double-double core agrees on familiar values", () => {
  for (const value of [0.3, 1.2, 1 / 3, 1, 1.25, 1e23, Number.MIN_VALUE, Number.MAX_VALUE, -0.3]) {
    assert.equal(errolIdeal(value).text, shortestDecimal(value).text, String(value));
  }
});

test("the idealized Errol core is checked over deterministic binary64 patterns", () => {
  let state = 0xa54ff53a5f1d36f1n;
  let corrections = 0;
  for (let index = 0; index < 10000; index++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    const result = errolChecked(value);
    corrections += Number(result.corrected);
    assert.equal(result.text, shortestDecimal(value).text, state.toString(16));
  }
  assert.ok(corrections > 0, "the corpus must exercise the checked correction path");
});

test("the idealized Errol core handles important transitions", () => {
  const values = [Number.MIN_VALUE, nextUp(Number.MIN_VALUE), nextDown(2 ** -1022), 2 ** -1022, nextUp(2 ** -1022), nextDown(1), 1, nextUp(1), nextDown(Number.MAX_VALUE), Number.MAX_VALUE];
  for (const value of values.flatMap((item) => [item, -item])) assert.equal(errolChecked(value).text, shortestDecimal(value).text, String(value));
});
