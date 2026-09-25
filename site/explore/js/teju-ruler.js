// Copyright (C) 2026 Toit contributors.
//
// DOM code for the "Exact floors on a decade ruler" Tejú Jaguá page.

import {
  run, row, proveRow, decadeView, rulerArithmetic, stairOf, log10pow2, residual,
  scaled, fmtR, offsetR, floorR, mshift, MINVERSE, mulMod64, INV5, RTZ_BOUND, MMIN,
  EMIN, EMAX, clockMul, clockRor, CLOCK_BOUND5, CLOCK_BOUND10, PRESETS, parseInput,
  ROUTE_NAMES,
} from "./teju-ruler-model.js";
import { fromBits } from "../../js/float.js";

const SVGNS = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const params = new URLSearchParams(window.location.search);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function newSvg(box, height) {
  const width = Math.max(300, Math.floor(box.clientWidth || 600));
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "tjr-svg", "aria-hidden": "true" });
  box.replaceChildren(svg);
  return { svg, width };
}

function setParam(key, value) {
  const p = new URLSearchParams(window.location.search);
  if (value === null || value === undefined) p.delete(key); else p.set(key, value);
  const query = p.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

function onResize(box, fn) {
  let last = box.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(box.clientWidth - last) >= 1) { last = box.clientWidth; fn(); }
  });
  ro.observe(box);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** Integer or BigInt with a real minus sign. */
const num = (v) => String(v).replace(/^-/, "−");
const pow = (base, exp) => `${base}<sup>${num(exp)}</sup>`;
const hex = (v, digits = 16) => `0x${v.toString(16).padStart(digits, "0")}`;
/** "…9999" style tail for tick labels. */
function tail(v, keep = 3) {
  const s = (v < 0n ? -v : v).toString();
  const sign = v < 0n ? "−" : "";
  return s.length <= keep + 1 ? sign + s : `${sign}…${s.slice(-keep)}`;
}
/** Tail of a rational: integer tail + 3 fractional digits. */
function tailR(r, keep = 3) {
  const full = fmtR(r, 3);
  const [int, frac] = full.split(".");
  const t = tail(BigInt(int), keep);
  return frac === undefined ? t : `${t}.${frac}`;
}
const bits = (v, n = 8) => v.toString(2).padStart(n, "0");

// ---------------------------------------------------------------------------
// Shared ruler drawing: units of 10^G, ticks are the integers.
// ---------------------------------------------------------------------------

/**
 * cfg: { origin (BigInt), lo, hi (Number offsets), lower, upper, x (rationals),
 *        closed, endLabels, marks: [{ k, text, cls, level }], half: [{ at, text }],
 *        inside: (k) => bool, labelTicks: bool, height }
 */
function drawRuler(box, cfg) {
  const height = cfg.height || 206;
  const { svg, width } = newSvg(box, height);
  const mL = 16, mR = 16;
  const { lo, hi, origin } = cfg;
  const X = (t) => mL + ((t - lo) / (hi - lo)) * (width - mL - mR);
  const clampX = (t) => Math.max(mL - 6, Math.min(width - mR + 6, X(t)));
  const base = 104, bandTop = 34;
  const lowerOff = offsetR(cfg.lower, origin), upperOff = offsetR(cfg.upper, origin), xOff = offsetR(cfg.x, origin);
  const px = (width - mL - mR) / (hi - lo);

  // Band and edges.
  const bx0 = clampX(lowerOff), bx1 = clampX(upperOff);
  svg.append(el("rect", { x: bx0, y: bandTop, width: Math.max(2, bx1 - bx0), height: base - bandTop, class: "tjr-band" }));
  for (const t of [lowerOff, upperOff]) {
    if (t < lo || t > hi) continue;
    svg.append(el("line", { x1: X(t), x2: X(t), y1: bandTop, y2: base, class: cfg.closed ? "tjr-edge" : "tjr-edge tjr-edge-open" }));
  }
  // Baseline.
  svg.append(el("line", { x1: mL - 6, x2: width - mR + 6, y1: base, y2: base, class: "tjr-baseline" }));

  // Ticks.
  const first = origin + BigInt(Math.ceil(lo)), last = origin + BigInt(Math.floor(hi));
  const count = Number(last - first + 1n);
  const drawLongOnly = px < 3;
  if (drawLongOnly) {
    svg.append(el("rect", { x: mL, y: base - 8, width: width - mL - mR, height: 8, class: "tjr-dense" }));
  }
  const longPx = px * 10;
  const labelEvery = cfg.labelTicks === false ? 0 : px >= 34 ? 1 : longPx >= 40 ? 10 : 0;
  const drawTick = (k, isLong) => {
    const t = Number(k - origin);
    const xx = X(t);
    const inside = cfg.inside ? cfg.inside(k) : false;
    svg.append(el("line", { x1: xx, x2: xx, y1: base, y2: base - (isLong ? 26 : 12), class: `tjr-tick${isLong ? " tjr-tick-long" : ""}${inside ? " tjr-tick-in" : ""}` }));
    const m10 = ((k % 10n) + 10n) % 10n === 0n;
    if (labelEvery && (labelEvery === 1 || m10)) {
      svg.append(el("text", { x: xx, y: base + 14, "text-anchor": "middle", class: `tjr-ticklabel${isLong ? " tjr-ticklabel-long" : ""}` }, tail(k)));
    }
  };
  if (!drawLongOnly && count <= 4000) {
    for (let k = first; k <= last; k++) drawTick(k, ((k % 10n) + 10n) % 10n === 0n);
  } else if (longPx >= 3) {
    let k = first + ((10n - (((first % 10n) + 10n) % 10n)) % 10n);
    for (let i = 0; k <= last && i < 4000; k += 10n, i++) drawTick(k, true);
  } else {
    svg.append(el("rect", { x: mL, y: base - 26, width: width - mL - mR, height: 18, class: "tjr-dense" }));
  }

  // Half-tick markers (midpoints).
  for (const h of cfg.half || []) {
    const xx = X(h.at);
    svg.append(el("line", { x1: xx, x2: xx, y1: base - 18, y2: base + 2, class: "tjr-half" }));
    if (h.text) svg.append(el("text", { x: xx, y: base - 22, "text-anchor": "middle", class: "tjr-small tjr-halo" }, h.text));
  }

  // x.
  if (xOff >= lo && xOff <= hi) {
    svg.append(el("circle", { cx: X(xOff), cy: 58, r: 5, class: "tjr-xdot" }));
    svg.append(el("text", { x: X(xOff), y: 46, "text-anchor": "middle", class: "tjr-xlabel tjr-halo" }, "x"));
  }

  // End labels (exact values, for the reader only).
  if (cfg.endLabels) {
    const yl = 22;
    if (lowerOff >= lo && lowerOff <= hi) svg.append(el("text", { x: X(lowerOff) - 3, y: yl, "text-anchor": "end", class: "tjr-endlabel tjr-halo" }, cfg.endLabels[0]));
    if (upperOff >= lo && upperOff <= hi) svg.append(el("text", { x: X(upperOff) + 3, y: yl, "text-anchor": "start", class: "tjr-endlabel tjr-halo" }, cfg.endLabels[1]));
  }

  // Marks under the ruler, bumped down a level when their labels would collide.
  const placed = [];
  const visible = (cfg.marks || [])
    .map((mk) => ({ mk, t: Number(mk.k - origin) + (mk.dx || 0) }))
    .filter(({ t }) => t >= lo - 0.01 && t <= hi + 0.01)
    .sort((p, q) => p.t - q.t);
  for (const { mk, t } of visible) {
    const xx = X(t);
    const half = (mk.text.length * 7.2) / 2 + 4;
    let level = mk.level || 0;
    while (placed.some((p) => p.level === level && Math.abs(p.x - xx) < p.half + half) && level < 3) level++;
    placed.push({ x: xx, half, level });
    const y = base + 34 + level * 20;
    svg.append(el("line", { x1: xx, x2: xx, y1: base + 18, y2: y - 11, class: `tjr-pointer ${mk.cls || ""}` }));
    const anchor = xx < 60 ? "start" : xx > width - 60 ? "end" : "middle";
    svg.append(el("text", { x: anchor === "start" ? xx - 4 : anchor === "end" ? xx + 4 : xx, y, "text-anchor": anchor, class: `tjr-mark ${mk.cls || ""} tjr-halo` }, mk.text));
    if (mk.ring) svg.append(el("circle", { cx: xx, cy: base, r: 7, class: `tjr-ring ${mk.cls || ""}` }));
  }
  if (cfg.note) svg.append(el("text", { x: width - mR, y: height - 6, "text-anchor": "end", class: "tjr-small" }, cfg.note));
  return svg;
}

