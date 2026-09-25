// Exact model behind the "last-digit ruler" explanation of xjb.
// Pure computation, no DOM: importable from node tests.
//
// Everything that is shown on the page as a number is computed here with
// BigInt rationals. Plain JavaScript numbers are only produced for drawing
// coordinates (never for values that are printed).

import { decodeDouble, formatDecimal, nextDown, nextUp, bitsOf, fromBits } from "../../js/float.js";
import { intervalOf, exactDecimal } from "../../js/oracle.js";

// ---------------------------------------------------------------------------
// Small exact-rational toolkit: { num: BigInt, den: BigInt > 0 }.

const POW10 = [1n];
export function pow10(power) {
  while (POW10.length <= power) POW10.push(POW10.at(-1) * 10n);
  return POW10[power];
}
const pow2 = (power) => 1n << BigInt(power);

export const rat = (num, den = 1n) => (den < 0n ? { num: -num, den: -den } : { num, den });
export const cmp = (a, b) => {
  const d = a.num * b.den - b.num * a.den;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};
export const add = (a, b) => (a.den === b.den ? rat(a.num + b.num, a.den) : rat(a.num * b.den + b.num * a.den, a.den * b.den));
export const sub = (a, b) => (a.den === b.den ? rat(a.num - b.num, a.den) : rat(a.num * b.den - b.num * a.den, a.den * b.den));
export const mulInt = (a, i) => rat(a.num * BigInt(i), a.den);
export const divInt = (a, i) => rat(a.num, a.den * BigInt(i));
export function floorOf(a) {
  let q = a.num / a.den;
  if (a.num < 0n && a.num % a.den !== 0n) q--;
  return q;
}
export const isInteger = (a) => a.num % a.den === 0n;
export const toNumber = (a) => {
  // For drawing only: about 64 significant bits, then a float division.
  const bitLength = (x) => (x < 0n ? -x : x).toString(2).length;
  if (a.num === 0n) return 0;
  const s = 64 - (bitLength(a.num) - bitLength(a.den));
  const q = s >= 0 ? (a.num << BigInt(s)) / a.den : a.num / (a.den << BigInt(-s));
  return Number(q) * 2 ** -s;
};

/** Exact value 10^e (any integer e) as a rational. */
export const tenTo = (e) => (e >= 0 ? rat(pow10(e)) : rat(1n, pow10(-e)));
/** Exact value 2^e (any integer e) as a rational. */
export const twoTo = (e) => (e >= 0 ? rat(pow2(e)) : rat(1n, pow2(-e)));

/**
 * Decimal digits of a rational, truncated after `places` decimals.
 * Adds "…" when digits were cut off; trims trailing zeros when exact.
 * Uses the typographic minus sign.
 */
export function decimalString(r, places = 10) {
  const negative = r.num < 0n;
  const num = negative ? -r.num : r.num;
  const whole = num / r.den;
  let rest = num % r.den;
  let digits = "";
  for (let i = 0; i < places && rest !== 0n; i++) {
    rest *= 10n;
    digits += (rest / r.den).toString();
    rest %= r.den;
  }
  let text = whole.toString() + (digits ? `.${digits}` : "");
  if (rest !== 0n) text += "…";
  return (negative && num !== 0n ? "−" : "") + text;
}

/** Largest integer k with 10^k ≤ r (r > 0). */
export function floorLog10(r) {
  const bits = r.num.toString(2).length - r.den.toString(2).length;
  let k = Math.floor(bits * 0.3010299956639812) - 1;
  while (cmp(tenTo(k + 1), r) <= 0) k++;
  while (cmp(tenTo(k), r) > 0) k--;
  return k;
}

// ---------------------------------------------------------------------------
// Input parsing: decimal literals and tiny arithmetic expressions, evaluated
// with ordinary double arithmetic (so 0.1+0.2 gives 0.30000000000000004).

