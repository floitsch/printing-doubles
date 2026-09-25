// Pocket Grisu: DOM and interaction. All numbers come from grisu-pocket-model.js.
import * as M from "./grisu-pocket-model.js";

const NS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// Small DOM helpers

function svg(width, height, label) {
  const root = document.createElementNS(NS, "svg");
  root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", label);
  return root;
}
function s(parent, tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  parent.appendChild(node);
  return node;
}
function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function sup(n) {
  return `<sup>${String(n).replace("-", "−")}</sup>`;
}
function minus(n) {
  return String(n).replace(/^-/, "−");
}
// Group long integers in threes with narrow no-break spaces.
function g(n) {
  const str = String(n);
  const neg = str.startsWith("-");
  const body = neg ? str.slice(1) : str;
  if (body.length <= 6) return minus(str);
  return (neg ? "−" : "") + body.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function setParam(key, value) {
  if (value === null || value === undefined) params.delete(key); else params.set(key, value);
  const q = params.toString();
  history.replaceState(null, "", `${location.pathname}${q ? "?" + q : ""}${location.hash}`);
}
function chips(container, items, onPick) {
  container.textContent = "";
  for (const item of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = item.label;
    b.dataset.value = item.value;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => onPick(item));
    container.appendChild(b);
  }
}
function pressChip(container, value) {
  for (const b of container.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === String(value)));
}
// In a horizontally scrolling box (phones), bring x (in viewBox units of 1000) into view.
function centerScroll(box, x) {
  if (box.scrollWidth <= box.clientWidth + 1) return;
  box.scrollLeft = Math.max(0, (x / 1000) * box.scrollWidth - box.clientWidth / 2);
}
function svgPoint(root, event) {
  const pt = root.createSVGPoint();
  pt.x = event.clientX; pt.y = event.clientY;
  return pt.matrixTransform(root.getScreenCTM().inverse());
}

// Parse "0.3", "1e23", "1/3", "0.1+0.2".
function parseNumber(text) {
  const t = String(text).trim().replace(/\s+/g, "").replace(/−/g, "-");
  if (t === "") return NaN;
  const direct = Number(t);
  if (!Number.isNaN(direct)) return direct;
  let m = /^([^/]+)\/([^/]+)$/.exec(t);
  if (m) return Number(m[1]) / Number(m[2]);
  m = /^(.*\d\.?)\+(\d.*|\.\d.*)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]);
  return NaN;
}
function checkDouble(v) {
  if (!Number.isFinite(v)) return "Please enter a finite number.";
  if (v === 0) return "Zero is handled before Grisu runs; please enter a nonzero number.";
  return null;
}

// ---------------------------------------------------------------------------
// Shared drawings

const CELL = 14.5;
const REG_X0 = 36;

// A 64-bit register with the binary point after bit -t (t in DiyFp terms).
function drawRegister(container, f, t, label) {
  const W = 1000, H = 80;
  const root = svg(W, H, label);
  const intBits = 64 + t; // cells left of the point
  const fracBits = -t;
  const pointInside = t <= 0 && t >= -64;
  for (let i = 0; i < 64; i++) {
    const bit = (f >> BigInt(63 - i)) & 1n;
    const isInt = t >= 0 ? true : t <= -64 ? false : i < intBits;
    let cls = `grisu-pocket-cell grisu-pocket-cell-${isInt ? "int" : "frac"}${bit}`;
    if (pointInside && isInt && intBits > 32 && i < intBits - 32) cls += " grisu-pocket-cell-over";
    if (pointInside && !isInt && fracBits > 60 && i - intBits < fracBits - 60) cls += " grisu-pocket-cell-over";
    s(root, "rect", { x: REG_X0 + i * CELL, y: 24, width: CELL, height: 22, class: cls });
  }
  s(root, "text", { x: 0, y: 40, class: "grisu-pocket-label-muted", text: "bit" });
  s(root, "text", { x: REG_X0, y: 16, class: "grisu-pocket-label-muted", text: "63" });
  s(root, "text", { x: REG_X0 + 63 * CELL, y: 16, class: "grisu-pocket-label-muted", text: "0" });
  if (pointInside) {
    const px = REG_X0 + intBits * CELL;
    s(root, "line", { x1: px, y1: 16, x2: px, y2: 54, class: "grisu-pocket-pointline" });
    s(root, "path", { d: `M${px - 6},10 L${px + 6},10 L${px},18 Z`, class: "grisu-pocket-point" });
    const intVal = f >> BigInt(-t);
    const intText = intBits > 0 ? `integral part: ${intBits} bit${intBits === 1 ? "" : "s"} = ${intVal}` : "no integral bits";
    const fracText = `fraction: ${fracBits} bits`;
    s(root, "text", { x: REG_X0, y: 70, class: "grisu-pocket-label-blue", text: intText });
    s(root, "text", { x: REG_X0 + 64 * CELL, y: 70, "text-anchor": "end", class: "grisu-pocket-label", text: fracText });
    s(root, "text", { x: px + 12, y: 15, class: "grisu-pocket-label-red", text: "binary point" });
  } else if (t > 0) {
    s(root, "text", { x: REG_X0 + 64 * CELL, y: 70, "text-anchor": "end", class: "grisu-pocket-label-red", text: `binary point ${t} bits to the right of the register →` });
  } else {
    s(root, "text", { x: REG_X0, y: 70, class: "grisu-pocket-label-red", text: `← binary point ${-t - 64} bits to the left of the register` });
  }
  container.replaceChildren(root);
  centerScroll(container, pointInside ? REG_X0 + intBits * CELL : t > 0 ? 1000 : 0);
}

// The t-axis with the window and a few neighbouring teeth.
function drawTAxis(root, y0, teeth, sel, opts = {}) {
  const lo = -200, hi = 60;
  const X = (t) => 40 + ((t - lo) / (hi - lo)) * 920;
  const axisY = y0 + 58;
  s(root, "rect", { x: X(-60), y: y0 + 26, width: X(-32) - X(-60), height: 32, class: "grisu-pocket-window" });
  s(root, "text", { x: (X(-60) + X(-32)) / 2, y: y0 + 96, "text-anchor": "middle", class: "grisu-pocket-label-green", text: "window" });
  s(root, "line", { x1: 40, y1: axisY, x2: 960, y2: axisY, class: "grisu-pocket-axis" });
  for (const t of [-200, -150, -100, -60, -32, 0, 50]) {
    s(root, "line", { x1: X(t), y1: axisY, x2: X(t), y2: axisY + 5, class: "grisu-pocket-axis" });
    s(root, "text", { x: X(t), y: axisY + 18, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: minus(t) });
  }
  s(root, "text", { x: 40, y: y0 + 20, class: "grisu-pocket-label-muted", text: "t < −60: ×10 overflows" });
  s(root, "text", { x: 960, y: y0 + 20, "text-anchor": "end", class: "grisu-pocket-label-muted", text: "t > −32: integral part > 32 bits" });
  s(root, "text", { x: 40, y: axisY + 38, class: "grisu-pocket-label-muted", text: "t = w.e + c.e + 64" });
  const range = opts.range ?? 3;
  for (let j = Math.max(0, sel - range); j <= Math.min(86, sel + range); j++) {
    const tooth = teeth[j];
    const isSel = j === sel;
    if (tooth.t < lo || tooth.t > hi) {
      if (isSel) {
        const left = tooth.t < lo;
        const x = left ? 48 : 952;
        s(root, "path", { d: left ? `M${x},${axisY - 14} l12,-7 v14 z` : `M${x},${axisY - 14} l-12,-7 v14 z`, class: "grisu-pocket-point" });
        s(root, "text", { x: left ? x + 16 : x - 16, y: axisY - 10, "text-anchor": left ? "start" : "end", class: "grisu-pocket-label-red", text: `10${supText(tooth.k)}: t = ${minus(tooth.t)}` });
      }
      continue;
    }
    const cls = isSel ? "grisu-pocket-tooth grisu-pocket-tooth-sel" : tooth.fits ? "grisu-pocket-tooth grisu-pocket-tooth-fit" : "grisu-pocket-tooth";
    s(root, "line", { x1: X(tooth.t), y1: axisY - (isSel ? 30 : 18), x2: X(tooth.t), y2: axisY, class: cls });
    if (isSel) s(root, "text", { x: X(tooth.t), y: axisY - 34, "text-anchor": "middle", class: "grisu-pocket-label-red", text: `10${supText(tooth.k)}` });
  }
}
function supText(n) {
  const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return String(n).split("").map((c) => map[c]).join("");
}

// ---------------------------------------------------------------------------
// Part 1: the comb, the multiply, the parking lot, Grisu1

const park = { v: 0.3, text: "0.3", tooth: null, lotStep: 0 };
const PARK_PRESETS = [
  { label: "0.3", value: "0.3" },
  { label: "1", value: "1" },
  { label: "123456.789", value: "123456.789" },
  { label: "1e23", value: "1e23" },
  { label: "5e-324", value: "5e-324" },
  { label: "max double", value: "1.7976931348623157e308" },
];

function parkModel() {
  const x = M.decodeDouble64(park.v);
  const w = M.normalize(x);
  const pick = M.chooseCachedPower64(w.e);
  const teeth = M.combTeeth(w.e);
  return { x, w, pick, teeth };
}

function renderComb(model) {
  const { teeth, pick } = model;
  const sel = park.tooth;
  const W = 1000, H = 250;
  const root = svg(W, H, `Comb of 87 cached powers; selected 10^${teeth[sel].k}, t = ${teeth[sel].t}`);
  root.setAttribute("tabindex", "0");
  const K = (k) => 40 + ((k + 348) / 688) * 920;
  const axisY = 80;
  s(root, "line", { x1: 36, y1: axisY, x2: 964, y2: axisY, class: "grisu-pocket-axis" });
  for (const k of [-300, -200, -100, 0, 100, 200, 300]) {
    s(root, "text", { x: K(k), y: axisY + 18, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: `10${supText(k)}` });
  }
  for (const tooth of teeth) {
    const isSel = tooth.index === sel;
    const cls = isSel ? "grisu-pocket-tooth grisu-pocket-tooth-sel" : tooth.fits ? "grisu-pocket-tooth grisu-pocket-tooth-fit" : "grisu-pocket-tooth";
    s(root, "line", { x1: K(tooth.k), y1: isSel ? 30 : tooth.fits ? 44 : 54, x2: K(tooth.k), y2: axisY, class: cls });
    if (tooth.fits && !isSel) s(root, "circle", { cx: K(tooth.k), cy: 40, r: 3.5, class: "grisu-pocket-light-ok" });
  }
  const selK = teeth[sel].k;
  const labelX = Math.min(Math.max(K(selK), 70), 930);
  s(root, "text", { x: labelX, y: 26, "text-anchor": "middle", class: "grisu-pocket-label-red", text: `10${supText(selK)} (index ${sel})` });
  drawTAxis(root, 118, teeth, sel);
  // Drag / click to choose a tooth.
  const pick_ = (event) => {
    const p = svgPoint(root, event);
    const k = ((p.x - 40) / 920) * 688 - 348;
    const index = Math.max(0, Math.min(86, Math.round((k + 348) / 8)));
    if (index !== park.tooth) setTooth(index);
  };
  let dragging = false;
  root.addEventListener("pointerdown", (e) => { if (svgPoint(root, e).y > 110) return; dragging = true; root.setPointerCapture(e.pointerId); pick_(e); });
  root.addEventListener("pointermove", (e) => { if (dragging) pick_(e); });
  root.addEventListener("pointerup", () => { dragging = false; });
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setTooth(Math.max(0, park.tooth - 1)); }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setTooth(Math.min(86, park.tooth + 1)); }
  });
  const hadFocus = $("comb").contains(document.activeElement);
  $("comb").replaceChildren(root);
  if (hadFocus) root.focus();
  centerScroll($("comb"), K(selK));
  void pick;
}

