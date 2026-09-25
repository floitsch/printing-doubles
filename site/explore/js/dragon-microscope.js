// Copyright (C) 2026 Toit contributors.
//
// DOM and interaction for the "Decimal microscope" Dragon4 page.
// All numbers come from dragon-microscope-model.js (exact BigInt arithmetic).

import * as M from "./dragon-microscope-model.js";
import { parseDecimal } from "../../js/float.js";

const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const params = new URLSearchParams(location.search);
const g = (n) => M.groupDigits(n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const yesNo = (b) => (b ? "<strong>yes</strong>" : "no");
const sup = (n) => `<sup>${String(n).replace("-", "−")}</sup>`;

function valueText(r, maxLen = 36) {
  const exact = M.rationalText(r);
  return exact.length <= maxLen ? exact : `${M.rationalText(r, 20)}…`;
}

function inputSummary(input) {
  const nb = M.neighbourhood(input);
  const form = `${g(input.f)} × 2${sup(input.q)}`;
  const kind = input.kind === "double" ? "a double" : `a ${input.p}-bit toy float`;
  return { nb, form, kind, v: valueText(nb.v), lower: valueText(nb.lower), upper: valueText(nb.upper) };
}

// ====================================================================== microscope

const micro = {
  x: params.get("x") || "pi",
  p: clampP(Number(params.get("p") ?? 8)),
  step: Math.max(0, Number(params.get("step")) || 0),
  view: params.get("view") === "dragon" ? "dragon" : "micro",
  input: null, trace: null, frames: null,
  animating: false, playing: false, playTimer: 0,
};

function clampP(p) { return Number.isFinite(p) ? Math.min(53, Math.max(4, Math.round(p))) : 8; }

function computeMicro() {
  const input = M.parseInput(micro.x, micro.p);
  const note = $("dm-x-note");
  if (input.error) {
    note.innerHTML = `<span class="dm-error">${esc(input.error)}</span>`;
    return false;
  }
  micro.input = input;
  micro.trace = M.dragon4(input);
  micro.frames = M.microscopeFrames(micro.trace);
  micro.step = Math.min(micro.step, micro.frames.length - 1);
  const s = inputSummary(input);
  const name = /^(pi|π)$/i.test(micro.x.trim()) ? "π" : esc(micro.x.trim());
  note.innerHTML = `${input.kind === "double" ? `The double nearest ${name}` : `${name} rounded to p = ${input.p} bits`}: v = ${s.form} = ${s.v}. `
    + `Rounding interval (${s.lower}, ${s.upper})${input.unequal ? " — a power of two, so the interval reaches twice as far up as down" : ""}.`;
  return true;
}

function presetButtons() {
  const box = $("dm-presets");
  box.replaceChildren();
  for (const pr of M.MICRO_PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = pr.label;
    b.dataset.x = pr.x;
    b.dataset.p = pr.p;
    b.addEventListener("click", () => {
      stopPlay();
      micro.x = pr.x; micro.p = pr.p; micro.step = 0;
      $("dm-x").value = pr.x; $("dm-p").value = pr.p; $("dm-p-out").textContent = pr.p;
      if (computeMicro()) renderMicro();
      syncUrl();
    });
    box.append(b);
  }
}

function markPresets() {
  for (const b of $("dm-presets").children) {
    b.setAttribute("aria-pressed", String(b.dataset.x === micro.x.trim().toLowerCase() && Number(b.dataset.p) === micro.p));
  }
}

function svgEl(name, attrs = {}, text) {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

const CHAR_W = 7.3; // approx width of an 12px mono char

function renderMicro(t = 0) {
  const box = $("dm-svg");
  const W = Math.max(300, Math.round(box.clientWidth || 700));
  const H = 196;
  const pad = 26;
  const x0 = pad, x1 = W - pad;
  const frames = micro.frames;
  const f = frames[micro.step];
  const dragon = micro.view === "dragon";
  const zooming = !dragon && t > 0 && f.index >= 1;
  let a = 0, b = 1;
  if (zooming) {
    const c = f.U / 9;
    const s = 10 ** -t;
    a = c - c * s; b = c + (1 - c) * s;
  }
  const X = (u) => x0 + ((u - a) / (b - a)) * (x1 - x0);
  const yLine = 118;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "dm-svg", "aria-hidden": "true" });
  const clipId = "dm-clip";
  const defs = svgEl("defs");
  const clip = svgEl("clipPath", { id: clipId });
  clip.append(svgEl("rect", { x: x0 - 12, y: 0, width: x1 - x0 + 24, height: H }));
  defs.append(clip);
  svg.append(defs);
  const g0 = svgEl("g", { "clip-path": `url(#${clipId})` });
  svg.append(g0);

  // the cell that contains v at this level
  if (f.index >= 1) {
    g0.append(svgEl("rect", { x: X(f.U / 10), y: yLine - 34, width: Math.max(0, X((f.U + 1) / 10) - X(f.U / 10)), height: 52, class: "dm-cell" }));
  }

  // interval
  let r = f.r, mm = f.mMinus, mp = f.mPlus, hop = 0;
  if (dragon && t > 0 && f.index >= 1) {
    r = f.r + (f.rNext - f.r) * t;
    mm *= 10 ** t; mp *= 10 ** t;
    hop = Math.sin(Math.PI * t) * 30;
  }
  let lo = X(r - mm), hi = X(r + mp);
  const pxWidth = hi - lo;
  if (pxWidth < 3) { const c = X(r); lo = c - 1.5; hi = c + 1.5; }
  const band = svgEl("rect", { x: lo, y: yLine - 26, width: hi - lo, height: 52, class: "dm-band" });
  g0.append(band);
  g0.append(svgEl("line", { x1: lo, x2: lo, y1: yLine - 30, y2: yLine + 30, class: "dm-band-edge" }));
  g0.append(svgEl("line", { x1: hi, x2: hi, y1: yLine - 30, y2: yLine + 30, class: "dm-band-edge" }));

  // ruler
  g0.append(svgEl("line", { x1: X(0), x2: X(1), y1: yLine, y2: yLine, class: "dm-ruler" }));
  const labelOpacity = zooming ? Math.max(0, 1 - 2 * t) : 1;
  for (let j = 0; j <= 10; j++) {
    const x = X(j / 10);
    const major = j === 0 || j === 10;
    g0.append(svgEl("line", { x1: x, x2: x, y1: yLine - (major ? 16 : 9), y2: yLine + (major ? 16 : 9), class: "dm-tick" }));
    if (j < 10) g0.append(svgEl("text", { x: x + ((X(0.1) - X(0)) / 2), y: yLine + 30, class: "dm-digit", "text-anchor": "middle", opacity: labelOpacity }, String(j)));
  }
  if (zooming) {
    for (let j = 1; j < 10; j++) {
      const x = X(f.U / 10 + j / 100);
      g0.append(svgEl("line", { x1: x, x2: x, y1: yLine - 6, y2: yLine + 6, class: "dm-tick dm-subtick", opacity: t }));
    }
  }

  // candidates
  if (f.index >= 1 && t === 0) {
    const cands = [
      { u: f.U / 10, inside: f.low, label: dragon ? `U = ${f.U}` : f.tickLabel(f.U), anchor: "end", which: "low" },
      { u: (f.U + 1) / 10, inside: f.high, label: dragon ? `U+1 = ${f.U + 1}` : f.tickLabel(f.U + 1), anchor: "start", which: "high" },
    ];
    let chosen = null;
    if (f.final) chosen = micro.trace.rule === "low" || micro.trace.rule === "both-down" || micro.trace.rule === "both-tie" ? "low" : "high";
    const rows = [34, 34];
    // avoid overflow at the edges and collisions
    const pos = cands.map((c) => {
      const w = c.label.length * CHAR_W + 16;
      let x = X(c.u) + (c.anchor === "end" ? -8 : 8);
      let anchor = c.anchor;
      if (anchor === "end" && x - w < 2) { anchor = "start"; x = 2; }
      if (anchor === "start" && x + w > W - 2) { anchor = "end"; x = W - 2; }
      return { x, anchor, w };
    });
    const span = (p) => (p.anchor === "start" ? [p.x, p.x + p.w] : [p.x - p.w, p.x]);
    const [s0, s1] = [span(pos[0]), span(pos[1])];
    if (s0[1] > s1[0] - 4 && s0[0] < s1[1]) rows[1] = 16;
    cands.forEach((c, i) => {
      const x = X(c.u);
      const isChosen = chosen === c.which;
      g0.append(svgEl("line", { x1: x, x2: x, y1: rows[i] + 6, y2: yLine - 10, class: "dm-lead" }));
      g0.append(svgEl("circle", { cx: x, cy: yLine, r: isChosen ? 9 : 7, class: `dm-cand ${c.inside ? "in" : "out"}${isChosen ? " chosen" : ""}` }));
      svg.append(svgEl("text", { x: pos[i].x, y: rows[i], "text-anchor": pos[i].anchor, class: `dm-cand-label${isChosen ? " chosen" : ""}${c.inside ? "" : " out"}` }, `${c.label} ${c.inside ? "✓" : "✗"}`));
    });
  }

  // v
  const vx = X(r);
  g0.append(svgEl("circle", { cx: vx, cy: yLine - hop, r: 5, class: "dm-v" }));

  // end labels
  const leftLabel = dragon ? "0" : f.left;
  const rightLabel = dragon ? `S = ${sh(micro.trace.scaled.S)}` : f.right;
  const endOpacity = zooming ? Math.max(0, 1 - 2 * t) : 1;
  const endsW = (leftLabel.length + rightLabel.length) * CHAR_W + 24;
  const scaleText = dragon ? "one cell: R runs from 0 to S" : `ticks every ${tickSize(f.pos)}`;
  const roomForScale = endsW + scaleText.length * 6.2 + 24 < W;
  const stacked = endsW > W - 8;
  svg.append(svgEl("text", { x: x0, y: stacked ? H - 24 : H - 10, class: "dm-end", "text-anchor": "start", opacity: endOpacity }, leftLabel));
  svg.append(svgEl("text", { x: x1, y: H - 8, class: "dm-end", "text-anchor": "end", opacity: endOpacity }, rightLabel));
  if (roomForScale) svg.append(svgEl("text", { x: W / 2, y: H - 10, class: "dm-scale", "text-anchor": "middle", opacity: endOpacity }, scaleText));

  box.replaceChildren(svg);
  if (t === 0) renderMicroText(pxWidth);
}

