import test from "node:test";
import assert from "node:assert/strict";
import { dragonShortest } from "../site/js/dragon-reference.js";
import { fromBits, nextDown, nextUp } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";

test("Dragon exact digit generation finds familiar shortest decimals", () => {
  for (const [value, expected] of [
    [0.3, "0.3"],
    [1 / 3, "0.3333333333333333"],
    [1, "1"],
    [1.25, "1.25"],
    [1e23, "1e+23"],
    [Number.MIN_VALUE, "5e-324"],
    [Number.MAX_VALUE, "1.7976931348623157e+308"],
    [-0.3, "−0.3"],
  ]) assert.equal(dragonShortest(value).text, expected);
});

test("Dragon handles transition-adjacent and carry-sensitive values", () => {
  const values = [
    Number.MIN_VALUE,
    nextUp(Number.MIN_VALUE),
    nextDown(2 ** -1022),
    2 ** -1022,
    nextUp(2 ** -1022),
    nextDown(1),
    1,
    nextUp(1),
    nextDown(10),
    10,
    nextUp(10),
    9.999999999999998,
    nextDown(Number.MAX_VALUE),
    Number.MAX_VALUE,
  ];
  for (const value of values.flatMap((item) => [item, -item])) {
    assert.equal(dragonShortest(value).text, shortestDecimal(value).text, String(value));
  }
});

test("Dragon agrees with the independent grid-search oracle on deterministic bit patterns", () => {
  let state = 0xa0761d6478bd642fn;
  for (let index = 0; index < 1500; index++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    assert.equal(dragonShortest(value).text, shortestDecimal(value).text, state.toString(16));
  }
});

test("Dragon exposes one exact state per generated digit", () => {
  const result = dragonShortest(1 / 3);
  assert.equal(result.states.length, 16);
  assert.equal(result.states.at(-1).decision, "only the lower candidate recovers");
  assert.equal(result.states.at(-1).lowerText, "0.3333333333333333");
});

test("Dragon exercises all stopping cases and decimal tie-to-even", () => {
  const cases = [
    [0x6c576fac43fd007cn, [true, false], "only the lower candidate recovers"],
    [0x826886b3864a1b1bn, [false, true], "only the upper candidate recovers"],
    [0x620355cd119357c5n, [true, true], "both candidates recover; lower is nearer"],
    [0xd6f84a5288bd02a4n, [true, true], "both candidates recover; upper is nearer"],
  ];
  for (const [bits, flags, decision] of cases) {
    const state = dragonShortest(fromBits(bits)).states.at(-1);
    assert.deepEqual([state.low, state.high], flags);
    assert.equal(state.decision, decision);
  }
  const tie = dragonShortest(fromBits(0x42d8b5872d22c018n)).states.at(-1);
  assert.equal(2n * tie.remainder, tie.denominator);
  assert.equal(tie.decision, "both candidates recover; exact tie, upper has an even last digit");
});
