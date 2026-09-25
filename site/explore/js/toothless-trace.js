// Copyright (C) 2026 Toit contributors.
// Toothless, approach B ("Follow one double"): DOM and interaction.

import * as M from "./toothless-trace-model.js";

const $ = (id) => document.getElementById(id);
const SVG = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------------ formatting

const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");
const sub = (s) => `<sub>${s}</sub>`;
const minus = (s) => String(s).replace(/-/g, "−");

/** Group a BigInt's digits in threes with thin spaces. */
function group(x) {
  const s = x.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function num(x, cls = "") { return `<span class="tt-num ${cls}">${group(x)}</span>`; }
function bits(x) { return M.bitLength(x); }
function pow10Html(k) { return `10<sup>${minus(k)}</sup>`; }
function pow2Html(e) { return `2<sup>${minus(e)}</sup>`; }
function sci(log10) {
  if (log10 === -Infinity) return "0";
  const e = Math.floor(log10);
  const m = 10 ** (log10 - e);
  return `${m.toFixed(1)}×10<sup>${minus(e)}</sup>`;
}
function sciText(log10) {
  if (log10 === -Infinity) return "0";
  const e = Math.floor(log10);
  return `${(10 ** (log10 - e)).toFixed(1)}e${e}`;
}
function hex(x) { return "0x" + x.toString(16).padStart(16, "0"); }

// ------------------------------------------------------------------ presets

const PRESETS = [
  { label: "6.62607015e-34", text: "6.62607015e-34", note: "Planck constant (default)" },
  { label: "0.1", text: "0.1", note: "exact entry" },
  { label: "1e23", text: "1e23", note: "upper boundary exactly 1e23" },
  { label: "5e-324", text: "5e-324", note: "walk 7→6→5" },
  { label: "max double", text: "1.7976931348623157e308", note: "17 digits, walk 8→7" },
  { label: "hard 3.29…e-79", text: "3.294312317590731e-79", note: "margin 5.7e-34" },
  { label: "tie 2⁵⁰+¼", text: "1125899906842624.25", note: "exact tie, round half to even" },
  { label: "2⁻¹⁰²²", text: "2.2250738585072014e-308", note: "power of two, smallest normal" },
];
const DEFAULT_TEXT = PRESETS[0].text;

const HARD_CASES = [
  { text: "3.294312317590731e-79", why: "fails at 44, 47, 48 and 50 bits" },
  { text: "3.7299018480438463e+228", why: "fails at 44, 45 and 50 bits" },
  { text: "6.1359116592542813e-266", why: "fails at 51–53 bits" },
  { text: "6.62607015e-34", why: "the default" },
  { text: "5e-324", why: "smallest subnormal" },
];

// ------------------------------------------------------------------ state

const state = { text: DEFAULT_TEXT, v: 6.62607015e-34, step: 0, budget: 64, trace: null, steps: [] };

function tableFor(budget) { return budget >= 64 ? M.ORIGINAL : M.buildTable(budget); }
function budgetLabel(budget) { return budget >= 64 ? "original 63-bit table" : `rebuilt, ${budget}-bit fractions`; }

function parseInput(text) {
  const t = text.trim().replace(/−/g, "-").replace(/_/g, "");
  let v;
  if (/^0x[0-9a-f]{1,16}$/i.test(t)) v = M.fromBits(BigInt(t));
  else if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) v = Number(t);
  else throw new Error("Type a decimal number such as 0.3 or 1e-300, or a 64-bit pattern like 0x3FB999999999999A.");
  if (Number.isNaN(v)) throw new Error("NaN has no digits to print.");
  v = Math.abs(v);
  if (v === 0) throw new Error("Zero is handled before Toothless runs. Try a nonzero number.");
  if (!Number.isFinite(v)) throw new Error("Infinity is handled before Toothless runs. Try a finite number.");
  return v;
}

// ------------------------------------------------------------------ step model

const STAGES = [
  ["decode", "Decode"], ["bounds", "Boundaries"], ["scale", "Pick k"], ["shift", "Shift"],
  ["products", "p± tweaks"], ["upper", "R"], ["digits", "Digits"], ["walk", "Closest"], ["output", "Output"],
];

function buildSteps(t) {
  const steps = [];
  steps.push({ stage: "decode", row: -1 });
  steps.push({ stage: "bounds", row: -1 });
  steps.push({ stage: "scale", row: -1 });
  steps.push({ stage: "shift", row: -1 });
  steps.push({ stage: "products", row: -1 });
  t.rows.forEach((r, i) => {
    const stage = r.kind === "upper" ? "upper" : r.kind === "prefix" ? "digits" : "walk";
    steps.push({ stage, row: i });
  });
  steps.push({ stage: "output", row: t.rows.length - 1 });
  return steps;
}

// ------------------------------------------------------------------ card text

function tagName(t) { return t.exactEntry ? "exact" : t.higher ? "higher" : "lower"; }

