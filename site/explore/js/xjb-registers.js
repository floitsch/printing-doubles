// Copyright (C) 2026 Toit contributors.
//
// "Twelve lines, one multiply": a debugger-style stepper through xjb64.

import * as X from "./xjb-registers-model.js";
import { exactDecimal } from "../../js/oracle.js";

const SVG = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const TWO64 = 1n << 64n;

// ---------------------------------------------------------------- helpers

function esc(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}
const minus = (n) => String(n).replace("-", "−");
const pw = (base, e) => `${base}<sup>${minus(e)}</sup>`;
const hex = (x, digits = 16) => `0x${x.toString(16).toUpperCase().padStart(digits, "0")}`;
const frac = (word, places = 6) => X.wordFraction(word, places);
const bool = (b) => `<b class="${b ? "xr-true" : "xr-false"}">${b}</b>`;

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}
function text(parent, x, y, content, cls = "", anchor = "middle") {
  const t = el("text", { x, y, class: cls, "text-anchor": anchor }, parent);
  t.textContent = content;
  return t;
}
// num/den to `places` decimals; "…" only when digits were cut off.
function approx(num, den, places) {
  const cut = (num * X.pow10(places)) % den !== 0n;
  const str = X.fracString(num, den, places);
  return cut ? `${str}…` : str.replace(/0+$/, "").replace(/\.$/, "");
}

// ---------------------------------------------------------------- presets

const PRESETS = [
  { expr: "0.1+0.2", label: "0.1 + 0.2 · nearest digit" },
  { expr: "0.3", label: "0.3 · carry up" },
  { expr: "1.3", label: "1.3 · drop down (h = −3)" },
  { expr: "1.5", label: "1.5 · drop down, n = 0 exactly" },
  { expr: "pi", label: "π · drop down, 16 digits" },
  { expr: "2^50+1/4", label: "2^50 + ¼ · tie at n = ¼" },
  { expr: "3*2^-24", label: "3·2^−24 · tie at n = ¾" },
  { expr: "5e-323", label: "5e−323 · subnormal" },
  { expr: "2^64", label: "2^64 · power of two" },
  { expr: "2^89", label: "2^89 · power of two" },
];

// ---------------------------------------------------------------- code listing

const CODE = [
  ["// in: c, q   with v = c · 2^q"],
  ["i64  k        = (q * 78913) >> 18;"],
  ["int  h        = q + (((-k - 1) * 217707) >> 16);"],
  ["u128 pow10    = table[-k - 1];"],
  ["u128 prod     = umul192_hi128(pow10, c << (h + 10));"],
  ["u64  m        = prod >> 73;"],
  ["u64  dot_one  = (u64)(prod >> 9);"],
  ["u64  half_ulp = ((u64)(pow10 >> 64) >> -h) + ((c + 1) & 1);"],
  ["bool down     = half_ulp > dot_one;"],
  ["bool up       = half_ulp > ~dot_one;"],
  ["u64  half     = dot_one == 1ull << 62 ? 0 : (1ull << 63) + 6;"],
  ["u32  one      = ((u128)dot_one * 10 + half) >> 64;"],
  ["u64  m_up     = m + up;   u32 up_down = up + down;"],
  ["// print m_up's digits, then `one` unless up_down"],
];
const LAST = CODE.length - 1;

function renderCode(step) {
  const pre = $("xr-code");
  pre.innerHTML = CODE.map(([line], i) => {
    const cls = ["xr-line", i === step ? "hl" : i > step ? "xr-future" : "xr-past"];
    if (line.startsWith("//")) cls.push("xr-c");
    const num = i === 0 || i === LAST ? "  " : String(i).padStart(2, " ");
    return `<span class="${cls.join(" ")}"${i === step ? ' aria-current="step"' : ""}><span class="xr-ln" aria-hidden="true">${num}</span>${esc(line)}</span>`;
  }).join("");
}

// ---------------------------------------------------------------- registers

function registerDefs(t) {
  const evenText = t.even ? "even: interval ends count" : "odd: interval ends excluded";
  const prodValue = `${approx(t.prod, 1n << 73n, 3)} · 2<sup>73</sup>`;
  return [
    { name: "c", at: 0, meaning: `significand, ${evenText}`, value: t.c.toString(), hex: hex(t.c) },
    { name: "q", at: 0, meaning: "binary exponent: v = c · 2<sup>q</sup>", value: minus(t.q) },
    { name: "k", at: 1, meaning: `last digit sits at the ${pw(10, t.k)} place`, value: minus(t.k) },
    { name: "h", at: 2, meaning: "leftover binary shift, −4 … −1", value: minus(t.h) },
    {
      name: "pow10", at: 3,
      meaning: `${t.entry.exact ? "" : "⌈"}${pw(10, t.e)} · ${pw(2, t.entry.shift)}${t.entry.exact ? ", exact" : "⌉, rounded up"}`,
      value: `${approx(t.pow10, 1n << 127n, 6)} · 2<sup>127</sup>`, hex: hex(t.pow10, 32),
    },
    { name: "prod", at: 4, meaning: "(m + n) · 2<sup>73</sup>", value: prodValue, hex: hex(t.prod, 32) },
    { name: "m", at: 5, meaning: "every digit but the last", value: t.m.toString(), hex: hex(t.m) },
    { name: "dot_one", at: 6, meaning: "n: where v sits in the cell", value: `≈ ${frac(t.dotOne, 6)} · 2<sup>64</sup>`, hex: hex(t.dotOne) },
    { name: "half_ulp", at: 7, meaning: `H: half the gap${t.even ? " (+1: ≥)" : ""}`, value: `≈ ${frac(t.halfUlp, 6)} · 2<sup>64</sup>`, hex: hex(t.halfUlp) },
    { name: "down", at: 8, meaning: "interval reaches m?", value: bool(t.down) },
    { name: "up", at: 9, meaning: "interval reaches m + 1?", value: bool(t.up) },
    { name: "half", at: 10, meaning: t.half === 0n ? "tie n = ¼: no rounding bias" : "½ + 6/2<sup>64</sup> of a digit", value: t.half === 0n ? "0" : "2<sup>63</sup> + 6", hex: hex(t.half) },
    { name: "one", at: 11, meaning: "nearest tick, round(10n)", value: t.one.toString() },
    { name: "m_up", at: 12, meaning: "the prefix to print", value: t.mUp.toString(), hex: hex(t.mUp) },
    { name: "up_down", at: 12, meaning: "drop the last digit?", value: String(t.upDown) },
  ];
}