function renderParkStatus(model) {
  const tooth = model.teeth[park.tooth];
  const c = M.CACHE[park.tooth];
  const t = tooth.t;
  let verdict;
  if (t >= -60 && t <= -32) verdict = `<span class="grisu-pocket-ok">✓ parked:</span> ${64 + t} integral bits (at most 32) and ${-t} fraction bits (at most 60).`;
  else if (t > -32) verdict = `<span class="grisu-pocket-bad">✗ too far right:</span> the integral part would need ${64 + t} bits${t > 0 ? " (and more than the register holds)" : ""}, more than a <code>uint32_t</code> holds.`;
  else verdict = `<span class="grisu-pocket-bad">✗ too far left:</span> ${-t} fraction bits leave ${Math.max(0, 64 + t)} bits of headroom${-t > 64 ? " (the point is not even inside the register)" : ""}; fraction × 10 needs 4.`;
  const code = park.tooth === model.pick.index ? " This is the tooth the code chooses." : ` The code chooses 10${sup(model.pick.mk)} (index ${model.pick.index}).`;
  $("comb-status").innerHTML = `${esc(park.text)} is normalized to <var>w</var> = <span class="grisu-pocket-int">${g(model.w.f)}</span>·2${sup(model.w.e)}. ` +
    `Tooth 10${sup(c.k)} ≈ ${g(c.f)}·2${sup(c.e)}${c.exact ? " (exact)" : ""}. ` +
    `<var>t</var> = ${sumText(model.w.e, c.e, 64)} = <strong>${minus(t)}</strong>. ${verdict}${code}`;
  const p = model.pick;
  $("comb-formula").innerHTML = `For ${esc(park.text)}: <var>w.e</var> = ${minus(model.w.e)}, so −60 − (<var>w.e</var> + 64) = ${minus(p.minExp)}; ` +
    `<var>k</var> = ⌈(${sumText(p.minExp, 63)})·0.30103⌉ = ⌈${minus(p.kReal.toFixed(4))}⌉ = ${minus(p.kk)}; ` +
    `index = ⌊(${sumText(348, p.kk, -1)})/8⌋ + 1 = ${p.index}, which is 10${sup(p.mk)} with <var>t</var> = ${minus(p.t)}.`;
}

function renderMultiply(model) {
  const { w, pick } = model;
  const c = pick.power;
  const parts = M.multiplyParts(w, c);
  const t = pick.t;
  // Partial products grid.
  const W = 1000, H = 250;
  const root = svg(W, H, "Long multiplication with four 32-bit partial products; the upper 64 bits are kept");
  const col = [100, 310, 520, 730, 940];
  const heads = ["bits 127–96", "95–64", "63–32", "31–0"];
  heads.forEach((txt, i) => s(root, "text", { x: (col[i] + col[i + 1]) / 2, y: 16, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: txt }));
  const rows = [
    ["a·c", 0, 2, 30], ["a·d", 1, 3, 62], ["b·c", 1, 3, 94], ["b·d", 2, 4, 126],
  ];
  for (const [name, from, to, y] of rows) {
    s(root, "rect", { x: col[from] + 2, y, width: col[to] - col[from] - 4, height: 24, class: "grisu-pocket-bar-part" });
    s(root, "text", { x: from === 1 ? (col[1] + col[2]) / 2 : (col[from] + col[to]) / 2, y: y + 17, "text-anchor": "middle", class: "grisu-pocket-label", text: `${name}  (64 bits)` });
    s(root, "text", { x: 10, y: y + 17, class: "grisu-pocket-label", text: name });
  }
  s(root, "text", { x: 10, y: 175, class: "grisu-pocket-label-red", text: "+ 2⁶³" });
  s(root, "rect", { x: col[2] + 2, y: 160, width: 10, height: 20, class: "grisu-pocket-bar-b" });
  s(root, "text", { x: col[2] + 18, y: 175, class: "grisu-pocket-label-red", text: "round half up: +1 at bit 63" });
  s(root, "line", { x1: col[0], y1: 190, x2: col[4], y2: 190, class: "grisu-pocket-axis" });
  s(root, "rect", { x: col[0] + 2, y: 198, width: col[2] - col[0] - 4, height: 28, class: "grisu-pocket-bar-kept" });
  s(root, "text", { x: (col[0] + col[2]) / 2, y: 217, "text-anchor": "middle", class: "grisu-pocket-label-blue", text: "kept: the product significand" });
  s(root, "rect", { x: col[2] + 2, y: 198, width: col[4] - col[2] - 4, height: 28, class: "grisu-pocket-bar-drop" });
  const lowFrac = M.ratioToNumber(parts.low, 1n << 64n);
  s(root, "text", { x: (col[2] + col[4]) / 2, y: 217, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: `dropped: ${lowFrac.toFixed(3)} of a unit` });
  s(root, "line", { x1: col[2], y1: 22, x2: col[2], y2: 236, class: "grisu-pocket-axis", "stroke-dasharray": "5 4" });
  s(root, "text", { x: 10, y: 217, class: "grisu-pocket-label", text: "sum" });
  s(root, "text", { x: col[2], y: 248, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: "keep | drop" });
  $("mul-grid").replaceChildren(root);

  // Error budget.
  const D = parts.f;
  const e1 = (Number(w.f) / 2 ** 64) * c.err;
  const e2 = M.ratioToNumber(D * (1n << 64n) - parts.full, 1n << 64n);
  const ex = M.exactScaled(w, c.k, t);
  const total = M.ratioToNumber(D * ex.den - ex.num, ex.den);
  const B = svg(1000, 130, `Error budget: table ${e1.toFixed(3)} unit, product rounding ${e2.toFixed(3)} unit, total ${total.toFixed(3)} unit`);
  const X = (u) => 500 + u * 400;
  s(B, "rect", { x: X(-1), y: 18, width: 800, height: 64, class: "grisu-pocket-window" });
  s(B, "line", { x1: X(-1.2), y1: 86, x2: X(1.2), y2: 86, class: "grisu-pocket-axis" });
  for (const [u, txt] of [[-1, "−1 unit"], [-0.5, "−½"], [0, "0"], [0.5, "+½"], [1, "+1 unit"]]) {
    s(B, "line", { x1: X(u), y1: 86, x2: X(u), y2: 92, class: "grisu-pocket-axis" });
    s(B, "text", { x: X(u), y: 106, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: txt });
  }
  const bar = (from, to, y, cls) => s(B, "rect", { x: Math.min(X(from), X(to)), y, width: Math.max(1.5, Math.abs(X(to) - X(from))), height: 18, class: cls });
  bar(0, e1, 26, "grisu-pocket-bar-a");
  bar(e1, e1 + e2, 52, "grisu-pocket-bar-b");
  s(B, "text", { x: 8, y: 41, class: "grisu-pocket-label-blue", text: "table" });
  s(B, "text", { x: 992, y: 41, "text-anchor": "end", class: "grisu-pocket-label-blue", text: fmtU(e1).replace(" unit", "") });
  s(B, "text", { x: 8, y: 67, class: "grisu-pocket-label-red", text: "product" });
  s(B, "text", { x: 992, y: 67, "text-anchor": "end", class: "grisu-pocket-label-red", text: fmtU(e2).replace(" unit", "") });
  s(B, "path", { d: `M${X(total)},84 l-6,-9 h12 z`, class: "grisu-pocket-point" });
  s(B, "text", { x: X(total), y: 124, "text-anchor": "middle", class: "grisu-pocket-label", text: `total ${fmtU(total)}` });
  $("mul-budget").replaceChildren(B);

  const dropped = parts.low >= 1n << 63n ? "at least ½, so the kept half is rounded up" : "less than ½, so the kept half is rounded down";
  $("mul-readout").innerHTML = `<var>w</var>.f = ${g(w.f)} and the cached 10${sup(c.k)} has <var>c</var>.f = ${g(c.f)}, which is ` +
    (c.exact ? "exact." : `off by ${fmtU(c.err)} of its last bit.`) +
    ` Here a and b are the upper and lower 32 bits of <var>w</var>.f, and c and d those of <var>c</var>.f. The dropped lower half is ${lowFrac.toFixed(3)} of a unit, ${dropped}: ` +
    `<var>w</var> ⊗ <var>c</var> = <span class="grisu-pocket-int">${g(D)}</span>·2${sup(t)}. Exact <var>w</var>&thinsp;·&thinsp;10${sup(c.k)} = ${gDec(M.rationalToDecimal(ex.num, ex.den, 6))} units, so the computed product is ${fmtU(total)} off.` +
    (c.exact && parts.low === 0n ? ` Both errors are 0 here. Try <button type="button" class="grisu-pocket-link" data-park="1e23">1e23</button> or <button type="button" class="grisu-pocket-link" data-park="123456.789">123456.789</button>, whose cached powers are inexact.` : "");
  for (const b of $("mul-readout").querySelectorAll("[data-park]")) b.addEventListener("click", () => setPark(b.dataset.park));
  const hexRows = [["a = w.f ≫ 32", parts.a], ["b = w.f mod 2³²", parts.b], ["c = c.f ≫ 32", parts.c], ["d = c.f mod 2³²", parts.d],
    ["a·c", parts.ac], ["a·d", parts.ad], ["b·c", parts.bc], ["b·d", parts.bd], ["tmp (with +2³¹)", parts.tmp], ["128-bit product", parts.full], ["kept f", parts.f]];
  $("mul-hex").innerHTML = `<table>${hexRows.map(([n, v]) => `<tr><th>${n}</th><td>0x${v.toString(16).toUpperCase()}</td></tr>`).join("")}</table>`;
}
function gDec(str) {
  const [whole, frac] = str.split(".");
  return g(whole) + (frac !== undefined ? "." + frac : "");
}
// "a + b + c" with signs folded in: sumText(-19, -9, 16) -> "−19 − 9 + 16".
function sumText(...terms) {
  return terms.map((t, i) => {
    const n = Number(t);
    if (i === 0) return minus(n);
    return n < 0 ? `− ${-n}` : `+ ${n}`;
  }).join(" ");
}
function fmtU(u) {
  const r = Math.abs(u) < 5e-4 ? "0" : (u > 0 ? "+" : "−") + Math.abs(u).toFixed(3);
  return `${r} unit`;
}

