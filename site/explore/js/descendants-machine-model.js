// Copyright (C) 2026 Toit contributors.
//
// Pure model for the "four-integer machine + route map" page (no DOM).
//
// 1. Burger & Dybvig's free-format algorithm (PLDI 1996, Table 1 + Fig. 3),
//    recorded as a list of frames, with four "rule switches".
// 2. David Gay's dtoa mode 0, classic bignum path (netlib dtoa.c compiled
//    without USE_BF96), recorded as a route through named stations.
// Both use exact BigInt arithmetic; doubles appear only where the original
// code uses doubles (the k estimates, the tens[] check, the small-integer path).

export const HIDDEN = 1n << 52n;
const MIN_E = -1074;

const POW10 = [1n];
export function pow10(k) {
  while (POW10.length <= k) POW10.push(POW10.at(-1) * 10n);
  return POW10[k];
}
export const pow2 = (e) => 1n << BigInt(e);
export const bitLength = (x) => (x <= 0n ? 0 : x.toString(2).length);

const view = new DataView(new ArrayBuffer(8));
/** Positive finite double -> { f, e, biased } with v = f * 2^e. */
export function decompose(v) {
  view.setFloat64(0, v);
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & (HIDDEN - 1n);
  if (biased === 0) return { f: frac, e: MIN_E, biased, bits };
  return { f: frac | HIDDEN, e: biased - 1075, biased, bits };
}

/** Approximate a/b (positive BigInts) as a Number, also for huge/tiny ratios. */
export function ratio(a, b) {
  if (a === 0n) return 0;
  const shift = bitLength(b) - bitLength(a) + 60;
  const q = shift >= 0 ? (a << BigInt(shift)) / b : a / (b << BigInt(-shift));
  return Number(q) * 2 ** -shift;
}

// ---------------------------------------------------------------------------
// Output helpers

/** Digits string + decimal-point position -> the string JS Number#toString prints. */
export function formatJs(digits, decpt) {
  const k = digits.length, n = decpt;
  if (k <= n && n <= 21) return digits + "0".repeat(n - k);
  if (0 < n && n <= 21) return digits.slice(0, n) + "." + digits.slice(n);
  if (-6 < n && n <= 0) return "0." + "0".repeat(-n) + digits;
  const e = n - 1;
  return digits[0] + (k > 1 ? "." + digits.slice(1) : "") + "e" + (e >= 0 ? "+" : "-") + Math.abs(e);
}

/** Shortest digits and decimal-point position from JS's own Number#toString. */
export function jsDigits(v) {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(v));
  let all = m[1] + (m[2] || "");
  let point = m[1].length + (m[3] ? +m[3] : 0);
  const lead = all.match(/^0*/)[0].length;
  all = all.slice(lead);
  point -= lead;
  return { digits: all.replace(/0+$/, ""), decpt: point };
}

/** Exact decimal expansion of a positive double (for "reads back as"). */
export function exactDecimal(v) {
  const { f, e } = decompose(v);
  if (e >= 0) return (f << BigInt(e)).toString();
  const num = f * 5n ** BigInt(-e); // f / 2^-e = f*5^-e / 10^-e
  let s = num.toString().padStart(-e + 1, "0");
  const ip = s.slice(0, s.length + e), fp = s.slice(s.length + e).replace(/0+$/, "");
  return fp ? `${ip}.${fp}` : ip;
}

/** Parse a user literal ("0.3", "1e23", "2^64", "2**-1074", "DBL_MAX", "-5"). */
export function parseInput(text) {
  const t = String(text).trim().replace(/[−–]/g, "-").replace(/\s+/g, "");
  if (!t) return NaN;
  if (/^dbl_max$/i.test(t)) return Number.MAX_VALUE;
  if (/^dbl_min$/i.test(t)) return 2.2250738585072014e-308;
  const p = /^(-?)2(?:\^|\*\*)\(?(-?\d+)\)?$/.exec(t);
  if (p) return (p[1] ? -1 : 1) * 2 ** Number(p[2]);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t) && !/^[+-]?(Infinity|NaN)$/.test(t)) return NaN;
  return Number(t);
}