function renderRegisters(t, step, showHex) {
  const rows = registerDefs(t).map((r) => {
    const known = step >= r.at;
    const current = r.at === step;
    const cls = ["xr-reg", known ? "" : "xr-unknown", current ? "xr-current" : ""].join(" ");
    const value = known ? r.value : "—";
    const hexLine = known && showHex && r.hex ? `<span class="xr-reg-hex">${r.hex}</span>` : "";
    return `<div class="${cls}"><code class="xr-reg-name">${r.name}</code><span class="xr-reg-meaning">${known ? r.meaning : ""}</span><span class="xr-reg-value"${known && r.hex ? ` title="${r.hex}"` : ""}>${value}</span>${hexLine}</div>`;
  });
  $("xr-regs").innerHTML = `<p class="xr-panel-title">Registers <span>meaning · value</span></p>${rows.join("")}`;
}

// ---------------------------------------------------------------- explanation

function outputOf(v) {
  const r = X.xjb64(v);
  return { ...r, text: X.formatJs(r.digits, r.exp, r.negative) };
}

function explain(t, step, v) {
  const n6 = frac(t.dotOne, 4);
  const H6 = frac(t.halfUlp, 4);
  const nNum = Number(t.dotOne) / 2 ** 64;
  const hNum = Number(t.halfUlp) / 2 ** 64;
  const cell = X.exactCell(t.c, t.q, t.k);
  switch (step) {
    case 0: {
      const sign = t.negative ? " The sign bit is set: xjb writes “−” and continues with |v|." : "";
      const how = t.subnormal
        ? `The exponent field is 0 (a subnormal), so q = −1074 and c is the fraction field alone, without a hidden bit: c = ${t.c}.`
        : `The exponent field is ${t.exp}, so q = ${t.exp} − 1075 = ${minus(t.q)}. The fraction field plus the hidden 1 bit gives c = ${t.c}.`;
      return `<strong>Decode.</strong> The bits of ${esc(String(v))} are <code>${hex(t.bits)}</code>. ${how} So v = ${t.c} · ${pw(2, t.q)} exactly. c is ${t.even ? "<em>even</em>: the ends of the rounding interval belong to v" : "<em>odd</em>: the ends of the rounding interval do not belong to v"}.${sign}`;
    }
    case 1:
      return `<strong>Line 1.</strong> k = ⌊${minus(t.q)} · log<sub>10</sub> 2⌋ = ${minus(t.k)}. The constant 78913/2<sup>18</sup> is log<sub>10</sub> 2, accurate enough for every exponent a double can have. It follows that ${pw(10, t.k)} ≤ ${pw(2, t.q)} &lt; ${pw(10, t.k + 1)}: neighbouring doubles are 1 to 10 units of ${pw(10, t.k)} apart, so the last digit worth printing is at the ${pw(10, t.k)} place. The code will scale by one decade more, ${pw(10, t.e)}.`;
    case 2:
      return `<strong>Line 2.</strong> h = ${minus(t.q)} + ⌊${minus(t.e)} · log<sub>2</sub> 10⌋ = ${minus(t.q)} + ${minus(t.h - t.q)} = ${minus(t.h)}. (217707/2<sup>16</sup> ≈ log<sub>2</sub> 10.) This is the binary exponent left over once 2<sup>q</sup> is paired with the table entry’s own power of two. It is always between −4 and −1. The source precomputes h + 10 for every exponent in a byte table (<code>h7</code>), so in the real code this line is a load.`;
    case 3:
      return `<strong>Line 3.</strong> The table word for ${pw(10, t.e)}, normalised so that bit 127 is set: ${t.entry.exact ? `${pw(10, t.e)} · ${pw(2, t.entry.shift)} exactly (entries 10<sup>0</sup> … 10<sup>55</sup> fit in 128 bits)` : `${pw(10, t.e)} · ${pw(2, t.entry.shift)} rounded <em>up</em> to an integer`}. The table has 617 entries, one per decimal exponent, enough for every double.`;
    case 4:
      return `<strong>Line 4, the one multiply.</strong> First the binary points are lined up: c &lt;&lt; (h + 10) = c · ${pw(2, t.h + 10)}. The 64×128-bit product has 192 bits, and the code keeps the top 128, which takes two hardware 64×64 multiplies. With this alignment the kept bits are (m + n) · 2<sup>73</sup>: the integer part sits above bit 73 and the fraction below it. No other wide multiplication happens on this path.`;
    case 5:
      return `<strong>Line 5.</strong> m = prod &gt;&gt; 73 = <strong>${t.m}</strong>: every digit of the answer except the last (${t.m.toString().length} digits). The table word was rounded up, yet m is always exact: the paper proves that 113 bits of the power of ten suffice, and the table keeps 128.`;
    case 6: {
      const nExact = X.fracString(cell.n.num, cell.n.den, 20);
      const diff = t.dotOne - (cell.n.num << 64n) / cell.n.den;
      if (t.dotOne === 0n) return `<strong>Line 6.</strong> dot_one = the 64 bits just below the binary point = n · 2<sup>64</sup> = 0. So n = 0 exactly: v is exactly m · ${pw(10, t.k + 1)}, and the dot sits on the left end of the cell.`;
      const lo = Math.floor(nNum * 10);
      return `<strong>Line 6.</strong> dot_one = the 64 bits just below the binary point = n · 2<sup>64</sup>. As a fraction, n ≈ <strong>${frac(t.dotOne, 10)}</strong>. The exact n is ${nExact}…, so dot_one = ⌊n · 2<sup>64</sup>⌋${diff ? " + 1 (the rounded-up table shows)" : " exactly"}. On the ruler the dot sits ${(nNum * 100).toFixed(1)}% of the way from m to m + 1, ${lo === nNum * 10 ? `exactly on tick ${lo}` : `between ticks ${lo} and ${lo + 1}`}.`;
    }
    case 7: {
      const lo = nNum - hNum;
      const hi = nNum + hNum;
      return `<strong>Line 7, no second multiply.</strong> half_ulp is the high word of the <em>same</em> table entry, shifted right by −h = ${-t.h}${t.even ? ", plus 1" : ""}. Why that works: H = 2<sup>q−1</sup> · ${pw(10, t.e)} contains no c, and the high word is ${pw(10, t.e)} scaled by a power of two, so the shift lands exactly on ⌊H · 2<sup>64</sup>⌋. H ≈ <strong>${H6}</strong>. The interval runs from n − H ≈ ${lo.toFixed(4)} to n + H ≈ ${hi.toFixed(4)}, ${(20 * hNum).toFixed(2)} ticks wide. ${t.even ? "c is even, so the code adds 1: now <code>half_ulp &gt; x</code> means H ≥ x, and an interval end landing exactly on m or m + 1 counts." : "c is odd, so there is no +1: the ends are excluded, and the strict “&gt;” is exactly right."}`;
    }
    case 8:
      return `<strong>Line 8.</strong> down = half_ulp &gt; dot_one asks whether the interval reaches back to m. ${H6} vs ${n6} → ${bool(t.down)}. ${t.down ? `Yes: m · ${pw(10, t.k + 1)} = ${X.formatJs(t.m, t.k + 1)} reads back as v, so the last digit can be dropped.` : "No: m lies outside the interval."}`;
    case 9:
      return `<strong>Line 9.</strong> up = half_ulp &gt; ~dot_one. ~dot_one = 2<sup>64</sup> − 1 − dot_one ≈ (1 − n) · 2<sup>64</sup>, so the bitwise NOT is a free “1 − n”. Does the interval reach m + 1? ${H6} vs ${(1 - nNum).toFixed(4)} → ${bool(t.up)}. ${t.up ? `Yes: (m + 1) · ${pw(10, t.k + 1)} reads back as v. Carry, and drop the last digit.` : "No."} Because 2H &lt; 1, up and down are never both true.`;
    case 10:
      return t.half === 0n
        ? `<strong>Line 10, the tie fix.</strong> dot_one == 2<sup>62</sup>: n is exactly ¼, so 10n = 2.5 is a tie between ticks 2 and 3. Ties go to the even digit, 2, so half = 0 turns the next line into a plain floor. The only other possible tie is n = ¾ (10n = 7.5), and it already rounds up to the even 8.`
        : `<strong>Line 10.</strong> half = 2<sup>63</sup> + 6, that is ½ + 6/2<sup>64</sup> of a digit. The ½ makes the next line round to nearest. The +6 is a tiny nudge that makes up for dot_one being a truncated value. The paper proves the nudge is safe for every double except ten listed ones, which were checked individually. The special value 0 is used only when dot_one == 2<sup>62</sup> (n = ¼ exactly, a tie).`;
    case 11:
      return `<strong>Line 11.</strong> one = the high word of 10 · dot_one + half = ⌊10n + ½⌋ = <strong>${t.one}</strong>, the nearest tick. ${t.upDown ? `It is computed anyway, without a branch, but ${t.up ? "up" : "down"} is set, so it will not be printed.` : "It is guaranteed to be inside the interval: neither end was reached, and the interval is at least one tick wide (H ≥ 0.05)."}`;
    case 12: {
      const d = t.coefficient;
      return `<strong>Line 12.</strong> m_up = m + up = ${t.mUp}; up_down = ${t.upDown}. The answer is d = 10 · m_up + (up_down ? 0 : one) = ${d}, times ${pw(10, t.k)}. The code never forms d. m_up and one go to the printer separately, so nothing waits on a multiply by 10 or a division.`;
    }
    default: {
      const out = outputOf(v);
      const match = out.text === String(v);
      if (t.irregular) {
        const sym = X.symmetricResult(Math.abs(v));
        return `<strong>Not done yet: this is a power of two.</strong> The fraction field is zero, so the double below v is only half a gap away. The twelve lines assumed a symmetric interval and would print “${X.formatJs(sym.digits, sym.exp, t.negative)}”${Number(X.formatJs(sym.digits, sym.exp)) === Math.abs(v) ? "" : ", which reads back as a different double"}. The source now runs its <code>[[unlikely]]</code> branch, which prints <strong>“${out.text}”</strong>. <a href="#powers">Section 4</a> steps through that branch. Number.prototype.toString gives “${String(v)}” ${match ? "✓" : "✗"}.`;
      }
      return `<strong>Print.</strong> m_up is turned into 16 ASCII digits at once (SIMD or SWAR). <code>one</code> is written after them unless up_down, and the length comes from counting trailing zeros rather than from dividing. Digits ${out.digits} × ${pw(10, out.exp)} → <strong>“${out.text}”</strong>. Number.prototype.toString gives “${String(v)}” ${match ? "✓" : "✗"}.`;
    }
  }
}

