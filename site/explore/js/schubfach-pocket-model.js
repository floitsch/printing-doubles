// Pure model for the "Pocket Schubfach" lab page. No DOM; importable by node.
//
// Act 1 runs Schubfach on IEEE binary16 (half precision) with exact rational
// arithmetic. Act 2 runs the binary64 algorithm twice: once exactly (BigInt
// rationals, the paper's Fig. 7 with M = 1) and once the way OpenJDK does it
// (126-bit table value g, three multiplications, round to odd), with switches
// that replace round to odd by plain truncation or by a naive sticky bit.

// ---------------------------------------------------------------------------
// Small exact rationals {n, d} with d > 0 (BigInt).

export const rat = (n, d = 1n) => (d < 0n ? { n: -n, d: -d } : { n, d });
export const cmp = (a, b) => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const floorDiv = (n, d) => {
  const q = n / d;
  return n % d !== 0n && (n < 0n) !== (d < 0n) ? q - 1n : q;
};
export const floorRat = (a) => floorDiv(a.n, a.d);
const pow10n = (e) => 10n ** BigInt(e);
export const pow2rat = (e) => (e >= 0 ? rat(1n << BigInt(e)) : rat(1n, 1n << BigInt(-e)));
export const pow10rat = (e) => (e >= 0 ? rat(pow10n(e)) : rat(1n, pow10n(-e)));
const bitLen = (x) => (x === 0n ? 0 : x.toString(2).length);

/** floor(log10(a)) for a positive rational. */
export function floorLog10(a) {
  let k = a.n.toString().length - a.d.toString().length;
  while (cmp(a, pow10rat(k)) < 0) k--;
  while (cmp(a, pow10rat(k + 1)) >= 0) k++;
  return k;
}
/** floor(log2(a)) for a positive rational. */
export function floorLog2(a) {
  let k = bitLen(a.n) - bitLen(a.d);
  while (cmp(a, pow2rat(k)) < 0) k--;
  while (cmp(a, pow2rat(k + 1)) >= 0) k++;
  return k;
}

/** Approximate a rational as a JS number (for drawing only). */
export function ratToNumber(a) {
  const shift = 60;
  const scaled = (a.n << BigInt(shift)) / a.d;
  return Number(scaled) / 2 ** shift;
}

/** Exact decimal expansion of a rational whose denominator divides a power of 10. */
export function ratToDecimalString(a, maxFrac = 40) {
  const neg = a.n < 0n;
  let n = neg ? -a.n : a.n;
  const ip = n / a.d;
  let rem = n % a.d;
  let frac = "";
  while (rem !== 0n && frac.length < maxFrac) {
    rem *= 10n;
    frac += (rem / a.d).toString();
    rem %= a.d;
  }
  return `${neg ? "-" : ""}${ip}${frac ? "." + frac : ""}${rem !== 0n ? "…" : ""}`;
}

/** Fixed number of fraction digits, truncated (with "…" when inexact). */
export function ratFixed(a, digits) {
  const neg = a.n < 0n;
  const n = neg ? -a.n : a.n;
  const scaled = (n * pow10n(digits)) / a.d;
  const exact = (n * pow10n(digits)) % a.d === 0n;
  let str = scaled.toString().padStart(digits + 1, "0");
  str = digits ? `${str.slice(0, -digits)}.${str.slice(-digits)}` : str;
  return `${neg ? "-" : ""}${str}${exact ? "" : "…"}`;
}

// ---------------------------------------------------------------------------
// Decimals d * 10^e (BigInt d), normalized without trailing zeros.

export function normDec(d, e) {
  if (d === 0n) return { d: 0n, e: 0 };
  while (d % 10n === 0n) { d /= 10n; e++; }
  return { d, e };
}
export const decToRat = ({ d, e }) => mul(rat(d), pow10rat(e));
export const decDigits = ({ d }) => (d < 0n ? -d : d).toString().length;
export const decEq = (a, b) => a.d === b.d && a.e === b.e;

/** Plain positional notation, e.g. 0.0999755859375 or 65504. */
export function decPlain({ d, e }) {
  const neg = d < 0n;
  let s = (neg ? -d : d).toString();
  if (e >= 0) s += "0".repeat(e);
  else if (-e >= s.length) s = "0." + "0".repeat(-e - s.length) + s;
  else s = s.slice(0, s.length + e) + "." + s.slice(s.length + e);
  return (neg ? "-" : "") + s;
}

