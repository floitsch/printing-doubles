// Copyright (C) 2026 Toit contributors.
//
// DOM code for the "From bits to characters" Żmij page (approach B): one
// selected double, one stepper walking through every stage of the pipeline.

import * as Z from "./zmij-pipeline-model.js";
import { nextUp, nextDown } from "../../js/float.js";

const PRESETS = [
  { text: "0.1", hint: "rounds down" },
  { text: "0.3", hint: "carry = round up" },
  { text: "0.1+0.2", hint: "needs the extra digit" },
  { text: "1e23", hint: "carries only because m is even" },
  { text: "5.0507837461e-27", hint: "the example in the source comment" },
  { text: "1.7976931348623157e308", label: "max double", hint: "largest finite double" },
  { text: "2/3", hint: "15-digit integral part plus a digit" },
  { text: "2^64", hint: "a power of two: the irregular path" },
];

const STAGES = { 1: "Move the point", 2: "Follow the bits", 3: "Sixteen digits", 4: "Proved vs tested" };
const STEPS = [
  { id: "yy", stage: 1, title: "Read the product at 10<sup>−k</sup> (yy's view)" },
  { id: "zmij", stage: 1, title: "Read it at 10<sup>−k−1</sup> (Żmij's view)" },
  { id: "ops", stage: 1, title: "Count the operations" },
  { id: "unpack", stage: 2, title: "Unpack the bits" },
  { id: "k", stage: 2, title: "Pick the decimal exponent" },
  { id: "table", stage: 2, title: "Fetch the power of ten and the shift" },
  { id: "product", stage: 2, title: "One 192-bit product" },
  { id: "half", stage: 2, title: "The half-ulp is a shift, not a multiply" },
  { id: "decide", stage: 2, title: "Three independent questions" },
  { id: "split", stage: 3, title: "Split into two 8-digit halves" },
  { id: "s10k", stage: 3, title: "Divide by 10<sup>4</sup> with one multiply" },
  { id: "s100", stage: 3, title: "Divide by 100 in both lanes at once" },
  { id: "s10", stage: 3, title: "Divide by 10 in four lanes at once" },
  { id: "ascii", stage: 3, title: "Add '0' to every byte" },
  { id: "length", stage: 3, title: "Count the digits without a loop" },
  { id: "layout", stage: 3, title: "Assemble the buffer" },
  { id: "ledger", stage: 4, title: "Which guarantee covers this double?" },
];
const stepIndex = (id) => STEPS.findIndex((s) => s.id === id) + 1;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, root = document) => root.querySelector(sel);

const state = { text: "0.3", x: 0.3, step: 1, hex: false };
let ctx = null;

// ------------------------------------------------------------ formatting ---

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const minus = (s) => String(s).replace(/-/g, "−");
const hex = (x, digits = 16) => "0x" + BigInt.asUintN(digits * 4, x).toString(16).padStart(digits, "0");
const bin = (x, bits) => x.toString(2).padStart(bits, "0");
const sup = (n) => `<sup>${minus(n)}</sup>`;
const pow10s = (n) => `10${sup(n)}`;
const u = (x64, places = 10) => Z.unitFraction(x64, places);

// Decimal readout with the hex word appended in hex mode.
function word(x, digits = 16) {
  return `<span class="zp-num">${minus(x.toString())}</span>${state.hex ? ` <span class="zp-hexv">${hex(x, digits)}</span>` : ""}`;
}

function ratStr(num, den, places = 10) {
  const int = num / den;
  const f = Z.fractionDigits(num % den, den, places);
  return `${int}.${f.digits}${f.cut ? "…" : ""}`;
}

function sciApprox(num, den, sig = 4) {
  // num/den > 0 as d.ddd × 10^n, for display only.
  let n = 0;
  let a = num, b = den;
  while (a >= b * 10n) { b *= 10n; n++; }
  while (a < b) { a *= 10n; n--; }
  const scaled = (a * 10n ** BigInt(sig - 1)) / b;
  const s = scaled.toString();
  return `${s[0]}.${s.slice(1)} × 10${sup(n)}`;
}

function signed(x) { return x < 0 ? `− ${-x}` : `+ ${x}`; }

// ------------------------------------------------------------- compute ---

function compute(x) {
  const r = Z.write(x);
  if (r.special) return null;
  const core = r.core;
  const exact = Z.exactScaled(x, core.q);
  const hExact = Z.exactHalfUlp(core);
  const yy = Z.yyReading(x, core);
  const js = Z.jsShortest(x);
  const mine = Z.resultDigits(r);
  return { x, r, core, exact, hExact, yy, js, mine, match: js.digits === mine.digits && js.leadExp === mine.leadExp };
}

// ------------------------------------------------------------- figures ---

function bitGrid(bits, fields) {
  // fields: [{from, to, cls}] indices into a 64-char MSB-first string.
  const s = bin(bits, 64);
  let html = "";
  for (let i = 0; i < 64; i++) {
    const f = fields.find((fd) => i >= fd.from && i < fd.to);
    html += `<span class="zp-bit ${f ? f.cls : ""} ${s[i] === "1" ? "one" : ""}">${s[i]}</span>`;
  }
  return `<div class="zp-bitgrid" aria-hidden="true">${html}</div>`;
}

function bitRow(label, x, { shift = 0, cls = "", note = "" } = {}) {
  const s = bin(BigInt.asUintN(64, x), 64);
  const cells = [...s].map((c) => `<span class="zp-bit ${cls} ${c === "1" ? "one" : ""}">${c}</span>`).join("");
  const style = shift ? ` style="--zp-shift:${shift}"` : "";
  return `<div class="zp-bitrow-wrap"><span class="zp-bitrow-label">${label}</span><div class="zp-bitrow${shift ? " zp-slide" : ""}"${style}><div class="zp-bitrow-inner">${cells}</div></div>${note ? `<span class="zp-bitrow-note">${note}</span>` : ""}</div>`;
}

function dagSvg(name, nodes, edges, height) {
  const id = `zp-arrow-${name}`;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const lines = edges.map(([a, b]) => {
    const s = byId[a], t = byId[b];
    return `<line x1="${s.x + s.w / 2}" y1="${s.y + 28}" x2="${t.x + t.w / 2}" y2="${t.y - 3}" marker-end="url(#${id})"/>`;
  }).join("");
  const boxes = nodes.map((n) => `<g class="zp-node ${n.kind || ""}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="28" rx="3"/><text x="${n.x + n.w / 2}" y="${n.y + 18}" text-anchor="middle">${n.label}</text></g>`).join("");
  return `<svg viewBox="0 0 270 ${height}" role="img" aria-label="${esc(name)} dataflow"><defs><marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs><g class="zp-edges">${lines}</g>${boxes}</svg>`;
}