// ---------------------------------------------------------------------------
// Part 1: Burger & Dybvig free-format, as frames.

export const BD_DEFAULTS = Object.freeze({ tiesEven: true, symBug: false, kFromV: false, tie: "up" });

// The JS transliteration shown next to the machine. `tag` links a line to frames;
// `alt` holds the text a switch puts in its place; `only` shows a line only when a
// switch is on.
export const BD_CODE = [
  { tag: "fn", text: "function freeFormat(f, e) {             // v = f × 2^e" },
  { tag: "ok", text: "  const lowOk = even(f), highOk = even(f); // reader: ties to even",
    alt: { tiesEven: "  const lowOk = false, highOk = false;   // strict reader" } },
  { tag: "decl", text: "  let r, s, mp, mm;          // v = r/s, half-gaps = mp/s and mm/s" },
  { tag: "t1", text: "  if (e >= 0 && f !== HIDDEN) {",
    alt: { symBug: "  if (e >= 0) {                     // BUG: no power-of-2 case" } },
  { tag: "t1", text: "    r = f * pow2(e) * 2n; s = 2n; mp = mm = pow2(e);" },
  { tag: "t2", text: "  } else if (e >= 0) {                   // f = 2^52: gap below halves",
    alt: { symBug: "  } else if (false) {" } },
  { tag: "t2", text: "    r = f * pow2(e) * 4n; s = 4n; mp = pow2(e + 1); mm = pow2(e);" },
  { tag: "t3", text: "  } else if (e === -1074 || f !== HIDDEN) {",
    alt: { symBug: "  } else if (true) {                // BUG" } },
  { tag: "t3", text: "    r = f * 2n; s = pow2(1 - e); mp = mm = 1n;" },
  { tag: "t4", text: "  } else {                               // f = 2^52: gap below halves" },
  { tag: "t4", text: "    r = f * 4n; s = pow2(2 - e); mp = 2n; mm = 1n;" },
  { tag: "t4", text: "  }" },
  { tag: "est", text: "  let k = Math.ceil((e + len(f) - 1) * Math.log10(2) - 1e-10);" },
  { tag: "scale", text: "  if (k >= 0) s *= pow10(k);" },
  { tag: "scale", text: "  else { r *= pow10(-k); mp *= pow10(-k); mm *= pow10(-k); }" },
  { tag: "fix", text: "  if (highOk ? r + mp >= s : r + mp > s) k += 1; // k was low: skip ×10",
    alt: { kFromV: "  if (r >= s) k += 1;           // CHANGED: k from v, not from high" } },
  { tag: "fix10", text: "  else { r *= 10n; mp *= 10n; mm *= 10n; }" },
  { tag: "gen", text: "  const digits = [];" },
  { tag: "gen", text: "  for (;;) {                  // generate" },
  { tag: "div", text: "    const d = r / s; r %= s;" },
  { tag: "tc1", text: "    const tc1 = lowOk ? r <= mm : r < mm;           // d is inside" },
  { tag: "tc2", text: "    const tc2 = highOk ? r + mp >= s : r + mp > s;  // d+1 is inside" },
  { tag: "more", text: "    if (!tc1 && !tc2) {                // neither: keep d, go on" },
  { tag: "more", text: "      digits.push(d); r *= 10n; mp *= 10n; mm *= 10n; continue;" },
  { tag: "more", text: "    }" },
  { tag: "both", text: "    if (tc1 && tc2)                    // both: take the nearer" },
  { tag: "both", text: "      digits.push(2n * r < s ? d : d + 1n);           // tie: up",
    alt: { tie: "      digits.push(2n * r < s || (2n * r === s && even(d)) ? d : d + 1n);" } },
  { tag: "one", text: "    else digits.push(tc1 ? d : d + 1n);" },
  { tag: "carry", text: "    if (digits.at(-1) === 10n) k = carry(digits, k);  // NEW: 9+1 ripples", only: "kFromV" },
  { tag: "ret", text: "    return { digits, k };                // v ≈ 0.d1d2… × 10^k" },
  { tag: "end", text: "  }" },
  { tag: "end", text: "}" },
];

