// Copyright (C) 2026 Toit contributors.
//
// DOM code for the "machine and map" page: the Burger & Dybvig stepping machine
// (Part 1) and the dtoa() route map (Part 2). All numbers come from the model.

import {
  bdRun, bdCode, dtoaRun, parseInput, formatJs, exactDecimal, ratio, bitLength,
  MACHINE_PRESETS, ROUTE_PRESETS, BD_DEFAULTS,
} from "./descendants-machine-model.js";

const SVG = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sup = (n) => `<sup>${String(n).replace("-", "−")}</sup>`;
const minus = (n) => String(n).replace(/^-/, "−");

/** Abbreviate a BigInt for display: full if short, else head…tail (N digits). */
function big(x, max = 24) {
  const s = x.toString();
  if (s.length <= max) return s;
  return `${s.slice(0, 9)}…${s.slice(-6)} <span class="dm-dim">(${s.length} digits)</span>`;
}
function num(x, p = 6) {
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e-4 && a < 1e7) return minus(String(Number(x.toPrecision(p))));
  const [m, e] = x.toExponential(p - 1).split("e");
  return `${minus(String(Number(m)))}·10${sup(Number(e))}`;
}
function shortExact(v, max = 48) {
  const s = exactDecimal(v);
  if (s.length <= max) return s;
  return `${s.slice(0, 22)}…${s.slice(-10)} <span class="dm-dim">(${s.replace(".", "").replace(/^0+/, "").length} significant digits)</span>`;
}
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}
function text(parent, x, y, str, attrs = {}) {
  const t = el("text", { x, y, ...attrs }, parent);
  t.textContent = str;
  return t;
}

// ---------------------------------------------------------------------------
// URL state

const params = new URLSearchParams(location.search);
const state = {
  x: parseInput(params.get("x") ?? "0.1"),
  opts: {
    tiesEven: params.get("ties") !== "0",
    symBug: params.get("bug") === "1",
    kFromV: params.get("kv") === "1",
    tie: params.get("tie") === "even" ? "even" : "up",
  },
  step: params.get("step") ?? "0",
  route: parseInput(params.get("route") ?? "1e23"),
  station: params.get("station"),
};
if (!(state.x > 0) || !Number.isFinite(state.x)) state.x = 0.1;

function saveUrl() {
  const p = new URLSearchParams();
  p.set("x", String(state.x));
  if (!state.opts.tiesEven) p.set("ties", "0");
  if (state.opts.symBug) p.set("bug", "1");
  if (state.opts.kFromV) p.set("kv", "1");
  if (state.opts.tie === "even") p.set("tie", "even");
  p.set("step", String(state.stepIndex));
  p.set("route", String(state.route));
  if (state.station) p.set("station", state.station);
  history.replaceState(null, "", `${location.pathname}?${p}${location.hash}`);
}

// ---------------------------------------------------------------------------
// Part 1: the machine

let run = null;

function loadMachine(v, keepStep = false) {
  state.x = v;
  run = bdRun(v, state.opts);
  const last = run.frames.length - 1;
  if (!keepStep) state.stepIndex = 0;
  else if (state.step === "end") state.stepIndex = last;
  else state.stepIndex = Math.max(0, Math.min(last, Number(state.step) || 0));
  $("bd-input").value = presetLabel(v, MACHINE_PRESETS);
  for (const b of $("bd-presets").querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.v) === v));
  renderCode();
  renderFrame();
}
function presetLabel(v, list) {
  const p = list.find((q) => q.value === v);
  return p ? p.label : String(v);
}

function renderCode() {
  const pre = $("bd-code");
  pre.textContent = "";
  bdCode(state.opts).forEach((line, i) => {
    const span = document.createElement("span");
    span.className = "dm-line" + (line.changed ? " dm-changed" : "");
    span.dataset.tag = line.tag;
    span.textContent = line.text + "\n";
    pre.appendChild(span);
  });
}

const ROW_TEXT = {
  1: "row 1 (e ≥ 0, f ≠ 2⁵²)",
  2: "row 2 (e ≥ 0, f = 2⁵²: power of two)",
  3: "row 3 (e < 0, not a power of two, or subnormal)",
  4: "row 4 (e < 0, f = 2⁵²: power of two)",
};