function dags() {
  const schubfach = dagSvg("Schubfach", [
    { id: "a", x: 2, y: 8, w: 84, label: "v⁻ × 10⁻ᵏ", kind: "mul" },
    { id: "b", x: 93, y: 8, w: 84, label: "v × 10⁻ᵏ", kind: "mul" },
    { id: "c", x: 184, y: 8, w: 84, label: "v⁺ × 10⁻ᵏ", kind: "mul" },
    { id: "d", x: 93, y: 70, w: 84, label: "s ÷ 10", kind: "div" },
    { id: "e", x: 10, y: 132, w: 120, label: "2 short tests" },
    { id: "f", x: 140, y: 132, w: 120, label: "2 long tests" },
    { id: "g", x: 75, y: 194, w: 120, label: "pick 1 of 4", kind: "out" },
  ], [["b", "d"], ["a", "e"], ["d", "e"], ["c", "e"], ["a", "f"], ["b", "f"], ["c", "f"], ["e", "g"], ["f", "g"]], 228);
  const yy = dagSvg("yy", [
    { id: "a", x: 10, y: 8, w: 120, label: "v × 10⁻ᵏ", kind: "mul" },
    { id: "b", x: 140, y: 8, w: 120, label: "δ = p10 ≫ s", kind: "shift" },
    { id: "c", x: 10, y: 70, w: 120, label: "v̄ mod 10", kind: "div" },
    { id: "d", x: 55, y: 132, w: 160, label: "3 tests, first wins" },
    { id: "e", x: 75, y: 194, w: 120, label: "pick 1 of 4", kind: "out" },
  ], [["a", "c"], ["c", "d"], ["b", "d"], ["d", "e"]], 228);
  const zmij = dagSvg("Żmij", [
    { id: "a", x: 10, y: 8, w: 120, label: "v × 10⁻ᵏ⁻¹", kind: "mul" },
    { id: "b", x: 140, y: 8, w: 120, label: "h = p10 ≫ n", kind: "shift" },
    { id: "c", x: 2, y: 88, w: 84, label: "carry F+h", kind: "par" },
    { id: "d", x: 93, y: 88, w: 84, label: "h > F", kind: "par" },
    { id: "e", x: 184, y: 88, w: 84, label: "10F → digit", kind: "par" },
    { id: "f", x: 75, y: 170, w: 120, label: "pick 1 of 3", kind: "out" },
  ], [["a", "c"], ["a", "d"], ["a", "e"], ["b", "c"], ["b", "d"], ["c", "f"], ["d", "f"], ["e", "f"]], 204);
  return `<div class="zp-dags">
    <div><h4>Schubfach</h4>${schubfach}</div>
    <div><h4>yy</h4>${yy}</div>
    <div class="zp-dag-zmij"><h4>Żmij</h4>${zmij}</div>
  </div>`;
}

function ruler(c) {
  const core = c.core;
  const L = -0.3, R = 1.3, X0 = 24, X1 = 616;
  const X = (t) => X0 + ((t - L) / (R - L)) * (X1 - X0);
  const F = Number(core.fractional) / 2 ** 64;
  const h = Number(core.halfUlp) / 2 ** 64;
  const hd = core.regular ? h : h / 2;
  const lo = Math.max(L, F - hd), hi = Math.min(R, F + h);
  let ticks = "";
  for (let j = -2; j <= 12; j++) {
    const t = j / 10, big = j === 0 || j === 10;
    ticks += `<line class="${big ? "zp-tick-big" : "zp-tick"}" x1="${X(t)}" x2="${X(t)}" y1="${big ? 30 : 44}" y2="62"/>`;
  }
  const choice = core.roundUp ? 1 : core.roundDown ? 0 : core.digit / 10;
  const iStr = core.integralRaw.toString();
  const shortI = iStr.length > 5 ? "…" + iStr.slice(-4) : iStr;
  const shortI1 = (core.integralRaw + 1n).toString();
  return `<svg class="zp-ruler" viewBox="0 0 640 100" role="img" aria-label="Thumbnail: the scaled value between I and I+1 with its rounding interval">
    <line class="zp-axis" x1="${X0}" x2="${X1}" y1="62" y2="62"/>
    ${ticks}
    <rect class="zp-band" x="${X(lo)}" y="46" width="${Math.max(1, X(hi) - X(lo))}" height="12"/>
    <circle class="zp-choice" cx="${X(choice)}" cy="62" r="7"/>
    <circle class="zp-dot" cx="${X(F)}" cy="52" r="4"/>
    <text class="zp-rl" x="${X(0)}" y="84" text-anchor="middle">I = ${shortI}</text>
    <text class="zp-rl" x="${X(1)}" y="84" text-anchor="middle">I+1 = …${shortI1.slice(-4)}</text>
    <text class="zp-rl zp-rl-small" x="${X(F)}" y="22" text-anchor="middle">F</text>
  </svg>`;
}

function register(reg, width, { jump = false, labelFn = null } = {}) {
  const ls = Z.lanes(reg, width);
  const span = width / 8;
  const cells = ls.map((v, i) => {
    const upper = jump && i % 2 === 0; // lanes that just received a quotient
    const label = labelFn ? labelFn(v, i) : v.toString();
    const hx = state.hex ? `<small>${hex(v, width / 4)}</small>` : "";
    return `<span class="zp-lane w${width}${upper ? " zp-jump" : ""}" style="grid-column: span ${span}">${label}${hx}</span>`;
  }).join("");
  return `<div class="zp-reg">${cells}</div>`;
}

function tape(r) {
  const width = Math.max(r.tape.maxTouched, r.end + 1);
  const cell = (b, i, op, final) => {
    const inMark = op.mark && i >= op.mark[0] && i < op.mark[1];
    const past = op.end !== undefined && i >= op.end;
    const endHere = op.end !== undefined && i === op.end;
    let txt = "", cls = "";
    if (b === null) cls = "empty";
    else if (b >= 32 && b < 127) txt = esc(String.fromCharCode(b));
    else { txt = `<small>${b.toString(16).padStart(2, "0")}</small>`; cls = "ctrl"; }
    return `<span class="zp-cell ${cls}${inMark ? " mark" : ""}${past ? " past" : ""}${endHere ? " end" : ""}${final && !past ? " out" : ""}">${txt}</span>`;
  };
  const idx = Array.from({ length: width }, (_, i) => `<span class="zp-cell idx">${i}</span>`).join("");
  const rows = r.tape.ops.map((op, k) => {
    const final = k === r.tape.ops.length - 1;
    const cells = op.cells.slice(0, width).map((b, i) => cell(b, i, op, final)).join("");
    return `<li><code>${esc(op.code)}</code><div class="zp-cells">${cells}</div><p>${esc(op.note)}</p></li>`;
  }).join("");
  return `<div class="zp-tape"><div class="zp-tape-scroll"><ol><li class="zp-tape-idx"><code>byte</code><div class="zp-cells">${idx}</div></li>${rows}</ol></div></div>`;
}