/** Code lines for a given switch setting (alt text applied, `only` lines filtered). */
export function bdCode(opts = BD_DEFAULTS) {
  const o = { ...BD_DEFAULTS, ...opts };
  const on = { tiesEven: !o.tiesEven, symBug: o.symBug, kFromV: o.kFromV, tie: o.tie === "even" };
  const lines = [];
  for (const line of BD_CODE) {
    if (line.only && !on[line.only]) continue;
    let text = line.text, changed = false;
    for (const [sw, alt] of Object.entries(line.alt || {})) if (on[sw]) { text = alt; changed = true; }
    lines.push({ tag: line.tag, text, changed });
  }
  return lines;
}

/**
 * Run B&D free-format on v > 0 with the given switches.
 * Returns { frames, digits, k, decpt, text, ... }. Every frame carries a copy of
 * the machine state { r, s, mp, mm, k, digits } and the code tags it executes.
 */
export function bdRun(v, opts = {}) {
  const o = { ...BD_DEFAULTS, ...opts };
  const { f, e } = decompose(v);
  const even = (f & 1n) === 0n;
  const lowOk = o.tiesEven && even, highOk = o.tiesEven && even;
  const pow2case = f === HIDDEN && !o.symBug;
  let r, s, mp, mm, row;
  if (e >= 0 && !pow2case) { row = 1; r = f * pow2(e) * 2n; s = 2n; mp = mm = pow2(e); }
  else if (e >= 0) { row = 2; r = f * pow2(e) * 4n; s = 4n; mp = pow2(e + 1); mm = pow2(e); }
  else if (e === MIN_E || !pow2case) { row = 3; r = f * 2n; s = pow2(1 - e); mp = mm = 1n; }
  else { row = 4; r = f * 4n; s = pow2(2 - e); mp = 2n; mm = 1n; }
  // Would the correct Table 1 have used the power-of-two row?
  const realPow2 = f === HIDDEN && e > MIN_E;
  const frames = [];
  const digits = [];
  let k = 0;
  const snap = (extra) => frames.push({ r, s, mp, mm, k, digits: digits.slice(), ...extra });

  snap({ phase: "init", tags: ["ok", "decl", `t${row}`], row, f, e, even, lowOk, highOk, realPow2 });

  const n = e + bitLength(f) - 1;
  const est = Math.ceil(n * Math.log10(2) - 1e-10) || 0; // (|| 0 turns -0 into 0)
  k = est;
  snap({ phase: "estimate", tags: ["est"], n, est });

  if (est >= 0) s *= pow10(est);
  else { const t = pow10(-est); r *= t; mp *= t; mm *= t; }
  snap({ phase: "scale", tags: ["scale"], est });

  const low = o.kFromV ? r >= s : highOk ? r + mp >= s : r + mp > s;
  if (low) k = est + 1;
  else { r *= 10n; mp *= 10n; mm *= 10n; }
  snap({ phase: "fixup", tags: low ? ["fix"] : ["fix", "fix10"], low, est });

  let carried = false;
  for (let guard = 0; guard < 800; guard++) {
    const before = r;
    const d = Number(r / s);
    r %= s;
    const tc1 = lowOk ? r <= mm : r < mm;
    const tc2 = highOk ? r + mp >= s : r + mp > s;
    if (!tc1 && !tc2) {
      digits.push(d);
      snap({ phase: "digit", tags: ["div", "tc1", "tc2", "more"], d, before, tc1, tc2, emitted: d, stop: false,
        r0: r, mp0: mp, mm0: mm });
      r *= 10n; mp *= 10n; mm *= 10n;
      frames.at(-1).after = { r, mp, mm };
      continue;
    }
    let out, why, tieCase = false;
    if (tc1 && tc2) {
      const c = 2n * r < s ? -1 : 2n * r > s ? 1 : 0;
      tieCase = c === 0;
      if (c < 0) out = d;
      else if (c > 0) out = d + 1;
      else out = o.tie === "even" ? (d % 2 === 0 ? d : d + 1) : d + 1;
      why = "both";
    } else {
      out = tc1 ? d : d + 1;
      why = tc1 ? "low" : "high";
    }
    digits.push(out);
    snap({ phase: "digit", tags: ["div", "tc1", "tc2", tc1 && tc2 ? "both" : "one"], d, before, tc1, tc2,
      emitted: out, stop: true, why, tieCase, r0: r, mp0: mp, mm0: mm });
    if (out === 10) {
      // Only reachable when k was chosen from v: 9 + 1 ripples to the left.
      digits.pop();
      let carry = true;
      while (carry && digits.length && digits.at(-1) === 9) digits.pop();
      if (digits.length) digits[digits.length - 1] += 1;
      else { digits.push(1); k += 1; }
      carried = true;
      snap({ phase: "carry", tags: ["carry"] });
    }
    break;
  }
  while (digits.length > 1 && digits.at(-1) === 0) digits.pop();
  const digitStr = digits.join("");
  const text = formatJs(digitStr, k);
  const back = Number(text);
  snap({ phase: "done", tags: ["ret"] });
  return {
    frames, digits: digitStr, k, decpt: k, text, est, row, realPow2, carried,
    readsBack: back, roundTrips: back === v, opts: o,
  };
}