function renderLot() {
  const g1 = M.grisu1(park.v);
  const t = -g1.s;
  drawRegister($("lot-register"), g1.D.f, t, `The scaled value w ⊗ c with the binary point after bit ${g1.s}`);
  const n = park.lotStep;
  const rows = g1.frames.slice(0, n);
  const H = 30 + Math.max(1, rows.length) * 22;
  const root = svg(1000, H, `${rows.length} rows of the times-ten conveyor`);
  const pointX = REG_X0 + (64 - g1.s) * CELL;
  s(root, "text", { x: 0, y: 16, class: "grisu-pocket-label-muted", text: rows.length ? "digit  ← bits pushed across the point by ×10" : "press ×10 to push the first fraction digit across the point" });
  rows.forEach((fr, r) => {
    const y = 24 + r * 22;
    for (let i = 0; i < 4; i++) {
      const bit = (BigInt(fr.digit) >> BigInt(3 - i)) & 1n;
      s(root, "rect", { x: pointX - (4 - i) * CELL, y, width: CELL, height: 18, class: `grisu-pocket-cell grisu-pocket-cell-dig${bit}` });
    }
    for (let i = 0; i < g1.s; i++) {
      const bit = (fr.after >> BigInt(g1.s - 1 - i)) & 1n;
      s(root, "rect", { x: pointX + i * CELL, y, width: CELL, height: 18, class: `grisu-pocket-cell grisu-pocket-cell-frac${bit}` });
    }
    s(root, "text", { x: pointX - 4 * CELL - 8, y: y + 14, "text-anchor": "end", class: "grisu-pocket-label-red", text: String(fr.digit) });
  });
  if (rows.length) s(root, "line", { x1: pointX, y1: 20, x2: pointX, y2: H - 4, class: "grisu-pocket-pointline" });
  $("lot-conveyor").replaceChildren(root);
  centerScroll($("lot-conveyor"), pointX);
  const fracSoFar = rows.map((fr) => fr.digit).join("");
  const done = n >= g1.frames.length;
  $("lot-readout").innerHTML = `Integral part ${g1.part1} (${g1.intDigits.length} digit${g1.intDigits.length === 1 ? "" : "s"}, printed by 32-bit division). ` +
    `Printed so far: <strong>${g1.intDigits}.${fracSoFar}</strong>${done ? "" : "…"} × 10${sup(-g1.pick.mk)} (${g1.intDigits.length + n} of 18 digits).` +
    (done ? ` Grisu1 prints <strong>${g1.digits}e${minus(g1.exponent)}</strong>.` : "");
  $("lot-step").disabled = done;
  $("lot-all").disabled = done;
  const js = M.jsDigits(park.v);
  const back = Number(`${g1.digits}e${g1.exponent}`) === park.v;
  $("g1-readout").innerHTML = `Grisu1 for ${esc(park.text)}: <strong>${g1.digits}e${minus(g1.exponent)}</strong>, 18 digits. ` +
    `It reads back as ${esc(String(park.v))}: ${back ? '<span class="grisu-pocket-ok">✓</span>' : '<span class="grisu-pocket-bad">✗</span>'}. ` +
    `The shortest decimal that reads back has ${js.digits.length} digit${js.digits.length === 1 ? "" : "s"}: <strong>${js.digits}e${minus(js.exp10)}</strong>.`;
}

function setTooth(index) {
  park.tooth = index;
  $("tooth-range").value = String(index);
  setParam("tooth", index);
  const model = parkModel();
  renderComb(model);
  renderParkStatus(model);
}

function setPark(text, keepTooth = false) {
  const v0 = parseNumber(text);
  const err = checkDouble(v0);
  if (err) { $("comb-status").textContent = err; return; }
  park.v = Math.abs(v0);
  park.text = v0 < 0 ? String(park.v) : text.trim();
  park.lotStep = 0;
  const model = parkModel();
  if (!keepTooth || park.tooth === null) park.tooth = model.pick.index;
  $("tooth-range").value = String(park.tooth);
  setParam("x", park.text);
  setParam("tooth", park.tooth);
  pressChip($("park-chips"), park.text);
  renderComb(model);
  renderParkStatus(model);
  renderMultiply(model);
  renderLot();
}

function initPark() {
  chips($("park-chips"), PARK_PRESETS, (item) => { $("park-input").value = ""; setPark(item.value); });
  $("park-form").addEventListener("submit", (e) => { e.preventDefault(); setPark($("park-input").value); });
  $("tooth-range").addEventListener("input", (e) => setTooth(Number(e.target.value)));
  $("tooth-prev").addEventListener("click", () => setTooth(Math.max(0, park.tooth - 1)));
  $("tooth-next").addEventListener("click", () => setTooth(Math.min(86, park.tooth + 1)));
  $("tooth-auto").addEventListener("click", () => setTooth(parkModel().pick.index));
  $("lot-step").addEventListener("click", () => { park.lotStep++; renderLot(); });
  $("lot-all").addEventListener("click", () => { park.lotStep = 99; renderLot(); });
  $("lot-reset").addEventListener("click", () => { park.lotStep = 0; renderLot(); });
  const x = params.get("x") ?? "0.3";
  const tooth = params.has("tooth") ? Number(params.get("tooth")) : null;
  park.tooth = Number.isInteger(tooth) && tooth >= 0 && tooth <= 86 ? tooth : null;
  setPark(x, park.tooth !== null);
  if (params.has("lot")) { park.lotStep = Number(params.get("lot")) || 0; renderLot(); }
}

// ---------------------------------------------------------------------------
// Part 2: the hand-check card

const card = { bits: M.halfBitsOf(0.1), text: "0.1", q: 16 };
const CARD_PRESETS = [
  { label: "0.1", value: "0.1" },
  { label: "1000", value: "1000" },
  { label: "0.0316162109375", value: "0.0316162109375" },
  { label: "0.031524658203125", value: "0.031524658203125" },
  { label: "0.15625 (a tie)", value: "0.15625" },
  { label: "4112 (on a boundary)", value: "4112" },
];

function exactSignificand(c) {
  // 10^k / 2^e as an exact rational.
  let num = c.k >= 0 ? M.pow10(c.k) : 1n;
  let den = c.k >= 0 ? 1n : M.pow10(-c.k);
  if (c.e >= 0) den <<= BigInt(c.e); else num <<= BigInt(-c.e);
  return M.rationalToDecimal(num, den, 4);
}