// --------------------------------------------------------------- cards ---

const CARDS = {
  yy(c) {
    const y = c.yy;
    const s = y.int.toString();
    const f = Z.fractionDigits(y.frac.num, y.frac.den, 10);
    return `
      <p>Scale by <code>10${sup(c.core.q + 1)}</code> = <code>10<sup>−k</sup></code>, the scale yy uses:</p>
      <p class="zp-bigdigits" aria-label="${s}.${f.digits}"><span class="zp-int">${s.slice(0, -1)}<mark>${s.slice(-1)}</mark></span><span class="zp-pt">.</span><span class="zp-frac">${f.digits}${f.cut ? "…" : ""}</span></p>
      <dl class="zp-kv">
        <dt>d<sub>1</sub>, u<sub>1</sub></dt><dd>${y.d1} and ${y.u1} (the integers around v̄)</dd>
        <dt>d<sub>1</sub> mod 10</dt><dd class="zp-cost">${y.one} (a division by ten; yy computes <code>p.hi % 10</code>)</dd>
        <dt>d<sub>0</sub>, u<sub>0</sub></dt><dd>${y.d0} and ${y.u0} (the multiples of ten around v̄, one digit shorter)</dd>
      </dl>
      <p class="zp-note">The shorter candidates <code>d<sub>0</sub>, u<sub>0</sub></code> only exist after the <code>mod 10</code>, so a division by ten sits between the multiply and the decisions. yy's integer part has ${s.length} digits here.</p>`;
  },
  zmij(c) {
    const core = c.core;
    const s = c.exact.int.toString();
    const f = Z.fractionDigits(c.exact.num, c.exact.den, 10);
    const digit = core.regular ? core.digit : core.digitNearest;
    const tenF = Z.fractionDigits(c.exact.num * 10n % c.exact.den, c.exact.den, 4);
    return `
      <p>Scale by <code>10${sup(core.q)}</code> = <code>10<sup>−k−1</sup></code>, one place further left:</p>
      <p class="zp-bigdigits" aria-label="${s}.${f.digits}"><span class="zp-int">${s}</span><span class="zp-pt">.</span><span class="zp-frac"><mark>${f.digits[0]}</mark>${f.digits.slice(1)}${f.cut ? "…" : ""}</span></p>
      <dl class="zp-kv">
        <dt>I = ⌊c⌋</dt><dd>${s} <span class="zp-eq">= d<sub>0</sub> / 10 ✓</span></dd>
        <dt>I + 1</dt><dd>${c.exact.int + 1n} <span class="zp-eq">= u<sub>0</sub> / 10 ✓</span></dd>
        <dt>extra digit</dt><dd>round(10 × 0.${f.digits}…) = round(${(c.exact.num * 10n) / c.exact.den}.${tenF.digits}…) = <strong>${digit}</strong>, so I‖digit is d<sub>1</sub> or u<sub>1</sub>, whichever is nearer</dd>
      </dl>
      <p class="zp-note">Same candidates, new names, and no division. The two short candidates are the integer part and its successor, straight out of the product. The digit that yy had to remove is the first fraction digit, and it comes back through a ×10 that does not depend on the other two tests. The integer part has ${s.length} digits here${s.length >= 15 ? " (always 15 or 16 for normal doubles)" : " (a subnormal: fewer digits, padded later)"}.</p>`;
  },
  ops() {
    return `
      ${dags()}
      <div class="zp-table-wrap"><table class="zp-counts">
        <thead><tr><th scope="col"></th><th scope="col">Schubfach</th><th scope="col">yy</th><th scope="col">Żmij</th></tr></thead>
        <tbody>
          <tr><th scope="row">128×64-bit products with the table entry</th><td>3</td><td>1</td><td>1</td></tr>
          <tr><th scope="row">half-ulp comes from</th><td>the two bound products</td><td>table entry ≫ shift</td><td>table entry ≫ shift</td></tr>
          <tr><th scope="row">÷10 or mod 10 before deciding</th><td>1</td><td>1</td><td>0</td></tr>
          <tr><th scope="row">extra small multiply</th><td>–</td><td>–</td><td>1 (×10 for the digit, in parallel)</td></tr>
          <tr><th scope="row">candidates</th><td>4</td><td>4</td><td>3 (I, I+1, I‖digit)</td></tr>
          <tr><th scope="row">decisions</th><td>2 pairs of tests</td><td>3 tests, first that fires wins</td><td>3 independent flags</td></tr>
        </tbody>
      </table></div>
      <p class="zp-note">Counts only, taken from the code. How much they save depends on the CPU, so there are no cycle numbers here. The README's own measurements are listed under Sources.</p>`;
  },
  unpack(c) {
    const d = c.r.decoded;
    const core = c.core;
    const fields = [{ from: 0, to: 1, cls: "sign" }, { from: 1, to: 12, cls: "exp" }, { from: 12, to: 64, cls: "frac" }];
    const kind = d.subnormal ? "subnormal: no implicit bit, and it runs with raw exponent 1" : core.regular ? "regular: the neighbours are equally far on both sides" : "a power of two: the gap below is half the gap above, so this takes the irregular path";
    return `
      ${bitGrid(d.bits, fields)}
      <p class="zp-legend"><span class="zp-key sign">sign</span> <span class="zp-key exp">11 exponent bits</span> <span class="zp-key frac">52 fraction bits</span> <code>${hex(d.bits)}</code></p>
      <dl class="zp-kv">
        <dt>raw exponent</dt><dd>${d.rawExp}${d.subnormal ? " (0: subnormal)" : ""}</dd>
        <dt>m</dt><dd>${word(core.m, 14)} ${d.subnormal ? "(= fraction)" : "(= 2<sup>52</sup> + fraction)"}</dd>
        <dt>e</dt><dd>${minus(core.e)} = ${d.subnormal ? 1 : d.rawExp} − 1075</dd>
        <dt>v</dt><dd>${d.negative ? "−" : ""}m × 2${sup(core.e)} ≈ ${minus(Math.abs(c.x).toPrecision(25))}</dd>
        <dt>m is</dt><dd>${core.m & 1n ? "odd: the interval's ends are excluded" : "even: the interval's ends are included"}</dd>
        <dt>kind</dt><dd>${kind}</dd>
      </dl>
      <pre class="lab-code"><code>auto bin_exp = traits::get_exp(bits), bin_sig = traits::get_sig(bits);
dec = to_decimal(bin_sig | implicit_bit, bin_exp, /*regular=*/bin_sig != 0);</code></pre>`;
  },
  k(c) {
    const core = c.core;
    const prod = core.e * 315653 - (core.regular ? 0 : 131072);
    const ulp2 = { num: c.hExact.num * 2n, den: c.hExact.den };
    return `
      <p class="zp-formula"><code>k = (e × 315653${core.regular ? "" : " − 131072"}) &gt;&gt; 20 = (${minus(core.e)} × 315653${core.regular ? "" : " − 131072"}) &gt;&gt; 20 = ${minus(prod)} &gt;&gt; 20 = <strong>${minus(core.k)}</strong></code></p>
      <p>315653 / 2<sup>20</sup> ≈ log<sub>10</sub> 2, and the arithmetic shift rounds toward −∞, so this is <code>⌊e · log<sub>10</sub> 2⌋</code>${core.regular ? "" : ". The irregular path subtracts 131072 / 2<sup>20</sup> = 0.125 ≈ −log<sub>10</sub>(4/3), giving <code>⌊log<sub>10</sub>(¾ · 2<sup>e</sup>)⌋</code>"}. The exponent comes from <code>e</code> alone: the table index is known before the significand is even looked at.</p>
      <dl class="zp-kv">
        <dt>scale by</dt><dd><code>10<sup>−k−1</sup> = ${pow10s(core.q)}</code></dd>
        <dt>one ulp becomes</dt><dd>2${sup(core.e)} × ${pow10s(core.q)} = ${ratStr(ulp2.num, ulp2.den, 6)} units</dd>
      </dl>
      <p class="zp-note">For regular doubles, one ulp always becomes between 0.1 and 1 unit. That is what makes the short grid (whole units) coarse enough to hold at most one candidate, and the long grid (tenths) fine enough to always hold one.</p>
      <pre class="lab-code"><code>int dec_exp = compute_dec_exp(bin_exp);   // k</code></pre>`;
  },
  table(c) {
    const core = c.core, p = core.p10;
    const log2 = Math.floor((core.q * 217707) / 65536);
    const s = 127 - p.E;
    return `
      <dl class="zp-kv">
        <dt>index</dt><dd><code>q = −k − 1 = ${minus(core.q)}</code></dd>
        <dt>binary exponent</dt><dd><code>E = ⌊log<sub>2</sub> 10<sup>q</sup>⌋ = (q × 217707) &gt;&gt; 16 = ${minus(log2)}</code></dd>
        <dt>table entry</dt><dd><code>p10 = ⌊10${sup(core.q)} × 2${sup(s)}⌋</code>: a 128-bit integer with its top bit set, ${p.exact ? "<strong>exact</strong> (true for 0 ≤ q ≤ 55)" : `<strong>rounded down</strong>; the dropped part is ${ratStr(p.rem, p.den, 3)} of the last bit`}</dd>
        ${state.hex ? `<dt>p10.hi, p10.lo</dt><dd><code>${hex(p.hi)}</code> <code>${hex(p.lo)}</code></dd>` : `<dt>p10</dt><dd>${sciApprox(p.sig, 1n, 12)} (tick “show hex” for the two words)</dd>`}
        <dt>shift</dt><dd><code>e + E + 1 + 9 = ${minus(core.e)} ${signed(log2)} + 1 + 9 = <strong>${core.shift}</strong></code>, always in [6, 9]</dd>
        <dt>m ≪ shift</dt><dd>${word(core.mShifted)} (at most 62 bits)</dd>
      </dl>
      <p class="zp-note">The shift lines up the binary point of the product so that the integer part always starts at bit 137 of the 192-bit result, whatever <code>e</code> is. The “+ 9” is headroom. The Lean file explains that 3 would keep the shift non-negative, 10 would still fit <code>m ≪ shift</code> in 64 bits, and 9 lets the digit constant be shared with the base-ten multiply. The table has 649 entries. Size-optimised builds rebuild them from a compressed table (Dougall Johnson's method), and the shift is a 2,048-byte table indexed by raw exponent.</p>
      <pre class="lab-code"><code>unsigned char shift = d.exp_shifts.data[raw_exp];     // = compute_exp_shift(...) + 9
uint128 pow10 = d.pow10_significands[-dec_exp - 1];  // 10^q, rounded down</code></pre>`;
  },
  product(c) {
    const core = c.core;
    const f = Z.fractionDigits(c.exact.num, c.exact.den, 10);
    return `
      <p><code>(m ≪ shift) × p10</code>: 64 × 128 bits = 192 bits. <code>umul192_hi128</code> uses two 64×64 multiplies and keeps only the top 128 bits.</p>
      <div class="zp-bar" role="img" aria-label="192-bit product: 55 integral bits, 64 fraction bits, 9 tail bits, 64 discarded bits">
        <span class="zp-seg int" style="flex-grow:55"><b>integral</b><small>55 bits</small></span>
        <span class="zp-seg frac" style="flex-grow:64"><b>fraction F</b><small>64 bits</small></span>
        <span class="zp-seg tail" style="flex-grow:9"><b>9</b></span>
        <span class="zp-seg low" style="flex-grow:64"><b>low word</b><small>never kept</small></span>
      </div>
      <p class="zp-bar-axis" aria-hidden="true"><span style="left:0">bit 191</span><span style="left:${(55 / 192) * 100}%">137</span><span style="left:${(119 / 192) * 100}%">73</span><span style="left:${(128 / 192) * 100}%">64</span><span style="left:100%">0</span></p>
      <dl class="zp-kv">
        <dt class="zp-c-int">I = p.hi ≫ 9</dt><dd>${word(core.integralRaw, 14)}</dd>
        <dt class="zp-c-frac">F (64 bits)</dt><dd>${word(core.fractional)} ≈ <strong>${u(core.fractional)}</strong> of a unit</dd>
        <dt class="zp-c-tail">9-bit tail</dt><dd><code>${bin(core.tail, 9)}</code> (dropped)</dd>
        <dt class="zp-c-low">low 64 bits</dt><dd>${state.hex ? `<code>${hex(core.discarded)}</code> ` : ""}dropped inside the multiply</dd>
        <dt>exact c</dt><dd>v × ${pow10s(core.q)} = ${c.exact.int}.${f.digits}${f.cut ? "…" : ""}</dd>
      </dl>
      ${core.integralRaw === c.exact.int
        ? `<p class="zp-note">Here the machine's I is exactly ⌊c⌋, and its F agrees with the exact fraction to about 19 digits. Both come from one multiply.</p>`
        : `<p class="zp-callout"><strong>Just below a whole number.</strong> The exact c is ${c.exact.num === 0n ? "an integer" : "a hair above an integer"}, but the rounded-down table entry puts the machine's value a unit of 2<sup>−64</sup> below it: I = ⌊c⌋ − 1 and F = 0.99999…. That is harmless. The carry test on step 9 fires and adds the 1 back.</p>`}
      <pre class="lab-code"><code>uint128 p = umul192_hi128(pow10.hi, pow10.lo, bin_sig &lt;&lt; shift);
uint64_t integral = p.hi &gt;&gt; 9;
uint64_t fractional = p.hi &lt;&lt; 55 | p.lo &gt;&gt; 9;</code></pre>`;
  },
  half(c) {
    const core = c.core;
    const n = core.hShift;
    const hx = Z.fractionDigits(c.hExact.num % c.hExact.den, c.hExact.den, 12);
    return `
      <p class="zp-formula"><code>half_ulp = (p10.hi &gt;&gt; (10 − shift))${core.regular ? " + even" : ""} = (p10.hi &gt;&gt; ${n})${core.regular ? ` + ${core.even}` : ""}</code></p>
      <div class="zp-bitrows" aria-hidden="true">
        ${bitRow("p10.hi", core.p10.hi, { cls: "tbl" })}
        ${bitRow(`≫ ${n}`, core.p10.hi, { shift: n, cls: "tbl" })}
        ${core.regular && core.even ? bitRow("+ 1 = h", core.halfUlp, { cls: "h" }) : ""}
        ${bitRow("F", core.fractional, { cls: "fr" })}
      </div>
      <dl class="zp-kv">
        <dt>h</dt><dd>${word(core.halfUlp)} ≈ <strong>${u(core.halfUlp)}</strong> of a unit</dd>
        <dt>exact half-ulp</dt><dd>2${sup(core.e - 1)} × ${pow10s(core.q)} = ${c.hExact.num / c.hExact.den}.${hx.digits}${hx.cut ? "…" : ""}</dd>
      </dl>
      <p>Why no second multiply? The product is <code>m × 2<sup>e</sup> × 10<sup>q</sup></code>, and the entry <code>p10</code> already holds <code>10<sup>q</sup></code> at exactly the power of two that <code>shift</code> lines up. Half an ulp is <code>½ × 2<sup>e</sup> × 10<sup>q</sup></code>. That is the same entry without the <code>m</code>, so it lands in the fraction's units after a right shift by <code>10 − shift</code> bits.</p>
      ${core.regular ? `<p class="zp-note">The <code>+ even</code> (${core.even ? "applied here: m is even" : "zero here: m is odd"}) handles ties. When m is even, a decimal exactly half an ulp away still reads back as v. Adding one unit to h turns the strict tests on the next card into ≥ tests.</p>` : `<p class="zp-note">Irregular path: no <code>+ even</code>. The gap below v is half the gap above, so the downward test uses <code>h / 2</code>.</p>`}`;
  },
  decide(c) {
    const core = c.core;
    const F = core.fractional, h = core.halfUlp;
    const sumHex = core.roundUp ? `0x1_${hex(core.sum & Z.M64).slice(2)}` : hex(core.sum);
    const tenF = F * 10n;
    const tenFstr = `${tenF >> 64n}.${Z.fractionDigits(tenF & Z.M64, 1n << 64n, 4).digits}…`;
    const down = core.regular ? "h &gt; F" : "(h ≫ 1) &gt; F";
    const downLhs = core.regular ? h : h >> 1n;
    const edgeUp = core.regular && core.even && core.roundUp && F + core.halfUlpBase <= Z.M64;
    const edgeDown = core.regular && core.even && core.roundDown && !(core.halfUlpBase > F);
    let knife = "";
    if (edgeUp || edgeDown) {
      const alt = core.integralRaw * 10n + BigInt(core.digit);
      knife = `<p class="zp-callout"><strong>On the knife edge.</strong> Without the <code>+1</code> for even m, ${edgeUp ? `F + h would be one unit short of 2<sup>64</sup>` : "h would equal F"} and the flag would not fire. The output would be the 17-digit <code>${alt}e${minus(core.k)}</code>. That reads back correctly but is not the shortest. The exact values meet ${edgeUp ? "at 1 unit" : "at 0"} precisely: this is a true tie, and ties go to even.</p>`;
    }
    const tie = core.tieFix ? `<p class="zp-callout"><strong>The one special case.</strong> F = 2<sup>62</sup> means the fraction is exactly 0.25, so 10F = 2.5: a decimal tie. <code>+ 2<sup>63</sup></code> would round it up to 3, so the code forces 2 (ties go to even). 0.75 gives 7.5 → 8, which is already even.</p>` : "";
    const clamp = !core.regular && core.digitLow > core.digitNearest ? `<p class="zp-callout"><strong>Clamped.</strong> The nearest tenth (${core.digitNearest}) lies below the narrow lower half of the interval, so the code takes the lowest tenth inside it: ${core.digitLow}.</p>` : "";
    const verdict = core.roundUp ? `round up: I + 1 = ${core.integral}` : core.roundDown ? `round down: I = ${core.integral}` : `append the digit: ${core.integral}‖${core.digit}`;
    const outVal = core.hasLastDigit ? `${core.integral}${core.digit} × ${pow10s(core.k)}` : `${core.integral} × ${pow10s(core.k + 1)}`;
    return `
      <div class="zp-alus">
        <div class="zp-alu${core.roundUp ? " fired" : ""}">
          <h4>add</h4>
          <p class="zp-alu-op"><code>F + h</code></p>
          <p>${u(F, 6)} + ${u(h, 6)} = ${ratStr(core.sum, 1n << 64n, 6)}${state.hex ? `<br><code>${hex(F)} + ${hex(h)}</code><br>= <code>${sumHex}</code>` : ""}</p>
          <p>carry out of bit 63: <strong>${core.roundUp ? 1 : 0}</strong></p>
          <p class="zp-alu-flag">round_up = ${core.roundUp}</p>
          <p class="zp-alu-why">The interval reaches I + 1.</p>
        </div>
        <div class="zp-alu${core.roundDown ? " fired" : ""}">
          <h4>compare</h4>
          <p class="zp-alu-op"><code>${down}</code></p>
          <p>${u(downLhs, 6)} &gt; ${u(F, 6)}?</p>
          <p>&nbsp;</p>
          <p class="zp-alu-flag">round_down = ${core.roundDown}</p>
          <p class="zp-alu-why">The interval reaches I.</p>
        </div>
        <div class="zp-alu${core.hasLastDigit ? " fired" : ""}">
          <h4>multiply</h4>
          <p class="zp-alu-op"><code>${core.regular ? "hi64(10F + 2<sup>63</sup> + 6)" : "max(hi64(10F + 2<sup>63</sup> − 1), lowest tenth ≥ F − h/2)"}</code></p>
          <p>10F ≈ ${tenFstr} ${core.regular ? `+ ½ → <strong>${core.digit}</strong>` : `→ max(${core.digitNearest}, ${core.digitLow}) = <strong>${core.digit}</strong>`}</p>
          <p>${core.regular ? `F == 2<sup>62</sup>? ${core.tieFix ? "yes → digit = 2" : "no"}` : "&nbsp;"}</p>
          <p class="zp-alu-flag">digit = ${core.digit}${core.hasLastDigit ? "" : " (unused)"}</p>
          <p class="zp-alu-why">Nearest tenth, used only if neither flag fired.</p>
        </div>
      </div>
      <p class="zp-note">None of the three waits for another: all read only F and h. Out-of-order hardware runs them side by side, and no branch picks between them.</p>
      ${knife}${tie}${clamp}
      <dl class="zp-kv">
        <dt>verdict</dt><dd><strong>${verdict}</strong></dd>
        <dt>has_last_digit</dt><dd>!(round_up || round_down) = ${core.hasLastDigit}</dd>
        <dt>value</dt><dd>${outVal}</dd>
      </dl>
      <figure class="zp-thumb">${ruler(c)}<figcaption>The same result as geometry: the dot is F, the bar is the rounding interval, the ring is the chosen point. Whole units are I and I + 1, and the ticks are tenths. <a href="./zmij-dial.html">Approach A</a> builds the whole argument from this picture.</figcaption></figure>
      ${core.regular ? "" : `<pre class="lab-code"><code>// irregular branch ([[unlikely]]): powers of two
bool round_up = half_ulp &gt; ~uint64_t(0) - fractional;
bool round_down = (half_ulp &gt;&gt; 1) &gt; fractional;
integral += round_up;
int digit = int(umul128_add_hi64(fractional, 10, (uint64_t(1) &lt;&lt; 63) - 1));
int lo = int(umul128_add_hi64(fractional - (half_ulp &gt;&gt; 1), 10, ~uint64_t(0)));
if (digit &lt; lo) digit = lo;</code></pre>`}
      <pre class="lab-code"${core.regular ? "" : ' hidden'}><code>bool round_up = fractional + half_ulp &lt; fractional;   // carry
bool round_down = half_ulp &gt; fractional;
integral += round_up;
int digit = int(umul128_add_hi64(fractional, 10, (1ull &lt;&lt; 63) + 6));
if (fractional == (1ull &lt;&lt; 62)) digit = 2;               // 2.5 → 2
return {integral, dec_exp, digit, !(round_up || round_down)};</code></pre>`;
  },
  split(c) {
    const r = c.r, core = c.core;
    const pad = r.subnormalPad ? `<p class="zp-callout"><strong>Subnormal.</strong> to_decimal returned only ${r.subnormalPad.numDigits} digit${r.subnormalPad.numDigits === 1 ? "" : "s"} (${r.subnormalPad.before}), because the power of ten depends on the exponent alone. <code>write</code> pads it to 15 digits: (I × 10 + last digit) × 10<sup>${r.subnormalPad.numZeros}</sup> = ${r.sig}. The same formatter then applies.</p>` : "";
    return `
      ${pad}
      <dl class="zp-kv">
        <dt>I</dt><dd>${word(r.sig, 14)}${r.hasLast ? ` and the last digit <strong>${r.lastDigit}</strong>, kept aside` : ""}</dd>
        <dt>has_extra_digit</dt><dd><code>I ≥ 10<sup>15</sup></code> → ${r.hasExtra} (${r.hasExtra ? 16 : 15} digits, no counting loop)</dd>
        <dt>leading exponent</dt><dd><code>k + 15 + has_extra_digit = ${minus(r.exp)} + 15 + ${r.hasExtra ? 1 : 0} = <strong>${minus(r.decExp)}</strong></code></dd>
        <dt>hi = I / 10<sup>8</sup></dt><dd>${word(r.dig.hi, 8)}</dd>
        <dt>lo = I % 10<sup>8</sup></dt><dd>${word(r.dig.lo, 8)}${r.dig.loSkipped ? " (zero: its conversion is skipped)" : ""}</dd>
      </dl>
      <p class="zp-note">Each half fits in 27 bits. The next three steps run the same three instructions on each half. Unlike a <code>do { *--p = '0' + x % 10; } while (x /= 10);</code> loop, the work does not depend on the value.</p>
      <pre class="lab-code"><code>uint32_t hi = uint32_t(value / 100000000);
uint32_t lo = uint32_t(value % 100000000);</code></pre>`;
  },
  s10k(c) { return swarCard(c, 1); },
  s100(c) { return swarCard(c, 2); },
  s10(c) { return swarCard(c, 3); },
  ascii(c) {
    const r = c.r;
    const chars = (reg) => Z.lanes(reg + Z.ZEROS, 8).map((b) => `<span class="zp-lane w8 zp-ch" style="grid-column: span 1">'${String.fromCharCode(Number(b))}'${state.hex ? `<small>${hex(b, 2)}</small>` : ""}</span>`).join("");
    const loReg = r.dig.loSkipped ? 0n : r.dig.loBcd.digits;
    return `
      <div class="zp-halves">
        <div><h4>hi</h4><div class="zp-reg">${chars(r.dig.hiBcd.digits)}</div></div>
        <div><h4>lo${r.dig.loSkipped ? " (zeros)" : ""}</h4><div class="zp-reg">${chars(loReg)}</div></div>
      </div>
      <p>One 64-bit add of <code>0x3030303030303030</code> (<code>'0'</code> in every byte) turns eight digit values into eight ASCII characters. No byte can carry into the next: every digit is at most 9.</p>
      <p class="zp-note">The 16 characters are <code>"${r.dig.text}"</code>${r.hasLast ? ` and the extra digit is <code>'${r.lastDigit}'</code>` : ""}.${r.hasExtra ? "" : " The leading '0' comes from a 15-digit I, and the layout step deals with it."}</p>
      <pre class="lab-code"><code>return {lo_bcd.bcd + zeros, hi_bcd.bcd + zeros};  // zeros = 0x0101010101010101 * '0'</code></pre>`;
  },
  length(c) {
    const r = c.r;
    const row = (name, b, skipped) => skipped
      ? `<tr><th scope="row">${name}</th><td colspan="3">zero, not converted: contributes nothing</td></tr>`
      : `<tr><th scope="row">${name}</th><td><code>${hex(b.bcd)}</code></td><td>${b.clz}</td><td>(70 − ${b.clz}) / 8 = <strong>${b.len}</strong></td></tr>`;
    const trailing = 16 - r.dig.numDigits;
    return `
      <p>After the byte swap, the first digit is in the lowest byte, so trailing zero digits are the high zero bytes. One count-leading-zeros instruction finds them. The <code>≪ 1 | 1</code> sentinel keeps the argument non-zero, which avoids a special case for zero on x86's BSR.</p>
      <div class="zp-table-wrap"><table class="zp-counts">
        <thead><tr><th scope="col">half</th><th scope="col">bcd (swapped)</th><th scope="col">clz((bcd ≪ 1) | 1)</th><th scope="col">digits up to the last non-zero</th></tr></thead>
        <tbody>${row("hi", r.dig.hiBcd, false)}${row("lo", r.dig.loBcd, r.dig.loSkipped)}</tbody>
      </table></div>
      <dl class="zp-kv">
        <dt>num_digits</dt><dd><code>${r.dig.loSkipped ? "hi_len" : "8 + lo_len"} = ${r.dig.numDigits}</code> (${trailing} trailing zero${trailing === 1 ? "" : "s"} dropped)</dd>
        <dt>significant digits</dt><dd>${r.hasLast ? `<strong>${r.sigDigits}</strong>: there is a last digit, so all ${r.hasExtra ? 16 : 15} digits of I plus the extra one are kept, and the count above goes unused` : `<strong>${r.sigDigits}</strong>`}</dd>
      </dl>
      <p class="zp-note">If there is a last digit it is never 0, so the long output never ends in a zero. The trimming described here only happens on the short path, where I was rounded to a whole unit.</p>
      <pre class="lab-code"><code>return (size_t(70) - clz((x &lt;&lt; 1) | 1)) / 8;  // count_trailing_nonzeros</code></pre>`;
  },
  layout(c) {
    const r = c.r;
    return `
      <p>Leading exponent <code>${minus(r.decExp)}</code> is ${r.fixed ? "" : "not "}in [−4, 15], so the output is <strong>${r.fixed ? "fixed notation" : "scientific notation"}</strong>. Every store below has a fixed width and writes full blocks, even past the final end. The buffer is sized for that, and the end pointer decides what counts.</p>
      ${tape(r)}
      <p class="zp-output">Output: <strong>${esc(r.text)}</strong></p>
      <p class="zp-note">${r.fixed ? "Fixed notation uses a per-exponent layout entry: where the digits start, where the point goes and where each length ends. " : "The exponent string comes from a table of 8-byte entries, and a single 8-byte store writes it. "}Integers print without “.0” (1e15 → <code>1000000000000000</code>, 1e16 → <code>1e+16</code>). Scientific exponents have at least two digits (<code>1e-05</code>).</p>`;
  },
  ledger(c) {
    const core = c.core, r = c.r;
    const status = core.regular
      ? `<p><span class="zp-pill zp-proved">proved</span> This double takes the <strong>regular</strong> path. The decision it got in stage 2 is covered by <code>Zmij.correct</code>: shortest, correctly rounded, ties to even.</p>`
      : `<p><span class="zp-pill zp-tested">tested</span> This double is a <strong>power of two</strong>, so it takes the irregular path. The Lean proof does not cover that branch. All 2,046 such doubles are checked individually by tests.</p>`;
    return `
      ${status}
      <p><span class="zp-pill zp-tested">tested</span> The formatting of stage 3 (BCD, length, layout) is covered by unit tests, not by a proof.</p>
      <p class="zp-check">This page: the model's digits <code>${c.mine.digits}</code> with leading exponent ${minus(c.mine.leadExp)} ${c.match ? "match" : "<strong>do not match</strong>"} JavaScript's shortest round-trip output (<code>${esc(Math.abs(c.x).toExponential())}</code>) ${c.match ? "✓" : "✗"}. The string <code>${esc(r.text)}</code> ${Z.formatLikeZmij(c.x) === r.text ? "matches" : "differs from"} an independent formatter that follows Żmij's layout rules.</p>`;
  },
};