// ---------------------------------------------------------------------------
// Part 2: Gay's dtoa, mode 0, classic bignum path, as a route through stations.

const TENS = Array.from({ length: 23 }, (_, i) => Number("1e" + i));
const hi0bits32 = (x) => 32 - bitLength(x);
const words32 = (x) => Math.max(1, Math.ceil(bitLength(x) / 32));

/** Number of bignum multiplications pow5mult spends on 5^k (cached 5^4, 5^8, …). */
export function pow5multCount(k) {
  if (k <= 0) return 0;
  let n = k & 3 ? 1 : 0;
  for (let m = k >> 2; m; m >>= 1) if (m & 1) n++;
  return n;
}
/** The factors pow5mult multiplies together for 5^k, e.g. 324 -> [4, 64, 256]. */
export function pow5multParts(k) {
  const parts = [];
  if (k & 3) parts.push(k & 3);
  let p = 4;
  for (let m = k >> 2; m; m >>= 1, p *= 2) if (m & 1) parts.push(p);
  return parts;
}

/**
 * dtoa(v, mode 0) along the classic path. Returns
 *   { digits, decpt, route: [stationId...], st: { id: data }, loop: [...] }.
 */
export function dtoaRun(v) {
  const route = [];
  const st = {};
  const visit = (id, data = {}) => { route.push(id); st[id] = data; };
  visit("entry", { v });
  const neg = v < 0 || Object.is(v, -0);
  const u = Math.abs(v);
  if (!Number.isFinite(u) || u === 0) {
    const special = Number.isNaN(u) ? "NaN" : u === 0 ? "0" : "Infinity";
    visit("special", { neg, special, decpt: u === 0 ? 1 : 9999 });
    visit("special_out", { special });
    return { digits: special, decpt: u === 0 ? 1 : 9999, neg, route, st, loop: [], special: true };
  }
  visit("special", { neg, special: null });

  // d2b: v = b * 2^be with b odd.
  const { f, e, biased } = decompose(u);
  let b = f, be = e;
  while ((b & 1n) === 0n) { b >>= 1n; be++; }
  const bbits = bitLength(b);
  const denorm = biased === 0;
  visit("d2b", { f, e, b, be, bbits, denorm, stripped: be - e });

  // ds: tangent-line estimate of log10(v).
  const i = denorm ? bbits + be - 1 : biased - 1023;
  const x = denorm ? Number(b) / 2 ** (bbits - 1) : Number(f) / 2 ** 52;
  const ds = (x - 1.5) * 0.289529654602168 + 0.1760912590558 + i * 0.301029995663981;
  let k = Math.trunc(ds);
  if (ds < 0 && ds !== k) k--;
  const khat = k;
  // True floor(log10 v), exactly, for the inspector.
  const V = { n: e >= 0 ? f << BigInt(e) : f, d: e >= 0 ? 1n : pow2(-e) };
  const ge10 = (j) => (j >= 0 ? V.n >= V.d * pow10(j) : V.n * pow10(-j) >= V.d);
  let trueK = khat + 1;
  while (!ge10(trueK)) trueK--;
  visit("ds", { x, i, ds, khat, trueK });

  let k_check = 1;
  if (k >= 0 && k <= 22) {
    const fired = u < TENS[k];
    if (fired) k--;
    k_check = 0;
    visit("tens", { khat, fired, k, ten: TENS[khat] });
  } else {
    visit("kset", { khat });
  }

  // Small integer: exact double arithmetic.
  if (be >= 0 && k <= 14) {
    visit("sifork", { be, k, small: true });
    visit("smallint", { k, ds: TENS[k] });
    let w = u, out = "";
    const rows = [];
    for (;;) {
      const L = Math.trunc(w / TENS[k]);
      const before = w;
      w -= L * TENS[k];
      out += L;
      rows.push({ before, L, rest: w });
      if (!w) break;
      w *= 10;
    }
    visit("siloop", { rows });
    const digits = out.replace(/0+$/, "") || "0";
    visit("retc", { digits, decpt: k + 1 });
    return { digits, decpt: k + 1, neg, route, st, loop: [], khat, k };
  }
  visit("sifork", { be, k, small: false });

  // Exponent bookkeeping: v/10^k = b 2^b2 5^b5 / (2^s2 5^s5).
  const j = bbits - i - 1;
  let b2, s2, b5, s5;
  if (j >= 0) { b2 = 0; s2 = j; } else { b2 = -j; s2 = 0; }
  if (k >= 0) { b5 = 0; s5 = k; s2 += k; } else { b2 -= k; b5 = -k; s5 = 0; }
  let m2 = b2;
  const m5 = b5;
  const half = denorm ? be + 1075 : 1 + 53 - bbits;
  b2 += half; s2 += half;
  const pre = { b2, s2, b5, s5, m2, m5, half };
  visit("book", { ...pre, j });

  // Sizes if the powers of two were not cancelled (and no dshift).
  const ghostB = bitLength((b * 5n ** BigInt(b5)) << BigInt(b2));
  const ghostS = bitLength(5n ** BigInt(s5) << BigInt(s2));

  let cancel = 0;
  if (m2 > 0 && s2 > 0) { cancel = Math.min(m2, s2); b2 -= cancel; m2 -= cancel; s2 -= cancel; }
  visit("cancel", { cancel, b2, s2, m2 });

  let mhi = 1n;
  if (b5 > 0) {
    if (m5 > 0) { mhi = 5n ** BigInt(m5); b = mhi * b; }
    if (b5 - m5) b *= 5n ** BigInt(b5 - m5);
  }
  let S = 5n ** BigInt(s5);
  visit("pow5", { b5, s5, parts: pow5multParts(b5 || s5), mults: pow5multCount(b5 || s5),
    which: b5 > 0 ? "b" : s5 > 0 ? "S" : null, bits: bitLength(b5 > 0 ? mhi : S) });

  const spec = f === HIDDEN && biased >= 2;
  if (spec) { b2 += 1; s2 += 1; }
  visit("specj", { spec });
  if (spec) visit("spec", {});

  // dshift: make S's top 32-bit word have exactly 4 leading zero bits.
  let sh = hi0bits32(S >> BigInt(32 * (words32(S) - 1))) - 4;
  if (s2 > 0) sh -= s2;
  sh &= 31;
  b2 += sh; m2 += sh; s2 += sh;
  if (b2 > 0) b <<= BigInt(b2);
  if (s2 > 0) S <<= BigInt(s2);
  const topS = S >> BigInt(32 * (words32(S) - 1));
  visit("dshift", { sh, b2, s2, m2, bBits: bitLength(b), SBits: bitLength(S), ghostB, ghostS,
    topLead: hi0bits32(topS), words: words32(S) });

  let kfixFired = false;
  if (k_check) {
    visit("kfixj", { active: true });
    if (b < S) {
      k--; b *= 10n; mhi *= 10n; kfixFired = true;
      visit("kfix", { k });
    }
  } else visit("kfixj", { active: false });

  if (m2 > 0) mhi <<= BigInt(m2);
  let mlo = mhi;
  if (spec) mhi = mlo << 1n;
  st.dshift.mhiBits = bitLength(mhi);
  st.dshift.mloBits = bitLength(mlo);
  st.dshift.bFinal = bitLength(b);

  const even = (f & 1n) === 0n; // !(word1(&u) & 1)
  const out = [];
  const loop = [];
  let exit = null, carry = false;
  const roundoff = () => {
    carry = true;
    while (out.length && out.at(-1) === 9) out.pop();
    if (!out.length) { out.push(1); k++; } else out[out.length - 1]++;
  };
  for (let it = 1; it < 800; it++) {
    const n = words32(S);
    const top = BigInt(32 * (n - 1));
    const qest = Number((b >> top) / ((S >> top) + 1n)); // quorem's first guess
    let dig = Number(b / S);
    b %= S;
    const jj = b < mlo ? -1 : b > mlo ? 1 : 0;
    const delta = S - mhi;
    const j1 = delta < 0n ? 1 : b < delta ? -1 : b > delta ? 1 : 0;
    const row = { it, dig, qest, fixed: qest !== dig, j: jj, j1, bBits: bitLength(b) };
    loop.push(row);
    if (j1 === 0 && even) {
      exit = "A"; row.exit = "A";
      if (dig === 9) { out.push(9); roundoff(); row.emit = "9→carry"; break; }
      if (jj > 0) dig++;
      out.push(dig); row.emit = String(dig); break;
    }
    if (jj < 0 || (jj === 0 && even)) {
      exit = "B"; row.exit = "B";
      if (b !== 0n && j1 > 0) {
        const c = 2n * b > S ? 1 : 2n * b < S ? -1 : 0;
        row.twoB = c;
        if (c > 0 || (c === 0 && dig & 1)) {
          if (dig === 9) { out.push(9); roundoff(); row.emit = "9→carry"; break; }
          dig++;
        }
      }
      out.push(dig); row.emit = String(dig); break;
    }
    if (j1 > 0) {
      exit = "C"; row.exit = "C";
      if (dig === 9) { out.push(9); roundoff(); row.emit = "9→carry"; break; }
      out.push(dig + 1); row.emit = String(dig + 1); break;
    }
    row.exit = "D"; row.emit = String(dig);
    out.push(dig);
    b *= 10n;
    if (mlo === mhi) mlo = mhi = mhi * 10n;
    else { mlo *= 10n; mhi *= 10n; }
  }
  visit("quorem", { iterations: loop.length, fixes: loop.filter((r) => r.fixed).length });
  if (loop.length > 1) route.push("loopD");
  visit("exit" + exit, { row: loop.at(-1) });
  if (carry) visit("round9", { k });
  let digits = out.join("");
  digits = digits.replace(/0+$/, "");
  visit("ret", { digits, decpt: k + 1 });
  return { digits, decpt: k + 1, neg, route, st, loop, khat, k, exit, carry, kfixFired, spec };
}

// ---------------------------------------------------------------------------
// Presets (all checked in test/explore-descendants-machine.test.js)

export const MACHINE_PRESETS = [
  { label: "0.1", value: 0.1 },
  { label: "0.3", value: 0.3 },
  { label: "1e23", value: 1e23 },
  { label: "2^64", value: 2 ** 64 },
  { label: "2237844659592604.25", value: 2237844659592604.25 },
  { label: "5e-324", value: 5e-324 },
  { label: "DBL_MAX", value: Number.MAX_VALUE },
];

export const ROUTE_PRESETS = [
  { label: "0.3", value: 0.3 },
  { label: "1e23", value: 1e23 },
  { label: "5e-324", value: 5e-324 },
  { label: "987.654", value: 987.654 },
  { label: "123456", value: 123456 },
  { label: "1e-300", value: 1e-300 },
  { label: "2^64", value: 2 ** 64 },
  { label: "DBL_MAX", value: Number.MAX_VALUE },
];