function cardHtml(t, step) {
  const d = t.d, b = t.bnd, s = t.sc;
  const odd = d.odd;
  const row = step.row >= 0 ? t.rows[step.row] : null;
  switch (step.stage) {
    case "decode": {
      const fieldE = d.biased, frac = d.fraction;
      return card("Decode", `Split the bits`, `
        <p>The double <strong>${fmtV(t.v)}</strong> has the bit pattern <code>${hex(d.bits)}</code>: exponent field ${fieldE}, fraction ${hex(frac).replace(/^0x0{0,3}/, "0x")}.
        ${d.biased ? "The hidden 1 bit is added in front of the fraction." : "The exponent field is 0, so this is a subnormal: no hidden bit, exponent −1074."}
        As an exact product, <em>v</em> = <em>f</em> · 2<sup><em>e</em></sup>:</p>`,
        [["f", "significand", `${num(d.f, "tt-bin")} <span class="tt-dim">(${bits(d.f)} bits, ${odd ? "odd" : "even"})</span>`],
         ["e", "binary exponent", minus(d.e)],
         ["", "", d.powerOfTwo ? `<span class="tt-flag">fraction bits are 0: a power of two</span>` : ""],
        ], `<p>${odd ? "<em>f</em> is odd, so the ends of the rounding interval are <strong>excluded</strong>: a decimal exactly on a midpoint would read back as the even neighbour." : "<em>f</em> is even, so the ends of the rounding interval are <strong>included</strong>: a decimal exactly on a midpoint reads back as <em>v</em>."}</p>`);
    }
    case "bounds": {
      const pow2 = d.powerOfTwo;
      const extra = pow2
        ? `<p>The fraction bits are zero, so the neighbour below is only half as far away as the one above. The code quadruples instead of doubling: <em>f</em><sup>−</sup> = 4<em>f</em> − 1, 4<em>f</em>, <em>f</em><sup>+</sup> = 4<em>f</em> + 2, and <em>e<sub>b</sub></em> = <em>e</em> − 2. The interval is lopsided: ¼ below, ½ above.${d.biased === 1 ? ` <span class="tt-flag">Special case:</span> 2<sup>−1022</sup> is the smallest normal. Its lower neighbour is subnormal and lies at the <em>same</em> spacing, but the code still takes the power-of-two path. Its <em>m</em><sup>−</sup> is closer than necessary. That is conservative, and the output is still right here, but the site’s <a href="../chapters/toothless.html#boundary">audit</a> counts it as a defect.` : ""}</p>`
        : `<p>Doubling everything turns the midpoints to the neighbours into integers at one common exponent: <em>f</em><sup>−</sup> = 2<em>f</em> − 1, 2<em>f</em>, <em>f</em><sup>+</sup> = 2<em>f</em> + 1, and <em>e<sub>b</sub></em> = <em>e</em> − 1.</p>`;
      return card("Boundaries", "The rounding interval as integers", `
        <p><em>m</em><sup>−</sup> = <em>f</em><sup>−</sup> · 2<sup><em>e<sub>b</sub></em></sup>, <em>v</em> = <em>f</em> · 2<sup><em>e<sub>b</sub></em></sup>, <em>m</em><sup>+</sup> = <em>f</em><sup>+</sup> · 2<sup><em>e<sub>b</sub></em></sup>.</p>${extra}`,
        [["f⁻", "lower boundary", num(b.low, "tt-bin")], ["f", "the value", num(b.exact, "tt-bin")], ["f⁺", "upper boundary", num(b.up, "tt-bin")], ["e_b", "common exponent", minus(b.eb)]],
        `<p>Ends ${odd ? "excluded (f odd)" : "included (f even)"}.</p>`);
    }
    case "scale": {
      const e = t.raw;
      const formula = s.reciprocal
        ? `<p><em>e<sub>b</sub></em> is negative, so the code works with <em>n</em> = −<em>k</em>:<br>
           <code>n = ((315652 · ${-b.eb}) >> 20) + 1 = ${s.index}</code><br>
           <code>e_n = (3483294 · ${s.index}) >> 20 = ${-s.ek}</code><br>
           so <em>k</em> = ${minus(s.k)} and <em>e<sub>k</sub></em> = ${minus(s.ek)}. The table stores 2<sup>${-s.ek}</sup>/10<sup>${s.index}</sup> in entry ${s.index}. The code needs the reciprocal α = 10<sup>${s.index}</sup>/2<sup>${-s.ek}</sup>, so it swaps numerator and denominator, and with them the two tag bits.</p>`
        : `<p><code>k = (315652 · (${b.eb} + 1)) >> 20 = ${s.k}</code><br>
           <code>e_k = (3483294 · ${s.k}) >> 20 = ${s.ek}</code><br>
           315652/2<sup>20</sup> ≈ log<sub>10</sub> 2 and 3483294/2<sup>20</sup> ≈ log<sub>2</sub> 10. These integer shortcuts give the exact ⌊…⌋ values for every exponent (ledger claim 1). The table entry ${s.index} approximates α = 2<sup>${s.ek}</sup>/10<sup>${s.k}</sup>.</p>`;
      const gapLine = t.exactEntry
        ? `<span class="tt-tag tt-tag-exact">exact</span> num/den equals α. No approximation is involved at all.`
        : `<span class="tt-tag tt-tag-${tagName(t)}">${tagName(t)}</span> num/den is ${sci(t.gap.log10Rel)} (relative) ${t.higher ? "above" : "below"} α.`;
      return card("Pick k", `Choose the power of ten and fetch the stand-in`, `
        <p>Toothless measures everything in units of 10<sup><em>k</em></sup>. It looks for a <em>k</em> with α = 2<sup><em>e<sub>k</sub></em></sup>/10<sup><em>k</em></sup> close to 1, and a shift <em>e<sub>b</sub></em> − <em>e<sub>k</sub></em> between 0 and 3.</p>${formula}`,
        [["k", "decimal exponent", minus(s.k)], ["e_k", "binary exponent of α", minus(s.ek)],
         ["tagged", `entry ${s.index} as stored`, `<span class="tt-num tt-bin">${hex(t.table.tn[s.index])}</span><br><span class="tt-num tt-bin">${hex(t.table.td[s.index])}</span>`],
         ["num", s.reciprocal ? "(stored den)" : "", `${num(t.num, "tt-bin")} <span class="tt-dim">(${bits(t.num)} bits)</span>`],
         ["den", s.reciprocal ? "(stored num)" : "", `${num(t.den, "tt-bin")} <span class="tt-dim">(${bits(t.den)} bits)</span>`],
         ["α", "exact, to 25 digits", `<span class="tt-num">${M.ratioToString(t.P, t.T, 25)}</span>`],
         ["num/den", "", `<span class="tt-num">${M.ratioToString(t.num, t.den, 25)}</span>`],
        ], `<p>${gapLine} ${t.table === M.ORIGINAL ? "" : `<span class="tt-flag">Using the ${budgetLabel(state.budget)}.</span>`} The tag bit sits in bit 0 of the stored words: bit 0 of the numerator word means “higher”, bit 0 of the denominator word means “lower”. ${!t.exactEntry && s.index === 50 && t.table === M.ORIGINAL ? `<a href="#staircase">How entry 50 was built ↓</a>` : ""}</p>`);
    }
    case "shift": {
      const lo = M.ratioToString(t.fLs * t.P, t.T, 22), hi = M.ratioToString(t.fUs * t.P, t.T, 22);
      return card("Shift", `Line the boundaries up with α`, `
        <p><em>e<sub>b</sub></em> − <em>e<sub>k</sub></em> = ${s.diff}, so shift the three integers left by ${s.diff}. Now <em>m</em><sup>±</sup>/10<sup><em>k</em></sup> = <em>f</em><sup>±</sup><sub>s</sub> · α exactly. The rounding interval, measured in units of ${pow10Html(s.k)}, is [<em>f</em><sup>−</sup><sub>s</sub>·α, <em>f</em><sup>+</sup><sub>s</sub>·α].</p>`,
        [["f⁻ₛ", "", `${num(t.fLs, "tt-bin")} <span class="tt-dim">(${bits(t.fLs)} bits)</span>`],
         ["fₛ", "", `${num(t.fs, "tt-bin")} <span class="tt-dim">(${bits(t.fs)} bits)</span>`],
         ["f⁺ₛ", "", `${num(t.fUs, "tt-bin")} <span class="tt-dim">(${bits(t.fUs)} bits)</span>`],
         ["f⁻ₛ·α", "lower end", `<span class="tt-num tt-dec">${lo}</span>`],
         ["f⁺ₛ·α", "upper end", `<span class="tt-num tt-dec">${hi}</span>`],
        ], `<p>These decimals are shown for you. The algorithm never computes them. All it has is <em>num</em>/<em>den</em>, and it asks questions of it.</p>`);
    }
    case "products": {
      const cell = (key) => (key === t.tableKey ? ` class="tt-hl"` : "");
      const adj = M.TABLE1[t.tableKey];
      const pm = (x) => (x > 0 ? " + 1" : x < 0 ? " − 1" : "");
      return card("p± tweaks", `Scale the boundaries and nudge by one`, `
        <p><em>p</em><sup>+</sup> = <em>f</em><sup>+</sup><sub>s</sub> · <em>num</em> and <em>p</em><sup>−</sup> = <em>f</em><sup>−</sup><sub>s</sub> · <em>num</em>, both below 2<sup>128</sup>. Every later test has the form “something · <em>den</em> ≥ <em>p</em><sup>−</sup>” or “≤ <em>p</em><sup>+</sup>”. Some tests should be strict: the boundary is excluded (odd <em>f</em>), or the stand-in lies on the wrong side of α. For those the code adds or subtracts 1, which turns ≥ into &gt;. This is the draft’s Table 1. The cell for this input is highlighted:</p>
        <div class="tt-table-wrap"><table class="tt-t1"><thead><tr><th></th><th scope="col">f even</th><th scope="col">f odd</th></tr></thead><tbody>
          <tr><th scope="row">exact</th><td${cell("exact/even")}>p⁻, p⁺ as is</td><td${cell("exact/odd")}>p⁻ + 1, p⁺ − 1</td></tr>
          <tr><th scope="row">lower</th><td${cell("lower/even")}>p⁻ + 1</td><td${cell("lower/odd")}>p⁻ + 1</td></tr>
          <tr><th scope="row">higher</th><td${cell("higher/even")}>p⁺ − 1</td><td${cell("higher/odd")}>p⁺ − 1</td></tr>
        </tbody></table></div>`,
        [["p⁺", `f⁺ₛ·num${pm(adj[1])}`, `${num(t.pU)} <span class="tt-dim">(${bits(t.pU)} bits)</span>`],
         ["p⁻", `f⁻ₛ·num${pm(adj[0])}`, `${num(t.pL)} <span class="tt-dim">(${bits(t.pL)} bits)</span>`]],
        `<p>${t.exactEntry
          ? (odd ? "Exact entry, odd <em>f</em>: both ends are excluded, so both products move inward by one." : "Exact entry, even <em>f</em>: both ends are allowed, and nothing moves.")
          : t.lower
            ? "The stand-in is <strong>lower</strong> than α. A candidate exactly on <em>f</em><sup>−</sup><sub>s</sub>·<em>num</em>/<em>den</em> would really sit below <em>m</em><sup>−</sup>, so <em>p</em><sup>−</sup> + 1 rejects it. Candidates at or below <em>p</em><sup>+</sup> are below the true <em>m</em><sup>+</sup> anyway. Whether <em>f</em> is odd no longer matters: an inexact α never equals a question fraction."
            : "The stand-in is <strong>higher</strong> than α. A candidate exactly on <em>f</em><sup>+</sup><sub>s</sub>·<em>num</em>/<em>den</em> would really sit above <em>m</em><sup>+</sup>, so <em>p</em><sup>+</sup> − 1 rejects it. Whether <em>f</em> is odd no longer matters: an inexact α never equals a question fraction."}</p>`);
    }
    case "upper":
      return card("R", `The upper boundary, rounded down`, `
        <p><em>R</em> = ⌊<em>p</em><sup>+</sup>/<em>den</em>⌋ is the largest integer with <em>R</em> · <em>den</em> ≤ <em>p</em><sup>+</sup>. It is the upper boundary in units of ${pow10Html(s.k)}, rounded down, so no candidate can exceed it. Its ${String(t.Rfull).length} digits are the candidates: Toothless emits them from the left until the prefix reaches <em>m</em><sup>−</sup>.</p>`,
        [["R", `${String(t.Rfull).length} digits, ${bits(t.Rfull)} bits`, num(t.Rfull, "tt-dec")],
         ["top place", "", `the leading digit is worth ${pow10Html(t.topPlace)}`]],
        rowNote(t, row));
    case "digits": {
      const idx = t.rows.slice(0, step.row + 1).filter((r) => r.kind === "prefix").length;
      const last = row.cached;
      return card(`Digit ${idx}`, `Prefix of ${idx} digit${idx > 1 ? "s" : ""}: inside yet?`, `
        <p>Keep the first ${idx} digit${idx > 1 ? "s" : ""} of <em>R</em> and zero the rest: <em>R</em>${sub(idx)} = ${num(row.a, "tt-dec")} (units of ${pow10Html(s.k)}). Is it at or above the lower boundary? The code tests <em>R</em>${sub(idx)} · <em>den</em> ≥ <em>p</em><sup>−</sup>, that is, the fraction <em>R</em>${sub(idx)}/<em>f</em><sup>−</sup><sub>s</sub> against <em>num</em>/<em>den</em>.</p>`,
        [["digits", "", `<span class="tt-num tt-dec tt-big">${row.digitsSoFar}</span> × ${pow10Html(row.place)}`]],
        `<p>${last
          ? `<strong>Yes.</strong> The prefix is inside the interval, so the loop stops at ${idx} digit${idx > 1 ? "s" : ""}. ${idx > 1 ? "This is the shortest length: the prefix one digit shorter was below <em>m</em><sup>−</sup>, and raising its last digit by one would pass <em>m</em><sup>+</sup>, because the prefix was cut from <em>R</em>." : "A single digit is always shortest."}`
          : `<strong>No.</strong> The prefix is still below <em>m</em><sup>−</sup>. Take one more digit.`}</p>${rowNote(t, row)}`);
    }
    case "walk": {
      if (row.kind === "above") {
        return card("Closest", `Is the candidate above v?`, `
          <p>The prefix was cut from the upper boundary, so it is the <em>largest</em> candidate of this length. Another candidate can only be closer to <em>v</em> by being smaller. First test: is it above <em>v</em> at all? <em>R</em> · <em>den</em> &gt; <em>f</em><sub>s</sub> · <em>num</em>, that is, <em>R</em>/<em>f</em><sub>s</sub> against <em>num</em>/<em>den</em>.</p>`,
          [["R", "candidate", num(row.a, "tt-dec")]],
          `<p>${row.cached ? "<strong>Yes.</strong> Check whether stepping the last digit down gets closer." : "<strong>No.</strong> The candidate is at or below <em>v</em>, and nothing smaller can be closer. Done."}</p>${rowNote(t, row)}`);
      }
      if (row.kind === "walk") {
        return card("Closest", `More than half a step above v?`, `
          <p>Lower the last digit (now ${row.lastDigit}) while the candidate is more than half a step (½ · ${pow10Html(String(row.dd).length - 1 + s.k)}) above <em>v</em>. The code tests 2<em>R</em> · <em>den</em> &gt; 2<em>f</em><sub>s</sub> · <em>num</em> + 10<sup><em>j</em></sup> · <em>den</em>, that is, (2<em>R</em> − 10<sup><em>j</em></sup>)/(2<em>f</em><sub>s</sub>) against <em>num</em>/<em>den</em>.</p>`,
          [["R", "candidate", num(row.R, "tt-dec")], ["2R − 10ʲ", "", num(row.a)], ["2fₛ", "", num(row.b, "tt-bin")]],
          `<p>${row.cached ? `<strong>Yes.</strong> The candidate one lower is closer: last digit ${row.lastDigit} → ${row.lastDigit - 1}.` : `<strong>No.</strong> Keep the last digit ${row.lastDigit}.`}</p>${rowNote(t, row)}`);
      }
      if (row.kind === "tie") {
        const what = row.action === "down-even" ? "The entry is exact and the digit is odd, so round half to even: step down once more."
          : row.action === "down-higher" ? "The entry is “higher”, so in truth the lower candidate is strictly closer: step down."
          : row.lastDigit % 2 === 0 && t.exactEntry ? "The entry is exact and the digit is even: keep it (round half to even)." : "The entry is “lower”, so in truth the current candidate is strictly closer: keep it.";
        return card("Closest", `An exact tie in the cached arithmetic`, `
          <p>The walk stopped on an <strong>equality</strong>: 2<em>R</em> · <em>den</em> = 2<em>f</em><sub>s</sub> · <em>num</em> + 10<sup><em>j</em></sup> · <em>den</em>. The two neighbouring candidates are equally far from <em>v</em>, at least as <em>num</em>/<em>den</em> sees it.</p>`,
          [["R", "candidate", num(row.R, "tt-dec")]],
          `<p>${what} This tie rule is in the code but not in the draft’s proof (ledger claim 6).</p>${rowNote(t, row)}`);
      }
      // fixup
      return card("Closest", `Power of two: still above m⁻?`, `
        <p>For a power of two the interval is lopsided. Walking toward <em>v</em> can step below <em>m</em><sup>−</sup>, which is only a quarter step away. The code checks <em>R</em> · <em>den</em> &lt; <em>p</em><sup>−</sup> and, if so, puts the digit back up by one. This fix-up exists only in code (ledger claim 6).</p>`,
        [["R", "candidate", num(row.a, "tt-dec")]],
        `<p>${row.cached ? "<strong>Below m⁻:</strong> add one back to the last digit." : "Still inside: nothing to fix."}</p>${rowNote(t, row)}`);
    }
    case "output": {
      const out = { digits: t.digits, exponent: t.exponent };
      const j = M.judge(t.v, out);
      const ok = j.verdict === "ok";
      const wrongRows = t.rows.filter((r) => !r.agrees).length;
      return card("Output", `${t.digits} × 10${sup(t.exponent)}`, `
        <p>The digits are <strong class="tt-dec">${t.digits}</strong> with the last one worth ${pow10Html(t.exponent)}. Written the JavaScript way, that is <strong class="tt-dec">${M.formatOutput(t.digits, t.exponent)}</strong>.</p>`,
        [["Toothless", budgetLabel(state.budget), `<span class="tt-num tt-dec">${M.formatOutput(t.digits, t.exponent)}</span>`],
         ["toString", "Number.prototype.toString", `<span class="tt-num">${String(t.v)}</span>`]],
        `<p class="${ok ? "tt-ok" : "tt-bad"}">${ok ? "✓ Same digits and exponent as JavaScript’s shortest, closest output." : `✗ ${j.verdict}: JavaScript prints ${String(t.v)}.`}
        ${wrongRows ? ` ${wrongRows} comparison${wrongRows > 1 ? "s" : ""} got a different answer than the exact α would give (red in the log).` : ` All ${t.rows.length} comparisons agreed with the exact α.`}</p>`);
    }
  }
  return "";
}