function renderCard() {
  const q = card.q;
  const r = M.grisu3Half(card.bits, q);
  const x = r.half;
  const exact = M.exactShortest(x);
  const [alpha, gamma] = M.pocketWindow(q);
  const Q = 1n << BigInt(q);
  const one = r.split.one;
  const sh = r.split.s;
  const items = [];
  const add = (label, html, cls = "") => items.push(`<li class="${cls}"><b>${label}</b><span>${html}</span></li>`);
  add("Input", `${esc(card.text)} → nearest half-precision value <var>f</var>&thinsp;·&thinsp;2${sup("e")} = ${x.f}·2${sup(x.e)} = ${M.binaryFractionToDecimal(x.f, -x.e, 40)}`);
  const shift = x.e - r.w.e;
  add("Normalize", `Shift <var>f</var> left by ${shift} to fill ${q} bits: <var>w</var> = ${x.f} × ${2 ** shift} = <span class="grisu-pocket-int">${r.w.f}</span>, exponent ${minus(r.w.e)}.`);
  const mMinusRaw = x.lowerCloser ? `(4·${x.f} − 1)·2${sup(x.e - 2)} = ${4n * x.f - 1n}·2${sup(x.e - 2)}` : `(2·${x.f} − 1)·2${sup(x.e - 1)} = ${2n * x.f - 1n}·2${sup(x.e - 1)}`;
  add("Boundaries", `<var>m</var>${sup("−")} = ${mMinusRaw}${x.lowerCloser ? " (a power of two: the gap below is half as wide)" : ""}; <var>m</var>${sup("+")} = (2·${x.f} + 1)·2${sup(x.e - 1)} = ${2n * x.f + 1n}·2${sup(x.e - 1)}. ` +
    `On <var>w</var>’s exponent ${minus(r.w.e)}: <var>m</var>${sup("−")} = ${r.minus.f}, <var>m</var>${sup("+")} = ${r.plus.f}.`);
  const c = r.power;
  add("Cached power", `Need ${minus(alpha)} ≤ <var>w.e</var> + <var>c.e</var> + ${q} ≤ ${minus(gamma)}: take 10${sup(c.k)} ≈ ${c.f}·2${sup(c.e)} ` +
    (c.exact ? "(exact)" : `(true significand ${exactSignificand(c)})`) + `. <var>t</var> = ${sumText(r.w.e, c.e, q)} = ${minus(r.t)}.`);
  const mul = (name, a) => {
    const prod = a.f * c.f;
    const quotient = M.binaryFractionToDecimal(prod, q, 6);
    const rounded = (prod + (Q >> 1n)) >> BigInt(q);
    return `${name} = ${a.f} × ${c.f} ÷ ${Q} = ${quotient} → <strong>${rounded}</strong>`;
  };
  add("Multiply", `${mul("<var>sw</var>", r.w)}<br>${mul("<var>sm</var>", r.minus)}<br>${mul("<var>sp</var>", r.plus)}`);
  add("Widen", `<var>too_low</var> = ${r.sm.f} − 1 = ${r.tooLow}, <var>too_high</var> = ${r.sp.f} + 1 = ${r.tooHigh}, <var>unsafe</var> = ${r.unsafe0} units.`);
  add("Split", `<var>one</var> = 2${sup(sh)} = ${one}. <var>integrals</var> = ${r.tooHigh} ÷ ${one} = <span class="grisu-pocket-int">${r.split.integrals}</span>, <var>fractionals</var> = ${r.tooHigh} mod ${one} = ${r.split.fractionals}. ${r.split.integrals} has κ = ${r.split.kappa} digit${r.split.kappa === 1 ? "" : "s"}.`);
  let fracStep = 0;
  for (const st of r.steps) {
    const verdict = st.stop ? `<strong>${st.rest} &lt; ${st.unsafe}</strong>: stop.` : `${st.rest} ≥ ${st.unsafe}: next digit.`;
    if (st.phase === "int") {
      const after = (st.rest - r.split.fractionals) / one;
      const before = BigInt(st.digit * st.divisor) + after;
      add(`Digit ${st.digits.length}`, `${before} ÷ ${st.divisor} = <span class="grisu-pocket-dec">${st.digit}</span>, κ = ${st.kappa}. <var>rest</var> = ${after} × ${one} + ${r.split.fractionals} = ${st.rest}. ${verdict}`, st.stop ? "grisu-pocket-stop" : "");
    } else {
      fracStep++;
      const X = BigInt(st.digit) * one + st.rest;
      add(`Digit ${st.digits.length}`, `×10: <var>fractionals</var> = ${X}, <var>unit</var> = ${st.unit}, <var>unsafe</var> = ${st.unsafe}. ${X} ÷ ${one} = <span class="grisu-pocket-dec">${st.digit}</span>, κ = ${st.kappa}, <var>rest</var> = ${X} mod ${one} = ${st.rest}. ${verdict}`, st.stop ? "grisu-pocket-stop" : "");
    }
  }
  void fracStep;
  const wd = r.weed;
  const walkText = wd.walk.length
    ? `Lower the last digit: ${[wd.start.digits, ...wd.walk.map((m) => m.digits)].join(" → ")} (each step adds ${wd.tenKappa} to <var>rest</var>).`
    : `No step: ${stopText(wd)}.`;
  add("Round", `<var>too_high</var> − <var>sw</var> = ${wd.distTooHighW / wd.unit}${wd.unit > 1n ? ` units (× unit ${wd.unit} = ${wd.distTooHighW})` : " units"}. Candidate ${wd.start.digits} is <var>rest</var> = ${wd.start.rest} below <var>too_high</var>; <var>w</var> + 1 unit is ${wd.small} below. ${walkText} ` +
    (wd.ambiguous ? `<span class="grisu-pocket-bad">Measured from <var>w</var> − 1 unit (${wd.big} below), one more step would look closer: ambiguous, reject.</span>` : `Measured from <var>w</var> − 1 unit (${wd.big} below) the choice is the same.`));
  if (wd.ambiguous) add("Weed", `Not reached: the round step already returned false.`);
  else add("Weed", `2·<var>unit</var> ≤ <var>rest</var> ≤ <var>unsafe</var> − 4·<var>unit</var>: ${wd.safeLow} ≤ ${wd.rest} ≤ ${wd.safeHigh} ${wd.safe ? '<span class="grisu-pocket-ok">✓</span>' : '<span class="grisu-pocket-bad">✗</span>'}`);
  const outDigits = r.digits, outExp = r.decimalExponent;
  add("Output", r.ok
    ? `Digits ${outDigits}, exponent κ − k = ${r.kappa} − ${minus(c.k)} = ${minus(outExp)}: <strong class="grisu-pocket-dec">${M.plainDecimal(outDigits, outExp)}</strong>.`
    : `Grisu3 returns <code>false</code>; its candidate was ${outDigits}e${minus(outExp)}.`);
  $("card-steps").innerHTML = items.join("");

  const v = $("card-verdict");
  const exactText = `${exact.digits}e${minus(exact.exp10)} = ${M.plainDecimal(exact.digits, exact.exp10)}`;
  if (r.ok) {
    v.className = "grisu-pocket-verdict is-ok";
    v.innerHTML = `<p><span class="grisu-pocket-ok">Accepted.</span> The exact shortest-and-closest answer is ${exactText}. ${M.stripZeros(outDigits, outExp).digits === exact.digits ? "They agree." : ""}</p>`;
  } else {
    v.className = "grisu-pocket-verdict is-bad";
    const candValue = Number(`${outDigits}e${outExp}`);
    const readsBack = M.halfBitsOf(candValue) === card.bits;
    const fromLow = M.rationalToDecimal(wd.unsafe - wd.rest, wd.unit, 3);
    const fromHigh = M.rationalToDecimal(wd.rest, wd.unit, 3);
    const why = wd.ambiguous
      ? `<span class="grisu-pocket-bad">Rejected by the closeness test.</span> With <var>w</var> known only to ±1 unit, Grisu3 cannot tell which of two neighbouring candidates is closer.`
      : `<span class="grisu-pocket-bad">Rejected by the safe-zone test.</span> The candidate ${outDigits}e${minus(outExp)} lies ${fromLow} units above <var>too_low</var> and ${fromHigh} below <var>too_high</var>; it needs 4 and 2.`;
    const truth = readsBack
      ? `The candidate would in fact read back as this float, but Grisu3 could not prove it.`
      : `The candidate would <strong>not</strong> read back as this float, so accepting it would have been a bug.`;
    const tie = exact.tie ? " Two candidates are exactly equally close; the exact answer breaks the tie toward an even digit." : "";
    const bnd = exact.onBoundary ? " The exact answer lies exactly on a boundary; it is valid because the significand is even." : "";
    v.innerHTML = `<p>${why} ${truth}</p><p>The exact answer (from the bignum fallback) is ${exactText}.${tie}${bnd}</p>`;
  }
}
function stopText(wd) {
  if (wd.stopReason === "reached") return "the candidate is already at or below <var>w</var> + 1 unit";
  if (wd.stopReason === "edge") return "one digit lower would drop below <var>too_low</var>";
  return "one digit lower would be farther from <var>w</var>";
}

function setCard(text, opts = {}) {
  const v = parseNumber(text);
  const bits = opts.bits ?? (Number.isFinite(v) && v > 0 ? M.halfBitsOf(v) : null);
  if (bits === null || bits === undefined) {
    $("card-verdict").className = "grisu-pocket-verdict is-bad";
    $("card-verdict").textContent = "That number is not a positive half-precision value (the range is about 6e-8 to 65504).";
    return;
  }
  card.bits = bits;
  card.text = text.trim();
  setParam("h", card.text);
  pressChip($("card-chips"), card.text);
  renderCard();
}

function initCard() {
  chips($("card-chips"), CARD_PRESETS, (item) => { $("card-input").value = ""; setCard(item.value); });
  $("card-form").addEventListener("submit", (e) => { e.preventDefault(); setCard($("card-input").value); });
  const sel = $("card-q");
  for (let q = 13; q <= 24; q++) {
    const o = document.createElement("option");
    o.value = String(q);
    o.textContent = q === 16 ? "16 (the card)" : String(q);
    sel.appendChild(o);
  }
  const q0 = Number(params.get("hq"));
  card.q = q0 >= 13 && q0 <= 24 ? q0 : 16;
  sel.value = String(card.q);
  sel.addEventListener("change", () => { card.q = Number(sel.value); setParam("hq", card.q); renderCard(); });
  for (const b of document.querySelectorAll("[data-card]")) {
    b.addEventListener("click", () => {
      setCard(b.dataset.card);
      $("cards").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }
  setCard(params.get("h") ?? "0.1");
}

// ---------------------------------------------------------------------------
// Part 2: the exhaustive map

const COLORS = [[[190, 226, 201], [170, 214, 184]], [[240, 160, 48], [226, 146, 36]], [[155, 28, 28], [135, 20, 20]]];
const mapCache = new Map();
const mapState = { q: 16, cols: 1024 };
function getMap(q) {
  if (!mapCache.has(q)) mapCache.set(q, M.pocketMap(q));
  return mapCache.get(q);
}
function renderMap() {
  const q = mapState.q;
  const map = getMap(q);
  const canvas = $("map-canvas");
  const width = canvas.parentElement.clientWidth;
  const cols = width >= 1000 ? 1024 : width >= 480 ? 512 : 256;
  const per = 1024 / cols;
  const rowH = 8 / per;
  mapState.cols = cols; mapState.per = per; mapState.rowH = rowH;
  canvas.width = cols;
  canvas.height = 31 * per * rowH;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(canvas.width, canvas.height);
  const paper = [244, 240, 232];
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = paper[0]; img.data[i + 1] = paper[1]; img.data[i + 2] = paper[2]; img.data[i + 3] = 255; }
  for (let bits = 1; bits <= M.HALF_POSITIVE_COUNT; bits++) {
    const be = bits >> 10, frac = bits & 1023;
    const row = be * per + Math.floor(frac / cols);
    const col = frac % cols;
    const color = COLORS[map[bits]][be & 1];
    for (let dy = 0; dy < rowH; dy++) {
      const p = ((row * rowH + dy) * cols + col) * 4;
      img.data[p] = color[0]; img.data[p + 1] = color[1]; img.data[p + 2] = color[2];
    }
  }
  ctx.putImageData(img, 0, 0);
  const counts = M.mapCounts(map);
  const pct = (n) => (100 * n / M.HALF_POSITIVE_COUNT).toFixed(2) + "%";
  const sw = (i) => `<i style="background: rgb(${COLORS[i][0].join(",")})"></i>`;
  $("map-legend").innerHTML = `<span>${sw(0)}accepted ${g(counts[0])} (${pct(counts[0])})</span><span>${sw(1)}rejected, closeness ${g(counts[1])} (${pct(counts[1])})</span><span>${sw(2)}rejected, safe zone ${g(counts[2])} (${pct(counts[2])})</span>`;
  canvas.setAttribute("aria-label", `Grisu3 with ${q}-bit DiyFps on all 31,743 positive half-precision values: ${counts[0]} accepted, ${counts[1]} rejected by the closeness test, ${counts[2]} rejected by the safe-zone test.`);
  $("map-q-out").textContent = String(q);
  renderRates();
}
function mapBitsAt(event) {
  const canvas = $("map-canvas");
  const rect = canvas.getBoundingClientRect();
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height / mapState.rowH);
  const be = Math.floor(row / mapState.per);
  const frac = (row % mapState.per) * mapState.cols + col;
  if (be < 0 || be > 30 || frac < 0 || frac > 1023 || col < 0 || col >= mapState.cols) return null;
  const bits = (be << 10) | frac;
  return bits >= 1 && bits <= M.HALF_POSITIVE_COUNT ? bits : null;
}
function describeBits(bits) {
  const x = M.decodeHalf(bits);
  const st = getMap(mapState.q)[bits];
  const exact = M.exactShortest(x);
  const status = ["accepted", "rejected (closeness)", "rejected (safe zone)"][st];
  return `${M.binaryFractionToDecimal(x.f, -x.e, 40)} = ${x.f}·2${sup(x.e)}: ${status} at <var>q</var> = ${mapState.q}; shortest ${exact.digits}e${minus(exact.exp10)}.`;
}
function initMap() {
  const q0 = Number(params.get("mq"));
  mapState.q = q0 >= 13 && q0 <= 24 ? q0 : 16;
  $("map-q").value = String(mapState.q);
  $("map-q").addEventListener("input", (e) => { mapState.q = Number(e.target.value); setParam("mq", mapState.q); renderMap(); });
  const canvas = $("map-canvas");
  canvas.addEventListener("pointermove", (e) => {
    const bits = mapBitsAt(e);
    if (bits !== null) $("map-hover").innerHTML = describeBits(bits) + " Click to load it into the card.";
  });
  canvas.addEventListener("click", (e) => {
    const bits = mapBitsAt(e);
    if (bits === null) return;
    const x = M.decodeHalf(bits);
    card.q = mapState.q;
    $("card-q").value = String(card.q);
    setParam("hq", card.q);
    setCard(M.binaryFractionToDecimal(x.f, -x.e, 40), { bits });
    $("map-hover").innerHTML = describeBits(bits) + ' Loaded into the <a href="#cards">hand-check card</a>.';
  });
  let lastCols = null;
  const onResize = () => {
    const width = canvas.parentElement.clientWidth;
    const cols = width >= 1000 ? 1024 : width >= 480 ? 512 : 256;
    if (cols !== lastCols) { lastCols = cols; renderMap(); }
  };
  window.addEventListener("resize", onResize);
  onResize();
  // Fill in the rate chart in the background.
  let q = 13;
  const next = () => {
    while (q <= 24 && mapCache.has(q)) q++;
    if (q > 24) return;
    getMap(q);
    renderRates();
    setTimeout(next, 30);
  };
  setTimeout(next, 200);
}
function renderRates() {
  const W = 1000, H = 190;
  const root = svg(W, H, "Rejection rate for each number of DiyFp bits q from 13 to 24");
  const X = (q) => 70 + (q - 13) * 74;
  const Y = (p) => 150 - p * 1.3;
  s(root, "line", { x1: 60, y1: 150, x2: 960, y2: 150, class: "grisu-pocket-axis" });
  s(root, "text", { x: 0, y: 14, class: "grisu-pocket-label-muted", text: "rejected" });
  for (let q = 13; q <= 24; q++) {
    s(root, "text", { x: X(q) + 26, y: 168, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: `q=${q}` });
    if (!mapCache.has(q)) continue;
    const counts = M.mapCounts(mapCache.get(q));
    const p = 100 * (counts[1] + counts[2]) / M.HALF_POSITIVE_COUNT;
    s(root, "rect", { x: X(q), y: Y(p), width: 52, height: 150 - Y(p), class: q === mapState.q ? "grisu-pocket-rate-sel" : "grisu-pocket-rate" });
    s(root, "text", { x: X(q) + 26, y: Y(p) - 5, "text-anchor": "middle", class: "grisu-pocket-label", text: p >= 10 ? p.toFixed(0) + "%" : p.toFixed(1) + "%" });
  }
  const floor = 100 * 2008 / M.HALF_POSITIVE_COUNT;
  s(root, "line", { x1: 60, y1: Y(floor), x2: 960, y2: Y(floor), class: "grisu-pocket-rate-floor" });
  s(root, "text", { x: 960, y: Y(floor) - 5, "text-anchor": "end", class: "grisu-pocket-label-muted", text: "floor for q ≥ 32: 2008 values (6.33%)" });
  s(root, "text", { x: 500, y: 187, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: "DiyFp bits (half precision has 11 significand bits)" });
  $("map-rates").replaceChildren(root);
}

