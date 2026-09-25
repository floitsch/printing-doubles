// Copyright (C) 2026 Toit contributors.
//
// DOM and interaction for the "scaling microscope" explanation of Coonen's
// Algorithm B.  All numbers come from coonen-microscope-model.js (exact BigInt
// arithmetic); nothing here is hard-coded.

import * as M from "./coonen-microscope-model.js";

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const PRESETS = [
  { x: "0.1", label: "0.1", note: "L one too low → retry" },
  { x: "1.0439", label: "1.0439", note: "sticky bit saves a fake tie" },
  { x: "8.767230337125793e-12", label: "8.767…e−12", note: "first inexact power: misrounded, still reads back" },
  { x: "5e-324", label: "5e−324", note: "largest SCALE = 340" },
  { x: "1.7976931348623157e308", label: "1.797…e308", note: "SCALE < 0: divide" },
  { x: "1e23", n: 6, label: "1e23 · N=6", note: "retry caused by a carry" },
];

const MODES = { nearest: "to nearest", zero: "toward 0", up: "up (+∞)", down: "down (−∞)" };

const state = { text: "0.1", x: 0.1, N: 17, mode: "nearest", pass: null, step: 0, zoom: 0 };
let result = null;

// ------------------------------------------------------------ formatting

const SUP = { "-": "⁻", "+": "", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", ".": "·" };
const supU = (n) => String(n).split("").map((c) => SUP[c] ?? c).join(""); // for SVG text / textContent
const sup = (n) => `<sup>${minus(n)}</sup>`; // for HTML
const minus = (s) => String(s).replace(/-/g, "−");

function sci(v, digits = 2) {
  if (v === 0) return "0";
  const [mant, exp] = Math.abs(v).toExponential(digits).split("e");
  const e = Number(exp);
  const sign = v < 0 ? "−" : "";
  if (e >= -3 && e <= 3) return sign + Number(Math.abs(v).toPrecision(digits + 1)).toString();
  return `${sign}${mant}·10${supU(e)}`;
}

/** Signed small number in ulp units, readable. */
function ulps(v, digits = 3) {
  if (v === 0) return "0";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "+";
  if (a >= 1e-4 && a < 10) return sign + a.toPrecision(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return sign + sci(a, digits - 1);
}

function pow2Err(rel) {
  if (rel === 0) return "exact";
  return `${rel > 0 ? "+" : "−"}2${supU(Math.log2(Math.abs(rel)).toFixed(1))}`;
}

function eString(digits, logx, negative) {
  const s = digits.toString();
  return `${negative ? "−" : ""}${s[0]}${s.length > 1 ? "." + s.slice(1) : ""}e${minus(logx)}`;
}

/** Group a long integer in the middle when space is tight: 87672303371257930 → 8767230337…57930 */
function shortInt(n, keep = 6) {
  const s = n.toString();
  return s.length <= keep + 2 ? s : `…${s.slice(-keep)}`;
}

const lastDigits = (n, k) => n.toString().slice(-k);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeSvg(box, height, label) {
  const W = Math.max(300, Math.round(box.clientWidth || 800));
  const root = svg("svg", { viewBox: `0 0 ${W} ${height}`, width: W, height, role: "img", "aria-label": label, class: "cm-svg" });
  box.replaceChildren(root);
  return { root, W, H: height };
}

// ------------------------------------------------------------ URL state

function readUrl() {
  const q = new URLSearchParams(location.search);
  if (q.has("x")) state.text = q.get("x");
  if (q.has("n")) state.N = clampInt(Number(q.get("n")), 1, 17, 17);
  if (q.has("mode") && MODES[q.get("mode")]) state.mode = q.get("mode");
  if (q.has("pass")) state.pass = clampInt(Number(q.get("pass")), 1, 3, null);
  if (q.has("step")) state.step = clampInt(Number(q.get("step")), 0, 6, 0);
  if (q.has("zoom")) state.zoom = clampInt(Number(q.get("zoom")), -6, 12, 0);
  if (q.has("p")) $("cm-p").value = clampInt(Number(q.get("p")), 58, 68, 64);
}

function clampInt(v, lo, hi, fallback) {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
}

function writeUrl() {
  const q = new URLSearchParams();
  q.set("x", state.text);
  if (state.N !== 17) q.set("n", state.N);
  if (state.mode !== "nearest") q.set("mode", state.mode);
  if (state.pass) q.set("pass", state.pass);
  if (state.step) q.set("step", state.step);
  if (state.zoom) q.set("zoom", state.zoom);
  const p = Number($("cm-p").value);
  if (p !== 64) q.set("p", p);
  history.replaceState(null, "", `${location.pathname}?${q}${location.hash}`);
}

// ------------------------------------------------------------ controls

function parseInput(text) {
  const t = text.trim().replace(/−/g, "-").replace(/_/g, "");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t) && !/^[+-]?(infinity|nan)$/i.test(t)) return null;
  return Number(t);
}

function setX(text, { n } = {}) {
  const v = parseInput(text);
  if (v === null) {
    $("cm-x-error").textContent = "Type a decimal number such as 0.1 or 6.02e23.";
    $("cm-x").setAttribute("aria-invalid", "true");
    return false;
  }
  $("cm-x-error").textContent = "";
  $("cm-x").removeAttribute("aria-invalid");
  state.text = text.trim();
  state.x = v;
  if (n) state.N = n;
  state.pass = null;
  state.zoom = 0;
  return true;
}

function initControls() {
  const presets = $("cm-presets");
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.label;
    b.title = p.note;
    b.dataset.x = p.x;
    b.setAttribute("aria-label", `${p.x}${p.n ? `, ${p.n} digits` : ""}: ${p.note}`);
    b.addEventListener("click", () => { if (setX(p.x, { n: p.n ?? 17 })) update(); });
    presets.append(b);
  }
  $("cm-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (setX($("cm-x").value)) update();
  });
  for (const id of ["cm-n", "cm-n2"]) {
    $(id).addEventListener("input", () => { state.N = Number($(id).value); state.pass = null; state.zoom = 0; update(); });
  }
  $("cm-mode").addEventListener("change", () => { state.mode = $("cm-mode").value; state.pass = null; update(); });
  $("cm-step").addEventListener("click", () => { state.step = state.step >= 6 ? 1 : state.step + 1; renderCards(); writeUrl(); });
  $("cm-all").addEventListener("click", () => { state.step = 0; renderCards(); writeUrl(); });
  $("cm-zoom-in").addEventListener("click", () => { state.zoom = Math.min(12, state.zoom + 1); renderBand(); writeUrl(); });
  $("cm-zoom-out").addEventListener("click", () => { state.zoom = Math.max(-6, state.zoom - 1); renderBand(); writeUrl(); });
  $("cm-zoom-auto").addEventListener("click", () => { state.zoom = 0; renderBand(); writeUrl(); });
  $("cm-p").addEventListener("input", () => { renderBudget(); writeUrl(); });

  const stickyChips = $("cm-sticky-chips");
  for (const x of ["1.0439", "0.5308290954995201", "0.1"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = x;
    b.addEventListener("click", () => { if (setX(x, { n: 17 })) { state.mode = "nearest"; update(); } });
    stickyChips.append(b);
  }
  initCatcher();
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { renderBand(); renderStrip(); renderScatter(); renderBudget(); }, 120);
  });
}

