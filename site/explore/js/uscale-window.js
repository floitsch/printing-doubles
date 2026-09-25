// Copyright (C) 2026 Toit contributors.
//
// DOM code for the "Four zones, then the decimal window" page (unrounded scaling).

import * as M from "./uscale-window-model.js";

const SVGNS = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const params = new URLSearchParams(window.location.search);

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A persistent SVG for a box; `draw(svg, width)` repaints its content. Re-created on resize. */
function svgFigure(box, height, draw, attrs = {}) {
  let svg = null, width = 0;
  const make = () => {
    width = Math.max(300, Math.floor(box.clientWidth));
    svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "usw-svg", ...attrs });
    box.replaceChildren(svg);
    fig.svg = svg; fig.width = width;
    if (fig.onMake) fig.onMake(svg);
    fig.render();
  };
  const fig = {
    svg: null, width: 0, height, onMake: null,
    render() { svg.replaceChildren(); draw(svg, width); },
    resize(h) { fig.height = height = h; make(); },
  };
  let last = box.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(box.clientWidth - last) >= 1) { last = box.clientWidth; make(); }
  }).observe(box);
  queueMicrotask(make);
  return fig;
}

function setParams(obj) {
  const p = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") p.delete(k); else p.set(k, v);
  }
  const q = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sup = (n) => `<sup>${String(n).replace("-", "−")}</sup>`;
const minus = (n) => String(n).replace("-", "−");

/** Code as bits: integer | ½ | sticky, with coloured extra bits. */
function bitsHTML(u) {
  const { int, half, sticky } = M.parts(u);
  return `${int.toString(2)}|<span class="usw-half-c">${half}</span>|<span class="usw-sticky-c">${sticky}</span>`;
}
const tag = (u) => `⟨${M.ustr(u)}⟩`;

// ---------------------------------------------------------------------------
// A ruler of zones: dots at integers and halves, open bars between them.
// ---------------------------------------------------------------------------

function zoneRuler(svg, width, y, lo, hi, { pad = 24, label = (n) => String(n), labelY = y + 26, labelClass = "usw-int-label" } = {}) {
  const X = (v) => pad + ((v - lo) / (hi - lo)) * (width - 2 * pad);
  const g = el("g", { class: "usw-ruler" });
  for (let n = lo; n < hi; n++) {
    g.append(el("line", { x1: X(n) + 8, x2: X(n + 0.5) - 8, y1: y, y2: y, class: "usw-gap-a" }));
    g.append(el("line", { x1: X(n + 0.5) + 8, x2: X(n + 1) - 8, y1: y, y2: y, class: "usw-gap-b" }));
  }
  for (let k = 2 * lo; k <= 2 * hi; k++) {
    g.append(el("circle", { cx: X(k / 2), cy: y, r: k % 2 ? 4.5 : 5.5, class: k % 2 ? "usw-dot usw-dot-half" : "usw-dot" }));
  }
  for (let n = lo; n <= hi; n++) g.append(el("text", { x: X(n), y: labelY, "text-anchor": "middle", class: labelClass }, label(n)));
  svg.append(g);
  return X;
}

/** Highlight the zone of code u (integer code, Number) on a zone ruler. */
function zoneHighlight(svg, X, u, y, cls) {
  if (u % 2 === 0) {
    svg.append(el("circle", { cx: X(u / 4), cy: y, r: 10, class: cls }));
  } else {
    const a = (u - 1) / 4, b = (u + 1) / 4;
    svg.append(el("rect", { x: X(a) + 7, y: y - 8, width: Math.max(2, X(b) - X(a) - 14), height: 16, rx: 8, class: cls }));
  }
}

function pinAt(svg, x, yTop, yBottom) {
  svg.append(el("line", { x1: x, x2: x, y1: yTop, y2: yBottom, class: "usw-pin-line" }));
  svg.append(el("circle", { cx: x, cy: yTop, r: 8, class: "usw-pin" }));
}

/** Pointer + keyboard control of a pin on a zone ruler. State is x in hundredths. */
function attachPin(fig, { lo, hi, pad = 24, get, set, label }) {
  const toValue = (evt) => {
    const rect = fig.svg.getBoundingClientRect();
    const px = (evt.clientX - rect.left) * (fig.width / rect.width);
    const X = (v) => pad + ((v - lo) / (hi - lo)) * (fig.width - 2 * pad);
    let v = lo + ((px - pad) / (fig.width - 2 * pad)) * (hi - lo);
    v = Math.min(hi, Math.max(lo, v));
    const snap = Math.round(v * 2) / 2;
    if (Math.abs(X(snap) - px) <= 9) v = snap;
    return Math.round(v * 100);
  };
  fig.onMake = (svg) => {
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("role", "slider");
    svg.setAttribute("aria-valuemin", String(lo));
    svg.setAttribute("aria-valuemax", String(hi));
    let dragging = false;
    svg.addEventListener("pointerdown", (e) => { dragging = true; svg.setPointerCapture(e.pointerId); set(toValue(e)); });
    svg.addEventListener("pointermove", (e) => { if (dragging) set(toValue(e)); });
    const stop = () => { dragging = false; };
    svg.addEventListener("pointerup", stop);
    svg.addEventListener("pointercancel", stop);
    svg.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 25 : 5;
      let v = get();
      if (e.key === "ArrowRight" || e.key === "ArrowUp") v += step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v -= step;
      else if (e.key === "PageUp") v += 50;
      else if (e.key === "PageDown") v -= 50;
      else if (e.key === "Home") v = lo * 100;
      else if (e.key === "End") v = hi * 100;
      else return;
      e.preventDefault();
      set(Math.min(hi * 100, Math.max(lo * 100, v)));
    });
  };
  fig.updateAria = () => {
    if (!fig.svg) return;
    fig.svg.setAttribute("aria-valuenow", String(get() / 100));
    fig.svg.setAttribute("aria-valuetext", label());
  };
}

const codeOfHundredths = (xh) => Math.floor(xh / 25) | (xh % 25 ? 1 : 0);

// ---------------------------------------------------------------------------
// 1. Four zones
// ---------------------------------------------------------------------------