// ---------------------------------------------------------------------------
// Part 3: the 64-bit debugger

const CODE = [
  "function grisu3(v) {",
  "  const w = normalize(decode(v));",
  "  const [m_minus, m_plus] = normalizedBoundaries(v);",
  "  const minExp = -60 - (w.e + 64), maxExp = -32 - (w.e + 64);",
  "  const [ten_mk, mk] = cachedPowerForBinaryExponentRange(minExp, maxExp);",
  "  const W = times(w, ten_mk);",
  "  const LO = times(m_minus, ten_mk), HI = times(m_plus, ten_mk);",
  "  const [ok, kappa] = digitGen(LO, W, HI, buffer);",
  "  decimalExponent = -mk + kappa;",
  "  return ok;  // false: the caller runs BignumDtoa instead",
  "}",
  "",
  "function digitGen(low, w, high, buffer) {",
  "  let unit = 1n;",
  "  const too_low = low.f - unit, too_high = high.f + unit;",
  "  let unsafe = too_high - too_low;",
  "  const one = 1n << BigInt(-w.e);",
  "  let integrals = too_high >> BigInt(-w.e);   // < 2^32",
  "  let fractionals = too_high & (one - 1n);",
  "  let [divisor, kappa] = biggestPowerTen(integrals, 64 + w.e);",
  "  while (kappa > 0) {",
  "    buffer.push(integrals / divisor);",
  "    integrals %= divisor; kappa--;",
  "    const rest = (integrals << BigInt(-w.e)) + fractionals;",
  "    if (rest < unsafe)",
  "      return roundWeed(buffer, too_high - w.f, unsafe, rest,",
  "                       divisor << BigInt(-w.e), unit);",
  "    divisor /= 10n;",
  "  }",
  "  for (;;) {",
  "    fractionals *= 10n; unit *= 10n; unsafe *= 10n;",
  "    buffer.push(fractionals >> BigInt(-w.e));",
  "    fractionals &= one - 1n; kappa--;",
  "    if (fractionals < unsafe)",
  "      return roundWeed(buffer, (too_high - w.f) * unit, unsafe,",
  "                       fractionals, one, unit);",
  "  }",
  "}",
  "",
  "function roundWeed(buffer, dist, unsafe, rest, ten_kappa, unit) {",
  "  const small = dist - unit, big = dist + unit;  // to W+1, to W-1",
  "  while (rest < small && unsafe - rest >= ten_kappa &&",
  "         (rest + ten_kappa < small ||",
  "          small - rest >= rest + ten_kappa - small)) {",
  "    buffer[buffer.length - 1]--; rest += ten_kappa;",
  "  }",
  "  if (rest < big && unsafe - rest >= ten_kappa &&",
  "      (rest + ten_kappa < big || big - rest > rest + ten_kappa - big))",
  "    return false;  // cannot tell which candidate is closest",
  "  return 2n * unit <= rest && rest <= unsafe - 4n * unit;",
  "}",
];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const DBG_PRESETS = [
  { label: "0.3", value: "0.3" },
  { label: "1/3", value: "1/3" },
  { label: "5e-324", value: "5e-324" },
  { label: "1e23", value: "1e23" },
  { label: "0.1+0.2", value: "0.1+0.2" },
];
const dbg = { v: 0.3, text: "0.3", step: 0, steps: [], r: null };

function dec(num, shift, frac = 22) { return M.binaryFractionToDecimal(num, shift, frac); }
function shortDigits(d) { return d.length <= 8 ? d : `${d.slice(0, 3)}…${d.slice(-4)}`; }