function fmtV(v) { return String(v); }

function rowNote(t, row) {
  if (!row || row.agrees) return "";
  return `<p class="tt-bad">✗ The exact α answers this question the other way. The question fraction fell into the gap between the stand-in and α, because this ${budgetLabel(state.budget)} leaves the gap open for fractions this small.</p>`;
}

function card(stage, title, intro, regs, outro) {
  const regHtml = regs.filter((r) => r[2] !== "").map(([name, meaning, value]) => `
    <div class="tt-reg"><span class="tt-reg-name">${name}</span><span class="tt-reg-meaning">${meaning}</span><span class="tt-reg-value">${value}</span></div>`).join("");
  return `<p class="tt-card-stage">${stage}</p><h3 class="tt-card-title">${title}</h3>${intro}${regHtml ? `<div class="tt-regs">${regHtml}</div>` : ""}${outro || ""}`;
}

// ------------------------------------------------------------------ comparison log

const RULER_MIN = -44; // log10 relative distance at the right end

function rowTitle(t, r, i) {
  const prefixIdx = t.rows.slice(0, i + 1).filter((x) => x.kind === "prefix").length;
  switch (r.kind) {
    case "upper": return `R = ⌊p⁺/den⌋: largest R with R·den ≤ p⁺`;
    case "prefix": return `digit ${prefixIdx}: is ${r.digitsSoFar}×10${sup(r.place)} ≥ m⁻?`;
    case "above": return `is the candidate above v?`;
    case "walk": return `more than half a step above v? (last digit ${r.lastDigit})`;
    case "tie": return `exact tie in cached arithmetic`;
    case "fixup": return `power of two: below m⁻ after the walk?`;
  }
  return "";
}