// ---------------------------------------------------------------- ruler

const RULER_W = 440;
function drawRuler(host, g) {
  const range = [Math.min(-0.1, g.n - g.lo - 0.07), Math.max(1.1, g.n + g.hi + 0.07)];
  const H = g.bumpTo != null ? 190 : 170;
  const axisY = 84;
  const x = (u) => 16 + ((u - range[0]) / (range[1] - range[0])) * (RULER_W - 32);
  const svg = el("svg", { viewBox: `0 0 ${RULER_W} ${H}`, class: "xr-ruler", role: "img" });
  el("title", {}, svg).textContent = g.label || "ruler";
  el("rect", { x: x(0), y: axisY - 26, width: x(1) - x(0), height: 52, class: "xr-cell" }, svg);
  el("line", { x1: x(range[0]), x2: x(range[1]), y1: axisY, y2: axisY, class: "xr-axis" }, svg);
  for (let i = Math.ceil(range[0] * 10); i <= Math.floor(range[1] * 10); i++) {
    const inCell = i >= 0 && i <= 10;
    const major = i === 0 || i === 10;
    el("line", { x1: x(i / 10), x2: x(i / 10), y1: axisY - (major ? 22 : 8), y2: axisY + (major ? 22 : 8), class: major ? "xr-tick-major" : inCell ? "xr-tick" : "xr-tick xr-faint" }, svg);
    if (inCell && !major) text(svg, x(i / 10), axisY + 26, String(i), "xr-tick-label");
  }
  if (g.showEnds) {
    text(svg, x(0), axisY + 46, g.leftLabel || "m", "xr-end-label");
    text(svg, x(1), axisY + 46, g.rightLabel || "m + 1", "xr-end-label");
  } else {
    text(svg, RULER_W / 2, 30, "appears once m and dot_one are known", "xr-placeholder");
  }
  if (g.showBar) {
    const lo = g.n - g.lo;
    const hi = g.n + g.hi;
    el("rect", { x: x(lo), y: axisY - 7, width: x(hi) - x(lo), height: 14, class: "xr-bar" }, svg);
    for (const end of [lo, hi]) el("circle", { cx: x(end), cy: axisY, r: 5, class: g.closed ? "xr-cap closed" : "xr-cap open" }, svg);
    text(svg, x(g.n), axisY - 34, g.barLabel || "", "xr-bar-label");
  }
  if (g.showDot) el("circle", { cx: x(g.n), cy: axisY, r: 6, class: "xr-dot" }, svg);
  if (g.down !== undefined && g.down !== null) {
    const hit = g.down;
    el("circle", { cx: x(0), cy: axisY, r: 11, class: hit ? "xr-hit" : "xr-miss" }, svg);
    text(svg, x(0), 18, hit ? "down ✓" : "down ✗", hit ? "xr-verdict yes" : "xr-verdict");
  }
  if (g.up !== undefined && g.up !== null) {
    const hit = g.up;
    el("circle", { cx: x(1), cy: axisY, r: 11, class: hit ? "xr-hit" : "xr-miss" }, svg);
    text(svg, x(1), 18, hit ? "up ✓" : "up ✗", hit ? "xr-verdict yes" : "xr-verdict");
  }
  const arrow = (to, label, cls, dy = 0) => {
    const x1 = x(g.n);
    const x2 = x(to / 10);
    const mid = (x1 + x2) / 2;
    el("path", { d: `M${x1} ${axisY + 8} Q ${mid} ${axisY + 50} ${x2} ${axisY + 10}`, class: `xr-arrow ${cls}` }, svg);
    text(svg, x2, axisY + 70 + dy, label, `xr-arrow-label ${cls}`);
  };
  if (g.nearest !== undefined && g.nearest !== null) arrow(Number(g.nearest), `nearest ${g.nearest}${g.bumpTo != null ? " (outside)" : ""}`, g.bumpTo != null ? "xr-rejected" : "");
  if (g.bumpTo !== undefined && g.bumpTo !== null) arrow(Number(g.bumpTo), `fix → ${g.bumpTo}`, "xr-fix", 20);
  if (g.choice !== undefined && g.choice !== null) {
    const cx = x(g.choice / 10);
    el("path", { d: `M${cx} ${axisY - 13} l8 13 l-8 13 l-8 -13z`, class: "xr-choice" }, svg);
  }
  host.replaceChildren(svg);
}