/** Format like ECMAScript Number::toString (the shortest digits are given). */
export function jsFormat(dec) {
  const { d, e } = normDec(dec.d, dec.e);
  if (d === 0n) return "0";
  const digits = d.toString();
  const k = digits.length;
  const n = e + k; // decimal point position
  if (k <= n && n <= 21) return digits + "0".repeat(n - k);
  if (0 < n && n <= 21) return digits.slice(0, n) + "." + digits.slice(n);
  if (-6 < n && n <= 0) return "0." + "0".repeat(-n) + digits;
  const ex = n - 1;
  const mant = k === 1 ? digits : digits[0] + "." + digits.slice(1);
  return `${mant}e${ex < 0 ? "-" : "+"}${Math.abs(ex)}`;
}

/** Parse "0.1", "1e-3", "1/3", "pi". Returns a positive rational or null. */
export function parseRational(text) {
  const t = String(text).trim().toLowerCase().replace(/\s+/g, "");
  if (t === "pi" || t === "π") return rat(314159265358979323846264338327950288n, 10n ** 35n);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const d = BigInt(frac[2]);
    return d === 0n ? null : rat(BigInt(frac[1]), d);
  }
  const m = t.match(/^\+?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const f = m[2] || "";
  const exp = Number(m[3] || 0) - f.length;
  if (Math.abs(exp) > 400) return null;
  return decToRat({ d: BigInt((m[1] || "") + f || "0"), e: exp });
}

// ---------------------------------------------------------------------------
// Binary formats: v = c * 2^q with c < 2^P, q >= QMIN.

export const HALF = { name: "binary16", P: 11, QMIN: -24, QMAX: 5 };
export const DOUBLE = { name: "binary64", P: 53, QMIN: -1074, QMAX: 971 };

const cMin = (fmt) => 1n << BigInt(fmt.P - 1);

export const valueOf = ({ c, q }) => mul(rat(c), pow2rat(q));

/** Round a positive rational to the nearest value of the format (ties to even). */
export function roundToFormat(x, fmt = HALF) {
  if (x.n <= 0n) return { c: 0n, q: fmt.QMIN };
  let q = Math.max(floorLog2(x) - (fmt.P - 1), fmt.QMIN);
  const m = mul(x, pow2rat(-q));
  let c = floorRat(m);
  const frac = sub(m, rat(c));
  const half = cmp(frac, rat(1n, 2n));
  if (half > 0 || (half === 0 && (c & 1n) === 1n)) c += 1n;
  if (c === 1n << BigInt(fmt.P)) { c >>= 1n; q += 1; }
  if (q > fmt.QMAX) return { c: 0n, q, overflow: true };
  return { c, q };
}

export function neighbours({ c, q }, fmt = HALF) {
  const lo = c > cMin(fmt) || q === fmt.QMIN ? { c: c - 1n, q } : { c: (1n << BigInt(fmt.P)) - 1n, q: q - 1 };
  const hi = c + 1n === 1n << BigInt(fmt.P) ? { c: cMin(fmt), q: q + 1 } : { c: c + 1n, q };
  return { lo, hi: hi.q > fmt.QMAX ? null : hi };
}

/** The rounding interval: exact endpoints, closed iff c is even. */
export function intervalOf({ c, q }, fmt = HALF) {
  const irregular = c === cMin(fmt) && q > fmt.QMIN;
  const unit = pow2rat(q - 2);
  return {
    irregular,
    closed: (c & 1n) === 0n,
    vl: mul(rat(4n * c - (irregular ? 1n : 2n)), unit),
    v: mul(rat(4n * c), unit),
    vr: mul(rat(4n * c + 2n), unit),
  };
}

/** Is the rational x inside the rounding interval (respecting open/closed)? */
export function insideInterval(iv, x) {
  const a = cmp(iv.vl, x), b = cmp(x, iv.vr);
  return iv.closed ? a <= 0 && b <= 0 : a < 0 && b < 0;
}

// ---------------------------------------------------------------------------
// Schubfach with exact arithmetic (paper Fig. 7, optimal variant M = 1).