function explainFrame(fr) {
  const o = run.opts;
  const incl = fr.lowOk ?? run.frames[0].lowOk;
  switch (fr.phase) {
    case "init": {
      let s = `<p><strong>Table 1, ${ROW_TEXT[fr.row]}.</strong> v = f·2${sup(fr.e)} with f = ${fr.f}. Now r/s = v exactly, and m⁺/s, m⁻/s are the half-gaps to the neighbours.</p>`;
      if (fr.row === 2 || fr.row === 4) s += `<p>v is a power of two: the double below is twice as close, so m⁺ = 2·m⁻.</p>`;
      if (o.symBug && fr.realPow2) s += `<p class="dm-warn">Bug switch: v is a power of two, but the buggy code uses the symmetric row. m⁻ is now twice too big, so the machine accepts decimals that read back as the double below.</p>`;
      s += `<p>f is ${fr.even ? "even" : "odd"}${o.tiesEven ? "" : " (but the strict-reader switch is on)"}, so the boundaries are <strong>${incl ? "allowed" : "excluded"}</strong>: lowOk = highOk = ${incl}.</p>`;
      return s;
    }
    case "estimate":
      return `<p><strong>Estimate.</strong> The top bit of v is at position e + len(f) − 1 = ${minus(fr.n)}, so 2${sup(fr.n)} ≤ v &lt; 2${sup(fr.n + 1)}. Then k ≈ ⌈${minus(fr.n)} · 0.30103… − 10${sup(-10)}⌉ = ⌈${minus((fr.n * Math.log10(2)).toFixed(4))}⌉ = <strong>${minus(fr.est)}</strong>. This is either the true k or one less.</p>`;
    case "scale":
      return fr.est >= 0
        ? `<p><strong>Scale.</strong> est = ${fr.est} ≥ 0, so s ×= 10${sup(fr.est)}: one multiplication by a table entry. Now r/s = v/10${sup(fr.est)} ≈ ${num(ratio(fr.r, fr.s))}.</p>`
        : `<p><strong>Scale.</strong> est = ${minus(fr.est)} &lt; 0, so r, m⁺ and m⁻ are multiplied by 10${sup(-fr.est)}. Now r/s = v·10${sup(-fr.est)} ≈ ${num(ratio(fr.r, fr.s))}.</p>`;
    case "fixup":
      if (o.kFromV) {
        return fr.low
          ? `<p><strong>Fixup, k from v (switch).</strong> r ≥ s: v itself reaches 10${sup(fr.est)}, so k = est + 1 = ${fr.k}. Skip the ×10.</p>`
          : `<p><strong>Fixup, k from v (switch).</strong> r &lt; s: v is below 10${sup(fr.est)}, so k = ${fr.k}. The top of the interval is <em>not</em> checked. Multiply r, m± by 10.</p>`;
      }
      return fr.low
        ? `<p><strong>Free fixup.</strong> r + m⁺ ${incl ? "≥" : "&gt;"} s: the top of the rounding interval already reaches 10${sup(fr.est)}, so the estimate was one low. k = est + 1 = <strong>${fr.k}</strong>. The ×10 that generate needs is simply not done, so the correction costs nothing.</p>`
        : `<p><strong>Fixup.</strong> r + m⁺ ${incl ? "&lt;" : "≤"} s: the estimate was right, k = <strong>${minus(fr.k)}</strong>. Multiply r, m⁺, m⁻ by 10 so the first digit sits left of the point.</p>`;
    case "digit": {
      const c1 = `tc1: r ${incl ? "≤" : "&lt;"} m⁻? <strong>${fr.tc1 ? "yes" : "no"}</strong>`;
      const c2 = `tc2: r + m⁺ ${incl ? "≥" : "&gt;"} s? <strong>${fr.tc2 ? "yes" : "no"}</strong>`;
      let s = `<p><strong>Digit ${fr.digits.length}.</strong> d = ⌊r/s⌋ = <strong>${fr.d}</strong>, and r becomes the remainder (r/s ≈ ${num(ratio(fr.r0, fr.s), 4)}). ${c1}; ${c2}.</p>`;
      if (!fr.stop) s += `<p>Neither d nor d + 1 is close enough to v. Keep ${fr.d}, multiply r, m± by 10, and repeat.</p>`;
      else if (fr.why === "low") s += `<p>The remainder is inside the low stop zone: the digits so far already read back as v. Emit <strong>${fr.emitted}</strong>.</p>`;
      else if (fr.why === "high") s += `<p>The remainder is inside the high stop zone: rounding the last digit up reads back as v. Emit d + 1 = <strong>${fr.emitted}</strong>.</p>`;
      else s += `<p>Both d and d + 1 read back as v. Take the nearer: 2r ${fr.tieCase ? "=" : ratio(2n * fr.r0, fr.s) < 1 ? "&lt;" : "&gt;"} s${fr.tieCase ? `, an exact tie, broken ${o.tie === "even" ? "to the even digit" : "upward (B&amp;D)"}` : ""}. Emit <strong>${fr.emitted}</strong>.</p>`;
      if (fr.emitted === 10) s += `<p class="dm-warn">9 + 1 = 10 does not fit in a digit: a carry is needed.</p>`;
      return s;
    }
    case "carry":
      return `<p><strong>Carry.</strong> The 10 ripples left through any 9s. Here it becomes ${fr.digits.join("")} and k = ${fr.k}. This is exactly what dtoa's <code>round_9_up</code> → <code>roundoff</code> does. B&amp;D never need it, because they choose k from the top of the interval.</p>`;
    case "done": {
      return `<p><strong>Done.</strong> v ≈ 0.${fr.digits.join("")} × 10${sup(fr.k)}, printed as <strong>${esc(run.text)}</strong>.</p>`;
    }
  }
  return "";
}

function renderFrame() {
  const fr = run.frames[state.stepIndex];
  const last = run.frames.length - 1;
  $("bd-count").textContent = `step ${state.stepIndex + 1} / ${last + 1}`;
  $("bd-back").disabled = state.stepIndex === 0;
  $("bd-next").disabled = state.stepIndex === last;
  $("bd-end").disabled = state.stepIndex === last;
  for (const line of $("bd-code").children) line.classList.toggle("hl", fr.tags.includes(line.dataset.tag));
  $("bd-explain").innerHTML = explainFrame(fr);
  drawCell(fr);
  // State readout.
  const dl = $("bd-state");
  const rows = [
    ["r", `${big(fr.r)} <span class="dm-dim">· ${bitLength(fr.r)} bits</span>`],
    ["s", `${big(fr.s)} <span class="dm-dim">· ${bitLength(fr.s)} bits</span>`],
    ["m⁺", big(fr.mp)],
    ["m⁻", big(fr.mm)],
    ["r/s", num(ratio(fr.r, fr.s), 8)],
    ["m⁺/s", num(ratio(fr.mp, fr.s), 4)],
    ["k", fr.phase === "init" ? "—" : minus(fr.k)],
    ["digits", fr.digits.length ? `0.<strong>${fr.digits.map((d) => (d === 10 ? "[10]" : d)).join("")}</strong> × 10${sup(fr.k)}` : "—"],
  ];
  dl.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  // Result.
  const js = String(state.x);
  const back = run.roundTrips
    ? `<span class="dm-ok">reads back as v ✓</span>`
    : `<span class="dm-bad">reads back as ${shortExact(run.readsBack)} ✗ (v = ${shortExact(state.x)})</span>`;
  const done = state.stepIndex === last;
  $("bd-result").innerHTML =
    `${done ? "Output" : "Final output"}: <strong>${esc(run.text)}</strong> · ${back}<br>` +
    `JavaScript prints ${esc(js)}${run.text === js ? " (same)" : " (different)"} · exact v = ${shortExact(state.x)}`;
  saveUrl();
}