function swarCard(c, level) {
  const r = c.r;
  const h = r.dig.hiBcd, l = r.dig.loBcd;
  const regs = (b) => [b.x, b.abcdEfgh, b.abCdEfGh, b.digits];
  const widths = [64, 32, 16, 8];
  const one = (name, b, skipped) => {
    if (skipped) return `<div><h4>${name}</h4><p class="zp-skip">lo = 0: <code>to_digits</code> returns eight '0' bytes without converting.</p></div>`;
    const before = regs(b)[level - 1], after = regs(b)[level];
    return `<div><h4>${name}</h4>
      <p class="zp-reglabel">before</p>${register(before, widths[level - 1])}
      <p class="zp-reglabel">after</p>${register(after, widths[level], { jump: true })}
    </div>`;
  };
  const x = h.x;
  let math = "";
  if (level === 1) {
    math = `<p class="zp-formula"><code>q = (x × 109951163) &gt;&gt; 40</code> = ⌊x / 10<sup>4</sup>⌋ (109951163 = ⌊2<sup>40</sup> / 10<sup>4</sup>⌋ + 1)</p>
      <p class="zp-formula"><code>x + (2<sup>32</sup> − 10000) × q = q × 2<sup>32</sup> + (x − 10000 q)</code></p>
      <p>For hi: q = ⌊${x} × 109951163 / 2<sup>40</sup>⌋ = <strong>${h.q10k}</strong>, and ${x} − 10000 × ${h.q10k} = <strong>${x - 10000n * h.q10k}</strong>. One multiply-add does the division <em>and</em> moves the quotient into the upper 32-bit lane, while the remainder stays in the lower lane.</p>`;
  } else if (level === 2) {
    const [qa, qb] = Z.lanes(h.q100, 32);
    const [la, lb] = Z.lanes(h.abcdEfgh, 32);
    math = `<p class="zp-formula"><code>q = ((x × 5243) &gt;&gt; 19) &amp; 0x7f0000007f</code> (5243 = ⌊2<sup>19</sup> / 100⌋ + 1)</p>
      <p class="zp-formula"><code>x + (2<sup>16</sup> − 100) × q</code></p>
      <p>One 64-bit multiply divides both 32-bit lanes by 100: ${la} × 5243 ≫ 19 = <strong>${qa}</strong> and ${lb} × 5243 ≫ 19 = <strong>${qb}</strong>. The mask removes the fraction bits that the shift leaves between the lanes. The same multiply-add trick then lifts each quotient into the upper half of its lane.</p>`;
  } else {
    const qs = Z.lanes(h.q10, 16);
    const ls = Z.lanes(h.abCdEfGh, 16);
    math = `<p class="zp-formula"><code>q = ((x × 103) &gt;&gt; 10) &amp; 0xf000f000f000f</code> (103 = ⌊2<sup>10</sup> / 10⌋ + 1, exact for 0…99)</p>
      <p class="zp-formula"><code>x + (2<sup>8</sup> − 10) × q</code></p>
      <p>Four 16-bit lanes at once: ${ls.map((v, i) => `${v} → ${qs[i]}|${v - 10n * qs[i]}`).join(", ")}. Every byte now holds one digit, and read left to right they spell hi: <strong>${Z.lanes(h.digits, 8).join("")}</strong>.</p>`;
  }
  const code = [
    "uint64_t abcd_efgh =\n    abcdefgh + neg10k * ((abcdefgh * div10k_sig) >> div10k_exp);",
    "uint64_t ab_cd_ef_gh = abcd_efgh +\n    neg100 * (((abcd_efgh * div100_sig) >> div100_exp) & 0x7f0000007f);",
    "uint64_t a_b_c_d_e_f_g_h = ab_cd_ef_gh +\n    neg10 * (((ab_cd_ef_gh * div10_sig) >> div10_exp) & 0xf000f000f000f);",
  ][level - 1];
  return `
    ${math}
    <div class="zp-halves">${one("hi", h, false)}${one("lo", l, r.dig.loSkipped)}</div>
    <pre class="lab-code"><code>${esc(code)}</code></pre>`;
}