export function schubfachExact(cq, fmt = HALF) {
  const iv = intervalOf(cq, fmt);
  const width = sub(iv.vr, iv.vl);
  const k = floorLog10(width);
  const scale = pow10rat(-k);
  const Vl = mul(iv.vl, scale), V = mul(iv.v, scale), Vr = mul(iv.vr, scale);
  const inside = (x) => {
    const X = rat(x);
    const a = cmp(Vl, X), b = cmp(X, Vr);
    return iv.closed ? a <= 0 && b <= 0 : a < 0 && b < 0;
  };
  const s = floorRat(V), t = s + 1n;
  const trace = { ...cq, ...iv, k, width, Vl, V, Vr, s, t, checks: [] };
  const done = (path, d, e) => ({ ...trace, path, result: normDec(d, e), raw: { d, e } });
  if (s >= 10n) {
    const sp = s / 10n;
    const up = sp * 10n, wp = up + 10n;
    trace.sp = sp; trace.up = up; trace.wp = wp;
    const upin = inside(up);
    trace.checks.push({ name: "u′", tick: up, in: upin, coarse: true });
    if (upin) return done("u′", sp, k + 1);
    const wpin = inside(wp);
    trace.checks.push({ name: "w′", tick: wp, in: wpin, coarse: true });
    if (wpin) return done("w′", sp + 1n, k + 1);
  }
  const uin = inside(s), win = inside(t);
  trace.checks.push({ name: "u", tick: s, in: uin }, { name: "w", tick: t, in: win });
  if (uin && !win) return done("u", s, k);
  if (win && !uin) return done("w", t, k);
  const c2 = cmp(rat(2n * V.n, V.d), rat(s + t)); // 2V vs s + t
  trace.closer = c2 < 0 ? "u" : c2 > 0 ? "w" : "tie";
  if (c2 < 0) return done("u (closer)", s, k);
  if (c2 > 0) return done("w (closer)", t, k);
  return (s & 1n) === 0n ? done("tie → u (even)", s, k) : done("tie → w (even)", t, k);
}

/**
 * Independent oracle: scan rulers from coarse to fine; on the first ruler
 * with a tick inside the interval take the tick closest to v (ties: even).
 */
export function shortestOracle(cq, fmt = HALF) {
  const iv = intervalOf(cq, fmt);
  for (let j = floorLog10(iv.vr); ; j--) {
    const ticks = ticksInside(iv, j);
    if (!ticks.length) continue;
    let best = null, bestDist = null;
    for (const i of ticks) {
      const dist = sub(mul(rat(i), pow10rat(j)), iv.v);
      const ad = dist.n < 0n ? rat(-dist.n, dist.d) : dist;
      const c = bestDist ? cmp(ad, bestDist) : -1;
      if (c < 0 || (c === 0 && (i & 1n) === 0n)) { best = i; bestDist = ad; }
    }
    return normDec(best, j);
  }
}

/** Integers i with i * 10^j inside the interval. */
export function ticksInside(iv, j) {
  const unit = pow10rat(j);
  const lo = mul(iv.vl, rat(unit.d, unit.n));
  const hi = mul(iv.vr, rat(unit.d, unit.n));
  let a = floorRat(lo), b = floorRat(hi);
  if (!(iv.closed && cmp(lo, rat(a)) === 0)) a += 1n; // first tick > lo (or = lo when closed)
  if (!iv.closed && cmp(hi, rat(b)) === 0) b -= 1n;
  const out = [];
  for (let i = a; i <= b && out.length < 100000; i++) out.push(i);
  return out;
}

/** Count of ticks inside without enumerating. */
export function countInside(iv, j) {
  const unit = pow10rat(j);
  const lo = mul(iv.vl, rat(unit.d, unit.n));
  const hi = mul(iv.vr, rat(unit.d, unit.n));
  let a = floorRat(lo), b = floorRat(hi);
  if (!(iv.closed && cmp(lo, rat(a)) === 0)) a += 1n;
  if (!iv.closed && cmp(hi, rat(b)) === 0) b -= 1n;
  return b >= a ? b - a + 1n : 0n;
}

/** Exact decimal string of a binary16 (or any) value. */
export const exactString = (cq) => ratToDecimalString(valueOf(cq), 80);

/** All positive finite values of a (small) format, e.g. the 31,743 binary16 values. */
export function* allValues(fmt = HALF) {
  const cmin = cMin(fmt);
  for (let c = 1n; c < cmin; c++) yield { c, q: fmt.QMIN };
  for (let q = fmt.QMIN; q <= fmt.QMAX; q++) for (let c = cmin; c < 2n * cmin; c++) yield { c, q };
}