function initZones() {
  const box = document.getElementById("usw-zones-svg");
  if (!box) return;
  const readout = document.getElementById("usw-zones-readout");
  const chips = document.getElementById("usw-zones-chips");
  const pinParam = Number(params.get("pin"));
  const state = { xh: Number.isFinite(pinParam) && pinParam >= 5 && pinParam <= 9 && params.has("pin") ? Math.round(pinParam * 100) : 625, nudge: 0 };
  const LO = 5, HI = 9;

  const fig = svgFigure(box, 100, (svg, width) => {
    const y = 58;
    const u = codeOfHundredths(state.xh), un = u + state.nudge;
    const X = zoneRuler(svg, width, y, LO, HI);
    if (state.nudge) zoneHighlight(svg, X, u, y, "usw-zone-orig");
    zoneHighlight(svg, X, un, y, "usw-zone-hl");
    const n = Math.min(HI - 1, Math.floor(state.xh / 100));
    const names = [`${n}.0`, `${n}.0+`, `${n}.5`, `${n}.5+`];
    const roomy = X(n + 0.25) - X(n) >= 34;
    names.forEach((name, i) => {
      const on = 4 * n + i === un;
      if (!roomy && !on) return;
      const cls = on ? "usw-zone-name usw-zone-name-on" : "usw-zone-name";
      svg.append(el("text", { x: X(n + i / 4), y: 16, "text-anchor": "middle", class: cls }, name));
    });
    pinAt(svg, X(state.xh / 100), 34, y + 10);
  }, { "aria-label": "Zone ruler from 5 to 9" });

  const label = () => `x = ${state.xh / 100}, unrounded ${M.ustr(BigInt(codeOfHundredths(state.xh) + state.nudge))}`;
  attachPin(fig, { lo: LO, hi: HI, get: () => state.xh, set: (v) => { state.xh = v; state.nudge = 0; update(); }, label });

  function update() {
    fig.render();
    fig.updateAria();
    const xh = state.xh;
    const four = (xh * 4) / 100;
    const fl = Math.floor(xh / 25);
    const exact = xh % 25 === 0;
    const u = BigInt(codeOfHundredths(xh));
    const un = u + BigInt(state.nudge);
    const lines = [
      `x = ${xh / 100} · 4x = ${four}${exact ? " (exact)" : ""} · ⌊4x⌋ = ${fl}${exact ? "" : ", something left over"}`,
      `⟨x⟩ = ${u} = ${bitsHTML(u)} → <strong>${M.ustr(u)}</strong>`,
    ];
    if (state.nudge) lines.push(`nudge(${state.nudge > 0 ? "+1" : "−1"}): ${un} = ${bitsHTML(un)} → <strong>${M.ustr(un)}</strong>`);
    const v = state.nudge ? un : u;
    lines.push(`floor = ${M.floorU(v)} · ceil = ${M.ceilU(v)} · round ½-even = ${M.roundU(v)}${state.nudge ? ` <span class="usw-muted">(without the nudge: floor ${M.floorU(u)}, ceil ${M.ceilU(u)})</span>` : ""}`);
    readout.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
    for (const b of chips.querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.xh) === xh && !state.nudge));
    document.getElementById("usw-nudge-minus").disabled = state.nudge === -1 || codeOfHundredths(xh) + state.nudge <= 20;
    document.getElementById("usw-nudge-plus").disabled = state.nudge === 1 || codeOfHundredths(xh) + state.nudge >= 36;
    document.getElementById("usw-nudge-reset").disabled = state.nudge === 0;
  }

  for (const [text, xh] of [["6", 600], ["6.01", 601], ["6.25", 625], ["6.5", 650], ["6.75", 675], ["6.99", 699], ["7", 700]]) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = text; b.dataset.xh = xh;
    b.addEventListener("click", () => { state.xh = xh; state.nudge = 0; update(); });
    chips.append(b);
  }
  document.getElementById("usw-nudge-minus").addEventListener("click", () => { state.nudge = Math.max(-1, state.nudge - 1); update(); });
  document.getElementById("usw-nudge-plus").addEventListener("click", () => { state.nudge = Math.min(1, state.nudge + 1); update(); });
  document.getElementById("usw-nudge-reset").addEventListener("click", () => { state.nudge = 0; update(); });
  queueMicrotask(update);
}

// ---------------------------------------------------------------------------
// 2. Rounding rules: catchment strip + grid
// ---------------------------------------------------------------------------

function initRounding() {
  const box = document.getElementById("usw-round-svg");
  if (!box) return;
  const chips = document.getElementById("usw-rule-chips");
  const grid = document.getElementById("usw-grid");
  const state = { xh: 750, rule: M.ruleById(params.get("rule")) ? params.get("rule") : "even" };
  const LO = 5, HI = 9;

  const fig = svgFigure(box, 132, (svg, width) => {
    const y = 58;
    const X = zoneRuler(svg, width, y, LO, HI);
    const u = codeOfHundredths(state.xh);
    zoneHighlight(svg, X, u, y, "usw-zone-hl");
    const n = Math.min(HI - 1, Math.floor(state.xh / 100));
    const roomy = X(n + 0.25) - X(n) >= 34;
    ["n.0", "n.0+", "n.5", "n.5+"].forEach((name, i) => {
      if (!roomy && 4 * n + i !== u) return;
      svg.append(el("text", { x: X(n + i / 4), y: 16, "text-anchor": "middle", class: 4 * n + i === u ? "usw-zone-name usw-zone-name-on" : "usw-zone-name" }, name.replace("n", n)));
    });
    pinAt(svg, X(state.xh / 100), 34, y + 10);
    // catchment strip: which integer each zone rounds to
    const yS = 98, hS = 22;
    const groups = [];
    for (let c = 4 * LO; c <= 4 * HI; c++) {
      const t = Number(M.applyRule(state.rule, BigInt(c)));
      const last = groups.at(-1);
      if (last && last.t === t) last.to = c; else groups.push({ t, from: c, to: c });
    }
    const left = (c) => (c % 2 === 0 ? X(c / 4) - 5 : X((c - 1) / 4) + 5);
    const right = (c) => (c % 2 === 0 ? X(c / 4) + 5 : X((c + 1) / 4) - 5);
    for (const gr of groups) {
      const x1 = left(gr.from), x2 = right(gr.to);
      svg.append(el("rect", { x: x1, y: yS, width: Math.max(2, x2 - x1), height: hS, class: gr.t % 2 ? "usw-catch usw-catch-odd" : "usw-catch" }));
      const zones = gr.to - gr.from + 1;
      svg.append(el("text", { x: (x1 + x2) / 2, y: yS + 15, "text-anchor": "middle", class: "usw-catch-label" }, x2 - x1 > 34 ? `→ ${gr.t}` : String(gr.t)));
      if (x2 - x1 > 70) svg.append(el("text", { x: (x1 + x2) / 2, y: yS + hS + 11, "text-anchor": "middle", class: "usw-catch-count" }, `${zones} zone${zones > 1 ? "s" : ""}`));
    }
  }, { "aria-label": "Zone ruler with the catchment of the chosen rounding rule" });

  const label = () => `x = ${state.xh / 100}, unrounded ${M.ustr(BigInt(codeOfHundredths(state.xh)))}`;
  attachPin(fig, { lo: LO, hi: HI, get: () => state.xh, set: (v) => { state.xh = v; update(); }, label });

  function update() {
    fig.render();
    fig.updateAria();
    const n = Math.floor(state.xh / 100);
    const u = codeOfHundredths(state.xh);
    let html = `<caption class="lab-sr-only">Each rule applied to the four zones of ${n}</caption><thead><tr><th scope="col">rule</th>`;
    for (let i = 0; i < 4; i++) {
      const c = 4 * n + i;
      html += `<th scope="col" class="${c === u ? "usw-col-sel" : ""}">${M.ustr(BigInt(c))}<span>code ${c}</span></th>`;
    }
    html += "</tr></thead><tbody>";
    for (const r of M.RULES) {
      html += `<tr class="${r.id === state.rule ? "usw-row-sel" : ""}"><th scope="row"><button type="button" data-rule="${r.id}">${r.label}</button></th>`;
      for (let i = 0; i < 4; i++) {
        const c = BigInt(4 * n + i);
        const add = r.add(c);
        html += `<td class="${4 * n + i === u ? "usw-col-sel" : ""}">${c}+${add}=${c + add}<span>→ <b>${(c + add) >> 2n}</b></span></td>`;
      }
      html += "</tr>";
    }
    grid.innerHTML = `${html}</tbody>`;
    for (const b of chips.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.rule === state.rule));
  }
  for (const r of M.RULES) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = r.label; b.dataset.rule = r.id;
    b.addEventListener("click", () => { state.rule = r.id; update(); });
    chips.append(b);
  }
  grid.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-rule]");
    if (b) { state.rule = b.dataset.rule; update(); }
  });
  queueMicrotask(update);
}