function rulerForStep(t, step) {
  const g = { showEnds: step >= 5, showDot: step >= 6, showBar: step >= 7, closed: t.even === 1n };
  g.n = Number(t.dotOne) / 2 ** 64;
  g.lo = g.hi = Number(t.halfUlp - t.even) / 2 ** 64;
  const mStr = t.m.toString();
  g.leftLabel = `m = …${mStr.slice(-4)}`;
  g.rightLabel = `m + 1 = …${(t.m + 1n).toString().slice(-4)}`;
  g.barLabel = step >= 7 ? `n ≈ ${g.n.toFixed(4)}, H ≈ ${g.hi.toFixed(4)}` : `n ≈ ${g.n.toFixed(4)}`;
  if (step >= 8) g.down = t.down;
  if (step >= 9) g.up = t.up;
  if (step >= 11 && !t.upDown) g.nearest = t.one;
  if (step >= 12) g.choice = t.up ? 10 : t.down ? 0 : Number(t.one);
  g.label = `Ruler from m to m+1 with ten ticks. ${step >= 6 ? `Dot at n ≈ ${g.n.toFixed(4)}.` : ""} ${step >= 7 ? `Interval from ${(g.n - g.lo).toFixed(4)} to ${(g.n + g.hi).toFixed(4)}.` : ""}`;
  return g;
}