function syncControls() {
  $("cm-x").value = state.text;
  for (const id of ["cm-n", "cm-n2"]) $(id).value = state.N;
  $("cm-n-out").value = state.N;
  $("cm-n2-out").value = state.N;
  $("cm-mode").value = state.mode;
  for (const b of $("cm-presets").children) {
    const p = PRESETS.find((q) => q.x === b.dataset.x);
    b.setAttribute("aria-pressed", String(parseInput(p.x) === state.x && (p.n ?? 17) === state.N));
  }
  const label = `x = ${esc(minus(String(state.x)))} · N = ${state.N} · ${MODES[state.mode]}`;
  $("cm-band-x").innerHTML = label;
  $("cm-sticky-x").innerHTML = label;
}

// ------------------------------------------------------------ main update

function update() {
  syncControls();
  try {
    result = M.coonen(state.x, state.N, state.mode);
  } catch (err) {
    result = { error: String(err) };
  }
  renderCards();
  renderBand();
  renderStrip();
  renderSticky();
  refreshRangeOptions();
  writeUrl();
}

function currentPassIndex() {
  if (!result?.passes) return 0;
  const last = result.passes.length - 1;
  if (state.pass == null) return last;
  return Math.min(last, state.pass - 1);
}

// ------------------------------------------------------------ cards

