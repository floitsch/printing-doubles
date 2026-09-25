// Copyright (C) 2026 Toit contributors.
//
// Pure model for the "Two rulers" Schubfach page: exact BigInt rational
// arithmetic, no DOM.  Follows Giulietti's Figure 7 (optimal variant, M = 1).

import { decodeDouble, fromBits } from "../../js/float.js";

export const C_MIN = 1n << 52n;
export const Q_MIN = -1074;

const POW10 = [1n];
export function pow10(e) {
  while (POW10.length <= e) POW10.push(POW10.at(-1) * 10n);
  return POW10[e];
}

// ---------- tiny rational helpers ({n, d}, d > 0) ----------

export function floorDiv(n, d) {
  const q = n / d;
  return n < 0n && q * d !== n ? q - 1n : q;
}
export function ceilDiv(n, d) { return -floorDiv(-n, d); }
export const floorR = (r) => floorDiv(r.n, r.d);
export const cmpR = (a, b) => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
export const intR = (m) => ({ n: m, d: 1n });
export const isIntR = (r) => r.n % r.d === 0n;
/** r / 10^j */
export function divPow10(r, j) {
  return j >= 0 ? { n: r.n, d: r.d * pow10(j) } : { n: r.n * pow10(-j), d: r.d };
}
/** (r - origin) as a Number, accurate to ~1e-9 (origin is a BigInt). */
export function offsetNumber(r, origin) {
  const SCALE = 1_000_000_000n;
  return Number(floorDiv((r.n - origin * r.d) * SCALE, r.d)) / 1e9;
}
/** Decimal string of r with `places` digits after the point, truncated; "…" marks a cut. */
export function formatR(r, places = 3) {
  const neg = r.n < 0n;
  const n = neg ? -r.n : r.n;
  const ip = n / r.d;
  const rem = n - ip * r.d;
  let text = ip.toString();
  if (rem !== 0n) {
    const scaled = rem * pow10(places);
    let frac = (scaled / r.d).toString().padStart(places, "0");
    const exact = scaled % r.d === 0n;
    if (exact) frac = frac.replace(/0+$/, "");
    text += "." + frac + (exact ? "" : "…");
  }
  return (neg ? "−" : "") + text;
}

/** floor(log10(n/d)) for a positive rational. */
export function floorLog10(n, d) {
  let k = n.toString().length - d.toString().length;
  const ge = (e) => (e >= 0 ? n >= d * pow10(e) : n * pow10(-e) >= d);
  while (!ge(k)) k--;
  while (ge(k + 1)) k++;
  return k;
}

/** The fixed-point formula OpenJDK uses for k (valid for all binary64 q). */
export function javaK(q, irregular) {
  return Number((BigInt(q) * 661971961083n - (irregular ? 274743187321n : 0n)) >> 41n);
}

// ---------- decomposition ----------

export function decompose(value) {
  const d = decodeDouble(Math.abs(value));
  if (d.special) return { special: d.special };
  return { c: d.significand, q: d.exponent };
}

/** Double with significand c (C_MIN <= c < 2^53, or subnormal) and exponent q. */
export function doubleOf(c, q) {
  if (q === Q_MIN && c < C_MIN) return fromBits(c);
  const biased = BigInt(q + 1075);
  return fromBits((biased << 52n) | (c - C_MIN));
}

/** A value x given in quarter units (x = a/4 · 2^q), scaled by 10^-k. */
function scaled(a, q, k) {
  let n = a, d = 4n;
  if (q >= 0) n <<= BigInt(q); else d <<= BigInt(-q);
  if (k >= 0) d *= pow10(k); else n *= pow10(-k);
  return { n, d };
}

// ---------- the algorithm (exact) ----------

/**
 * Runs Schubfach (Fig. 7, M = 1) on |value| with exact rationals and returns
 * every intermediate quantity.  Scaled quantities are multiplied by 10^-k.
 */
export function analyze(value) {
  if (!Number.isFinite(value) || value === 0) return null;
  const { c, q } = decompose(value);
  const irregular = c === C_MIN && q > Q_MIN;
  const closed = (c & 1n) === 0n;
  const c4 = 4n * c;
  const cl4 = irregular ? c4 - 1n : c4 - 2n;
  const cr4 = c4 + 2n;
  // width = (cr4 - cl4)/4 · 2^q  = 2^q or 3/4 · 2^q
  const wq = scaled(cr4 - cl4, q, 0);
  const k = floorLog10(wq.n, wq.d);
  const Vl = scaled(cl4, q, k), V = scaled(c4, q, k), Vr = scaled(cr4, q, k);
  const width = scaled(cr4 - cl4, q, k);
  const lowerNeighbour = scaled(irregular ? c4 - 2n : c4 - 4n, q, k);
  const upperNeighbour = scaled(c4 + 4n, q, k);

  // x in R  (only the relevant side needs testing; both are tested here)
  const inside = (m) => {
    const x = intR(m);
    const a = cmpR(Vl, x), b = cmpR(x, Vr);
    return closed ? a <= 0 && b <= 0 : a < 0 && b < 0;
  };

  const s = floorR(V);
  const t = s + 1n;
  const coarseChecked = s >= 10n;
  const sp = s / 10n;
  const uP = 10n * sp, wP = uP + 10n;
  const uPin = inside(uP), wPin = inside(wP);
  const uIn = inside(s), wIn = inside(t);
  // 2V vs u + w decides "closer"
  const cmpClose = cmpR({ n: 2n * V.n, d: V.d }, intR(s + t)); // <0: u closer

  let path, digits, exp;
  if (coarseChecked && uPin) { path = "u'"; digits = sp; exp = k + 1; }
  else if (coarseChecked && wPin) { path = "w'"; digits = sp + 1n; exp = k + 1; }
  else if (uIn && !wIn) { path = "u"; digits = s; exp = k; }
  else if (!uIn && wIn) { path = "w"; digits = t; exp = k; }
  else if (cmpClose < 0) { path = "u-closer"; digits = s; exp = k; }
  else if (cmpClose > 0) { path = "w-closer"; digits = t; exp = k; }
  else { path = "tie"; digits = (s & 1n) === 0n ? s : t; exp = k; }

  let f = digits, zeros = 0;
  while (f % 10n === 0n) { f /= 10n; zeros++; }
  const fe = exp + zeros;

  return {
    value: Math.abs(value), negative: value < 0,
    c, q, irregular, closed, k, javaK: javaK(q, irregular),
    Vl, V, Vr, width, lowerNeighbour, upperNeighbour,
    s, t, sp, uP, wP, coarseChecked, uPin, wPin, uIn, wIn, cmpClose,
    path, digits, exp, f, fe, zeros,
    text: formatShortest(f, fe),
  };
}

