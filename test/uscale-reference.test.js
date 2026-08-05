import test from "node:test";
import assert from "node:assert/strict";
import { fromBits } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";
import { hex64, unroundedScalingShort, uscalePower, uscaleProduct } from "../site/js/uscale-reference.js";

test("reconstructed cached powers match the pinned generated table", () => {
  const cases = [
    [-348, "0xfa8fd5a0081c0289", "0xe8cd3796329f1bac", 1284],
    [-292, "0xff77b1fcbebcdc50", "0xda171763ec44f085", 1098],
    [0, "0x8000000000000000", "0x0000000000000000", 127],
    [17, "0xb1a2bc2ec5000000", "0x0000000000000000", 71],
    [347, "0xd13eb46469447568", "0xb48e6a0d2d2e5604", -1025],
  ];
  for (const [p, hi, lo, binaryScale] of cases) {
    const power = uscalePower(p);
    assert.equal(hex64(power.hi), hi);
    assert.equal(hex64(power.lo), lo);
    assert.equal(power.binaryScale, binaryScale);
  }
});

test("optimized products equal the exact unrounded rational in fast and correction paths", () => {
  const fast = unroundedScalingShort(0.3).lowerScale;
  assert.equal(fast.fastPath, true);
  assert.equal(fast.agrees, true);

  const repair = unroundedScalingShort(1e23).upperScale;
  assert.equal(repair.fastPath, false);
  assert.equal(repair.agrees, true);

  const subnormal = unroundedScalingShort(Number.MIN_VALUE);
  assert.equal(subnormal.lowerScale.agrees, true);
  assert.equal(subnormal.upperScale.agrees, true);
  assert.equal(uscaleProduct(subnormal.x, subnormal.e, subnormal.p).agrees, true);
});

test("unrounded-scaling shortest records match difficult exact-oracle cases", () => {
  const values = [0.3, 1 / 3, 1, 2, 1.0000000000000002, 1e23, 1.2345, Math.PI, 1e-200, 1e200, Number.MIN_VALUE, Number.MAX_VALUE];
  for (const value of values) {
    const result = unroundedScalingShort(value);
    const exact = shortestDecimal(value);
    assert.equal(result.coefficient, exact.coefficient, String(value));
    assert.equal(result.exponent, exact.exponent, String(value));
  }
});

test("unrounded-scaling shortest agrees with the exact oracle across deterministic bit patterns", () => {
  let state = 0x9e3779b97f4a7c15n;
  const mask = (1n << 64n) - 1n;
  for (let index = 0; index < 300; index++) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & mask;
    const bits = state & 0x7fefffffffffffffn;
    if (bits === 0n) continue;
    const value = fromBits(bits);
    const result = unroundedScalingShort(value);
    const exact = shortestDecimal(value);
    assert.equal(result.coefficient, exact.coefficient, `bits ${bits.toString(16)}`);
    assert.equal(result.exponent, exact.exponent, `bits ${bits.toString(16)}`);
    assert.equal(result.lowerScale.agrees, true);
    assert.equal(result.upperScale.agrees, true);
    if (result.centerScale) assert.equal(result.centerScale.agrees, true);
  }
});