function buildSteps(r) {
  const x = r.x;
  const steps = [];
  const sh = -r.t;
  const bitsHex = "0x" + x.bits.toString(16).toUpperCase().padStart(16, "0");
  steps.push({
    short: "decode", title: "Decode the double", lines: [2],
    notes: { 2: `f = ${x.f}, e = ${x.e}` },
    body: `<p>The 64 bits split into sign, an 11-bit biased exponent (${x.be}) and 52 fraction bits. ${x.be === 0 ? "The exponent field is 0, so this is a subnormal: no hidden bit, <var>e</var> = −1074." : "The hidden 1 is put back in front of the fraction."} The value is exactly <var>f</var>&thinsp;·&thinsp;2${sup(x.e)}.</p>`,
    regs: [["f", g(x.f), `${M.bitLength(x.f)} significant bits`], ["e", minus(x.e), "binary exponent"], ["exact value", esc(M.rationalToDecimal(x.e >= 0 ? x.f << BigInt(x.e) : x.f, x.e >= 0 ? 1n : 1n << BigInt(-x.e), 30)), ""]],
    hex: [["bits", bitsHex]],
    visual: (el) => drawFields(el, x.bits),
  });
  const shift = x.e - r.w.e;
  steps.push({
    short: "normalize", title: "Normalize to a 64-bit DiyFp", lines: [2],
    notes: { 2: `w = … · 2^${r.w.e}` },
    body: `<p>Shift <var>f</var> left by ${shift} bits so its top bit is bit 63. The value does not change. The ${64 - M.bitLength(x.f)} zero bits at the bottom (tinted) are the spare bits that give Grisu room for its error.</p>`,
    regs: [["w.f", g(r.w.f), `f · 2^${shift}`], ["w.e", minus(r.w.e), `e − ${shift}`]],
    hex: [["w.f", M.hex64(r.w.f)]],
    visual: (el) => drawNormalized(el, r.w.f, M.bitLength(x.f)),
  });
  steps.push({
    short: "boundaries", title: "Boundaries m− and m+", lines: [3],
    notes: { 3: x.lowerCloser ? "lower gap is half as wide" : "both gaps equal" },
    body: `<p><var>m</var>${sup("+")} = (2<var>f</var> + 1)·2${sup("e−1")}, normalized, lies halfway to the next double up. ` +
      (x.lowerCloser
        ? `Here <var>f</var> = 2${sup(52)} and the exponent is above the minimum, so the double below is only half a gap away: <var>m</var>${sup("−")} = (4<var>f</var> − 1)·2${sup("e−2")}.`
        : `<var>m</var>${sup("−")} = (2<var>f</var> − 1)·2${sup("e−1")} lies halfway to the double below.`) +
      ` <var>m</var>${sup("−")} is shifted to <var>m</var>${sup("+")}’s exponent, which equals <var>w.e</var>. All three are exact.</p>`,
    regs: [["m−.f", g(r.minus.f), `w.f − ${r.w.f - r.minus.f}`], ["m+.f", g(r.plus.f), `w.f + ${r.plus.f - r.w.f}`], ["e", minus(r.plus.e), "shared exponent"]],
    hex: [["m−.f", M.hex64(r.minus.f)], ["m+.f", M.hex64(r.plus.f)]],
    visual: (el) => drawBoundaries(el, x.lowerCloser),
  });
  const p = r.pick;
  steps.push({
    short: "power", title: `Cached power 10${sup(p.mk)}`, lines: [4, 5],
    notes: { 4: `minExp = ${p.minExp}, maxExp = ${p.maxExp}`, 5: `index ${p.index}: mk = ${p.mk}` },
    body: `<p>The table entry must bring <var>t</var> = <var>w.e</var> + <var>c.e</var> + 64 into −60 … −32, so <var>c.e</var> must lie in ${minus(p.minExp)} … ${minus(p.maxExp)}. ` +
      `<var>k</var> = ⌈(${minus(p.minExp)} + 63)·0.30103⌉ = ${minus(p.kk)}, index = ⌊(348 + ${minus(p.kk)} − 1)/8⌋ + 1 = ${p.index}. That entry is 10${sup(p.mk)}, ${p.power.exact ? "which is exact" : `off by ${fmtU(p.power.err).replace(" unit", "")} of its last bit`}, and gives <var>t</var> = ${minus(p.t)}.</p>`,
    regs: [["ten_mk.f", g(p.power.f), p.power.exact ? "exact" : "rounded to nearest"], ["ten_mk.e", minus(p.power.e), ""], ["mk", minus(p.mk), "the power of ten"], ["t", minus(p.t), "exponent of the products"]],
    hex: [["ten_mk.f", M.hex64(p.power.f)]],
    visual: (el) => {
      const root = svg(1000, 130, `t axis: t = ${p.t} inside the window`);
      drawTAxis(root, 0, M.combTeeth(r.w.e), p.index, { range: 2 });
      el.replaceChildren(root);
    },
  });
  const err = (a, ex) => M.ratioToNumber(a.f * ex.den - ex.num, ex.den);
  const eW = err(r.sw, r.exact.w), eL = err(r.sm, r.exact.minus), eH = err(r.sp, r.exact.plus);
  steps.push({
    short: "multiply", title: "Scale w, m− and m+", lines: [6, 7],
    notes: { 6: `W ≈ ${dec(r.sw.f, sh, 8)}`, 7: `LO ≈ ${dec(r.sm.f, sh, 8)}, HI ≈ ${dec(r.sp.f, sh, 8)}` },
    body: `<p>Three rounded multiplications by the same cached power. Each result has exponent <var>t</var> = ${minus(r.t)}, and each is less than one unit (2${sup(r.t)}) away from the exact scaled value. The table shows how far off each one actually is.</p>`,
    regs: [
      ["W", g(r.sw.f), `= ${dec(r.sw.f, sh)}; ${fmtU(eW)} off`],
      ["LO", g(r.sm.f), `= ${dec(r.sm.f, sh)}; ${fmtU(eL)} off`],
      ["HI", g(r.sp.f), `= ${dec(r.sp.f, sh)}; ${fmtU(eH)} off`],
    ],
    hex: [["W.f", M.hex64(r.sw.f)], ["LO.f", M.hex64(r.sm.f)], ["HI.f", M.hex64(r.sp.f)]],
    visual: (el) => drawErrors(el, [["LO", eL], ["W", eW], ["HI", eH]]),
  });
  steps.push({
    short: "widen", title: "Widen by one unit", lines: [14, 15, 16],
    notes: { 15: `too_high − too_low`, 16: `unsafe = ${r.unsafe0}` },
    body: `<p>The true <var>m</var>${sup("−")} and <var>m</var>${sup("+")} are each within one unit of LO and HI, so the true interval lies inside (<var>too_low</var>, <var>too_high</var>). Grisu3 searches this wider, “unsafe” interval, then checks the result against a narrower one at the end.</p>`,
    regs: [["too_low", g(r.tooLow), "LO − 1"], ["too_high", g(r.tooHigh), "HI + 1"], ["unsafe", g(r.unsafe0), "too_high − too_low, in units"], ["W", `too_high − ${r.tooHigh - r.sw.f}`, ""]],
    hex: [["too_low", M.hex64(r.tooLow)], ["too_high", M.hex64(r.tooHigh)]],
    visual: (el) => drawWiden(el, r),
  });
  steps.push({
    short: "split", title: "Split too_high at the binary point", lines: [17, 18, 19, 20],
    notes: { 17: `one = 2^${sh}`, 18: `integrals = ${r.split.integrals}`, 19: `fractionals = ${r.split.fractionals}`, 20: `divisor = ${r.split.divisor}, kappa = ${r.split.kappa}` },
    body: `<p><var>one</var> = 2${sup(sh)} is the number 1 in these units. The top ${64 - sh} bits of <var>too_high</var> are its integral part, and the bottom ${sh} bits are its fraction. <code>BiggestPowerTen</code> estimates the number of digits with (bits + 1)·1233 ≫ 12 (1233/4096 ≈ log${"<sub>10</sub>"}2) and corrects it with one comparison: κ = ${r.split.kappa}.</p>`,
    regs: [["one", `2^${sh}`, ""], ["integrals", `<span class="grisu-pocket-int">${r.split.integrals}</span>`, `${64 - sh} bits`], ["fractionals", g(r.split.fractionals), `${sh} bits`], ["divisor", g(r.split.divisor), `10^${r.split.kappa - 1}`], ["kappa", r.split.kappa, "digits in integrals"]],
    hex: [["too_high", M.hex64(r.tooHigh)], ["fractionals", "0x" + r.split.fractionals.toString(16).toUpperCase()]],
    visual: (el) => drawRegister(el, r.tooHigh, r.t, `too_high with the binary point after bit ${sh}`),
  });
  let fracCount = 0;
  r.steps.forEach((st, i) => {
    if (st.phase === "frac") fracCount++;
    const j = fracCount;
    const lines = st.phase === "int" ? [21, 22, 23, 24, 25, ...(st.stop ? [] : [28])] : [30, 31, 32, 33, 34];
    const notes = st.phase === "int"
      ? { 22: `digit ${st.digit}`, 23: `kappa = ${st.kappa}`, 24: `rest = ${shortNum(st.rest)}`, 25: `${st.stop ? "<" : "≥"} unsafe ${shortNum(st.unsafe)}` }
      : { 31: `unit = ${shortNum(st.unit)}`, 32: `digit ${st.digit}`, 33: `kappa = ${st.kappa}`, 34: `${shortNum(st.rest)} ${st.stop ? "<" : "≥"} ${shortNum(st.unsafe)}` };
    const scale = st.phase === "int" ? r.split.one : r.split.one * M.pow10(j);
    const restReal = M.rationalToDecimal(st.rest, scale, 24);
    const prefix = M.plainDecimal(st.digits, st.kappa);
    const body = `<p>${st.phase === "int"
      ? `Integer division by ${st.divisor} gives the digit ${st.digit}.`
      : `Multiplying <var>fractionals</var> by 10 pushes the digit ${st.digit} across the point. <var>unit</var> and <var>unsafe</var> are multiplied too, so everything stays in the same, finer units.`} ` +
      `Invariant: <var>too_high</var> = <var>buffer</var>&thinsp;·&thinsp;10${sup("κ")} + <var>rest</var>, that is ${dec(r.tooHigh, sh, 20)} = ${prefix} + ${restReal}.</p>` +
      `<p>The grid point <var>buffer</var>&thinsp;·&thinsp;10${sup("κ")} = ${prefix} lies <var>rest</var> below <var>too_high</var>. It is inside the widened interval exactly when <var>rest</var> &lt; <var>unsafe</var>. ` +
      (st.stop
        ? `<strong>It is</strong>, and every earlier, coarser grid (10${sup(st.kappa + 1)} and up) had no point inside. So ${st.digits.length} digit${st.digits.length === 1 ? "" : "s"} is the shortest possible: Grisu3 only needs to test the top end, because the largest grid point at or below <var>too_high</var> is the only candidate for each grid.</p>`
        : `Not yet: the grid 10${sup(st.kappa)} is too coarse, because its nearest point is ${ratioText(st.rest, st.unsafe)} widths of the interval below <var>too_high</var>.</p>`);
    steps.push({
      short: `digit ${i + 1}`, title: `Digit ${i + 1}: ${st.digit}`, lines, notes, body,
      regs: [["buffer", `<span class="grisu-pocket-dec">${st.digits}</span>`, ""], ["kappa", minus(st.kappa), ""], ["rest", g(st.rest), st.phase === "frac" ? `in units of 1/${g(st.unit)} unit` : "units"], ["unsafe", g(st.unsafe), st.stop ? "rest < unsafe: stop" : "rest ≥ unsafe: continue"]],
      hex: [["rest", "0x" + st.rest.toString(16).toUpperCase()], ["unsafe", "0x" + st.unsafe.toString(16).toUpperCase()]],
      visual: (el) => drawDigitRows(el, r, i),
    });
  });
  const wd = r.weed;
  const inFrac = r.steps.at(-1).phase === "frac";
  const callLines = inFrac ? [35, 36] : [26, 27];
  steps.push({
    short: "round", title: "RoundWeed, part 1: move toward W", lines: [...callLines, 40, 41, 42, 43, 44, 45, 46],
    notes: { 41: `small = ${shortNum(wd.small)}, big = ${shortNum(wd.big)}`, 45: wd.walk.length ? `${wd.walk.length} step${wd.walk.length === 1 ? "" : "s"}: ${wd.start.digits.slice(-1)} → ${wd.walk.at(-1).digits.slice(-1)}` : "no step" },
    body: `<p>The digits of <var>too_high</var> give the largest candidate, but the closest one to <var>w</var> may be lower. Distances are measured downward from <var>too_high</var>: the candidate is <var>rest</var> below it, and <var>W</var> + 1 unit is <var>small</var> below it. Candidates one step apart are <var>ten_kappa</var> apart. ` +
      (wd.walk.length
        ? `The loop lowered the last digit ${wd.walk.length} time${wd.walk.length === 1 ? "" : "s"}: ${[wd.start.digits, ...wd.walk.map((m) => m.digits)].map(shortDigits).join(" → ")}. It stopped because ${stopText(wd)}.`
        : `The loop did not move: ${stopText(wd)}.`) + `</p>`,
    regs: [["rest", g(wd.rest), wd.walk.length ? `was ${g(wd.start.rest)}` : ""], ["small", g(wd.small), "distance to W + 1 unit"], ["ten_kappa", g(wd.tenKappa), "distance between candidates"], ["unsafe", g(wd.unsafe), ""], ["unit", g(wd.unit), ""]],
    hex: [],
    visual: (el) => drawWeed(el, r, "round"),
  });
  steps.push({
    short: "weed", title: "RoundWeed, part 2: prove it or give up", lines: [47, 48, 49, 50],
    notes: wd.ambiguous ? { 49: "taken: ambiguous" } : { 50: `${shortNum(wd.safeLow)} ≤ ${shortNum(wd.rest)} ≤ ${shortNum(wd.safeHigh)}: ${wd.safe}` },
    body: `<p>Two checks. First, repeat the move test measured from <var>W</var> − 1 unit (<var>big</var>). If a lower candidate could be closer to some point of <var>W</var>’s uncertainty range, the closest candidate is ambiguous. ` +
      (wd.ambiguous ? `<strong class="grisu-pocket-bad">That happens here: return false.</strong></p>` : `Here it is not.</p>`) +
      (wd.ambiguous ? "" : `<p>Second, the safe zone: the candidate must be at least 2 units below <var>too_high</var> (so ≤ HI − 1) and at least 4 above <var>too_low</var>. Being 2 units inside each widened end would be enough, as step 7 of the paper’s algorithm requires, so the lower margin is 2 units more conservative than necessary. ` +
        (wd.safe ? `<span class="grisu-pocket-ok">${g(wd.safeLow)} ≤ ${g(wd.rest)} ≤ ${g(wd.safeHigh)}: proved.</span>` : `<strong class="grisu-pocket-bad">${g(wd.safeLow)} ≤ ${g(wd.rest)} ≤ ${g(wd.safeHigh)} fails: return false.</strong>${wd.rest === wd.unit ? " The candidate is exactly 1 unit below too_high, that is, exactly on the computed HI." : ""}`) + `</p>`),
    regs: [["big", g(wd.big), "distance to W − 1 unit"], ["2·unit", g(wd.safeLow), "lowest allowed rest"], ["unsafe − 4·unit", g(wd.safeHigh), "highest allowed rest"], ["rest", g(wd.rest), wd.ambiguous ? "ambiguous" : wd.safe ? "inside" : "outside"]],
    hex: [],
    visual: (el) => drawWeed(el, r, "weed"),
  });
  const js = M.jsDigits(r.v);
  steps.push({
    short: r.ok ? "output" : "fallback", title: r.ok ? "Output" : "Fallback to BignumDtoa", lines: [8, 9, 10],
    notes: { 9: `= ${-r.mk} + ${r.kappa} = ${r.decimalExponent}`, 10: r.ok ? "true" : "false" },
    body: r.ok
      ? `<p>The buffer holds <strong class="grisu-pocket-dec">${r.digits}</strong> and the decimal exponent is −mk + κ = ${minus(-r.mk)} + ${minus(r.kappa)} = ${minus(r.decimalExponent)}: <strong class="grisu-pocket-dec">${M.plainDecimal(r.digits, r.decimalExponent)}</strong>. JavaScript prints ${esc(String(r.v))}, ${js.digits === r.digits ? "the same digits" : "different digits"}.</p>`
      : `<p>Grisu3 returns false. Its candidate was ${r.digits}e${minus(r.decimalExponent)}, which it could not prove. double-conversion’s <code>DoubleToAscii</code> now calls <code>BignumDtoa</code>, which computes with exact big integers and prints <strong class="grisu-pocket-dec">${esc(r.fallback.text)}</strong>.` +
        (fallbackMatches(r) ? " Here the candidate was right after all, but Grisu3 had no way to know." : "") + `</p>`,
    regs: [["digits", `<span class="grisu-pocket-dec">${r.digits}</span>`, ""], ["kappa", minus(r.kappa), ""], ["decimal exponent", minus(r.decimalExponent), "−mk + kappa"], ["result", r.ok ? "accepted" : `rejected (${r.reason === "round" ? "closeness" : "safe zone"})`, ""]],
    hex: [],
    visual: (el) => el.replaceChildren(),
  });
  return steps;
}
function fallbackMatches(r) {
  const d = M.stripZeros(r.digits, r.decimalExponent);
  return r.fallback.coefficient.toString() === d.digits && r.fallback.exponent === d.exp10;
}
function shortNum(n) {
  const str = n.toString();
  return str.length <= 9 ? str : `${str.slice(0, 3)}…(${str.length} digits)`;
}
function ratioText(a, b) {
  const r = Number((a * 1000n) / b) / 1000;
  if (r >= 1e6) { const [m, e] = r.toExponential(1).split("e+"); return `${m}×10${supText(e)}`; }
  return r >= 100 ? r.toFixed(0) : r.toFixed(2);
}