/** Count of ticks m·10^j (scaled units) inside the interval of `a`. */
export function countTicks(a, j) {
  const lo = divPow10(a.Vl, j), hi = divPow10(a.Vr, j);
  let first = ceilDiv(lo.n, lo.d), last = floorDiv(hi.n, hi.d);
  if (!a.closed && isIntR(lo)) first++;
  if (!a.closed && isIntR(hi)) last--;
  return last >= first ? last - first + 1n : 0n;
}

/** Tick indices m (tick at m·10^j) with lo <= m·10^j <= hi; null if more than cap. */
export function ticksBetween(lo, hi, j, cap = 4000) {
  const L = divPow10(lo, j), H = divPow10(hi, j);
  const first = ceilDiv(L.n, L.d), last = floorDiv(H.n, H.d);
  if (last - first + 1n > BigInt(cap)) return null;
  const out = [];
  for (let m = first; m <= last; m++) out.push(m);
  return out;
}

/** Is scaled integer m inside the interval of a? */
export function contains(a, m) {
  const x = intR(m);
  const lo = cmpR(a.Vl, x), hi = cmpR(x, a.Vr);
  return a.closed ? lo <= 0 && hi <= 0 : lo < 0 && hi < 0;
}

/** Number of trailing decimal zeros of a positive BigInt. */
export function trailingZeros(m) {
  if (m === 0n) return 0;
  let z = 0;
  while (m % 10n === 0n) { m /= 10n; z++; }
  return z;
}

/** JavaScript-style rendering of f·10^e (same thresholds as Number#toString). */
export function formatShortest(f, e) {
  const digits = f.toString();
  const n = digits.length + e; // decimal point position
  if (e >= 0 && n <= 21) return digits + "0".repeat(e);
  if (e < 0 && n > 0) return digits.slice(0, n) + "." + digits.slice(n);
  if (n <= 0 && n > -6) return "0." + "0".repeat(-n) + digits;
  const exp = n - 1;
  return digits[0] + (digits.length > 1 ? "." + digits.slice(1) : "") + "e" + (exp >= 0 ? "+" : "-") + Math.abs(exp);
}

/** Unicode superscript for an integer exponent. */
export function sup(e) {
  const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return String(e).split("").map((ch) => map[ch]).join("");
}

// ---------- input parsing ----------

const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;

/**
 * Parses a literal, a power of two ("2^53", "2**-10"), or one binary
 * operation between two literals ("0.1+0.2", "2/3").  Returns a Number or null.
 */
export function parseInput(text) {
  const src = String(text).replace(/\s+/g, "").replace(/−/g, "-").replace(/×/g, "*");
  if (!src) return null;
  const pow = src.match(/^(-?)2(?:\^|\*\*)([+-]?\d+)$/);
  if (pow) {
    const v = 2 ** Number(pow[2]);
    return pow[1] ? -v : v;
  }
  const a = src.match(NUM);
  if (!a) return null;
  const x = Number(a[0]);
  const rest = src.slice(a[0].length);
  if (!rest) return x;
  const op = rest[0];
  const b = rest.slice(1).match(NUM);
  if (!"+-*/".includes(op) || !b || b[0].length !== rest.length - 1) return null;
  const y = Number(b[0]);
  return op === "+" ? x + y : op === "-" ? x - y : op === "*" ? x * y : x / y;
}

// ---------- presets ----------

export const PRESETS = [
  { id: "0.3", label: "0.3", input: "0.3" },
  { id: "0.1+0.2", label: "0.1+0.2", input: "0.1+0.2" },
  { id: "0.1", label: "0.1", input: "0.1" },
  { id: "2/3", label: "2/3", input: "2/3" },
  { id: "1e23", label: "1e23", input: "1e23" },
  { id: "5e-324", label: "5e-324", input: "5e-324" },
  { id: "tie", label: "562949953421312.25 (tie)", input: "562949953421312.25" },
  { id: "2^62", label: "2^62 (power of two)", input: "2^62" },
];