// The digit cell: a strip of ten cells showing r/s before the digit, the
// big cell [0, s] with the remainder, and two zoom lenses at its ends.
function drawCell(fr) {
  const host = $("bd-cell");
  host.textContent = "";
  const narrow = host.clientWidth > 0 && host.clientWidth < 520;
  const W = narrow ? 370 : 560, H = 262;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-labelledby": "bd-cell-desc" }, host);
  const desc = el("desc", { id: "bd-cell-desc" }, svg);
  const X0 = 20, X1 = W - 20, L = X1 - X0;
  const incl = run.frames[0].lowOk;
  const isDigit = fr.phase === "digit";
  const inGen = isDigit || fr.phase === "carry" || fr.phase === "done";
  const rr = isDigit ? fr.r0 : fr.r;
  const R = ratio(rr, fr.s);

  // Top strip: which tenth (digit) did r/s before the division fall into?
  const yT = 26;
  if (isDigit) {
    text(svg, X0, 14, narrow ? "10·r/s before division → digit d" : "10 · r/s before the division: digit d = which cell", { class: "dm-svg-label" });
    for (let i = 0; i < 10; i++) {
      const x = X0 + (L * i) / 10;
      el("rect", { x, y: yT, width: L / 10, height: 22, class: i === fr.d ? "dm-tenth dm-tenth-on" : "dm-tenth" }, svg);
      text(svg, x + L / 20, yT + 15, String(i), { class: "dm-svg-digit", "text-anchor": "middle" });
    }
    const pos = Math.min(10, ratio(fr.before, fr.s));
    el("circle", { cx: X0 + (L * pos) / 10, cy: yT + 22, r: 4, class: "dm-dot" }, svg);
    // zoom connector
    const a = X0 + (L * fr.d) / 10, b = a + L / 10;
    el("path", { d: `M${a},${yT + 22} L${X0},${96} M${b},${yT + 22} L${X1},${96}`, class: "dm-zoomline" }, svg);
  } else {
    const label = {
      init: "r/s = v itself: nothing is scaled yet",
      estimate: "r/s = v itself: nothing is scaled yet",
      scale: "r/s = v / 10^est: should land near [0.1, 1]",
      fixup: "fixup gate: does r + m⁺ reach s?",
      carry: "after the last digit",
      done: "after the last digit",
    }[fr.phase];
    text(svg, X0, 14, label, { class: "dm-svg-label" });
  }

  // Main cell [0, s].
  const yC = 100;
  el("rect", { x: X0, y: yC, width: L, height: 26, class: "dm-cellbox" }, svg);
  text(svg, X0, yC + 44, "0", { class: "dm-svg-tick", "text-anchor": "middle" });
  text(svg, X1, yC + 44, "s", { class: "dm-svg-tick", "text-anchor": "middle" });
  text(svg, X0 + L / 2, yC + 44, "digit cell [0, s]", { class: "dm-svg-label", "text-anchor": "middle" });
  // Stop zones: usually far too thin to see at this scale (hairlines + lenses),
  // but wide for the tiniest subnormals, where they are drawn directly.
  const zonesOn = inGen || fr.phase === "fixup";
  const wide = zonesOn && ratio(fr.mp > fr.mm ? fr.mp : fr.mm, fr.s) > 0.02;
  const zoneL = wide ? Math.min(1, ratio(fr.mm, fr.s)) * L : 2;
  const zoneR = wide ? Math.min(1, ratio(fr.mp, fr.s)) * L : 2;
  if (zonesOn) {
    el("rect", { x: X0, y: yC, width: zoneL, height: 26, class: "dm-zone" }, svg);
    el("rect", { x: X1 - zoneR, y: yC, width: zoneR, height: 26, class: "dm-zone" }, svg);
  }
  if (R <= 1.04) {
    el("circle", { cx: X0 + L * R, cy: yC + 13, r: 6, class: "dm-dot" }, svg);
  } else {
    el("path", { d: `M${X1 + 4},${yC + 13} l12,0 m-5,-5 l5,5 l-5,5`, class: "dm-arrow" }, svg);
    text(svg, X1, yC - 6, `r/s ≈ ${R > 1e6 ? R.toExponential(3) : R.toPrecision(6)} (off the cell)`, { class: "dm-svg-note", "text-anchor": "end" });
  }

  // Zoom lenses (only once r/s lives in the cell).
  const showLens = zonesOn && !wide;
  const yL = 178, lw = (L - 24) / 2, lh = 30;
  const Wz = 4n * (fr.mp > fr.mm ? fr.mp : fr.mm);
  const lensL = X0, lensR = X1 - lw;
  if (showLens) {
    // connectors
    el("path", { d: `M${X0},${yC + 26} L${lensL},${yL} M${X0 + 3},${yC + 26} L${lensL + lw},${yL}`, class: "dm-zoomline" }, svg);
    el("path", { d: `M${X1 - 3},${yC + 26} L${lensR},${yL} M${X1},${yC + 26} L${lensR + lw},${yL}`, class: "dm-zoomline" }, svg);
    // Left lens: [0, Wz]
    el("rect", { x: lensL, y: yL, width: lw, height: lh, class: "dm-lens" }, svg);
    const zl = (ratio(fr.mm, Wz)) * lw;
    el("rect", { x: lensL, y: yL, width: zl, height: lh, class: "dm-zone" }, svg);
    el("line", { x1: lensL + zl, x2: lensL + zl, y1: yL, y2: yL + lh, class: incl ? "dm-edge" : "dm-edge dm-edge-open" }, svg);
    text(svg, lensL, yL + lh + 14, "0", { class: "dm-svg-tick", "text-anchor": "middle" });
    text(svg, lensL + zl, yL + lh + 14, "m⁻", { class: "dm-svg-tick", "text-anchor": "middle" });
    text(svg, lensL + 2, yL - 5, inGen ? (narrow ? "tc1: keep d" : "tc1 zone: keep d") : "near 0", { class: "dm-svg-label" });
    // Right lens: [s - Wz, s + Wz/3]
    const span = Wz + Wz / 3n;
    const toR = (x) => lensR + ratio(x - (fr.s - Wz), span) * lw;
    el("rect", { x: lensR, y: yL, width: lw, height: lh, class: "dm-lens" }, svg);
    const zx = toR(fr.s - fr.mp), sx = toR(fr.s);
    el("rect", { x: zx, y: yL, width: sx - zx, height: lh, class: "dm-zone" }, svg);
    el("line", { x1: zx, x2: zx, y1: yL, y2: yL + lh, class: incl ? "dm-edge" : "dm-edge dm-edge-open" }, svg);
    el("line", { x1: sx, x2: sx, y1: yL - 3, y2: yL + lh + 3, class: "dm-sline" }, svg);
    text(svg, zx, yL + lh + 14, "s − m⁺", { class: "dm-svg-tick", "text-anchor": "middle" });
    text(svg, sx + 2, yL + lh + 14, "s", { class: "dm-svg-tick" });
    text(svg, lensR + lw, yL - 5, inGen ? (narrow ? "tc2: take d + 1" : "tc2 zone: take d + 1") : "gate: r + m⁺ vs s", { class: "dm-svg-label", "text-anchor": "end" });
    // Dot inside a lens?
    let where = "";
    if (rr <= Wz) {
      el("circle", { cx: lensL + ratio(rr, Wz) * lw, cy: yL + lh / 2, r: 6, class: "dm-dot" }, svg);
      where = "left";
    } else if (rr >= fr.s - Wz && rr - (fr.s - Wz) <= span) {
      el("circle", { cx: toR(rr), cy: yL + lh / 2, r: 6, class: "dm-dot" }, svg);
      where = "right";
    }
    if (fr.phase === "fixup" && !where) {
      // Show r + m+ as a whisker end if r itself is out of lens.
      const top = rr + fr.mp;
      if (top >= fr.s - Wz && top - (fr.s - Wz) <= span) el("circle", { cx: toR(top), cy: yL + lh / 2, r: 4, class: "dm-dot-hollow" }, svg);
    }
    if (!where) text(svg, W / 2, yL + lh / 2 + 4, "r is in neither lens", { class: "dm-svg-note", "text-anchor": "middle" });
    text(svg, W / 2, H - 4, `${narrow ? "lens" : "each lens is"} 4·max(m⁺, m⁻) ≈ ${ratio(Wz, fr.s).toExponential(1)} of the cell${narrow ? "" : " wide"}`, { class: "dm-svg-note", "text-anchor": "middle" });
  } else {
    if (wide) text(svg, W / 2, yL + 18, "Wide half-gaps: zones drawn at full scale.", { class: "dm-svg-note", "text-anchor": "middle" });
    else text(svg, W / 2, yL + 18, narrow ? "Lenses appear once r/s is scaled." : "The zoom lenses appear once r/s has been scaled into the cell.", { class: "dm-svg-note", "text-anchor": "middle" });
  }
  desc.textContent = `Digit cell for step ${state.stepIndex + 1}: r/s ≈ ${R.toPrecision(6)}` +
    (isDigit ? `, digit ${fr.d}, tc1 ${fr.tc1}, tc2 ${fr.tc2}` : "") + ".";
}