// ---------------------------------------------------------------------------
// Pocket game rounds (binary16).

export const ROUNDS = [
  { input: "0.1", label: "0.1" },
  { input: "0.3", label: "0.3" },
  { input: "1/3", label: "1/3" },
  { input: "pi", label: "π" },
  { input: "2.375", label: "2.375" },
  { input: "2.083984375", label: "2.083984375" },
  { input: "1", label: "1.0" },
  { input: "0.15625", label: "0.15625", bonus: true },
  { input: "4112", label: "4112", bonus: true },
];

export function roundInfo(input) {
  const x = parseRational(input);
  if (!x || x.n <= 0n) return { error: "Type a positive number, e.g. 0.1, 1/3 or 2.5e-3." };
  const cq = roundToFormat(x, HALF);
  if (cq.overflow) return { error: "Too large for half precision (the largest value is 65504)." };
  if (cq.c === 0n) return { error: "That rounds to zero in half precision (smallest value ≈ 5.96e-8)." };
  const tr = schubfachExact(cq, HALF);
  const nb = neighbours(cq, HALF);
  return { input, x, cq, tr, nb, exact: exactString(cq) };
}

/** The ruler spacings offered in the game: 10^E down to 10^(E-5), E = leading decade of v. */
export function offeredRulers(tr) {
  const E = floorLog10(valueOf(tr));
  return [0, 1, 2, 3, 4, 5].map((i) => E - i);
}

/** Does the decimal read back as the same binary16? If not, what does it read as. */
export function readBack(dec, cq, fmt = HALF) {
  const x = decToRat(dec);
  const iv = intervalOf(cq, fmt);
  const ok = insideInterval(iv, x);
  const back = roundToFormat(x, fmt);
  return { ok, back, backString: back.overflow ? "Infinity" : exactString(back) };
}

/** Grade an answer against the Schubfach result. */
export function grade(dec, tr) {
  const n = normDec(dec.d, dec.e);
  if (decEq(n, tr.result)) return { correct: true };
  const iv = intervalOf(tr, HALF);
  if (!insideInterval(iv, decToRat(n))) return { correct: false, why: "outside" };
  if (decDigits(n) > decDigits(tr.result)) return { correct: false, why: "longer" };
  return { correct: false, why: "farther" };
}

// ---------------------------------------------------------------------------
// binary64: decompose, exact and fast.

const dv = new DataView(new ArrayBuffer(8));
export function decompose64(v) {
  dv.setFloat64(0, v);
  const bits = dv.getBigUint64(0);
  const t = bits & ((1n << 52n) - 1n);
  const be = Number((bits >> 52n) & 0x7ffn);
  if (be === 0) return { c: t, q: -1074 };
  return { c: (1n << 52n) | t, q: be - 1075 };
}

export const exact64 = (v) => schubfachExact(decompose64(v), DOUBLE);

// Java's integer approximations (MathUtils.flog10pow2 etc.). Exact for the
// ranges used; the tests compare them against exact logarithms.
export const flog10pow2 = (e) => Math.floor((e * 661971961083) / 2 ** 41);
export const flog10threeQuartersPow2 = (e) => Math.floor((e * 661971961083 - 274743187321) / 2 ** 41);
export const flog2pow10 = (e) => Math.floor((e * 913124641741) / 2 ** 38);

const gCache = new Map();
/** Table entry for 10^e (e = -k): g = floor(10^e * 2^-r) + 1, r = floor(log2 10^e) - 125. */
export function gOf(e) {
  if (gCache.has(e)) return gCache.get(e);
  const r = flog2pow10(e) - 125;
  const beta = mul(pow10rat(e), pow2rat(-r));
  const g = floorRat(beta) + 1n;
  const entry = { g, r, beta };
  gCache.set(e, entry);
  return entry;
}

const MASK63 = (1n << 63n) - 1n;
const MASK127 = (1n << 127n) - 1n;
export const MODES = {
  trunc: "truncate",
  naive: "naive sticky bit",
  ro: "round to odd (ro′)",
};

