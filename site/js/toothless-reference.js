function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right) [left, right] = [right, left % right];
  return left;
}

function reduce(numerator, denominator) {
  const common = gcd(numerator, denominator);
  return { numerator: numerator / common, denominator: denominator / common };
}

function bitLength(value) {
  value = value < 0n ? -value : value;
  return value === 0n ? 0 : value.toString(2).length;
}

function compareFractions(left, right) {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function log10BigInt(value) {
  value = value < 0n ? -value : value;
  if (value === 0n) return -Infinity;
  const digits = value.toString();
  const head = Number(digits.slice(0, 16)) / 10 ** (Math.min(16, digits.length) - 1);
  return digits.length - 1 + Math.log10(head);
}

export function normalizedPowerRatio(decimalExponent) {
  if (!Number.isInteger(decimalExponent) || decimalExponent < 1 || decimalExponent > 308) throw new RangeError("decimal exponent must be in [1, 308]");
  const ten = 10n ** BigInt(decimalExponent);
  let binaryExponent = Math.ceil(decimalExponent * Math.log2(10));
  while ((1n << BigInt(binaryExponent)) < ten) binaryExponent++;
  while (binaryExponent > 0 && (1n << BigInt(binaryExponent - 1)) >= ten) binaryExponent--;
  return { ...reduce(1n << BigInt(binaryExponent), ten), decimalExponent, binaryExponent };
}

export function continuedFraction(target) {
  let numerator = target.numerator;
  let denominator = target.denominator;
  const partials = [];
  while (denominator !== 0n) {
    const whole = numerator / denominator;
    partials.push(whole);
    [numerator, denominator] = [denominator, numerator % denominator];
  }
  return partials;
}

function errorOf(candidate, target) {
  const difference = candidate.numerator * target.denominator - target.numerator * candidate.denominator;
  const absolute = difference < 0n ? -difference : difference;
  return {
    numerator: absolute,
    denominator: candidate.denominator * target.denominator,
    log10: absolute === 0n ? -Infinity : log10BigInt(absolute) - log10BigInt(candidate.denominator) - log10BigInt(target.denominator),
  };
}

export function boundedContinuedApproximation(target, magnitudeBits) {
  if (!Number.isInteger(magnitudeBits) || magnitudeBits < 2 || magnitudeBits > 63) throw new RangeError("magnitudeBits must be in [2, 63]");
  const limit = (1n << BigInt(magnitudeBits)) - 1n;
  const partials = continuedFraction(target);
  let p0 = 0n;
  let p1 = 1n;
  let q0 = 1n;
  let q1 = 0n;
  const rungs = [];

  for (let index = 0; index < partials.length; index++) {
    const partial = partials[index];
    const numerator = partial * p1 + p0;
    const denominator = partial * q1 + q0;
    if (numerator <= limit && denominator <= limit) {
      const candidate = { numerator, denominator };
      rungs.push({ index, partial, multiplier: partial, kind: "convergent", ...candidate, side: compareFractions(candidate, target), error: errorOf(candidate, target) });
      [p0, p1, q0, q1] = [p1, numerator, q1, denominator];
      continue;
    }

    let maxMultiplier = partial;
    if (p1 > 0n) maxMultiplier = maxMultiplier < (limit - p0) / p1 ? maxMultiplier : (limit - p0) / p1;
    if (q1 > 0n) maxMultiplier = maxMultiplier < (limit - q0) / q1 ? maxMultiplier : (limit - q0) / q1;
    if (maxMultiplier > 0n) {
      const seminum = maxMultiplier * p1 + p0;
      const semiden = maxMultiplier * q1 + q0;
      if (seminum > 0n && semiden > 0n && (seminum !== p1 || semiden !== q1)) {
        const candidate = { numerator: seminum, denominator: semiden };
        rungs.push({ index, partial, multiplier: maxMultiplier, kind: "semiconvergent", ...candidate, side: compareFractions(candidate, target), error: errorOf(candidate, target) });
      }
    }
    break;
  }
  const selected = rungs.at(-1);
  if (!selected) throw new Error("no bounded approximation found");
  const midpoint = reduce(
    selected.numerator * target.denominator + target.numerator * selected.denominator,
    2n * selected.denominator * target.denominator,
  );
  return {
    target,
    magnitudeBits,
    limit,
    partials,
    rungs,
    selected,
    midpoint,
    selectedNumeratorBits: bitLength(selected.numerator),
    selectedDenominatorBits: bitLength(selected.denominator),
    targetNumeratorBits: bitLength(target.numerator),
    targetDenominatorBits: bitLength(target.denominator),
    amplifiedError: selected.error.numerator === 0n ? 0 : 10 ** (selected.error.log10 + 53 * Math.log10(2)),
  };
}

export function toothlessStudy(decimalExponent, magnitudeBits = 63) {
  return boundedContinuedApproximation(normalizedPowerRatio(decimalExponent), magnitudeBits);
}

export function smallestNormalBoundaryModel() {
  // Coordinates use 2^-1076. At the normal/subnormal transition both adjacent
  // gaps are four units, so both midpoint distances are two units. The source
  // applies the ordinary power-of-two rule and uses one lower unit instead.
  return {
    unit: "2^-1076",
    correct: { lower: -2, center: 0, upper: 2 },
    implementation: { lower: -1, center: 0, upper: 2 },
    previous: -4,
    next: 4,
    bits: "0x0010000000000000",
  };
}

export const TOOTHLESS_OBLIGATIONS = [
  { status: "known", label: "Exact target", detail: "Define the rational 2^e / 10^k and the cached side." },
  { status: "conditional", label: "Best rung", detail: "Include semiconvergents and the simultaneous numerator/denominator ceiling." },
  { status: "missing", label: "Separation", detail: "Prove that every comparison rational has too small a denominator to enter the cache gap." },
  { status: "conditional", label: "±1 endpoints", detail: "The adjustment table is valid only after separation and reciprocal direction are certified." },
  { status: "missing", label: "Shortest grid", detail: "Relate each prefix to the greatest point on one explicit decimal lattice." },
  { status: "incorrect", label: "Closest proof", detail: "The short draft multiplies the candidate by the cached ratio twice; begin from the code inequality." },
  { status: "defect", label: "Binary boundary", detail: "The smallest normal value receives an inward lower midpoint." },
];