// Debugger visuals
function drawFields(el, bits) {
  const root = svg(1000, 82, "Sign, exponent and fraction bits");
  for (let i = 0; i < 64; i++) {
    const bit = (bits >> BigInt(63 - i)) & 1n;
    const kind = i === 0 ? "sign" : i < 12 ? "exp" : "int";
    s(root, "rect", { x: REG_X0 + i * CELL, y: 10, width: CELL, height: 22, class: `grisu-pocket-cell grisu-pocket-cell-${kind}${bit}` });
  }
  s(root, "text", { x: REG_X0, y: 50, class: "grisu-pocket-label", text: "sign" });
  s(root, "text", { x: REG_X0 + 1 * CELL, y: 74, class: "grisu-pocket-label", text: "exponent (11)" });
  s(root, "text", { x: REG_X0 + 12 * CELL, y: 50, class: "grisu-pocket-label-blue", text: "fraction (52 bits)" });
  el.replaceChildren(root);
}
function drawNormalized(el, f, sigBits) {
  const root = svg(1000, 64, "The normalized 64-bit significand");
  for (let i = 0; i < 64; i++) {
    const bit = (f >> BigInt(63 - i)) & 1n;
    s(root, "rect", { x: REG_X0 + i * CELL, y: 10, width: CELL, height: 22, class: `grisu-pocket-cell grisu-pocket-cell-${i < sigBits ? "int" : "spare"}${bit}` });
  }
  s(root, "text", { x: REG_X0, y: 52, class: "grisu-pocket-label-blue", text: `${sigBits} significand bits` });
  s(root, "text", { x: REG_X0 + 64 * CELL, y: 52, "text-anchor": "end", class: "grisu-pocket-label-muted", text: `${64 - sigBits} spare bits` });
  el.replaceChildren(root);
}
function drawBoundaries(el, lowerCloser) {
  const root = svg(1000, 90, "The double, its neighbours and its boundaries");
  const X = (u) => 500 + u * 360;
  s(root, "line", { x1: 60, y1: 50, x2: 940, y2: 50, class: "grisu-pocket-axis" });
  const low = lowerCloser ? 0.5 : 1;
  s(root, "rect", { x: X(-low / 2), y: 36, width: X(0.5) - X(-low / 2), height: 28, class: "grisu-pocket-band" });
  for (const [u, txt, cls] of [[-low, "previous double", "grisu-pocket-label-muted"], [0, "v", "grisu-pocket-label-blue"], [1, "next double", "grisu-pocket-label-muted"]]) {
    s(root, "line", { x1: X(u), y1: 30, x2: X(u), y2: 70, class: "grisu-pocket-axis" });
    s(root, "text", { x: X(u), y: 86, "text-anchor": "middle", class: cls, text: txt });
  }
  s(root, "text", { x: X(-low / 2), y: 24, "text-anchor": "middle", class: "grisu-pocket-label-red", text: "m−" });
  s(root, "text", { x: X(0.5), y: 24, "text-anchor": "middle", class: "grisu-pocket-label-red", text: "m+" });
  el.replaceChildren(root);
}
function drawErrors(el, rows) {
  const root = svg(1000, 40 + rows.length * 30, "Error of each scaled value, in units");
  const X = (u) => 500 + u * 380;
  s(root, "rect", { x: X(-1), y: 8, width: X(1) - X(-1), height: rows.length * 30, class: "grisu-pocket-window" });
  rows.forEach(([name, e], i) => {
    const y = 24 + i * 30;
    s(root, "text", { x: 60, y: y + 4, class: "grisu-pocket-label", text: name });
    s(root, "line", { x1: X(-1), y1: y, x2: X(1), y2: y, class: "grisu-pocket-axis", opacity: 0.3 });
    s(root, "circle", { cx: X(e), cy: y, r: 6, class: "grisu-pocket-point" });
    s(root, "text", { x: 950, y: y + 4, "text-anchor": "end", class: "grisu-pocket-label", text: fmtU(e) });
  });
  const yb = 20 + rows.length * 30;
  for (const [u, txt] of [[-1, "−1"], [0, "0"], [1, "+1 unit"]]) s(root, "text", { x: X(u), y: yb + 14, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: txt });
  el.replaceChildren(root);
}
function drawWiden(el, r) {
  const root = svg(1000, 100, "The widened interval in units");
  const U = Number(r.unsafe0);
  const X = (d) => 940 - (d / U) * 860; // d = distance below too_high
  s(root, "rect", { x: X(U), y: 30, width: X(0) - X(U), height: 30, class: "grisu-pocket-band" });
  const pts = [["too_low", U, "grisu-pocket-label-muted", 88], ["LO", Number(r.tooHigh - r.sm.f), "grisu-pocket-label", 20], ["W", Number(r.tooHigh - r.sw.f), "grisu-pocket-label-blue", 20], ["HI", 1, "grisu-pocket-label", 20], ["too_high", 0, "grisu-pocket-label-muted", 88]];
  for (const [name, d, cls, y] of pts) {
    s(root, "line", { x1: X(d), y1: 26, x2: X(d), y2: 64, class: "grisu-pocket-axis" });
    s(root, "text", { x: X(d), y, "text-anchor": name === "too_low" || name === "LO" ? "start" : name === "W" ? "middle" : "end", class: cls, text: name });
  }
  s(root, "text", { x: 500, y: 88, "text-anchor": "middle", class: "grisu-pocket-label", text: `unsafe = ${r.unsafe0} units` });
  el.replaceChildren(root);
}
function drawDigitRows(el, r, upto) {
  const rows = r.steps.slice(0, upto + 1);
  const table = `<table class="grisu-pocket-rows"><thead><tr><th>κ</th><th>buffer</th><th>rest ÷ unsafe</th><th></th></tr></thead><tbody>` +
    rows.map((st, i) => `<tr class="${i === upto ? "is-current" : ""}"><td>${minus(st.kappa)}</td><td>${st.digits}</td><td>${ratioText(st.rest, st.unsafe)}</td><td>${st.stop ? '<span class="grisu-pocket-ok">inside</span>' : "outside"}</td></tr>`).join("") +
    `</tbody></table>`;
  const st = rows.at(-1);
  const root = svg(1000, 92, "Nearest grid point below too_high compared with the widened interval");
  const x0 = 380, x1 = 940;
  s(root, "rect", { x: x0, y: 34, width: x1 - x0, height: 28, class: "grisu-pocket-band" });
  s(root, "text", { x: x0, y: 84, "text-anchor": "middle", class: "grisu-pocket-label-muted", text: "too_low" });
  s(root, "text", { x: x1, y: 84, "text-anchor": "end", class: "grisu-pocket-label-muted", text: "too_high" });
  const ratio = Number((st.rest * 10000n) / st.unsafe) / 10000;
  const tag = `${shortDigits(st.digits)}·10${supText(st.kappa)}`;
  if (ratio <= 1) {
    const x = x1 - ratio * (x1 - x0);
    s(root, "line", { x1: x, y1: 26, x2: x, y2: 70, class: "grisu-pocket-cand" });
    s(root, "text", { x: Math.min(x, 860), y: 20, "text-anchor": "middle", class: "grisu-pocket-label-red", text: `${tag}: inside` });
  } else {
    s(root, "path", { d: "M44,48 l14,-8 v16 z", class: "grisu-pocket-point" });
    s(root, "text", { x: 40, y: 20, class: "grisu-pocket-label-red", text: `← ${tag} is ${ratioText(st.rest, st.unsafe)} interval widths below too_high` });
  }
  el.innerHTML = "";
  el.appendChild(root);
  el.insertAdjacentHTML("beforeend", table);
}
function drawWeed(el, r, mode) {
  const wd = r.weed;
  const U = wd.unsafe;
  const W_ = 1000, H = 158;
  const root = svg(W_, H, "RoundWeed: candidates, W with its one-unit uncertainty, and the safe zone");
  const xL = 60, xR = 940;
  const X = (d) => xR - (Number((d * 100000n) / U) / 100000) * (xR - xL); // d = distance below too_high
  s(root, "rect", { x: xL, y: 40, width: xR - xL, height: 50, class: "grisu-pocket-band" });
  if (mode === "weed" || !wd.ambiguous) s(root, "rect", { x: X(wd.safeHigh), y: 48, width: Math.max(0, X(wd.safeLow) - X(wd.safeHigh)), height: 34, class: "grisu-pocket-safe" });
  s(root, "text", { x: xL, y: 108, class: "grisu-pocket-label-muted", text: "too_low" });
  s(root, "text", { x: xR, y: 108, "text-anchor": "end", class: "grisu-pocket-label-muted", text: "too_high" });
  if (mode === "weed") s(root, "text", { x: (X(wd.safeHigh) + X(wd.safeLow)) / 2, y: 104, "text-anchor": "middle", class: "grisu-pocket-label-green", text: "safe zone" });
  // W and its blur.
  const xw1 = X(wd.big), xw2 = X(wd.small);
  s(root, "rect", { x: xw1, y: 36, width: Math.max(2, xw2 - xw1), height: 58, class: "grisu-pocket-blur" });
  s(root, "text", { x: (xw1 + xw2) / 2, y: 128, "text-anchor": "middle", class: "grisu-pocket-label-blue", text: xw2 - xw1 < 3 ? "W ± 1 unit (too thin to see)" : "W ± 1 unit" });
  // Candidates at the final digit position.
  const path = [wd.start.rest, ...wd.walk.map((m) => m.rest)];
  const labels = [wd.start.digits, ...wd.walk.map((m) => m.digits)];
  let d = wd.rest + wd.tenKappa;
  while (d <= U) {
    s(root, "line", { x1: X(d), y1: 44, x2: X(d), y2: 86, class: "grisu-pocket-cand-old" });
    d += wd.tenKappa;
  }
  path.forEach((dist, i) => {
    const last = i === path.length - 1;
    s(root, "line", { x1: X(dist), y1: 30, x2: X(dist), y2: 94, class: last ? "grisu-pocket-cand" : "grisu-pocket-cand-old" });
    const text = last ? shortDigits(labels[i]) : (labels[i].length > 1 ? "…" : "") + labels[i].slice(-1);
    s(root, "text", { x: Math.min(Math.max(X(dist), 50), 950), y: last ? 22 : 34, "text-anchor": "middle", class: last ? "grisu-pocket-label-red" : "grisu-pocket-label-muted", text });
  });
  const verdict = mode === "round"
    ? (wd.walk.length ? `moved ${wd.walk.length} step${wd.walk.length === 1 ? "" : "s"} toward W` : "no move")
    : wd.ambiguous ? "ambiguous: reject" : wd.safe ? "inside the safe zone: accept" : "outside the safe zone: reject";
  s(root, "text", { x: 500, y: 146, "text-anchor": "middle", class: mode === "weed" && !r.ok ? "grisu-pocket-label-red" : "grisu-pocket-label", text: verdict });
  el.replaceChildren(root);
}