// --------------------------------------------------------------- build ---

function buildCards() {
  for (const list of document.querySelectorAll(".zp-cards")) {
    const stage = Number(list.dataset.stage);
    list.innerHTML = STEPS.map((s, i) => s.stage !== stage ? "" : `
      <li class="zp-card" data-step="${i + 1}" id="zp-step-${s.id}">
        <h3 class="zp-card-head"><button type="button" data-goto="${i + 1}"><span class="zp-card-n">${i + 1}</span><span class="zp-card-t">${s.title}</span></button></h3>
        <div class="zp-card-body"></div>
      </li>`).join("");
  }
}

function renderBodies() {
  STEPS.forEach((s, i) => {
    const body = document.querySelector(`#zp-step-${s.id} .zp-card-body`);
    body.innerHTML = CARDS[s.id](ctx);
  });
  document.querySelectorAll(".zp-ledger tbody tr").forEach((tr) => {
    const row = tr.dataset.row;
    const applies = row === "format" || (row === "regular" && ctx.core.regular) || (row === "irregular" && !ctx.core.regular);
    tr.classList.toggle("zp-applies", applies);
  });
}

function renderOverview() {
  const c = ctx, core = c.core, r = c.r;
  const decide = core.roundUp ? "round up" : core.roundDown ? "round down" : `append ${core.digit}`;
  const stations = [
    ["bits", "unpack", hex(r.decoded.bits), `m · 2${sup(core.e)}${core.regular ? "" : ", power of 2"}`],
    ["scale", "k", `k = ${minus(core.k)}`, `× ${pow10s(core.q)}`],
    ["product", "product", `${core.integralRaw}`, `F ≈ ${u(core.fractional, 3)}`],
    ["decide", "decide", decide, core.hasLastDigit ? `${core.integral}‖${core.digit}` : `${core.integral}`],
    ["digits", "length", `"${r.dig.text}"`, `${r.sigDigits} significant`],
    ["characters", "layout", esc(r.text), r.fixed ? "fixed" : "scientific"],
  ];
  $("#zp-overview").innerHTML = stations.map(([k, id, v, sub], i) => `
    <li><button type="button" data-goto="${stepIndex(id)}"><span class="zp-ov-k">${i + 1} · ${k}</span><span class="zp-ov-v${i === 5 ? " out" : ""}">${v}</span><span class="zp-ov-s">${sub}</span></button></li>`).join("");
}