// ---------------------------------------------------------------- bit strip

const STRIP_W = 640;
const CELL = (STRIP_W - 15 * 3) / 64;
const bitX = (i) => i * CELL + Math.floor(i / 4) * 3; // i = 0 (bit 63) … 63 (bit 0)

function drawStrip(host, rows, opts = {}) {
  const rowH = 66;
  const svg = el("svg", { viewBox: `0 0 ${STRIP_W} ${rows.length * rowH + 4}`, class: "xr-strip", role: "img" });
  el("title", {}, svg).textContent = rows.map((r) => `${r.label}: ${hex(r.value)}`).join("; ");
  rows.forEach((row, ri) => {
    const y0 = ri * rowH;
    text(svg, 0, y0 + 15, row.label + (opts.showHex ? `  ${hex(row.value)}` : ""), "xr-row-label", "start");
    for (let i = 0; i < 64; i++) {
      const bit = 63 - i;
      const field = row.fields.find((f) => bit <= f.hi && bit >= f.lo) || { cls: "z" };
      const on = ((row.value >> BigInt(bit)) & 1n) === 1n;
      const dim = opts.focus && !opts.focus.includes(field.cls);
      el("rect", { x: bitX(i), y: y0 + 21, width: CELL - 1.2, height: 18, class: `xr-bit f-${field.cls}${on ? " on" : ""}${dim ? " dim" : ""}` }, svg);
    }
    if (row.mark !== undefined && row.mark !== null) {
      const i = 63 - row.mark;
      el("rect", { x: bitX(i) - 1.5, y: y0 + 18.5, width: CELL + 1.8, height: 23, class: "xr-bit-mark" }, svg);
    }
    for (const f of row.fields) {
      if (!f.name) continue;
      const a = bitX(63 - f.hi);
      const b = bitX(63 - f.lo) + CELL - 1.2;
      el("path", { d: `M${a} ${y0 + 43} v4 H${b} v-4`, class: `xr-brace f-${f.cls}` }, svg);
      if (b - a > 30) text(svg, (a + b) / 2, y0 + 62, f.name, `xr-field-label f-${f.cls}`);
    }
  });
  host.replaceChildren(svg);
}

function firstDiff(a, b) {
  for (let bit = 63; bit >= 0; bit--) if (((a >> BigInt(bit)) & 1n) !== ((b >> BigInt(bit)) & 1n)) return bit;
  return null;
}