function tickSize(pos) {
  return pos >= 0 ? (pos <= 20 ? "1" + "0".repeat(pos) : `1e${pos}`) : (pos >= -8 ? `0.${"0".repeat(-pos - 1)}1` : `1e${pos}`);
}

function digitsSoFar(f) {
  if (f.index === 0) return "";
  if (f.final) return M.outputText(micro.trace);
  return f.tickLabel(f.U) + "…";
}

function renderMicroText(pxWidth) {
  const f = micro.frames[micro.step];
  const tr = micro.trace;
  const dragon = micro.view === "dragon";
  $("dm-tape").textContent = digitsSoFar(f) || "(nothing yet)";
  const last = micro.frames.length - 1;
  $("dm-prev").disabled = micro.step === 0;
  $("dm-step").disabled = micro.step === last;
  $("dm-play").textContent = micro.playing ? "Pause" : "Play";
  $("dm-view-micro").setAttribute("aria-pressed", String(!dragon));
  $("dm-view-dragon").setAttribute("aria-pressed", String(dragon));
  $("dm-view-caption").textContent = dragon
    ? "Dragon4 view: the ruler is always one cell (0 to S); each step the dot jumps to the remainder and the interval grows ×10."
    : "Microscope: each step, the tenth that contains v is magnified to fill the ruler.";
  markPresets();

  const tiny = pxWidth < 1 ? ` On screen the interval is only ${pxWidth.toPrecision(2)} px wide here, drawn as a 3 px sliver.` : "";
  let status;
  if (f.index === 0) {
    status = `Frame 0: the starting ruler runs from 0 to ${micro.frames[0].right} with ticks every ${tickSize(f.pos)}. Scaling picked it: it is the smallest power of ten at or above the interval’s upper end. Press Step.`;
  } else {
    const A = f.tickLabel(f.U), B = f.tickLabel(f.U + 1);
    const lvl = `Digit ${f.index} (ticks every ${tickSize(f.pos)}): `;
    if (!f.low && !f.high) status = `${lvl}neither ${A} nor ${B} is inside. Keep digit ${f.U} and zoom into [${A}, ${B}].`;
    else if (f.low && !f.high) status = `${lvl}${A} is inside, ${B} is not → print ${M.outputText(tr)}.`;
    else if (f.high && !f.low) status = `${lvl}${B} is inside, ${A} is not → print ${M.outputText(tr)}: the last digit rounds up.`;
    else if (tr.rule === "both-tie") status = `${lvl}both ${A} and ${B} are inside and v is exactly halfway. The paper allows either; this page keeps ${A}.`;
    else status = `${lvl}both ${A} and ${B} are inside; v is nearer to ${M.outputText(tr)}, so print that.`;
  }
  $("dm-status").textContent = status + tiny;
  $("dm-registers").innerHTML = registersHtml(f);
}