/** The estimate of 4·X from the product p = g·cp (4X′ = p / 2^127). */
export function estimate(p, mode) {
  const hi = p >> 127n;
  if (mode === "trunc") return hi;
  if (mode === "naive") return hi | ((p & MASK127) !== 0n ? 1n : 0n);
  return hi | (((p >> 64n) & MASK63) !== 0n ? 1n : 0n); // Java's rop: bits 64..126
}

/** OpenJDK-style Schubfach (M = 1) with a selectable rounding of the products. */
export function fast64(v, mode = "ro") {
  const { c, q } = decompose64(v);
  const out = c & 1n;
  const cb = c << 2n, cbr = cb + 2n;
  const irregular = c === 1n << 52n && q > -1074;
  const cbl = irregular ? cb - 1n : cb - 2n;
  const k = irregular ? flog10threeQuartersPow2(q) : flog10pow2(q);
  const h = q + flog2pow10(-k) + 2;
  const { g, r } = gOf(-k);
  const H = BigInt(h);
  const pl = g * (cbl << H), p = g * (cb << H), pr = g * (cbr << H);
  const vbl = estimate(pl, mode), vb = estimate(p, mode), vbr = estimate(pr, mode);
  const s = vb >> 2n, t = s + 1n;
  const tr = { c, q, irregular, out, cb, cbl, cbr, k, h, g, r, pl, p, pr, vbl, vb, vbr, s, t, mode };
  const ret = (path, d) => ({ ...tr, path, raw: { d, e: k }, result: normDec(d, k), text: jsFormat(normDec(d, k)) });
  if (s >= 10n) {
    const sp10 = (s / 10n) * 10n, tp10 = sp10 + 10n;
    const upin = vbl + out <= sp10 << 2n;
    const wpin = (tp10 << 2n) + out <= vbr;
    Object.assign(tr, { sp10, tp10, upin, wpin });
    if (upin !== wpin) return ret(upin ? "u′" : "w′", upin ? sp10 : tp10);
  }
  const uin = vbl + out <= s << 2n;
  const win = (t << 2n) + out <= vbr;
  Object.assign(tr, { uin, win });
  if (uin !== win) return ret(uin ? "u" : "w", uin ? s : t);
  const c2 = vb - ((s + t) << 1n);
  tr.closer = c2 < 0n ? "u" : c2 > 0n ? "w" : "tie";
  const away = c2 > 0n || (c2 === 0n && (s & 1n) === 1n);
  if (c2 === 0n) return ret(away ? "tie → w (even)" : "tie → u (even)", away ? t : s);
  return ret(away ? "w (closer)" : "u (closer)", away ? t : s);
}

/** Exact ro(4X) for a rational X: 4X if that is an even integer, else the odd integer between. */
export function roExact(X) {
  const x4 = rat(4n * X.n, X.d);
  const f = floorRat(x4);
  const isInt = x4.n % x4.d === 0n;
  return isInt && (f & 1n) === 0n ? f : f | 1n;
}

/** Distance of 2X to the nearest integer, as log2 (or -Infinity when 2X is an integer). */
export function log2DistToInteger(X) {
  const n2 = 2n * X.n, d = X.d;
  const r = ((n2 % d) + d) % d;
  if (r === 0n) return -Infinity;
  const dist = r < d - r ? r : d - r;
  return floorLog2(rat(dist, d)) + Math.log2(ratToNumber(mul(rat(dist, d), pow2rat(-floorLog2(rat(dist, d))))));
}

/** A random positive finite double from uniformly random bits. */
export function randomDouble(rand = Math.random) {
  for (;;) {
    dv.setUint32(0, Math.floor(rand() * 0x7ff00000));
    dv.setUint32(4, Math.floor(rand() * 2 ** 32));
    const v = dv.getFloat64(0);
    if (v > 0 && Number.isFinite(v)) return v;
  }
}

/** Run each rounding mode on n doubles; compare with the exact shortest (String(v)). */
export function fuzz(values) {
  const stats = {};
  for (const m of Object.keys(MODES)) stats[m] = { wrong: 0, noRoundTrip: 0, example: null };
  for (const v of values) {
    const want = String(v);
    for (const m of Object.keys(MODES)) {
      const got = fast64(v, m).text;
      if (got !== want) {
        const st = stats[m];
        st.wrong++;
        const rt = Number(got) === v;
        if (!rt) st.noRoundTrip++;
        if (!st.example || (!rt && st.example.rt)) st.example = { v: want, got, rt };
      }
    }
  }
  return stats;
}