function renderCards() {
  const box = $("cm-cards");
  const passesBox = $("cm-passes");
  if (!result || result.special || result.error) {
    passesBox.replaceChildren();
    const what = result?.special === "zero" ? "zero" : result?.special === "infinity" ? "an infinity" : result?.special === "nan" ? "a NaN" : "not convertible";
    box.innerHTML = `<div class="cm-card cm-card-wide"><h3>B0 · Special case</h3><p>This input is ${what}. Step B0 of Algorithm B dispatches zero, infinities and NaNs before any arithmetic happens. Pick a finite, non-zero double.</p></div>`;
    return;
  }
  const r = result;
  const pi = currentPassIndex();
  const pass = r.passes[pi];
  const band = M.bandOf(r, pi);

  // pass selector
  passesBox.replaceChildren();
  if (r.passes.length > 1) {
    const lbl = document.createElement("span");
    lbl.textContent = "pass:";
    passesBox.append(lbl);
    r.passes.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lab-button";
      b.textContent = `${i + 1} · SCALE ${minus(p.scale)}${p.check === "retry" ? " (retry)" : ""}`;
      b.setAttribute("aria-pressed", String(i === pi));
      b.addEventListener("click", () => { state.pass = i + 1; renderCards(); renderBand(); writeUrl(); });
      passesBox.append(b);
    });
  }

  const L = r.L;
  const lNote = r.logxLow
    ? `<span class="cm-badge cm-warn">one too low</span> The true ⌊log₁₀ x⌋ is ${minus(r.trueDecade)}. That’s safe: B6 notices the extra digit and retries.`
    : `<span class="cm-badge cm-ok">exact</span> ⌊log₁₀ x⌋ is indeed ${minus(r.trueDecade)}.`;
  const cardL = `
    <h3><span class="cm-num">1</span><span>Estimate the decade</span> <small>Algorithm L</small></h3>
    <p class="cm-why">Read x = 2<sup>E</sup> × 1.f as the fixed-point number “E.f”: a cheap value that is never above log₂ x.</p>
    <dl class="cm-dl">
      <dt>x</dt><dd>2${sup(L.E)} × ${(1 + L.f).toFixed(5)}</dd>
      <dt>L2X = E + 0.f</dt><dd>${minus(L.l2x.toFixed(5))}</dd>
      <dt>× LOG2</dt><dd>${L.log2.toFixed(5)}</dd>
      <dt>product</dt><dd>${minus(L.product.toFixed(5))}</dd>
      <dt>LOGX</dt><dd><strong>${minus(L.logx)}</strong></dd>
    </dl>
    <div class="cm-lrow">
      ${chordInset(L.f)}
      <p class="cm-why">LOG2 = 0x${L.log2Fixed.toString(16).toUpperCase()}/2¹⁶: log₁₀2 chopped to 16 bits${L.bumped ? ", plus one unit because L2X &lt; 0" : ""}. Both errors push the result down.</p>
    </div>
    <p class="cm-verdict">${lNote}</p>`;

  const cardS = `
    <h3><span class="cm-num">2</span><span>Choose SCALE</span> <small>B3</small></h3>
    <p class="cm-why">Pick the power of ten that should leave exactly N digits before the point.</p>
    <p class="cm-big">SCALE = N − 1 − LOGX<br>= ${state.N} − 1 − (${minus(pass.logx)}) = <strong>${minus(pass.scale)}</strong></p>
    <p class="cm-verdict">${pass.scale >= 0 ? `Multiply x by 10${sup(pass.scale)}.` : `SCALE is negative: divide x by 10${sup(-pass.scale)}.`}
    ${r.passes.length > 1 ? (pi === 0 ? " This is the first pass." : ` Second pass: LOGX was raised to ${minus(pass.logx)} by B6.`) : ""}</p>`;

  const q = pass.q;
  const n = Math.abs(pass.scale);
  const bits5 = M.bitLength(M.pow5(n));
  const bricks = q.bricks.map((b) => {
    if (b.kind === "exact") return `<span class="cm-brick cm-brick-exact" title="10^${b.exp} is exact: 5^${b.exp} fits in 64 bits"><b>10${sup(b.exp)}</b><small>exact${b.mulInexact ? " · product rounded" : ""}</small></span>`;
    const tag = b.pfix === 0 ? "exact" : pow2Err(b.entryRelErr);
    const fixTxt = b.fix ? ` · pfix ${b.fix > 0 ? "+1" : "−1"}` : "";
    return `<span class="cm-brick ${b.pfix === 0 ? "cm-brick-exact" : "cm-brick-round"}" title="table entry 10^${b.exp}"><b>10${sup(b.exp)}</b><small>${tag}${fixTxt}</small></span>`;
  }).join('<span class="cm-times">×</span>');
  const zmodeTxt = q.zmode === "nearest" ? "rounded to nearest" : q.zmode === "up" ? "rounded up (S0)" : "rounded down (S0)";
  const cardQ = `
    <h3><span class="cm-num">3</span><span>Build z = 10${sup(n)}</span> <small>Algorithm Q</small></h3>
    <p class="cm-why">Exact powers up to 10²⁷, plus table bricks 10²⁷, 10⁵⁵, 10¹⁰⁸, 10²⁰⁶ (all but the first rounded).</p>
    <div class="cm-bricks">${bricks}</div>
    <div class="cm-fit" aria-label="5 to the ${n} needs ${bits5} bits; the register has 64">
      <div class="cm-fitbar"><i style="width:${Math.min(100, (bits5 / 80) * 100).toFixed(1)}%" class="${bits5 <= 64 ? "cm-fits" : "cm-overflows"}"></i><b style="left:${(64 / 80) * 100}%"></b></div>
      <small>5${sup(n)} needs ${bits5} bit${bits5 === 1 ? "" : "s"}; the register holds 64</small>
    </div>
    <p class="cm-verdict">${q.exact
      ? `<span class="cm-badge cm-ok">z exact</span> |SCALE| ≤ 27, so there is no error to worry about.`
      : `<span class="cm-badge cm-warn">z rounded</span> z = 10${sup(n)} × (1 ${q.delta < 0 ? "−" : "+"} ${sci(Math.abs(q.delta), 2)}), ${zmodeTxt}. This δ is the only liar.`}</p>`;

  const P = pass.product;
  const k = P.n / P.d;
  const pFrac = M.ratToFixed(P.n - k * P.d, P.d, 18);
  const fb = band.fracBits;
  const chopUnits = fb > 0 ? pass.chopped.m & ((1n << BigInt(fb)) - 1n) : 0n;
  const regUnits = fb > 0 ? pass.reg.m & ((1n << BigInt(fb)) - 1n) : 0n;
  const denom = fb > 0 ? `2${supU(fb)}` : "1";
  const denomNum = fb > 0 && fb <= 20 ? String(2 ** fb) : denom;
  const regInt = extInt(pass.reg);
  const cardMul = `
    <h3><span class="cm-num">4</span><span>Multiply once, chop, keep a sticky bit</span> <small>Algorithm S</small></h3>
    <p class="cm-why">x ${pass.scale >= 0 ? "×" : "÷"} z goes into a 64-bit register, rounded toward zero. If anything was cut off, the last bit is set to 1.</p>
    <p class="cm-mono">x ${pass.scale >= 0 ? "×" : "÷"} z = ${k.toString()}<span class="cm-frac">${pFrac.slice(1)}…</span></p>
    ${registerStrip(pass.reg.m, band.intBits, pass.sticky)}
    <p class="cm-legend"><span class="cm-key cm-key-int"></span>${band.intBits} integer bits · <span class="cm-key cm-key-frac"></span>${fb} fraction bits${pass.sticky ? ' · <span class="cm-key cm-key-sticky"></span>sticky' : ""}</p>
    <p class="cm-mono">chopped: ${shortInt(regInt, 8)} + ${chopUnits}/${denomNum}<br>${
      pass.sticky
        ? (chopUnits === regUnits ? `tail ≠ 0 and the last bit is already 1: ${regUnits}/${denomNum}` : `tail ≠ 0 → sticky → ${regUnits}/${denomNum}`)
        : "tail = 0: the product is exact, no sticky bit"} = ${fracDecimal(regUnits, fb)}</p>`;

  const lo = M.pow10(state.N - 1);
  const hi = M.pow10(state.N);
  const digitsCount = pass.rounded.toString().length;
  let checkTxt;
  if (pass.check === "retry") {
    checkTxt = `<span class="cm-badge cm-warn">${digitsCount} digits</span> r ≥ 10${sup(state.N)}: raise LOGX to ${minus(pass.logx + 1)}, restore x and go back to step 2. ${r.logxLow && pi === 0 ? "Here L’s estimate was one too low." : "Here L was right, but rounding carried into an extra digit."}`;
  } else if (pass.check === "forced") {
    checkTxt = `<span class="cm-badge cm-warn">forced</span> r &lt; 10${sup(state.N - 1)}: replaced by 10${sup(state.N - 1)} (B6’s rare safety net).`;
  } else {
    checkTxt = `<span class="cm-badge cm-ok">${state.N} digit${state.N === 1 ? "" : "s"}</span> 10${sup(state.N - 1)} ≤ r &lt; 10${sup(state.N)}: done.`;
  }
  void lo; void hi;
  const cardRound = `
    <h3><span class="cm-num">5</span><span>Round once, count digits</span> <small>B5 · B6</small></h3>
    <p class="cm-why">The register is rounded to an integer in the chosen mode (${MODES[state.mode]}). This is the only rounding that matters.</p>
    <p class="cm-big">r = <strong>${pass.rounded}</strong></p>
    <p class="cm-verdict">${checkTxt}</p>`;

  const out = eString(r.digits, r.logx, r.negative);
  const corr = eString(r.correct.digits, r.correct.logx, r.negative);
  const cardOut = `
    <h3><span class="cm-num">6</span><span>Output</span> <small>B7 · B8</small></h3>
    <p class="cm-why">Digits d₁.d₂…d<sub>N</sub> from the integer, exponent from LOGX.</p>
    <p class="cm-out">${out}</p>
    <p class="cm-verdict">${r.isCorrect
      ? `<span class="cm-badge cm-ok">correctly rounded ✓</span>`
      : `<span class="cm-badge cm-bad">not correctly rounded ✗</span> exact rounding gives ${corr}`}
      ${state.N === 17 || r.roundTrips
        ? (r.roundTrips ? `<span class="cm-badge cm-ok">reads back to x ✓</span>` : `<span class="cm-badge cm-neutral">reads back as ${minus(String(r.readBack))}</span>`)
        : `<span class="cm-badge cm-neutral">reads back as ${minus(String(r.readBack))}</span>`}</p>
    ${!r.roundTrips && state.N < 17 ? `<p class="cm-why">With fewer than 17 digits, reading back to a different double is expected: ${state.N} digits can’t tell all doubles apart.</p>` : ""}`;

  const cards = [cardL, cardS, cardQ, cardMul, cardRound, cardOut];
  box.innerHTML = cards.map((c, i) => {
    const dim = state.step && i + 1 > state.step ? " cm-dim" : "";
    const cur = state.step && i + 1 === state.step ? " cm-current-card" : "";
    return `<section class="cm-card${dim}${cur}" aria-label="Step ${i + 1}">${c}</section>`;
  }).join("");
  $("cm-step").textContent = state.step ? `Step ${Math.min(6, state.step + 1)}/6 ▸` : "Step ▸";
  if (state.step && !reducedMotion) box.children[state.step - 1]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function extInt(ext) {
  const r = M.extToRat(ext);
  return r.n / r.d;
}

function fracDecimal(units, fb) {
  if (fb <= 0) return "0";
  const s = M.ratToFixed(units, 1n << BigInt(fb), Math.min(fb, 24));
  return s.replace(/0+$/, "").replace(/\.$/, ".0");
}

function registerStrip(m, intBits, sticky) {
  const bits = m.toString(2).padStart(64, "0");
  let cells = "";
  for (let i = 0; i < 64; i++) {
    const cls = [i < intBits ? "i" : "f", bits[i] === "1" ? "one" : "zero", sticky && i === 63 ? "st" : ""].join(" ");
    cells += `<i class="${cls}"></i>`;
  }
  return `<div class="cm-register" role="img" aria-label="64-bit register: ${intBits} integer bits, ${64 - intBits} fraction bits${sticky ? ", sticky bit set" : ""}">${cells}</div>`;
}