// ---------------------------------------------------------------------------
// 1. Pick the ruler (what-if decade)
// ---------------------------------------------------------------------------

function initDecade() {
  const box = document.getElementById("tjr-decade-svg");
  if (!box) return;
  const chips = document.getElementById("tjr-decade-presets");
  const range = document.getElementById("tjr-decade-range");
  const out = document.getElementById("tjr-decade-out");
  const readout = document.getElementById("tjr-decade-readout");
  const snap = document.getElementById("tjr-decade-snap");
  const presets = [["2/3", 2 / 3], ["0.1", 0.1], ["1e23", 1e23], ["5e-324", 5e-324], ["2^-1011", 2 ** -1011]];
  let current = presets.find(([l]) => l === params.get("rx")) || presets[0];
  range.value = String(Math.max(-3, Math.min(2, Number(params.get("d") || 0) || 0)));

  for (const p of presets) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p[0];
    b.setAttribute("aria-pressed", String(p === current));
    b.addEventListener("click", () => {
      current = p;
      for (const other of chips.children) other.setAttribute("aria-pressed", String(other === b));
      setParam("rx", p[0]);
      draw();
    });
    chips.append(b);
  }
  snap.addEventListener("click", () => { range.value = "0"; setParam("d", null); draw(); });
  range.addEventListener("input", () => { setParam("d", range.value === "0" ? null : range.value); draw(); });

  function draw() {
    const x = current[1];
    const { e } = decodeX(x);
    const F = log10pow2(e);
    const off = Number(range.value);
    const D = F + off;
    out.textContent = off > 0 ? `+${off}` : num(off);
    const v = decadeView(x, D);
    const origin = floorR(v.lower);
    const lowerOff = offsetR(v.lower, origin), upperOff = offsetR(v.upper, origin);
    const w = upperOff - lowerOff;
    const lo = lowerOff - 0.35 * w, hi = upperOff + 0.35 * w;
    const inside = (k) => {
      const l = (k * v.lower.d - v.lower.n), u = (v.upper.n - k * v.upper.d);
      return v.closed ? l >= 0n && u >= 0n : l > 0n && u > 0n;
    };
    const marks = [];
    if (v.longTicks > 0n && v.longTicks <= 3n) {
      let k = v.first + ((10n - (((v.first % 10n) + 10n) % 10n)) % 10n);
      for (let i = 0; k <= v.last && i < 3; k += 10n, i++) marks.push({ k, text: `long ${tail(k)}`, cls: "tjr-red", ring: true });
    }
    drawRuler(box, {
      origin, lo, hi, lower: v.lower, upper: v.upper, x: v.x, closed: v.closed, inside, marks,
      endLabels: [tailR(v.lower), tailR(v.upper)], height: 150,
      note: `ticks: 10${sup(D)} apart`,
    });
    const widthText = fmtR(v.width, 3);
    let verdict;
    if (off === 0) {
      verdict = v.centred || v.ticks > 0n
        ? `<strong>Tejú's ruler.</strong> 1 ≤ width &lt; 10, so at least one tick is inside and at most one long tick.`
        : `<strong>Tejú's ruler, but the exception:</strong> x = 2<sup>52</sup> · 2<sup>${num(e)}</sup> is a power of two, so the interval is only ¾ · 2<sup>e</sup> wide, less than one tick here. No tick is inside, and Tejú will fall back to the ruler 10<sup>F−1</sup>.`;
    } else if (off < 0) {
      verdict = `<strong>Too fine.</strong> Up to ${10 ** -off * 10} ticks, and ${v.longTicks} long ones; a program would have to search among them.`;
    } else {
      verdict = `<strong>Too coarse.</strong> The interval is narrower than one tick, so it ${v.ticks === 0n ? "caught <em>no</em> tick this time" : "still caught a tick here (x is next to a very short decimal), but nothing guarantees one"}.`;
    }
    readout.innerHTML =
      `<div>x = ${esc(current[0])} = ${v.m} · ${pow(2, e)}, so F = ⌊${num(e)} · log<sub>10</sub> 2⌋ = ${num(F)}; this ruler: D = ${num(D)}</div>` +
      `<div>interval width = ${v.centred ? "" : "¾ · "}2<sup>${num(e)}</sup> / 10<sup>${num(D)}</sup> = ${widthText} ticks · ticks inside: ${v.ticks} · long ticks inside: ${v.longTicks}</div>` +
      `<div>${verdict}</div>`;
  }
  draw();
  onResize(box, draw);
}

const SUPS = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (n) => String(n).split("").map((c) => SUPS[c] || c).join("");

function decodeX(x) {
  const r = run(x);
  return { e: r.e, m: r.m };
}

// ---------------------------------------------------------------------------
// 2. The staircase: one row per decade, r as a shift, top word as the floor
// ---------------------------------------------------------------------------

const SAMPLE_M = 0x1199999999999an; // the mantissa of 1.1

