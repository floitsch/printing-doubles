#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { bitsOf, formatDecimal, fromBits } from "../site/js/float.js";
import { shortestDecimal } from "../site/js/oracle.js";

const executable = process.argv[2];
if (!executable) {
  console.error("usage: node scripts/verify-gay-dtoa.mjs /path/to/gay-dtoa-probe");
  process.exit(2);
}

const patterns = new Set([
  bitsOf(0.3), bitsOf(1 / 3), bitsOf(1), bitsOf(1e23), bitsOf(Number.MIN_VALUE),
  bitsOf(2 ** -1022), bitsOf(Number.MAX_VALUE), bitsOf(1.0000000000000002),
  bitsOf(9007199254740992), bitsOf(-0.3),
]);
let state = 0x9e3779b97f4a7c15n;
while (patterns.size < 810) {
  state ^= state << 13n;
  state ^= state >> 7n;
  state ^= state << 17n;
  state &= (1n << 64n) - 1n;
  const value = fromBits(state);
  if (Number.isFinite(value) && value !== 0) patterns.add(state);
}

const arguments_ = [...patterns].map(bits => bits.toString(16).padStart(16, "0"));
const run = spawnSync(executable, arguments_, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
if (run.error) throw run.error;
if (run.status !== 0) {
  process.stderr.write(run.stderr);
  process.exit(run.status ?? 1);
}

const lines = run.stdout.trim().split("\n");
if (lines.length !== patterns.size) throw new Error(`expected ${patterns.size} records, received ${lines.length}`);
for (const line of lines) {
  const match = line.match(/^([0-9a-f]{16}) ([01]) (-?\d+) (\d+)$/);
  if (!match) throw new Error(`malformed probe record: ${line}`);
  const bits = BigInt(`0x${match[1]}`);
  const value = fromBits(bits);
  let coefficient = BigInt(match[4]);
  if (match[2] === "1") coefficient = -coefficient;
  let exponent = Number(match[3]) - match[4].length;
  while (coefficient !== 0n && coefficient % 10n === 0n) {
    coefficient /= 10n;
    exponent++;
  }
  const actual = formatDecimal(coefficient, exponent);
  const expected = shortestDecimal(value).text;
  if (actual !== expected) throw new Error(`${match[1]}: Gay dtoa ${actual}; exact oracle ${expected}`);
}

console.log(`Gay dtoa mode 0 matched the independent exact oracle for ${lines.length} finite nonzero binary64 patterns.`);