function registersHtml(f) {
  const tr = micro.trace;
  const S = tr.scaled.S;
  if (f.index === 0) {
    const i = tr.init, u = tr.afterUnequal;
    const lines = [
      ["start", `R = f·2${sup("max(q,0)")} = ${g(i.R)}, &nbsp;S = 2${sup("max(−q,0)")} = ${g(i.S)}, &nbsp;M⁻ = M⁺ = ${g(i.Mm)}`],
      ["unequal gaps", tr.unequal ? `yes: M⁺, R, S doubled → R = ${g(u.R)}, S = ${g(u.S)}, M⁺ = ${g(u.Mp)}` : "no"],
      ["scaling", `loop 1 ran ${tr.loop1.length}×, loop 2 ran ${tr.loop2.length}× → k = ${tr.scaled.k}, first digit weight 10${sup(tr.H)}`],
      ["now", `R = ${g(tr.scaled.R)}, &nbsp;S = ${g(S)}, &nbsp;M⁻ = ${g(tr.scaled.Mm)}, &nbsp;M⁺ = ${g(tr.scaled.Mp)}`],
    ];
    return dl(lines);
  }
  const row = f.row;
  const lines = [
    ["before", `R = ${g(row.R0)} &nbsp;(v sits at R/S ≈ ${M.approx(row.R0, S, 6)} of the cell)`],
    ["divide", `10R = ${g(row.tenR)} → U = ⌊10R / S⌋ = ${row.U}, &nbsp;R = 10R − U·S = ${g(row.R)}`],
    ["budget", `M⁻ = ${g(row.Mm)}, &nbsp;M⁺ = ${g(row.Mp)} &nbsp;(×10)`],
    ["low", `2R = ${g(row.twoR)} &lt; M⁻ = ${g(row.Mm)} ? ${yesNo(row.low)}`],
    ["high", `2R = ${g(row.twoR)} &gt; 2S − M⁺ = ${g(row.twoSminusMp)} ? ${yesNo(row.high)}`],
  ];
  if (f.final) lines.push(["result", ruleText(tr)]);
  return dl(lines);
}

function ruleText(tr) {
  const row = tr.rows[tr.rows.length - 1];
  switch (tr.rule) {
    case "low": return `low only → digit U = ${row.U} → <strong>${esc(M.outputText(tr))}</strong>`;
    case "high": return `high only → digit U + 1 = ${row.U + 1n} → <strong>${esc(M.outputText(tr))}</strong>`;
    case "both-down": return `both → 2R = ${g(row.twoR)} &lt; S = ${g(row.S)}: U is nearer → digit ${row.U} → <strong>${esc(M.outputText(tr))}</strong>`;
    case "both-up": return `both → 2R = ${g(row.twoR)} &gt; S = ${g(row.S)}: U + 1 is nearer → digit ${row.U + 1n} → <strong>${esc(M.outputText(tr))}</strong>`;
    default: return `both, and 2R = S exactly (a tie; the paper allows either) → keep U = ${row.U} → <strong>${esc(M.outputText(tr))}</strong>`;
  }
}

