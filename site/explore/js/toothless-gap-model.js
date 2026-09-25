// Copyright (C) 2026 Toit contributors.
//
// Pure computation for the "Nothing lives in the gap" Toothless page.
// No DOM. Importable by node for tests.
//
// Two parts:
//  1. A toy Toothless: 8-bit significands, the same steps as continued.c,
//     with a cache whose fractions may only use denominators below 2^B.
//     Plain Number arithmetic; every product stays far below 2^53.
//  2. Facts about the real 63-bit table (bench/fraction_values.h), in BigInt.

// ---------------------------------------------------------------------------
// Small exact helpers

/** floor(log10(2^x)) for x >= 0, exact (x small). */
export function floorLog10Pow2(x) {
  return (2n ** BigInt(x)).toString().length - 1;
}

/** floor(log2(10^k)) for k >= 0, exact. */
export function floorLog2Pow10(k) {
  return (10n ** BigInt(k)).toString(2).length - 1;
}

/** Reduce a/b (Numbers or BigInts, same type). */
function gcd(a, b) {
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

/** Integer floor division for non-negative Numbers that are exact integers. */
function idiv(a, b) {
  return (a - (a % b)) / b;
}

// ---------------------------------------------------------------------------
// The toy format

export const TOY = Object.freeze({ p: 8, fMin: 128, fMax: 255, eMin: -30, eMax: 20 });
/** Every integer the toy multiplies by num or den is below 2^HORIZON_BITS. */
export const TOY_HORIZON_BITS = 14;
export const TOY_HORIZON = 2 ** TOY_HORIZON_BITS;

/** alpha_k = 2^(e_k) / 10^k, reduced: 2^(e_k - k) / 5^k. Numbers (k <= 20). */
export function toyAlpha(k) {
  const ek = floorLog2Pow10(k);
  return { k, ek, n: 2 ** (ek - k), d: 5 ** k };
}

/**
 * Stern–Brocot descent toward x = xn/xd (0 < x <= 1), taking mediants while
 * the mediant's denominator stays below `limit`.
 * Returns the bracket (left a/b < x < right c/d, with bc - ad = 1), the
 * steps taken, and whether x itself was reached (then left = right = x).
 */
export function sternBrocot(xn, xd, limit) {
  let a = 0, b = 1, c = 1, d = 0;
  const steps = [];
  for (;;) {
    const mn = a + c, md = b + d;
    if (md >= limit) return { left: [a, b], right: [c, d], steps, exact: false, next: [mn, md] };
    const s = Math.sign(mn * xd - xn * md);
    if (s === 0) {
      steps.push({ mediant: [mn, md], dir: "=" });
      return { left: [mn, md], right: [mn, md], steps, exact: true, next: null };
    }
    if (s < 0) { a = mn; b = md; steps.push({ mediant: [mn, md], dir: "R" }); }
    else { c = mn; d = md; steps.push({ mediant: [mn, md], dir: "L" }); }
  }
}

/** Group an L/R path into runs: [{dir, n}]. */
export function runsOf(steps) {
  const runs = [];
  for (const s of steps) {
    if (s.dir === "=") continue;
    const last = runs[runs.length - 1];
    if (last && last.dir === s.dir) last.n++;
    else runs.push({ dir: s.dir, n: 1 });
  }
  return runs;
}

/** Continued-fraction terms of a positive rational n/d (Numbers). */
export function continuedFraction(n, d) {
  const terms = [];
  while (d) {
    const q = Math.floor(n / d);
    terms.push(q);
    [n, d] = [d, n - q * d];
  }
  return terms;
}

/**
 * Toy cache entry k at budget B: the end of the Farey bracket of alpha_k
 * (denominators < 2^B) that is closer to alpha_k. Tags as in the real table:
 * higher = stand-in above alpha, lower = stand-in below alpha.
 */
export function toyEntry(k, B) {
  const al = toyAlpha(k);
  const sb = sternBrocot(al.n, al.d, 2 ** B);
  if (sb.exact) return { k, num: sb.left[0], den: sb.left[1], higher: 0, lower: 0, exact: true, alpha: al, bracket: sb };
  const [a, b] = sb.left, [c, d] = sb.right;
  // distance comparison: alpha - a/b vs c/d - alpha, cross-multiplied.
  // (x - a/b) * b*d*xd  vs  (c/d - x) * b*d*xd
  const leftGap = (al.n * b - a * al.d) * d;
  const rightGap = (c * al.d - al.n * d) * b;
  const useLeft = leftGap <= rightGap;
  const [num, den] = useLeft ? [a, b] : [c, d];
  return { k, num, den, higher: useLeft ? 0 : 1, lower: useLeft ? 1 : 0, exact: false, alpha: al, bracket: sb };
}

/** Exact toy entry (the true alpha_k). */
export function toyExactEntry(k) {
  const al = toyAlpha(k);
  const g = gcd(al.n, al.d);
  return { k, num: al.n / g, den: al.d / g, higher: 0, lower: 0, exact: true, alpha: al };
}

/** Cache factory: entries memoised per budget; B = Infinity means exact. */
export function toyCache(B) {
  const memo = new Map();
  return (k) => {
    if (!memo.has(k)) memo.set(k, B === Infinity ? toyExactEntry(k) : toyEntry(k, B));
    return memo.get(k);
  };
}

/** Is toy float f*2^e a "power of two" with a closer lower neighbour? */
export function toyIsPow2(f, e) {
  return f === TOY.fMin && e > TOY.eMin;
}

/**
 * The toy Toothless, a line-by-line mirror of continued.c.
 * Every comparison is logged as a question "X vs Y*num/den", where X is an
 * integer on the decimal side and Y one on the binary side.
 * Returns { ok, D, x, questions, ... } with output D * 10^x (D may have
 * trailing zeros), or ok=false when the toy cannot produce digits.
 */
export function toyToothless(f, e, cache) {
  const pow2 = toyIsPow2(f, e);
  let exact = 2 * f, up = 2 * f + 1, low = 2 * f - 1, eb = e - 1;
  if (pow2) { up *= 2; exact *= 2; low = 2 * low + 1; eb--; }
  let k, ek, num, den, higher, lower, entry, inverted;
  if (eb < 0) {
    const nk = floorLog10Pow2(-eb) + 1;
    k = -nk; ek = -floorLog2Pow10(nk);
    entry = cache(nk); inverted = true;
    num = entry.den; den = entry.num; higher = entry.lower; lower = entry.higher;
  } else {
    k = floorLog10Pow2(eb + 1); ek = floorLog2Pow10(k);
    entry = cache(k); inverted = false;
    num = entry.num; den = entry.den; higher = entry.higher; lower = entry.lower;
  }
  const diff = eb - ek;
  const lowS = low * 2 ** diff, upS = up * 2 ** diff, exactS = exact * 2 ** diff;
  const odd = f & 1;
  let um = upS * num, lm = lowS * num;
  if (odd && !(higher | lower)) { um -= 1; lm += 1; } else { um -= higher; lm += lower; }
  const questions = [];
  const base = { f, e, k, ek, diff, inverted, entryK: entry.k, num, den, higher, lower, lowS, upS, exactS, odd, pow2, questions };
  // R_full = floor(um / den): "the largest n with n*den <= um".
  let uf = idiv(um, den);
  questions.push({ kind: "floor", X: uf, Y: upS, answer: uf });
  if (uf <= 0) return { ...base, ok: false };
  let dd = 1, dexp = k;
  while (dd * 10 <= uf) { dexp++; dd *= 10; }
  let R = 0, last = 0;
  for (;;) {
    const i = idiv(uf, dd);
    last = i; R += i * dd;
    const stop = R * den >= lm;
    questions.push({ kind: "stop", X: R, Y: lowS, answer: stop });
    if (stop) break;
    uf %= dd; dd = idiv(dd, 10); dexp--;
    if (dd === 0) return { ...base, ok: false };
  }
  const em = exactS * num;
  let fixed = false;
  const above = R * den > em;
  questions.push({ kind: "above", X: R, Y: exactS, answer: above });
  if (above) {
    for (;;) {
      const down = 2 * R * den > 2 * em + dd * den;
      questions.push({ kind: "round", X: 2 * R - dd, Y: 2 * exactS, answer: down });
      if (!down) break;
      R -= dd; last--;
    }
    const tie = 2 * R * den === 2 * em + dd * den;
    questions.push({ kind: "tie", X: 2 * R - dd, Y: 2 * exactS, answer: tie });
    if (higher && tie) { R -= dd; last--; }
    else if (last % 2 !== 0 && !higher && !lower && tie) { R -= dd; last--; }
    if (pow2) {
      const below = R * den < lm;
      questions.push({ kind: "fix", X: R, Y: lowS, answer: below });
      if (below) { last++; fixed = true; }
    }
  }
  const D = idiv(R, dd) + (fixed ? 1 : 0);
  return { ...base, ok: last >= 0 && last <= 9, D, x: dexp, R, dd, lastDigit: last };
}

/** Strip trailing zeros: D*10^x -> {D, x}. */
export function normalizeDec(D, x) {
  if (D === 0) return { D, x };
  while (D % 10 === 0) { D /= 10; x++; }
  return { D, x };
}

// Exact rational helpers for the reference (BigInt, scaled by 2^40).
const SCALE = 40n;
function toyInterval(f, e) {
  const pow2 = toyIsPow2(f, e);
  const E = BigInt(e) + SCALE; // >= 10
  const V = BigInt(f) << E;
  const H = V + (1n << (E - 1n));
  const L = V - (pow2 ? (1n << (E - 2n)) : (1n << (E - 1n)));
  return { V, H, L, closed: (f & 1) === 0 };
}
/** c*10^j scaled by 2^40, as a fraction {n, d} of BigInts. */
function scaledDec(c, j) {
  const two = 1n << SCALE;
  if (j >= 0) return { n: BigInt(c) * 10n ** BigInt(j) * two, d: 1n };
  return { n: BigInt(c) * two, d: 10n ** BigInt(-j) };
}

/** Does D*10^x read back as toy float f*2^e (round to nearest, ties to even)? */
export function toyReadsBack(f, e, D, x) {
  const { H, L, closed } = toyInterval(f, e);
  const { n, d } = scaledDec(D, x);
  if (closed) return n >= L * d && n <= H * d;
  return n > L * d && n < H * d;
}

/**
 * Exact shortest-then-closest reference for the toy (ties: even digit).
 * Returns normalised {D, x}.
 */
export function toyReference(f, e) {
  const { V, H, L, closed } = toyInterval(f, e);
  const inside = (c, j) => {
    const { n, d } = scaledDec(c, j);
    return closed ? n >= L * d && n <= H * d : n > L * d && n < H * d;
  };
  // Start with a power of ten above H.
  let j = 0;
  while (scaledDec(1, j).n <= H * scaledDec(1, j).d) j++;
  for (; j > -40; j--) {
    // candidates c with c*10^j in [L, H]: c from ceil(L/10^j) to floor(H/10^j)
    const p = scaledDec(1, j); // 10^j * 2^40 as n/d
    // c*p.n/p.d >= L  <=>  c >= L*p.d/p.n
    const cLo = (L * p.d + p.n - 1n) / p.n;
    const cHi = (H * p.d) / p.n;
    let best = null;
    for (let c = cLo; c <= cHi; c++) {
      if (c <= 0n || !inside(Number(c), j)) continue;
      // distance |c*10^j - V| compared as |c*p.n - V*p.d|
      const dist = c * p.n - V * p.d;
      const ad = dist < 0n ? -dist : dist;
      if (best === null || ad < best.ad || (ad === best.ad && c % 2n === 0n)) best = { c, ad };
    }
    if (best) return normalizeDec(Number(best.c), j);
  }
  throw new Error("no reference");
}

/** Format D*10^x as a plain decimal string (toy values are modest). */
export function formatDec(D, x) {
  const s = String(D);
  if (D === 0 || s === "0") return "0";
  if (x >= 0) return s + "0".repeat(x);
  const point = s.length + x;
  if (point > 0) return s.slice(0, point) + "." + s.slice(point);
  return "0." + "0".repeat(-point) + s;
}

/** Exact value of toy float f*2^e as a decimal string. */
export function toyValueString(f, e) {
  if (e >= 0) return String(BigInt(f) << BigInt(e));
  // f * 2^e = f * 5^-e / 10^-e ; formatDec works on the digit string.
  const s = formatDec((BigInt(f) * 5n ** BigInt(-e)).toString(), e);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Which toy float does decimal D*10^x read back as? {f, e} or null (out of range). */
export function toyReadBackAs(D, x) {
  for (let e = TOY.eMin; e <= TOY.eMax; e++) {
    for (let f = TOY.fMin; f <= TOY.fMax; f++) {
      if (toyReadsBack(f, e, D, x)) return { f, e };
    }
  }
  return null;
}

/**
 * Run one toy float at budget B and compare with the exact reference.
 * status: "ok" | "gap" (a question fell into the gap) | "tie" (a question
 * landed exactly on alpha, only possible in the toy) | "fail" (no output).
 * category (when wrong): "roundtrip" | "long" | "closest".
 */
export function toyCase(f, e, cacheB, cacheExact, ref) {
  const run = toyToothless(f, e, cacheB);
  const want = ref || toyReference(f, e);
  let got = null, correct = false;
  if (run.ok) {
    got = normalizeDec(run.D, run.x);
    correct = got.D === want.D && got.x === want.x;
  }
  if (correct) return { f, e, correct: true, run, got, want };
  let category = "roundtrip";
  if (got && toyReadsBack(f, e, got.D, got.x)) {
    category = String(got.D).length > String(want.D).length ? "long" : "closest";
  }
  const culprit = findCulprit(run, toyToothless(f, e, cacheExact));
  return { f, e, correct: false, run, got, want, category, culprit, status: culprit ? culprit.type : "fail" };
}

/**
 * Walk the questions of the stand-in run and of the exact run in lockstep;
 * the first one answered differently is the culprit. Its fraction is
 * returned in alpha's orientation: P/Q compared with alpha_k = 2^ek/10^k.
 */
export function findCulprit(run, exactRun) {
  const qa = run.questions, qe = exactRun.questions;
  for (let i = 0; i < qa.length && i < qe.length; i++) {
    const a = qa[i], t = qe[i];
    if (a.kind === t.kind && a.X === t.X && a.Y === t.Y && a.answer === t.answer) continue;
    let X = a.X, Y = a.Y;
    if (a.kind === "floor") X = Math.max(a.answer, t.answer); // the n one run accepts and the other rejects
    // In alpha orientation: positive k compares X/Y with alpha; negative k compares Y/X.
    const [P, Q] = run.inverted ? [Y, X] : [X, Y];
    const al = toyAlpha(run.entryK);
    const g = gcd(P, Q);
    const sAlpha = Math.sign(P * al.d - al.n * Q); // question vs alpha
    const ent = { num: run.inverted ? run.den : run.num, den: run.inverted ? run.num : run.den };
    const sStand = Math.sign(P * ent.den - ent.num * Q); // question vs stand-in
    const type = sAlpha === 0 ? "tie" : "gap";
    return {
      index: i, kind: a.kind, X, Y, P, Q, reduced: [P / g, Q / g], type,
      standIn: [ent.num, ent.den], alpha: [al.n, al.d], k: run.entryK,
      between: sAlpha !== 0 && sStand !== 0 && sAlpha !== sStand,
      sAlpha, sStand,
    };
  }
  return null;
}

/** Precomputed references for every toy float, row-major by e then f. */
export function toyReferences() {
  const refs = [];
  for (let e = TOY.eMin; e <= TOY.eMax; e++) {
    for (let f = TOY.fMin; f <= TOY.fMax; f++) refs.push(toyReference(f, e));
  }
  return refs;
}

/** Run the whole toy at budget B. */
export function toySweep(B, refs = toyReferences()) {
  const cache = toyCache(B), exact = toyCache(Infinity);
  const cells = [];
  let i = 0, wrong = 0, ties = 0;
  const cats = { roundtrip: 0, long: 0, closest: 0 };
  for (let e = TOY.eMin; e <= TOY.eMax; e++) {
    for (let f = TOY.fMin; f <= TOY.fMax; f++) {
      const c = toyCase(f, e, cache, exact, refs[i++]);
      if (!c.correct) {
        wrong++;
        cats[c.category]++;
        if (c.status === "tie") ties++;
      }
      cells.push(c);
    }
  }
  return { B, cells, wrong, ties, cats, guaranteed: toyGuaranteed(B) };
}

/** The toy entries 1..10 that the toy floats use. */
export function toyEntriesUsed() {
  const ks = new Set();
  for (let e = TOY.eMin; e <= TOY.eMax; e++) {
    for (const f of [TOY.fMin, TOY.fMin + 1]) {
      const pow2 = toyIsPow2(f, e);
      const eb = e - 1 - (pow2 ? 1 : 0);
      ks.add(eb < 0 ? floorLog10Pow2(-eb) + 1 : floorLog10Pow2(eb + 1));
    }
  }
  return [...ks].sort((a, b) => a - b);
}

/**
 * Simplest fraction strictly between two distinct positive fractions
 * (smallest denominator, and also smallest numerator). BigInt in and out.
 * Continued-fraction method.
 */
export function simplestBetween(an, ad, bn, bd) {
  // ensure a < b
  if (an * bd > bn * ad) [an, ad, bn, bd] = [bn, bd, an, ad];
  // Stern–Brocot with bulk steps.
  let ln = 0n, ld = 1n, rn = 1n, rd = 0n;
  for (;;) {
    const mn = ln + rn, md = ld + rd;
    if (mn * ad <= an * md) {
      // mediant <= a: move left bound right by t steps: largest t with (ln + t rn)/(ld + t rd) <= a
      // (ln + t rn) ad <= an (ld + t rd)  <=>  t (rn ad - an rd) <= an ld - ln ad
      const A = rn * ad - an * rd, B = an * ld - ln * ad;
      const t = A > 0n ? B / A : 1n;
      ln += t * rn; ld += t * rd;
    } else if (mn * bd >= bn * md) {
      const A = bn * ld - ln * bd, B = rn * bd - bn * rd;
      const t = A > 0n ? B / A : 1n;
      rn += t * ln; rd += t * ld;
    } else {
      return [mn, md];
    }
  }
}

/** First fraction (simplest) strictly inside the toy gap of entry (k, B), or null if exact. */
export function toyFirstIntruder(k, B) {
  const ent = toyEntry(k, B);
  if (ent.exact) return null;
  const [n, d] = simplestBetween(BigInt(ent.num), BigInt(ent.den), BigInt(ent.alpha.n), BigInt(ent.alpha.d));
  return [Number(n), Number(d)];
}

/** Guaranteed at budget B: every used inexact entry's gap is clean below the horizon. */
export function toyGuaranteed(B) {
  for (const k of toyEntriesUsed()) {
    const q = toyFirstIntruder(k, B);
    if (q && q[1] < TOY_HORIZON) return false;
  }
  return true;
}

/**
 * Largest question denominator (alpha orientation) the toy asks entry k,
 * over every toy float and every budget in `budgets`.
 */
export function toyEntryHorizon(k, budgets) {
  let max = 0;
  for (const B of budgets) {
    const cache = toyCache(B);
    for (let e = TOY.eMin; e <= TOY.eMax; e++) {
      for (let f = TOY.fMin; f <= TOY.fMax; f++) {
        const r = toyToothless(f, e, cache);
        if (r.entryK !== k) continue;
        for (const q of r.questions) {
          const Q = r.inverted ? q.X : q.Y;
          if (Q > max) max = Q;
        }
      }
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// The story example: v = 183 * 2^-18, alpha = alpha_6 = 8192/15625.

export const STORY = Object.freeze({ f: 183, e: -18, k: 6, questionP: 367, questionQ: 700 });

// ---------------------------------------------------------------------------
// The real table (bench/fraction_values.h), tagged: num<<1 | higher, den<<1 | lower.

const TAGGED_NUM = [
  "2 8 20 80 400 1000 4000 20000",
  "80000 200000 1000000 4000000 10000000 80000000 200000000 800000000",
  "4000000000 10000000000 40000000000 200000000000 800000000000 2000000000000 10000000000000 40000000000000",
  "100000000000000 800000000000000 2000000000000000 8000000000000000 e1237f88aad0ea1e 2d071981bbc36206 47bd58966cbb0b37 79ce14e325cbfd73",
  "8b24f8514f20de3b 612fbf6281f3af92 590d6bb92866f4a1 6e8b5c57e19cbaaa 2c37be898d71e444 3d6a52e06a8fd73b bd27711fe4b12282 245b16edc55b6f94",
  "651c56e665a07582 98ea23ad4c3e13da 98ea23ad4c3e13da 71fe0294afb062ac c064581d56ca4ecf afef5f2134fa5eb2 387364e9738d109e 60585bb9ee21c6d6",
  "6d971a344ee8758e 957e86b65d30eedd ef30d78a2eb4b161 45784d4af81188b7 54867d83556d0a64 243d91de522b8487 e7f0725ba77ce9d 39fc1c96e9df3a71",
  "5ab20915d8acfb25 132de0f22d4b7d02 6b1435c5654576bb 4372269fe75caa2a 4372269fe75caa2a 1c99c8e4087da127 1c99c8e4087da127 c1de956dc2f2d155",
  "979a18f928a93b7a 6b4e99b320234c70 c9831397b5b63207 83638b99dbe0d6b2 3e1689f64cb22ef1 3c6d1affd628918e 574170f08314facb 72220e963dab8172",
  "b2a388f0ca47f7d2 7f08c0a859cacc52 47fd405b15010453 950d5a60dbb51c52 950d5a60dbb51c52 88949226935c0488 893c02fad1001294 b3f979103d3d06ab",
  "5530a34295aec616 884dd20422b13cf0 5b71643bb91aa3a9 7a96696193ba0aca 35c77cd4b4f04b02 ac17f5dbdc9a89a 89acc4afe3aed48 44d66257f1d76a40",
  "c716e2d594cb8f11 3159b5626414930f 62b36ac4c829261d 186834281506b2cf 8f46f1ef9a0a9e7f 4fe137630ed553ff 5575b900422a999a 533a51f494087dc3",
  "126e62d3dc1cfc3a ebeb57649b0c9c8 94a58e76ba3a69e2 59aab89d937742c3 4516456a87f1dffd 4ea4676f1d2acbcf 5ecf8d943a140a6b 5ecf8d943a140a6b",
  "5ecf8d943a140a6b 194ff4a3cdea18b 93957df8f1dd3976 388099eccc277aec 2f253523b31510a3 25b75db628dda6e9 592f5af72c4b8314 8306e88a30546d2b",
  "d1a4a74380871511 bb253ffb4ce053bf 552491f33dad46ac 883a831ec9153de0 6c715b1bbbb493b 6ba097c1e1b8560e 561a1301816044d8 95b96b2017e380db",
  "65d2d725e0ed5206 251db9be482b27cb b1c3a288b7f35ff5 8e361ba093291991 71c4e2e6dc20e141 60ff76dc91fbeb2a 76f2eb1263bf44f 2f945e075b194ed",
  "9ddf7d11537fb17f 7e4c640ddc662799 e2fd267be5997aa 38bf499ef9665ea8 4458ba13fa070485 78d4361d8fb296d3 3d05e0e0f02a314d aec23483a27be2e8",
  "377772667e8a4eb b353ab8588f273f2 3a0d501081349d0b b9c4336803db903 75eb288c86a0928a 17956e8281535082 9954726d5026b69b c621bd2c445cc6e9",
  "482f4b56c2dac013 7331d088f4fa2be3 5bf47b16fddaeaf4 49c3c168f79c5a85 3b030120c616aed1 82ba941a7c2a307b b56a3e3d499e1c3e 6c12c90aaa904377",
  "6c12c90aaa904377 c0ad6c947e63c6ad 394f9a1e5eaaf4bc 7f477f2c6ba6d2e8 a324a87b4b3b335 95bf2a6e276ba62e 6f855cba13e65477 8922be28c05fd4e9",
  "825b833ab00836a5 495008549ed3a60a 754cda20fe1f7010 857d5a9615e52f07 51aef2b8fd05ff26 3b5f0cce6996a2aa 5eeadf81fc660517 684b5995c606206f",
  "aeadc4ed5d1c4679 b211dcc061cddf83 88aebc8130c995a7 57ebff45394449a 57ebff45394449a 15faffd14e511268 7a788803cac88e15 61fa06696f06d811",
  "968c6757a4053a8f 18374730a77bfa70 b26592cf97d3cdc3 59ec4c301aa678da 1a060869502dfedc 8be2178ea50c574b 63bac4057e5552ea 7bd25c8afbf6558b",
  "621f97b853d31f8a 958693700b5bd82 958693700b5bd82 648d6ac92bf3f94b 6e58d950f23bf2a8 1f252b16ba9d3087 45972d998504d836 37ac247ad0d0acf8",
  "2f0c76516cf111cb 863f3e065d538607 863f3e065d538607 7561c890cdae64e6 49cd5ca19823432b 49cd5ca19823432b 25c313d742da83d6 78d6a5e40921a5e",
  "78d6a5e40921a5e 78d6a5e40921a5e 78d6a5e40921a5e bc56ffd907292ed7 5600dbed0515b21e 36de5f279c0c9365 c770e76dd831adee 463b5b13faf16081",
  "3f7aa8651f5cb4c2 c770e76dd831adee 60785aa727a566f2 68456399cbeda6fe 536ab614a3248598 42bbc4dd4f506ae0 4cb66232d66433bf 657391bd03a950f0",
  "46e4283ce508ada6 5785d20c77501107 62f4eb777a850208 31da4423b54d93ea 4531e1f20a8e173e c90b94d04a80b412 f2596fe5ff1882e 6a4ebddfaf01729d",
  "e674a7d68b7643d0 33aac5ede90c716d 1167326daf74bb7a a2b8be42026013df a2b8be42026013df 583bfa9f65225be6 249fa2ea7d27f9ba 1d4c825530ecc7c8",
  "75320954c3b31f20 8f8881931979ef47 1cb4e6b70518630f 3969cd6e0a30c61d 67055c265cc94803 bd7278ca11755782 a4d5603d61420cd1 7f95e8ce16bbb517",
  "6220ab2d33b2be0a 4e8088f0f6289808 82f3f0e9746c311a 4e4b0bb93a4607bf 9c961772748c0f7d 17f351c169831c77 494dfbb97a7c462a 494dfbb97a7c462a",
  "8259d378f0321d74 d08fb8c180502f20 8ec50c1986a9e843 8ec50c1986a9e843 b2c18873d1c66885 8f0139f6416b86d1 20150118b7378bb6 c5d131387719a3e7",
  "6f2eae22905f21b1 5a3ebeb3a47a2b55 d749fcb0c02a579d 41e2cc00376df776 58283c2f3c0b68b7 b020f7758067f22a af62f3d1a1ac7522 313a1be446aa723e",
  "313a1be446aa723e c4e86f911aa9c8f8 1281626f5471f217 5734b0003ad6d5a6 5734b0003ad6d5a6 919c19bd6c2c0417 2aab6590c8c7b0fc 44456f4e0e0c4e60",
  "aa09b5d88e667f02 86b5210836edca0a db801fc908dc492a 591f7d28a4ef85a3 6db2a9c14a1f3e17 6db2a9c14a1f3e17 7f3dbed056e46ad3 82caae55ee7e2c2a",
  "26fdfe64404d148c 81a7d2542461736b 81a7d2542461736b e1ea8880d3578afe 38ea11efe707c994 3c842e3c8d32a35b d9172e77d2d5df43 6af8623f65b6166",
  "d5f0c47ecb6c2cc 5d45155eb07f8377 ba8a2abd60ff06ed 47fb2adf0f83ff06 47fb2adf0f83ff06 96223b9fcc6d047c 8eba5af762c0965c f429e8486e5fb96",
  "186a973a716ff8f0 72caf2f42b7011b6 2a7ddcc5fd09977e 84adaeff7c41668d 6a248bff969ab871 7d5be7accddc0588 c8930c47afc66f40 61b292480c55cc1a",
  "740f2dece80cc18f a3e5756e2bb14c9e 859347e8ff113466 5e3526aebfe0bc34 c449ed9c59319072 193200c91e338020 3f317d1188213d02 cd4569f82110c772",
  "74e2de79dd2b3de6 90a3ccf1cf747806 6b3c7b832247e957 15727f1a3a0e61df 2ae4fe34741cc3bd f6d1c2976cc065d1 4142698fa8983923 99345356de85dce6",
  "ea007b696214a67e c6539fdc506ba68a 44349c69b7cfee12 4576a716af9d8ece b195ff3575df57ee"
].join(" ").split(" ");
const TAGGED_DEN = [
  "2 a 32 fa 4e2 186a 7a12 2625a",
  "bebc2 3b9aca 12a05f2 5d21dba 1d1a94a2 9184e72a 2d79883d2 e35fa931a",
  "470de4df82 16345785d8a 6f05b59d3b2 22b1c8c1227a ad78ebc5ac62 3635c9adc5dea 10f0cf064dd592 54b40b1f852bda",
  "1a784379d99db42 84595161401484a 295be96e64066972 cecb8f27f4200f3a e354fb1716b633d9 38d53ec5c5ad8cf7 712f6831eff7323a f037d0121cced9ec",
  "ab823c40af8eda06 95bd521affa78f9f ab823c40af8eda06 85101dcb28304ca5 42880ee594182653 73826785203c4d0e de597b7e12d30163 356b89fc794b5a2b",
  "b9b605ebb5e5cfc3 af89906b60d37161 db6bf48639084db9 cc76a9df9e14db1f d7adc9951201675c f6899a2d923e1993 62e16546318e9963 6979a97bc6af82a7",
  "95f828f6af9e2065 ffb86441b24616fa ffb86441b24616fa 5cd6a0960da45a3a 8d329eea0c5fbd1f 25d63c1d85095804 12eb1e0ec284ac02 5e979649cc975c0a",
  "5c789e075b5347f6 187182ab5d9f5e8b aa962b8ac4ceaeaa 864f34e550494e31 53f1810f522dd0df 2c7ee501c4c79bf8 379e9e4235f982f6 eba2a20858c39f3e",
  "e653d3600220214d cbc9ca1650eeab93 ef2f128f9d4439b2 c2f077f7fdd9480b 73260f8d70f2a6ea 460aa8175e7d5ca3 7e6ce96af58ff97c ceb5de95299d65f5",
  "ca3643546c0084df b3bf3bf2550280f1 7f53954ffcf044fa a4c4443d0dbeabc9 cdf5554c512e56bb ebe7fc4d1e156357 9425bf2ca4a26663 f2db9b1de106ff44",
  "8fb1c1925bf29543 8fb1c1925bf29543 78804e0ecc098966 c9edafd1e9693f75 375dc97df02f8a49 dd7725f7c0be293 dd7725f7c0be293 45353bdd6c3b6cdb",
  "fa3382535778ff12 4d866afcccc1c4f4 c1d00b77ffe46c62 1df44108539c4cbe dbccdd8fc1284dec 992db77021046d68 666ca6958c4d6653 7cafc643338b6eee",
  "2283fb8888b82cb5 1141fdc4445c165b d97942da9a42baab a3fb21869593dda2 4ef72f57a366dcb6 705bdadf11e9461c a952ffa35406d640 69d3dfc6148445e8",
  "8448d7b799a55762 2c256f057b71274 a0df405ef1852f3f 4cfcb3830b1dc08f 504c149944e42efc 28260a4ca272177e 76abaf874741a9c3 d9eec3abb952028a",
  "d9eec3abb952028a f32e891b30f8a208 8a4bcb1d4a043f63 8a4bcb1d4a043f63 899c5a712bf5dd2 aab84c7ad7d577c7 aab84c7ad7d577c7 b98af15695074fec",
  "9dba7e82eaf27fcf 47de271d3c455632 d720a7eaf4c0754e d720a7eaf4c0754e d720a7eaf4c0754e 72a25a3de2406687 afb86da74dfabf4 57dc36d3a6fd5fa",
  "b6346aee2263888e b6346aee2263888e 199552b1fb23eb45 3ff54ebcf3d9cc2b 604a19fa78d5839a d4c932fb64c859da 432a53ba3dd8ce0a f06fc3694b4860d3",
  "5f63df39e9f3a56 c0c05389993bbc29 4dff4aa47f6b12b8 137fd2a91fdac4ae 7bc67f9af3e9dc91 1ef19fe6bcfa7725 fb7a313bbd6d3848 cb19285eb728c5fe",
  "5c7e220829e619a2 b880d8f045866444 5c0cffd572261be3 5c4d47a0ceea77b2 5c4d47a0ceea77b2 ff987dc81d496eb8 ddaf3d2a54e23399 a514225f430d54f8",
  "ce592af713d0aa36 e5edbb2f6f0179e2 557d29514583b95b ed52b48d7edfb023 be1f1a08dcb2eea da231c67b05581b5 cb111370d8812ada 9c1150d25855f5da",
  "b9712a756870f6fa 825d7263aa3e54df 825d7263aa3e54df b97273676e4efef0 8dd87e95e3de6b43 407001ada233f2a7 80c569bd65a0ba82 b0dd915c6a079038",
  "b924180197b5497a ebeb39b83b3d2132 e25b9c1ed21193be 5b00f696abff709 71c1343c56ff4cb 238c6052db2fc7f3 7bcaf08cf96c2a82 7bcaf08cf96c2a82",
  "edc55e2b753891a2 2fcea778a6e3e5c3 dc1eb9f0ab87feea 8ab1538f4ef0d1cf 322bf8e5f9c1557f a88db9df6d773530 96366fe9981afc97 e920163642ad4028",
  "7376b1ab114f4527 dbefe4f58254fd1 112ebde32e2ea3c5 738c799fb514f754 9e815457a88990bf 37ec108cdda7bf62 4e184e81f63712b3 4e184e81f63712b3",
  "527f54f3faf2a9de 931f38b23a1de7c0 b7e706dec8a561b0 c8ffc743b3325433 4efc0ae3bc266c50 62bb0d9cab300764 3f25759679681801 7e4aeb2cf2d0301",
  "9ddda5f82f843c1 c5550f763b654b1 7b5529a9e51f4ef f048be02849e65a8 8927698ad05b2ab7 6d6095c37d884a72 f87bc3b5fcc90a01 6d6095c37d884a72",
  "7b9371b71f742eef f2a8dd1fb8dc53c5 92b8064043a0ce63 c63a93ab0443b3e5 631d49d58221d9f3 631d49d58221d9f3 8e6b575a93247034 75b7b345a7d6f083",
  "66d268d3db56ae03 9eae3ffe9a37a762 7021b75afb26d793 469cc6609f48acbb 7a82f399921e6249 de790b4b250114ad 14f3956d3212b843 b7cf2db28ced1cae",
  "f90a778c3e02f447 45cad0ae62f0857e 1d62a3539213f4cd abb91a6a3fa606a8 d6a76104cf8f8852 917e16a65c623f13 25be6106adac8293 25be6106adac8293",
  "bcb7e521645e8cdb 9074c1392ad651b0 241d304e4ab5946c 5a48f8c3bac5f30e ca81a7ad2d47efd8 e8bee06a34d0802d fd2211987899ebce f4ea30cf3eb7234a",
  "75bab59b3da4eb5f 75bab59b3da4eb5f f57caf3b69d8c9df 5bbb3262498f7c6c e553fdf5b7e6b70e 2bd883086e897bdc 53df9f6c26a487f9 68d78747304da9f7",
  "e909d6905c497bc3 e909d6905c497bc3 c7681beb55b7c2b0 f94222e62b25b35c c30dc05787ca6252 c30dc05787ca6252 36b2d38ec326748f d2cb2ffeb1fcfada",
  "94183e339439aeee 964205c5a1c552a6 e008ebed2a30b5a6 55b3fc630a675c07 8f576031ecfb415e b2fcf1e995dc72b7 decacebbdf7f7467 4e2a751693ca3af1",
  "61b5125c38bcc9ad f444ade68dd7f82f 1cb206abb00c89c2 a90839b0ad1267e1 69a5240e6c2b80ed dc7f73d52dc69c6e 50c4b7a98a088fcb 50c4b7a98a088fcb",
  "fb7466127ef77d49 f9026aea9b0d1509 fd9821d566649881 80b51d21dd416db2 c606aa5e0c570cd0 7bc42a7ac7b66802 b373046325b9f252 e6921edb6048cf0d",
  "2af63154baa88997 b29191c386f0c9b8 df35f63468acfc26 f314c88e75e3bf23 4c8c5fdb2666e9f7 65bdbcb58b6f0c4e e41c41b7b357d052 8c8011491a49c2d",
  "15f402b36c1b866f 5fb5178a9d1d4374 ef44bada88c928a2 7368eab36a804bb1 482192b022902f4f bc0eebc3ef931e0b df7a2b2385b7e9e3 1dde04a75701a72f",
  "1dde04a75701a72f af8661d8fb2fbbf3 51371e476b8dfff7 9e7ea399a9512af6 9e7ea399a9512af6 e9fc6a2bfaf19a83 e9fc6a2bfaf19a83 8e77068cf8a8fe07",
  "d38cf565895ba31a bab7860b48e9922b be37b246c0b44f89 a7b1f43768d78a37 da60e699640ea7eb 2309d5508404ec9b 6dd9f55f8c0a6d71 df04eee7c78d2db5",
  "9ebd91c3852d1207 f58a4501baf6d11d 71c706b0338efe30 1c71c1ac0ce3bf8c 471c642e20395ede ffbcb5a0f65bcb06 548588db68cf2dea f807ea3e42e838a9",
  "ecc6231856dda8c9 fad85c07bdeadca1 6bd566d89e24ed83 894730eed0f07613 db5906f402a34c17"
].join(" ").split(" ");

const LIMIT63 = 1n << 63n;

/** Real cache entry i (0..324), untagged, with its tags. BigInt. */
export function realEntry(i) {
  const tn = BigInt("0x" + TAGGED_NUM[i]), td = BigInt("0x" + TAGGED_DEN[i]);
  const ek = floorLog2Pow10(i);
  return { k: i, ek, num: tn >> 1n, den: td >> 1n, higher: Number(tn & 1n), lower: Number(td & 1n), an: 1n << BigInt(ek), ad: 10n ** BigInt(i) };
}

export const REAL_ENTRIES = 325;

/** Bit length of a positive BigInt as a real number log2 (approximate, for display). */
export function log2Big(x) {
  const s = x.toString(2);
  const top = s.slice(0, 53);
  return Math.log2(parseInt(top, 2)) + (s.length - top.length);
}

/**
 * Farey bracket of an/ad (< 1) at a denominator limit, BigInt, bulk steps.
 * Returns [[a,b],[c,d]] with a/b < x < c/d, b, d < limit, bc - ad = 1.
 */
export function fareyBracketBig(an, ad, limit) {
  let a = 0n, b = 1n, c = 1n, d = 0n;
  for (;;) {
    const mn = a + c, md = b + d;
    if (md >= limit) return [[a, b], [c, d]];
    const s = mn * ad - an * md;
    if (s === 0n) return [[mn, md], [mn, md]];
    if (s < 0n) {
      // move left bound right: largest t with (a + t c)/(b + t d) < x and b + t d < limit
      const A = c * ad - an * d, B = an * b - a * ad; // both > 0
      let t = (B - 1n) / A;
      const tl = (limit - 1n - b) / d;
      if (t > tl) t = tl;
      if (t < 1n) t = 1n;
      a += t * c; b += t * d;
    } else {
      const A = an * b - a * ad, B = c * ad - an * d;
      let t = (B - 1n) / A;
      const tl = b === 0n ? t : (limit - 1n - d) / b;
      if (t > tl) t = tl;
      if (t < 1n) t = 1n;
      c += t * a; d += t * b;
    }
  }
}

/**
 * Everything section 6 states about the real table, computed from the table.
 * For each inexact entry: the stand-in's side (tag and true side), whether it
 * is one end of the Farey bracket of alpha at denominator limit 2^63, the
 * simplest fraction strictly between stand-in and alpha, and whether it is
 * the closest fraction under 2^63 / a best approximation in the draft's sense.
 */
export function realTableFacts() {
  const rows = [];
  for (let i = 0; i < REAL_ENTRIES; i++) {
    const r = realEntry(i);
    const cmp = r.num * r.ad - r.an * r.den; // sign of stand-in - alpha
    const exact = cmp === 0n;
    const row = { k: i, exact, higher: r.higher, lower: r.lower, tagOk: exact ? (r.higher === 0 && r.lower === 0) : (cmp > 0n ? r.higher === 1 && r.lower === 0 : r.lower === 1 && r.higher === 0),
      numBits: r.num.toString(2).length, denBits: r.den.toString(2).length,
      closeEnough: r.den + 2n <= 2n * r.num && r.num + 2n <= 2n * r.den };
    if (!exact) {
      const [[a, b], [c, d]] = fareyBracketBig(r.an, r.ad, LIMIT63);
      const isLeft = a === r.num && b === r.den, isRight = c === r.num && d === r.den;
      row.bracketEnd = isLeft || isRight;
      row.fareyDet = b * c - a * d;
      const [sn, sd] = simplestBetween(r.num, r.den, r.an, r.ad);
      row.gapNumLog2 = log2Big(sn);
      row.gapDenLog2 = log2Big(sd);
      row.gapNum = sn; row.gapDen = sd;
      // closest among fractions with denominator < 2^63: the nearer bracket end
      const leftDist = (r.an * b - a * r.ad) * d; // (x - a/b) scaled by b d ad
      const rightDist = (c * r.ad - r.an * d) * b;
      const other = isLeft ? rightDist : leftDist, mine = isLeft ? leftDist : rightDist;
      row.closest = mine <= other;
      // draft's "best approximation": no fraction with a smaller denominator is closer.
      // The only candidate that can beat it is the other bracket end (any fraction
      // outside the bracket is farther than that end), so compare with it when its
      // denominator is smaller.
      const otherDen = isLeft ? d : b;
      row.draftBest = !(otherDen < r.den && other < mine);
      row.otherEnd = isLeft ? [c, d] : [a, b];
      row.relErrLog2 = log2Big(cmp < 0n ? -cmp : cmp) - log2Big(r.an * r.den); // log2 |s - alpha| / alpha
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Largest integer continued.c ever multiplies by num or den (all doubles):
 * shifted boundaries are below 2^57 (up = 2f+1 < 2^54, or 4f+2 = 2^54+2 for
 * a power of two, shifted by at most 3), R < 2^58, and 2R - dd, 2*exact < 2^59.
 * Returns the maximum shift observed over every binary exponent, so the test
 * can confirm the "at most 3".
 */
export function realShiftRange() {
  let lo = Infinity, hi = -Infinity;
  for (let ue = -1074; ue <= 971; ue++) {
    for (const pow2 of [false, true]) {
      const e = ue - 1 - (pow2 ? 1 : 0);
      let fe;
      if (e < 0) {
        const nk = Math.floor((315652 * -e) / 1048576) + 1;
        fe = -Math.floor((3483294 * nk) / 1048576);
      } else {
        const k = Math.floor((315652 * (e + 1)) / 1048576);
        fe = Math.floor((3483294 * k) / 1048576);
      }
      const diff = e - fe;
      if (diff < lo) lo = diff;
      if (diff > hi) hi = diff;
    }
  }
  return { lo, hi };
}

/**
 * The largest integers continued.c ever puts into a question, over every
 * binary exponent (the largest significand of each exponent is the worst
 * case, and powers of two are included). Returns bit lengths.
 */
export function realQuestionBits() {
  let maxBoundary = 0n, maxR = 0n, maxTwice = 0n;
  for (let be = 0; be <= 2046; be++) {
    for (const pow2 of [false, true]) {
      if (pow2 && be === 0) continue;
      const sig = be === 0 ? (1n << 52n) - 1n : (pow2 ? 1n << 52n : (1n << 53n) - 1n);
      const ue = be === 0 ? -1074 : be - 1075;
      let up = 2n * sig + 1n, exact = 2n * sig, e = ue - 1;
      if (pow2) { up *= 2n; exact *= 2n; e--; }
      let num, den, fe;
      if (e < 0) {
        const nk = Math.floor((315652 * -e) / 1048576) + 1;
        fe = -Math.floor((3483294 * nk) / 1048576);
        const r = realEntry(nk); num = r.den; den = r.num;
      } else {
        const k = Math.floor((315652 * (e + 1)) / 1048576);
        fe = Math.floor((3483294 * k) / 1048576);
        const r = realEntry(k); num = r.num; den = r.den;
      }
      const s = BigInt(e - fe);
      const upS = up << s, twiceExact = (exact << s) * 2n;
      const R = (upS * num) / den;
      if (upS > maxBoundary) maxBoundary = upS;
      if (R > maxR) maxR = R;
      const twice = 2n * R > twiceExact ? 2n * R : twiceExact;
      if (twice > maxTwice) maxTwice = twice;
    }
  }
  const bits = (x) => x.toString(2).length;
  return { boundary: bits(maxBoundary), R: bits(maxR), twice: bits(maxTwice) };
}