// ---------------------------------------------------------------------------
// 3. Round now or later
// ---------------------------------------------------------------------------

function initLanes() {
  const box = document.getElementById("usw-lanes-box");
  if (!box) return;
  const r = M.roundNowOrLater();
  const q = r.u / 6n, rem = r.u % 6n;
  box.innerHTML = `
    <div class="usw-lane usw-lane-bad">
      <p class="usw-lane-title">Round first</p>
      <ol>
        <li>x = 15.4</li>
        <li>round → <b>${r.early}</b> <span class="usw-muted">(the .4 is gone)</span></li>
        <li>÷ 6 = ${tag(r.earlyQ)} <span class="usw-muted">a tie, it seems</span></li>
        <li>round ½-even → <strong>${r.earlyResult}</strong> ✗</li>
      </ol>
    </div>
    <div class="usw-lane usw-lane-good">
      <p class="usw-lane-title">Stay unrounded</p>
      <ol>
        <li>⟨15.4⟩ = ${r.u} = ${bitsHTML(r.u)} = <b>${M.ustr(r.u)}</b></li>
        <li>div(6): ${r.u} / 6 = ${q} rest ${rem}, so ${q} | ${r.u & 1n} | ${rem !== 0n ? 1 : 0} = ${r.q}</li>
        <li>${r.q} = ${bitsHTML(r.q)} = <b>${M.ustr(r.q)}</b> <span class="usw-muted">a bit more than 2½</span></li>
        <li>round ½-even → <strong>${r.result}</strong> ✓ <span class="usw-muted">(15.4 ÷ 6 = 2.566…)</span></li>
      </ol>
    </div>`;
  const items = [...box.querySelectorAll("li")];
  const play = () => {
    if (reduceMotion) { items.forEach((li) => li.classList.add("usw-shown")); return; }
    items.forEach((li) => li.classList.remove("usw-shown"));
    const order = [0, 4, 1, 5, 2, 6, 3, 7];
    order.forEach((idx, i) => setTimeout(() => items[idx].classList.add("usw-shown"), 150 + i * 450));
  };
  box.classList.add("usw-lanes-ready");
  items.forEach((li) => li.classList.add("usw-shown"));
  document.getElementById("usw-lanes-play").addEventListener("click", play);
}

// ---------------------------------------------------------------------------
// 4. Ties
// ---------------------------------------------------------------------------

function initTies() {
  const box = document.getElementById("usw-ties-svg");
  if (!box) return;
  const chips = document.getElementById("usw-tie-chips");
  const readout = document.getElementById("usw-ties-readout");
  const VALUES = [1.125, 0.125, 0.375, 1.005, 2.675];
  const state = { x: 1.125 };

  const fig = svgFigure(box, 96, (svg, width) => {
    const t = M.twoPlaces(state.x);
    const n = Number(t.u >> 2n);
    const lo = n - 1, hi = n + 2;
    const y = 50;
    const X = zoneRuler(svg, width, y, lo, hi, { label: (k) => M.fmt2(BigInt(k)) });
    zoneHighlight(svg, X, Number(t.u), y, "usw-zone-hl");
    const { M: mm, E } = M.decode53(state.x);
    const s = M.scaled(mm, E, 2);
    pinAt(svg, X(M.toNum(s.num, s.den)), 22, y + 10);
    svg.append(el("text", { x: X(n + 0.5), y: 90, "text-anchor": "middle", class: "usw-zone-name usw-zone-name-on" }, `x · 100 → ${tag(t.u)}`));
  }, { "aria-hidden": "true" });

  function update() {
    fig.render();
    const t = M.twoPlaces(state.x);
    const { half, sticky } = M.parts(t.u);
    const tie = half === 1 && sticky === 0;
    const exact = t.exact.length > 34 ? `${t.exact.slice(0, 30)}…` : t.exact;
    readout.innerHTML = [
      `stored double: ${exact}`,
      `⟨x · 100⟩ = ${t.u} = ${bitsHTML(t.u)} → <strong>${M.ustr(t.u)}</strong> · ${tie ? "½ bit on, sticky off: <b>a true tie</b>" : sticky ? "sticky on: <b>not a tie</b>" : "exact, no tie"}`,
      `round ½-even (C printf, Go): <strong>${M.fmt2(t.even)}</strong> · round ½-up: <strong>${M.fmt2(t.up)}</strong>`,
      `your browser: (${state.x}).toFixed(2) = "${esc(state.x.toFixed(2))}"`,
    ].map((l) => `<div>${l}</div>`).join("");
    for (const b of chips.querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.x) === state.x));
  }
  for (const v of VALUES) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = String(v); b.dataset.x = String(v);
    b.addEventListener("click", () => { state.x = v; update(); });
    chips.append(b);
  }
  queueMicrotask(update);
}