function stripForStep(t, step, showHex) {
  const title = $("xr-strip-title");
  const host = $("xr-strip");
  const s = t.h + 10;
  const prodRows = [
    { label: "prod, high word", value: t.hi64, fields: [{ hi: 63, lo: 9, cls: "m", name: "m" }, { hi: 8, lo: 0, cls: "n", name: "dot_one" }] },
    { label: "prod, low word", value: t.lo64, fields: [{ hi: 63, lo: 9, cls: "n", name: "dot_one (continued)" }, { hi: 8, lo: 0, cls: "x", name: "dropped" }] },
  ];
  const width = t.c.toString(2).length;
  if (step <= 2) {
    title.textContent = "Bits: the significand c in a 64-bit register";
    drawStrip(host, [{ label: "c", value: t.c, fields: [{ hi: width - 1, lo: 0, cls: "t", name: `c (${width} bits)` }] }], { showHex });
  } else if (step === 3) {
    title.textContent = "Bits: the 128-bit table word (top bit set)";
    drawStrip(host, [
      { label: "pow10, high word", value: t.pHi, fields: [{ hi: 63, lo: 0, cls: "t", name: "pow10 >> 64" }] },
      { label: "pow10, low word", value: t.pLo, fields: [{ hi: 63, lo: 0, cls: "t", name: t.entry.exact ? "exact" : "rounded up" }] },
    ], { showHex });
  } else if (step === 4) {
    title.textContent = "Bits: operand × table word → keep the top 128 of 192 bits";
    drawStrip(host, [
      { label: `c << ${s}`, value: t.operand, fields: [{ hi: width - 1 + s, lo: s, cls: "t", name: "c" }, { hi: s - 1, lo: 0, cls: "x", name: "" }] },
      ...prodRows,
    ], { showHex });
  } else if (step === 5 || step === 6) {
    title.textContent = step === 5 ? "Bits: m is everything above bit 73" : "Bits: dot_one is the 64 bits below bit 73";
    const rows = [...prodRows];
    if (step === 6) rows.push({ label: "dot_one", value: t.dotOne, fields: [{ hi: 63, lo: 0, cls: "n", name: "n · 2^64" }] });
    drawStrip(host, rows, { showHex, focus: step === 5 ? ["m"] : ["n"] });
  } else if (step >= 7 && step <= 9) {
    const rows = [];
    if (step === 7) rows.push({ label: "pow10, high word", value: t.pHi, fields: [{ hi: 63, lo: 0, cls: "t", name: `shift right by ${-t.h}` }] });
    const other = step === 9 ? t.notDot : t.dotOne;
    const mark = step >= 8 ? firstDiff(t.halfUlp, other) : null;
    rows.push({ label: `half_ulp${t.even ? "  (+1)" : ""}`, value: t.halfUlp, fields: [{ hi: 63, lo: 0, cls: "h", name: "H · 2^64" }], mark });
    rows.push({ label: step === 9 ? "~dot_one" : "dot_one", value: other, fields: [{ hi: 63, lo: 0, cls: "n", name: step === 9 ? "(1 − n) · 2^64" : "n · 2^64" }], mark });
    title.textContent = step === 7 ? "Bits: half_ulp is the table’s high word, shifted"
      : `Bits: an unsigned compare is decided by the first differing bit (outlined) → ${step === 8 ? "down" : "up"} = ${step === 8 ? t.down : t.up}`;
    drawStrip(host, rows, { showHex });
  } else if (step === 10 || step === 11) {
    title.textContent = "Bits: 10 · dot_one + half as 128 bits; the high word is the digit";
    drawStrip(host, [
      { label: "high word", value: t.tenDot >> 64n, fields: [{ hi: 3, lo: 0, cls: "o", name: step === 11 ? `one = ${t.one}` : "" }] },
      { label: "low word (discarded)", value: t.tenDot & X.M64, fields: [{ hi: 63, lo: 0, cls: "x", name: "" }] },
    ], { showHex, focus: ["o", "z"] });
  } else {
    title.textContent = "Digits: two outputs, assembled without a division";
    const out = X.stripZeros(t.coefficient, t.k);
    const mUp = t.mUp.toString();
    host.innerHTML = `<div class="xr-assembly">
      <div class="xr-asm-row"><span class="xr-asm-box m" title="m_up">${mUp}</span><span class="xr-asm-box o${t.upDown ? " dropped" : ""}" title="one">${t.upDown ? "0" : t.one}</span><span class="xr-asm-note">${t.upDown ? `up_down = 1: last digit is 0` : "one appended"}</span></div>
      <div class="xr-asm-row"><span class="xr-asm-label">strip trailing zeros →</span><span class="xr-asm-box final">${out.digits}</span><span class="xr-asm-note">× ${pw(10, out.exp)}</span></div>
      ${t.irregular ? `<p class="xr-asm-warn">Power of two: the branch in section 4 replaces these values.</p>` : ""}
    </div>`;
  }
}

// ---------------------------------------------------------------- stepper state

const state = { expr: "0.1+0.2", v: 0.1 + 0.2, trace: null, step: 0, hex: false };

function syncUrl() {
  const params = new URLSearchParams(location.search);
  params.set("x", state.expr);
  params.set("step", String(state.step));
  if (state.hex) params.set("hex", "1"); else params.delete("hex");
  history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
}

function load(expr, { keepStep = false } = {}) {
  let v;
  try {
    v = X.parseInput(expr);
    if (!Number.isFinite(v) || v === 0) throw new RangeError("Pick a finite, nonzero double.");
    if (Math.abs(v) === 5e-324) throw new RangeError("5e-324 is printed from a string constant in the source; try 1e-323.");
  } catch (err) {
    const box = $("xr-error");
    box.textContent = err.message;
    box.hidden = false;
    return false;
  }
  $("xr-error").hidden = true;
  state.expr = expr;
  state.v = v;
  state.trace = X.traceRegular(v);
  if (!keepStep) state.step = Math.min(state.step, LAST);
  $("xr-input").value = expr;
  const preset = PRESETS.findIndex((p) => p.expr === expr);
  $("xr-preset").value = preset >= 0 ? String(preset) : "";
  render();
  return true;
}

function render() {
  const t = state.trace;
  const step = state.step;
  renderCode(step);
  renderRegisters(t, step, state.hex);
  $("xr-explain").innerHTML = explain(t, step, state.v);
  drawRuler($("xr-ruler"), rulerForStep(t, step));
  stripForStep(t, step, state.hex);
  $("xr-counter").textContent = step === 0 ? "decode" : step === LAST ? "print" : `line ${step} of 12`;
  $("xr-first").disabled = $("xr-back").disabled = step === 0;
  $("xr-step").disabled = $("xr-last").disabled = step === LAST;
  syncUrl();
}

function go(step) {
  state.step = Math.max(0, Math.min(LAST, step));
  render();
}