function verdictText(r) {
  if (r.kind === "upper") return r.agrees ? `R = ${group(r.cached)}` : `R = ${group(r.cached)}, exact α gives ${group(r.truth)}`;
  const yes = r.cached ? "yes" : "no";
  return yes;
}

function integersHtml(t, r) {
  const lines = [];
  if (r.kind === "upper") {
    lines.push(["R·den", r.lhs], ["p⁺", r.rhs], ["(R+1)·den", r.lhs1]);
  } else if (r.kind === "prefix") {
    lines.push(["Rᵢ·den", r.lhs], ["p⁻", r.rhs]);
  } else if (r.kind === "above") {
    lines.push(["R·den", r.lhs], ["fₛ·num", r.rhs]);
  } else if (r.kind === "walk" || r.kind === "tie") {
    lines.push(["2R·den", r.lhs], ["2fₛ·num + 10ʲ·den", r.rhs]);
  } else if (r.kind === "fixup") {
    lines.push(["R·den", r.lhs], ["p⁻", r.rhs]);
  }
  lines.push(["a", r.a], ["b", r.b]);
  return `<dl class="tt-ints">${lines.map(([k, v]) => `<dt>${k}</dt><dd>${group(v)} <span class="tt-dim">(${bits(v)} bits)</span></dd>`).join("")}</dl>`;
}

function badgeHtml(t, r) {
  const aB = bits(r.a), bB = bits(r.b);
  if (t.exactEntry) return `<span class="tt-badge tt-badge-exact">a/b: ${aB}/${bB} bits · exact entry: no gap</span>`;
  const g = t.gap;
  const safe = r.a < g.intruder.n || r.b < g.intruder.d;
  return `<span class="tt-badge ${safe ? "tt-badge-safe" : "tt-badge-unsafe"}" title="a/b can only lie inside the gap if a ≥ 2^${g.intruderNumBits.toFixed(2)} and b ≥ 2^${g.intruderDenBits.toFixed(2)}">a/b: ${aB}/${bB} bits · inside the gap needs ≥ ${g.intruderNumBits.toFixed(1)}/${g.intruderDenBits.toFixed(1)} · ${safe ? "can’t be inside" : "size doesn’t rule it out"}</span>`;
}