function renderPresets() {
  $("#zp-presets").innerHTML = PRESETS.map((p) => `<button type="button" data-preset="${esc(p.text)}" title="${esc(p.hint)}" aria-pressed="${p.text === state.text}">${esc(p.label || p.text)}</button>`).join("");
}

function setStep(n, { scroll = false } = {}) {
  n = Math.max(1, Math.min(STEPS.length, n));
  state.step = n;
  const cur = STEPS[n - 1];
  document.querySelectorAll(".zp-card").forEach((card) => {
    const k = Number(card.dataset.step);
    const s = STEPS[k - 1];
    card.classList.toggle("active", k === n);
    card.classList.toggle("later", s.stage === cur.stage && k > n);
    card.querySelector(".zp-card-head button").setAttribute("aria-current", k === n ? "step" : "false");
  });
  const active = document.querySelector(`.zp-card[data-step="${n}"]`);
  // Restart the entrance animations (lane jumps, half-ulp slide).
  active.classList.remove("play");
  void active.offsetWidth;
  active.classList.add("play");
  $("#zp-player-label").innerHTML = `<span>${n}/${STEPS.length} · ${STAGES[cur.stage]}</span> <strong>${cur.title}</strong>`;
  $("#zp-step-prev").disabled = n === 1;
  $("#zp-step-next").disabled = n === STEPS.length;
  if (scroll) active.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams();
  p.set("x", state.text);
  p.set("step", state.step);
  if (state.hex) p.set("hex", "1");
  history.replaceState(null, "", `${location.pathname}?${p}${location.hash}`);
}