function neighbour(dir) {
  const v = state.v;
  const next = dir > 0 ? X.nextUp(v) : X.nextDown(v);
  if (!Number.isFinite(next) || next === 0 || Math.abs(next) === 5e-324) return;
  load(`0x${X.bitsOf(next).toString(16).toUpperCase().padStart(16, "0")}`, { keepStep: true });
}

function initStepper() {
  const select = $("xr-preset");
  select.innerHTML = `<option value="" disabled>custom</option>${PRESETS.map((p, i) => `<option value="${i}">${esc(p.label)}</option>`).join("")}`;
  select.addEventListener("change", () => { if (select.value !== "") load(PRESETS[Number(select.value)].expr, { keepStep: true }); });
  $("xr-form").addEventListener("submit", (e) => { e.preventDefault(); load($("xr-input").value.trim(), { keepStep: true }); });
  $("xr-prev-double").addEventListener("click", () => neighbour(-1));
  $("xr-next-double").addEventListener("click", () => neighbour(1));
  $("xr-first").addEventListener("click", () => go(0));
  $("xr-back").addEventListener("click", () => go(state.step - 1));
  $("xr-step").addEventListener("click", () => go(state.step + 1));
  $("xr-last").addEventListener("click", () => go(LAST));
  $("xr-hex").addEventListener("change", (e) => { state.hex = e.target.checked; render(); });
  $("xr-debugger").addEventListener("keydown", (e) => {
    if (e.target.matches("input, select, textarea")) return;
    const map = { ArrowRight: state.step + 1, ArrowLeft: state.step - 1, Home: 0, End: LAST };
    if (e.key in map) { e.preventDefault(); go(map[e.key]); }
  });
  const params = new URLSearchParams(location.search);
  state.step = Math.max(0, Math.min(LAST, Number(params.get("step")) || 0));
  state.hex = params.get("hex") === "1";
  $("xr-hex").checked = state.hex;
  if (!load(params.get("x") || "0.1+0.2", { keepStep: true })) load("0.1+0.2", { keepStep: true });
}

// ---------------------------------------------------------------- the puzzle

function initPuzzle() {
  const cards = [["0.3", 0.3], ["0.1 + 0.2", 0.1 + 0.2]].map(([label, v]) => {
    const t = X.traceRegular(v);
    const path = t.up ? "up" : t.down ? "down" : "nearest";
    const exact = exactDecimal(v);
    return `<div class="xr-card">
      <p class="xr-card-label"><code>${esc(label)}</code></p>
      <p><span>bits</span><code>${hex(X.bitsOf(v))}</code></p>
      <p><span>exact value</span><code class="xr-exact">${exact.slice(0, 22)}…</code></p>
      <p><span>prints</span><code class="xr-prints">${String(v)}</code></p>
      <p><span>path</span><a href="?x=${encodeURIComponent(label.replace(/ /g, ""))}&amp;step=9#stepper"><code>${path}</code>: step through it</a></p>
    </div>`;
  });
  const diff = X.bitsOf(0.1 + 0.2) - X.bitsOf(0.3);
  $("xr-pair").innerHTML = `${cards.join("")}<p class="xr-pair-note">The bit patterns differ by ${diff}: no double lies between them.</p>`;
  for (const a of $("xr-pair").querySelectorAll("a")) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const url = new URL(a.href);
      state.step = Number(url.searchParams.get("step"));
      load(url.searchParams.get("x"), { keepStep: true });
      $("stepper").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }
}

// ---------------------------------------------------------------- powers of two

const pow = { p: 64, mode: "true" };

function syncPowUrl() {
  const params = new URLSearchParams(location.search);
  params.set("pow", String(pow.p));
  params.set("mode", pow.mode);
  history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
}