let rulerWidth = 600;
function rulerSvg(t, r) {
  const W = rulerWidth, H = 46, L = 12, Rr = W - 12;
  const x = (lg) => L + (Math.max(RULER_MIN, Math.min(0, lg)) / RULER_MIN) * (Rr - L);
  const parts = [];
  // danger zone
  if (!t.exactEntry) {
    const gx = x(t.gap.log10Rel);
    parts.push(`<rect class="tt-zone" x="${gx}" y="12" width="${Rr - gx}" height="14"/>`);
    parts.push(`<line class="tt-gap-line" x1="${gx}" x2="${gx}" y1="4" y2="30"/>`);
    parts.push(`<text class="tt-gap-label" x="${gx - 4}" y="10" text-anchor="end">stand-in ${sciText(t.gap.log10Rel)}</text>`);
  } else {
    parts.push(`<text class="tt-gap-label" x="${Rr}" y="10" text-anchor="end">exact entry: no gap</text>`);
  }
  parts.push(`<line class="tt-axis" x1="${L}" x2="${Rr}" y1="26" y2="26"/>`);
  for (let lg = 0; lg >= RULER_MIN; lg -= 4) {
    const tx = x(lg);
    parts.push(`<line class="tt-tick" x1="${tx}" x2="${tx}" y1="26" y2="${lg % 8 === 0 ? 31 : 29}"/>`);
    if (lg % (W < 480 ? 12 : 8) === 0) parts.push(`<text class="tt-tick-label" x="${tx}" y="42" text-anchor="${lg === 0 ? "start" : "middle"}">${lg === 0 ? "1" : "1e" + lg}</text>`);
  }
  const m = r.margin;
  const mx = m === -Infinity ? Rr : x(m);
  const cls = r.agrees ? "tt-q" : "tt-q tt-q-bad";
  parts.push(`<path class="${cls}" d="M${mx} 12 l6 7 l-6 7 l-6 -7z"/>`);
  const lab = m === -Infinity ? "exactly on α" : `question ${sciText(m)}`;
  const anchor = mx > W * 0.55 ? "end" : "start";
  parts.push(`<text class="tt-q-label" x="${anchor === "end" ? mx - 9 : mx + 9}" y="23" text-anchor="${anchor}">${lab}</text>`);
  return `<svg class="tt-ruler" viewBox="0 0 ${W} ${H}" role="img" aria-label="Relative distance from alpha: question ${m === -Infinity ? "exactly on alpha" : "10 to the " + m.toFixed(1)}; ${t.exactEntry ? "exact entry, no gap" : "stand-in 10 to the " + t.gap.log10Rel.toFixed(1)}">${parts.join("")}</svg>`;
}

function renderLog(t) {
  const log = $("tt-log");
  rulerWidth = Math.max(300, Math.min(640, Math.round(log.clientWidth - 30) || 600));
  log.innerHTML = t.rows.map((r, i) => `
    <li class="tt-row ${r.agrees ? "" : "tt-row-bad"}" data-row="${i}">
      <div class="tt-row-head">
        <span class="tt-row-title">${rowTitle(t, r, i)}</span>
        <span class="tt-verdict ${r.kind === "upper" ? "" : r.cached ? "tt-yes" : "tt-no"}">${verdictText(r)}</span>
        <span class="tt-agree">${r.agrees ? "α agrees" : "α disagrees"}</span>
      </div>
      ${rulerSvg(t, r)}
      <div class="tt-row-foot">${badgeHtml(t, r)}
        <details class="tt-details"><summary>integers</summary>${integersHtml(t, r)}</details>
      </div>
    </li>`).join("");
}

// ------------------------------------------------------------------ stepper render

function renderStages() {
  const cur = state.steps[state.step].stage;
  $("tt-stages").innerHTML = STAGES.map(([id, label]) => {
    const first = state.steps.findIndex((s) => s.stage === id);
    const done = first >= 0 && first < state.step && cur !== id;
    return `<li><button type="button" data-stage="${id}" class="${cur === id ? "tt-cur" : done ? "tt-done" : ""}" ${first < 0 ? "disabled" : ""} ${cur === id ? 'aria-current="step"' : ""}>${label}</button></li>`;
  }).join("");
}

function render() {
  const t = state.trace;
  const step = state.steps[state.step];
  $("tt-card").innerHTML = cardHtml(t, step);
  $("tt-counter").textContent = `step ${state.step + 1} / ${state.steps.length}`;
  $("tt-first").disabled = $("tt-back").disabled = state.step === 0;
  $("tt-step").disabled = $("tt-last").disabled = state.step === state.steps.length - 1;
  const visibleUpTo = Math.max(...state.steps.slice(0, state.step + 1).map((s) => s.row));
  for (const li of $("tt-log").children) {
    const i = Number(li.dataset.row);
    li.hidden = i > visibleUpTo;
    li.classList.toggle("tt-row-cur", i === step.row && step.stage !== "output");
  }
  $("tt-log").dataset.empty = visibleUpTo < 0 ? "true" : "false";
  renderStages();
  for (const b of $("tt-presets").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.text === state.text));
  syncUrl();
}

function load(text, { step = 0, keepStep = false } = {}) {
  let v;
  try { v = parseInput(text); } catch (err) {
    $("tt-error").hidden = false; $("tt-error").textContent = err.message; return false;
  }
  $("tt-error").hidden = true;
  state.text = text.trim();
  state.v = v;
  $("tt-input").value = state.text;
  retrace(keepStep ? state.step : step);
  return true;
}

function retrace(step) {
  state.trace = M.trace(state.v, tableFor(state.budget));
  state.steps = buildSteps(state.trace);
  state.step = Math.max(0, Math.min(step, state.steps.length - 1));
  renderLog(state.trace);
  render();
}

function go(step) {
  state.step = Math.max(0, Math.min(step, state.steps.length - 1));
  render();
}

// ------------------------------------------------------------------ URL

let urlTimer = 0;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const p = new URLSearchParams(location.search);
    p.set("x", state.text);
    p.set("step", String(state.step));
    if (state.budget < 64) p.set("B", String(state.budget)); else p.delete("B");
    history.replaceState(null, "", `${location.pathname}?${p}${location.hash}`);
  }, 150);
}

// ------------------------------------------------------------------ bits figure (section 1)