function step(delta) {
  const last = run.frames.length - 1;
  state.stepIndex = Math.max(0, Math.min(last, state.stepIndex + delta));
  renderFrame();
}

function initMachine() {
  const chips = $("bd-presets");
  for (const p of MACHINE_PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.label;
    b.dataset.v = String(p.value);
    b.addEventListener("click", () => loadMachine(p.value));
    chips.appendChild(b);
  }
  $("bd-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = Math.abs(parseInput($("bd-input").value));
    if (!(v > 0) || !Number.isFinite(v)) { $("bd-input").setCustomValidity("Enter a positive finite double, e.g. 0.1, 1e23, 2^64"); $("bd-input").reportValidity(); return; }
    $("bd-input").setCustomValidity("");
    loadMachine(v);
  });
  $("bd-input").addEventListener("input", () => $("bd-input").setCustomValidity(""));
  $("bd-next").addEventListener("click", () => step(1));
  $("bd-back").addEventListener("click", () => step(-1));
  $("bd-reset").addEventListener("click", () => { state.stepIndex = 0; renderFrame(); });
  $("bd-end").addEventListener("click", () => step(1e6));
  $("machine-figure").addEventListener("keydown", (ev) => {
    if (ev.target.tagName === "INPUT") return;
    if (ev.key === "ArrowRight") { step(1); ev.preventDefault(); }
    if (ev.key === "ArrowLeft") { step(-1); ev.preventDefault(); }
  });
  const sw = () => {
    state.opts = {
      tiesEven: $("sw-ties").checked,
      symBug: $("sw-bug").checked,
      kFromV: $("sw-kv").checked,
      tie: document.querySelector('input[name="sw-tie"]:checked').value,
    };
    state.step = "end";
    loadMachine(state.x, true);
  };
  for (const id of ["sw-ties", "sw-bug", "sw-kv"]) $(id).addEventListener("change", sw);
  for (const r of document.querySelectorAll('input[name="sw-tie"]')) r.addEventListener("change", sw);
  syncSwitches();
  loadMachine(state.x, true);
}
function syncSwitches() {
  $("sw-ties").checked = state.opts.tiesEven;
  $("sw-bug").checked = state.opts.symBug;
  $("sw-kv").checked = state.opts.kFromV;
  for (const r of document.querySelectorAll('input[name="sw-tie"]')) r.checked = r.value === state.opts.tie;
}