function chordInset(f) {
  const w = 120, h = 84, pad = 10;
  const X = (t) => pad + t * (w - 2 * pad);
  const Y = (v) => h - pad - v * (h - 2 * pad);
  let curve = "";
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    curve += `${i ? "L" : "M"}${X(t).toFixed(1)},${Y(Math.log2(1 + t)).toFixed(1)}`;
  }
  const g = Math.log2(1 + f);
  return `<svg class="cm-chord" viewBox="0 0 ${w} ${h}" role="img" aria-label="log2(1+f) is above the chord f by at most 0.086; here f = ${f.toFixed(3)}, gap ${(g - f).toFixed(3)}">
    <path d="M${X(0)},${Y(0)}L${X(1)},${Y(1)}" class="cm-chord-line"/>
    <path d="${curve}" class="cm-chord-curve"/>
    <path d="M${X(f)},${Y(f)}L${X(f)},${Y(g)}" class="cm-chord-gap"/>
    <circle cx="${X(f)}" cy="${Y(f)}" r="2.6" class="cm-chord-dot"/>
    <text x="${X(0)}" y="${pad - 1}" class="cm-tiny">log₂(1+f) vs f</text>
    <text x="${X(1)}" y="${h - 1}" text-anchor="end" class="cm-tiny">gap ${(g - f).toFixed(3)}</text>
  </svg>`;
}

// ------------------------------------------------------------ fuzz band