export function evaluateInput(text) {
  const source = String(text).trim();
  if (!source) throw new SyntaxError("Type a number, e.g. 0.1+0.2 or 2^64");
  const tokens = [];
  const re = /\s*(?:((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|(\*\*|[-+*/^()×−])|(pi|PI|Pi|π|Math\.PI))/y;
  let index = 0;
  while (index < source.length) {
    re.lastIndex = index;
    const match = re.exec(source);
    if (!match || match[0].length === 0) {
      if (/^\s*$/.test(source.slice(index))) break;
      throw new SyntaxError(`Cannot read “${source.slice(index).trim()}”`);
    }
    if (match[1] !== undefined) tokens.push({ type: "num", value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ type: "op", value: match[2] === "×" ? "*" : match[2] === "−" ? "-" : match[2] === "^" ? "**" : match[2] });
    else tokens.push({ type: "num", value: Math.PI });
    index = re.lastIndex;
  }
  let position = 0;
  const peek = () => tokens[position];
  const takeOp = (op) => (peek() && peek().type === "op" && peek().value === op ? (position++, true) : false);
  function expression() {
    let value = term();
    for (;;) {
      if (takeOp("+")) value += term();
      else if (takeOp("-")) value -= term();
      else return value;
    }
  }
  function term() {
    let value = unary();
    for (;;) {
      if (takeOp("*")) value *= unary();
      else if (takeOp("/")) value /= unary();
      else return value;
    }
  }
  function unary() {
    if (takeOp("-")) return -unary();
    if (takeOp("+")) return unary();
    return power();
  }
  function power() {
    const base = atom();
    if (takeOp("**")) return base ** unary();
    return base;
  }
  function atom() {
    const token = peek();
    if (!token) throw new SyntaxError("The expression ends too early");
    if (token.type === "num") { position++; return token.value; }
    if (takeOp("(")) {
      const value = expression();
      if (!takeOp(")")) throw new SyntaxError("Missing “)”");
      return value;
    }
    throw new SyntaxError(`Unexpected “${token.value}”`);
  }
  const value = expression();
  if (position !== tokens.length) throw new SyntaxError(`Unexpected “${tokens[position].value}”`);
  return value;
}

// ---------------------------------------------------------------------------
// The ruler analysis.

/**
 * Analyze a finite, nonzero double the way xjb decides its digits, with exact
 * rationals. Positions on the ruler are in units of 10^(k+1), measured from m.
 *
 * options.symmetric: for a power of two, run the regular path anyway: the
 * ordinary k and a symmetric bar (the wrong rule shown in the power-of-two
 * panel). For 2^64 and 2^89 the ordinary k is the same, so only the bar changes.
 */
export function analyze(value, { symmetric = false } = {}) {
  if (!Number.isFinite(value)) throw new RangeError("Only finite doubles have digits to print");
  if (value === 0) throw new RangeError("Zero is printed as a special case");
  const negative = value < 0;
  const decoded = decodeDouble(Math.abs(value));
  const c = decoded.significand;
  const q = decoded.exponent;
  // xjb's "irregular" case: a stored fraction of zero in a normal binade.
  // (It includes 2^-1022, whose lower neighbour is actually just as far away.)
  const lopsided = decoded.exponentBits >= 1 && decoded.fraction === 0n;
  const useLopsided = lopsided && !symmetric;
  const even = (c & 1n) === 0n;
  const closed = even;

  const gap = twoTo(q); // distance to the upper neighbour
  const k = floorLog10(useLopsided ? divInt(mulInt(gap, 3), 4) : gap);
  const kRegular = floorLog10(gap);
  const kLopsided = lopsided ? floorLog10(divInt(mulInt(gap, 3), 4)) : kRegular;
  const unit = tenTo(k + 1);

  const exactValue = q >= 0 ? rat(c << BigInt(q)) : rat(c, pow2(-q));
  const scaled = rat(exactValue.num * unit.den, exactValue.den * unit.num);
  const m = floorOf(scaled);
  const n = rat(scaled.num - m * scaled.den, scaled.den);
  const h = rat(gap.num * unit.den, 2n * gap.den * unit.num); // upper half-gap
  const hLow = useLopsided ? divInt(h, 2) : h; // lower half-gap
  const lower = sub(n, hLow);
  const upper = add(n, h);

  const inside = (x) => {
    const a = cmp(x, lower);
    const b = cmp(x, upper);
    return (a > 0 || (closed && a === 0)) && (b < 0 || (closed && b === 0));
  };
  const tickInside = Array.from({ length: 11 }, (_, j) => inside(rat(BigInt(j), 10n)));
  const downHit = tickInside[0];
  const upHit = tickInside[10];
  const oneMinusN = sub(rat(1n), n);

  // Nearest tick: round(10 n), ties to even.
  const tenN = mulInt(n, 10);
  const floorTenN = floorOf(tenN);
  const frac = sub(tenN, rat(floorTenN));
  const half = cmp(frac, rat(1n, 2n));
  const tie = half === 0;
  let nearestTick = Number(half > 0 ? floorTenN + 1n : half < 0 ? floorTenN : (floorTenN % 2n === 0n ? floorTenN : floorTenN + 1n));
  const roundedTick = nearestTick;
  let bumped = false;
  if (!downHit && !upHit && !tickInside[nearestTick]) {
    // Only possible on the short side of a lopsided bar: take the tick above.
    bumped = true;
    nearestTick += 1;
    if (!tickInside[nearestTick]) throw new Error("internal: no tick inside the bar");
  }

  const outcome = downHit ? "down" : upHit ? "up" : "nearest";
  const digit = outcome === "down" ? 0 : outcome === "up" ? 10 : nearestTick;
  const d = 10n * m + BigInt(digit);
  let coefficient = d;
  let stripped = 0;
  while (coefficient !== 0n && coefficient % 10n === 0n) { coefficient /= 10n; stripped++; }
  const exponent = k + stripped;
  const signed = negative ? -coefficient : coefficient;
  const text = formatDecimal(signed, exponent);
  const asciiText = `${negative ? "-" : ""}${coefficient}e${exponent}`;
  const readBack = Number(asciiText);

  return {
    value, negative, decoded, c, q, lopsided, symmetric: lopsided && symmetric, even, closed,
    k, kRegular, kLopsided, unitExponent: k + 1, exactValue, scaled,
    m, n, h, hLow, lower, upper, oneMinusN,
    widthTicks: mulInt(add(h, hLow), 10), // bar width measured in ticks (tenths of the cell)
    tickInside, downHit, upHit,
    tenN, roundedTick, nearestTick, tie, bumped,
    outcome, digit, d, coefficient: signed, exponent, stripped, text, asciiText,
    readBack, roundTrips: Object.is(readBack, value),
  };
}

/** Map an absolute rational into ruler coordinates of analysis `a`. */
export function toFrame(a, absolute) {
  const unit = tenTo(a.unitExponent);
  const scaled = rat(absolute.num * unit.den, absolute.den * unit.num);
  return sub(scaled, rat(a.m));
}

/** Rounding intervals of the two neighbouring doubles, in the frame of `a`. */
export function neighbourBars(a) {
  const abs = Math.abs(a.value);
  const result = {};
  for (const [name, other] of [["prev", nextDown(abs)], ["next", nextUp(abs)]]) {
    if (!(other > 0) || !Number.isFinite(other)) { result[name] = null; continue; }
    const interval = intervalOf(other);
    const r = (x) => rat(x.numerator, x.denominator);
    result[name] = { value: other, at: toFrame(a, r(interval.center)), lower: toFrame(a, r(interval.lower)), upper: toFrame(a, r(interval.upper)), closed: interval.closed };
  }
  return result;
}

/**
 * The "zoom" rows: decimal grids with spacing 10^e for e = k+2 … k−1.
 * For each: how many grid points lie inside the rounding interval, and
 * which grid points are visible in the view [xMin, xMax] (frame units).
 */
export function gridRows(a, xMin = -0.5, xMax = 1.5) {
  const lowAbs = add(rat(a.m), a.lower);
  const highAbs = add(rat(a.m), a.upper);
  const rows = [];
  for (const e of [a.k + 2, a.k + 1, a.k, a.k - 1]) {
    const step = tenTo(e - a.unitExponent); // spacing in frame units
    const lo = rat(lowAbs.num * step.den, lowAbs.den * step.num);
    const hi = rat(highAbs.num * step.den, highAbs.den * step.num);
    let first = -floorOf(rat(-lo.num, lo.den));
    let last = floorOf(hi);
    if (!a.closed && isInteger(lo)) first++;
    if (!a.closed && isInteger(hi)) last--;
    const count = last >= first ? Number(last - first + 1n) : 0;
    const viewFirst = -floorOf(rat(-(BigInt(Math.floor(xMin * 1000)) + a.m * 1000n) * step.den, 1000n * step.num));
    const viewLast = floorOf(rat((BigInt(Math.ceil(xMax * 1000)) + a.m * 1000n) * step.den, 1000n * step.num));
    const points = [];
    for (let t = viewFirst; t <= viewLast; t++) {
      const x = sub(rat(t * step.num, step.den), rat(a.m));
      points.push({ x: toNumber(x), inside: t >= first && t <= last });
    }
    rows.push({ exponent: e, count, points });
  }
  return rows;
}

/** Where a decimal string lands when read back, relative to v. */
export function readBackReport(a) {
  const back = a.readBack;
  if (Object.is(back, a.value)) return { same: true, back, steps: 0, exact: exactDecimal(back) };
  const steps = Number(bitsOf(Math.abs(back)) - bitsOf(Math.abs(a.value))) * (a.negative ? -1 : 1);
  const bv = decodeDouble(Math.abs(back));
  const backExact = bv.exponent >= 0 ? rat(bv.significand << BigInt(bv.exponent)) : rat(bv.significand, pow2(-bv.exponent));
  const diff = sub(backExact, a.exactValue);
  return { same: false, back, steps, exact: exactDecimal(back), difference: diff };
}

// ---------------------------------------------------------------------------
// Register-level view of the regular path of xjb64 (src/ftoa.cpp), for the
// short "how the code does it" figure. Returns null for powers of two, which
// the code handles in a separate branch.

const M64 = (1n << 64n) - 1n;
function floorLog2Pow10(e) { // exact floor(e · log2 10)
  let b = Math.floor(e * 3.321928094887362);
  const ge = (bb) => cmp(tenTo(e), twoTo(bb)) >= 0; // 10^e ≥ 2^bb
  while (!ge(b)) b--;
  while (ge(b + 1)) b++;
  return b;
}
/** 128-bit table entry: ⌈10^e · 2^(127 − ⌊e·log2 10⌋)⌉. */
export function tableEntry(e) {
  const s = 127 - floorLog2Pow10(e);
  const v = e >= 0 ? rat(pow10(e)) : rat(1n, pow10(-e));
  const num = s >= 0 ? v.num << BigInt(s) : v.num;
  const den = s >= 0 ? v.den : v.den << BigInt(-s);
  return (num + den - 1n) / den;
}

export function registers(a) {
  if (a.lopsided) return null;
  const c = a.c;
  const q = a.q;
  const k = a.k;
  const e = -k - 1;
  const table = tableEntry(e);
  const tableShift = 127 - floorLog2Pow10(e);
  const tableHi = table >> 64n;
  const tableLo = table & M64;
  const h = q + floorLog2Pow10(e); // always in [-4, -1]
  const shift = h + 10;
  const cShifted = (c << BigInt(shift)) & M64;
  const top = cShifted * tableHi + ((cShifted * tableLo) >> 64n); // top 128 of the 192-bit product
  const hi64 = top >> 64n;
  const lo64 = top & M64;
  const offset = 9n;
  const dotOne = ((hi64 << (64n - offset)) | (lo64 >> offset)) & M64;
  const evenBit = (c + 1n) & 1n;
  const halfUlp = (tableHi >> BigInt(-h)) + evenBit;
  const notDot = M64 - dotOne;
  const up = halfUlp > notDot;
  const down = halfUlp > dotOne;
  const m = hi64 >> offset;
  const bias = dotOne === (1n << 62n) ? 0n : (1n << 63n) + 6n;
  const one = (dotOne * 10n + bias) >> 64n;
  return { e, table, tableShift, tableHi, h, shift, hi64, lo64, m, dotOne, halfUlp, evenBit, notDot, up, down, one, tieFix: bias === 0n };
}

export const hex64 = (x) => `0x${x.toString(16).padStart(16, "0")}`;

// ---------------------------------------------------------------------------
// Powers of two (the lopsided bar). Numbers below are verified by
// test/explore-xjb-ruler.test.js against powersOfTwoStats().

export const POWERS_OF_TWO = { total: 2046, symmetricWrong: 255, bumped: 26, kShifted: 256 };

export function powerOfTwo(exponent) {
  return fromBits(BigInt(exponent + 1023) << 52n);
}

export function powersOfTwoStats() {
  let symmetricWrong = 0;
  let bumped = 0;
  let kShifted = 0;
  const traps = [];
  for (let e = -1022; e <= 1023; e++) {
    const v = powerOfTwo(e);
    const good = analyze(v);
    const bad = analyze(v, { symmetric: true });
    if (!bad.roundTrips) { symmetricWrong++; traps.push(e); }
    if (good.bumped) bumped++;
    if (good.kLopsided !== good.kRegular) kShifted++;
  }
  return { total: 2046, symmetricWrong, bumped, kShifted, traps };
}

/** Next power-of-two exponent after `from` where the symmetric rule misprints. */
export function nextTrap(from, direction = 1) {
  for (let e = from + direction; e >= -1022 && e <= 1023; e += direction) {
    if (!analyze(powerOfTwo(e), { symmetric: true }).roundTrips) return e;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Presets.

export const PRESETS = [
  { label: "0.3", input: "0.3" },
  { label: "0.1+0.2", input: "0.1+0.2" },
  { label: "1.3", input: "1.3" },
  { label: "123.456", input: "123.456" },
  { label: "π", input: "pi" },
  { label: "2⁵⁰+¼ (tie)", input: "2^50+0.25" },
  { label: "2⁶⁴", input: "2^64" },
  { label: "2⁸⁹", input: "2^89" },
];

/** A random positive finite double (uniform over bit patterns). */
export function randomDouble(random = Math.random) {
  for (;;) {
    const hi = BigInt(Math.floor(random() * 2 ** 31)); // sign bit 0
    const lo = BigInt(Math.floor(random() * 2 ** 32));
    const v = fromBits((hi << 32n) | lo);
    if (Number.isFinite(v) && v > 0) return v;
  }
}

export { nextDown, nextUp, exactDecimal };
