import test from "node:test";
import assert from "node:assert/strict";
import { fromBits, nextDown, nextUp } from "../site/js/float.js";
import { grisu3, grisu3WithFallback } from "../site/js/grisu-reference.js";
import { shortestDecimal } from "../site/js/oracle.js";

test("Grisu3 accepts familiar values with shortest output", () => {
  for (const value of [0.3, 1 / 3, 1, 1.25, Number.MIN_VALUE, Number.MAX_VALUE, -0.3]) {
    const result = grisu3(value);
    assert.equal(result.success, true, String(value));
    assert.equal(result.text, shortestDecimal(value).text, String(value));
  }
});

test("Grisu3 successes agree with the independent oracle and failures fall back", () => {
  let state = 0x243f6a8885a308d3n;
  let failures = 0;
  for (let index = 0; index < 3000; index++) {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= (1n << 64n) - 1n;
    const value = fromBits(state);
    if (!Number.isFinite(value) || value === 0) continue;
    const expected = shortestDecimal(value).text;
    const fast = grisu3(value);
    if (fast.success) assert.equal(fast.text, expected, state.toString(16));
    else failures++;
    assert.equal(grisu3WithFallback(value).text, expected, state.toString(16));
  }
  assert.ok(failures > 0, "the corpus must exercise the rejection path");
});

test("Grisu3 handles important binary64 transitions", () => {
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
    nextDown(Number.MAX_VALUE),
    Number.MAX_VALUE,
  ];
  for (const value of values.flatMap((item) => [item, -item])) {
    assert.equal(grisu3WithFallback(value).text, shortestDecimal(value).text, String(value));
  }
});

test("Grisu3 reproduces named fast-path and rejection behavior", () => {
  const ordinary = grisu3(0.3);
  assert.equal(ordinary.power.f, 0x9c40000000000000n);
  assert.equal(ordinary.power.e, -50);
  assert.equal(ordinary.power.decimalExponent, 4);
  assert.equal(ordinary.text, "0.3");

  const uncertain = grisu3(1e23);
  assert.equal(uncertain.success, false);
  assert.equal(uncertain.attemptedText, "1e+23");
  assert.equal(uncertain.reason, "candidate lies only in the uncertainty fringe");

  const exactDecimalTie = grisu3(fromBits(0x431c2eb01ec0035dn));
  assert.equal(exactDecimalTie.success, false);
  assert.equal(exactDecimalTie.attemptedText, "1983158328230103.3");
  assert.equal(shortestDecimal(fromBits(0x431c2eb01ec0035dn)).text, "1983158328230103.2");
});