function setNumber(text, { fromInput = false } = {}) {
  const err = $("#zp-error");
  let x;
  try { x = Z.parseInput(text); } catch (e) { err.textContent = e.message; err.hidden = false; return false; }
  const next = compute(x);
  if (!next) {
    err.textContent = `${x} is handled before the pipeline starts (zero, infinity and NaN are written directly), so there is nothing to step through.`;
    err.hidden = false;
    return false;
  }
  err.hidden = true;
  state.text = String(text).trim();
  state.x = x;
  ctx = next;
  if (!fromInput) $("#zp-input").value = state.text;
  $("#zp-player-value").textContent = `x = ${state.text}`;
  $("#zp-prev").disabled = !Number.isFinite(nextDown(x)) || nextDown(x) === 0;
  $("#zp-next").disabled = !Number.isFinite(nextUp(x)) || nextUp(x) === 0;
  renderPresets();
  renderOverview();
  renderBodies();
  setStep(state.step);
  return true;
}

function init() {
  const p = new URLSearchParams(location.search);
  state.hex = p.get("hex") === "1";
  $("#zp-hex").checked = state.hex;
  const step = Number(p.get("step"));
  if (step >= 1 && step <= STEPS.length) state.step = step;
  buildCards();
  if (!setNumber(p.get("x") || "0.3")) setNumber("0.3");

  document.addEventListener("click", (ev) => {
    const go = ev.target.closest("[data-goto]");
    if (go) { setStep(Number(go.dataset.goto), { scroll: go.closest(".zp-overview") !== null }); return; }
    const pre = ev.target.closest("[data-preset]");
    if (pre) setNumber(pre.dataset.preset);
  });
  $("#zp-form").addEventListener("submit", (ev) => { ev.preventDefault(); setNumber($("#zp-input").value, { fromInput: true }); });
  $("#zp-prev").addEventListener("click", () => setNumber(String(nextDown(state.x))));
  $("#zp-next").addEventListener("click", () => setNumber(String(nextUp(state.x))));
  $("#zp-hex").addEventListener("change", (ev) => { state.hex = ev.target.checked; renderBodies(); setStep(state.step); });
  $("#zp-step-prev").addEventListener("click", () => setStep(state.step - 1, { scroll: true }));
  $("#zp-step-next").addEventListener("click", () => setStep(state.step + 1, { scroll: true }));
  document.documentElement.classList.add("zp-ready");
  if (p.has("step")) requestAnimationFrame(() => document.querySelector(`.zp-card[data-step="${state.step}"]`).scrollIntoView({ block: "start" }));
}

init();