function initStairs() {
  const box = document.getElementById("tjr-stairs-svg");
  if (!box) return;
  const range = document.getElementById("tjr-stairs-range");
  const out = document.getElementById("tjr-stairs-out");
  const readout = document.getElementById("tjr-stairs-readout");
  const words = document.getElementById("tjr-stairs-words");
  const initial = Number.parseInt(params.get("e") || "", 10);
  if (Number.isFinite(initial)) range.value = String(Math.max(EMIN, Math.min(EMAX, initial)));
  const set = (e) => {
    range.value = String(Math.max(EMIN, Math.min(EMAX, e)));
    setParam("e", range.value === "-56" ? null : range.value);
    draw();
  };
  range.addEventListener("input", () => set(Number(range.value)));
  document.getElementById("tjr-stairs-dec").addEventListener("click", () => set(Number(range.value) - 1));
  document.getElementById("tjr-stairs-inc").addEventListener("click", () => set(Number(range.value) + 1));

  function draw() {
    const e = Number(range.value);
    out.textContent = `e = ${num(e)}`;
    const { svg, width } = newSvg(box, 190);
    const narrow = width < 520;
    const half = narrow ? 8 : 13;
    let e1 = Math.max(EMIN, e - half), e2 = e1 + 2 * half;
    if (e2 > EMAX) { e2 = EMAX; e1 = e2 - 2 * half; }
    const F1 = log10pow2(e1), F2 = log10pow2(e2);
    const mL = 58, mR = 14, top = 18, bottom = 150;
    const X = (v) => mL + ((v - e1) / (e2 - e1)) * (width - mL - mR);
    const Y = (F) => (F2 === F1 ? (top + bottom) / 2 : bottom - ((F - F1) / (F2 - F1)) * (bottom - top));
    const cur = stairOf(log10pow2(e));
    const xa = X(Math.max(e1, cur.exps[0])) - 9, xb = X(Math.min(e2, cur.exps[cur.exps.length - 1])) + 9;
    svg.append(el("rect", { x: xa, y: top - 12, width: xb - xa, height: bottom - top + 36, class: "tjr-stair-hl" }));
    for (let F = F1; F <= F2; F++) {
      svg.append(el("text", { x: mL - 12, y: Y(F) + 4, "text-anchor": "end", class: `tjr-small${F === cur.F ? " tjr-strong" : ""}` }, `F = ${num(F)}`));
      const st = stairOf(F);
      const s0 = Math.max(e1, st.exps[0]), s1 = Math.min(e2, st.exps[st.exps.length - 1]);
      if (s0 <= s1) svg.append(el("line", { x1: X(s0), x2: X(s1), y1: Y(F), y2: Y(F), class: `tjr-stair${F === cur.F ? " tjr-stair-cur" : ""}` }));
      if (F > F1 && st.exps[0] >= e1 && st.exps[0] <= e2) {
        svg.append(el("line", { x1: X(st.exps[0] - 1), x2: X(st.exps[0]), y1: Y(F - 1), y2: Y(F), class: "tjr-riser" }));
      }
    }
    for (let v = e1; v <= e2; v++) {
      if (v < EMIN) continue;
      const F = log10pow2(v), r = residual(v);
      const isCur = v === e;
      svg.append(el("circle", { cx: X(v), cy: Y(F), r: isCur ? 6 : 3.5, class: isCur ? "tjr-edot tjr-edot-cur" : "tjr-edot" }));
      svg.append(el("text", { x: X(v), y: Y(F) - 9, "text-anchor": "middle", class: `tjr-rlabel${isCur ? " tjr-strong" : ""}` }, `${r}`));
      if (isCur || v % (narrow ? 4 : 2) === 0) {
        svg.append(el("text", { x: X(v), y: bottom + 30, "text-anchor": "middle", class: `tjr-small${isCur ? " tjr-strong" : ""}` }, num(v)));
      }
    }
    svg.append(el("text", { x: mL - 12, y: bottom + 30, "text-anchor": "end", class: "tjr-small" }, "e ="));

    const ar = rulerArithmetic(e);
    const R = row(ar.F);
    const [alpha, delta] = [R.alpha, R.delta];
    const ad = ar.F <= 0 ? `${pow(5, -ar.F)} / ${pow(2, delta.toString(2).length - 1)}` : `${pow(2, alpha.toString(2).length - 1)} / ${pow(5, ar.F)}`;
    readout.innerHTML =
      `<div>1292913987 · (${num(e)}) = ${num(ar.product)} = ${num(ar.F)} · 2<sup>32</sup> + ${ar.low}</div>` +
      `<div>F = high part = <strong>${num(ar.F)}</strong> · r = ⌊${ar.low} / 1292913987⌋ = <strong>${ar.r}</strong> · e<sub>0</sub> = e − r = ${num(e - ar.r)}</div>` +
      `<div>row F = ${num(ar.F)} serves e = ${cur.exps.map(num).join(", ")} · 2<sup>e<sub>0</sub>−1</sup>/10<sup>F</sup> = ${ad}</div>` +
      `<div>M = ⌊2<sup>128</sup> · ${ad}⌋ + 1 = upper ${hex(R.upper)} · lower ${hex(R.lower)}</div>`;

    // Top-word diagram for a sample mantissa.
    const r = BigInt(ar.r);
    const n = (2n * SAMPLE_M + 1n) << r;
    const P = n * R.M;
    const w2 = P >> 128n, w1 = (P >> 64n) & ((1n << 64n) - 1n), w0 = P & ((1n << 64n) - 1n);
    const exact = scaled(2n * SAMPLE_M + 1n, e - 1, ar.F);
    const b = mshift(n, R.M);
    const ok = b === floorR(exact);
    words.innerHTML =
      `<p class="tjr-words-head">Sample: m = ${hex(SAMPLE_M, 14)} (the mantissa of 1.1), so x = m · 2<sup>${num(e)}</sup>. The upper end in units of 10<sup>F</sup> uses n = (2m + 1) ≪ r:</p>` +
      `<div class="tjr-wordrow"><span class="tjr-wlabel">n</span><span class="tjr-word tjr-word-n">${hex(n)}</span></div>` +
      `<div class="tjr-wordrow"><span class="tjr-wlabel">× M</span><span class="tjr-word">${hex(R.upper)}</span><span class="tjr-word">${hex(R.lower)}</span></div>` +
      `<div class="tjr-wordrow"><span class="tjr-wlabel">=</span><span class="tjr-word tjr-word-top">${hex(w2)}</span><span class="tjr-word tjr-word-drop">${hex(w1)}</span><span class="tjr-word tjr-word-drop">${hex(w0)}</span></div>` +
      `<p class="tjr-words-foot">Top word = <strong>${b}</strong>; the two low words are dropped (that is the “÷ 2<sup>128</sup>”). Exact upper end = ${fmtR(exact, 3)} ticks, whose floor is ${floorR(exact)} ${ok ? "✓" : "✗"}.</p>`;
  }
  draw();
  onResize(box, draw);
}

// ---------------------------------------------------------------------------
// 3. The kernel stepper
// ---------------------------------------------------------------------------

// The C source, trimmed of comments and asserts; keys name lines for the steps.
const LISTINGS = {
  D: { title: "teju.h · entry point", lines: [
    [null, "teju_fields_t"],
    [null, "teju_to_decimal(teju_fields_t const binary) {"],
    ["e", "  int32_t const e = binary.exponent;"],
    ["m", "  teju_u1_t const m = binary.mantissa;"],
    ["small", "  if (is_small_integer(e, m))"],
    ["callS", "    return to_decimal_small_integer(e, m);"],
    ["centred", "  if (is_centred(e, m))"],
    ["callC", "    return to_decimal_centred(e, m);"],
    ["callU", "  return to_decimal_uncentred(e);"],
    [null, "}"],
  ] },
  S: { title: "small integers", lines: [
    [null, "teju_fields_t"],
    [null, "to_decimal_small_integer(int32_t const e, teju_u1_t const m) {"],
    ["ret", "  return remove_trailing_zeros(0, 1u * m >> -e);"],
    [null, "}"],
  ] },
  C: { title: "centred: m ≠ 2^52", lines: [
    [null, "teju_fields_t"],
    [null, "to_decimal_centred(int32_t const e, teju_u1_t const m) {"],
    ["f", "  int32_t const f = teju_log10_pow2(e);"],
    ["r", "  uint32_t const r = teju_log10_pow2_residual(e);"],
    ["M", "  teju_multiplier_t const M = multipliers[f - teju_storage_index_offset];"],
    ["mb", "  teju_u1_t const m_b = (2u * m + 1u) << r;"],
    ["ma", "  teju_u1_t const m_a = (2u * m - 1u) << r;"],
    ["b", "  teju_u1_t const b = teju_mshift(m_b, M);"],
    ["a", "  teju_u1_t const a = teju_mshift(m_a, M);"],
    ["q", "  teju_u1_t const q = teju_div10(b);"],
    ["s", "  teju_u1_t const s = 10u * q;"],
    [null, ""],
    ["ties", "  if (allows_ties(f)) {"],
    ["sh", "    bool const shortest ="],
    ["shb", "      s == b ? !is_tie(f, m_b) || wins_tiebreak(m) :"],
    ["sha", "      s == a ? is_tie(f, m_a) && wins_tiebreak(m) :"],
    ["shgt", "      /*else*/ s > a;"],
    ["ifsh", "    if (shortest)"],
    ["retsh", "      return remove_trailing_zeros(f + 1, q);"],
    [null, "  }"],
    ["nt", "  else if (s > a)"],
    ["retnt", "    return remove_trailing_zeros(f + 1, q);"],
    [null, ""],
    ["mc", "  teju_u1_t const m_c = 4u * m << r;"],
    ["c2", "  teju_u1_t const c_2 = teju_mshift(m_c, M);"],
    ["c", "  teju_u1_t const c = c_2 / 2u;"],
    ["pl", "  bool const pick_left = (is_tie(-f, c_2) && wins_tiebreak(c)) ||"],
    ["pl2", "    is_closer_to_left(c_2);"],
    ["ret", "  return make_fields(f, c + !pick_left);"],
    [null, "}"],
  ] },
  U: { title: "uncentred: m = 2^52", lines: [
    [null, "teju_fields_t"],
    [null, "to_decimal_uncentred(int32_t const e) {"],
    ["m", "  teju_u1_t const m = mantissa_uncentred;"],
    ["f", "  int32_t const f = teju_log10_pow2(e);"],
    ["r", "  uint32_t const r = teju_log10_pow2_residual(e);"],
    ["M", "  teju_multiplier_t const M = multipliers[f - teju_storage_index_offset];"],
    ["ma", "  teju_u1_t const m_a = (4u * m - 1u) << r;"],
    ["mb", "  teju_u1_t const m_b = (2u * m + 1u) << r;"],
    ["b", "  teju_u1_t const b = teju_mshift(m_b, M);"],
    ["a", "  teju_u1_t const a = teju_mshift(m_a, M) / 2u;"],
    ["q", "  teju_u1_t const q = teju_div10(b);"],
    ["s", "  teju_u1_t const s = 10u * q;"],
    [null, ""],
    ["sorted", "  if (teju_calculation_sorted || a < b) {"],
    ["ties", "    if (allows_ties(f)) {"],
    ["sh", "      bool const shortest ="],
    ["shb", "        s == b ? !is_tie_uncentred(f, m_b) || wins_tiebreak(m) :"],
    ["sha", "        s == a ? is_tie_uncentred(f, m_a) && wins_tiebreak(m) :"],
    ["shgt", "        /*else*/ s > a;"],
    ["ifsh", "      if (shortest)"],
    ["retsh", "        return remove_trailing_zeros(f + 1, q);"],
    [null, "    }"],
    ["nt", "    else if (s > a)"],
    ["retnt", "      return remove_trailing_zeros(f + 1, q);"],
    [null, ""],
    ["log2", "    uint32_t const log2_m_c = teju_mantissa_width + r + 1u;"],
    ["c2", "    teju_u1_t const c_2 = mshift_pow2(log2_m_c, M);"],
    ["c", "    teju_u1_t const c = c_2 / 2u;"],
    ["ceqa", "    if (c == a && !is_tie_uncentred(f, m_a))"],
    ["retca", "      return make_fields(f, c + 1u);"],
    ["pl", "    bool const pick_left = (is_tie(-f, c_2) && wins_tiebreak(c)) ||"],
    ["pl2", "      is_closer_to_left(c_2);"],
    ["ret", "    return make_fields(f, c + !pick_left);"],
    [null, "  }"],
    [null, ""],
    ["rtie", "  if (is_tie_uncentred(f, m_a) && wins_tiebreak(m))"],
    ["retrt", "    return remove_trailing_zeros(f, a);"],
    [null, ""],
    ["mcr", "  teju_u1_t const m_c = 40u * m << r;"],
    ["c2r", "  teju_u1_t const c_2 = teju_mshift(m_c, M);"],
    ["cr", "  teju_u1_t const c = c_2 / 2u;"],
    ["plr", "  bool const pick_left = (is_tie(-f, c_2) && wins_tiebreak(c)) ||"],
    ["plr2", "    is_closer_to_left(c_2);"],
    ["retr", "  return make_fields(f - 1, c + !pick_left);"],
    [null, "}"],
  ] },
  Z: { title: "stripping zeros", lines: [
    [null, "teju_fields_t"],
    [null, "remove_trailing_zeros(int32_t f, teju_u1_t m) {"],
    ["minv5", "  teju_u1_t const minv5 = 0u - ((teju_u1_t) -1) / 5u;"],
    ["bound", "  teju_u1_t const bound = ((teju_u1_t) -1) / 10u + 1u;"],
    [null, "  while (true) {"],
    ["q", "    teju_u1_t const q = ror(1u * m * minv5);"],
    ["if", "    if (q >= bound)"],
    ["ret", "      return make_fields(f, m);"],
    ["inc", "    ++f;"],
    ["mq", "    m = q;"],
    [null, "  }"],
    [null, "}"],
  ] },
};

