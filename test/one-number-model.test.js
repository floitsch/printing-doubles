// Copyright (C) 2026 Toit contributors.
import test from "node:test";
import assert from "node:assert/strict";
import { interval, grid, closest, dragonSteps, contains, rightEndpoint, decimal } from "../site/js/one-number-model.js";

test("the worked example has three hundredths and no tenths", () => {
  assert.deepEqual(interval(201), { m: 201, lower: 401, center: 402, upper: 403, denominator: 64, closed: false });
  assert.deepEqual(grid(201, 3), { places: 3, scale: 1000, first: 6266, last: 6296, count: 31 });
  assert.deepEqual(grid(201, 2), { places: 2, scale: 100, first: 627, last: 629, count: 3 });
  assert.equal(grid(201, 1).count, 0);
  assert.equal(closest(201, 2), 628);
});

test("Dragon's actual division and margins justify every displayed stop", () => {
  const steps = dragonSteps();
  assert.deepEqual(steps.map(s => [s.digit, s.remainder, s.margin]), [[6, 18, 1], [2, 52, 10], [8, 8, 100]]);
  assert.deepEqual(steps.map(s => [s.low, s.high]), [[false, false], [false, false], [true, true]]);
  for (const s of steps) {
    assert.equal(s.numerator, s.digit * 64 + s.remainder);
    assert.equal(s.low, s.remainder < s.margin);
    assert.equal(s.high, 64 - s.remainder < s.margin);
  }
});

test("all slider inputs agree with an independent rational enumeration", () => {
  for (let m = 200; m <= 204; m++) {
    let found = false;
    for (let places = 0; places <= 3; places++) {
      const scale = 10 ** places;
      const candidates = [];
      for (let n = 6 * scale; n <= 7 * scale; n++) {
        const error = Math.abs(32 * n - m * scale);
        if (2 * error < scale || (2 * error === scale && m % 2 === 0)) candidates.push(n);
      }
      assert.equal(grid(m, places).count, candidates.length);
      if (!candidates.length) { assert.equal(closest(m, places), null); continue; }
      const best = candidates.toSorted((a, b) => Math.abs(32 * a - m * scale) - Math.abs(32 * b - m * scale) || a % 2 - b % 2)[0];
      assert.equal(closest(m, places), best);
      if (!found) {
        const stop = dragonSteps(m).at(-1);
        assert.equal(stop.places, places);
        assert.ok([stop.prefix, stop.prefix + 1].includes(best));
        found = true;
      }
    }
    assert.ok(found);
  }
  assert.equal(decimal(closest(204, 2), 2), "6.38", "decimal midpoint chooses the even significand");
});

test("endpoint equality uses the miniature binary significand's parity", () => {
  assert.equal(contains(200, 6234375, 6), true);
  assert.equal(contains(200, 6265625, 6), true);
  assert.equal(contains(201, 6265625, 6), false);
  assert.equal(contains(201, 6296875, 6), false);
});

test("the remainder measures the backward walk and changes the coarse decision", () => {
  assert.deepEqual(rightEndpoint(201), { q: 62, z: 62968.75, width: 312.5, remainder: 968.75, accepted: false });
  assert.deepEqual(rightEndpoint(202), { q: 63, z: 63281.25, width: 312.5, remainder: 281.25, accepted: true });
  for (const m of [201, 202]) {
    const d = rightEndpoint(m);
    assert.equal(d.q * 1000 + d.remainder, d.z);
    assert.equal(d.remainder < d.width, d.accepted);
  }
});