// ---------------------------------------------------------------------------
// 5. Bridge: the same labels, but for (0.1+0.2)·10^17
// ---------------------------------------------------------------------------

function initBridge() {
  const box = document.getElementById("usw-bridge-svg");
  if (!box) return;
  const btn = document.getElementById("usw-bridge-toggle");
  const caption = document.getElementById("usw-bridge-caption");
  const f = 0.1 + 0.2;
  const { M: mm, E } = M.decode53(f);
  const s = M.scaled(mm, E, 17);
  const base = 30000000000000000n;
  const u = M.uscaleExact(mm, E, 17);
  const frac = M.toNum(s.num - base * s.den, s.den); // 4.44…
  const exact = M.exactDecimalString(s.num, s.den);
  let real = params.get("bridge") === "1";

  const fig = svgFigure(box, 96, (svg, width) => {
    const y = 50;
    const X = zoneRuler(svg, width, y, 3, 7, { label: () => "", labelY: y + 26 });
    zoneHighlight(svg, X, 17, y, "usw-zone-hl");
    for (let n = 3; n <= 7; n++) {
      svg.append(el("text", { x: X(n), y: y + 26, "text-anchor": "middle", class: "usw-int-label usw-lab-a" }, String(n)));
      const big = (base + BigInt(n)).toString();
      const text = n === 4 ? big : `…${big.slice(-3)}`;
      svg.append(el("text", { x: X(n), y: y + 26, "text-anchor": "middle", class: `usw-int-label usw-lab-b${n === 4 ? " usw-lab-big" : ""}` }, text));
    }
    svg.append(el("text", { x: X(4.25), y: 16, "text-anchor": "middle", class: "usw-zone-name usw-zone-name-on usw-lab-a" }, "⟨4.0+⟩"));
    svg.append(el("text", { x: X(4.25), y: 16, "text-anchor": "middle", class: "usw-zone-name usw-zone-name-on usw-lab-b" }, `⟨${M.ustr(u)}⟩`));
    pinAt(svg, X(frac), 30, y + 10); // tick n stands for 30000000000000000 + n
    svg.classList.toggle("usw-real", real);
  }, { "aria-hidden": "true" });

  function update() {
    fig.svg?.classList.toggle("usw-real", real);
    btn.setAttribute("aria-pressed", String(real));
    btn.textContent = real ? "Back to small numbers" : "Show the real numbers";
    caption.innerHTML = real
      ? `x = (0.1+0.2) · 10${sup(17)} = ${exact}. uscale(${mm}, ${minus(E)}, 17) returns ${u} = <strong>${M.ustr(u)}</strong>: the same zone, the same two extra bits, just a longer integer part.`
      : `x = ${frac.toFixed(5)}… lies on the open segment after 4, so ⟨x⟩ = 17 = ${bitsHTML(17n)} → <strong>4.0+</strong>.`;
  }
  btn.addEventListener("click", () => { real = !real; update(); });
  queueMicrotask(update);
}

// ---------------------------------------------------------------------------
// 6. The decimal window
// ---------------------------------------------------------------------------

const STEP_TITLES = [
  "The double and its footprint",
  "Zoom: choose p",
  "Scale the two edges",
  "Nudge, then ceil and floor",
  "Decide",
  "Output",
];

/** Common prefix (to dim) of the digit strings of several BigInts. */
function prefixOf(values) {
  const strs = values.filter((v) => v !== undefined && v !== null && v >= 0n).map((v) => v.toString());
  if (!strs.length) return "";
  if (strs.some((s) => s.length !== strs[0].length)) return "";
  let pre = strs[0];
  for (const s of strs.slice(1)) pre = M.commonPrefix(pre, s.slice(0, pre.length));
  const minLen = Math.min(...strs.map((s) => s.length));
  return pre.slice(0, Math.max(0, Math.min(pre.length, minLen - 2)));
}
function dimmer(prefix) {
  return (v) => {
    const s = v.toString();
    if (prefix && s.startsWith(prefix) && s.length > prefix.length) return `<span class="usw-dim">${prefix}</span>${s.slice(prefix.length)}`;
    return s;
  };
}
function utagDim(u, dim) {
  const { int, half, sticky } = M.parts(u);
  return `⟨${dim(int)}.${half ? 5 : 0}${sticky ? "+" : ""}⟩`;
}

function shortExact(f) {
  const s = M.exactDecimalOfDouble(f);
  if (s.length <= 60) return s;
  // Long expansions: 30 significant digits in scientific form.
  const digits = s.replace(".", "").replace(/^0+/, "");
  const dot = s.indexOf(".");
  const intLen = dot < 0 ? s.length : dot;
  const exp = s.startsWith("0") ? -(s.slice(dot + 1).search(/[1-9]/) + 1) : intLen - 1;
  return `${digits[0]}.${digits.slice(1, 30)}…e${exp}`;
}