const yes = (b) => (b ? "true" : "false");

/** Build the step list for one traced run. */
function buildSteps(t) {
  const steps = [];
  const L = t.route === "small-int" ? "S" : t.centred ? "C" : "U";
  const F = t.F;
  const step = (title, lines, ann, html, view, vars = []) => steps.push({ title, lines, ann, html, view, vars });

  // Step: dispatch.
  const e = t.e, m = t.m;
  let smallWhy;
  if (e > 0) smallWhy = "No: e &gt; 0 (small integers have −52 ≤ e ≤ 0)";
  else if (-e >= 53) smallWhy = `No: e &lt; −52, so x = m · 2<sup>${num(e)}</sup> &lt; 1`;
  else if (t.small) smallWhy = `Yes: the low ${-e} bits of m are zero, so x = m ≫ ${-e} is a whole number`;
  else smallWhy = `No: the low ${-e} bits of m are not all zero, so x has a fractional part`;
  const dispAnn = { "D:e": `e = ${num(e)}`, "D:m": `m = ${m}`, "D:small": yes(t.small) };
  const dispLines = ["D:e", "D:m", "D:small"];
  let dispText = `<p>The caller passes x = m · 2<sup>e</sup> with m = ${m} and e = ${num(e)}. Small integer? ${smallWhy}.</p>`;
  if (t.small) {
    dispLines.push("D:callS");
  } else {
    dispLines.push("D:centred", t.centred ? "D:callC" : "D:callU");
    dispAnn["D:centred"] = yes(t.centred);
    if (m === MMIN && t.centred) {
      dispText += `<p>m = 2<sup>52</sup>, but e is the minimum exponent: the double below is a subnormal with the same spacing. So x is still <b>centred</b>, and the interval reaches 2<sup>e−1</sup> to each side.</p>`;
    } else {
      dispText += t.centred
        ? `<p>m ≠ 2<sup>52</sup>, so x is <b>centred</b>: its neighbours are equally far away, and the interval reaches 2<sup>e−1</sup> to each side.</p>`
        : `<p>m = 2<sup>52</sup>: x is a power of two and <b>uncentred</b>. The double below is in the smaller binade, only half as far away, so the interval reaches 2<sup>e−2</sup> down but 2<sup>e−1</sup> up.</p>`;
    }
  }
  step("Decode and dispatch", dispLines, dispAnn, dispText, { mode: t.small ? "small" : "interval" }, [["e", num(e)], ["m", m]]);

  if (t.small) {
    const n = t.n;
    step("Small integer: no multiply", ["S:ret", ...zLines()], { "S:ret": `m >> ${-e} = ${n}`, ...zAnn(t.rtz) },
      `<p>x is the integer ${n}. No table, no multiply: Tejú removes trailing zeros (${t.rtz.f === 0 ? "there are none" : `${t.rtz.f} of them`}) and returns ${t.rtz.c} · 10<sup>${num(t.rtz.f)}</sup>.</p>` + rtzHtml(t.rtz),
      { mode: "small" }, [["x", n], ["result", `${t.rtz.c} · 10^${t.rtz.f}`]]);
    return steps;
  }

  // Step: ruler.
  const widthR = t.centred ? scaled(1n, e, F) : scaled(3n, e - 2, F);
  step("Pick the ruler and the row", [`${L}:f`, `${L}:r`, `${L}:M`].concat(L === "U" ? ["U:m"] : []),
    { [`${L}:f`]: `f = ${num(F)}`, [`${L}:r`]: `r = ${t.r}`, [`${L}:M`]: `row ${num(F)}`, "U:m": "m = 2^52" },
    `<p>F = (1292913987 · ${num(e)}) &gt;&gt; 32 = <b>${num(F)}</b>, so the ruler has ticks 10<sup>${num(F)}</sup> apart. On it, the interval is ${t.centred ? "" : "¾ · "}2<sup>${num(e)}</sup>/10<sup>${num(F)}</sup> = ${fmtR(widthR, 3)} ticks wide.</p>` +
    `<p>r = ${t.r}: e is ${t.r} step${t.r === 1 ? "" : "s"} above the stair's first exponent e<sub>0</sub> = ${num(t.e0)}, and M is row ${num(F)} of the table.</p>`,
    { mode: "interval" }, [["F", num(F)], ["r", t.r], ["M", `${hex(t.M >> 64n)} ${hex(t.M & ((1n << 64n) - 1n)).slice(2)}`]]);

  // Step: the two floors.
  const aWhy = t.centred
    ? `For the lower end, m<sub>a</sub> = (2m − 1) ≪ r works the same way`
    : `For the lower end, only 2<sup>e−2</sup> below x, m<sub>a</sub> = (4m − 1) ≪ r scales to <em>twice</em> the lower end, so the floor is halved`;
  step("Scale the ends: two exact floors", [`${L}:mb`, `${L}:ma`, `${L}:b`, `${L}:a`],
    { [`${L}:mb`]: `m_b = ${t.mb}`, [`${L}:ma`]: `m_a = ${t.ma}`, [`${L}:b`]: `b = ${t.b}`, [`${L}:a`]: `a = ${t.a}` },
    `<p>m<sub>b</sub> = (2m + 1) ≪ r, and mshift(m<sub>b</sub>, M) keeps the top word of m<sub>b</sub> · M: that is b = ⌊upper / 10<sup>F</sup>⌋ = <b>${t.b}</b>. ${aWhy}: a = <b>${t.a}</b>.</p>` +
    `<p class="tjr-exact">Exact ends, shown for you: ${fmtR(t.lowerR, 3)} and ${fmtR(t.upperR, 3)}. Tejú never computes the fractional parts. The generator guarantees that the floors are right.</p>`,
    { mode: "floors" }, [["m_b", t.mb], ["m_a", t.ma], ["b", t.b], ["a", t.a]]);

  // Step: the long tick.
  step("The only shorter candidate", [`${L}:q`, `${L}:s`], { [`${L}:q`]: `q = ${t.q}`, [`${L}:s`]: `s = ${t.s}` },
    `<p>q = b / 10 (a multiply by ${hex((1n << 64n) / 10n + 1n)} that keeps the top word), and s = 10q = <b>${t.s}</b> is the multiple of 10 at or below b. It is the only long tick that could be inside: the next one is past the upper end, and the one before is more than 10 ticks back.</p>`,
    { mode: "s" }, [["q", t.q], ["s", t.s]]);

  // Uncentred without a tick: the refined route.
  if (!t.centred && !t.sorted) {
    const tieLine = `U:rtie`;
    if (t.route === "unc-refined-tie") {
      step("No tick inside, but the lower end is one", ["U:sorted", tieLine, "U:retrt", ...zLines()],
        { "U:sorted": "a < b: false", [tieLine]: "true", ...zAnn(t.rtz) },
        `<p>a = b = ${t.a}: the interval is less than one tick wide and contains no tick, except that its lower end is <em>exactly</em> the tick a, and m is even. Return a with zeros stripped.</p>` + rtzHtml(t.rtz),
        { mode: "s" }, [["result", `${t.rtz.c} · 10^${t.rtz.f}`]]);
      return steps;
    }
    step("No tick inside: go one decade finer", ["U:sorted", tieLine],
      { "U:sorted": "a < b: false", [tieLine]: `${yes(t.tieA)} && …` },
      `<p>a = b = ${t.a}: both ends have the same floor, so the interval, only ${fmtR(widthR, 4)} ticks wide, falls between two ticks. The lower end is not exactly a tick either, so there is no answer on this ruler.</p>` +
      `<p>Tejú moves one decade finer, to 10<sup>${num(F - 1)}</sup>. There the interval is ten times wider (≥ 7.5 ticks), so its closest tick is inside and no shorter one exists.</p>`,
      { mode: "decide" }, []);
    step("Closest tick of the finer ruler", ["U:mcr", "U:c2r", "U:cr", "U:plr", "U:plr2", "U:retr"],
      { "U:mcr": `m_c = ${t.mc}`, "U:c2r": `c_2 = ${t.c2}`, "U:cr": `c = ${t.c}`, "U:plr": `${yes(t.pickLeft)}`, "U:retr": `→ ${t.result.c}e${t.result.f}` },
      `<p>m<sub>c</sub> = 40m ≪ r, so c₂ = mshift(m<sub>c</sub>, M) = ⌊2x / 10<sup>${num(F - 1)}</sup>⌋ = <b>${t.c2}</b> with the <em>same</em> row M. The factor 40 = 4 · 10 does the extra decade.</p>` + closestHtml(t) +
      `<p>Result: <b>${t.result.c} · 10<sup>${num(t.result.f)}</sup></b>.</p>`,
      { mode: "refined" }, [["m_c", t.mc], ["c_2", t.c2], ["c", t.c], ["result", `${t.result.c} · 10^${t.result.f}`]]);
    return steps;
  }

  // Decide.
  const decLines = [];
  const decAnn = {};
  if (!t.centred) { decLines.push("U:sorted"); decAnn["U:sorted"] = "a < b: true"; }
  let decText = "";
  if (t.allowsTies) {
    decLines.push(`${L}:ties`, `${L}:sh`);
    decAnn[`${L}:ties`] = `0 ≤ f ≤ 26: true`;
    const tieFn = t.centred ? "is_tie" : "is_tie_uncentred";
    if (t.sCase === "b") {
      decLines.push(`${L}:shb`);
      decAnn[`${L}:shb`] = `s == b; ${tieFn}: ${yes(t.tieB)}${t.tieB ? `, m even: ${yes(t.closed)}` : ""}`;
      decText = t.tieB
        ? `<p>s == b: the long tick has the same floor as the upper end. Is the end <em>exactly</em> s? ${tieFn}(f, m<sub>b</sub>) checks whether 5<sup>${F}</sup> divides m<sub>b</sub> = ${t.mb}. It does, so the upper end is exactly s · 10<sup>${num(F)}</sup>. m is ${t.closed ? "even, so the end belongs to x" : "odd, so the end does not belong to x"}.</p>`
        : `<p>s == b, but ${tieFn}(f, m<sub>b</sub>) is false: the upper end is strictly past s, so s is inside.</p>`;
    } else if (t.sCase === "a") {
      decLines.push(`${L}:shb`, `${L}:sha`);
      decAnn[`${L}:sha`] = `s == a; ${tieFn}: ${yes(t.tieA)}`;
      decText = `<p>s == a: the long tick has the same floor as the lower end, so it lies at or below the lower end. It counts only if the end is exactly s (${tieFn}: ${yes(t.tieA)}) and m is even (${yes(t.closed)}).</p>`;
    } else {
      decLines.push(`${L}:shb`, `${L}:sha`, `${L}:shgt`);
      decAnn[`${L}:shgt`] = `${t.s} > ${t.a}: ${yes(t.s > t.a)}`;
      decText = `<p>s is neither b nor a, so no end can be exactly s. Plain comparison: s ${t.s > t.a ? "&gt;" : "≤"} a.</p>`;
    }
    decLines.push(`${L}:ifsh`);
    decAnn[`${L}:ifsh`] = `shortest = ${yes(t.shortest)}`;
  } else {
    decLines.push(`${L}:ties`, `${L}:nt`);
    decAnn[`${L}:ties`] = `f = ${num(F)}: false`;
    decAnn[`${L}:nt`] = `${t.s} > ${t.a}: ${yes(t.s > t.a)}`;
    decText = `<p>For F = ${num(F)} an end can never be exactly a tick (that needs 0 ≤ F ≤ 26), so the test is just s &gt; a.</p>`;
  }
  decText += t.shortest
    ? `<p><b>s is inside.</b> There is a decimal one digit shorter than the ruler's ticks, and it is the only one.</p>`
    : `<p><b>s is not inside.</b> No decimal on the ruler 10<sup>${num(F + 1)}</sup> fits. The answer is a tick of 10<sup>${num(F)}</sup>: the one closest to x.</p>`;
  step("Is s inside?", decLines, decAnn, decText, { mode: "decide" }, [["shortest", yes(t.shortest)]]);

  if (t.shortest) {
    const retKey = t.allowsTies ? `${L}:retsh` : `${L}:retnt`;
    step("Strip the zeros", [retKey, ...zLines()], { [retKey]: `(f + 1, q) = (${num(F + 1)}, ${t.q})`, ...zAnn(t.rtz) },
      `<p>Return q = s / 10 at exponent F + 1 = ${num(F + 1)}, with its trailing zeros removed: <b>${t.result.c} · 10<sup>${num(t.result.f)}</sup></b>.</p>` + rtzHtml(t.rtz),
      { mode: "strip" }, [["result", `${t.result.c} · 10^${t.result.f}`]]);
    return steps;
  }

  // Closest.
  if (t.centred) {
    step("The closest tick", ["C:mc", "C:c2", "C:c", "C:pl", "C:pl2", "C:ret"],
      { "C:mc": `m_c = ${t.mc}`, "C:c2": `c_2 = ${t.c2}`, "C:c": `c = ${t.c}`, "C:pl": `pick_left = ${yes(t.pickLeft)}`, "C:ret": `→ ${t.result.c}e${t.result.f}` },
      `<p>m<sub>c</sub> = 4m ≪ r, so c₂ = mshift(m<sub>c</sub>, M) = ⌊2x / 10<sup>${num(F)}</sup>⌋ = <b>${t.c2}</b>: another exact floor, measured in half ticks.</p>` + closestHtml(t) +
      `<p>Result: <b>${t.result.c} · 10<sup>${num(F)}</sup></b>. The interval is at least one tick wide, so the closest tick is always inside.</p>`,
      { mode: "closest" }, [["m_c", t.mc], ["c_2", t.c2], ["c", t.c], ["result", `${t.result.c} · 10^${t.result.f}`]]);
    return steps;
  }
  const ceqaAnn = { "U:log2": `log2_m_c = ${t.log2mc}`, "U:c2": `c_2 = ${t.c2}`, "U:c": `c = ${t.c}`, "U:ceqa": `c == a: ${yes(t.cIsA)}` };
  const pre = `<p>m<sub>c</sub> = 4m ≪ r = 2<sup>${t.log2mc}</sup> is a power of two, so c₂ = ⌊2x / 10<sup>${num(F)}</sup>⌋ = <b>${t.c2}</b> needs no multiply: <code>mshift_pow2</code> just reads bits of M.</p>`;
  if (t.route === "unc-c-eq-a") {
    step("The closest tick (uncentred)", ["U:log2", "U:c2", "U:c", "U:ceqa", "U:retca"], { ...ceqaAnn, "U:retca": `→ ${t.result.c}e${t.result.f}` },
      pre + `<p>c = ${t.c} equals a: the tick below x is at or below the lower end, which is only ¼ tick or more below x here. It is outside, so the answer is c + 1 = <b>${t.result.c}</b> · 10<sup>${num(F)}</sup>.</p>`,
      { mode: "closest" }, [["c_2", t.c2], ["c", t.c], ["result", `${t.result.c} · 10^${t.result.f}`]]);
    return steps;
  }
  step("The closest tick (uncentred)", ["U:log2", "U:c2", "U:c", "U:ceqa", "U:pl", "U:pl2", "U:ret"],
    { ...ceqaAnn, "U:pl": `pick_left = ${yes(t.pickLeft)}`, "U:ret": `→ ${t.result.c}e${t.result.f}` },
    pre + `<p>c = ${t.c} ≠ a, so tick c is inside, and the usual rule applies.</p>` + closestHtml(t) + `<p>Result: <b>${t.result.c} · 10<sup>${num(F)}</sup></b>.</p>`,
    { mode: "closest" }, [["c_2", t.c2], ["c", t.c], ["result", `${t.result.c} · 10^${t.result.f}`]]);
  return steps;
}