function renderBitsFigure() {
  const g = M.gapSummary(M.ORIGINAL);
  const pct = (b) => `${((b / 64) * 100).toFixed(3)}%`;
  const lo = Math.min(g.minIntruderNum, g.minIntruderDen);
  const ticks = [0, 8, 16, 24, 32, 40, 48, 56, 64].map((b) => `<span class="tt-bt" style="left:${pct(b)}">${b}</span>`).join("");
  $("tt-bits").innerHTML = `
    <div class="tt-bitchart">
      <div class="tt-bitrow">
        <p class="tt-bitlabel"><strong>Questions</strong>: every fraction <em>a</em>/<em>b</em> that Toothless compares with α has both parts below 2<sup>59</sup>.</p>
        <div class="tt-track"><div class="tt-fill tt-fill-q" style="left:0;width:${pct(59)}"></div><span class="tt-fill-end" style="left:${pct(59)}">59</span></div>
      </div>
      <div class="tt-bitrow">
        <p class="tt-bitlabel"><strong>Intruders</strong>: a fraction strictly between a stand-in and its α needs both parts ≥ 2<sup>${lo.toFixed(2)}</sup>.</p>
        <div class="tt-track"><div class="tt-fill tt-fill-gap" style="left:${pct(lo)};width:calc(${pct(64 - lo)})"></div><span class="tt-fill-start" style="left:${pct(lo)}">${lo.toFixed(2)}</span></div>
      </div>
      <div class="tt-wall-v" style="left:${pct(63)}"><span>63-bit table</span></div>
      <div class="tt-bitaxis">${ticks}</div>
      <p class="tt-bitunit">bits: log<sub>2</sub> of the integer · the gap between 59 and ${lo.toFixed(2)} is the headroom</p>
    </div>`;
}

// ------------------------------------------------------------------ staircase (section 3)

function renderStaircase() {
  const { P, T } = M.alphaOfIndex(50);
  const conv = M.convergents(P, T).slice(0, 33);
  const entry = M.entryOf(M.ORIGINAL, 50);
  const W = 680, H = 300, L = 40, R = W - 14, top = 18, bottom = 236;
  const y = (b) => bottom - (b / 70) * (bottom - top);
  const n = conv.length;
  const step = (R - L) / n;
  const parts = [];
  for (let b = 0; b <= 70; b += 10) {
    parts.push(`<line class="tt-grid" x1="${L}" x2="${R}" y1="${y(b)}" y2="${y(b)}"/>`);
    parts.push(`<text class="tt-tick-label" x="${L - 6}" y="${y(b) + 4}" text-anchor="end">${b}</text>`);
  }
  parts.push(`<text class="tt-tick-label" x="${L}" y="${top - 6}">denominator bits</text>`);
  // staircase
  let d = "";
  conv.forEach((c, i) => {
    const b = c.k > 0n ? M.log2Big(c.k) : 0;
    const x0 = L + i * step, x1 = x0 + step;
    d += `${i === 0 ? "M" : "L"}${x0} ${y(b)} H${x1} `;
    parts.push(`<text class="tt-term ${c.a >= 20n ? "tt-term-big" : ""}" x="${x0 + step / 2}" y="${bottom + 16}" text-anchor="middle">${c.a}</text>`);
  });
  parts.push(`<path class="tt-stair" d="${d}"/>`);
  parts.push(`<text class="tt-tick-label" x="${L}" y="${bottom + 34}">terms a₀, a₁, … (index 0 at the left)</text>`);
  // wall
  parts.push(`<line class="tt-wall" x1="${L}" x2="${R}" y1="${y(63)}" y2="${y(63)}"/>`);
  parts.push(`<text class="tt-wall-label" x="${L + 6}" y="${y(63) - 5}">63-bit wall: num, den &lt; 2⁶³</text>`);
  // jump annotation
  const j = conv.findIndex((c) => c.a === 479n);
  const bPrev = M.log2Big(conv[j - 1].k), bJump = M.log2Big(conv[j].k);
  const xj = L + j * step;
  parts.push(`<line class="tt-jump" x1="${xj}" x2="${xj}" y1="${y(bPrev)}" y2="${y(bJump)}"/>`);
  const nx = xj - 30;
  parts.push(`<path class="tt-jump" d="M${nx + 4} ${y(12) - 4} L${xj - 3} ${y((bPrev + bJump) / 2)}"/>`);
  parts.push(`<text class="tt-note" x="${nx}" y="${y(12)}" text-anchor="end">convergent after a${sub31()} = 479: ${Math.ceil(bPrev)} → ${Math.ceil(bJump)} bits</text>`);
  // stored semiconvergent
  const be = M.log2Big(entry.den);
  parts.push(`<circle class="tt-entry" cx="${xj + step / 2}" cy="${y(be)}" r="5"/>`);
  parts.push(`<path class="tt-jump" d="M${nx + 4} ${y(5) - 4} L${xj + step / 2 - 4} ${y(be) + 5}"/>`);
  parts.push(`<text class="tt-note tt-note-blue" x="${nx}" y="${y(5)}" text-anchor="end">stored entry: semiconvergent c = 329 of 479, ${be.toFixed(3)} bits</text>`);
  $("tt-stair").innerHTML = `<div class="tt-scroll"><svg viewBox="0 0 ${W} ${H}" class="tt-stair-svg" aria-hidden="true">${parts.join("")}</svg></div>`;
}
function sub31() { return "₃₁"; }

// ------------------------------------------------------------------ budget (section 4)

let randomJob = null;

function renderBudget() {
  const B = state.budget;
  $("tt-budget").value = String(B);
  $("tt-budget-out").textContent = B >= 64 ? "original table" : `${B} bits`;
  const t0 = performance.now();
  const table = tableFor(B);
  const ms = performance.now() - t0;
  const sep = M.gapSummary(table);
  const guaranteed = sep.guaranteed;
  $("tt-budget-summary").innerHTML = `${B >= 64 ? "The original table from <code>fraction_values.h</code>." : `Rebuilt all 325 entries in ${ms < 1 ? "under 1" : Math.round(ms)} ms.`}
    ${sep.exact} entries are exact. Across the ${sep.inexact} inexact ones, the simplest fraction inside a gap has a denominator of at least 2<sup>${sep.minIntruderDen.toFixed(2)}</sup> and a numerator of at least 2<sup>${sep.minIntruderNum.toFixed(2)}</sup>.
    <strong class="${guaranteed ? "tt-ok" : "tt-bad"}">${guaranteed ? "Every question (below 2⁵⁹) is too small to fit: the separation argument covers this table." : "Questions reach 2⁵⁹, so some could fit into a gap: no guarantee."}</strong>`;
  const tbody = $("tt-cases").querySelector("tbody");
  tbody.innerHTML = HARD_CASES.map((c) => {
    const v = Number(c.text);
    const out = M.convert(v, table);
    const j = M.judge(v, out);
    const ok = j.verdict === "ok";
    return `<tr class="${ok ? "" : "tt-row-bad"}"><td><code>${c.text}</code><br><span class="tt-dim">${c.why}</span></td><td><code>${M.formatOutput(out.digits, out.exponent)}</code></td><td class="${ok ? "tt-ok" : "tt-bad"}">${ok ? "✓ ok" : "✗ " + j.verdict}</td><td><button type="button" class="lab-button tt-trace-btn" data-text="${c.text}">trace</button></td></tr>`;
  }).join("");
  $("tt-cache").value = String(B);
  if (randomJob) { randomJob.cancel = true; randomJob = null; $("tt-random-out").textContent = ""; $("tt-random").disabled = false; }
}

function setBudget(B, { retraceStepper = true } = {}) {
  state.budget = B;
  renderBudget();
  if (retraceStepper) retrace(state.step);
}