/** Draw the two rulers. o = { step, quiz, revealed } */
function drawWindow(svg, width, a, o) {
  const pad = 16;
  const tL = a.skew ? -0.9 : -1.45, tR = 1.45;
  const X = (t) => pad + ((t - tL) / (tR - tL)) * (width - 2 * pad);
  const yB = 52, yD = 176;
  const lowNb = a.skew ? -0.5 : -1, midLo = a.skew ? -0.25 : -0.5, midHi = 0.5;
  const incl = a.oddUsed === 0;
  const step = o.step;
  const showPick = step >= 5 && a.p === a.p0;

  // window column (shared by both rulers)
  svg.append(el("rect", { x: X(midLo), y: yB - 12, width: X(midHi) - X(midLo), height: (step >= 2 ? yD + 8 : yB + 12) - (yB - 12), class: "usw-col" }));
  svg.append(el("rect", { x: X(midLo), y: yB - 9, width: X(midHi) - X(midLo), height: 18, class: "usw-band" }));
  svg.append(el("line", { x1: X(tL), x2: X(tR), y1: yB, y2: yB, class: "usw-base" }));
  svg.append(el("text", { x: X(tR), y: yB + 24, "text-anchor": "end", class: "usw-ruler-name" }, "binary"));

  // neighbours and f
  const nbDown = M.nextDown(a.f), nbUp = M.nextUp(a.f);
  svg.append(el("circle", { cx: X(lowNb), cy: yB, r: 4.5, class: "usw-nb" }));
  svg.append(el("text", { x: X(lowNb), y: yB - 16, "text-anchor": "middle", class: "usw-small" }, nbDown === 0 ? "0" : "f⁻"));
  svg.append(el("circle", { cx: X(1), cy: yB, r: 4.5, class: "usw-nb" }));
  svg.append(el("text", { x: X(1), y: yB - 16, "text-anchor": "middle", class: "usw-small" }, Number.isFinite(nbUp) ? "f⁺" : "(∞)"));
  if (a.skew) {
    svg.append(el("text", { x: X(lowNb), y: yB + 24, "text-anchor": "middle", class: "usw-small usw-warn" }, "½ gap below"));
  }
  // midpoints
  for (const [t, name] of [[midLo, "min"], [midHi, "max"]]) {
    svg.append(el("line", { x1: X(t), x2: X(t), y1: yB - 22, y2: yB + 10, class: "usw-mid" }));
    svg.append(el("text", { x: X(t), y: yB - 26, "text-anchor": "middle", class: "usw-small usw-mid-label" }, name));
    svg.append(el("circle", { cx: X(t), cy: yB, r: 5, class: incl ? "usw-end usw-end-in" : "usw-end usw-end-out" }));
  }
  svg.append(el("circle", { cx: X(0), cy: yB, r: 6.5, class: "usw-f" }));
  svg.append(el("text", { x: X(0), y: yB - 16, "text-anchor": "middle", class: "usw-f-label" }, "f"));
  if (step < 2) {
    svg.append(el("text", { x: (X(tL) + X(tR)) / 2, y: yD, "text-anchor": "middle", class: "usw-small" }, "(the decimal ruler appears in step 2)"));
    return;
  }

  // f's position projected down
  svg.append(el("line", { x1: X(0), x2: X(0), y1: yB + 8, y2: yD - 2, class: "usw-fline" }));

  // decimal ruler
  svg.append(el("line", { x1: X(tL), x2: X(tR), y1: yD, y2: yD, class: "usw-base" }));
  svg.append(el("text", { x: X(tR), y: yD - 10, "text-anchor": "end", class: "usw-ruler-name" }, `decimal · 10${superDigits(-a.p)}`));
  const { kLo, kHi } = M.tickRange(a, Math.round(tL * 100), Math.round(tR * 100), 100);
  const lo = kLo < 0n ? 0n : kLo;
  const total = kHi - lo + 1n;
  const valid = step >= 4;
  if (valid && a.count > 0n) {
    const x1 = X(M.axisPos(a, a.dmin)), x2 = X(M.axisPos(a, a.dmax));
    svg.append(el("line", { x1, x2: Math.max(x2, x1 + 0.1), y1: yD, y2: yD, class: "usw-valid-bar" }));
  }
  let L = 2;
  if (total <= 0n) {
    svg.append(el("text", { x: (X(tL) + X(tR)) / 2, y: yD + 20, "text-anchor": "middle", class: "usw-small usw-warn" }, "no integer of this ruler anywhere in view"));
  } else {
    let stride = 1n;
    while (total / stride > 150n) stride *= 10n;
    if (stride > 1n) {
      svg.append(el("rect", { x: X(tL), y: yD - 4, width: X(tR) - X(tL), height: 8, class: "usw-dense" }));
    }
    L = Math.max(2, (kHi - lo).toString().length);
    const first = ((lo + stride - 1n) / stride) * stride;
    const px0 = X(M.axisPos(a, first)), px1 = X(M.axisPos(a, first + stride));
    const spacing = Math.abs(px1 - px0) || 1000;
    const labW = (L + 1) * 6.4 + 6;
    const every = [1n, 2n, 5n, 10n, 20n, 50n, 100n].find((e) => spacing * Number(e) >= labW) ?? 100n;
    for (let k = first; k <= kHi; k += stride) {
      const x = X(M.axisPos(a, k));
      const isValid = valid && k >= a.dmin && k <= a.dmax;
      const zero = k % 10n === 0n;
      let cls = "usw-tick";
      if (zero) cls += " usw-tick-ten";
      if (isValid) cls += zero ? " usw-tick-zero" : " usw-tick-valid";
      const hl = zero ? 9 : 5;
      svg.append(el("line", { x1: x, x2: x, y1: yD - hl, y2: yD + hl, class: cls }));
      if ((k / stride) % every === 0n) {
        svg.append(el("text", { x, y: yD + 22, "text-anchor": "middle", class: isValid ? "usw-tick-label usw-tick-label-valid" : "usw-tick-label" }, tail(k, L)));
      }
      if (o.quiz) svg.append(el("rect", { x: x - Math.max(6, spacing / 2), y: yD - 14, width: Math.max(12, spacing), height: 40, class: "usw-hit", "data-k": k.toString() }));
    }
    if (stride > 1n) svg.append(el("text", { x: X(tL), y: yD + 40, class: "usw-small" }, `only every ${stride}th integer drawn`));
  }

  if (step >= 3) {
    for (const [t, u, side] of [[midLo, a.umin, "end"], [midHi, a.umax, "start"]]) {
      const x = X(t);
      svg.append(el("line", { x1: x, x2: x, y1: yB + 12, y2: yD - 12, class: "usw-arrow", "marker-end": "url(#usw-arrowhead)" }));
      const tx = side === "end" ? x - 6 : x + 6;
      if (side === "end") svg.append(el("text", { x: tx, y: 98, "text-anchor": side, class: "usw-small" }, "uscale"));
      svg.append(el("text", { x: tx, y: 116, "text-anchor": side, class: "usw-utag" }, tagTail(u, L)));
      svg.append(el("circle", { cx: x, cy: yD, r: 5, class: incl ? "usw-end usw-end-in" : "usw-end usw-end-out" }));
    }
  }
  if ((showPick && a.case === "round") || (o.quiz && o.revealed)) {
    const x = X(0);
    svg.append(el("line", { x1: x, x2: x, y1: yB + 12, y2: yD - 12, class: "usw-arrow usw-arrow-f", "marker-end": "url(#usw-arrowhead-f)" }));
    svg.append(el("text", { x, y: 146, "text-anchor": "middle", class: "usw-utag usw-utag-f" }, tagTail(a.um, L)));
  }
  if ((showPick || (o.quiz && o.revealed)) && a.pick !== undefined) {
    if (!a.roundedInside) {
      const xg = X(M.axisPos(a, a.rounded));
      svg.append(el("line", { x1: xg, x2: xg, y1: yD - 16, y2: yD + 16, class: "usw-ghost" }));
      const anchor = xg - 100 < 0 ? "start" : xg < X(0) ? "end" : "middle";
      svg.append(el("text", { x: anchor === "start" ? xg - 4 : xg, y: yD + 40, "text-anchor": anchor, class: "usw-small usw-ghost-label" }, "nearest, outside"));
    }
    const xp = X(M.axisPos(a, a.pick));
    svg.append(el("circle", { cx: xp, cy: yD, r: 6, class: "usw-pick" }));
    svg.append(el("text", { x: xp, y: yD + 40, "text-anchor": "middle", class: "usw-pick-label" }, tail(a.pick, L)));
  }
  if (o.quiz && o.chosen !== undefined && o.chosen !== null && o.chosen !== a.pick) {
    const xc = X(M.axisPos(a, o.chosen));
    svg.append(el("circle", { cx: xc, cy: yD, r: 6, class: "usw-chosen-wrong" }));
  }
  const defs = el("defs");
  for (const [id, cls] of [["usw-arrowhead", "usw-arrowhead"], ["usw-arrowhead-f", "usw-arrowhead usw-arrowhead-f"]]) {
    const mk = el("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    mk.append(el("path", { d: "M0,0 L10,5 L0,10 z", class: cls }));
    defs.append(mk);
  }
  svg.prepend(defs);
}

function superDigits(n) {
  const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return String(n).split("").map((c) => map[c]).join("");
}
function tail(k, L) {
  const s = k.toString();
  return s.length > L + 1 ? `…${s.slice(-L)}` : s;
}
function tagTail(u, L) {
  const { int, half, sticky } = M.parts(u);
  return `⟨${tail(int, L)}.${half ? 5 : 0}${sticky ? "+" : ""}⟩`;
}

function caseLine(a, dim) {
  if (a.case === "zero") {
    const t = M.trimZeros(a.dmax / 10n, 0);
    return `<b>A · ends in 0.</b> ${dim(a.pick)} is valid and ends in 0, and it is the only such integer. Short takes dmax/10 = ${dim(a.dmax / 10n)} (exponent ${minus(-(a.p - 1))})${t.x ? ` and trimZeros strips ${t.x} more zero${t.x > 1 ? "s" : ""}` : ""}: ${a.d} × 10${sup(a.x)}.`;
  }
  if (a.case === "single") {
    let s = `<b>B · only one.</b> dmin = dmax = ${dim(a.dmin)}: nothing to choose.`;
    if (!a.roundedInside) s += ` The integer nearest f, ${dim(a.rounded)} (red dashes), lies <em>outside</em> the window: it would read back as a different double.`;
    return s;
  }
  if (a.case === "round") {
    return `<b>C · several, none ends in 0.</b> So scale f too: uscale(m) = ${utagDim(a.um, dim)}, round half to even → ${dim(a.rounded)}.`;
  }
  return "<b>No integer fits</b> in the window.";
}

function initWindow() {
  const box = document.getElementById("usw-win-svg");
  if (!box) return;
  const input = document.getElementById("usw-input");
  const errorEl = document.getElementById("usw-error");
  const presets = document.getElementById("usw-presets");
  const pSlider = document.getElementById("usw-p");
  const pOut = document.getElementById("usw-p-out");
  const flip = document.getElementById("usw-flip");
  const flipLabel = document.getElementById("usw-flip-label");
  const stepLabel = document.getElementById("usw-step-label");
  const readout = document.getElementById("usw-win-readout");
  const back = document.getElementById("usw-back"), next = document.getElementById("usw-next"), all = document.getElementById("usw-all");

  const state = { text: "0.3", f: 0.3, dp: 0, step: 1, flip: false };
  const fromUrl = params.get("x");
  if (fromUrl) {
    const v = M.parseInput(fromUrl);
    if (v !== null && Number.isFinite(v) && v !== 0) { state.text = fromUrl; state.f = Math.abs(v); }
  }
  state.step = Math.min(6, Math.max(1, Number(params.get("step")) || 1));
  state.flip = params.get("flip") === "1";
  if (params.has("dp")) state.dp = Math.max(-2, Math.min(2, Number(params.get("dp")) || 0));
  if (params.has("p")) {
    const p0 = M.analyze(state.f).p0;
    state.dp = Math.max(-2, Math.min(2, (Number(params.get("p")) || 0) - p0));
  }
  input.value = state.text;

  let a = M.analyze(state.f, { p: M.analyze(state.f).p0 + state.dp, flip: state.flip });
  const fig = svgFigure(box, 228, (svg, width) => drawWindow(svg, width, a, { step: state.step }));

  function update(push = true) {
    const base = M.analyze(state.f);
    a = M.analyze(state.f, { p: base.p0 + state.dp, flip: state.flip });
    if (fig.svg) fig.render();
    pSlider.value = String(state.dp);
    pOut.textContent = `p = ${a.p}${state.dp === 0 ? " (Short's choice)" : ""}`;
    flip.checked = state.flip;
    flipLabel.textContent = a.odd ? "pretend the mantissa is even" : "pretend the mantissa is odd";
    stepLabel.textContent = `Step ${state.step} of 6: ${STEP_TITLES[state.step - 1]}`;
    back.disabled = state.step <= 1;
    next.disabled = state.step >= 6;
    for (const b of presets.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.x === state.text));
    readout.innerHTML = windowReadout(a, base, state).map((l) => `<div>${l}</div>`).join("");
    box.setAttribute("aria-label", `Binary ruler with the rounding interval of ${state.text}, and the decimal ruler at scale 10 to the ${-a.p}; step ${state.step}: ${STEP_TITLES[state.step - 1]}. Details follow in the text below the figure.`);
    if (push) setParams({ x: state.text === "0.3" ? null : state.text, dp: state.dp || null, step: state.step === 1 ? null : state.step, flip: state.flip ? "1" : null });
  }

  function setValue(text, f, opts = {}) {
    state.text = text; state.f = f;
    state.dp = opts.dp ?? 0;
    state.flip = false;
    if (opts.step) state.step = opts.step;
    input.value = text;
    errorEl.textContent = "";
    update();
  }

  for (const p of M.PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.x = p.input;
    b.innerHTML = `${esc(p.input)} <span class="usw-chip-note">${p.note}</span>`;
    b.addEventListener("click", () => setValue(p.input, Math.abs(M.parseInput(p.input))));
    presets.append(b);
  }
  document.getElementById("usw-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = M.parseInput(input.value);
    if (v === null || !Number.isFinite(v)) { errorEl.textContent = "Type a number, or an expression like 0.1+0.2, 2/3 or 2^89."; return; }
    if (v === 0) { errorEl.textContent = "Zero has no rounding interval to scale; try another number."; return; }
    setValue(input.value.trim(), Math.abs(v));
    if (v < 0) errorEl.textContent = "Showing |x|: the sign is printed separately.";
  });
  document.getElementById("usw-prev-double").addEventListener("click", () => {
    const f = M.nextDown(state.f);
    if (f > 0) setValue(String(f), f, { step: state.step });
  });
  document.getElementById("usw-next-double").addEventListener("click", () => {
    const f = M.nextUp(state.f);
    if (Number.isFinite(f)) setValue(String(f), f, { step: state.step });
  });
  pSlider.addEventListener("input", () => { state.dp = Number(pSlider.value); if (state.step < 2) state.step = 4; update(); });
  flip.addEventListener("change", () => { state.flip = flip.checked; update(); });
  back.addEventListener("click", () => { state.step = Math.max(1, state.step - 1); update(); });
  next.addEventListener("click", () => { state.step = Math.min(6, state.step + 1); update(); });
  all.addEventListener("click", () => { state.step = 6; update(); });

  for (const b of document.querySelectorAll(".usw-try")) {
    b.addEventListener("click", () => {
      const text = b.dataset.x;
      setValue(text, Math.abs(M.parseInput(text)), { dp: Number(b.dataset.dp || 0), step: Number(b.dataset.step || 6) });
      document.getElementById("usw-win").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }
  queueMicrotask(() => update(false));
}

function windowReadout(a, base, state) {
  const dim = dimmer(prefixOf([a.umin >> 2n, a.umax >> 2n, a.dmin, a.dmax, a.um >> 2n]));
  const lines = [];
  const parity = a.odd ? "odd" : "even";
  lines.push(`f = ${esc(state.text)} = ${a.M} × 2${sup(a.E)} = ${shortExact(a.f)}`);
  lines.push(`mantissa ${parity}${state.flip ? ` <b>(pretending ${a.odd ? "even" : "odd"})</b>` : ""} → midpoints ${a.oddUsed ? "excluded ○" : "included ●"}${a.skew ? " · power of two: the gap below is half as wide (skewed footprint)" : ""}`);
  if (state.step >= 2) {
    const ez = a.e + a.z;
    const formula = a.skew ? `−⌊log₁₀(¾ · 2${sup(ez)})⌋` : `−⌊log₁₀ 2${sup(ez)}⌋`;
    const ok = a.width >= 1 && a.width < 10;
    lines.push(`Short's p = ${formula} = ${a.p0}${state.dp ? ` · <b>you chose p = ${a.p}</b>` : ""} · window width = footprint · 10${sup(a.p)} = ${fmtWidth(a.width)} units ${ok ? "∈ [1, 10) ✓" : a.width < 1 ? "&lt; 1: may miss every integer" : "≥ 10: several may end in 0"}`);
  }
  if (state.step >= 3) {
    let fast = "";
    if (a.fast) fast = ` <span class="usw-muted">· fast 128-bit uscale: same codes ${a.fast.agrees ? "✓" : "✗"}</span>`;
    lines.push(`⟨min⟩ = uscale(min) = ${utagDim(a.umin, dim)} · ⟨max⟩ = uscale(max) = ${utagDim(a.umax, dim)}${fast}`);
  }
  if (state.step >= 4) {
    const n = a.oddUsed ? " + 1" : "", nm = a.oddUsed ? " − 1" : "";
    lines.push(`dmin = ceil(⟨min⟩${n}) = ${dim(a.dmin)} · dmax = floor(⟨max⟩${nm}) = ${dim(a.dmax)}`);
    lines.push(a.count > 0n
      ? `<strong>${a.count}</strong> valid integer${a.count > 1n ? "s" : ""}, <strong>${a.zeroCount}</strong> ending in 0`
      : "<strong>0</strong> valid integers: the window falls between two ticks");
  }
  if (state.step >= 5) {
    if (state.dp !== 0) {
      let why;
      if (a.count === 0n) why = "A window narrower than one unit can miss every integer, as it does here.";
      else if (a.zeroCount > 1n) why = `Several valid integers end in 0, so “the one ending in 0” no longer picks a unique answer; finer rulers only add longer decimals.`;
      else if (state.dp < 0) why = "One fits here, but a window narrower than one unit can miss every integer, so Short can't rely on it.";
      else why = "At this zoom the window is 10 or more units wide, so it can hold several integers ending in 0.";
      lines.push(`<span class="usw-banner usw-banner-off">Short never uses p = ${a.p}; it uses p = ${a.p0}. ${why}</span>`);
    } else {
      lines.push(`<span class="usw-banner usw-banner-${a.case}">${caseLine(a, dim)}</span>`);
    }
  }
  if (state.step >= 6 && state.dp === 0 && a.text) {
    const rt = a.roundTrips ? "✓ reads back as f" : "✗ does not read back as f";
    lines.push(`Short returns d = <strong>${a.d}</strong>, exponent <strong>${minus(a.x)}</strong> → "${a.text}" · Number("${a.text}") === f ${rt}`);
    if (state.flip) {
      lines.push(`With the true parity Short prints "${base.text}". ${a.text !== base.text ? "The pretend answer reads back too, but it is not the shortest correct one for this double." : "Here the parity makes no difference."}`);
    } else {
      lines.push(`JavaScript prints ${esc(a.jsString)}${sameAsJs(a) ? " · same digits ✓" : ""}`);
    }
  }
  return lines;
}

function sameAsJs(a) {
  // compare digits and exponent with Number#toString
  const m = a.jsString.match(/^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/);
  if (!m) return false;
  let digits = (m[1] + (m[2] || "")).replace(/^0+/, "");
  let exp = Number(m[3] || 0) - (m[2] || "").length;
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); exp++; }
  const t = M.trimZeros(a.d, a.x);
  return BigInt(digits) === t.d && exp === t.x;
}