function closestHtml(t) {
  const half = t.c2 % 2n === 0n;
  let s = `<p>c = ⌊c₂ / 2⌋ = ${t.c}: x lies between ticks c and c + 1. c₂ is ${half ? "<b>even</b>, so x is in the left half: take c" : "<b>odd</b>, so x is in the right half: take c + 1"}`;
  if (!half) s += t.tieC ? `, except that 2x/10<sup>F</sup> is exactly c₂ here: a true midpoint, which goes to the even one of c and c + 1 (${t.pickLeft ? "c" : "c + 1"})` : ` (is_tie(−f, c₂) is false: not an exact midpoint)`;
  return `${s}.</p>`;
}

function zLines() { return ["Z:minv5", "Z:bound", "Z:q", "Z:if", "Z:ret", "Z:inc", "Z:mq"]; }
function zAnn(rtz) {
  const last = rtz.iterations[rtz.iterations.length - 1];
  const n = rtz.iterations.length - 1;
  return {
    "Z:minv5": hex(INV5), "Z:bound": hex(RTZ_BOUND),
    "Z:q": `${rtz.iterations.length} iteration${rtz.iterations.length === 1 ? "" : "s"}; last q = ${last.q}`,
    "Z:if": "true on the last pass", "Z:ret": `(${num(rtz.f)}, ${rtz.c})`, "Z:inc": `${n}×`,
  };
}
function rtzHtml(rtz) {
  const it = rtz.iterations;
  const shown = it.length > 6 ? [...it.slice(0, 3), null, ...it.slice(-2)] : it;
  const rows = shown.map((x) => (x === null
    ? `<li class="tjr-ellipsis">… ${it.length - 5} more, one zero each …</li>`
    : `<li>m = ${x.m} → q = ror(m · minv5) = ${x.ok ? `<b>${x.q}</b> &lt; bound: a zero, m = q` : `${x.q.toString().length > 12 ? `${hex(x.q)}` : x.q} ≥ bound: stop`}</li>`)).join("");
  return `<ol class="tjr-rtz">${rows}</ol>`;
}