function renderDebugger() {
  const steps = dbg.steps;
  const i = dbg.step;
  const st = steps[i];
  $("dbg-title").innerHTML = st.title;
  $("dbg-body").innerHTML = st.body;
  st.visual($("dbg-visual"));
  $("dbg-regs").innerHTML = `<tbody>${st.regs.map(([n, v, note]) => `<tr><th scope="row">${n}</th><td>${v}</td><td>${note ?? ""}</td></tr>`).join("")}</tbody>`;
  $("dbg-hex").innerHTML = st.hex.length ? `<table>${st.hex.map(([n, v]) => `<tr><th>${n}</th><td>${v}</td></tr>`).join("")}</table>` : "<p>No new registers in this step.</p>";
  const code = $("dbg-code");
  code.innerHTML = CODE.map((line, k) => {
    const n = k + 1;
    const note = st.notes?.[n];
    const hl = st.lines.includes(n);
    return `<span class="grisu-pocket-line${hl ? " hl" : ""}"><span class="grisu-pocket-ln">${n}</span>${esc(line)}${note ? `  <span class="grisu-pocket-live">// ${esc(note)}</span>` : ""}</span>`;
  }).join("");
  const first = code.querySelector(".hl");
  if (first && code.scrollHeight > code.clientHeight + 4) {
    const delta = first.getBoundingClientRect().top - code.getBoundingClientRect().top;
    code.scrollTop = Math.max(0, code.scrollTop + delta - 40);
  }
  $("dbg-counter").textContent = `Step ${i + 1} of ${steps.length}: ${st.short}`;
  $("dbg-prev").disabled = i === 0;
  $("dbg-next").disabled = i === steps.length - 1;
  for (const b of $("dbg-steps").querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.value) === i));
  setParam("step", i);
}
function setDebugger(text, step = 0) {
  const v0 = parseNumber(text);
  const err = checkDouble(v0);
  if (err) { $("dbg-counter").textContent = err; return; }
  dbg.v = Math.abs(v0);
  dbg.text = text.trim();
  dbg.r = M.grisu3(dbg.v);
  dbg.steps = buildSteps(dbg.r);
  dbg.step = Math.max(0, Math.min(step, dbg.steps.length - 1));
  setParam("d", dbg.text);
  pressChip($("dbg-chips"), dbg.text);
  const bar = $("dbg-steps");
  bar.textContent = "";
  dbg.steps.forEach((st, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = st.short;
    b.dataset.value = String(k);
    b.addEventListener("click", () => { dbg.step = k; renderDebugger(); });
    bar.appendChild(b);
  });
  renderDebugger();
}
function initDebugger() {
  chips($("dbg-chips"), DBG_PRESETS, (item) => { $("dbg-input").value = ""; setDebugger(item.value); });
  $("dbg-form").addEventListener("submit", (e) => { e.preventDefault(); setDebugger($("dbg-input").value); });
  $("dbg-prev").addEventListener("click", () => { if (dbg.step > 0) { dbg.step--; renderDebugger(); } });
  $("dbg-next").addEventListener("click", () => { if (dbg.step < dbg.steps.length - 1) { dbg.step++; renderDebugger(); } });
  document.querySelector(".grisu-pocket-debugger").addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea")) return;
    if (e.key === "ArrowRight" && dbg.step < dbg.steps.length - 1) { dbg.step++; renderDebugger(); e.preventDefault(); }
    if (e.key === "ArrowLeft" && dbg.step > 0) { dbg.step--; renderDebugger(); e.preventDefault(); }
  });
  setDebugger(params.get("d") ?? "0.3", Number(params.get("step")) || 0);
}

// ---------------------------------------------------------------------------
// Closing: contracts and the sampler

function renderContracts() {
  const inputs = [["1", 1], ["0.3", 0.3], ["0.1+0.2", 0.1 + 0.2], ["1e23", 1e23], ["5e-324", 5e-324]];
  $("contract-rows").innerHTML = inputs.map(([label, v]) => {
    const g1 = M.grisu1(v);
    const g2 = M.grisu2(v);
    const g3 = M.grisu3(v);
    const js = M.jsDigits(v);
    const g2s = M.stripZeros(g2.digits, g2.exp10);
    const g2note = g2s.digits.length > js.digits.length ? " (not shortest)" : g2s.digits !== js.digits ? " (not closest)" : "";
    const g3text = g3.ok ? `<code>${g3.digits}e${minus(g3.decimalExponent)}</code>` : `rejected → fallback <code>${esc(g3.fallback.text)}</code>`;
    return `<tr><th scope="row">${label}</th><td><code>${g1.digits}e${minus(g1.exponent)}</code></td><td><code>${g2.digits}e${minus(g2.exp10)}</code>${g2note}</td><td>${g3text}</td></tr>`;
  }).join("");
}
function initSampler() {
  const btn = $("sample-run");
  btn.addEventListener("click", () => {
    btn.disabled = true;
    const N = 10000;
    const tally = { n: 0, ok: 0, round: 0, weed: 0, wrong: 0, g2short: 0, g2close: 0 };
    const view = new DataView(new ArrayBuffer(8));
    const words = new Uint32Array(2);
    const chunk = () => {
      const end = Math.min(N, tally.n + 400);
      while (tally.n < end) {
        crypto.getRandomValues(words);
        view.setUint32(0, words[0] & 0x7fffffff);
        view.setUint32(4, words[1]);
        const v = view.getFloat64(0);
        if (!(v > 0 && Number.isFinite(v))) continue;
        tally.n++;
        const js = M.jsDigits(v);
        const r = M.grisu3(v);
        if (r.ok) {
          tally.ok++;
          const d = M.stripZeros(r.digits, r.decimalExponent);
          if (d.digits !== js.digits || d.exp10 !== js.exp10) tally.wrong++;
        } else tally[r.reason]++;
        const g2 = M.grisu2(v);
        const d2 = M.stripZeros(g2.digits, g2.exp10);
        if (d2.digits.length === js.digits.length) tally.g2short++;
        if (d2.digits === js.digits && d2.exp10 === js.exp10) tally.g2close++;
      }
      $("sample-progress").textContent = `${tally.n} / ${N}`;
      const pct = (k) => (100 * k / tally.n).toFixed(2) + "%";
      $("sample-readout").innerHTML = `Grisu3: ${tally.ok} accepted, ${tally.round} rejected by the closeness test, ${tally.weed} by the safe-zone test (${pct(tally.round + tally.weed)} rejected). ` +
        `Wrong accepted outputs: <strong>${tally.wrong}</strong>. Grisu2 (no rounding): shortest ${pct(tally.g2short)}, shortest and closest ${pct(tally.g2close)}.`;
      if (tally.n < N) setTimeout(chunk, 0);
      else { btn.disabled = false; btn.textContent = "Run another 10,000"; }
    };
    chunk();
  });
}

// ---------------------------------------------------------------------------

function init() {
  initPark();
  initCard();
  initMap();
  initDebugger();
  renderContracts();
  initSampler();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
init();
