// Copyright (C) 2026 Toit contributors.

// A local binade of an eight-significant-bit binary format, not binary64.
// All decisions below use small, exact integer arithmetic. Decimal numbers
// returned by display helpers are labels, never inputs to membership tests.
export function interval(m = 201) {
  return { m, lower: 2 * m - 1, center: 2 * m, upper: 2 * m + 1,
    denominator: 64, closed: m % 2 === 0 };
}

export function grid(m, places) {
  const i = interval(m);
  const scale = 10 ** places;
  const lower = i.lower * scale;
  const upper = i.upper * scale;
  const first = Math.floor(lower / 64) + (i.closed && lower % 64 === 0 ? 0 : 1);
  const last = Math.floor(upper / 64) - (!i.closed && upper % 64 === 0 ? 1 : 0);
  return { places, scale, first, last, count: Math.max(0, last - first + 1) };
}

export function contains(m, integer, places) {
  const i = interval(m);
  const candidate = integer * 64;
  const lower = i.lower * 10 ** places;
  const upper = i.upper * 10 ** places;
  return i.closed ? candidate >= lower && candidate <= upper : candidate > lower && candidate < upper;
}

export function closest(m, places) {
  const g = grid(m, places);
  if (!g.count) return null;
  const numerator = m * g.scale;
  const q = Math.floor(numerator / 32);
  const r = numerator % 32;
  const rounded = q + (r > 16 || (r === 16 && q % 2 !== 0) ? 1 : 0);
  return Math.max(g.first, Math.min(g.last, rounded));
}

export function dragonSteps(m = 201) {
  let numerator = 2 * m;
  let margin = 1;
  let prefix = 0;
  const steps = [];
  for (let places = 0; places <= 5; places++) {
    const digit = Math.floor(numerator / 64);
    const remainder = numerator % 64;
    prefix = 10 * prefix + digit;
    const low = contains(m, prefix, places);
    const high = contains(m, prefix + 1, places);
    steps.push({ places, numerator, digit, remainder, margin, prefix, low, high });
    if (low || high) return steps;
    numerator = remainder * 10;
    margin *= 10;
  }
  throw new Error("The teaching interval should have admitted a candidate.");
}

export function decimal(integer, places) {
  return (integer / 10 ** places).toFixed(places);
}

// Exact geometric counterpart of the right-endpoint/remainder test.
// At scale 10000, a tenth is 1000 units and a hundredth is 100.
export function rightEndpoint(m = 201) {
  const i = interval(m);
  const zNumerator = i.upper * 10000;
  const q = Math.floor(zNumerator / (64 * 1000));
  return { q, z: zNumerator / 64, width: 20000 / 64,
    remainder: (zNumerator - q * 64 * 1000) / 64,
    accepted: contains(m, q, 1) };
}