function initKernel() {
  const fig = document.getElementById("tjr-kernel");
  if (!fig) return;
  const chips = document.getElementById("tjr-presets");
  const form = document.getElementById("tjr-form");
  const input = document.getElementById("tjr-input");
  const error = document.getElementById("tjr-error");
  const routeBox = document.getElementById("tjr-route");
  const prev = document.getElementById("tjr-prev");
  const next = document.getElementById("tjr-next");
  const end = document.getElementById("tjr-end");
  const label = document.getElementById("tjr-steplabel");
  const lineBox = document.getElementById("tjr-line-svg");
  const titleEl = document.getElementById("tjr-step-title");
  const textEl = document.getElementById("tjr-step-text");
  const varsEl = document.getElementById("tjr-vars");
  const codeEl = document.getElementById("tjr-code");
  const resultEl = document.getElementById("tjr-result");

  let t = null, steps = [], idx = 0, text = "0.1";

  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `${esc(p.label)} <span class="tjr-chip-route">${esc(p.route)}</span>`;
    b.dataset.text = p.text;
    b.addEventListener("click", () => load(p.text, 0));
    chips.append(b);
  }

  function load(str, stepIndex = 0) {
    const parsed = parseInput(str);
    if (parsed.error) { error.textContent = parsed.error; return false; }
    error.textContent = parsed.negative ? "Tejú handles |x|; the sign is printed separately." : "";
    text = str;
    input.value = str;
    t = run(parsed.value);
    steps = buildSteps(t);
    idx = Math.max(0, Math.min(steps.length - 1, stepIndex));
    for (const c of chips.children) c.setAttribute("aria-pressed", String(c.dataset.text === str));
    setParam("x", str === "0.1" ? null : str);
    renderAll();
    updateProof(t);
    return true;
  }

  form.addEventListener("submit", (ev) => { ev.preventDefault(); load(input.value.trim(), 0); });
  document.getElementById("tjr-random").addEventListener("click", () => {
    const hi = BigInt(Math.floor(Math.random() * 0x7fe00000)) + 0x00100000n; // biased exponent 1..2046
    const lo = BigInt(Math.floor(Math.random() * 2 ** 32));
    const x = fromBits((hi << 32n) | lo);
    load(String(x), 0);
  });
  prev.addEventListener("click", () => go(idx - 1));
  next.addEventListener("click", () => go(idx + 1));
  end.addEventListener("click", () => go(steps.length - 1));
  fig.addEventListener("keydown", (ev) => {
    if (ev.target instanceof HTMLInputElement) return;
    if (ev.key === "ArrowRight") { go(idx + 1); ev.preventDefault(); }
    if (ev.key === "ArrowLeft") { go(idx - 1); ev.preventDefault(); }
  });
  function go(i) {
    idx = Math.max(0, Math.min(steps.length - 1, i));
    setParam("step", idx === 0 ? null : String(idx + 1));
    renderStep();
  }

  function renderAll() {
    routeBox.innerHTML = `<span class="tjr-route-pill">${esc(ROUTE_NAMES[t.route])}</span>`;
    const ok = t.match;
    resultEl.innerHTML =
      `<div>Tejú returns (c, f) = (${t.result.c}, ${num(t.result.f)}), which prints as <strong>${esc(t.text)}</strong></div>` +
      `<div>JavaScript <code>String(x)</code> = <strong>${esc(t.js)}</strong> · ${ok ? "same digits and exponent ✓" : "MISMATCH ✗"}</div>`;
    renderStep();
  }

  function renderStep() {
    const s = steps[idx];
    label.textContent = `Step ${idx + 1} of ${steps.length}`;
    prev.disabled = idx === 0;
    next.disabled = idx === steps.length - 1;
    end.disabled = idx === steps.length - 1;
    titleEl.textContent = s.title;
    textEl.innerHTML = s.html;
    const vars = [];
    for (let i = 0; i <= idx; i++) vars.push(...steps[i].vars);
    varsEl.innerHTML = vars.map(([k, v]) => `<div><span>${esc(k)}</span> = ${esc(num(v))}</div>`).join("");
    renderCode();
    drawLine(s.view);
  }

  function renderCode() {
    const L = t.route === "small-int" ? "S" : t.centred ? "C" : "U";
    const names = ["D", L];
    const strips = t.rtz !== undefined;
    if (strips) names.push("Z");
    const onRoute = new Set(steps.flatMap((s) => s.lines));
    const current = new Set(steps[idx].lines);
    const ann = {};
    for (let i = 0; i <= idx; i++) Object.assign(ann, steps[i].ann);
    const frag = document.createDocumentFragment();
    for (const name of names) {
      const lst = LISTINGS[name];
      const block = document.createElement("div");
      block.className = "tjr-codeblock";
      const head = document.createElement("div");
      head.className = "tjr-codehead";
      head.textContent = `// ${lst.title}`;
      block.append(head);
      for (const [key, code] of lst.lines) {
        const id = key ? `${name}:${key}` : null;
        const line = document.createElement("div");
        line.className = "tjr-cl";
        if (id && current.has(id)) line.classList.add("tjr-cl-hl");
        else if (id && !onRoute.has(id)) line.classList.add("tjr-cl-off");
        const c = document.createElement("code");
        c.textContent = code || " ";
        line.append(c);
        if (id && ann[id] !== undefined && onRoute.has(id)) {
          const a = document.createElement("span");
          a.className = "tjr-ann";
          a.textContent = `// ${ann[id]}`;
          line.append(a);
        }
        block.append(line);
      }
      frag.append(block);
    }
    codeEl.replaceChildren(frag);
    const hl = codeEl.querySelector(".tjr-cl-hl");
    if (hl) {
      const top = hl.offsetTop - codeEl.clientHeight / 3;
      codeEl.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  function drawLine(view) {
    const mode = view.mode;
    if (mode === "small") {
      const v = decadeView(t.x, 0);
      const origin = floorR(v.x);
      drawRuler(lineBox, {
        origin, lo: -2.5, hi: 2.5, lower: v.lower, upper: v.upper, x: v.x, closed: v.closed,
        endLabels: [fmtR(v.lower, 3), fmtR(v.upper, 3)],
        marks: [{ k: origin, text: `x = ${origin}`, cls: "tjr-red", ring: true }],
        note: "ticks: 10⁰ = 1 apart",
      });
      lineBox.setAttribute("aria-label", `x = ${t.n} is a whole number: it sits exactly on a tick of the ruler of ones.`);
      return;
    }
    if (mode === "refined") {
      const origin = t.c;
      const lowerOff = offsetR(t.lowerR1, origin), upperOff = offsetR(t.upperR1, origin);
      const below = -Number(((t.c % 10n) + 10n) % 10n);
      const lo = Math.min(lowerOff, below) - 0.8, hi = Math.max(upperOff, below + 10) + 0.8;
      const chosen = t.result.c;
      drawRuler(lineBox, {
        origin, lo, hi, lower: t.lowerR1, upper: t.upperR1, x: t.xR1, closed: t.closed,
        endLabels: [tailR(t.lowerR1), tailR(t.upperR1)],
        inside: (k) => k === chosen,
        half: [{ at: 0.5, text: "½" }],
        marks: [
          { k: t.c, text: `c${chosen === t.c ? " ✓" : ""}`, cls: chosen === t.c ? "tjr-red" : "", ring: chosen === t.c },
          { k: t.c + 1n, text: `c + 1${chosen !== t.c ? " ✓" : ""}`, cls: chosen !== t.c ? "tjr-red" : "", ring: chosen !== t.c, level: 1 },
        ],
        note: `ticks: 10${sup(t.F - 1)} apart (one decade finer)`,
      });
      lineBox.setAttribute("aria-label", `On the finer ruler 10 to the ${t.F - 1}, the interval spans ${fmtR(t.lowerR1, 3)} to ${fmtR(t.upperR1, 3)}; the closest tick ${chosen} is chosen.`);
      return;
    }
    // Rulers in units of 10^F.
    const origin = t.a;
    const lowerOff = offsetR(t.lowerR, origin), upperOff = offsetR(t.upperR, origin);
    const sOff = Number(t.s - origin);
    const cand = [0, lowerOff, upperOff, sOff, Number(t.b - origin) + 1];
    let lo = Math.min(...cand), hi = Math.max(...cand);
    const pad = 0.6 + 0.06 * (hi - lo);
    lo -= pad; hi += pad;
    const marks = [];
    const inside = (k) => {
      const l = k * t.lowerR.d - t.lowerR.n, u = t.upperR.n - k * t.upperR.d;
      return t.closed ? l >= 0n && u >= 0n : l > 0n && u > 0n;
    };
    const half = [];
    const ends = [tailR(t.lowerR), tailR(t.upperR)];
    if (mode !== "interval") {
      marks.push({ k: t.a, text: "a", cls: "tjr-blue", level: 0 });
      marks.push({ k: t.b, text: t.b === t.a ? "a = b" : "b", cls: "tjr-blue", level: 0 });
      if (t.b === t.a) marks.shift();
    }
    if (mode === "s" || mode === "decide" || mode === "strip") {
      const sIn = t.shortest === true;
      const decided = mode !== "s";
      const sLevel = t.s === t.a || t.s === t.b ? 1 : 0;
      const txt = mode === "strip" ? `s → ${t.text}` : decided ? (sIn ? "s inside ✓" : "s outside ✗") : "s";
      marks.push({ k: t.s, text: txt, cls: decided ? (sIn ? "tjr-red" : "tjr-grey") : "tjr-red", level: sLevel, ring: mode === "strip" });
    }
    if (mode === "closest") {
      const chosen = t.result.c;
      marks.push({ k: t.s, text: "s ✗", cls: "tjr-grey", level: 1 });
      marks.push({ k: t.c, text: `c${chosen === t.c ? " ✓" : ""}`, cls: chosen === t.c ? "tjr-red" : "", level: t.c === t.a || t.c === t.b ? 1 : 0, ring: chosen === t.c });
      marks.push({ k: t.c + 1n, text: `c + 1${chosen !== t.c ? " ✓" : ""}`, cls: chosen !== t.c ? "tjr-red" : "", level: t.c + 1n === t.b || t.c + 1n === t.a ? 1 : 0, ring: chosen !== t.c });
      half.push({ at: Number(t.c - origin) + 0.5, text: "½" });
    }
    drawRuler(lineBox, {
      origin, lo, hi, lower: t.lowerR, upper: t.upperR, x: t.xR, closed: t.closed, endLabels: ends,
      inside: mode === "interval" ? null : inside, marks, half,
      note: `ticks: 10${sup(t.F)} apart`,
    });
    lineBox.setAttribute("aria-label", `Ruler with ticks 10 to the ${t.F}. The interval runs from ${fmtR(t.lowerR, 3)} to ${fmtR(t.upperR, 3)} ticks; a = ${t.a}, b = ${t.b}, s = ${t.s}.`);
  }

  onResize(lineBox, () => { if (t) drawLine(steps[idx].view); });

  // Try buttons in the text.
  for (const b of document.querySelectorAll(".tjr-try")) {
    b.addEventListener("click", () => {
      const s = Number(b.dataset.step || 1) - 1;
      if (load(b.dataset.x, s)) {
        setParam("step", s === 0 ? null : String(s + 1));
        fig.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    });
  }

  const x0 = params.get("x") || "0.1";
  const s0 = Math.max(0, (Number.parseInt(params.get("step") || "1", 10) || 1) - 1);
  if (!load(x0, s0)) load("0.1", 0);
}

// ---------------------------------------------------------------------------
// 4. The 8-bit clock
// ---------------------------------------------------------------------------

function initClock() {
  const box = document.getElementById("tjr-clock-svg");
  if (!box) return;
  const modeGroup = document.getElementById("tjr-clock-mode");
  const range = document.getElementById("tjr-clock-n");
  const out = document.getElementById("tjr-clock-out");
  const readout = document.getElementById("tjr-clock-readout");
  let mode = Math.max(0, Math.min(2, Number(params.get("mode") || 0) || 0));
  const n0 = Number.parseInt(params.get("n") || "", 10);
  if (n0 >= 0 && n0 <= 255) range.value = String(n0);

  const S = 300, C = S / 2, R = 118;
  const svg = el("svg", { viewBox: `0 0 ${S} ${S}`, class: "tjr-svg tjr-clock", "aria-hidden": "true" });
  box.replaceChildren(svg);
  const pos = (v, rad = R) => {
    const a = -Math.PI / 2 + (v / 256) * 2 * Math.PI;
    return [C + rad * Math.cos(a), C + rad * Math.sin(a)];
  };
  svg.append(el("circle", { cx: C, cy: C, r: R, class: "tjr-clock-ring" }));
  const arc = el("path", { class: "tjr-clock-arc" });
  svg.append(arc);
  for (const v of [0, 64, 128, 192]) {
    const [x, y] = pos(v, R + 22);
    svg.append(el("text", { x, y: y + 4, "text-anchor": "middle", class: "tjr-small" }, String(v)));
  }
  const arcLabel = el("text", { x: C, y: C + 4, "text-anchor": "middle", class: "tjr-clock-center" });
  svg.append(arcLabel);
  const dots = [];
  for (let n = 0; n < 256; n++) {
    const cls = n % 10 === 0 ? "tjr-cd tjr-cd10" : n % 5 === 0 ? "tjr-cd tjr-cd5" : "tjr-cd";
    const d = el("circle", { cx: 0, cy: 0, r: 2.3, class: cls });
    svg.append(d);
    dots.push(d);
  }
  const pointer = el("circle", { cx: 0, cy: 0, r: 8, class: "tjr-cd-sel" });
  const pointerLabel = el("text", { x: C, y: C + 24, "text-anchor": "middle", class: "tjr-clock-center-small" });
  svg.append(pointer, pointerLabel);
  if (reduceMotion) svg.classList.add("tjr-nomotion");

  const valueOf = (n) => (mode === 0 ? n : mode === 1 ? clockMul(n) : clockRor(clockMul(n)));
  function arcPath(from, to) {
    const [x0, y0] = pos(from - 0.5, R);
    const [x1, y1] = pos(to + 0.5, R);
    const large = (to - from + 1) / 256 > 0.5 ? 1 : 0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  }

  function draw() {
    const n = Number(range.value);
    out.textContent = String(n);
    for (const b of modeGroup.querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.mode) === mode));
    for (let k = 0; k < 256; k++) {
      const [x, y] = pos(valueOf(k));
      dots[k].style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    }
    const [px, py] = pos(valueOf(n));
    pointer.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;
    if (mode === 0) { arc.setAttribute("d", ""); arcLabel.textContent = "n"; }
    else if (mode === 1) { arc.setAttribute("d", arcPath(0, CLOCK_BOUND5)); arcLabel.textContent = "× 205"; }
    else { arc.setAttribute("d", arcPath(0, CLOCK_BOUND10 - 1)); arcLabel.textContent = "× 205, ror 1"; }
    pointerLabel.textContent = `n = ${n} → ${valueOf(n)}`;

    const p = clockMul(n), q = clockRor(p);
    const lines = [`<div>n = ${n} = ${bits(n)}₂ · ${n % 10 === 0 ? "a multiple of 10" : n % 5 === 0 ? "an odd multiple of 5" : "not a multiple of 5"}</div>`];
    if (mode >= 1) {
      lines.push(`<div>${n} · 205 = ${n * 205} = ${Math.floor((n * 205) / 256)} · 256 + <strong>${p}</strong> → ${p} ${p <= CLOCK_BOUND5 ? `≤ 51 ✓ multiple of 5 (and ${p} = ${n} / 5)` : "&gt; 51 ✗ not a multiple of 5"}</div>`);
    }
    if (mode === 2) {
      const why = p % 2 === 1 ? " (odd: its low bit rotated to the top)" : "";
      lines.push(`<div>ror(${bits(p)}₂) = ${bits(q)}₂ = <strong>${q}</strong> → ${q < CLOCK_BOUND10 ? `&lt; 26 ✓ multiple of 10, and ${q} = ${n} / 10` : `≥ 26 ✗ not a multiple of 10${why}`}</div>`);
    }
    if (mode === 0) lines.push(`<div>Choose “n · 205 mod 256” to multiply every dot by the inverse of 5.</div>`);
    readout.innerHTML = lines.join("");
  }
  range.addEventListener("input", () => { setParam("n", range.value === "30" ? null : range.value); draw(); });
  for (const b of modeGroup.querySelectorAll("button")) {
    b.addEventListener("click", () => { mode = Number(b.dataset.mode); setParam("mode", mode === 0 ? null : String(mode)); draw(); });
  }
  draw();
}

