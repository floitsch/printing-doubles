import test from "node:test";
import assert from "node:assert/strict";
import { boundedContinuedApproximation, continuedFraction, normalizedPowerRatio, smallestNormalBoundaryModel, toothlessStudy } from "../site/js/toothless-reference.js";

test("continued fractions reconstruct normalized decimal powers exactly", () => {
  for (const exponent of [3, 16, 32, 100, 308]) {
    const target = normalizedPowerRatio(exponent);
    const partials = continuedFraction(target);
    let numerator0 = 0n, numerator1 = 1n, denominator0 = 1n, denominator1 = 0n;
    for (const partial of partials) {
      [numerator0, numerator1] = [numerator1, partial * numerator1 + numerator0];
      [denominator0, denominator1] = [denominator1, partial * denominator1 + denominator0];
    }
    assert.equal(numerator1, target.numerator);
    assert.equal(denominator1, target.denominator);
  }
});

test("the selected convergent or semiconvergent fits both magnitude limits", () => {
  for (const exponent of [3, 16, 32, 100, 308]) {
    for (const bits of [8, 16, 24, 32, 48, 63]) {
      const result = toothlessStudy(exponent, bits);
      assert.ok(result.selected.numerator <= result.limit);
      assert.ok(result.selected.denominator <= result.limit);
      assert.ok(result.selected.kind === "convergent" || result.selected.kind === "semiconvergent");
    }
  }
});

test("more budget never worsens the selected absolute error for the study targets", () => {
  for (const exponent of [16, 32, 100, 308]) {
    let previous = null;
    for (const bits of [8, 12, 16, 24, 32, 48, 63]) {
      const result = boundedContinuedApproximation(normalizedPowerRatio(exponent), bits);
      if (previous) {
        const left = result.selected.error.numerator * previous.selected.error.denominator;
        const right = previous.selected.error.numerator * result.selected.error.denominator;
        assert.ok(left <= right, `10^${exponent}, ${bits} bits`);
      }
      previous = result;
    }
  }
});

test("the boundary microscope records the smallest-normal defect in exact units", () => {
  const model = smallestNormalBoundaryModel();
  assert.deepEqual(model.correct, { lower: -2, center: 0, upper: 2 });
  assert.deepEqual(model.implementation, { lower: -1, center: 0, upper: 2 });
});
