import test from "node:test";
import assert from "node:assert/strict";
import { fromBits, nextDown, nextUp } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";
import { dragonboxExact } from "../site/js/dragonbox-reference.js";

test("the exact Dragonbox policy model agrees with the independent oracle", () => {
  const named = [0.3, 1 / 3, 1, 1.25, 1e23, Number.MIN_VALUE, Number.MAX_VALUE, -0.3];
  for (const value of named) assert.equal(dragonboxExact(value).text, shortestDecimal(value).text, String(value));
  let state = 0x3c6ef372fe94f82bn;
  for (let index = 0; index < 10000; index++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    assert.equal(dragonboxExact(value).text, shortestDecimal(value).text, state.toString(16));
  }
});

test("Dragonbox classifies shorter intervals and both divisor paths", () => {
  assert.equal(dragonboxExact(1).shorterInterval, true);
  assert.equal(dragonboxExact(2).shorterInterval, true);
  assert.equal(dragonboxExact(nextUp(1)).shorterInterval, false);
  assert.equal(dragonboxExact(0.3).divisorPath, "big");
  assert.equal(dragonboxExact(nextUp(1)).divisorPath, "small");
});

test("Dragonbox policies change representation work without changing the value", () => {
  const remove = dragonboxExact(1000, { trailingZero: "remove", cache: "full" });
  const report = dragonboxExact(1000, { trailingZero: "report", cache: "compact" });
  assert.equal(remove.coefficient, 1n);
  assert.equal(remove.exponent, 3);
  assert.equal(report.mayHaveTrailingZeros, true);
  assert.equal(report.coefficient, 1000000000000000n);
  assert.equal(report.exponent, -12);
  assert.match(report.cacheAccess, /reconstruct/);
});

test("Dragonbox handles important transitions", () => {
  const values = [Number.MIN_VALUE, nextUp(Number.MIN_VALUE), nextDown(2 ** -1022), 2 ** -1022, nextUp(2 ** -1022), nextDown(1), 1, nextUp(1), nextDown(Number.MAX_VALUE), Number.MAX_VALUE];
  for (const value of values.flatMap((item) => [item, -item])) assert.equal(dragonboxExact(value).text, shortestDecimal(value).text, String(value));
});