// "Load in machine" buttons: data-load="x=…&ties=0&step=end"
function initLoaders() {
  for (const b of document.querySelectorAll("[data-load]")) {
    b.addEventListener("click", () => {
      const p = new URLSearchParams(b.dataset.load);
      state.opts = {
        ...BD_DEFAULTS,
        tiesEven: p.get("ties") !== "0",
        symBug: p.get("bug") === "1",
        kFromV: p.get("kv") === "1",
        tie: p.get("tie") === "even" ? "even" : "up",
      };
      syncSwitches();
      state.step = p.get("step") ?? "0";
      loadMachine(parseInput(p.get("x")), true);
      $("machine").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }
  for (const b of document.querySelectorAll("[data-route]")) {
    b.addEventListener("click", () => {
      loadRoute(parseInput(b.dataset.route));
      $("route").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  }
}

// ---------------------------------------------------------------------------
// Part 2: the route map

const M = 100, B = 350; // main line x, branch x
const NODES = {
  entry: { x: M, y: 34, name: "dtoa(v, mode 0)", about: "shortest round-trip digits", kind: "end" },
  special: { x: M, y: 92, name: "sign · ∞ · NaN · 0", about: "specials leave early", up: true },
  special_out: { x: B, y: 92, name: "\"Infinity\" \"NaN\" \"0\"", about: "decpt 9999 or 1", kind: "end" },
  d2b: { x: M, y: 150, name: "d2b", about: "v = b·2^be, b odd" },
  ds: { x: M, y: 206, name: "ds → k", about: "tangent: k or k+1", up: true },
  tens: { x: M, y: 262, name: "tens[k] check", about: "0 ≤ k ≤ 22: v < 10^k ?" },
  kset: { x: B, y: 262, name: "k_check = 1", about: "repair later, exactly" },
  merge: { x: M, y: 300, kind: "none" },
  sifork: { x: M, y: 344, name: "be ≥ 0 && k ≤ 14 ?", about: "integer below 10^15?", kind: "junction", up: true },
  smallint: { x: B, y: 364, name: "small integer", about: "no bignum at all" },
  siloop: { x: B, y: 410, name: "L = u / tens[k]", about: "exact double loop" },
  retc: { x: B, y: 456, name: "retc", about: "strip 0s, done", kind: "end" },
  book: { x: M, y: 498, name: "b2 b5 s2 s5", about: "count 2s and 5s, + half ulp" },
  cancel: { x: M, y: 552, name: "cancel 2s", about: "drop min(m2, s2)" },
  pow5: { x: M, y: 606, name: "pow5mult", about: "5^k from cached squares" },
  specj: { x: M, y: 660, name: "power of 2 ?", about: "normalized, not the min", kind: "junction", up: true },
  spec: { x: B, y: 660, name: "spec_case", about: "b2, s2 += 1; mhi = 2·mlo" },
  dshift: { x: M, y: 724, name: "dshift · lshift", about: "S top word: 4 leading 0s" },
  kfixj: { x: M, y: 794, name: "k_check ?", about: "deferred repair", kind: "junction", up: true },
  kfix: { x: B, y: 794, name: "b < S: k−−", about: "b, mhi ×= 10" },
  quorem: { x: M, y: 860, name: "quorem", about: "digit = b / S" },
  exitA: { x: M, y: 944, name: "A", about: "j1 = 0, even", kind: "exit", left: true },
  exitB: { x: 240, y: 944, name: "B", about: "j < 0: 2b vs S", kind: "exit" },
  exitC: { x: 390, y: 944, name: "C", about: "j1 > 0: dig+1", kind: "exit" },
  carryj: { x: M, y: 1040, name: "dig = 9 ?", about: "carry needed?", kind: "junction", left: true },
  round9: { x: B, y: 1040, name: "round_9_up", about: "→ roundoff: carry" },
  ret: { x: M, y: 1100, name: "ret", about: "strip 0s, decpt = k + 1", kind: "end" },
};
const curve = (a, b) => {
  const p = NODES[a], q = NODES[b];
  if (p.x === q.x || p.y === q.y) return `M${p.x},${p.y} L${q.x},${q.y}`;
  const my = (p.y + q.y) / 2;
  return `M${p.x},${p.y} C${p.x},${my} ${q.x},${my} ${q.x},${q.y}`;
};
const side = (a, b) => { // leave horizontally, arrive vertically-ish
  const p = NODES[a], q = NODES[b];
  return `M${p.x},${p.y} C${(p.x + q.x) / 2},${p.y} ${q.x},${(p.y + q.y) / 2} ${q.x},${q.y}`;
};
const back = (a, b) => {
  const p = NODES[a], q = NODES[b];
  return `M${p.x},${p.y} C${p.x},${q.y} ${(p.x + q.x) / 2},${q.y} ${q.x},${q.y}`;
};
const EDGES = [
  ["entry", "special"], ["special", "special_out"], ["special", "d2b"], ["d2b", "ds"],
  ["ds", "tens"], ["ds", "kset", side], ["tens", "merge"], ["kset", "merge", curve], ["merge", "sifork"],
  ["sifork", "smallint", side], ["smallint", "siloop"], ["siloop", "retc"],
  ["sifork", "book"], ["book", "cancel"], ["cancel", "pow5"], ["pow5", "specj"],
  ["specj", "spec"], ["spec", "dshift", curve], ["specj", "dshift"],
  ["dshift", "kfixj"], ["kfixj", "kfix"], ["kfix", "quorem", curve], ["kfixj", "quorem"],
  ["quorem", "exitA"], ["quorem", "exitB", curve], ["quorem", "exitC", curve],
  ["exitA", "carryj"], ["exitB", "carryj", curve], ["exitC", "carryj", curve],
  ["carryj", "round9"], ["round9", "ret", curve], ["carryj", "ret"],
];

let routeRun = null;

function liveTag(id, r) {
  const s = r.st[id] || {};
  switch (id) {
    case "entry": return `v = ${String(r.st.entry.v)}`;
    case "special": return s.special ? `→ "${s.special}"` : s.neg ? "negative: sign = 1" : "positive, finite";
    case "special_out": return `"${s.special}"`;
    case "d2b": return `b: ${s.bbits} bit${s.bbits > 1 ? "s" : ""}, be = ${minus(s.be)}`;
    case "ds": return `ds = ${minus(s.ds.toFixed(5))} → k = ${minus(s.khat)}`;
    case "tens": return s.fired ? `v < 1e${s.khat} → k = ${minus(s.k)}` : `v ≥ 1e${s.khat}: keep`;
    case "kset": return `k = ${minus(s.khat)} unchecked`;
    case "sifork": return s.small ? "yes → small integer" : "no → bignums";
    case "smallint": return `k = ${s.k}`;
    case "siloop": return `${s.rows.length} digit${s.rows.length > 1 ? "s" : ""}`;
    case "retc": return `"${s.digits}", decpt ${s.decpt}`;
    case "book": return `b2 ${s.b2} b5 ${s.b5} s2 ${s.s2} s5 ${s.s5}`;
    case "cancel": return s.cancel ? `${s.cancel} factor${s.cancel > 1 ? "s" : ""} of 2 dropped` : "nothing to cancel";
    case "pow5": return s.which ? `5^${s.b5 || s.s5} → ${s.which} (${s.mults} mult${s.mults > 1 ? "s" : ""})` : "no 5s (k = 0)";
    case "specj": return s.spec ? "yes" : "no";
    case "spec": return "mhi = 2·mlo";
    case "dshift": return `shift ${s.sh}`;
    case "kfixj": return !s.active ? "not set" : r.route.includes("kfix") ? "b < S: k too big" : "b ≥ S: k is right";
    case "kfix": return `k = ${minus(s.k)}`;
    case "quorem": return `${s.iterations} digit${s.iterations > 1 ? "s" : ""}${s.fixes ? `, ${s.fixes} guess fixed` : ""}`;
    case "exitA": case "exitB": case "exitC": return `emit ${s.row.emit}`;
    case "carryj": return r.carry ? "yes" : "no";
    case "round9": return `k → ${minus(s.k)}`;
    case "ret": return `"${s.digits}", decpt ${minus(s.decpt)}`;
  }
  return "";
}

function drawMap() {
  const r = routeRun;
  const host = $("rt-map");
  host.textContent = "";
  const svg = el("svg", { viewBox: "0 0 530 1134", class: "dm-map", role: "group", "aria-label": "Route map of dtoa mode 0. Stations on the route are listed next to the map." }, host);
  const onRoute = new Set(r.route);
  if (onRoute.has("exitA") || onRoute.has("exitB") || onRoute.has("exitC")) onRoute.add("carryj");
  if (onRoute.has("sifork")) onRoute.add("merge");
  const litEdge = (a, b) => {
    if (!onRoute.has(a) || !onRoute.has(b)) return false;
    const ia = r.route.indexOf(a), ib = r.route.indexOf(b);
    if (b === "carryj") return true;
    if (b === "merge") return true;
    if (a === "merge") return true;
    if (a === "carryj") return b === "round9" || (b === "ret" && !r.carry);
    if (a === "sifork" && b === "book") return !st(r, "sifork").small;
    if (a === "specj" && b === "dshift") return !r.spec;
    if (a === "kfixj" && b === "quorem") return !r.route.includes("kfix");
    return ib > ia;
  };
  // BF96 dotted side branch on the left.
  const g0 = el("g", { class: "dm-bf96" }, svg);
  el("path", { d: `M${M},${NODES.special.y} C${M - 40},${NODES.special.y} 26,${NODES.special.y + 20} 26,${NODES.special.y + 60} L26,${NODES.book.y - 40} C26,${NODES.book.y - 10} ${M - 40},${NODES.book.y} ${M},${NODES.book.y}`, class: "dm-bf96-line" }, g0);
  const lab = text(g0, 0, 0, "default build since 2016: BF96 fast attempt → Fast_failed1", { class: "dm-bf96-text", transform: `translate(18 ${NODES.book.y - 50}) rotate(-90)` });
  lab.setAttribute("text-anchor", "start");
  // Loop D on the left of quorem.
  const q = NODES.quorem;
  const loopLit = r.route.includes("loopD");
  el("path", { d: `M${q.x},${q.y} C${q.x - 60},${q.y + 40} ${q.x - 66},${q.y - 44} ${q.x},${q.y}`, class: loopLit ? "dm-edge-line dm-lit" : "dm-edge-line" }, svg);
  text(svg, q.x - 60, q.y + 30, "D", { class: loopLit ? "dm-exit-name dm-lit-text" : "dm-exit-name", "text-anchor": "middle" });
  text(svg, q.x - 60, q.y + 44, loopLit ? `×10 · ${r.loop.length - 1} turn${r.loop.length > 2 ? "s" : ""}` : "×10, next", { class: loopLit ? "dm-live" : "dm-about", "text-anchor": "middle" });
  // Edges: unlit first, lit on top.
  const lit = [], dim = [];
  for (const [a, b, shape] of EDGES) (litEdge(a, b) ? lit : dim).push((shape || curve)(a, b));
  for (const d of dim) el("path", { d, class: "dm-edge-line" }, svg);
  for (const d of lit) el("path", { d, class: "dm-edge-line dm-lit" }, svg);
  // Stations.
  for (const [id, n] of Object.entries(NODES)) {
    if (n.kind === "none") continue;
    const on = onRoute.has(id);
    const g = el("g", { class: `dm-station${on ? " dm-on" : ""}${state.station === id ? " dm-sel" : ""}`, "data-id": id }, svg);
    if (on && r.st[id]) {
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `${n.name}: ${liveTag(id, r)}`);
      g.addEventListener("click", () => selectStation(id));
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectStation(id); } });
    }
    if (n.kind === "junction") el("rect", { x: n.x - 5, y: n.y - 5, width: 10, height: 10, transform: `rotate(45 ${n.x} ${n.y})`, class: "dm-junction" }, g);
    else if (n.kind === "end") el("rect", { x: n.x - 11, y: n.y - 6, width: 22, height: 12, rx: 6, class: "dm-terminus" }, g);
    else el("circle", { cx: n.x, cy: n.y, r: n.kind === "exit" ? 8 : 7, class: "dm-stop" }, g);
    const tag = on && r.st[id] ? liveTag(id, r) : on && id === "carryj" ? (r.carry ? "yes" : "no") : n.about;
    if (n.kind === "exit") {
      const x = n.left ? n.x - 14 : n.x + 14, anchor = n.left ? "end" : "start";
      text(g, x, n.y - 8, n.name, { class: "dm-exit-name", "text-anchor": anchor });
      text(g, x, n.y + 6, n.about, { class: "dm-about", "text-anchor": anchor });
      if (on) text(g, x, n.y + 20, tag, { class: "dm-live", "text-anchor": anchor });
    } else if (n.left) {
      text(g, n.x - 14, n.y - 2, n.name, { class: "dm-name", "text-anchor": "end" });
      text(g, n.x - 14, n.y + 12, tag, { class: on && r.st[id] ? "dm-live" : "dm-about", "text-anchor": "end" });
    } else {
      const dy = n.up ? -21 : -1;
      text(g, n.x + 14, n.y + dy, n.name, { class: "dm-name" });
      text(g, n.x + 14, n.y + dy + 13, tag, { class: on && r.st[id] ? "dm-live" : "dm-about" });
    }
  }
  // Bit bars next to dshift.
  if (r.st.dshift) {
    const s = r.st.dshift;
    const x0 = 276, wmax = 230, scale = wmax / 1100;
    const rows = [["b", s.bFinal, s.ghostB], ["S", s.SBits, s.ghostS], ["mhi", s.mhiBits, null]];
    const g = el("g", { class: "dm-bars" }, svg);
    rows.forEach(([name, bits, ghost], i) => {
      const y = NODES.dshift.y - 20 + i * 15;
      if (ghost) el("rect", { x: x0, y, width: ghost * scale, height: 10, class: "dm-bar-ghost" }, g);
      el("rect", { x: x0, y, width: Math.max(1, bits * scale), height: 10, class: "dm-bar" }, g);
      text(g, x0 - 4, y + 9, name, { class: "dm-bar-name", "text-anchor": "end" });
      text(g, x0 + Math.max(bits, ghost || 0) * scale + 4, y + 9, ghost ? `${bits} (${ghost})` : String(bits), { class: "dm-bar-val" });
    });
    text(g, x0, NODES.dshift.y + 34, "bits: solid = dtoa, outline = no 2s cancelled", { class: "dm-about" });
  }
}
const st = (r, id) => r.st[id] || {};