function renderBand() {
  const box = $("cm-band-svg");
  const read = $("cm-band-readout");
  if (!result || !result.passes) { box.replaceChildren(); read.textContent = "Pick a finite, non-zero double."; return; }
  const r = result;
  const pi = currentPassIndex();
  const b = M.bandOf(r, pi);
  const pass = b.pass;
  const H = 336;
  const { root, W } = makeSvg(box, H, "Number line of the scaled value between two neighbouring integers, with a magnified lens around the decision line");
  const narrow = W < 560;
  const x0 = 18, x1 = W - 18;
  const yA = 78, yB = 238;
  const A = (t) => x0 + t * (x1 - x0); // lens A: t in [0,1] relative to k

  // --- lens A
  const nearest = b.decisionIsHalf;
  root.append(svg("text", { x: x0, y: 16, class: "cm-lens-title" }, "one ulp₁₀: between two neighbouring outputs"));
  root.append(svg("line", { x1: x0, x2: x1, y1: yA, y2: yA, class: "cm-axis" }));
  for (const t of [0, 1]) {
    root.append(svg("line", { x1: A(t), x2: A(t), y1: yA - 9, y2: yA + 9, class: "cm-tick" }));
    const val = b.k + BigInt(t);
    root.append(svg("text", { x: A(t), y: yA + 26, "text-anchor": t ? "end" : "start", class: "cm-label" }, narrow ? shortInt(val) : val.toString()));
  }
  if (nearest) {
    root.append(svg("line", { x1: A(0.5), x2: A(0.5), y1: yA - 30, y2: yA + 16, class: "cm-decision" }));
    root.append(svg("text", { x: A(0.5), y: yA + 30, "text-anchor": "middle", class: "cm-label cm-red" }, narrow ? ".5" : `${shortInt(b.k)}.5`));
  } else {
    for (const t of [0, 1]) root.append(svg("line", { x1: A(t), x2: A(t), y1: yA - 30, y2: yA + 12, class: "cm-decision" }));
  }
  // band + markers on lens A
  const yT = b.yFrac;
  if (b.h > 0) {
    const bl = A(yT + b.bandLo), br = A(yT + b.bandHi);
    root.append(svg("rect", { x: Math.min(bl, br - 2), y: yA - 11, width: Math.max(2, br - bl), height: 22, class: "cm-band" }));
  }
  // the printed integer (final pass) or this pass's rounded value
  const printed = pass.rounded;
  const correctInt = pi === r.passes.length - 1 && r.correct.logx === r.logx ? r.correct.digits : null;
  const tPrinted = Number(printed - b.k);
  if (tPrinted === 0 || tPrinted === 1) {
    root.append(svg("path", { d: `M${A(tPrinted)},${yA + 40} l-7,10 h14 z`, class: "cm-printed" }));
    root.append(svg("text", { x: A(tPrinted) + (tPrinted ? -12 : 12), y: yA + 50, "text-anchor": tPrinted ? "end" : "start", class: "cm-label cm-red" }, pass.check === "retry" ? "rounds here (then retry)" : "Coonen prints"));
  }
  if (correctInt !== null && correctInt !== printed) {
    const tc = Number(correctInt - b.k);
    if (tc === 0 || tc === 1) {
      root.append(svg("path", { d: `M${A(tc)},${yA + 40} l-7,10 h14 z`, class: "cm-correct" }));
      root.append(svg("text", { x: A(tc) + (tc ? -12 : 12), y: yA + 50, "text-anchor": tc ? "end" : "start", class: "cm-label cm-blue" }, "correct"));
    }
  }
  if (b.shift !== 0) root.append(svg("path", { d: diamond(A(yT + b.shift), yA, 5), class: "cm-p" }));
  root.append(svg("circle", { cx: A(yT), cy: yA, r: 6, class: "cm-y" }));

  // --- lens B: magnified window
  const anchorC = Math.abs(b.yOff) <= Math.max(0.05, 4 * b.h);
  const pos = anchorC
    ? { y: b.yOff, p: b.pOff, r: b.rOff, c: 0 }
    : { y: 0, p: b.shift, r: b.rMinusY, c: -b.yOff };
  let extent = anchorC
    ? Math.max(Math.abs(b.yOff) + b.h, Math.abs(b.pOff), Math.abs(b.rOff))
    : Math.max(b.h, Math.abs(b.shift), Math.abs(b.rMinusY), b.h === 0 ? b.grid : 0);
  if (!(extent > 0)) extent = b.grid * 2;
  // auto window: the smallest 1-2-5 step that holds everything interesting
  const want = 2.4 * extent;
  const dec = 10 ** Math.floor(Math.log10(want));
  let Wn = [1, 2, 5, 10].map((f) => f * dec).find((w) => w >= want * (1 - 1e-12));
  Wn *= 10 ** -state.zoom;
  Wn = Math.min(1, Math.max(1e-30, Wn));
  const mid = (x0 + x1) / 2;
  const B = (v) => mid + (v / Wn) * (x1 - x0);
  const inB = (v) => Math.abs(v) <= Wn / 2 * 1.0001;

  // connector from lens A
  const anchorT = anchorC ? Number(b.c.n - b.k * b.c.d) / Number(b.c.d) : yT;
  const aL = A(anchorT - Wn / 2), aR = A(anchorT + Wn / 2);
  const aw = Math.max(3, aR - aL);
  const ax = Math.min(Math.max(x0 - 1.5, (aL + aR) / 2 - aw / 2), x1 - aw + 1.5);
  root.append(svg("rect", { x: ax, y: yA - 16, width: aw, height: 32, class: "cm-lensmark" }));
  root.append(svg("path", { d: `M${ax},${yA + 16} L${x0},${yB - 54} M${ax + aw},${yA + 16} L${x1},${yB - 54}`, class: "cm-connector" }));
  const mag = 1 / Wn;
  const magTxt = mag < 1e5 ? `×${Math.round(mag).toLocaleString("en-US")}` : `×${sci(mag, 0)}`;
  root.append(svg("text", { x: x0, y: yB - 62, class: "cm-lens-title" }, `magnified ${magTxt} · window ${sci(Wn, 0)} ulp₁₀${state.zoom ? " (manual zoom)" : ""}`));

  root.append(svg("line", { x1: x0, x2: x1, y1: yB, y2: yB, class: "cm-axis" }));
  // register grid
  const grid = b.grid;
  if (grid > 0 && Wn / grid <= 240) {
    const phase = anchorC ? 0 : b.gridPhaseY; // anchor − (grid point at or below anchor)
    const jmin = Math.ceil((-Wn / 2 + phase) / grid), jmax = Math.floor((Wn / 2 + phase) / grid);
    for (let j = jmin; j <= jmax; j++) {
      const v = j * grid - phase;
      root.append(svg("line", { x1: B(v), x2: B(v), y1: yB - 9, y2: yB + 9, class: "cm-grid" }));
    }
  }
  if (grid > 0 && Wn / grid <= 240 && Wn / grid >= 1.5) {
    root.append(svg("text", { x: x1, y: yB + 86, "text-anchor": "end", class: "cm-label cm-muted" }, `grey ticks: 64-bit register grid, 1/2${supU(b.fracBits)}`));
  }
  // scale ticks
  for (let j = -5; j <= 5; j++) {
    const v = (j * Wn) / 10;
    root.append(svg("line", { x1: B(v), x2: B(v), y1: yB, y2: yB + (j % 5 === 0 ? 12 : 7), class: "cm-tick" }));
  }
  const anchorName = anchorC ? (nearest ? `${narrow ? "" : shortInt(b.k)}.5` : shortInt(b.c.n)) : "exact x·10ˢ";
  root.append(svg("text", { x: x0, y: yB + 28, class: "cm-label" }, ulps(-Wn / 2, 2)));
  root.append(svg("text", { x: x1, y: yB + 28, "text-anchor": "end", class: "cm-label" }, ulps(Wn / 2, 2)));
  if (anchorC && !narrow) root.append(svg("text", { x: mid, y: yB + 28, "text-anchor": "middle", class: "cm-label" }, anchorName));

  if (b.h > 0) {
    const lo = pos.y + b.bandLo, hi = pos.y + b.bandHi;
    const l = B(Math.max(lo, -Wn / 2)), rr = B(Math.min(hi, Wn / 2));
    if (rr > l) root.append(svg("rect", { x: l, y: yB - 16, width: Math.max(2, rr - l), height: 32, class: "cm-band" }));
  }
  if (inB(pos.c)) {
    root.append(svg("line", { x1: B(pos.c), x2: B(pos.c), y1: yB - 50, y2: yB + 16, class: "cm-decision" }));
    root.append(svg("text", { x: B(pos.c) + (B(pos.c) > x1 - 110 ? -5 : 5), y: yB - 42, "text-anchor": B(pos.c) > x1 - 110 ? "end" : "start", class: "cm-label cm-red" }, "decision line"));
  } else {
    edgeArrow(root, pos.c < 0 ? x0 : x1, yB - 42, pos.c < 0, "decision line", "cm-red");
  }
  // markers with labels
  const labelRow = { y: yB - 22, p: yB + 44, r: yB + 62 };
  const cX = inB(pos.c) ? B(pos.c) : null;
  if (b.shift !== 0) markerB(root, B, inB, pos.p, "p", labelRow.p, "x·z with Coonen’s z", x0, x1, null);
  markerB(root, B, inB, pos.y, "y", labelRow.y, b.shift === 0 ? "exact x·10ˢ = x·z (z exact)" : "exact x·10ˢ", x0, x1, cX);
  markerB(root, B, inB, pos.r, "r", labelRow.r, "64-bit register", x0, x1, null);

  // readout
  const Y = b.Y;
  const yInt = Y.n / Y.d;
  const yFracStr = M.ratToFixed(Y.n - yInt * Y.d, Y.d, 21).slice(1);
  const lines = [];
  lines.push(`Y = x · 10${sup(pass.scale)} = ${yInt}${yFracStr}…`);
  if (b.h === 0) {
    lines.push(`z = 10${sup(Math.abs(pass.scale))} is exact, so there is no band: Coonen rounds Y itself (via the register, which the sticky bit keeps on the correct side).`);
  } else {
    lines.push(`δ = ${sci(b.delta, 3)} → Coonen rounds Y ${b.shift < 0 ? "−" : "+"} ${sci(Math.abs(b.shift), 3)} ulp₁₀. Proven band: ${nearest ? "±" : b.bandHi > 0 ? "+" : "−"}${sci(b.h, 3)} ulp₁₀ (= Y × ${nearest ? "3.5·2⁻⁶⁴" : "5·2⁻⁶³"}).`);
  }
  lines.push(`Distance of Y from the nearest decision line (${nearest ? "k + ½" : "an integer"}): ${ulps(b.yOff, 4)} ulp₁₀.`);
  let verdict;
  if (pass.check === "retry") verdict = `This pass is thrown away: it produced ${pass.rounded.toString().length} digits and B6 retries with SCALE ${minus(pass.scale - 1)}.`;
  else if (b.h === 0) verdict = `<strong>No band → correctly rounded.</strong>`;
  else if (!b.straddles) verdict = `<strong>The band stays clear of the decision line</strong> (${sci(Math.abs(b.yOff), 2)} &gt; ${sci(b.h, 2)}), so no error in z could change the digits: correctly rounded.`;
  else if (r.isCorrect) verdict = `<strong>The band straddles the decision line.</strong> The power of ten’s error could have flipped the last digit; this time it pushed the value the harmless way.`;
  else {
    const err = Math.abs(ratDiffNum(r.digits, Y));
    verdict = `<strong>Misrounded.</strong> The shift carried the value across the line: Coonen prints …${lastDigits(r.digits, 3)}, the correctly rounded integer is …${lastDigits(r.correct.digits, 3)}. Its distance from x is ${err.toFixed(6)} ulp₁₀ instead of at most ${nearest ? "0.5" : "1"}, well within the bound, and ${r.roundTrips ? "the output still reads back to the same double." : "it reads back differently (expected for N < 17)."}`;
  }
  lines.push(verdict);
  read.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

function ratDiffNum(integer, Y) {
  return M.ratToNumber(integer * Y.d - Y.n, Y.d);
}

function diamond(cx, cy, s) {
  return `M${cx},${cy - s}L${cx + s},${cy}L${cx},${cy + s}L${cx - s},${cy}Z`;
}

function markerB(root, B, inB, v, kind, labelY, text, x0, x1, avoidX) {
  if (!inB(v)) {
    edgeArrow(root, v < 0 ? x0 : x1, labelY, v < 0, text, kind === "y" ? "cm-blue" : "");
    return;
  }
  const cx = B(v);
  const yB = 238;
  if (kind === "y") root.append(svg("circle", { cx, cy: yB, r: 6.5, class: "cm-y" }));
  else if (kind === "p") root.append(svg("path", { d: diamond(cx, yB, 5.5), class: "cm-p" }));
  else root.append(svg("path", { d: `M${cx},${yB + 6} l-5,9 h10 z`, class: "cm-r" }));
  let anchor = cx < x0 + 120 ? "start" : cx > x1 - 120 ? "end" : "middle";
  let tx = cx;
  if (avoidX !== null && avoidX !== undefined && Math.abs(cx - avoidX) < 70) {
    // keep the label clear of the decision line: put it on the far side
    anchor = cx >= avoidX ? "start" : "end";
    tx = cx >= avoidX ? Math.max(cx, avoidX) + 6 : Math.min(cx, avoidX) - 6;
  }
  root.append(svg("line", { x1: cx, x2: cx, y1: kind === "y" ? yB - 8 : yB + (kind === "r" ? 16 : 7), y2: kind === "y" ? labelY + 4 : labelY - 11, class: "cm-leader" }));
  root.append(svg("text", { x: tx, y: labelY, "text-anchor": anchor, class: `cm-label ${kind === "y" ? "cm-blue" : ""}` }, text));
}

function edgeArrow(root, x, y, left, text, cls) {
  const d = left ? `M${x + 10},${y - 5} l-8,5 l8,5` : `M${x - 10},${y - 5} l8,5 l-8,5`;
  root.append(svg("path", { d, class: "cm-arrow" }));
  root.append(svg("text", { x: left ? x + 14 : x - 14, y: y + 4, "text-anchor": left ? "start" : "end", class: `cm-label ${cls}` }, `${text} (outside)`));
}

// ------------------------------------------------------------ exactness strip

function renderStrip() {
  const box = $("cm-strip-svg");
  const read = $("cm-strip-readout");
  const N = state.N;
  const neg = result?.negative ?? false;
  const magMode = M.magnitudeMode(state.mode, neg);
  const H = 190;
  const { root, W } = makeSvg(box, H, `Bars showing the widest possible error band for each decade of x at N = ${N}`);
  const x0 = 12, x1 = W - 12, yBase = 128, yTop = 30;
  const lo = -324, hi = 308;
  const X = (k) => x0 + ((k - lo) / (hi + 1 - lo)) * (x1 - x0);
  const bound = M.deltaBound(magMode) * 10 ** N;
  const Yv = (v) => yBase - Math.min(1, v / bound) * (yBase - yTop);
  // exact zone
  const zLo = Math.max(lo, N - 28), zHi = Math.min(hi, N + 26);
  root.append(svg("rect", { x: X(zLo), y: yTop - 8, width: X(zHi + 1) - X(zLo), height: yBase - yTop + 8, class: "cm-zone" }));
  root.append(svg("text", { x: (X(zLo) + X(zHi + 1)) / 2, y: yTop + 24, "text-anchor": "middle", class: "cm-label cm-green" }, W < 560 ? "exact" : "z exact"));
  // bars as one path
  let d = "";
  let worst = { v: 0, k: 0 };
  const values = new Map();
  for (let k = lo; k <= hi; k++) {
    const s = N - 1 - k;
    const zmode = magMode === "nearest" ? "nearest" : s < 0 ? (magMode === "up" ? "down" : "up") : magMode;
    const v = Math.abs(M.deltaOf(Math.abs(s), zmode)) * 10 ** N;
    values.set(k, { s, v });
    if (v > worst.v) worst = { v, k };
    if (v > 0) d += `M${X(k).toFixed(2)},${yBase}V${Yv(v).toFixed(2)}H${X(k + 1).toFixed(2)}V${yBase}`;
  }
  root.append(svg("path", { d, class: "cm-bars" }));
  root.append(svg("line", { x1: x0, x2: x1, y1: yTop, y2: yTop, class: "cm-boundline" }));
  root.append(svg("text", { x: x1, y: yTop - 4, "text-anchor": "end", class: "cm-label" }, `Coonen’s bound ${sci(bound, 2)} ulp₁₀`));
  root.append(svg("line", { x1: x0, x2: x1, y1: yBase, y2: yBase, class: "cm-axis" }));
  const ticks = W < 560 ? [-300, -150, 0, 150, 300] : [-300, -250, -200, -150, -100, -50, 0, 50, 100, 150, 200, 250, 300];
  for (const t of ticks) {
    root.append(svg("line", { x1: X(t), x2: X(t), y1: yBase, y2: yBase + 6, class: "cm-tick" }));
    root.append(svg("text", { x: X(t), y: yBase + 20, "text-anchor": "middle", class: "cm-label" }, t === 0 ? "1" : `10${supU(t)}`));
  }
  root.append(svg("text", { x: x0, y: yBase + 40, class: "cm-label cm-muted" }, "x = 5e−324"));
  root.append(svg("text", { x: x1, y: yBase + 40, "text-anchor": "end", class: "cm-label cm-muted" }, "x = 1.8e308"));
  // current x
  let cur = null;
  if (result?.passes) {
    cur = result.logx;
    root.append(svg("path", { d: `M${X(cur + 0.5)},${yBase + 2} l-6,10 h12 z`, class: "cm-printed" }));
    root.append(svg("text", { x: X(cur + 0.5), y: yBase + 56, "text-anchor": X(cur) < x0 + 60 ? "start" : X(cur) > x1 - 60 ? "end" : "middle", class: "cm-label cm-red" }, "your x"));
  }
  const hover = svg("line", { x1: 0, x2: 0, y1: yTop - 8, y2: yBase, class: "cm-hover", visibility: "hidden" });
  root.append(hover);
  const describe = (k) => {
    const { s, v } = values.get(k);
    const zone = Math.abs(s) <= 27 ? "z is exact: always correctly rounded" : `widest band ${sci(v, 2)} ulp₁₀ (|δ| = ${sci(v / 10 ** N, 2)})`;
    return `x in [10${supU(k)}, 10${supU(k + 1)}): SCALE = ${minus(s)}, ${zone}.`;
  };
  const summary = `N = ${N}, ${MODES[state.mode]}: z is exact for x from 10${sup(zLo)} up to 10${sup(zHi + 1)}. The widest band anywhere is ${sci(worst.v, 2)} ulp₁₀ (at x ≈ 10${sup(worst.k)}), against Coonen’s proven bound of ${sci(bound, 2)}.`;
  read.innerHTML = `<div>${summary}</div><div id="cm-strip-hover">${cur !== null ? describe(Math.max(lo, Math.min(hi, cur))) : ""}</div>`;
  const onMove = (ev) => {
    const rect = root.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const k = Math.max(lo, Math.min(hi, Math.floor(lo + ((px - x0) / (x1 - x0)) * (hi + 1 - lo))));
    hover.setAttribute("x1", X(k + 0.5)); hover.setAttribute("x2", X(k + 0.5)); hover.setAttribute("visibility", "visible");
    $("cm-strip-hover").textContent = describe(k);
  };
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerdown", onMove);
}

// ------------------------------------------------------------ sticky table

function renderSticky() {
  const table = $("cm-sticky-table");
  if (!result?.passes) { table.innerHTML = ""; return; }
  const variants = [
    ["coonen", "Coonen: chop + sticky bit"],
    ["chop", "chop, no sticky bit"],
    ["nearest", "round the product to nearest"],
  ];
  const verdicts = [];
  const rows = variants.map(([v, label]) => {
    const res = M.coonen(state.x, state.N, state.mode, { product: v });
    const band = M.bandOf(res);
    const fb = band.fracBits;
    const units = fb > 0 ? band.pass.reg.m & ((1n << BigInt(fb)) - 1n) : 0n;
    const den = fb <= 20 ? String(2 ** fb) : `2${supU(fb)}`;
    const ok = res.digits === res.correct.digits && res.logx === res.correct.logx;
    const tie = fb > 0 && units === 1n << BigInt(fb - 1);
    verdicts.push(ok);
    return `<tr class="${v === "coonen" ? "cm-row-main" : ""}"><th scope="row">${label}</th><td class="cm-mono">${units}/${den} = ${fracDecimal(units, fb)}${tie ? ' <span class="cm-badge cm-warn">fake tie</span>' : ""}</td><td class="cm-mono">…${lastDigits(res.digits, 4)}</td><td>${ok ? '<span class="cm-badge cm-ok">✓</span>' : '<span class="cm-badge cm-bad">✗</span>'}</td></tr>`;
  });
  const P = result.passes.at(-1).product;
  const k = P.n / P.d;
  const exactFrac = M.ratToFixed(P.n - k * P.d, P.d, 20).slice(1);
  const allWrong = verdicts.every((v) => !v);
  const note = allWrong
    ? "All three are wrong here: this misround comes from the rounded power of ten, not from storing the product."
    : verdicts[0] && verdicts.some((v) => !v)
      ? "Only chop + sticky gets this one right."
      : "All three agree here; try the buttons above for inputs where they don’t.";
  $("cm-sticky-note").textContent = note;
  table.innerHTML = `<caption>fraction of x·z: <span class="cm-mono">${exactFrac}…</span></caption><thead><tr><th scope="col">product stored as</th><th scope="col">register fraction</th><th scope="col">rounds to</th><th scope="col">right?</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

// ------------------------------------------------------------ misround catcher

const catcher = { running: false, stats: null, points: [], found: [], key: "" };

function initCatcher() {
  $("cm-run").addEventListener("click", startCatch);
  $("cm-stop").addEventListener("click", () => { catcher.running = false; });
  $("cm-range").addEventListener("change", () => resetCatch());
  resetCatch();
}

function refreshRangeOptions() {
  const sel = $("cm-range");
  const prev = sel.value;
  const N = state.N;
  const D = result?.trueDecade ?? 0;
  const firstInexact = N - 29; // SCALE = 28
  const opts = [
    ["near", `x’s decade: [10${supU(D)}, 10${supU(D + 1)})`],
    ["edge", `just past the exact zone: [10${supU(firstInexact)}, 10${supU(firstInexact + 1)})`],
    ["one", "[1, 10) (inside the exact zone)"],
    ["all", "all doubles (random bit patterns)"],
  ];
  sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  sel.value = opts.some(([v]) => v === prev) ? prev : "edge";
  const key = `${sel.value}|${N}|${state.mode}|${sel.value === "near" ? D : ""}`;
  if (key !== catcher.key) resetCatch();
}

function rangeSpec() {
  const v = $("cm-range").value;
  if (v === "near") return { kind: "decade", k: result?.trueDecade ?? 0 };
  if (v === "edge") return { kind: "decade", k: state.N - 29 };
  if (v === "one") return { kind: "decade", k: 0 };
  return { kind: "all" };
}

function resetCatch() {
  catcher.running = false;
  catcher.stats = { tried: 0, wrong: 0, rtFail: 0, exactZone: 0, exactWrong: 0, maxShift: 0, near: 0 };
  catcher.points = [];
  catcher.found = [];
  const D = result?.trueDecade ?? 0;
  catcher.key = `${$("cm-range").value}|${state.N}|${state.mode}|${$("cm-range").value === "near" ? D : ""}`;
  renderScatter();
  renderStats();
}

function startCatch(ev, sync = false) {
  resetCatch();
  catcher.running = true;
  $("cm-run").disabled = true;
  $("cm-stop").disabled = false;
  const spec = rangeSpec();
  const N = state.N, mode = state.mode;
  const R = M.deltaBound(M.magnitudeMode(mode, false)) * 10 ** N;
  const total = 20000;
  const chunk = () => {
    if (!catcher.running) return finish();
    const t0 = performance.now();
    while (catcher.stats.tried < total && (sync || performance.now() - t0 < 14)) {
      const x = M.randomDouble(spec);
      const c = M.classify(x, N, mode);
      const s = catcher.stats;
      s.tried++;
      if (!c.isCorrect) { s.wrong++; if (catcher.found.length < 12) catcher.found.push(c); }
      if (!c.roundTrips) s.rtFail++;
      if (c.zExact) { s.exactZone++; if (!c.isCorrect) s.exactWrong++; }
      s.maxShift = Math.max(s.maxShift, Math.abs(c.shift));
      if (Math.abs(c.offset) <= R) { s.near++; if (catcher.points.length < 3000) catcher.points.push(c); }
    }
    renderScatter();
    renderStats();
    if (catcher.stats.tried >= total) return finish();
    requestAnimationFrame(chunk);
  };
  const finish = () => {
    catcher.running = false;
    $("cm-run").disabled = false;
    $("cm-stop").disabled = true;
    renderScatter();
    renderStats();
  };
  if (sync) chunk(); else requestAnimationFrame(chunk);
}

function renderStats() {
  const s = catcher.stats;
  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(3)}%` : "—");
  const rtNote = state.N === 17 ? "" : " <small>(expected with N &lt; 17)</small>";
  $("cm-stats").innerHTML = `
    <dl class="cm-dl cm-statlist">
      <dt>doubles tried</dt><dd>${s.tried.toLocaleString("en-US")}</dd>
      <dt>not correctly rounded</dt><dd class="${s.wrong ? "cm-red" : ""}">${s.wrong} <small>${pct(s.wrong, s.tried)}</small></dd>
      <dt>z exact (|SCALE| ≤ 27)</dt><dd>${s.exactZone} <small>· ${s.exactWrong} wrong</small></dd>
      <dt>round-trip failures</dt><dd>${s.rtFail}${s.rtFail ? rtNote : ""}</dd>
      <dt>largest shift seen</dt><dd>${sci(s.maxShift, 2)} ulp₁₀</dd>
      <dt>within the bound of a line</dt><dd>${s.near}</dd>
    </dl>`;
  const found = $("cm-found");
  if (!catcher.found.length) { found.innerHTML = s.tried ? "<p>No misround caught (yet).</p>" : ""; return; }
  found.innerHTML = `<p>Caught (click to inspect):</p>`;
  const chips = document.createElement("div");
  chips.className = "lab-chips";
  for (const c of catcher.found) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = String(c.x);
    b.addEventListener("click", () => {
      if (setX(String(c.x))) { update(); $("band").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" }); }
    });
    chips.append(b);
  }
  found.append(chips);
}