function runRandom() {
  const table = tableFor(state.budget);
  const N = 100000, chunk = 2000;
  const rnd = M.makeRandom(Date.now() % 1000003);
  const job = { cancel: false };
  randomJob = job;
  let i = 0, fails = 0; const examples = [];
  $("tt-random").disabled = true;
  const t0 = performance.now();
  const tick = () => {
    if (job.cancel) return;
    const end = Math.min(N, i + chunk);
    for (; i < end; i++) {
      const v = rnd();
      const j = M.judge(v, M.convert(v, table));
      if (j.verdict !== "ok") { fails++; if (examples.length < 3) examples.push(String(v)); }
    }
    $("tt-random-out").textContent = `${i.toLocaleString("en-US")} / ${N.toLocaleString("en-US")} tested, ${fails} failure${fails === 1 ? "" : "s"}…`;
    if (i < N) { setTimeout(tick, 0); return; }
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    $("tt-random-out").textContent = `${N.toLocaleString("en-US")} random bit patterns with the ${budgetLabel(state.budget)}: ${fails} failure${fails === 1 ? "" : "s"}${examples.length ? " (e.g. " + examples.join(", ") + ")" : ""}, ${s} s.${fails === 0 && state.budget < 54 ? " The hard cases in the table above still fail." : ""}`;
    $("tt-random").disabled = false;
    randomJob = null;
  };
  setTimeout(tick, 0);
}

// ------------------------------------------------------------------ ledger (section 5)

const CLAIMS = [
  {
    title: "k and e_k come out of two integer multiplications",
    status: ["checked", "checked exhaustively here; also by the author’s tools/bin/exp_finder.dart"],
    text: "k = (315652·(e_b+1)) >> 20 and e_k = (3483294·k) >> 20, or the negated forms for e_b < 0, must equal the exact ⌊…⌋ definitions. The shift e_b − e_k must stay in 0…3, and α must land in (½, 1] (or [1, 2) for reciprocals).",
    run: async () => {
      const r = M.checkShortcuts();
      return `${r.count} exponents e<sub>b</sub> = ${minus(r.ebMin)}…${r.ebMax}: ${r.bad === 0 ? "all match the exact definitions" : `${r.bad} mismatches (first: ${r.firstBad.join(", ")})`}. Shifts seen: {${r.diffs.join(", ")}}.`;
    },
  },
  {
    title: "The digit loop stops",
    status: ["argued", "argued in the draft; its condition is checked here"],
    text: "The draft shows that the loop terminates if den + 2 ≤ 2·num and num + 2 ≤ 2·den, the second for reciprocal use. It verifies this condition only “empirically” on the table.",
    run: async () => {
      const r = M.checkTermination();
      const bad = r.failing.map((f) => `k = ${f.i} (${f.num}/${f.den})`).join(", ");
      return `${325 - r.failing.length} of 325 entries satisfy both inequalities. The exception is ${bad}. It is exact and used only for e<sub>b</sub> ∈ {0, 1, 2}. There <em>den</em> = 1, so the full <em>R</em> = <em>p</em><sup>+</sup> is reached and still passes the stop test, because <em>f</em><sup>+</sup><sub>s</sub> − <em>f</em><sup>−</sup><sub>s</sub> ≥ 2 absorbs the two odd-<em>f</em> nudges. The draft notes the exception and suggests storing 100/100 instead.`;
    },
  },
  {
    title: "Separation: nothing small lies between num/den and α",
    status: ["partly wrong in the draft", "the draft’s argument is not literally right; the one-sided version is checked here for all entries"],
    text: "This is the key lemma. The draft argues from “num/den is the best approximation: no fraction with a smaller denominator is closer”. The proof needs something else: no fraction with both parts below the question size lies strictly between num/den and α. Farey neighbours p/q < r/s (with <em>qr</em> − <em>ps</em> = 1) give exactly that, because any fraction between them has a denominator of at least q + s.",
    run: async () => {
      const r = M.checkSeparation();
      return `${r.inexact} inexact entries (${r.lower} lower, ${r.higher} higher; ${r.convergentCount} convergents, ${r.semiCount} semiconvergents), ${r.exact} exact (k = 0…${r.lastExact}). All tags match exact arithmetic${r.tagWrong ? " — except " + r.tagWrong : ""}, and all entries are in lowest terms${r.notCoprime ? " — except " + r.notCoprime : ""}.
        <br><strong>One-sided separation holds for all ${r.inexact}:</strong> the simplest fraction strictly inside a gap has a numerator of at least 2<sup>${r.minIntruderNum.toFixed(2)}</sup> and a denominator of at least 2<sup>${r.minIntruderDen.toFixed(2)}</sup>.
        <br>Neither definition of “best” holds throughout. <strong>${r.notPaperBest}</strong> entries are not best approximations in the draft’s sense: a fraction with a smaller denominator is closer, on the other side of α (first: k = ${r.notPaperBestList.slice(0, 4).join(", ")}, …). <strong>${r.notClosest}</strong> entries are not the closest fraction with both parts below 2<sup>63</sup> (first: k = ${r.notClosestList.slice(0, 4).join(", ")}, …). Neither matters for the one-sided property. The Dart package that built the table is not available, so why it picked these endpoints is unknown.`;
    },
  },
  {
    title: "Every operand fits in 64 bits, every product in 128",
    status: ["checked", "easy to argue; maxima observed here"],
    text: "The shifted boundaries are below 2⁵⁸, R below 2⁶⁴ (actually 2⁵⁸), and the products below 2¹²⁸. The question fractions a/b, which the separation lemma must cover, have both parts below 2⁵⁹.",
    run: async () => {
      const r = M.checkWidths();
      return `${r.runs.toLocaleString("en-US")} extreme inputs (every exponent field, with the smallest and largest significand and the power of two): boundaries ≤ ${r.boundary} bits, question parts ≤ ${r.twoFs} bits, R ≤ ${r.R} bits, products ≤ ${Math.max(r.product, r.walkProduct)} bits.`;
    },
  },
  {
    title: "The output has the fewest digits",
    status: ["open", "the draft has two proofs, one marked “(gemini)”, and the other has TODOs"],
    text: "The standard argument: the rejected prefix is below m⁻, and one unit more at its last place is above m⁺ because the prefix was cut from R. So no shorter decimal fits. The Run button certifies exactly that, per input, with the exact α instead of the cache.",
    run: async (out) => {
      const rnd = M.makeRandom(4242);
      let n = 0, ok = 0;
      const inputs = [];
      for (let b = 1; b <= 2046; b++) inputs.push(M.fromBits(BigInt(b) << 52n));
      for (let i = 0; i < 8000; i++) inputs.push(rnd());
      await chunked(inputs, 400, (v) => { n++; if (M.certifyShortest(v).ok) ok++; }, (done) => { out.textContent = `certifying… ${done}/${inputs.length}`; });
      return `${ok} of ${n} inputs (all 2046 normal powers of two plus 8000 random doubles) certified shortest with exact arithmetic. That is evidence for the lemma, not a proof of it.`;
    },
  },
  {
    title: "Ties and the power-of-two fix-up",
    status: ["code only", "in continued.c, not in the draft’s proofs"],
    text: "After the walk, an exact equality is broken by the tag (“higher”: step down) or by round-half-to-even for exact entries. For powers of two, a walk that stepped below m⁻ is undone.",
    run: async (out) => {
      let fix = 0, ok = 0; const ex = [];
      const inputs = []; for (let b = 1; b <= 2046; b++) inputs.push(M.fromBits(BigInt(b) << 52n));
      await chunked(inputs, 200, (v) => {
        const t = M.trace(v);
        if (M.judge(v, t).verdict === "ok") ok++;
        if (t.fixup && t.fixup.below) { fix++; if (ex.length < 2) ex.push(String(v)); }
      }, (done) => { out.textContent = `running… ${done}/2046`; });
      const ties = ["1125899906842624.25", "1125899906842624.75"].map((s) => {
        const v = Number(s), t = M.trace(v);
        return `${s} → ${M.formatOutput(t.digits, t.exponent)} (${t.tie ? t.tie.action.replace("down-even", "odd digit, stepped to even").replace("keep", "even digit kept") : "no tie"}, ${M.judge(v, t).verdict})`;
      });
      return `All 2046 normal powers of two: ${ok} match <code>toString</code>. The fix-up fires for ${fix} of them (e.g. ${ex.join(", ")}). Exact ties: ${ties.join("; ")}. The “higher” tie branch needs <em>den</em> to divide the question’s denominator, which none of these inputs triggers.`;
    },
  },
  {
    title: "End to end: output equals the shortest, closest decimal",
    status: ["evidence", "tested, not proved"],
    text: "Compare with Number.prototype.toString, which ECMAScript requires to be shortest and, in practice, closest. The ideation ports matched about 3.9 million doubles plus about 750 constructed near-boundary cases. As the budget section shows, random testing can miss real failures.",
    run: async (out) => {
      const rnd = M.makeRandom(Date.now() % 99991);
      const N = 50000; let bad = 0; const ex = [];
      const inputs = Array.from({ length: N }, () => rnd());
      await chunked(inputs, 2500, (v) => { if (M.judge(v, M.convert(v)).verdict !== "ok") { bad++; if (ex.length < 3) ex.push(String(v)); } }, (done) => { out.textContent = `testing… ${done}/${N}`; });
      return `${N.toLocaleString("en-US")} random doubles against <code>toString</code>: ${bad} mismatch${bad === 1 ? "" : "es"}${ex.length ? " (" + ex.join(", ") + ")" : ""}.`;
    },
  },
];