function dl(lines) {
  return `<dl>${lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

function animateMicro(to) {
  const from = micro.step;
  const f = micro.frames[from];
  if (to !== from + 1 || reduceMotion() || f.index === 0) {
    micro.step = to;
    renderMicro();
    syncUrl();
    return Promise.resolve();
  }
  micro.animating = true;
  const dur = micro.view === "dragon" ? 750 : 850;
  const start = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      if (t < 1) { renderMicro(Math.max(1e-6, e)); requestAnimationFrame(frame); }
      else { micro.step = to; micro.animating = false; renderMicro(); syncUrl(); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}

function stopPlay() {
  micro.playing = false;
  clearTimeout(micro.playTimer);
  $("dm-play").textContent = "Play";
}

async function playLoop() {
  while (micro.playing && micro.step < micro.frames.length - 1) {
    await animateMicro(micro.step + 1);
    if (!micro.playing) return;
    await new Promise((r) => { micro.playTimer = setTimeout(r, reduceMotion() ? 1400 : 1100); });
  }
  stopPlay();
  renderMicroText(Infinity);
}

function initMicro() {
  presetButtons();
  $("dm-x").value = micro.x;
  $("dm-p").value = micro.p;
  $("dm-p-out").textContent = micro.p;
  if (!computeMicro()) { micro.x = "pi"; computeMicro(); }
  renderMicro();

  $("dm-step").addEventListener("click", () => { if (!micro.animating && micro.step < micro.frames.length - 1) animateMicro(micro.step + 1); });
  $("dm-prev").addEventListener("click", () => { stopPlay(); if (!micro.animating && micro.step > 0) { micro.step--; renderMicro(); syncUrl(); } });
  $("dm-reset").addEventListener("click", () => { stopPlay(); micro.step = 0; renderMicro(); syncUrl(); });
  $("dm-play").addEventListener("click", () => {
    if (micro.playing) { stopPlay(); return; }
    if (micro.step >= micro.frames.length - 1) { micro.step = 0; renderMicro(); }
    micro.playing = true;
    $("dm-play").textContent = "Pause";
    playLoop();
  });
  const setView = (v) => { micro.view = v; renderMicro(); syncUrl(); };
  $("dm-view-micro").addEventListener("click", () => setView("micro"));
  $("dm-view-dragon").addEventListener("click", () => setView("dragon"));
  $("dm-p").addEventListener("input", () => {
    stopPlay();
    micro.p = clampP(Number($("dm-p").value));
    $("dm-p-out").textContent = micro.p;
    micro.step = 0;
    if (computeMicro()) renderMicro();
    syncUrl();
  });
  $("dm-x").addEventListener("change", () => {
    stopPlay();
    const old = micro.x;
    micro.x = $("dm-x").value.trim() || "pi";
    micro.step = 0;
    if (computeMicro()) { renderMicro(); syncUrl(); } else { micro.x = old; }
  });
  new ResizeObserver(() => { if (!micro.animating) renderMicro(); }).observe($("dm-svg"));
}

// ====================================================================== worksheet

const sheet = {
  id: M.SHEETS.some((s) => s.id === params.get("sheet")) ? params.get("sheet") : "1.375",
  stage: Number(params.get("ws")) || 0,
  mode: params.get("num") === "frac" ? "frac" : "int",
  answers: new Map(),
  revealAllOnLoad: params.get("reveal") === "1",
  def: null, input: null, trace: null, variantTrace: null, stages: [],
};

function answersFor(id) {
  if (!sheet.answers.has(id)) sheet.answers.set(id, { cells: {}, revealed: new Set(), finalRevealed: false, finalText: "" });
  return sheet.answers.get(id);
}

function loadSheet() {
  sheet.def = M.SHEETS.find((s) => s.id === sheet.id);
  sheet.input = sheet.def.input();
  sheet.trace = M.dragon4(sheet.input);
  sheet.variantTrace = sheet.def.variant ? M.dragon4(sheet.input, sheet.def.variant) : null;
  sheet.stages = ["init", "unequal", "loop1", "loop2", ...sheet.trace.rows.map((_, i) => `row${i}`), "final"];
  sheet.stage = Math.min(Math.max(0, sheet.stage), sheet.stages.length - 1);
  if (!sheet.def.practice) {
    const a = answersFor(sheet.id);
    sheet.trace.rows.forEach((_, i) => a.revealed.add(i));
    a.finalRevealed = true;
  }
}

const LESSONS = {
  "1.375": (tr) => `The main example. The truncation ${lastPrefix(tr, 0)} is outside the interval, but ${M.outputText(tr)} is inside, so the last digit <strong>rounds up</strong>. Loop 2 runs once (S × 10), because v is above 1.`,
  "0.34375": (tr) => `In the last row <strong>both</strong> tests say yes: ${lastPrefix(tr, 0)} and ${lastPrefix(tr, 1)} are both inside. Then 2R is compared with S to pick the nearer one. No scaling is needed: v is already between 0.1 and 1.`,
  "3.140625": () => `The microscope’s example (π to 8 bits) as a table. Three rows; the third ends with <code>low</code>: the truncation is inside.`,
  "0.125": (tr) => `A power of two: the gap below is half the gap above. Instead of halving M⁻ (not an integer), Dragon4 doubles R, S and M⁺. Watch the last row: only <code>high</code> fires, so the output is ${M.outputText(tr)}. The truncation ${lastPrefix(tr, 0)} is exactly as far from v, but it lies outside the interval, because the gap below v is the smaller one.`,
  "96": (tr) => `A value above 1: loop 2 multiplies S by 10 until the upper end of the interval is at most 10<sup>k</sup>: S goes ${[1n, ...tr.loop2.map((l) => l.S)].map(g).join(" → ")}. The last row fires both tests with a remainder of 0.`,
  "0.3": (tr) => { const r = tr.rows[0]; return `A real double. The integers now have 17 digits, but there is only one row: U = ${r.U}, and the remainder is so close to S that 1 − R/S ≈ ${M.approx(r.S - r.R, r.S, 3)} is less than half the upper budget, M⁺/2S ≈ ${M.approx(r.Mp, 2n * r.S, 3)}. So <code>high</code> fires and the output is ${M.outputText(tr)}. Switch to <em>≈ Fractions</em> to read the rows as positions in the cell.`; },
  "1e-6": (tr) => `Why loop 2 tests the <em>upper end</em> of the interval (2R + M⁺ &gt; 2S) and not v. The double 1e-6 is slightly below 10${sup(-6)}, but 10${sup(-6)} itself is inside its interval. Loop 1 runs ${tr.loop1.length} times, then loop 2 notices that the upper end is above 10${sup(tr.loop1.at(-1).k)} and adds one more decade. So the first digit is a 0 that immediately rounds up to 1.`,
  "2^64": () => `A power of two among real doubles. The unequal-gap step matters here: open the note below to see what symmetric budgets would print.`,
};

function lastPrefix(tr, bump) {
  const row = tr.rows[tr.rows.length - 1];
  let c = 0n;
  for (let i = 0; i < tr.rows.length - 1; i++) c = c * 10n + tr.rows[i].U;
  c = c * 10n + row.U + BigInt(bump);
  return M.decimalText(c, row.pos);
}

function renderTabs() {
  const box = $("dm-sheet-tabs");
  box.replaceChildren();
  for (const s of M.SHEETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.id = `dm-tab-${s.id.replace(/[^a-z0-9]/gi, "_")}`;
    b.textContent = s.label;
    b.setAttribute("aria-selected", String(s.id === sheet.id));
    b.setAttribute("aria-pressed", String(s.id === sheet.id));
    b.tabIndex = s.id === sheet.id ? 0 : -1;
    b.addEventListener("click", () => selectSheet(s.id));
    b.addEventListener("keydown", (e) => {
      const i = M.SHEETS.indexOf(s);
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % M.SHEETS.length;
      if (e.key === "ArrowLeft") j = (i - 1 + M.SHEETS.length) % M.SHEETS.length;
      if (j !== null) { e.preventDefault(); selectSheet(M.SHEETS[j].id); box.children[j].focus(); }
    });
    box.append(b);
  }
}

function selectSheet(id) {
  sheet.id = id;
  sheet.stage = 0;
  loadSheet();
  renderSheet();
  syncUrl();
}

function renderSheet() {
  renderTabs();
  const tr = sheet.trace, inp = sheet.input;
  const s = inputSummary(inp);
  $("dm-sheet-lesson").innerHTML = `<p class="dm-lesson-head">v = ${s.form} = ${s.v} <span>(${s.kind})</span><br>neighbours ${valueText(s.nb.lowerNeighbour)} and ${valueText(s.nb.upperNeighbour)} · interval (${s.lower}, ${s.upper}) · output <strong>${esc(M.outputText(tr))}</strong></p><p>${LESSONS[sheet.id](tr)}</p>`;
  renderSetup();
  renderTable();
  renderFinal();
  renderVariant();
  renderStage();
}

function renderSetup() {
  const tr = sheet.trace, i = tr.init, u = tr.afterUnequal, inp = sheet.input;
  const items = [];
  items.push(["init", `<b>Start.</b> v = ${g(inp.f)} × 2${sup(inp.q)}: R = ${g(i.R)}, S = ${g(i.S)}, M⁻ = M⁺ = ${g(i.Mm)}. Now v = R/S exactly.`]);
  items.push(["unequal", tr.unequal
    ? `<b>Unequal gaps?</b> Yes, f = 2${sup(inp.p - 1)}. Double M⁺, R and S: R = ${g(u.R)}, S = ${g(u.S)}, M⁻ = ${g(u.Mm)}, M⁺ = ${g(u.Mp)}.`
    : `<b>Unequal gaps?</b> No (f ≠ 2${sup(inp.p - 1)}): nothing to do.`]);
  const l1 = tr.loop1;
  items.push(["loop1", l1.length === 0
    ? `<b>Loop 1</b> (R &lt; ⌈S/10⌉?): ${g(u.R)} &lt; ${g((u.S + 9n) / 10n)} is false. k stays 0.`
    : `<b>Loop 1</b> (R &lt; ⌈S/10⌉?): runs ${l1.length}×, multiplying R, M⁻, M⁺ by 10 each time: R = ${g(l1.at(-1).R)}, M⁻ = ${g(l1.at(-1).Mm)}, M⁺ = ${g(l1.at(-1).Mp)}, k = ${l1.at(-1).k}.`]);
  const l2 = tr.loop2;
  const lhs = 2n * tr.scaled.R + tr.scaled.Mp;
  let l2text;
  if (l2.length === 0) l2text = `<b>Loop 2</b> (2R + M⁺ &gt; 2S?): ${g(lhs)} &gt; ${g(2n * tr.scaled.S)} is false. k = ${tr.scaled.k}.`;
  else if (l2.length <= 4) {
    const S0 = tr.scaled.S / 10n ** BigInt(l2.length);
    const Ss = [S0, ...l2.map((l) => l.S)];
    l2text = `<b>Loop 2</b> (2R + M⁺ &gt; 2S?): 2R + M⁺ = ${g(lhs)}. Against 2S = ${Ss.map((S, j) => `${g(2n * S)}: ${j < Ss.length - 1 ? "yes, S × 10" : "no"}`).join("; ")}. So S = ${g(tr.scaled.S)}, k = ${tr.scaled.k}.`;
  } else l2text = `<b>Loop 2</b> (2R + M⁺ &gt; 2S?): runs ${l2.length}×, multiplying S by 10 each time: S = ${g(tr.scaled.S)}, k = ${tr.scaled.k}.`;
  items.push(["loop2", `${l2text} The first digit has weight 10${sup(tr.H)}.`]);
  const ol = $("dm-sheet-setup");
  ol.innerHTML = items.map(([id, html]) => `<li data-stage="${id}"><button type="button" class="dm-stage-btn" data-stage="${id}">${html}</button></li>`).join("");
  ol.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setStage(sheet.stages.indexOf(b.dataset.stage))));
}

function frac(a, b, sig = 20) { return M.approx(a, b, sig); }

function renderTable() {
  const tr = sheet.trace, a = answersFor(sheet.id);
  const intMode = sheet.mode === "int";
  const S = tr.scaled.S;
  const head = intMode
    ? ["row", "10R", `÷ S = ${g(S)} → U`, "remainder R", "M⁻, M⁺", "2R &lt; M⁻?", "2R &gt; 2S − M⁺?"]
    : ["row", "10R / S", "U", "R / S", "M⁻/2S, M⁺/2S", "R/S &lt; M⁻/2S?", "1 − R/S &lt; M⁺/2S?"];
  let html = `<table class="dm-table ${intMode ? "" : "dm-frac"}"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>`;
  tr.rows.forEach((row, i) => {
    const open = a.revealed.has(i) || !sheet.def.practice || !intMode;
    const cls = [];
    if (open) cls.push("dm-open");
    html += `<tr data-row="${i}" class="${cls.join(" ")}"><th scope="row">${i + 1}<small>10${sup(row.pos)}</small></th>`;
    if (intMode) {
      html += cell(i, "tenR", row.tenR, open, "10R");
      html += cell(i, "U", row.U, open, "U");
      html += cell(i, "R", row.R, open, "remainder R");
      html += `<td class="dm-num">${g(row.Mm)},<br>${g(row.Mp)}</td>`;
      html += testCell(i, "low", row.low, open, `${g(row.twoR)} &lt; ${g(row.Mm)}`);
      html += testCell(i, "high", row.high, open, `${g(row.twoR)} &gt; ${g(row.twoSminusMp)}`);
    } else {
      html += `<td class="dm-num">${frac(row.tenR, S)}</td><td class="dm-num">${row.U}</td><td class="dm-num">${frac(row.R, S)}</td>`;
      html += `<td class="dm-num">${frac(row.Mm, 2n * S, 4)}, ${frac(row.Mp, 2n * S, 4)}</td>`;
      html += `<td class="dm-test">${frac(row.R, S, 6)} &lt; ${frac(row.Mm, 2n * S, 4)}? ${yesNo(row.low)}</td>`;
      html += `<td class="dm-test">${frac(S - row.R, S, 6)} &lt; ${frac(row.Mp, 2n * S, 4)}? ${yesNo(row.high)}</td>`;
    }
    html += "</tr>";
  });
  html += "</tbody></table>";
  const wrap = $("dm-sheet-table");
  wrap.innerHTML = html;
  wrap.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", () => {
      a.cells[`${inp.dataset.row}-${inp.dataset.field}`] = inp.value;
      validateCell(inp);
      afterAnswer(Number(inp.dataset.row));
    });
    validateCell(inp);
  });
  wrap.querySelectorAll("button[data-field]").forEach((b) => {
    b.addEventListener("click", () => {
      a.cells[`${b.dataset.row}-${b.dataset.field}`] = b.dataset.val;
      const grp = b.parentElement;
      grp.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      validateTest(grp);
      afterAnswer(Number(b.dataset.row));
    });
  });
  wrap.querySelectorAll(".dm-yn").forEach(validateTest);
  wrap.querySelectorAll("tr[data-row]").forEach((trEl) => {
    trEl.addEventListener("focusin", () => setStage(4 + Number(trEl.dataset.row), false));
    trEl.addEventListener("click", (e) => { if (e.target === trEl || e.target.tagName === "TD" || e.target.tagName === "TH") setStage(4 + Number(trEl.dataset.row), false); });
  });
}

function cell(i, field, value, open, label) {
  if (open) return `<td class="dm-num">${g(value)}</td>`;
  const v = answersFor(sheet.id).cells[`${i}-${field}`] ?? "";
  return `<td class="dm-num"><input type="text" inputmode="numeric" autocomplete="off" spellcheck="false" class="dm-in" data-row="${i}" data-field="${field}" data-expect="${value}" value="${esc(v)}" aria-label="Row ${i + 1}: ${label}" size="${Math.max(3, value.toString().length + 1)}"></td>`;
}

function testCell(i, field, value, open, expr) {
  if (open) return `<td class="dm-test">${expr}? ${yesNo(value)}</td>`;
  const v = answersFor(sheet.id).cells[`${i}-${field}`];
  const label = field === "low" ? "is 2R less than M⁻?" : "is 2R greater than 2S − M⁺?";
  return `<td class="dm-test"><span class="dm-yn" role="group" aria-label="Row ${i + 1}: ${label}" data-expect="${value ? "yes" : "no"}" data-expr="${esc(expr)}">`
    + ["yes", "no"].map((y) => `<button type="button" data-row="${i}" data-field="${field}" data-val="${y}" aria-pressed="${v === y}">${y}</button>`).join("")
    + `</span><span class="dm-expr"></span></td>`;
}

function validateCell(inp) {
  const raw = inp.value.replace(/[\s _,]/g, "");
  inp.classList.remove("dm-ok", "dm-bad");
  inp.removeAttribute("aria-invalid");
  if (!raw) return;
  let ok = false;
  try { ok = BigInt(raw) === BigInt(inp.dataset.expect); } catch { ok = false; }
  inp.classList.add(ok ? "dm-ok" : "dm-bad");
  if (!ok) inp.setAttribute("aria-invalid", "true");
}

function validateTest(grp) {
  const pressed = grp.querySelector('button[aria-pressed="true"]');
  const expr = grp.nextElementSibling;
  grp.classList.remove("dm-ok", "dm-bad");
  expr.innerHTML = "";
  if (!pressed) return;
  const ok = pressed.dataset.val === grp.dataset.expect;
  grp.classList.add(ok ? "dm-ok" : "dm-bad");
  if (ok) expr.innerHTML = grp.dataset.expr;
}

function rowSolved(i) {
  const a = answersFor(sheet.id);
  if (a.revealed.has(i)) return true;
  const row = sheet.trace.rows[i];
  const c = a.cells;
  const eq = (k, v) => { try { return BigInt((c[`${i}-${k}`] ?? "").replace(/[\s _,]/g, "") || "x") === v; } catch { return false; } };
  return eq("tenR", row.tenR) && eq("U", row.U) && eq("R", row.R) && c[`${i}-low`] === (row.low ? "yes" : "no") && c[`${i}-high`] === (row.high ? "yes" : "no");
}

function afterAnswer(i) {
  const trEl = $("dm-sheet-table").querySelector(`tr[data-row="${i}"]`);
  if (trEl) trEl.classList.toggle("dm-solved", rowSolved(i));
  renderFinal();
  renderHint();
}

function renderFinal() {
  const tr = sheet.trace, a = answersFor(sheet.id);
  const allSolved = tr.rows.every((_, i) => rowSolved(i));
  const box = $("dm-sheet-final");
  if (!allSolved && !a.finalRevealed) {
    box.innerHTML = `<p class="dm-muted">Finish the rows (or reveal them) to see how the last digit is chosen.</p>`;
    return;
  }
  const outputOpen = a.finalRevealed || !sheet.def.practice;
  const last = tr.rows.at(-1);
  if (outputOpen) {
    box.innerHTML = `<p><b>Last row:</b> ${ruleText(tr)}</p>`;
    return;
  }
  box.innerHTML = `<p><b>Last row:</b> low = ${yesNo(last.low)}, high = ${yesNo(last.high)}. Which digit goes last?</p>`
    + `<p class="dm-final-out"><label>Type the printed number <input type="text" id="dm-final-in" class="dm-in" value="${esc(a.finalText)}" size="10" spellcheck="false" autocomplete="off"></label></p>`;
  const inp = $("dm-final-in");
  const check = (announce) => {
    a.finalText = inp.value;
    inp.classList.remove("dm-ok", "dm-bad");
    inp.removeAttribute("aria-invalid");
    const d = parseDecimal(inp.value.trim());
    if (!inp.value.trim() || !d) return;
    const n = M.normalize(d.coefficient, d.exponent);
    const want = M.normalize(tr.coefficient, tr.exp10);
    const ok = n.coefficient === want.coefficient && n.exp10 === want.exp10;
    inp.classList.add(ok ? "dm-ok" : "dm-bad");
    if (!ok) inp.setAttribute("aria-invalid", "true");
    if (announce) $("dm-hint").textContent = ok ? `Right: ${ruleText(tr).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")}.` : "Not quite. low only → keep U; high only → U + 1; both → compare 2R with S.";
  };
  inp.addEventListener("input", () => check(true));
  inp.addEventListener("focus", () => setStage(sheet.stages.length - 1, false));
  check(false);
}