const fmtWidth = (w) => (w >= 100 ? w.toFixed(0) : w >= 10 ? w.toFixed(1) : w >= 0.01 ? w.toFixed(3) : w.toPrecision(3));

// ---------------------------------------------------------------------------
// 7. Beat the printer
// ---------------------------------------------------------------------------

function initQuiz() {
  const box = document.getElementById("usw-quiz-svg");
  if (!box) return;
  const levels = document.getElementById("usw-levels");
  const scoreEl = document.getElementById("usw-score");
  const question = document.getElementById("usw-quiz-q");
  const choices = document.getElementById("usw-choices");
  const feedback = document.getElementById("usw-feedback");
  const nextBtn = document.getElementById("usw-quiz-next");
  const results = new Array(M.QUIZ.length).fill(null); // { chosen, correct }
  let level = Math.min(M.QUIZ.length, Math.max(1, Number(params.get("level")) || 1)) - 1;
  let a = M.analyze(Math.abs(M.parseInput(M.QUIZ[level].input)));
  if (params.has("answer")) {
    try { results[level] = { chosen: BigInt(params.get("answer")), correct: BigInt(params.get("answer")) === a.pick }; } catch { /* ignore */ }
  }

  const fig = svgFigure(box, 228, (svg, width) => {
    const r = results[level];
    drawWindow(svg, width, a, { step: r ? 5 : 3, quiz: true, revealed: !!r, chosen: r?.chosen });
  });
  box.addEventListener("click", (e) => {
    const hit = e.target.closest?.("[data-k]");
    if (hit && !results[level]) choose(BigInt(hit.getAttribute("data-k")));
  });

  function choose(k) {
    const correct = k === a.pick;
    results[level] = { chosen: k, correct };
    render();
    feedback.focus?.();
  }

  function explain(r) {
    const dim = dimmer(prefixOf([a.dmin, a.dmax, a.umin >> 2n, a.umax >> 2n]));
    const lines = [];
    lines.push(r.correct
      ? `<strong>✓ Right.</strong> Short prints ${a.text} (JavaScript: ${esc(a.jsString)}).`
      : `<strong>✗ Not quite.</strong> You picked ${dim(r.chosen)}; Short picks ${dim(a.pick)} and prints ${a.text} (JavaScript: ${esc(a.jsString)}).`);
    lines.push(`Valid integers: ${dim(a.dmin)} … ${dim(a.dmax)} (${a.oddUsed ? "mantissa odd: edges nudged inward" : "mantissa even: edges included"}).`);
    const code = {
      zero: "if d := dmax / 10; d*10 >= dmin { return trimZeros(d, -(p - 1)) }",
      single: "if d = dmin; d < dmax { … }   // not taken: dmin == dmax\nreturn d, -p",
      round: "d = uscale(m, pre).round()   // round half to even",
    }[a.case];
    lines.push(`${caseLine(a, dim)}<pre class="usw-code">${esc(code)}</pre>`);
    if (!r.correct && r.chosen === a.rounded && !a.roundedInside) lines.push("Your pick is the nearest integer to f, but it lies outside the window: it would read back as the double below.");
    else if (!r.correct && r.chosen >= a.dmin && r.chosen <= a.dmax) lines.push(a.case === "zero" ? "Your pick reads back as f too, but the valid integer ending in 0 is shorter." : "Your pick reads back as f too, but it is not the valid integer nearest f.");
    else if (!r.correct && r.chosen < a.dmin) lines.push("Your pick is left of the window, so it would read back as a smaller double.");
    if (!r.correct && r.chosen > a.dmax) lines.push(a.oddUsed ? "Your pick is right of the window (or on an excluded edge)." : "Your pick is right of the window, so it would read back as a larger double.");
    return lines;
  }

  function render() {
    const lv = M.QUIZ[level];
    a = M.analyze(Math.abs(M.parseInput(lv.input)));
    const r = results[level];
    if (fig.svg) fig.render();
    const score = results.filter((x) => x?.correct).length, done = results.filter(Boolean).length;
    scoreEl.textContent = `score ${score} / ${done}${done === M.QUIZ.length ? " · all levels played" : ""}`;
    for (const b of levels.querySelectorAll("button")) {
      const i = Number(b.dataset.level);
      b.setAttribute("aria-pressed", String(i === level));
      const res = results[i];
      b.textContent = `${i + 1}${res ? (res.correct ? " ✓" : " ✗") : ""}`;
      b.setAttribute("aria-label", `Level ${i + 1}: ${M.QUIZ[i].input}${res ? (res.correct ? ", solved" : ", missed") : ""}`);
    }
    question.innerHTML = `<b>Level ${level + 1}: ${esc(lv.input)}</b> at p = ${a.p}. Mantissa ${a.odd ? "odd, edges excluded ○" : "even, edges included ●"}. ${esc(lv.hint)}`;
    const dim = dimmer(prefixOf([a.dmin, a.dmax]));
    choices.innerHTML = "";
    for (const k of M.quizChoices(a)) {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = dim(k);
      b.setAttribute("aria-label", k.toString());
      b.disabled = !!r;
      if (r) {
        if (k === a.pick) b.classList.add("usw-choice-right");
        else if (k === r.chosen) b.classList.add("usw-choice-wrong");
      }
      b.addEventListener("click", () => choose(k));
      choices.append(b);
    }
    feedback.innerHTML = r ? explain(r).map((l) => `<div>${l}</div>`).join("") : "<div>Tap a tick in the figure or one of the integers above.</div>";
    nextBtn.hidden = !r;
    nextBtn.textContent = level + 1 < M.QUIZ.length ? "Next level →" : "Play again";
  }

  M.QUIZ.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.level = String(i);
    b.addEventListener("click", () => { level = i; render(); });
    levels.append(b);
  });
  nextBtn.addEventListener("click", () => {
    if (level + 1 < M.QUIZ.length) level++;
    else { results.fill(null); level = 0; }
    render();
  });
  feedback.setAttribute("tabindex", "-1");
  queueMicrotask(render);
}

initZones();
initRounding();
initLanes();
initTies();
initBridge();
initWindow();
initQuiz();