// ---------------------------------------------------------------------------
// 5. minverse table and the 1e23 tie check
// ---------------------------------------------------------------------------

function initMinverse() {
  const table = document.getElementById("tjr-minverse");
  if (!table) return;
  const rows = MINVERSE.map((r) => `<tr><td>${r.f}</td><td>${r.pow5}</td><td><code>${hex(r.multiplier)}</code></td><td><code>${hex(r.bound)}</code></td></tr>`).join("");
  table.innerHTML = `<caption class="lab-sr-only">minverse table</caption><thead><tr><th>f</th><th>5<sup>f</sup></th><th>multiplier = 5<sup>−f</sup> mod 2<sup>64</sup></th><th>bound = ⌊2<sup>64</sup>/5<sup>f</sup>⌋</th></tr></thead><tbody>${rows}</tbody>`;
  const t = run(1e23);
  const R = MINVERSE[t.F];
  const prod = mulMod64(t.mb, R.multiplier);
  document.getElementById("tjr-tiecheck").innerHTML =
    `1e23: F = ${t.F}, m<sub>b</sub> = ${t.mb} (= 5<sup>23</sup>)<br>` +
    `m<sub>b</sub> · ${hex(R.multiplier)} mod 2<sup>64</sup> = <strong>${prod}</strong> ≤ bound ${R.bound} ✓<br>` +
    `So 5<sup>${t.F}</sup> divides m<sub>b</sub>, and the product is the quotient itself: ${t.mb} / ${R.pow5} = ${t.mb / R.pow5}.`;
}