function renderVariant() {
  const box = $("dm-sheet-variant");
  const vt = sheet.variantTrace;
  if (!vt) { box.innerHTML = ""; return; }
  const inp = sheet.input;
  let summary, body;
  if (sheet.id === "0.125" || sheet.id === "2^64") {
    const back = readBack(vt, inp);
    summary = sheet.id === "0.125" ? "What if we skip the unequal-gap step?" : "What would symmetric budgets print?";
    const rows = vt.rows.map((r) => `${r.U}${r.low || r.high ? ` (low ${r.low ? "yes" : "no"}, high ${r.high ? "yes" : "no"})` : ""}`).join(", ");
    body = `<p>With M⁺ = M⁻ (no doubling), the digit rows give ${rows} and the output is <strong>${esc(M.outputText(vt))}</strong>. `
      + `But that decimal reads back as ${back}, not as v. The naive budget lets the output go a full half of the <em>upper</em> gap below v, while the real lower half-gap is only half as wide.</p>`;
  } else if (sheet.id === "96") {
    const ds = vt.digitString.split("").join(", ");
    summary = "What does the published ≥ in loop 2 do here?";
    body = `<p>The upper boundary of 96 is exactly 100. With the paper’s <code>while 2R + M⁺ ≥ 2S</code> the loop runs one more time: S = ${g(vt.scaled.S)}, k = ${vt.scaled.k}, and the digits come out as ${ds}: a <strong>leading zero</strong>. The value is still right, but the output is one digit too long. This page uses <code>&gt;</code>; see the <a href="#footnote-ge">footnote</a>. (100 itself is not printed because it lies exactly on the excluded boundary.)</p>`;
  } else if (sheet.id === "1e-6") {
    const r = vt.rows[0];
    summary = "What if loop 2 tested v instead of the upper end?";
    body = `<p>Scaling on v alone (<code>while R ≥ S</code>) stops at k = ${vt.scaled.k}, so the first digit gets weight 10${sup(vt.H)}. The first row gives U = ${r.U} with remainder R/S ≈ ${M.approx(r.R, r.S, 20)}, and <code>high</code> fires. Rounding up would make that digit <strong>${vt.lastDigit}</strong>: a carry into a digit position that does not exist. Testing the upper end of the interval in loop 2 prevents exactly this.</p>`;
  }
  box.innerHTML = `<details><summary>${summary}</summary>${body}</details>`;
}