function stationCard(id, r) {
  const s = r.st[id];
  const n = NODES[id];
  const kv = [];
  const row = (k, v) => { kv.push(`<div><dt>${k}</dt><dd>${v}</dd></div>`); return ""; };
  let body = "";
  switch (id) {
    case "entry":
      body = row("v", esc(String(s.v))) + (Number.isFinite(s.v) && s.v !== 0 ? row("exact", shortExact(Math.abs(s.v))) : "");
      break;
    case "special":
      body = s.special ? `<p>dtoa returns "${s.special}" right away (decpt ${s.decpt}).</p>` : `<p>${s.neg ? "Negative: dtoa sets <code>*sign = 1</code> and continues with |v|." : "Positive and finite: nothing to do."}</p>`;
      break;
    case "special_out": body = `<p>Early exit: "${s.special}".</p>`; break;
    case "d2b":
      body = row("b", `${big(s.b)} <span class="dm-dim">(odd, ${s.bbits} bits)</span>`) + row("be", minus(s.be)) +
        `<p>v = b · 2${sup(s.be)}. ${s.stripped ? `${s.stripped} trailing zero bit${s.stripped > 1 ? "s" : ""} of f = ${big(s.f)} were shifted out.` : "f was already odd."}${s.denorm ? " v is subnormal." : ""}</p>`;
      break;
    case "ds":
      body = row("x", `${s.x} <span class="dm-dim">(v = x · 2${sup(s.i)})</span>`) +
        row("ds", `(x − 1.5)·0.289529654602168 + 0.1760912590558 + ${minus(s.i)}·0.301029995663981 = ${minus(s.ds.toFixed(5))}`) +
        row("k̂", `⌊ds⌋ = ${minus(s.khat)}`) +
        `<p>True ⌊log${"<sub>10</sub>"} v⌋ = ${minus(s.trueK)}: k̂ is ${s.khat === s.trueK ? "right" : "one too big (the tangent lies above log₁₀)"}.</p>`;
      break;
    case "tens":
      body = `<p>0 ≤ k̂ = ${s.khat} ≤ 22, and 10${sup(s.khat)} is exact as a double, so one double comparison settles it: v ${s.fired ? "&lt;" : "≥"} ${esc(String(s.ten))}${s.fired ? `, so k = k̂ − 1 = ${minus(s.k)}` : `, so k = ${s.k}`}. No bignum needed.</p>`;
      break;
    case "kset":
      body = `<p>k̂ = ${minus(s.khat)} is outside 0…22, where 10${sup("k̂")} is not an exact double. dtoa trusts k̂ for now and sets <code>k_check</code>; one bignum comparison after scaling will repair it.</p>`;
      break;
    case "sifork":
      body = `<p>be = ${minus(s.be)}, k = ${minus(s.k)}. ${s.small ? "v is an integer below 10<sup>15</sup>: every intermediate value fits in 53 bits, so plain doubles are exact." : s.be < 0 ? "be &lt; 0: v is not an integer, so take the bignum path." : "k &gt; 14: too large for exact doubles, so take the bignum path."}</p>`;
      break;
    case "smallint":
      body = `<p>ds = tens[${s.k}] = ${esc(String(s.ds))}. The exact digits of an integer are also its shortest digits.</p>`;
      break;
    case "siloop":
      body = `<table class="dm-mini"><thead><tr><th>u</th><th>L = ⌊u / 1e${r.k}⌋</th><th>u − L·1e${r.k}</th></tr></thead><tbody>${s.rows.map((x) => `<tr><td>${esc(String(x.before))}</td><td>${x.L}</td><td>${esc(String(x.rest))}</td></tr>`).join("")}</tbody></table><p>Stop when the rest is 0; otherwise u = rest × 10.</p>`;
      break;
    case "retc": case "ret":
      body = `<p>Digits "<strong>${s.digits}</strong>", decpt = ${minus(s.decpt)}: ${esc(formatJs(s.digits, s.decpt))}.</p>`;
      break;
    case "book":
      body = row("b / S", `b·2${sup(s.b2)}·5${sup(s.b5)} / 2${sup(s.s2)}·5${sup(s.s5)}`) + row("mhi", `2${sup(s.m2)}·5${sup(s.m5)}`) +
        `<p>10${sup("k")} is split: its 5s become a real multiplication (on ${s.s5 ? "S" : s.b5 ? "b and mhi" : "nothing, k = 0"}), its 2s only an exponent. ${s.half} was added to b2 and s2 so that mhi = 1 unit is exactly half an ulp.</p>`;
      break;
    case "cancel":
      body = `<p>t = min(m2, s2) = ${s.cancel}. Removed from b2, m2 and s2; now b2 = ${s.b2}, s2 = ${s.s2}, m2 = ${s.m2}.</p>`;
      break;
    case "pow5":
      body = s.which
        ? `<p>5${sup(s.b5 || s.s5)}${s.parts.length > 1 ? ` = ${s.parts.map((p) => `5${sup(p)}`).join(" · ")}` : ""}: ${s.mults} bignum multiplication${s.mults > 1 ? "s" : ""} from cached powers (5, 25, 125, then 5⁴, 5⁸, 5¹⁶, … by squaring). ${s.which === "b" ? "k &lt; 0, so it multiplies mhi and b." : "k &gt; 0, so it becomes S."} Result: ${s.bits} bits.</p>`
        : `<p>k = 0: no factor 5 anywhere.</p>`;
      break;
    case "specj": body = `<p>${s.spec ? "v is a normalized power of two (and not the smallest normal)." : "Not a power of two: the two half-gaps are equal, mlo = mhi."}</p>`; break;
    case "spec": body = `<p>The gap below v is half the gap above. dtoa adds 1 to b2 and s2 and later sets mhi = 2·mlo. This is B&amp;D's power-of-two row.</p>`; break;
    case "dshift":
      body = row("shift", `${s.sh} <span class="dm-dim">(S's top 32-bit word now has ${s.topLead} leading zero bits; ${s.words} words)</span>`) +
        row("b", `${s.bFinal} bits <span class="dm-dim">(${s.ghostB} without cancelling)</span>`) +
        row("S", `${s.SBits} bits <span class="dm-dim">(${s.ghostS} without cancelling)</span>`) +
        row("mhi, mlo", `${s.mhiBits}, ${s.mloBits} bits`) +
        `<p>Four leading zero bits in S's top word make <code>quorem</code>'s one-word guess safe: it is never too big and at most one too small.</p>`;
      break;
    case "kfixj":
      body = `<p>${s.active ? (r.route.includes("kfix") ? "k_check is set and b &lt; S: v/10<sup>k̂</sup> &lt; 1, so k̂ was one too big." : "k_check is set, and b ≥ S confirms k̂.") : "Not needed: the tens[] check already fixed k."}</p>`;
      break;
    case "kfix": body = `<p>k = ${minus(s.k)}; b and mhi are multiplied by 10 (<code>multadd</code>). One bignum comparison and one ×10: that is the whole repair.</p>`; break;
    case "quorem": {
      const rows = r.loop.map((x) => `<tr${x.fixed ? ' class="dm-fixrow"' : ""}><td>${x.it}</td><td>${x.qest}</td><td>${x.dig}</td><td>${x.j}</td><td>${x.j1}</td><td>${x.exit}</td><td>${x.emit}</td></tr>`).join("");
      body = `<table class="dm-mini"><thead><tr><th>#</th><th>guess</th><th>dig</th><th>j</th><th>j1</th><th>exit</th><th>emit</th></tr></thead><tbody>${rows}</tbody></table>` +
        `<p>guess = top word of b / (top word of S + 1); a highlighted row needed quorem's single +1 correction. j = cmp(b, mlo), j1 = cmp(b, S − mhi), both after the digit is removed.</p>`;
      break;
    }
    case "exitA": body = `<p>b + mhi = S exactly and the mantissa is even: the upper boundary is allowed. ${s.row.dig === 9 ? "The digit is 9, so dtoa jumps to <code>round_9_up</code>." : `Emit ${s.row.emit}.`}</p>`; break;
    case "exitB": body = `<p>The low end is inside (j ${s.row.j < 0 ? "&lt;" : "="} 0). ${s.row.j1 > 0 ? `The high end too (j1 &gt; 0), so compare 2b with S: 2b ${s.row.twoB > 0 ? "&gt;" : s.row.twoB < 0 ? "&lt;" : "="} S${s.row.twoB === 0 ? ", a tie, broken to the even digit" : ""}.` : ""} Emit ${s.row.emit}.</p>`; break;
    case "exitC": body = `<p>b &gt; S − mhi: rounding up reads back as v. ${s.row.dig === 9 ? "The digit is 9: <code>round_9_up</code>." : `Emit dig + 1 = ${s.row.emit}.`}</p>`; break;
    case "round9": body = `<p>9 + 1: <code>roundoff</code> strips trailing 9s and increments; if all were 9s the string becomes "1" and k becomes ${minus(s.k)}. Possible because dtoa takes k from v, not from the top of the interval.</p>`; break;
  }
  return `<li class="dm-card-st" id="st-${id}" data-id="${id}"><h4><code>${esc(n.name)}</code> <span>${esc(liveTag(id, r))}</span></h4>${kv.length ? `<dl class="dm-kv">${kv.join("")}</dl>` : ""}${body}</li>`;
}