function renderPowers() {
  const v = 2 ** pow.p;
  const d = X.decompose(v);
  const q = d.q;
  const irr = X.exactIrregular(v);
  const reg = X.traceRegular(v);
  const sym = pow.mode === "sym";
  $("xr-pow-input").value = String(pow.p);
  for (const b of $("xr-pow-chips").querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.p) === pow.p));
  $("xr-mode-sym").setAttribute("aria-pressed", String(sym));
  $("xr-mode-true").setAttribute("aria-pressed", String(!sym));

  const lowerGap = pw(2, q - 1);
  const upperGap = pw(2, q);
  $("xr-pow-neighbours").innerHTML = `v = ${pw(2, pow.p)} = ${pw(2, 52)} · ${pw(2, q)}. The next double up is ${upperGap} away; the next one down is only ${lowerGap} away${pow.p === -1022 ? " (in fact, for 2<sup>−1022</sup> the neighbour below is subnormal and a full gap away, but xjb still takes the branch)" : ""}. So the true interval reaches ${pw(2, q - 2)} below v and ${pw(2, q - 1)} above.`;

  let g;
  let outText;
  let lines;
  if (sym) {
    const cell = X.exactCell(d.c, q, reg.k);
    const n = X.ratioNumber(cell.n.num, cell.n.den);
    const H = X.ratioNumber(cell.H.num, cell.H.den);
    const res = X.symmetricResult(v);
    outText = X.formatJs(res.digits, res.exp);
    g = { showEnds: true, showDot: true, showBar: true, closed: true, n, lo: H, hi: H, down: reg.down, up: reg.up, nearest: reg.upDown ? null : reg.one, choice: reg.up ? 10 : reg.down ? 0 : Number(reg.one) };
    lines = [
      `symmetric: k = ${minus(reg.k)}, cell of ${pw(10, reg.k + 1)}; m = ${cell.m}`,
      `n ≈ ${X.fracString(cell.n.num, cell.n.den, 6)}, H ≈ ${X.fracString(cell.H.num, cell.H.den, 6)} on both sides`,
      `interval [${(n - H).toFixed(4)}, ${(n + H).toFixed(4)}] → ${reg.up ? "up" : reg.down ? "down" : `nearest tick ${reg.one}`}`,
    ];
  } else {
    const n = X.ratioNumber(irr.n.num, irr.n.den);
    const H = X.ratioNumber(irr.H.num, irr.H.den);
    const L = X.ratioNumber(irr.L.num, irr.L.den);
    const res = X.stripZeros(irr.coefficient, irr.k);
    outText = X.formatJs(res.digits, res.exp);
    const nearest = irr.up || irr.down ? null : irr.nearest;
    const bump = !irr.up && !irr.down && irr.belowLower && irr.one !== irr.nearest ? irr.one : null;
    g = { showEnds: true, showDot: true, showBar: true, closed: true, n, lo: L, hi: H, down: irr.down, up: irr.up, nearest, bumpTo: bump, choice: Number(irr.one) };
    lines = [
      `lopsided: k′ = ${minus(irr.k)}${irr.k !== reg.k ? ` (the twelve lines used k = ${minus(reg.k)})` : ""}, cell of ${pw(10, irr.k + 1)}; m = ${irr.m}`,
      `n ≈ ${X.fracString(irr.n.num, irr.n.den, 6)}, L ≈ ${X.fracString(irr.L.num, irr.L.den, 6)} below, H ≈ ${X.fracString(irr.H.num, irr.H.den, 6)} above`,
      `interval [${(n - L).toFixed(4)}, ${(n + H).toFixed(4)}] → ${irr.up ? "up (carry)" : irr.down ? "down" : bump !== null ? `nearest tick ${irr.nearest} is below n − L: take ${irr.one}` : `nearest tick ${irr.one}`}`,
    ];
  }
  g.leftLabel = "m";
  g.rightLabel = "m + 1";
  g.barLabel = sym ? "symmetric ±H" : "L below, H above";
  g.label = `Ruler for 2^${pow.p}: ${lines.join(". ")}`;
  drawRuler($("xr-pow-ruler"), g);
  $("xr-pow-readout").innerHTML = `${lines.map((l) => `<div>${l}</div>`).join("")}<div>prints <strong>${esc(outText)}</strong></div>`;
  $("xr-readback").dataset.text = outText;
  $("xr-readback-out").innerHTML = "";
  syncPowUrl();
}

function readBack() {
  const str = $("xr-readback").dataset.text;
  const v = 2 ** pow.p;
  const back = Number(str);
  let verdict;
  if (back === v) verdict = `<span class="xr-ok">= ${pw(2, pow.p)} ✓ round-trips</span>`;
  else if (back === X.nextDown(v)) verdict = `<span class="xr-bad">= the double just below ${pw(2, pow.p)} ✗</span>`;
  else verdict = `<span class="xr-bad">≠ ${pw(2, pow.p)} ✗</span>`;
  const exact = exactDecimal(back);
  $("xr-readback-out").innerHTML = `Number("${esc(str)}") = <code class="xr-exact">${exact.length > 60 ? `${exact.slice(0, 60)}…` : exact}</code> ${verdict}`;
}

function initPowers() {
  const chips = $("xr-pow-chips");
  chips.innerHTML = [64, 89, 60, -1022].map((p) => `<button type="button" data-p="${p}" aria-pressed="false">2^${minus(p)}</button>`).join("");
  chips.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    pow.p = Number(b.dataset.p);
    renderPowers();
  });
  $("xr-pow-input").addEventListener("change", (e) => {
    const p = Math.round(Number(e.target.value));
    if (!Number.isFinite(p) || p < -1022 || p > 1023) { e.target.value = String(pow.p); return; }
    pow.p = p;
    renderPowers();
  });
  $("xr-mode-sym").addEventListener("click", () => { pow.mode = "sym"; renderPowers(); });
  $("xr-mode-true").addEventListener("click", () => { pow.mode = "true"; renderPowers(); });
  $("xr-readback").addEventListener("click", readBack);
  const params = new URLSearchParams(location.search);
  const p = Number(params.get("pow"));
  if (params.has("pow") && Number.isInteger(p) && p >= -1022 && p <= 1023) pow.p = p;
  if (params.get("mode") === "sym") pow.mode = "sym";
  renderPowers();
  if (params.get("readback") === "1") readBack();
  const census = () => {
    const c = X.powerOfTwoCensus();
    $("xr-census").innerHTML = `Over all ${c.total} powers of two (exponent fields 1–2046), computed in your browser: the symmetric twelve lines print a wrong string for <strong>${c.symmetricWrong}</strong>, and every one of those reads back as the double just below. k′ differs from k for ${c.kDiffers}. The round-up fix changes the digit for ${c.bumps}. The carry (up) fires for ${c.carries}; without the carry test (the paper’s published Algorithm 1), ${c.publishedWrong} of them would print a digit too many. Rulers use exact rationals; the printed strings come from the register port.`;
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 50)))(census);
}

initPuzzle();
initStepper();
initPowers();