function readBack(t, input) {
  if (input.kind === "double") {
    const x = Number(`${t.coefficient}e${t.exp10}`);
    const d = BigInt(x) - BigInt(input.value);
    return `${BigInt(x)} = 2${sup(64)} − ${-d}, the next double down`;
  }
  const [num, den] = t.exp10 >= 0 ? [t.coefficient * M.pow10(t.exp10), 1n] : [t.coefficient, M.pow10(-t.exp10)];
  const r = M.roundToPrecision(num, den, input.p);
  const val = r.q >= 0 ? { num: r.f << BigInt(r.q), den: 1n } : { num: r.f, den: 1n << BigInt(-r.q) };
  return `${M.rationalText(val)}, the lower neighbour`;
}

// ---- pseudocode

const CODE = [
  { st: ["init"], text: "R ← f · 2^max(q,0);  S ← 2^max(−q,0)", note: (tr) => `R = ${sh(tr.init.R)}, S = ${sh(tr.init.S)}` },
  { st: ["init"], text: "M⁻ ← M⁺ ← 2^max(q,0)", note: (tr) => `= ${sh(tr.init.Mm)}` },
  { st: ["unequal"], text: "if f = 2^(p−1):  M⁺ ← 2M⁺;  R ← 2R;  S ← 2S", note: (tr) => (tr.unequal ? "yes, doubled" : "no") },
  { st: ["loop1"], text: "k ← 0" },
  { st: ["loop1"], text: "while R < ⌈S/10⌉:  k ← k−1;  R, M⁻, M⁺ ← 10×", note: (tr) => `${tr.loop1.length}×, k = ${tr.loop1.at(-1)?.k ?? 0}` },
  { st: ["loop2"], text: "while 2R + M⁺ > 2S:  S ← 10S;  k ← k+1   ¹", note: (tr) => `${tr.loop2.length}×, k = ${tr.scaled.k}` },
  { st: ["loop2"], text: "H ← k − 1", note: (tr) => `H = ${tr.H}` },
  { st: ["row"], text: "loop" },
  { st: ["row"], text: "  k ← k − 1", note: (tr, row) => `digit weight 10^${row.pos}` },
  { st: ["row"], text: "  U ← ⌊10R / S⌋;  R ← 10R mod S", note: (tr, row, open) => (open ? `U = ${row.U}, R = ${sh(row.R)}` : `10R ÷ ${sh(row.S)}`) },
  { st: ["row"], text: "  M⁻ ← 10·M⁻;  M⁺ ← 10·M⁺", note: (tr, row) => `${sh(row.Mm)}, ${sh(row.Mp)}` },
  { st: ["row"], text: "  low  ← 2R < M⁻", note: (tr, row, open) => (open ? `${row.low ? "yes" : "no"}` : `2R vs ${sh(row.Mm)}`) },
  { st: ["row"], text: "  high ← 2R > 2S − M⁺", note: (tr, row, open) => (open ? `${row.high ? "yes" : "no"}` : `2R vs ${sh(row.twoSminusMp)}`) },
  { st: ["row"], text: "  until low or high;  emit U", note: (tr, row, open) => (open ? (row.low || row.high ? "stop" : `emit ${row.U}`) : "") },
  { st: ["final-low"], text: "if low and not high:  emit U" },
  { st: ["final-high"], text: "if high and not low:  emit U + 1" },
  { st: ["final-both"], text: "if both:  emit U if 2R ≤ S else U + 1   ²" },
];