// ---------------------------------------------------------------------------
// 6. The proof teaser: one row, proven live
// ---------------------------------------------------------------------------

function updateProof(t) {
  const box = document.getElementById("tjr-proof");
  if (!box) return;
  const rowsToShow = [];
  if (t.route !== "small-int") rowsToShow.push([t.F, `row F = ${num(t.F)}, used by x = ${esc(t.js)}`]);
  else rowsToShow.push([log10pow2(t.e), `x = ${esc(t.js)} is a small integer and uses no row; here is row F = ${num(log10pow2(t.e))}`]);
  if (rowsToShow[0][0] !== -199) rowsToShow.push([-199, "row F = −199, the tightest of all 617"]);
  box.innerHTML = rowsToShow.map(([F, label]) => {
    const R = row(F), p = proveRow(F);
    const ad = F <= 0 ? `5<sup>${-F}</sup> / 2<sup>${R.delta.toString(2).length - 1}</sup>` : `2<sup>${R.alpha.toString(2).length - 1}</sup> / 5<sup>${F}</sup>`;
    return `<div>${label}: α/δ = ${ad}. Proof run in your browser just now: ${p.ok ? "<strong>exact floor for every operand</strong>" : "FAILED"}, margin ${p.marginBits.toFixed(2)} bits.</div>`;
  }).join("");
}

initDecade();
initStairs();
initKernel();
initClock();
initMinverse();