function renderRoute() {
  const r = routeRun;
  drawMap();
  $("rt-list").innerHTML = [...new Set(r.route)].filter((id) => r.st[id]).map((id) => stationCard(id, r)).join("");
  const js = String(r.st.entry.v);
  $("rt-out").innerHTML = r.special
    ? `dtoa returns "${r.digits}".`
    : `dtoa returns "<strong>${r.digits}</strong>", decpt ${minus(r.decpt)} → ${esc((r.neg ? "-" : "") + formatJs(r.digits, r.decpt))} · JavaScript: ${esc(js)} ${formatJs(r.digits, r.decpt) === String(Math.abs(r.st.entry.v)) ? "✓" : "✗"}`;
  if (state.station) markStation(state.station, false);
}

function markStation(id, scroll = true) {
  for (const c of $("rt-list").children) c.classList.toggle("dm-card-sel", c.dataset.id === id);
  for (const g of $("rt-map").querySelectorAll(".dm-station")) g.classList.toggle("dm-sel", g.dataset.id === id);
  const card = document.getElementById(`st-${id}`);
  if (card && scroll) {
    const list = card.parentElement.parentElement;
    list.scrollTo({ top: card.offsetTop - list.offsetTop - 8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
}
function selectStation(id) {
  state.station = id;
  markStation(id);
  saveUrl();
}

function loadRoute(v) {
  state.route = v;
  state.station = null;
  routeRun = dtoaRun(v);
  $("rt-input").value = presetLabel(v, ROUTE_PRESETS);
  for (const b of $("rt-presets").querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.v) === v));
  renderRoute();
  saveUrl();
}

function initRoute() {
  const chips = $("rt-presets");
  for (const p of ROUTE_PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.label;
    b.dataset.v = String(p.value);
    b.addEventListener("click", () => loadRoute(p.value));
    chips.appendChild(b);
  }
  $("rt-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = parseInput($("rt-input").value);
    const inp = $("rt-input");
    if (Number.isNaN(v) && !/nan/i.test(inp.value)) { inp.setCustomValidity("Enter a double, e.g. 0.3, 1e23, 2^64, DBL_MAX"); inp.reportValidity(); return; }
    inp.setCustomValidity("");
    loadRoute(v);
  });
  $("rt-input").addEventListener("input", () => $("rt-input").setCustomValidity(""));
  $("rt-random").addEventListener("click", () => {
    const view = new DataView(new ArrayBuffer(8));
    let v;
    do {
      view.setUint32(0, Math.floor(Math.random() * 0x7ff00000));
      view.setUint32(4, Math.floor(Math.random() * 2 ** 32));
      v = view.getFloat64(0);
    } while (!(v > 0) || !Number.isFinite(v));
    loadRoute(v);
  });
  const keep = state.station;
  loadRoute(state.route);
  if (keep && routeRun.st[keep]) { state.station = keep; markStation(keep, false); saveUrl(); }
}

initMachine();
initRoute();
let resizeTimer = 0, lastNarrow = $("bd-cell").clientWidth < 520;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const n = $("bd-cell").clientWidth < 520;
    if (n !== lastNarrow) { lastNarrow = n; drawCell(run.frames[state.stepIndex]); }
  }, 150);
});
initLoaders();