function sh(n) {
  const s = n.toString();
  return s.length > 12 ? `${s.slice(0, 4)}…(${s.length} digits)` : g(n);
}

function renderCode() {
  const tr = sheet.trace;
  const stage = sheet.stages[sheet.stage];
  const a = answersFor(sheet.id);
  let key = stage, row = null, open = false;
  if (stage.startsWith("row")) {
    const i = Number(stage.slice(3));
    key = "row"; row = tr.rows[i]; open = a.revealed.has(i) || rowSolved(i);
  }
  if (stage === "final") key = tr.rule === "low" ? "final-low" : tr.rule === "high" ? "final-high" : "final-both";
  const html = CODE.map((line) => {
    const hl = line.st.includes(key);
    const note = hl && line.note ? line.note(tr, row, open) : "";
    return `<span class="dm-line${hl ? " hl" : ""}">${esc(line.text)}${note ? `<span class="dm-note">  ← ${esc(note)}</span>` : ""}</span>`;
  }).join("\n");
  $("dm-code").innerHTML = `${html}\n\n<span class="dm-foot">¹ the paper has ≥ here; see the footnote at the end\n² when 2R = S the paper allows either digit</span>`;
}

function renderHint() {
  const tr = sheet.trace, stage = sheet.stages[sheet.stage];
  let text = "";
  if (stage === "init") text = "Everything becomes an integer: v = R/S exactly, and M⁻/S, M⁺/S are the full gaps to the neighbours.";
  else if (stage === "unequal") text = tr.unequal ? "Powers of two have a smaller gap below. Doubling R, S and M⁺ keeps M⁻ an integer." : "Only powers of two need this step.";
  else if (stage === "loop1") text = "Loop 1 handles small v: make R/S at least about 1/10.";
  else if (stage === "loop2") text = "Loop 2 handles large v: grow S until the upper end of the interval, (2R + M⁺)/2S, is at most 1.";
  else if (stage === "final") text = "low only → keep U. high only → U + 1. Both → whichever is nearer: compare 2R with S.";
  else {
    const i = Number(stage.slice(3));
    const row = tr.rows[i];
    const prevR = i === 0 ? tr.scaled.R : tr.rows[i - 1].R;
    const prevKnown = i === 0 || rowSolved(i - 1);
    text = rowSolved(i)
      ? `Row ${i + 1} done. ${row.low || row.high ? "A test said yes: this is the last row." : "Both tests said no: emit " + row.U + " and continue."}`
      : `Row ${i + 1}: 10R = 10 × ${prevKnown ? g(prevR) : "(the previous remainder)"}. U = how many times S = ${g(row.S)} fits into 10R; R = what is left. Then compare 2R with M⁻ = ${g(row.Mm)} and with 2S − M⁺ = ${g(row.twoSminusMp)}.`;
  }
  $("dm-hint").textContent = text;
}