function chunked(items, size, fn, progress) {
  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      const end = Math.min(items.length, i + size);
      for (; i < end; i++) fn(items[i]);
      progress?.(i);
      if (i < items.length) setTimeout(tick, 0); else resolve();
    };
    setTimeout(tick, 0);
  });
}

function renderLedger() {
  $("tt-claims").innerHTML = CLAIMS.map((c, i) => `
    <li class="tt-claim">
      <div class="tt-claim-head"><strong>${c.title}</strong><span class="tt-status-chip tt-st-${c.status[0].split(" ")[0]}">${c.status[0]}</span></div>
      <p class="tt-claim-status">${c.status[1]}</p>
      <p>${c.text}</p>
      <div class="tt-claim-run"><button type="button" class="lab-button" data-claim="${i}">Run</button><output class="tt-claim-out" id="tt-claim-out-${i}" aria-live="polite"></output></div>
    </li>`).join("");
  $("tt-claims").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-claim]");
    if (!btn) return;
    const i = Number(btn.dataset.claim);
    const out = $(`tt-claim-out-${i}`);
    btn.disabled = true;
    out.textContent = "running…";
    await new Promise((r) => setTimeout(r, 20));
    const t0 = performance.now();
    try {
      const html = await CLAIMS[i].run(out);
      out.innerHTML = `${html} <span class="tt-dim">(${Math.round(performance.now() - t0)} ms)</span>`;
    } catch (err) {
      out.textContent = "failed: " + err.message;
    }
    btn.disabled = false;
  });
}

// ------------------------------------------------------------------ wiring

function init() {
  $("tt-presets").innerHTML = PRESETS.map((p) => `<button type="button" data-text="${p.text}" title="${p.note}">${p.label}</button>`).join("");
  $("tt-presets").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-text]");
    if (b) load(b.dataset.text);
  });
  $("tt-form").addEventListener("submit", (ev) => { ev.preventDefault(); load($("tt-input").value); });
  $("tt-first").addEventListener("click", () => go(0));
  $("tt-back").addEventListener("click", () => go(state.step - 1));
  $("tt-step").addEventListener("click", () => go(state.step + 1));
  $("tt-last").addEventListener("click", () => go(state.steps.length - 1));
  $("tt-stages").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-stage]");
    if (!b) return;
    go(state.steps.findIndex((s) => s.stage === b.dataset.stage));
  });
  $("tt-stepper").addEventListener("keydown", (ev) => {
    if (ev.target.closest("input, select, textarea")) return;
    if (ev.key === "ArrowRight") { go(state.step + 1); ev.preventDefault(); }
    if (ev.key === "ArrowLeft") { go(state.step - 1); ev.preventDefault(); }
  });
  const opts = [`<option value="64">original 63-bit table</option>`];
  for (let b = 63; b >= 44; b--) opts.push(`<option value="${b}">rebuilt, ${b}-bit</option>`);
  $("tt-cache").innerHTML = opts.join("");
  $("tt-cache").addEventListener("change", () => setBudget(Number($("tt-cache").value)));
  $("tt-budget").addEventListener("input", () => setBudget(Number($("tt-budget").value)));
  $("tt-random").addEventListener("click", runRandom);
  $("tt-cases").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-text]");
    if (!b) return;
    load(b.dataset.text, { step: 0 });
    // Jump to the first comparison the exact α disagrees with, or the output.
    const bad = state.trace.rows.findIndex((r) => !r.agrees);
    const idx = bad >= 0 ? state.steps.findIndex((s) => s.row === bad) : state.steps.length - 1;
    go(idx);
    $("tt-stepper").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    $("tt-stepper").focus({ preventScroll: true });
  });

  const p = new URLSearchParams(location.search);
  const B = Number(p.get("B"));
  if (B >= 44 && B <= 63) state.budget = B;
  renderBitsFigure();
  renderStaircase();
  renderBudget();
  renderLedger();
  if (p.get("ledger") === "open" || p.get("ledger") === "run") $("tt-ledger").open = true;
  if (p.get("ledger") === "run") {
    (async () => {
      for (const btn of $("tt-claims").querySelectorAll("button[data-claim]")) {
        btn.click();
        await new Promise((r) => { const w = () => (btn.disabled ? setTimeout(w, 50) : r()); setTimeout(w, 50); });
      }
    })();
  }
  if (!load(p.get("x") || DEFAULT_TEXT, { step: Number(p.get("step")) || 0 })) load(DEFAULT_TEXT);
  let lastW = $("tt-log").clientWidth, rt = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if ($("tt-log").clientWidth !== lastW) { lastW = $("tt-log").clientWidth; renderLog(state.trace); render(); } }, 200);
  });
}

init();