function renderScatter() {
  const box = $("cm-scatter-svg");
  const size = Math.min(420, Math.max(280, box.clientWidth || 360));
  const { root, W } = makeSvg(box, size, "Scatter plot of samples near a decision line: distance from the line against the shift caused by the power of ten. Misrounds lie in the red wedges.");
  const pad = 34;
  const x0 = pad, x1 = W - 10, y0 = 10, y1 = size - pad;
  const bound = M.deltaBound(M.magnitudeMode(state.mode, false)) * 10 ** state.N;
  // scale to the largest shift seen so far (never beyond Coonen's bound)
  const seen = catcher.stats?.maxShift ?? 0;
  const R = seen > 0 ? Math.min(bound, 1.25 * seen) : bound;
  const X = (v) => x0 + ((v + R) / (2 * R)) * (x1 - x0);
  const Y = (v) => y1 - ((v + R) / (2 * R)) * (y1 - y0);
  // wedges: offset + shift has the opposite sign of offset
  root.append(svg("path", { d: `M${X(0)},${Y(0)} L${X(R)},${Y(-R)} L${X(0)},${Y(-R)} Z M${X(0)},${Y(0)} L${X(-R)},${Y(R)} L${X(0)},${Y(R)} Z`, class: "cm-wedge" }));
  root.append(svg("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: "cm-frame" }));
  root.append(svg("line", { x1: X(0), x2: X(0), y1: y0, y2: y1, class: "cm-decision" }));
  root.append(svg("line", { x1: x0, x2: x1, y1: Y(0), y2: Y(0), class: "cm-axis-thin" }));
  root.append(svg("text", { x: (x0 + x1) / 2, y: size - 8, "text-anchor": "middle", class: "cm-label" }, "Y − decision line (ulp₁₀) →"));
  root.append(svg("text", { x: 12, y: (y0 + y1) / 2, transform: `rotate(-90 12 ${(y0 + y1) / 2})`, "text-anchor": "middle", class: "cm-label" }, "shift from z (ulp₁₀) →"));
  root.append(svg("text", { x: x0, y: y1 + 14, class: "cm-label cm-muted" }, ulps(-R, 2)));
  root.append(svg("text", { x: x1, y: y1 + 14, "text-anchor": "end", class: "cm-label cm-muted" }, ulps(R, 2)));
  root.append(svg("text", { x: X(R * 0.55), y: Y(-R * 0.85), "text-anchor": "middle", class: "cm-label cm-red" }, "misround"));
  root.append(svg("text", { x: X(-R * 0.55), y: Y(R * 0.8), "text-anchor": "middle", class: "cm-label cm-red" }, "misround"));
  const g = svg("g");
  for (const c of catcher.points) {
    if (Math.abs(c.offset) > R) continue;
    const bad = !c.isCorrect;
    g.append(svg("circle", { cx: X(c.offset), cy: Y(Math.max(-R, Math.min(R, c.shift))), r: bad ? 4 : 1.8, class: bad ? "cm-dot-bad" : c.zExact ? "cm-dot-exact" : "cm-dot" }));
  }
  root.append(g);
}

// ------------------------------------------------------------ budget

function renderBudget() {
  const p = Number($("cm-p").value);
  $("cm-p-out").value = `${p} bits`;
  const b = M.recoveryBudget(p);
  const box = $("cm-budget-svg");
  const { root, W } = makeSvg(box, 120, `Round-trip budget with a ${p}-bit significand: ${b.total.toFixed(3)} of 1 ulp2`);
  const x0 = 12, x1 = W - 12;
  const max = 1.3;
  const X = (v) => x0 + (Math.min(v, max) / max) * (x1 - x0);
  const segs = [
    [0, b.ratio * 0.5, "cm-seg-print", "print rounding"],
    [b.ratio * 0.5, b.print, "cm-seg-extra", "extra"],
    [b.print, b.print + 0.5, "cm-seg-read", "read rounding"],
    [b.print + 0.5, b.total, "cm-seg-extra", "extra"],
  ];
  const y = 30, h = 30;
  for (const [a, c, cls] of segs) root.append(svg("rect", { x: X(a), y, width: Math.max(1, X(c) - X(a)), height: h, class: cls }));
  if (W >= 480) {
    root.append(svg("text", { x: (X(0) + X(b.ratio * 0.5)) / 2, y: y + 19, "text-anchor": "middle", class: "cm-label cm-onbar" }, "print ≤ 0.45"));
    root.append(svg("text", { x: (X(b.print) + X(b.print + 0.5)) / 2, y: y + 19, "text-anchor": "middle", class: "cm-label cm-onbar" }, "read ≤ 0.5"));
  }
  const over = b.total >= 1;
  root.append(svg("line", { x1: X(1), x2: X(1), y1: 14, y2: y + h + 16, class: over ? "cm-limit cm-limit-bad" : "cm-limit" }));
  root.append(svg("text", { x: X(1), y: 11, "text-anchor": "middle", class: `cm-label ${over ? "cm-red" : ""}` }, "1 ulp₂"));
  root.append(svg("line", { x1: x0, x2: x1, y1: y + h + 8, y2: y + h + 8, class: "cm-axis-thin" }));
  for (const t of [0, 0.25, 0.5, 0.75, 1, 1.25]) {
    root.append(svg("text", { x: X(t), y: y + h + 26, "text-anchor": t === 0 ? "start" : "middle", class: "cm-label cm-muted" }, String(t)));
  }
  root.append(svg("text", { x: X(b.total), y: y + h + 44, "text-anchor": b.total > 1.15 ? "end" : "middle", class: `cm-label ${over ? "cm-red" : ""}` }, `total ${b.total.toFixed(3)}`));
  $("cm-budget-readout").innerHTML = `
    <div>print: ${b.ratio.toFixed(4)} × (0.5 + ${b.printExtra.toFixed(4)}) = ${b.print.toFixed(4)} ulp₂ · read (Algorithm D): 0.5 + ${b.readExtra.toFixed(4)} = ${b.read.toFixed(4)} ulp₂</div>
    <div>${over
      ? `<strong>total ${b.total.toFixed(3)} ≥ 1 ulp₂</strong>: with ${p} bits the recovery proof no longer goes through.`
      : `<strong>total ${b.total.toFixed(3)} &lt; 1 ulp₂</strong>: 17 digits always read back to the same double${p === 64 ? ", with 3% to spare" : ""}.`}</div>`;
}

// ------------------------------------------------------------ boot

const autoCatch = new URLSearchParams(location.search).get("catch") === "1";
readUrl();
setX(state.text, {}) || setX("0.1");
{
  // readUrl may have set n / pass / step / zoom; setX reset pass and zoom
  const q = new URLSearchParams(location.search);
  if (q.has("pass")) state.pass = clampInt(Number(q.get("pass")), 1, 3, null);
  if (q.has("zoom")) state.zoom = clampInt(Number(q.get("zoom")), -6, 12, 0);
}
initControls();
update();
renderBudget();
if (autoCatch) startCatch(null, true);