function renderStage() {
  const stage = sheet.stages[sheet.stage];
  $("dm-sheet-setup").querySelectorAll("li").forEach((li) => li.classList.toggle("dm-current", li.dataset.stage === stage));
  $("dm-sheet-table").querySelectorAll("tr[data-row]").forEach((trEl) => {
    trEl.classList.toggle("dm-current", stage === `row${trEl.dataset.row}`);
    trEl.classList.toggle("dm-solved", rowSolved(Number(trEl.dataset.row)));
  });
  $("dm-sheet-final").classList.toggle("dm-current", stage === "final");
  $("dm-ws-prev").disabled = sheet.stage === 0;
  $("dm-ws-next").disabled = sheet.stage === sheet.stages.length - 1;
  $("dm-ws-int").setAttribute("aria-pressed", String(sheet.mode === "int"));
  $("dm-ws-frac").setAttribute("aria-pressed", String(sheet.mode === "frac"));
  const practice = sheet.def.practice && sheet.mode === "int";
  $("dm-ws-reveal-row").disabled = !practice;
  $("dm-ws-reveal").disabled = !practice;
  $("dm-ws-clear").disabled = !practice;
  renderCode();
  renderHint();
}

function setStage(i, rerender = true) {
  if (i < 0 || i >= sheet.stages.length) return;
  sheet.stage = i;
  if (rerender) renderStage(); else { renderStage(); }
  syncUrl();
}

function initSheet() {
  loadSheet();
  if (sheet.revealAllOnLoad) revealAll(false);
  renderSheet();
  $("dm-ws-prev").addEventListener("click", () => setStage(sheet.stage - 1));
  $("dm-ws-next").addEventListener("click", () => setStage(sheet.stage + 1));
  $("dm-ws-reveal-row").addEventListener("click", () => {
    const a = answersFor(sheet.id);
    const stage = sheet.stages[sheet.stage];
    let i = stage.startsWith("row") ? Number(stage.slice(3)) : sheet.trace.rows.findIndex((_, j) => !a.revealed.has(j));
    if (stage === "final" || i < 0) { a.finalRevealed = true; renderSheet(); return; }
    a.revealed.add(i);
    sheet.stage = 4 + i;
    renderSheet();
  });
  $("dm-ws-reveal").addEventListener("click", () => revealAll(true));
  $("dm-ws-clear").addEventListener("click", () => {
    sheet.answers.delete(sheet.id);
    loadSheet();
    renderSheet();
  });
  $("dm-ws-int").addEventListener("click", () => { sheet.mode = "int"; renderSheet(); syncUrl(); });
  $("dm-ws-frac").addEventListener("click", () => { sheet.mode = "frac"; renderSheet(); syncUrl(); });
}

function revealAll(render) {
  const a = answersFor(sheet.id);
  sheet.trace.rows.forEach((_, i) => a.revealed.add(i));
  a.finalRevealed = true;
  if (render) renderSheet();
}

// ====================================================================== cost table

const costRows = [...M.COST_EXAMPLES];

function renderCost() {
  const rows = costRows.map((x) => {
    const t = M.dragon4(M.doubleInput(x));
    return `<tr><td class="dm-num">${esc(String(x))}</td><td class="dm-num">${esc(M.outputText(t))}</td><td class="dm-num">${t.loop1.length}</td><td class="dm-num">${t.loop2.length}</td><td class="dm-num"><strong>${t.loop1.length + t.loop2.length}</strong></td><td class="dm-num">${t.maxBits}</td><td class="dm-num">${t.rows.length}</td></tr>`;
  });
  $("dm-cost-table").innerHTML = `<table class="dm-table"><thead><tr><th scope="col">double</th><th scope="col">printed</th><th scope="col">loop 1</th><th scope="col">loop 2</th><th scope="col">×10 steps</th><th scope="col">largest integer (bits)</th><th scope="col">digit rows</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function initCost() {
  renderCost();
  const add = () => {
    const x = Number($("dm-cost-x").value.trim());
    if (!(x > 0) || !Number.isFinite(x)) { $("dm-cost-x").setAttribute("aria-invalid", "true"); return; }
    $("dm-cost-x").removeAttribute("aria-invalid");
    if (!costRows.includes(x)) costRows.push(x);
    renderCost();
  };
  $("dm-cost-go").addEventListener("click", add);
  $("dm-cost-x").addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
}

// ====================================================================== fine print

function initFine() {
  const ex = [1e23, 1.1364609618646e18, 22528237593729.1875];
  const rows = ex.map((x) => {
    const c = M.compareWithJs(x);
    const paper = M.dragon4(M.doubleInput(x), { scaleTest: "paper" });
    const why = x === 1e23 ? "10²³ is exactly the upper boundary; f is even" : x === 22528237593729.1875 ? "exact tie between …187 and …188" : "toString’s shorter decimal lies exactly on the boundary";
    return `<tr><td class="dm-num">${esc(c.jsText)}</td><td class="dm-num"><strong>${esc(c.dragonText)}</strong>${paper.leadingZero ? `<br><small>paper’s ≥: digits ${paper.digitString}</small>` : ""}</td><td class="dm-num">${esc(c.jsText)}</td><td>${why}</td></tr>`;
  });
  $("dm-fine").innerHTML = `<div class="dm-table-wrap"><table class="dm-table"><thead><tr><th scope="col">double</th><th scope="col">strict Dragon4 (this page)</th><th scope="col">toString</th><th scope="col">why</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

  $("dm-sample").addEventListener("click", () => {
    const btn = $("dm-sample");
    btn.disabled = true;
    const N = 20000;
    let done = 0, diff = 0;
    const examples = [];
    const out = $("dm-sample-out");
    const chunk = () => {
      const end = Math.min(N, done + 500);
      for (; done < end; done++) {
        const x = M.randomDouble();
        const c = M.compareWithJs(x);
        if (!c.same) { diff++; if (examples.length < 3) examples.push(`${c.jsText} → ${c.dragonText}`); }
      }
      out.textContent = `${done.toLocaleString("en")} checked, ${diff} differ…`;
      if (done < N) setTimeout(chunk, 0);
      else {
        out.textContent = `${diff} of ${N.toLocaleString("en")} random bit patterns differ from toString (${(100 * diff / N).toFixed(3)} %)${examples.length ? `, e.g. ${examples.join("; ")}` : ""}. All of them still read back as the same double.`;
        btn.disabled = false;
      }
    };
    chunk();
  });
}

// ====================================================================== URL

function syncUrl() {
  const q = new URLSearchParams();
  if (micro.x !== "pi") q.set("x", micro.x);
  if (micro.p !== 8) q.set("p", micro.p);
  if (micro.step) q.set("step", micro.step);
  if (micro.view !== "micro") q.set("view", micro.view);
  if (sheet.id !== "1.375") q.set("sheet", sheet.id);
  if (sheet.stage) q.set("ws", sheet.stage);
  if (sheet.mode !== "int") q.set("num", sheet.mode);
  const s = q.toString();
  history.replaceState(null, "", s ? `?${s}${location.hash}` : location.pathname + location.hash);
}

initMicro();
initSheet();
initCost();
initFine();
