// Copyright (C) 2026 Toit contributors.
//
// DOM code for explore/grisu-blur.html ("Blurry fences").

import {
  grisu3, grisu3Quick, grisu2, grisu1, exactAnswer, structuralReason, stripZeros, sciText, decimalText,
  rat, radd, rsub, rhalf, rcmp, rnum, roff, makeRandom, parseInput, powerQ,
  PRESETS, SWEEP, SWEEP_N, SWEEP_FLOOR, SWEEP_G2, Q_MIN, Q_MAX, Q_LIBRARY,
} from "./grisu-blur-model.js";

const SVGNS = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function newSvg(box, height, minWidth = 280) {
  const width = Math.max(minWidth, Math.floor(box.clientWidth || minWidth));
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "gb-svg", "aria-hidden": "true" });
  const keep = [...box.children].filter((c) => c.tagName !== "svg");
  box.replaceChildren(svg, ...keep);
  return { svg, width };
}

const SUP = { "-": "⁻", "+": "⁺", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");
const minus = (s) => String(s).replace(/-/g, "−");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Compact number of units. */
function fmtU(x, digits = 3) {
  if (!Number.isFinite(x)) return "∞";
  const a = Math.abs(x);
  if (a >= 1e7) {
    const [m, e] = x.toExponential(2).split("e");
    return `${minus(m)}·10${sup(Number(e))}`;
  }
  const r = Number(x.toFixed(digits));
  return minus(String(r));
}
const fmtS = (x, digits = 3) => (x > 0 ? "+" : "") + fmtU(x, digits);
function fmtBig(n) {
  const s = n.toString();
  return s.length > 12 ? fmtU(Number(n)) : s;
}
function pow10Text(log10) {
  const e = Math.floor(log10);
  const m = 10 ** (log10 - e);
  return `${m.toFixed(1)}·10${sup(e)}`;
}
function shortDigits(d) {
  return d.length <= 7 ? d : `…${d.slice(-4)}`;
}
const hexQ = (f, q) => f.toString(16).toUpperCase().padStart(Math.ceil(q / 4), "0");
const rmulInt = (a, j) => ({ n: a.n * BigInt(j), d: a.d });

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const state = { text: "0.3", x: 0.3, q: 64, mode: "g3", step: 0 };
let T = null; // Grisu3 trace
let G2 = null; // Grisu2 trace
let steps = [];

function readParams(p) {
  const text = p.get("x");
  if (text) {
    const v = parseInput(text);
    if (v !== null) { state.text = text; state.x = v; }
  }
  const q = Number(p.get("q"));
  if (Number.isInteger(q) && q >= Q_MIN && q <= Q_MAX) state.q = q;
  state.mode = p.get("mode") === "g2" ? "g2" : "g3";
  recompute();
  state.step = resolveStep(p.get("step"));
}

function resolveStep(name) {
  if (name === null || name === undefined || name === "") return 0;
  const n = Number(name);
  if (Number.isInteger(n)) return Math.max(0, Math.min(steps.length - 1, n));
  const find = (kind) => steps.findIndex((s) => s.kind === kind);
  let i = -1;
  if (name === "digit") i = find(state.mode === "g2" ? "g2digit" : "digit");
  else if (name === "walk") { i = find("walk"); if (i < 0) i = find("closest"); }
  else if (name === "verdict") i = steps.length - 1;
  else i = find(name);
  return i < 0 ? steps.length - 1 : i;
}

function writeParams() {
  const p = new URLSearchParams();
  p.set("x", state.text);
  if (state.q !== Q_LIBRARY) p.set("q", String(state.q));
  if (state.mode === "g2") p.set("mode", "g2");
  if (state.step) p.set("step", String(state.step));
  window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}${window.location.hash}`);
}

function recompute() {
  T = grisu3(state.x, state.q);
  G2 = grisu2(state.x, state.q);
  steps = buildSteps();
  if (state.step >= steps.length) state.step = steps.length - 1;
}

function buildSteps() {
  const s = [{ kind: "exact", name: "Exact interval", line: "exact" }, { kind: "blur", name: "Computed: blurred", line: "blur" }];
  if (state.mode === "g3") {
    s.push({ kind: "outer", name: "Two intervals", line: "outer" });
    T.steps.forEach((d, i) => s.push({ kind: "digit", i, name: `Digit ${i + 1}`, line: d.phase === "int" ? (d.hit ? "int-stop" : "int") : (d.hit ? "frac-stop" : "frac") }));
    for (let j = 1; j < T.walk.length; j++) s.push({ kind: "walk", j, name: `Walk ${j}`, line: "walk" });
    s.push({ kind: "closest", name: "Closest?", line: T.ambiguous ? "closest" : "walk-stop" });
    if (!T.ambiguous) s.push({ kind: "weed", name: "Safe zone?", line: "weed" });
    s.push({ kind: "verdict", name: "Verdict", line: T.ok ? "weed" : T.ambiguous ? "closest" : "weed" });
  } else {
    s.push({ kind: "inner", name: "Shrunk interval", line: "g2-inner" });
    if (!G2.empty) G2.steps.forEach((d, i) => s.push({ kind: "g2digit", i, name: `Digit ${i + 1}`, line: d.hit ? "g2-stop" : "g2-digit" }));
    s.push({ kind: "g2verdict", name: "Result", line: "g2-done" });
  }
  return s;
}

// ---------------------------------------------------------------------------
// Scene: what the current step shows (positions are rationals in units)
// ---------------------------------------------------------------------------

function scene() {
  const st = steps[state.step];
  const g3 = state.mode === "g3";
  const idx = state.step;
  const sc = {
    st, g3,
    showBlur: idx >= 1,
    showOuter: g3 && idx >= 2,
    showInner: !g3 && idx >= 2 && !G2.empty,
    cands: [], ghosts: [], grid: null, rest: null, width: null, mid: null, wEdges: false, arrow: null, final: null,
  };
  const tooHigh = rat(T.tooHigh), tooLow = rat(T.tooLow);
  if (st.kind === "digit") {
    const d = T.steps[st.i];
    const cand = rsub(tooHigh, rat(d.rest, d.unit));
    sc.grid = { base: cand, step: rat(d.tenKappa, d.unit), digits: d.digits };
    sc.cands.push({ x: cand, digits: d.digits });
    sc.rest = { from: cand, to: tooHigh, label: "rest" };
    sc.width = { from: tooLow, to: tooHigh, label: "unsafe" };
  } else if (st.kind === "walk") {
    const cur = T.walk[st.j], prev = T.walk[st.j - 1];
    sc.grid = { base: cur.at, step: T.tenKappa, digits: cur.digits };
    sc.cands.push({ x: cur.at, digits: cur.digits });
    sc.ghosts.push({ x: prev.at, digits: prev.digits });
    sc.arrow = { from: prev.at, to: cur.at };
    sc.wEdges = true;
  } else if (st.kind === "closest" || st.kind === "weed" || st.kind === "verdict") {
    const last = T.walk[T.walk.length - 1];
    sc.grid = { base: last.at, step: T.tenKappa, digits: last.digits };
    sc.cands.push({ x: last.at, digits: last.digits, final: st.kind !== "closest" ? T.verdict : null });
    sc.wEdges = true;
    const W = rat(T.W.f);
    const neighbor = rcmp(last.at, W) > 0 ? rsub(last.at, T.tenKappa) : radd(last.at, T.tenKappa);
    sc.mid = rhalf(radd(last.at, neighbor));
    if (st.kind !== "closest") sc.rest = { from: last.at, to: tooHigh, label: "rest" };
  } else if (st.kind === "g2digit" || st.kind === "g2verdict") {
    if (!G2.empty) {
      const Mp = rat(G2.Mp);
      const d = st.kind === "g2digit" ? G2.steps[st.i] : G2.steps[G2.steps.length - 1];
      const cand = rsub(Mp, d.rest);
      sc.grid = { base: cand, step: d.tenKappa, digits: d.digits };
      sc.cands.push({ x: cand, digits: d.digits, final: st.kind === "g2verdict" ? "g2" : null });
      sc.rest = { from: cand, to: Mp, label: "rest" };
      sc.width = { from: rat(G2.Mm), to: Mp, label: "δ" };
    }
  }
  return sc;
}

// ---------------------------------------------------------------------------
// Ruler drawing (shared by the main ruler and the loupes)
// ---------------------------------------------------------------------------

function markerList(sc) {
  const list = [
    { x: T.ex.mMinus, label: "m⁻", kind: "exact" },
    { x: T.ex.v, label: "v", kind: "exact" },
    { x: T.ex.mPlus, label: "m⁺", kind: "exact" },
  ];
  if (sc.showBlur) {
    list.push({ x: rat(T.LO.f), label: "LO", kind: "comp" }, { x: rat(T.W.f), label: "W", kind: "comp" }, { x: rat(T.HI.f), label: "HI", kind: "comp" });
  }
  return list;
}

/** Greedy lane placement for labels. items: {px, text, cls}. */
function placeLabels(g, items, ys, width) {
  const lanes = ys.map(() => []);
  const sorted = items.slice().sort((a, b) => (a.pri ?? 0) - (b.pri ?? 0) || a.px - b.px);
  for (const it of sorted) {
    const w = it.text.length * 6.6 + 6;
    let x0 = Math.max(2, Math.min(width - w - 2, it.px - w / 2));
    let lane = lanes.findIndex((l) => l.every(([a, b]) => x0 + w < a || x0 > b));
    if (lane < 0) continue;
    lanes[lane].push([x0, x0 + w]);
    g.append(el("text", { x: x0 + w / 2, y: ys[lane], "text-anchor": "middle", class: `gb-halo ${it.cls}` }, it.text));
  }
}

/** Merge markers that are closer than `px` pixels into one label. */
function clusterLabels(items, px) {
  const sorted = items.slice().sort((a, b) => a.px - b.px);
  const out = [];
  for (const it of sorted) {
    const lastC = out[out.length - 1];
    if (lastC && it.px - lastC.pxEnd < px) {
      lastC.texts.push(it.text);
      lastC.pxEnd = it.px;
      if (it.cls.includes("exact")) lastC.cls = it.cls;
    } else out.push({ px: it.px, pxEnd: it.px, texts: [it.text], cls: it.cls, pri: it.pri });
  }
  return out.map((c) => ({ px: (c.px + c.pxEnd) / 2, text: c.texts.join(" ≈ "), cls: c.cls, pri: c.pri }));
}

let gradCounter = 0;
function blurGradient(svg) {
  const id = `gb-grad-${++gradCounter}`;
  const defs = el("defs");
  const lg = el("linearGradient", { id, x1: "0", x2: "1", y1: "0", y2: "0" });
  lg.append(el("stop", { offset: "0", style: "stop-color: var(--blue); stop-opacity: .04" }));
  lg.append(el("stop", { offset: "0.5", style: "stop-color: var(--blue); stop-opacity: .5" }));
  lg.append(el("stop", { offset: "1", style: "stop-color: var(--blue); stop-opacity: .04" }));
  defs.append(lg);
  svg.append(defs);
  return `url(#${id})`;
}

/**
 * Draws one ruler. view = {anchor (rat), lo, hi (Number offsets), x0, x1 (px)}.
 * layout = {labelYs, top, bottom, axisY, candYs, bracketYs}.
 */
function drawRuler(svg, sc, view, layout, opts = {}) {
  const { anchor, lo, hi, x0, x1 } = view;
  const sx = (off) => x0 + ((off - lo) / (hi - lo)) * (x1 - x0);
  const px = (r) => sx(roff(r, anchor));
  const pxPerUnit = (x1 - x0) / (hi - lo);
  const clampX = (x) => Math.max(x0, Math.min(x1, x));
  const inView = (x) => x >= x0 - 0.5 && x <= x1 + 0.5;
  const { top, bottom, axisY } = layout;
  const g = el("g");
  svg.append(g);
  const fill = blurGradient(svg);
  const width = x1 + x0;

  // Unit ticks (loupes only).
  if (opts.unitTicks) {
    const maxChars = Math.max(fmtS(lo + opts.unitLabelOffset, 0).length, fmtS(hi + opts.unitLabelOffset, 0).length);
    const step = [1, 2, 5, 10].find((s) => s * pxPerUnit >= maxChars * 6.6 + 6) ?? 10;
    const c0 = Math.ceil(lo), c1 = Math.floor(hi);
    for (let u = c0; u <= c1; u++) {
      const x = sx(u);
      g.append(el("line", { x1: x, x2: x, y1: top, y2: axisY, class: "gb-unit-tick" }));
      if ((u + opts.unitLabelOffset) % step === 0) g.append(el("text", { x, y: axisY + 13, "text-anchor": "middle", class: "gb-axis-label" }, fmtS(u + opts.unitLabelOffset, 0)));
    }
  }

  // Intervals.
  const rect = (a, b, cls, inset = 0) => {
    const xa = clampX(px(a)), xb = clampX(px(b));
    if (xb - xa <= 0) return null;
    const r = el("rect", { x: xa, y: top + inset, width: xb - xa, height: bottom - top - 2 * inset, class: cls });
    g.append(r);
    return [xa, xb];
  };
  if (sc.showOuter) {
    const o = rect(rat(T.tooLow), rat(T.tooHigh), "gb-outer");
    const s = rect(rat(T.tooLow + 4n), rat(T.tooHigh - 2n), "gb-safe", 9);
    if (!opts.loupe) {
      if (o && o[1] - o[0] > 150 && !opts.unitTicks) g.append(el("text", { x: o[0] + 5, y: top + 8 + 0, class: "gb-axis-title" }, "search interval"));
      if (s && s[1] - s[0] > 110) g.append(el("text", { x: s[0] + 5, y: bottom - 13, class: "gb-axis-title" }, "safe zone (certain)"));
    }
    for (const [r, name] of [[rat(T.tooLow), "too_low"], [rat(T.tooHigh), "too_high"], [rat(T.tooLow + 4n), "+4"], [rat(T.tooHigh - 2n), "−2"]]) {
      if (opts.unitTicks && inView(px(r))) {
        const x = px(r);
        const safeEdge = name === "+4" || name === "−2";
        g.append(el("text", { x: x + (name === "too_low" || name === "+4" ? 3 : -3), y: safeEdge ? bottom - 13 : top + 10, "text-anchor": name === "too_low" || name === "+4" ? "start" : "end", class: "gb-halo gb-lbl-muted", "font-size": 10 }, safeEdge ? (name === "+4" ? "too_low+4" : "too_high−2") : name));
      }
    }
  }
  if (sc.showInner) {
    const r = rect(rat(G2.Mm), rat(G2.Mp), "gb-inner");
    if (!opts.loupe && !opts.unitTicks && r && r[1] - r[0] > 150) g.append(el("text", { x: r[0] + 5, y: top + 10, class: "gb-axis-title" }, "Grisu2’s shrunk interval [M⁻, M⁺]"));
    if (opts.unitTicks) {
      for (const [v, name] of [[rat(G2.Mm), "M⁻ = LO+1"], [rat(G2.Mp), "M⁺ = HI−1"]]) {
        const x = px(v);
        if (inView(x)) g.append(el("text", { x: x + (name.startsWith("M⁻") ? 3 : -3), y: bottom - 6, "text-anchor": name.startsWith("M⁻") ? "start" : "end", class: "gb-halo gb-lbl-comp", "font-size": 10 }, name));
      }
    }
  }

  // Axis.
  g.append(el("line", { x1: x0, x2: x1, y1: axisY, y2: axisY, class: "gb-axis" }));
  if (!opts.unitTicks) {
    const span = hi - lo;
    const raw = span / 6;
    const p = 10 ** Math.floor(Math.log10(raw));
    const stepT = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? p * 10;
    for (let t = Math.ceil(lo / stepT) * stepT; t <= hi; t += stepT) {
      const x = sx(t);
      g.append(el("line", { x1: x, x2: x, y1: axisY, y2: axisY + 4, class: "gb-axis-tick" }));
      g.append(el("text", { x, y: axisY + 15, "text-anchor": "middle", class: "gb-axis-label" }, t === 0 ? "0" : fmtS(t, 0)));
    }
  }

  // Candidate grid.
  if (sc.grid) {
    const ob = roff(sc.grid.base, anchor);
    const stepN = rnum(sc.grid.step);
    const jl = Math.ceil((lo - ob) / stepN) - 1, jh = Math.floor((hi - ob) / stepN) + 1;
    if (jh - jl <= 80) {
      for (let j = jl; j <= jh; j++) {
        if (j === 0) continue;
        const x = px(radd(sc.grid.base, rmulInt(sc.grid.step, j)));
        if (!inView(x)) continue;
        g.append(el("line", { x1: x, x2: x, y1: top - 4, y2: bottom + 4, class: "gb-cand-grid" }));
        const digits = (BigInt(sc.grid.digits) + BigInt(j)).toString();
        if (opts.candLabels !== false) sc._candLabelItems.push({ px: x, text: shortDigits(digits), cls: "gb-lbl-cand gb-lbl-muted", pri: 2 });
      }
    }
  }
  for (const c of sc.ghosts) {
    const x = px(c.x);
    if (inView(x)) g.append(el("line", { x1: x, x2: x, y1: top - 6, y2: bottom + 6, class: "gb-cand-ghost" }));
  }

  // Midpoint between the two closest candidates.
  if (sc.mid) {
    const x = px(sc.mid);
    if (inView(x)) {
      g.append(el("line", { x1: x, x2: x, y1: top - 2, y2: bottom + 2, class: "gb-mid" }));
      sc._topLabelItems.push({ px: x, text: "midpoint", cls: "gb-lbl-cand", pri: 3 });
    }
  }

  // Computed values with their blur.
  if (sc.showBlur) {
    for (const m of markerList(sc).filter((m) => m.kind === "comp")) {
      const xa = px(rsub(m.x, rat(1n))), xb = px(radd(m.x, rat(1n))), xc = px(m.x);
      if (xb < x0 || xa > x1) continue;
      if (xb - xa >= 3) {
        const a = clampX(xa), b = clampX(xb);
        g.append(el("rect", { x: a, y: top + 16, width: b - a, height: bottom - top - 32, fill, class: "gb-blurband" }));
        if (opts.unitTicks) {
          if (inView(xa)) g.append(el("line", { x1: xa, x2: xa, y1: top + 16, y2: bottom - 16, class: "gb-blur-edge" }));
          if (inView(xb)) g.append(el("line", { x1: xb, x2: xb, y1: top + 16, y2: bottom - 16, class: "gb-blur-edge" }));
        }
      }
      if (inView(xc)) g.append(el("line", { x1: xc, x2: xc, y1: top + 6, y2: bottom - 6, class: "gb-comp" }));
    }
  }

  // W's blur edges: W + 1 and W - 1 as a bracket (RoundWeed aims at these).
  if (sc.wEdges && opts.unitTicks) {
    const W = rat(T.W.f);
    const xa = px(rsub(W, rat(1n))), xb = px(radd(W, rat(1n)));
    const y = bottom + 4;
    if (inView(xa) || inView(xb)) {
      g.append(el("path", { d: `M${clampX(xa)},${y + 4} V${y} H${clampX(xb)} V${y + 4}`, class: "gb-bracket gb-bracket-w" }));
      if (inView(xa)) sc._candLabelItems.push({ px: xa, text: "W−1", cls: "gb-lbl-comp", pri: 1 });
      if (inView(xb)) sc._candLabelItems.push({ px: xb, text: "W+1", cls: "gb-lbl-comp", pri: 1 });
    }
  }

  // Exact values: crisp.
  for (const m of markerList(sc).filter((m) => m.kind === "exact")) {
    const x = px(m.x);
    if (!inView(x)) continue;
    g.append(el("line", { x1: x, x2: x, y1: top - 4, y2: bottom + 4, class: "gb-exact" }));
    if (m.label === "v") g.append(el("circle", { cx: x, cy: (top + bottom) / 2, r: 3.5, class: "gb-exact-v" }));
  }

  // Current candidate(s).
  for (const c of sc.cands) {
    const x = px(c.x);
    if (inView(x)) {
      g.append(el("line", { x1: x, x2: x, y1: top - 8, y2: bottom + 8, class: "gb-cand" }));
      g.append(el("circle", { cx: x, cy: axisY, r: 4.5, class: `gb-cand-dot${c.final === "ok" || c.final === "g2" ? " gb-ok" : ""}` }));
      sc._candLabelItems.push({ px: x, text: shortDigits(c.digits), cls: "gb-lbl-cand", pri: 0 });
    } else if (!opts.loupe) {
      // Off-scale candidate: arrow at the edge.
      const left = x < x0;
      const xe = left ? x0 + 2 : x1 - 2;
      const dist = left ? roff(rat(T.tooLow), c.x) : roff(c.x, rat(T.tooHigh));
      g.append(el("path", { d: left ? `M${xe + 14},${axisY} H${xe} m6,-4 l-6,4 l6,4` : `M${xe - 14},${axisY} H${xe} m-6,-4 l6,4 l-6,4`, class: "gb-arrow" }));
      sc._candLabelItems.push({ px: left ? x0 + 90 : x1 - 90, text: `${shortDigits(c.digits)}: ${fmtU(dist, 0)} u ${left ? "below too_low" : "above"}`, cls: "gb-lbl-cand", pri: 0 });
    }
  }

  // Walk arrow.
  if (sc.arrow && !opts.loupe) {
    const xa = px(sc.arrow.from), xb = px(sc.arrow.to);
    if (Math.abs(xa - xb) > 12) {
      const y = top - 14;
      g.append(el("path", { d: `M${xa},${y} C${xa},${y - 8} ${xb},${y - 8} ${xb},${y - 1}`, class: "gb-arrow" }));
      g.append(el("path", { d: `M${xb - 4},${y - 5} L${xb},${y} L${xb + 4},${y - 5}`, class: "gb-arrow" }));
    }
  }

  // Brackets: rest and unsafe / delta.
  const bracket = (br, y, cls, labelCls) => {
    const xa = px(br.from), xb = px(br.to);
    const a = clampX(xa), b = clampX(xb);
    if (b - a < 1) return;
    g.append(el("path", { d: `M${a},${y - 5} V${y} H${b} V${y - 5}`, class: `gb-bracket ${cls}` }));
    if (xa < x0) g.append(el("path", { d: `M${a + 6},${y - 4} L${a},${y} L${a + 6},${y + 4}`, class: `gb-bracket ${cls}` }));
    const lx = Math.max(a + 30, Math.min(b - 30, (a + b) / 2));
    g.append(el("text", { x: lx, y: y + 12, "text-anchor": "middle", class: `gb-halo ${labelCls}` }, br.label + (br.value ? ` = ${br.value}` : "")));
  };
  if (layout.bracketYs) {
    if (sc.rest) bracket({ ...sc.rest, value: fmtU(roff(sc.rest.to, sc.rest.from)) + " u" }, layout.bracketYs[0], "gb-bracket-rest", "gb-lbl-cand");
    if (sc.width) bracket({ ...sc.width, value: fmtU(roff(sc.width.to, sc.width.from)) + " u" }, layout.bracketYs[1], "gb-bracket-unsafe", "gb-lbl-comp");
  }

  // Labels.
  const top0 = markerList(sc).map((m) => ({ px: px(m.x), text: m.label, cls: m.kind === "exact" ? "gb-lbl-exact" : "gb-lbl-comp", pri: m.kind === "exact" ? 0 : 1 }))
    .filter((it) => inView(it.px));
  const tops = opts.loupe ? [...top0, ...sc._topLabelItems] : clusterLabels([...top0, ...sc._topLabelItems], 14);
  placeLabels(g, tops, layout.labelYs, width);
  placeLabels(g, sc._candLabelItems, layout.candYs, width);
  return { pxPerUnit, sx };
}

// ---------------------------------------------------------------------------
// Main ruler + loupes
// ---------------------------------------------------------------------------

function mainView(width) {
  const W = rat(T.W.f);
  const lo0 = roff(rat(T.tooLow), W), hi0 = roff(rat(T.tooHigh), W);
  const pad = Math.max((hi0 - lo0) * 0.1, 1.5);
  return { anchor: W, lo: lo0 - pad, hi: hi0 + pad, x0: 12, x1: width - 12 };
}

function renderRuler() {
  const box = $("gb-ruler");
  const { svg, width } = newSvg(box, 232);
  const sc = scene();
  sc._topLabelItems = []; sc._candLabelItems = [];
  const view = mainView(width);
  const layout = { labelYs: [14, 28, 42], top: 60, bottom: 132, axisY: 138, candYs: [166, 180], bracketYs: [200, 222] };
  const fine = (view.x1 - view.x0) / (view.hi - view.lo) >= 12;
  const r = drawRuler(svg, sc, view, layout, fine ? { unitTicks: true, unitLabelOffset: 0 } : {});
  sc._main = r;
  // Loupe windows.
  const loupes = loupeWindows(sc);
  const mag = loupeMagnification(r.pxPerUnit, width);
  if (mag >= 3) {
    for (const L of loupes) {
      const a = r.sx(roff(L.center, view.anchor) - L.hw), b = r.sx(roff(L.center, view.anchor) + L.hw);
      const w = Math.max(6, b - a), cx = (a + b) / 2;
      svg.append(el("rect", { x: cx - w / 2, y: layout.top - 10, width: w, height: layout.bottom - layout.top + 20, rx: 3, class: "gb-loupemark" }));
      svg.append(el("text", { x: cx, y: layout.bottom + 20, "text-anchor": "middle", class: "gb-loupemark-label gb-halo" }, L.key));
    }
  }
  renderLoupes(sc, loupes, mag, r.pxPerUnit);
}

const LOUPE_HW = 5.5;
function loupeWindows(sc) {
  const g3 = state.mode === "g3";
  const loC = g3 ? rat(T.tooLow + 2n) : rat(T.LO.f + 1n);
  const hiC = g3 ? rat(T.tooHigh - 2n) : rat(T.HI.f - 1n);
  const W = rat(T.W.f);
  return [
    { key: "1", title: "Lower fence", center: loC, hw: LOUPE_HW, which: "lo", ref: g3 ? T.tooLow : T.LO.f + 1n, refName: g3 ? "too_low" : "M⁻" },
    { key: "2", title: "W and v", center: W, hw: LOUPE_HW, which: "w", ref: T.W.f, refName: "W" },
    { key: "3", title: "Upper fence", center: hiC, hw: LOUPE_HW, which: "hi", ref: g3 ? T.tooHigh : T.HI.f - 1n, refName: g3 ? "too_high" : "M⁺" },
  ];
}

function loupeMagnification(mainPxPerUnit, width) {
  const loupeWidth = width >= 700 ? (width - 24) / 3 : width;
  const loupePxPerUnit = (loupeWidth - 20) / (2 * LOUPE_HW);
  return loupePxPerUnit / mainPxPerUnit;
}

function renderLoupes(sc, loupes, mag) {
  const host = $("gb-loupes");
  host.replaceChildren();
  if (mag < 3) {
    const p = document.createElement("p");
    p.className = "gb-loupes-note";
    p.textContent = `At q = ${state.q} a unit is ${fmtU(1 / (rnum(rat(T.unsafe0))) * 100, 2)}% of the search interval: the ±1-unit blur is visible at full scale, no loupe needed.`;
    host.append(p);
    return;
  }
  for (const L of loupes) {
    const card = document.createElement("div");
    card.className = "gb-loupe";
    const head = document.createElement("div");
    head.className = "gb-loupe-head";
    head.innerHTML = `<span>${L.key} · ${L.title}</span><span>×${mag < 1e5 ? Math.round(mag).toLocaleString("en-US") : fmtU(mag)}</span>`;
    const box = document.createElement("div");
    box.className = "gb-svgbox";
    const note = document.createElement("p");
    note.className = "gb-loupe-note";
    card.append(head, box, note);
    host.append(card);
    const { svg, width } = newSvg(box, 174, 200);
    const sub = { ...sc, _topLabelItems: [], _candLabelItems: [] };
    // Anchor at an integer unit, so unit ticks are integers.
    const centerOff = roff(L.center, rat(T.W.f));
    const anchorBig = T.W.f + BigInt(Math.round(centerOff));
    const anchorInt = rat(anchorBig);
    const offC = roff(L.center, anchorInt);
    const view = { anchor: anchorInt, lo: offC - L.hw, hi: offC + L.hw, x0: 10, x1: width - 10 };
    drawRuler(svg, sub, view, { labelYs: [12, 24, 36], top: 48, bottom: 110, axisY: 116, candYs: [155, 168], bracketYs: null }, { unitTicks: true, loupe: true, unitLabelOffset: Number(anchorBig - L.ref) });
    svg.append(el("text", { x: width - 8, y: 141, "text-anchor": "end", class: "gb-axis-title" }, `units from ${L.refName}`));
    note.textContent = loupeNote(L, sc);
  }
}

function loupeNote(L, sc) {
  const d = (a, b) => fmtS(roff(a, b));
  const cand = sc.cands[0]?.x;
  if (L.which === "lo") {
    let s = `LO − m⁻ = ${d(rat(T.LO.f), T.ex.mMinus)} u.`;
    if (cand && Math.abs(roff(cand, rat(T.tooLow))) < 12) s += ` Candidate − too_low = ${d(cand, rat(T.tooLow))} u (needs ≥ 4).`;
    else if (state.mode === "g3") s += " too_low = LO − 1; safe from too_low + 4.";
    return s;
  }
  if (L.which === "hi") {
    let s = `HI − m⁺ = ${d(rat(T.HI.f), T.ex.mPlus)} u.`;
    if (cand && Math.abs(roff(rat(T.tooHigh), cand)) < 12) s += ` too_high − candidate = ${d(rat(T.tooHigh), cand)} u (needs ≥ 2).`;
    else if (state.mode === "g3") s += " too_high = HI + 1; safe up to too_high − 2.";
    return s;
  }
  let s = `W − v = ${d(rat(T.W.f), T.ex.v)} u.`;
  if (sc.mid) {
    const m = roff(sc.mid, rat(T.W.f));
    s += Math.abs(m) <= LOUPE_HW ? ` Midpoint − W = ${fmtS(m)} u: ${Math.abs(m) < 1 ? "inside W’s blur!" : "outside W’s blur."}` : ` The midpoint between candidates is ${fmtU(Math.abs(m), 1)} u away.`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Captions, verdict, ladder, readout
// ---------------------------------------------------------------------------

function unitReal() {
  return pow10Text(T.E * Math.log10(2) - T.c.k);
}

function captionHtml() {
  const st = steps[state.step];
  const u = (x) => `${fmtU(x)} u`;
  const width = roff(T.ex.mPlus, T.ex.mMinus);
  switch (st.kind) {
    case "exact":
      return `<strong>The exact interval.</strong> Scaled by 10${sup(T.c.k)}, the rounding interval of v runs from m⁻ to m⁺: ${u(width)} wide, where 1 unit = 2${sup(T.E)} of the scaled value. Any decimal strictly between them reads back as v. Grisu never computes these exact positions. They are drawn here, computed with BigInt, to check its work.`;
    case "blur": {
      const e = (a, b) => fmtS(roff(a, b));
      return `<strong>What Grisu actually has.</strong> The multiplication gives LO, W and HI, each within 1 unit of the truth (here LO − m⁻ = ${e(rat(T.LO.f), T.ex.mMinus)}, W − v = ${e(rat(T.W.f), T.ex.v)}, HI − m⁺ = ${e(rat(T.HI.f), T.ex.mPlus)}). Grisu cannot know these errors. All it knows is that each true value is somewhere in a ±1-unit blur.`;
    }
    case "outer":
      return `<strong>Two intervals.</strong> too_low = LO − 1 and too_high = HI + 1 are certainly outside, so the search interval [too_low, too_high] (unsafe = ${u(Number(T.unsafe0))}) certainly contains the true one. Candidates from too_low + 4 to too_high − 2 are certainly inside: the safe zone. In between, Grisu3 can’t tell.`;
    case "digit": {
      const d = T.steps[st.i];
      const rest = rnum(rat(d.rest, d.unit));
      const head = `<strong>Digit ${st.i + 1}: “${d.digit}”.</strong> Cut too_high down to a multiple of 10${sup(d.kappa)} (in scaled terms): candidate ${esc(shortDigits(d.digits))}·10${sup(d.kappa - T.c.k)}. rest = too_high − candidate = ${u(rest)}.`;
      return d.hit
        ? `${head} rest &lt; unsafe (${u(Number(T.unsafe0))}): the candidate is inside the search interval. By Theorem 6.2 no shorter decimal is, so the length is settled: ${d.digits.length} digit${d.digits.length > 1 ? "s" : ""}.`
        : `${head} rest ≥ unsafe (${u(Number(T.unsafe0))}): this candidate is below too_low. Take one more digit${T.steps[st.i + 1]?.phase === "frac" ? " (from the fraction: multiply it by 10, the bits that cross the binary point are the digit)" : ""}.`;
    }
    case "walk": {
      const cur = T.walk[st.j], prev = T.walk[st.j - 1];
      return `<strong>Walk toward W: ${esc(shortDigits(prev.digits))} → ${esc(shortDigits(cur.digits))}.</strong> The candidate was above W + 1 (the top of W’s blur), and the next lower candidate is still inside the search interval and closer to W + 1. Decrement the last digit: rest grows by 10${sup(T.stopKappa)} (${u(rnum(T.tenKappa))}).`;
    }
    case "closest": {
      const why = { reached: "the candidate is already at or below W + 1", edge: "the next lower candidate would fall below too_low", farther: "the next lower candidate would be farther from W + 1" }[T.walkStop];
      return T.ambiguous
        ? `<strong>Closest? Can’t tell.</strong> The walk stopped because ${why}. But measured from the other end of the blur, W − 1, the next lower candidate would be closer. The true v could be on either side of the midpoint. <strong>Reject: the closest candidate is ambiguous.</strong>`
        : `<strong>Closest: yes.</strong> The walk stopped because ${why}. Measured from W − 1 the answer is the same, so this candidate is closest wherever v really is inside the blur.`;
    }
    case "weed": {
      const above = roff(T.candidate, rat(T.tooLow)), below = roff(rat(T.tooHigh), T.candidate);
      const ok = T.verdict === "ok";
      return `<strong>In the safe zone?</strong> The candidate is ${u(below)} below too_high (needs ≥ 2) and ${u(above)} above too_low (needs ≥ 4). ${ok ? "Both hold: it certainly reads back as v." : "<strong>No: reject.</strong> It might lie outside the true interval, as far as Grisu3 can tell."}`;
    }
    case "verdict":
      return verdictSentence();
    case "inner":
      return G2.empty
        ? `<strong>Grisu2 shrinks the interval</strong> to [LO + 1, HI − 1], but at q = ${state.q} that is empty: Grisu2 needs q ≥ p + 3 = 56 bits.`
        : `<strong>Grisu2 shrinks the interval</strong> to M⁻ = LO + 1 and M⁺ = HI − 1, which are certainly inside. δ = M⁺ − M⁻ = ${u(Number(G2.delta0))}. Everything in there reads back, so no check is needed later. Anything in the margins is invisible to Grisu2.`;
    case "g2digit": {
      const d = G2.steps[st.i];
      const rest = rnum(d.rest);
      return `<strong>Digit ${st.i + 1}.</strong> Cut M⁺ down to a multiple of 10${sup(d.kappa)}: candidate ${esc(shortDigits(d.digits))}. rest = ${u(rest)} ${d.hit ? "≤" : ">"} δ = ${u(rnum(d.delta))}${d.hit ? ": inside the shrunk interval, stop." : ": not inside yet, next digit."}`;
    }
    case "g2verdict":
      return verdictSentence();
    default:
      return "";
  }
}

function verdictSentence() {
  const ex = exactAnswer(state.x);
  if (state.mode === "g2") {
    if (G2.empty) return `<strong>No output:</strong> at q = ${state.q} Grisu2’s shrunk interval is empty.`;
    const s = stripZeros(G2.digits, G2.exp10);
    const same = s.digits === ex.digits && s.exp10 === ex.exp10;
    const longer = s.digits.length > ex.digits.length;
    return `<strong>Grisu2 prints ${sciText(G2.digits, G2.exp10)}</strong> without any check, and it reads back as v. ${same ? "Here that is also the shortest, closest answer." : longer ? `But it is longer than the shortest answer, ${ex.text}, which lies in the blurred margin Grisu2 excluded.` : `Right length, but not the closest: the exact answer is ${ex.text}. The paper’s Grisu2 does not round the last digit.`}`;
  }
  if (T.ok) return `<strong>Certified.</strong> Grisu3 prints ${sciText(T.digits, T.exp10)} = ${decimalText(T.digits, T.exp10)}, proven shortest and closest, using only ${state.q}-bit integers.`;
  const structural = structuralReason(state.x);
  const truth = T.onBoundary
    ? "The candidate lies exactly on a fence. No precision could certify it."
    : T.ambiguous
      ? (structural === "tie"
        ? "Exact arithmetic shows why: the two candidates are exactly equally far from v. No precision could decide."
        : "Exact arithmetic can decide it; the blur around W was just too wide.")
      : T.trulyInside
        ? `Exact arithmetic shows the candidate was in fact inside, by ${fmtU(Math.min(roff(T.candidate, T.ex.mMinus), roff(T.ex.mPlus, T.candidate)))} u: a correct answer, rejected because Grisu3 could not prove it.`
        : "Exact arithmetic confirms it: the candidate is outside the true interval.";
  return `<strong>Too close to call.</strong> Grisu3 returns false; the exact fallback (BignumDtoa in double-conversion) prints <strong>${ex.text}</strong>. ${truth}`;
}

function renderVerdict() {
  const host = $("gb-verdict");
  const st = steps[state.step];
  if (st.kind !== "verdict" && st.kind !== "g2verdict") { host.replaceChildren(); return; }
  let badge;
  if (st.kind === "g2verdict") badge = `<span class="gb-badge gb-g2">${G2.empty ? "Grisu2 · no interval" : "Grisu2 · printed, unchecked"}</span>`;
  else if (T.ok) badge = `<span class="gb-badge gb-ok">Certified</span>`;
  else badge = `<span class="gb-badge gb-rej">Reject · ${T.verdict === "round" ? "closest ambiguous" : "outside safe zone"}</span> <span class="gb-badge">→ exact fallback: ${esc(exactAnswer(state.x).text)}</span>`;
  host.innerHTML = badge;
}

function renderLadder() {
  const host = $("gb-ladder");
  const st = steps[state.step];
  const g3 = state.mode === "g3";
  if (state.step < 2 || (!g3 && G2.empty)) { host.replaceChildren(); return; }
  if (g3 && st.kind === "outer") { host.replaceChildren(); return; }
  if (!g3 && st.kind === "inner") { host.replaceChildren(); return; }
  const rows = g3
    ? T.steps.map((d) => ({ digits: d.digits, kappa: d.kappa, rest: rnum(rat(d.rest, d.unit)), width: Number(T.unsafe0), hit: d.hit }))
    : G2.steps.map((d) => ({ digits: d.digits, kappa: d.kappa, rest: rnum(d.rest), width: rnum(d.delta), hit: d.hit }));
  let current = rows.length - 1;
  if (st.kind === "digit" || st.kind === "g2digit") current = st.i;
  const maxL = Math.log10(1 + Math.max(...rows.map((r) => Math.max(r.rest, r.width))));
  const bar = (x) => `${(Math.log10(1 + x) / maxL) * 100}%`;
  const wName = g3 ? "unsafe" : "δ";
  const test = g3 ? "rest &lt; unsafe?" : "rest ≤ δ?";
  let html = `<table><caption class="lab-sr-only">Digit ladder: digits of ${g3 ? "too_high" : "M⁺"}, one comparison per digit</caption><thead><tr><th>#</th><th>digits so far</th><th class="gb-num gb-hide-sm">κ</th><th class="gb-num">rest (u)</th><th class="gb-num gb-hide-sm gb-nocase">${wName} (u)</th><th>log scale</th><th class="gb-nocase">${test}</th></tr></thead><tbody>`;
  rows.forEach((r, i) => {
    const cls = i === current ? "gb-now" : i > current ? "gb-future" : "";
    html += `<tr class="${cls}"><td>${i + 1}</td><td class="gb-digits">${esc(r.digits)}</td><td class="gb-num gb-hide-sm">${minus(r.kappa)}</td><td class="gb-num">${fmtU(r.rest)}</td><td class="gb-num gb-hide-sm">${fmtU(r.width)}</td><td><div class="gb-bars" role="img" aria-label="rest ${fmtU(r.rest)}, ${wName} ${fmtU(r.width)}"><i class="gb-bar-rest" style="width:${bar(r.rest)}"></i><i class="gb-bar-unsafe" style="width:${bar(r.width)}"></i></div></td><td class="${r.hit ? "gb-yes" : "gb-no"}">${r.hit ? "yes → stop" : "no"}</td></tr>`;
  });
  html += "</tbody></table>";
  host.innerHTML = html;
}

function renderReadout() {
  const d = T.b.d;
  const c = T.c;
  const exact = c.exact ? "exact" : "rounded";
  const ex = exactAnswer(state.x);
  const g3line = T.ok ? `Grisu3 prints <strong>${decimalText(T.digits, T.exp10)}</strong>` : `Grisu3 rejects (${T.verdict === "round" ? "closest ambiguous" : "outside safe zone"}) → fallback prints <strong>${esc(ex.text)}</strong>`;
  $("gb-readout").innerHTML = [
    `v = ${esc(String(state.x))} = ${d.significand} × 2${sup(d.exponent)}`,
    `q = ${state.q}${state.q === 64 ? " (double-conversion)" : " (simulated)"} · c̃ ≈ 10${sup(c.k)} (${exact}) · E = ${minus(T.E)} ∈ [${minus(-(state.q - 4))}, ${minus(-(state.q - 32))}]`,
    `1 unit = 2${sup(T.E)} of the scaled value = ${unitReal()} in real numbers · true interval ${fmtU(roff(T.ex.mPlus, T.ex.mMinus))} u · unsafe ${fmtBig(T.unsafe0)} u`,
    g3line + ` · Grisu2 prints ${G2.empty ? "nothing (empty interval)" : sciText(G2.digits, G2.exp10)}`,
  ].join("<br>");
}

function renderStepbar() {
  const st = steps[state.step];
  const label = `Step ${state.step + 1}/${steps.length} · ${st.name}`;
  $("gb-stepname").textContent = label;
  $("gb-code-step").textContent = label;
  $("gb-prev").disabled = state.step === 0;
  $("gb-code-prev").disabled = state.step === 0;
  $("gb-next").disabled = state.step === steps.length - 1;
  $("gb-code-next").disabled = state.step === steps.length - 1;
  $("gb-end").disabled = state.step === steps.length - 1;
  const dots = $("gb-dots");
  dots.replaceChildren(...steps.map((_, i) => {
    const s = document.createElement("span");
    if (i < state.step) s.className = "gb-on";
    if (i === state.step) s.className = "gb-now";
    return s;
  }));
  $("gb-caption").innerHTML = captionHtml();
  const preset = PRESETS.find((p) => p.value === state.x);
  $("gb-story").textContent = preset ? preset.story : "";
}

// ---------------------------------------------------------------------------
// Code strip
// ---------------------------------------------------------------------------

const CODE_G3 = [
  ["exact", "// exact m⁻, v, m⁺: never computed by Grisu (shown for reference)", true],
  ["blur", "W = w ⊗ c̃;  LO = m⁻ ⊗ c̃;  HI = m⁺ ⊗ c̃;   // each within 1 unit"],
  ["outer", "too_low = LO − 1;  too_high = HI + 1;  unsafe = too_high − too_low;"],
  ["int", "integrals = too_high >> −E;  fractionals = too_high & (one − 1);"],
  ["int", "for (kappa = digitCount(integrals); kappa > 0; ) {"],
  ["int", "  buffer.push(integrals / 10 ** (kappa − 1));  integrals %= 10 ** (kappa − 1);  kappa−−;"],
  ["int", "  rest = (integrals << −E) + fractionals;       // too_high − buffer·10^kappa"],
  ["int-stop", "  if (rest < unsafe) return RoundWeed(too_high − W, unsafe, rest, 10 ** kappa << −E, 1);"],
  ["int", "}"],
  ["frac", "for (unit = 1;;) {"],
  ["frac", "  fractionals *= 10;  unit *= 10;  unsafe *= 10;"],
  ["frac", "  buffer.push(fractionals >> −E);  fractionals &= one − 1;  kappa−−;"],
  ["frac-stop", "  if (fractionals < unsafe) return RoundWeed((too_high − W) * unit, unsafe, fractionals, one, unit);"],
  ["frac", "}"],
  ["", ""],
  ["walk", "function RoundWeed(dist, unsafe, rest, ten_kappa, unit) {"],
  ["walk", "  const small = dist − unit, big = dist + unit;  // distances to W+1 and W−1"],
  ["walk", "  while (rest < small && unsafe − rest >= ten_kappa &&"],
  ["walk", "         (rest + ten_kappa < small || small − rest >= rest + ten_kappa − small)) {"],
  ["walk", "    buffer[last]−−;  rest += ten_kappa;         // one step toward W"],
  ["walk-stop", "  }"],
  ["closest", "  if (rest < big && unsafe − rest >= ten_kappa &&"],
  ["closest", "      (rest + ten_kappa < big || big − rest > rest + ten_kappa − big))"],
  ["closest", "    return false;                              // closest is ambiguous"],
  ["weed", "  return 2 * unit <= rest && rest <= unsafe − 4 * unit;   // in the safe zone?"],
  ["weed", "}"],
];
const CODE_G2 = [
  ["exact", "// exact m⁻, v, m⁺: never computed by Grisu (shown for reference)", true],
  ["blur", "W = w ⊗ c̃;  LO = m⁻ ⊗ c̃;  HI = m⁺ ⊗ c̃;   // each within 1 unit"],
  ["g2-inner", "Mp = HI − 1;  Mm = LO + 1;  delta = Mp − Mm;   // certainly inside"],
  ["g2-digit", "p1 = Mp >> −E;  p2 = Mp & (one − 1);"],
  ["g2-digit", "for (kappa = digitCount(p1); kappa > 0; ) {"],
  ["g2-digit", "  buffer.push(p1 / 10 ** (kappa − 1));  p1 %= 10 ** (kappa − 1);  kappa−−;"],
  ["g2-stop", "  if ((p1 << −E) + p2 <= delta) return;        // shortest in [Mm, Mp]"],
  ["g2-digit", "}"],
  ["g2-digit", "for (;;) {"],
  ["g2-digit", "  p2 *= 10;  delta *= 10;"],
  ["g2-digit", "  buffer.push(p2 >> −E);  p2 &= one − 1;  kappa−−;"],
  ["g2-stop", "  if (p2 <= delta) return;"],
  ["g2-digit", "}"],
  ["g2-done", "// no rounding step, no check: the paper’s Grisu2 prints the buffer as is"],
];

let codeMode = null;
function renderCode() {
  const pre = $("gb-code");
  const code = state.mode === "g3" ? CODE_G3 : CODE_G2;
  if (codeMode !== state.mode) {
    codeMode = state.mode;
    pre.replaceChildren(...code.map(([id, text, comment]) => {
      const span = document.createElement("span");
      span.className = `gb-line${comment || text.startsWith("//") ? " gb-cm" : ""}`;
      span.dataset.line = id;
      span.textContent = text || " ";
      return span;
    }));
  }
  const line = steps[state.step].line;
  for (const span of pre.children) span.classList.toggle("hl", span.dataset.line === line);
}

// ---------------------------------------------------------------------------
// Park figure: register + error bill
// ---------------------------------------------------------------------------

function renderPark() {
  const q = state.q;
  const w = T.b.w, c = T.c, W = T.W;
  const sh = BigInt(-T.E);
  const intPart = W.f >> sh;
  const frac = ((W.f & ((1n << sh) - 1n)) * 10n ** 20n) >> sh;
  const cExact = c.k >= 0 ? rat(10n ** BigInt(c.k), 1n) : rat(1n, 10n ** BigInt(-c.k));
  // c.f - 10^k / 2^c.e, in units of c's last bit
  const cReal = c.e >= 0 ? rat(cExact.n, cExact.d << BigInt(c.e)) : rat(cExact.n << BigInt(-c.e), cExact.d);
  const cErr = roff(rat(c.f), cReal);
  $("gb-park-eq").innerHTML = [
    ["w", `<code>0x${hexQ(w.f, q)} · 2${sup(w.e)}</code> <em>v, normalised to ${q} bits</em>`],
    [`c̃ ≈ 10${sup(c.k)}`, `<code>0x${hexQ(c.f, q)} · 2${sup(c.e)}</code> <em>${c.exact ? "exact" : `10${sup(c.k)} rounded to ${q} bits: off by ${fmtS(cErr)} of its last bit`}</em>`],
    ["W = w ⊗ c̃", `<code>0x${hexQ(W.f, q)} · 2${sup(T.E)}</code> <em>top ${q} bits of the product, rounded; E = ${minus(T.E)}</em>`],
    ["in decimal", `<code>${intPart}.${frac.toString().padStart(20, "0")}…</code> <em>(= v · c̃, which is ≈ v · 10${sup(c.k)})</em>`],
  ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join("");

  // Bit strip.
  const box = $("gb-park-strip");
  const { svg, width } = newSvg(box, 78);
  const intBits = q + T.E;
  const cw = Math.min(13, (width - 20) / q);
  const x0 = (width - cw * q) / 2;
  const y = 30;
  const bits = W.f.toString(2).padStart(q, "0");
  for (let i = 0; i < q; i++) {
    const isInt = i < intBits;
    const one = bits[i] === "1";
    svg.append(el("rect", { x: x0 + i * cw + 0.5, y, width: Math.max(1, cw - 1), height: 20, class: isInt ? (one ? "gb-bit-int" : "gb-bit-int0") : (one ? "gb-bit-frac" : "gb-bit-frac0") }));
  }
  const xp = x0 + intBits * cw;
  svg.append(el("line", { x1: xp, x2: xp, y1: y - 6, y2: y + 26, class: "gb-point" }));
  svg.append(el("text", { x: x0, y: 20, class: "gb-halo" }, `integer: ${intBits} bits = ${intPart}`));
  svg.append(el("text", { x: x0 + cw * q, y: 20, "text-anchor": "end", class: "gb-halo" }, `fraction: ${-T.E} bits`));
  svg.append(el("text", { x: Math.max(x0 + 80, Math.min(width - 80, xp)), y: 70, "text-anchor": "middle", class: "gb-halo gb-lbl-cand" }, `binary point after bit ${-T.E}`));

  // Error bill.
  const bbox = $("gb-park-budget");
  const narrow = bbox.clientWidth < 560;
  const rowH = narrow ? 50 : 34;
  const { svg: s2, width: w2 } = newSvg(bbox, 34 + rowH * 3);
  const ax0 = 44, ax1 = narrow ? w2 - 14 : Math.min(w2 * 0.55, 520);
  const sx = (u) => ax0 + ((u + 1) / 2) * (ax1 - ax0);
  for (const t of [-1, -0.5, 0, 0.5, 1]) {
    s2.append(el("line", { x1: sx(t), x2: sx(t), y1: 20, y2: 30 + rowH * 3, class: "gb-chart-grid" }));
    s2.append(el("text", { x: sx(t), y: 14, "text-anchor": "middle", class: "gb-axis-label" }, t === 0 ? "exact" : `${t > 0 ? "+" : "−"}${Math.abs(t) === 0.5 ? "½" : "1"}`));
  }
  const rows = [["LO", T.b.minus, T.LO, T.ex.mMinus], ["W", T.b.w, T.W, T.ex.v], ["HI", T.b.plus, T.HI, T.ex.mPlus]];
  const altParts = [];
  rows.forEach(([name, x, X, exactU], i) => {
    const yy = 36 + i * rowH;
    const viaTable = rat(x.f * c.f, 1n << BigInt(q));
    const t = roff(viaTable, exactU), r = roff(rat(X.f), viaTable);
    s2.append(el("text", { x: 4, y: yy + 4, class: "gb-lbl-comp" }, name));
    s2.append(el("line", { x1: ax0, x2: ax1, y1: yy, y2: yy, class: "gb-budget-axis" }));
    s2.append(el("line", { x1: sx(0), x2: sx(0), y1: yy - 7, y2: yy + 7, class: "gb-exact" }));
    if (Math.abs(t) > 1e-4) s2.append(el("line", { x1: sx(0), x2: sx(t), y1: yy - 3, y2: yy - 3, class: "gb-budget-table" }));
    if (Math.abs(r) > 1e-4) s2.append(el("line", { x1: sx(t), x2: sx(t + r), y1: yy + 3, y2: yy + 3, class: "gb-budget-round" }));
    s2.append(el("circle", { cx: sx(t + r), cy: yy, r: 4, class: "gb-budget-dot" }));
    const txt = `table ${fmtS(t)} + product ${fmtS(r)} = ${fmtS(t + r)} u`;
    altParts.push(`${name}: ${txt}`);
    if (narrow) s2.append(el("text", { x: ax0, y: yy + 22, class: "gb-axis-label" }, txt));
    else s2.append(el("text", { x: ax1 + 16, y: yy + 4, class: "gb-axis-label" }, txt));
  });
  $("gb-park-alt").textContent = `Error bill in units for ${state.text}: ${altParts.join("; ")}.`;
}

// ---------------------------------------------------------------------------
// Rejection chart + sampler
// ---------------------------------------------------------------------------

function renderChart() {
  const box = $("gb-chart");
  const H = 240;
  const { svg, width } = newSvg(box, H);
  const m = { l: 46, r: 14, t: 14, b: 34 };
  const qs = SWEEP.map((r) => r[0]);
  const pct = SWEEP.map((r) => (100 * (r[1] + r[2])) / SWEEP_N);
  const sx = (q) => m.l + ((q - Q_MIN) / (Q_MAX - Q_MIN)) * (width - m.l - m.r);
  const yl = (p) => Math.log10(p);
  const sy = (p) => m.t + ((2 - yl(p)) / 3) * (H - m.t - m.b); // 0.1% .. 100%
  for (const p of [0.1, 1, 10, 100]) {
    svg.append(el("line", { x1: m.l, x2: width - m.r, y1: sy(p), y2: sy(p), class: "gb-chart-grid" }));
    svg.append(el("text", { x: m.l - 6, y: sy(p) + 4, "text-anchor": "end", class: "gb-axis-label" }, `${p}%`));
  }
  for (const q of qs) {
    if ((q % 5 === 0 && q !== 65) || q === 64) svg.append(el("text", { x: sx(q), y: H - m.b + 16, "text-anchor": "middle", class: "gb-axis-label" }, String(q)));
  }
  svg.append(el("text", { x: width - m.r, y: H - 4, "text-anchor": "end", class: "gb-axis-title" }, "q (bits)"));
  const floorP = (100 * (SWEEP_FLOOR.tie + SWEEP_FLOOR.boundary)) / SWEEP_N;
  svg.append(el("line", { x1: m.l, x2: width - m.r, y1: sy(floorP), y2: sy(floorP), class: "gb-chart-floor" }));
  svg.append(el("text", { x: width - m.r, y: sy(floorP) - 6, "text-anchor": "end", class: "gb-halo gb-axis-label" }, `floor ${floorP.toFixed(2)}%: ties + fence hits`));
  svg.append(el("line", { x1: sx(state.q), x2: sx(state.q), y1: m.t, y2: H - m.b, class: "gb-chart-qline" }));
  svg.append(el("path", { d: qs.map((q, i) => `${i ? "L" : "M"}${sx(q)},${sy(pct[i])}`).join(" "), class: "gb-chart-line" }));
  qs.forEach((q, i) => {
    svg.append(el("circle", { cx: sx(q), cy: sy(pct[i]), r: q === state.q ? 5.5 : 4, class: `gb-chart-dot${q === state.q ? " gb-now" : ""}` }));
  });
  const i64 = qs.indexOf(state.q);
  if (i64 >= 0) {
    const lx = sx(state.q), ly = sy(pct[i64]);
    svg.append(el("text", { x: lx + (lx > width - 140 ? -8 : 8), y: ly - 9, "text-anchor": lx > width - 140 ? "end" : "start", class: "gb-halo gb-lbl-cand" }, `q = ${state.q}: ${pct[i64].toFixed(2)}%`));
  }
  // Hit areas.
  const colW = (width - m.l - m.r) / (Q_MAX - Q_MIN);
  const tip = $("gb-tip");
  qs.forEach((q, i) => {
    const hit = el("rect", { x: sx(q) - colW / 2, y: m.t, width: colW, height: H - m.t - m.b, class: "gb-chart-hit" });
    const show = () => {
      const r = SWEEP[i];
      tip.hidden = false;
      tip.innerHTML = `q = ${q}: <strong>${pct[i].toFixed(2)}%</strong> rejected<br>${r[1]} closest ambiguous · ${r[2]} outside safe zone`;
      const x = sx(q);
      tip.style.left = `${Math.min(width - 230, Math.max(0, x - 110))}px`;
      tip.style.top = `${Math.max(0, sy(pct[i]) - 58)}px`;
    };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; });
    hit.addEventListener("click", () => { setQ(q); show(); });
    svg.append(hit);
  });
}

function renderChartTable() {
  let html = `<table><thead><tr><th>q</th><th>rejected</th><th>closest ambiguous</th><th>outside safe zone</th></tr></thead><tbody>`;
  for (const [q, a, b] of SWEEP) html += `<tr><td>${q}</td><td>${(100 * (a + b) / SWEEP_N).toFixed(2)}%</td><td>${a}</td><td>${b}</td></tr>`;
  html += `</tbody></table>`;
  $("gb-chart-table").innerHTML = html;
}

let sampling = false;
function runSampler() {
  if (sampling) return;
  sampling = true;
  const q = state.q;
  const button = $("gb-sample");
  button.disabled = true;
  const rnd = makeRandom(BigInt(Math.floor(Math.random() * 2 ** 52)));
  const N = 2000;
  let i = 0, ok = 0, round = 0, weed = 0, wrong = 0;
  const out = $("gb-sample-out");
  const chunk = () => {
    const end = Math.min(N, i + 100);
    for (; i < end; i++) {
      const v = rnd();
      const r = grisu3Quick(v, q);
      if (r.verdict === "ok") {
        ok++;
        const a = stripZeros(r.digits, r.exp10), b = exactAnswer(v);
        if (a.digits !== b.digits || a.exp10 !== b.exp10) wrong++;
      } else if (r.verdict === "round") round++;
      else weed++;
    }
    out.textContent = `${i}/${N} · accepted ${ok} (wrong: ${wrong}) · rejected ${round + weed} = ${(100 * (round + weed) / Math.max(1, i)).toFixed(2)}% (${round} closest ambiguous, ${weed} outside safe zone)`;
    if (i < N) setTimeout(chunk, 0);
    else { sampling = false; button.disabled = false; }
  };
  chunk();
}

// ---------------------------------------------------------------------------
// Tables filled from the model
// ---------------------------------------------------------------------------

function renderCompare() {
  let html = `<caption class="lab-sr-only">Grisu3 and Grisu2 on the presets, q = 64</caption><thead><tr><th>input</th><th>Grisu3</th><th>Grisu2 (paper)</th><th>Grisu2 + rounding</th><th>exact shortest</th></tr></thead><tbody>`;
  for (const p of PRESETS) {
    const g3 = grisu3Quick(p.value, 64);
    const ex = exactAnswer(p.value);
    const cell = (r) => {
      const s = stripZeros(r.digits, r.exp10);
      const good = s.digits === ex.digits && s.exp10 === ex.exp10;
      const note = good ? "" : s.digits.length > ex.digits.length ? " (longer)" : " (not closest)";
      return `<td class="${good ? "gb-good" : "gb-bad"}">${sciText(r.digits, r.exp10)}${note}</td>`;
    };
    const g3cell = g3.verdict === "ok" ? `<td class="gb-good">${sciText(g3.digits, g3.exp10)}</td>` : `<td class="gb-bad">reject (${g3.verdict === "round" ? "closest ambiguous" : "outside safe zone"})</td>`;
    html += `<tr><td>${esc(p.label)}</td>${g3cell}${cell(grisu2(p.value, 64))}${cell(grisu2(p.value, 64, true))}<td>${esc(ex.text)}</td></tr>`;
  }
  $("gb-compare").innerHTML = html + "</tbody>";
}

function fillStats() {
  const pct = (n) => `${(100 * n / SWEEP_N).toFixed(2)}%`;
  const r64 = SWEEP.find((r) => r[0] === 64);
  const rej64 = r64[1] + r64[2];
  const floor = SWEEP_FLOOR.tie + SWEEP_FLOOR.boundary;
  const set = (k, t) => document.querySelectorAll(`[data-stat="${k}"]`).forEach((n) => { n.textContent = t; });
  set("n", SWEEP_N.toLocaleString("en-US"));
  set("rej64", `${rej64} of ${SWEEP_N.toLocaleString("en-US")} (${pct(rej64)}; ${r64[1]} closest ambiguous, ${r64[2]} outside the safe zone)`);
  set("rej64b", pct(rej64));
  set("rej4", String(rej64));
  set("floor", `${floor} (${pct(floor)})`);
  set("ties", String(SWEEP_FLOOR.tie));
  set("bnd", String(SWEEP_FLOOR.boundary));
  set("g2long", `${SWEEP_G2.longer} of ${SWEEP_N.toLocaleString("en-US")} (${pct(SWEEP_G2.longer)})`);
  set("g2long2", pct(SWEEP_G2.longer));
  set("g2nc", `${SWEEP_G2.notClosest.toLocaleString("en-US")} (${Math.round(100 * SWEEP_G2.notClosest / SWEEP_N)}%)`);
  set("g2rnc", `${SWEEP_G2.roundedNotClosest} (${pct(SWEEP_G2.roundedNotClosest)})`);
  const g1 = grisu1(0.3);
  $("gb-g1").textContent = sciText(g1.digits, g1.exp10);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function renderAll() {
  renderStepbar();
  renderRuler();
  renderVerdict();
  renderLadder();
  renderReadout();
  renderCode();
  renderPark();
  renderChart();
  syncControls();
  $("gb-sample").textContent = `Sample 2,000 random doubles at q = ${state.q}`;
  writeParams();
}

function renderStep() {
  renderStepbar();
  renderRuler();
  renderVerdict();
  renderLadder();
  renderCode();
  writeParams();
}

function syncControls() {
  $("gb-q").value = String(state.q);
  $("gb-q-out").textContent = String(state.q);
  $("gb-mode-g3").setAttribute("aria-pressed", String(state.mode === "g3"));
  $("gb-mode-g2").setAttribute("aria-pressed", String(state.mode === "g2"));
  if (document.activeElement !== $("gb-x")) $("gb-x").value = state.text;
  document.querySelectorAll("[data-presets] button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.text === state.text)));
}

function keepStepKind(fn) {
  // Keep the reader at the "same" step (by kind) when the number or q changes.
  const st = steps[state.step];
  const key = st.kind === "walk" ? "walk" : st.kind.endsWith("digit") ? "digit" : st.kind.endsWith("verdict") ? "verdict" : st.kind;
  fn();
  recompute();
  state.step = resolveStep(key);
  renderAll();
}

function setNumber(text) {
  const v = parseInput(text);
  if (v === null) {
    $("gb-x-error").textContent = "Enter a positive finite number, e.g. 0.3, 1e23 or 0.1+0.2.";
    return;
  }
  $("gb-x-error").textContent = "";
  keepStepKind(() => { state.text = text.trim(); state.x = v; });
}

function setQ(q) {
  keepStepKind(() => { state.q = q; });
}

function setStep(i) {
  state.step = Math.max(0, Math.min(steps.length - 1, i));
  renderStep();
}

function init() {
  readParams(params);
  for (const host of document.querySelectorAll("[data-presets]")) {
    for (const p of PRESETS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p.label;
      b.dataset.text = p.label;
      b.addEventListener("click", () => setNumber(p.label));
      host.append(b);
    }
  }
  $("gb-form").addEventListener("submit", (e) => { e.preventDefault(); setNumber($("gb-x").value); });
  $("gb-random").addEventListener("click", () => {
    const v = makeRandom(BigInt(Math.floor(Math.random() * 2 ** 52)))();
    setNumber(String(v));
  });
  $("gb-q").addEventListener("input", (e) => setQ(Number(e.target.value)));
  $("gb-q64").addEventListener("click", () => setQ(64));
  $("gb-mode-g3").addEventListener("click", () => { state.mode = "g3"; recompute(); state.step = Math.min(state.step, steps.length - 1); renderAll(); });
  $("gb-mode-g2").addEventListener("click", () => { state.mode = "g2"; recompute(); state.step = Math.min(state.step, steps.length - 1); renderAll(); });
  $("gb-prev").addEventListener("click", () => setStep(state.step - 1));
  $("gb-next").addEventListener("click", () => setStep(state.step + 1));
  $("gb-end").addEventListener("click", () => setStep(steps.length - 1));
  $("gb-code-prev").addEventListener("click", () => setStep(state.step - 1));
  $("gb-code-next").addEventListener("click", () => setStep(state.step + 1));
  $("gb-main").addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowRight") { setStep(state.step + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { setStep(state.step - 1); e.preventDefault(); }
  });
  $("gb-sample").addEventListener("click", runSampler);
  for (const a of document.querySelectorAll("a.gb-jump")) {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const p = new URLSearchParams(a.getAttribute("href").split("#")[0].slice(1));
      if (!p.get("q")) p.set("q", "64");
      if (!p.get("mode")) state.mode = "g3";
      readParams(p);
      renderAll();
      $("gb-main").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }
  renderCompare();
  renderChartTable();
  fillStats();
  renderAll();
  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - lastW) < 2) return;
    lastW = window.innerWidth;
    renderRuler(); renderPark(); renderChart();
  });
}

init();
