// Copyright (C) 2026 Toit contributors.
//
// DOM and interaction code for explore/dragonbox-window.html.
// All numbers come from dragonbox-window-model.js (exact BigInt arithmetic).

import * as M from "./dragonbox-window-model.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pct = (count, n, digits = 2) => `${((100 * count) / n).toFixed(digits)}%`;
const sup = (n) => `<sup>${String(n).replace("-", "−")}</sup>`;
const minus = (n) => String(n).replace("-", "−");

const PRESETS = [
  ["0.1", 0.1], ["2/3", 2 / 3], ["5e-324", 5e-324], ["π", Math.PI], ["0.3", 0.3],
  ["0.1+0.2", 0.1 + 0.2], ["max double", Number.MAX_VALUE], ["123.456", 123.456], ["1e23", 1e23],
];
const FRAMES = ["0 · Recall", "1 · Magnify", "2 · Two rulers", "3 · Last three digits", "4 · Decide", "5 · Read off"];
const FOG_CASES = [
  { label: "0.00093 · r = δᵢ", x: 0.00093, kind: "x" },
  { label: "0.0013800000000000002 · dist = 200", x: 0.0013800000000000002, kind: "y" },
  { label: "18014398509481988 · excluded end", x: 18014398509481988, kind: "excl" },
];
const SHORTER_CASES = [["1.0", 1], ["2^53", 2 ** 53], ["2^64", 2 ** 64]];

const state = { x: 0.1, frame: 0, kappa: 2, fog: 0, fogReveal: false, p2: 2, step: 0 };
let model = null; // windowModel(state.x)
let run = null; // compute_nearest(state.x)

// ---------------------------------------------------------------------------
// Parsing and URL state.
function parseDouble(text) {
  const t = String(text).trim().replace(/[\s_ ]/g, "").replace(/^π$|^pi$/i, String(Math.PI));
  let m;
  if ((m = t.match(/^(-?[\d.]+(?:e-?\d+)?)\/([\d.]+(?:e-?\d+)?)$/i))) return Number(m[1]) / Number(m[2]);
  if ((m = t.match(/^2(?:\^|\*\*)(-?\d+)$/))) return 2 ** Number(m[1]);
  if ((m = t.match(/^(-?[\d.]+(?:e[+-]?\d+)?)\+(-?[\d.]+(?:e[+-]?\d+)?)$/i))) return Number(m[1]) + Number(m[2]);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return NaN;
  return Number(t);
}

function readUrl() {
  const q = new URLSearchParams(location.search);
  if (q.has("x")) {
    const v = parseDouble(q.get("x"));
    if (M.isUsable(v)) state.x = Math.abs(v);
  }
  const int = (name, lo, hi) => {
    if (!q.has(name)) return;
    const v = Number(q.get(name));
    if (Number.isInteger(v) && v >= lo && v <= hi) state[name === "f" ? "frame" : name] = v;
  };
  int("f", 0, FRAMES.length - 1);
  int("kappa", 0, 3);
  int("fog", 0, FOG_CASES.length - 1);
  int("p2", 0, SHORTER_CASES.length - 1);
  if (q.get("reveal") === "1") state.fogReveal = true;
  if (q.get("rare") === "1") $("dbw-rare-details").open = true;
  if (q.has("step")) state.step = Math.max(0, Number(q.get("step")) || 0);
}

function writeUrl() {
  const q = new URLSearchParams();
  q.set("x", String(state.x));
  q.set("f", state.frame);
  if (state.kappa !== 2) q.set("kappa", state.kappa);
  if (state.fog) q.set("fog", state.fog);
  if (state.fogReveal) q.set("reveal", "1");
  if (state.p2 !== 2) q.set("p2", state.p2);
  if (state.step) q.set("step", state.step);
  if ($("dbw-rare-details").open) q.set("rare", "1");
  history.replaceState(null, "", `${location.pathname}?${q}${location.hash}`);
}

// ---------------------------------------------------------------------------
// SVG helpers.  Each SVG is drawn at the container's pixel width so that text
// keeps its size on phones.
function widthOf(el) {
  return Math.max(300, Math.min(1040, Math.floor(el.clientWidth || 700)));
}
function svg(W, H, body, label) {
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">${body}</svg>`;
}
const T = (x, y, s, cls = "", anchor = "middle", extra = "") =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" class="${cls}" ${extra}>${s}</text>`;
const line = (x1, y1, x2, y2, cls) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`;
const rect = (x, y, w, h, cls, extra = "") => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${h.toFixed(1)}" class="${cls}" ${extra}/>`;
const circ = (x, y, r, cls) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" class="${cls}"/>`;

// Last digits of a (possibly huge) non-negative integer offset from a base.
function lastDigits(base, offset, n = 4) {
  const v = base + BigInt(offset);
  if (v < 0n) return minus(v.toString());
  const s = v.toString();
  return s.length <= n ? s : `…${s.slice(-n)}`;
}

// Split ⌊z⌋ into prefix | last three digits.
function splitZ(zi, n = 3) {
  const s = zi.toString().padStart(n, "0");
  return `<span class="dbw-prefix">${s.slice(0, -n) || "0"}</span><span class="dbw-sep">|</span><span class="dbw-last">${s.slice(-n)}</span>`;
}
function fmtOut(sig, exp) { return `${sig} × 10${sup(exp)}`; }

// ---------------------------------------------------------------------------
// Section 2: the window.
function setX(x, { keepFrame = true } = {}) {
  state.x = x;
  model = M.windowModel(x);
  run = model.result;
  state.step = 0;
  if (!keepFrame) state.frame = 0;
  $("dbw-input").value = String(x);
  $("dbw-error").hidden = true;
  for (const b of $("dbw-presets").children) b.setAttribute("aria-pressed", String(Number(b.dataset.x) === x));
  renderAll();
}

function renderAll() {
  renderWindow();
  renderKappa();
  renderCode();
  renderLimbs();
  renderFlow();
  renderSidebars();
  writeUrl();
}

function stripFrame(W, m, opts) {
  // Generic "cell" strip: [L, C] relative to the cell start; fine ticks every S.
  const { C, S, L, xRel, yRel, zRel, delta, decide, candidate, fineInside, zLabel, header } = opts;
  const pad = 28;
  const R = C;
  const px = (v) => pad + ((v - L) / (R - L)) * (W - 2 * pad);
  const yAxis = 150;
  const H = 236;
  let b = "";
  if (header) b += `<text x="${pad}" y="26" class="dbw-big" text-anchor="start">⌊z⌋ = ${header}</text>`;
  // Previous cell (hatched) and current cell.
  if (L < 0) b += rect(px(L), yAxis - 88, px(0) - px(L), 118, "dbw-prevcell");
  b += rect(px(0), yAxis - 88, px(C) - px(0), 118, "dbw-cell");
  if (L < 0 && px(0) - px(L) > 90) b += T((px(L) + px(0)) / 2, yAxis - 94, "previous cell", "dbw-small dbw-muted");
  b += T((px(0) + px(C)) / 2, yAxis - 94, `the ${C}-cell that holds z`, "dbw-small dbw-muted");
  b += line(px(L), yAxis, px(R), yAxis, "dbw-axis");
  // Ticks.
  const first = Math.ceil(L / S) * S;
  const labelEvery = (R - L) / S > 14 || W < 520 ? 2 : 1;
  for (let v = first; v <= R + 1e-9; v += S) {
    const coarse = Math.abs(v % C) < 1e-9;
    b += line(px(v), yAxis - (coarse ? 30 : 12), px(v), yAxis + (coarse ? 30 : 12), coarse ? "dbw-tick-coarse" : "dbw-tick-fine");
    const idx = Math.round(v / S);
    if (coarse || idx % labelEvery === 0) {
      const width = String(C).length - 1;
      const lab = v < 0 ? minus(v) : v === C ? String(C) : String(v).padStart(width, "0");
      b += T(px(v), yAxis + 46, lab, coarse ? "dbw-red" : "dbw-muted dbw-small");
    }
  }
  // Interval bar.
  const x0 = Math.max(xRel, L), x1 = Math.min(zRel, R);
  b += rect(px(x0), yAxis - 9, px(x1) - px(x0), 18, "dbw-band");
  const endCls = m.decoded.closed ? "dbw-end-closed" : "dbw-end-open";
  if (xRel >= L) b += circ(px(xRel), yAxis, 5, `${endCls} dbw-implied-end`);
  b += circ(px(zRel), yAxis, 5, endCls);
  // Width dimension line.
  const dimY = yAxis - 24;
  b += line(px(x0), dimY, px(x1), dimY, "dbw-dim");
  const dRight = px(x1) + 8 + 90 < W;
  b += T(dRight ? px(x1) + 8 : px(x0) - 8, dimY + 4, `δ = ${delta}`, "dbw-small dbw-blue", dRight ? "start" : "end");
  const anchorAt = (x, room = 100) => (x < pad + room ? "start" : x > W - pad - room ? "end" : "middle");
  b += T(px(zRel), yAxis + 66, zLabel, "dbw-blue", anchorAt(px(zRel), 70));
  if (xRel >= L) {
    b += line(px(xRel), yAxis - 60, px(xRel), yAxis - 8, "dbw-leader");
    b += T(px(xRel), yAxis - 64, "x: implied, never computed", "dbw-small dbw-muted", anchorAt(px(xRel)));
  }
  if (yRel >= L) {
    b += circ(px(yRel), yAxis, 4, "dbw-implied");
    if (decide === "fine") {
      b += line(px(yRel), yAxis - 44, px(yRel), yAxis - 8, "dbw-leader");
      b += T(px(yRel), yAxis - 48, "y: implied centre", "dbw-small dbw-muted", anchorAt(px(yRel), 70));
    }
  }
  // Decision overlay.
  if (decide === "big") {
    b += circ(px(0), yAxis, 11, "dbw-pick");
    b += T(px(0), yAxis + 84, "the coarse tick is inside", "dbw-strong", anchorAt(px(0)));
  } else if (decide === "fine") {
    for (const v of fineInside) b += circ(px(v), yAxis, 4, "dbw-candidate");
    b += circ(px(candidate), yAxis, 10, "dbw-pick");
    b += T(px(candidate), yAxis + 84, "fine tick nearest to y", "dbw-strong", anchorAt(px(candidate)));
  }
  return { body: b, H };
}

function fineTicksInside(m, L) {
  const out = [];
  for (let v = Math.ceil(Math.max(m.xRel, L) / 100) * 100; v <= m.zRel; v += 100) {
    if (m.decoded.closed || (v > m.xRel && v < m.zRel)) out.push(v);
  }
  return out;
}

function renderWindow() {
  const m = model;
  const host = $("dbw-window-svg");
  const W = widthOf(host);
  const chips = $("dbw-frame-chips");
  [...chips.children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === state.frame)));
  $("dbw-prev-frame").disabled = state.frame === 0;
  $("dbw-next-frame").disabled = state.frame === FRAMES.length - 1;
  const f = state.frame;
  let body = "", H = 200, text = "", label = "";
  const d = m.decoded;
  const xs = String(state.x);
  if (f <= 1 || m.shorter) {
    ({ body, H } = lineFrame(W, m, Math.min(f, 1)));
    if (f === 0) {
      label = `Frame 0: the rounding interval of ${xs}`;
      text = `<p><b>${esc(xs)}</b> is stored as w = ${d.fc} × 2${sup(d.e)} = ${M.fmtSig(m.w, 26)}</p>
        <p>Every decimal between the two midpoints reads back as w: the interval runs from ${M.fmtSig(m.lower, 22)} to ${M.fmtSig(m.upper, 22)}. f<sub>c</sub> is ${d.closed ? "even, so both ends are <b>included</b>" : "odd, so both ends are <b>excluded</b>"}. ${m.shorter ? "This is a power of two, so the lower neighbour is only half as far away and the interval is lopsided." : `Its width is exactly 2${sup(d.e)}.`}</p>`;
    } else {
      label = `Frame 1: the interval of ${xs} magnified by 10 to the ${m.k}`;
      text = m.shorter ? shorterFrameText(m) : magnifyText(m);
    }
    if (m.shorter && f >= 2) {
      text += `<p class="dbw-note-box">Powers of two take a separate, Schubfach-like path, so the three-digit window doesn't apply. <a href="#shorter">See “Powers of two”</a> and <a href="#code">the real code</a>.</p>`;
    }
  } else if (f === 2) {
    ({ body, H } = rulersFrame(W, m));
    label = `Frame 2: coarse ticks every 1000 and fine ticks every 100 around the interval of ${xs}`;
    text = `<p>Two rulers on the magnified line. <span class="dbw-red">Coarse ticks every 1000</span> are the shortest candidates; <span class="dbw-red">fine ticks every 100</span> have one more digit.</p>
      <p>δ = ${M.ratFixed(m.deltas)} is <b>below 1000</b>, so at most one coarse tick fits in the interval. It is <b>at least 100</b>, so at least one fine tick always fits.</p>`;
  } else {
    const L = Math.min(0, Math.floor((m.xRel - 50) / 100) * 100);
    const decide = f >= 4 ? (run.path === "big" ? "big" : "fine") : null;
    const zLabel = `z = …${M.ratFixed(M.ratSub(m.zs, { num: (m.zi / 1000n) * 1000n, den: 1n })).padStart(6, "0")}`;
    ({ body, H } = stripFrame(W, m, {
      C: 1000, S: 100, L, xRel: m.xRel, yRel: m.yRel, zRel: m.zRel, delta: M.ratFixed(m.deltas), decide,
      candidate: m.candidate, fineInside: fineTicksInside(m, L), zLabel, header: splitZSvgN(m.zi, 3),
    }));
    label = `Frame ${f}: the 1000-wide window around z for ${xs}`;
    text = f === 3 ? lastDigitsText(m) : f === 4 ? decideText(m) : readOffText(m);
  }
  host.innerHTML = svg(W, H, body, label);
  $("dbw-frame-text").innerHTML = text;
  renderReadout();
}

function lineFrame(W, m, f) {
  const H = f === 0 ? 176 : 196;
  const y = 92;
  const px = (t) => W * (0.5 + 0.4 * t); // t in [-1, 1]: -1 prev, 0 w, +1 next
  const prevT = m.shorter ? -0.5 : -1;
  const lo = prevT / 2, hi = 0.5;
  let b = "";
  b += line(px(-1.15), y, px(1.15), y, "dbw-axis");
  b += rect(px(lo), y - 10, px(hi) - px(lo), 20, "dbw-band");
  const endCls = m.decoded.closed ? "dbw-end-closed" : "dbw-end-open";
  b += circ(px(lo), y, 5, endCls) + circ(px(hi), y, 5, endCls);
  b += circ(px(prevT), y, 4, "dbw-double") + circ(px(1), y, 4, "dbw-double") + circ(px(0), y, 6.5, "dbw-double");
  if (f === 0) {
    b += T(px(prevT), y - 18, "previous", "dbw-small dbw-muted") + T(px(1), y - 18, "next", "dbw-small dbw-muted");
    b += T(px(0), y - 18, "w", "dbw-blue dbw-strong");
    b += T(px(lo), y + 30, "midpoint", "dbw-small dbw-muted") + T(px(hi), y + 30, "midpoint", "dbw-small dbw-muted");
    b += line(px(lo), y + 46, px(hi), y + 46, "dbw-dim");
    b += T((px(lo) + px(hi)) / 2, y + 64, m.shorter ? `width ¾ · 2^${minus(m.decoded.e)}` : `width 2^${minus(m.decoded.e)}`, "dbw-blue");
    b += T(W / 2, 24, "unscaled: the double and its rounding interval", "dbw-small dbw-muted");
  } else {
    const digits = 2;
    b += T(W / 2, 24, `× 10^${minus(m.k)}`, "dbw-big dbw-red");
    b += T(px(hi), y - 22, `z = ${M.group3(M.ratFixed(m.zs, digits))}`, "dbw-blue", "end");
    b += T(px(lo), y + 34, `x = ${M.group3(M.ratFixed(m.xs, digits))} (implied)`, "dbw-muted", "start");
    b += T(px(0), y + 56, `y = w·10^${minus(m.k)} = ${M.group3(M.ratFixed(m.ys, digits))}`, "dbw-muted", "middle");
    b += line(px(lo), y + 70, px(hi), y + 70, "dbw-dim");
    b += T((px(lo) + px(hi)) / 2, y + 88, `δ = ${M.ratFixed(m.deltas, digits)}`, "dbw-blue dbw-strong");
  }
  return { body: b, H };
}

function magnifyText(m) {
  const e = m.decoded.e;
  const fl = M.floor_log10_pow2(e);
  const rows = m.zoomChoices.map(({ k, delta }) => {
    const v = M.ratToNumber(delta);
    const verdict = k === m.k ? "✓ between 100 and 1000" : v < 100 ? "too fine a grid: the interval could miss every multiple of 100" : "too coarse: two multiples of 1000 could fit";
    return `<li>× 10${sup(k)}: δ = ${v < 1e6 ? M.ratFixed(delta) : M.fmtSig(delta, 6)} <span class="${k === m.k ? "dbw-ok" : "dbw-muted"}">${verdict}</span></li>`;
  }).join("");
  return `<p>Multiply everything by 10<sup>k</sup> with k = 2 − ⌊e · log<sub>10</sub> 2⌋ = 2 − ⌊${minus(e)} · 0.30103⌋ = 2 − (${minus(fl)}) = <b>${minus(m.k)}</b>. The width becomes δ = 2${sup(e)} · 10${sup(m.k)} = ${M.ratFixed(m.deltas)}.</p>
    <ul class="dbw-zoom-list">${rows}</ul>
    <p>Only z = ${M.group3(M.ratFixed(m.zs))} is computed, by one multiplication. δ comes from the table entry by a shift. x and y are never computed.</p>`;
}

function shorterFrameText(m) {
  return `<p>Multiply by 10<sup>k</sup> with k = −⌊log<sub>10</sub>(¾ · 2${sup(m.decoded.e)})⌋ = <b>${minus(m.k)}</b>, so the width ${M.ratFixed(m.deltas, 3)} lies in [1, 10). The shorter-interval path computes both ends from the cache entry alone.</p>`;
}

function rulersFrame(W, m) {
  const L = Math.min(-200, Math.floor((m.xRel - 150) / 100) * 100);
  const R = 1200;
  const pad = 28;
  const px = (v) => pad + ((v - L) / (R - L)) * (W - 2 * pad);
  const H = 214;
  const yC = 70, yF = 150;
  const base = (m.zi / 1000n) * 1000n;
  let b = "";
  b += T(pad, 20, "every 1000", "dbw-small dbw-red", "start");
  b += T(pad, yF - 38, "every 100", "dbw-small dbw-red", "start");
  // Interval band across both rulers.
  const x0 = Math.max(m.xRel, L);
  b += rect(px(x0), yC - 16, px(m.zRel) - px(x0), yF - yC + 32, "dbw-band dbw-band-soft");
  b += line(px(L), yC, px(R), yC, "dbw-axis") + line(px(L), yF, px(R), yF, "dbw-axis");
  for (let v = Math.ceil(L / 1000) * 1000; v <= R; v += 1000) {
    b += line(px(v), yC - 22, px(v), yC + 22, "dbw-tick-coarse");
    b += T(px(v), yC + 38, lastDigits(base, v), "dbw-red");
  }
  for (let v = Math.ceil(L / 100) * 100; v <= R; v += 100) {
    b += line(px(v), yF - 10, px(v), yF + 10, v % 1000 === 0 ? "dbw-tick-coarse" : "dbw-tick-fine");
  }
  const endCls = m.decoded.closed ? "dbw-end-closed" : "dbw-end-open";
  for (const yy of [yC, yF]) {
    if (m.xRel >= L) b += circ(px(m.xRel), yy, 4, `${endCls} dbw-implied-end`);
    b += circ(px(m.zRel), yy, 4, endCls);
  }
  b += T(px(m.zRel), yF + 30, "z", "dbw-blue dbw-strong");
  if (m.xRel >= L) b += T(px(m.xRel), yF + 30, "x (implied)", "dbw-small dbw-muted");
  b += line(px(x0), yF + 44, px(m.zRel), yF + 44, "dbw-dim");
  b += T((px(x0) + px(m.zRel)) / 2, yF + 60, `δ = ${M.ratFixed(m.deltas)}`, "dbw-blue");
  return { body: b, H };
}

function lastDigitsText(m) {
  const s = m.zi / 1000n;
  return `<p>Keep only the cell of 1000 that holds z. ⌊z⌋ = ${splitZ(m.zi)} splits into the prefix s = ${s} and the <b>last three digits r = ${m.r}</b>.</p>
    <p>The interval ends at z and reaches back δ = ${M.ratFixed(m.deltas)}. Its integer part is δ<sub>i</sub> = ${m.deltai}. The coarse tick at the cell's start is inside exactly when the bar reaches back past it, which is when <b>r &lt; δ<sub>i</sub></b>.</p>`;
}

function decideText(m) {
  const r = run;
  const s = m.zi / 1000n;
  if (r.path === "big") {
    const eq = r.reason === "eq";
    return `<p>${eq
      ? `r = ${m.r} = δ<sub>i</sub>: the integer parts are too close to call. One parity bit of ⌊x⌋ (see <a href="#rare">rare cases</a>) shows that x ${r.x_result.parity ? "lies just below the tick" : "is exactly the tick, and the interval is closed"}, so the tick is inside.`
      : `r = ${m.r} &lt; δ<sub>i</sub> = ${m.deltai}: the bar reaches back past the coarse tick 1000 · s, so that tick is inside the interval.`}</p>
      <p>It is the only multiple of 1000 inside, so it is the shortest candidate: s = ${s}. No lower end, no centre, and no second multiplication was needed.</p>`;
  }
  const dist = r.dist;
  const half = m.deltai / 2n;
  const why = r.reason === "excluded"
    ? `r = 0 and z is an exact integer, but f<sub>c</sub> is odd, so the interval is open: the coarse tick is the excluded right end. The code sets s ← s − 1 and r ← 1000, then continues.`
    : r.reason === "eq"
      ? `r = δ<sub>i</sub> = ${m.deltai}, and one parity bit shows that x lies just above the tick, so the tick is outside (see <a href="#rare">rare cases</a>).`
      : `r = ${m.r} &gt; δ<sub>i</sub> = ${m.deltai}: the bar doesn't reach the coarse tick, so no multiple of 1000 is inside.`;
  const rr = r.reason === "excluded" ? 1000n : m.r;
  let fix = "";
  if (r.divisible) {
    fix = `<p class="dbw-note-box">dist is divisible by 100, so y sits within one unit of the midpoint between two fine ticks. The code checks the parity of ⌊y⌋ (see <a href="#rare">rare cases</a>): ${r.yFix === "parity" ? "it differs from the estimate, so y is just below the midpoint and the digit drops by one." : r.yFix === "tie" ? "y is exactly the midpoint, a tie, broken toward the even digit." : "it matches, so y is at or above the midpoint and the digit stands."}</p>`;
  }
  return `<p>${why}</p>
    <p>At least one fine tick is always inside. Take the one nearest the centre y = z − δ/2, again without computing y: dist = r − ⌊δ<sub>i</sub>/2⌋ + 50 = ${rr} − ${half} + 50 = <b>${dist}</b>, so the digit is ⌊${dist}/100⌋ = <b>${dist / 100n}</b>.</p>${fix}`;
}

function readOffText(m) {
  const r = run;
  const s = m.zi / 1000n;
  const k = m.k;
  const readBack = model.readsBack ? `<span class="dbw-ok">✓ reads back as the same double</span>` : `<span class="dbw-bad">✗ does not read back</span>`;
  if (r.path === "big") {
    const zeros = r.removed;
    return `<p>The coarse tick is 1000 · s on the magnified line. Undo the magnification: ${fmtOut(s, 3 - k)}.</p>
      <p>Strip ${zeros} trailing zero${zeros === 1 ? "" : "s"}: <b>${fmtOut(r.significand, r.exponent)}</b> = <b class="dbw-red">${esc(model.text)}</b> ${readBack}</p>`;
  }
  return `<p>The fine tick is 100 · (10 · s + digit) on the magnified line. Undo the magnification: (10 · ${r.significand / 10n} + ${r.significand % 10n}) × 10${sup(2 - k)}.</p>
    <p><b>${fmtOut(r.significand, r.exponent)}</b> = <b class="dbw-red">${esc(model.text)}</b>. That is ${r.significand.toString().length} digits, and it never ends in 0. ${readBack}</p>`;
}

function renderReadout() {
  const m = model, r = run, d = m.decoded;
  const rows = [];
  const row = (k, v) => rows.push(`<tr><th scope="row">${k}</th><td>${v}</td></tr>`);
  row("double", `${esc(String(state.x))}`);
  row("f<sub>c</sub>, e", `${d.fc}, ${minus(d.e)}${d.subnormal ? " (subnormal)" : ""}`);
  row("k", minus(m.k));
  if (m.shorter) {
    row("x, z (scaled)", `${M.group3(M.ratFixed(m.xs, 3))}, ${M.group3(M.ratFixed(m.zs, 3))}`);
    row("branch", `shorter interval (power of two): ${r.path === "shorter-big" ? "multiple of 10 inside" : "round the centre"}`);
  } else {
    row("⌊z⌋", splitZ(m.zi));
    row("δ, δ<sub>i</sub>", `${M.ratFixed(m.deltas)}, ${m.deltai}`);
    row("r", `${m.r} ${m.r < m.deltai ? "&lt;" : m.r > m.deltai ? "&gt;" : "="} δ<sub>i</sub>`);
    const branch = r.path === "big"
      ? `coarse (big divisor)${r.reason === "eq" ? ", after an x-parity check" : ""}`
      : `fine (small divisor), dist = ${r.dist}${r.reason === "excluded" ? ", after excluding the right end" : r.reason === "eq" ? ", after an x-parity check" : ""}${r.divisible ? ", y-parity check" : ""}`;
    row("branch", branch);
  }
  row("output", `${fmtOut(r.significand, r.exponent)} = <strong>${esc(model.text)}</strong>`);
  $("dbw-readout").innerHTML = `<caption class="lab-sr-only">Readout</caption><tbody>${rows.join("")}</tbody>`;
}

// ---------------------------------------------------------------------------
// Rare cases: fog.
function renderFog() {
  const c = FOG_CASES[state.fog];
  [...$("dbw-fog-chips").children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === state.fog)));
  const reveal = state.fogReveal;
  const btn = $("dbw-fog-reveal");
  btn.setAttribute("aria-pressed", String(reveal));
  btn.textContent = reveal ? "Hide the extra bit" : c.kind === "excl" ? "Ask whether z is an integer" : "Ask for one parity bit";
  const m = M.windowModel(c.x);
  const r = m.result;
  const host = $("dbw-fog-svg");
  const W = widthOf(host);
  const pad = 26;
  const H = 190;
  const y = 100;
  const base = (m.zi / 1000n) * 1000n;
  let D;
  if (c.kind === "x") D = Number(m.r - m.deltai);
  else if (c.kind === "y") D = Number(m.r - m.deltai / 2n);
  else D = 0;
  const L = D - 4, R = D + 4;
  const px = (v) => pad + ((v - L) / (R - L)) * (W - 2 * pad);
  let b = line(px(L), y, px(R), y, "dbw-axis");
  for (let v = L; v <= R; v++) {
    const special = (c.kind !== "y" && v === 0);
    b += line(px(v), y - (special ? 34 : 10), px(v), y + (special ? 34 : 10), special ? "dbw-tick-coarse" : "dbw-tick-fine");
    b += T(px(v), y + 50, lastDigits(base, v, 3), special ? "dbw-red" : "dbw-muted dbw-small");
  }
  let text = "";
  if (c.kind === "x") {
    // Band from x to z (z far right).
    const bandFrom = reveal ? m.xRel : D + 1;
    b += rect(px(bandFrom), y - 8, px(R) - px(bandFrom), 16, "dbw-band");
    b += T(px(R), y - 44, "z is 108 units further →", "dbw-small dbw-muted", "end");
    b += rect(px(D - 1), y - 22, px(D + 1) - px(D - 1), 44, "dbw-fog");
    b += T(px(D), 24, "x = ⌊z⌋ − δᵢ ± 1: somewhere in the fog", "dbw-small", "middle");
    b += T(px(0), y - 40, "tick 1000·s", "dbw-small dbw-red");
    if (reveal) {
      b += circ(px(m.xRel), y, 6, "dbw-exact");
      b += T(px(m.xRel), y + 72, `x = …${M.ratFixed(M.ratSub(m.xs, { num: base - 1000n, den: 1n })).slice(-6)}`, "dbw-blue dbw-strong");
    }
    text = `<p><b>0.00093</b>: ⌊z⌋ = ${splitZ(m.zi)} and δ<sub>i</sub> = ${m.deltai}, so <b>r = δ<sub>i</sub></b>. The integer estimate of x is exactly the tick. The true x could be up to one unit either side, so the integers can't tell whether the tick is inside.</p>` +
      (reveal
        ? `<p><code>compute_mul_parity(two_fc − 1, cache, beta)</code> says ⌊x⌋ is <b>${r.x_result.parity ? "odd" : "even"}</b>. The tick 1000 · s is even, so ⌊x⌋ = …999: x = …999.84 lies below the tick. The tick is inside. Output <b>${fmtOut(r.significand, r.exponent)}</b> = ${esc(m.text)}.</p>`
        : `<p>Which is it? Ask for the parity of ⌊x⌋.</p>`);
  } else if (c.kind === "y") {
    b += rect(px(L), y - 8, px(R) - px(L), 16, "dbw-band dbw-band-soft");
    b += line(px(D), y - 34, px(D), y + 34, "dbw-mid");
    b += T(px(D), y - 40, "halfway between …100 and …200", "dbw-small dbw-red");
    b += rect(px(D - 1), y - 22, px(D + 1) - px(D - 1), 44, "dbw-fog");
    b += T(px(D), 24, "y = ⌊z⌋ − ⌊δᵢ/2⌋ ± 1: somewhere in the fog", "dbw-small");
    if (reveal) {
      b += circ(px(m.yRel), y, 6, "dbw-exact");
      b += T(px(m.yRel), y + 72, `y = …${M.ratFixed(M.ratSub(m.ys, { num: base, den: 1n }))}`, "dbw-blue dbw-strong");
    }
    text = `<p><b>0.0013800000000000002</b>: r = ${m.r} &gt; δ<sub>i</sub> = ${m.deltai}, so the fine path runs. The estimate of y is r − ⌊δ<sub>i</sub>/2⌋ = ${m.r - m.deltai / 2n}, exactly halfway between the fine ticks …100 and …200. The code notices because dist = ${r.dist} is divisible by 100. The true y might be just below the midpoint (round down) or at or above it (round up).</p>` +
      (reveal
        ? `<p><code>compute_mul_parity(two_fc, cache, beta)</code> says ⌊y⌋ is <b>${r.y_result.parity ? "odd" : "even"}</b>, the same parity as the estimate 150. So ⌊y⌋ = 150, and y = 150.15 is at or above the midpoint: round up, digit 2. y is not an integer, so this is no tie. Output <b>${fmtOut(r.significand, r.exponent)}</b>.</p>
          <p class="dbw-muted-p">Had the parities differed, ⌊y⌋ would be 149 and the digit would drop by one. Had y been an exact integer, it would be a true tie, broken toward the even digit.</p>`
        : `<p>Ask for the parity of ⌊y⌋.</p>`);
  } else {
    b += rect(px(L), y - 8, px(0) - px(L), 16, "dbw-band");
    b += T(px(L), y - 44, "← x is 400 units back", "dbw-small dbw-muted", "start");
    b += T(px(0), y - 40, "tick 1000·s", "dbw-small dbw-red");
    if (!reveal) {
      b += rect(px(0), y - 22, px(1) - px(0), 44, "dbw-fog");
      b += T(px(0.5), 24, "z = ⌊z⌋ + [0, 1)", "dbw-small");
    } else {
      b += circ(px(0), y, 7, "dbw-end-open");
      b += T(px(0), y + 72, "z = …000 exactly, excluded", "dbw-blue dbw-strong");
    }
    text = `<p><b>18014398509481988</b> = 2<sup>54</sup> + 4 has an odd significand, so its interval is <b>open</b>. ⌊z⌋ = ${splitZ(m.zi)}: r = 0 &lt; δ<sub>i</sub> = ${m.deltai}. The tick 1000 · s is inside, unless z is exactly that tick.</p>` +
      (reveal
        ? `<p>The middle word of the 192-bit product is zero, so <code>z_result.is_integer</code> is true: z sits exactly on the tick, and the tick is the excluded end. The code sets s ← s − 1 and r ← 1000, and the fine path picks …800. Output <b>${fmtOut(r.significand, r.exponent)}</b> = ${esc(m.text)}.</p>`
        : `<p>This needs no extra multiplication: the product already says whether z is an integer.</p>`);
  }
  host.innerHTML = svg(W, H, b, `Rare case ${c.label}`);
  $("dbw-fog-text").innerHTML = text;
}

// ---------------------------------------------------------------------------
// The kappa knob.
function renderKappa() {
  const kappa = state.kappa;
  $("dbw-kappa").value = kappa;
  $("dbw-kappa-out").textContent = kappa;
  $("dbw-kappa-using").innerHTML = `using ${esc(String(state.x))} from the window above`;
  const host = $("dbw-kappa-svg");
  const W = widthOf(host);
  const d = M.decode(state.x);
  if (d.shorter) {
    host.innerHTML = "";
    $("dbw-kappa-text").innerHTML = `<p class="dbw-note-box">${esc(String(state.x))} is a power of two and takes the shorter-interval path, which always works at the κ = 0 scale. Pick another double to turn the knob.</p>`;
  } else {
    const v = M.kappaView(state.x, kappa);
    const C = Number(v.big), S = Number(v.small);
    const L = Math.min(0, Math.floor((v.xRel - C / 20) / S) * S);
    const zBase = v.s * v.big;
    const zLabel = `z = …${M.ratFixed(M.ratSub(v.zs, { num: zBase, den: 1n }))}`;
    const m = { decoded: d };
    const fine = [];
    const s = stripFrame(W, m, { C, S, L, xRel: v.xRel, yRel: v.yRel, zRel: v.zRel, delta: M.ratFixed(v.ds), decide: null, candidate: 0, fineInside: fine, zLabel, header: splitZSvgN(v.zi, kappa + 1) });
    host.innerHTML = svg(W, s.H, s.body, `Window at kappa ${kappa}`);
    const cmp = v.r < v.deltai ? "&lt;" : v.r > v.deltai ? "&gt;" : "=";
    let verdict;
    if (v.cat === "eq") verdict = `<b>r = δ<sub>i</sub></b>: the integer parts can't tell whether x is below the coarse tick. This double needs the parity of ⌊x⌋.`;
    else if (v.coarseInside) verdict = `r &lt; δ<sub>i</sub>: the coarse tick is inside, decided from integers alone.`;
    else if (v.fineCheck) verdict = kappa === 0
      ? `No coarse tick fits. At κ = 0 the fine ticks are the integers themselves, so rounding y needs its fractional part. Schubfach computes y for exactly this reason.`
      : `No coarse tick fits, and the estimate of y lands on a midpoint between fine ticks: this double needs the parity of ⌊y⌋.`;
    else verdict = `No coarse tick fits; the nearest fine tick to y is decided from integers alone.`;
    $("dbw-kappa-text").innerHTML = `<p>κ = ${kappa}: magnify by 10${sup(v.k)}, coarse ticks every ${C}, fine ticks every ${S}. ⌊z⌋ = ${splitZ(v.zi, kappa + 1)}, δ = ${M.ratFixed(v.ds)} (δ<sub>i</sub> = ${v.deltai}), r = ${v.r} ${cmp} δ<sub>i</sub>.</p><p>${verdict}</p>`;
  }
  renderRates();
  renderRegister();
  const st = M.KAPPA_STATS;
  $("dbw-kappa-caption").innerHTML = `Rates from ${st.n.toLocaleString("en-US")} random bit patterns (seeded; exact arithmetic; recomputed by this page's tests). A coarse tick is inside for ${pct(st.rows[0].coarse, st.n, 1)} of them at every κ: that is a property of the doubles, not of the algorithm.`;
}

function splitZSvgN(zi, n) {
  const s = zi.toString().padStart(n, "0");
  return `<tspan class="dbw-muted">${s.slice(0, -n) || "0"}|</tspan><tspan class="dbw-red">${s.slice(-n)}</tspan>`;
}

function renderRates() {
  const host = $("dbw-rates-svg");
  const W = widthOf(host);
  const st = M.KAPPA_STATS;
  const left = 58, right = 18, top = 44, rowH = 40;
  const H = top + rowH * 4 + 30;
  const lo = -2.5, hi = 2; // log10 of percent
  const px = (p) => left + ((Math.log10(Math.max(p, 10 ** lo)) - lo) / (hi - lo)) * (W - left - right);
  let b = "";
  for (let e = -2; e <= 2; e++) {
    const x = px(10 ** e);
    b += line(x, top - 6, x, H - 24, "dbw-grid");
    b += T(x, H - 8, `${10 ** e}%`, "dbw-small dbw-muted");
  }
  st.rows.forEach((row, i) => {
    const y = top + i * rowH;
    const cur = row.kappa === state.kappa;
    if (cur) b += rect(4, y - 4, W - 8, rowH - 2, "dbw-row-current");
    b += T(10, y + 20, `κ = ${row.kappa}`, cur ? "dbw-strong" : "", "start");
    const p1 = (100 * row.eq) / st.n, p2 = (100 * row.fineCheck) / st.n;
    b += rect(left, y + 3, px(p1) - left, 12, "dbw-rate-x");
    b += T(px(p1) + 4, y + 13, `${p1.toFixed(p1 < 1 ? 3 : 2)}%`, "dbw-small", "start");
    b += rect(left, y + 18, px(p2) - left, 12, "dbw-rate-y");
    b += T(px(p2) + 4, y + 28, `${p2.toFixed(p2 < 1 ? 3 : 1)}%`, "dbw-small", "start");
  });
  b += rect(left, 4, 10, 10, "dbw-rate-x") + T(left + 14, 13, "r = δᵢ (x check)", "dbw-small", "start");
  b += rect(left, 20, 10, 10, "dbw-rate-y") + T(left + 14, 29, "fine path, y check", "dbw-small", "start");
  host.innerHTML = svg(W, H, b, "Share of random doubles needing an extra check, per kappa, on a log scale: " +
    st.rows.map((r) => `kappa ${r.kappa}: ${pct(r.eq, st.n, 3)} and ${pct(r.fineCheck, st.n, 3)}`).join("; "));
}

function renderRegister() {
  const host = $("dbw-register-svg");
  const W = widthOf(host);
  const left = 58, right = 130, top = 26, rowH = 40;
  const H = top + rowH * 4 + 30;
  const maxBits = 68;
  const px = (b) => left + (b / maxBits) * (W - left - right);
  const d = M.decode(state.x);
  let b = "";
  for (const bits of [0, 16, 32, 48, 64]) {
    b += line(px(bits), top - 6, px(bits), H - 24, bits === 64 ? "dbw-limit" : "dbw-grid");
    b += T(px(bits), H - 8, String(bits), bits === 64 ? "dbw-small dbw-red" : "dbw-small dbw-muted");
  }
  b += T(px(64), top - 10, "64-bit register", "dbw-small dbw-red", "end");
  for (let kappa = 0; kappa <= 3; kappa++) {
    const y = top + kappa * rowH;
    const cur = kappa === state.kappa;
    if (cur) b += rect(4, y - 4, W - 8, rowH - 2, "dbw-row-current");
    const worst = 54 + Math.floor((kappa + 1) * Math.log2(10));
    b += T(10, y + 20, `κ = ${kappa}`, cur ? "dbw-strong" : "", "start");
    b += rect(px(0), y + 4, px(Math.min(worst, 64)) - px(0), 14, "dbw-reg");
    if (worst > 64) b += rect(px(64), y + 4, px(worst) - px(64), 14, "dbw-reg-over");
    b += T(px(worst) + 4, y + 16, `${worst} bits max`, worst > 64 ? "dbw-small dbw-red" : "dbw-small", "start");
    if (!d.shorter) {
      const v = M.kappaView(state.x, kappa);
      b += line(px(v.uBits), y + 1, px(v.uBits), y + 32, "dbw-mark");
      b += T(px(v.uBits), y + 32, `this double: ${v.uBits}`, "dbw-small dbw-blue", v.uBits > 50 ? "end" : "start");
    }
  }
  host.innerHTML = svg(W, H, b, "Bits needed for (2 fc + 1) shifted by beta, per kappa: 57, 60, 63 and 67 in the worst case; only kappa 3 overflows 64 bits.");
}

// ---------------------------------------------------------------------------
// Shorter interval.
function renderShorter() {
  const [name, x] = SHORTER_CASES[state.p2];
  [...$("dbw-shorter-chips").children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === state.p2)));
  const m = M.windowModel(x);
  const r = m.result;
  const host = $("dbw-shorter-svg");
  const W = widthOf(host);
  const pad = 26, H = 150, y = 60;
  const base = M.ratFloor(m.xs) - 3n;
  const rel = (q) => M.ratToNumber(M.ratSub(q, { num: base, den: 1n }));
  const xR = rel(m.xs), yR = rel(m.ys), zR = rel(m.zs);
  const ghostLo = yR - (zR - yR);
  const L = Math.floor(Math.min(ghostLo, xR)) - 1, R = Math.ceil(zR) + 2;
  const px = (v) => pad + ((v - L) / (R - L)) * (W - 2 * pad);
  let b = line(px(L), y, px(R), y, "dbw-axis");
  for (let v = L; v <= R; v++) {
    const abs = base + BigInt(v);
    const coarse = abs % 10n === 0n;
    b += line(px(v), y - (coarse ? 30 : 10), px(v), y + (coarse ? 30 : 10), coarse ? "dbw-tick-coarse" : "dbw-tick-fine");
    if (coarse || (R - L) < 14) b += T(px(v), y + 46, lastDigits(base, v, coarse ? 4 : 2), coarse ? "dbw-red" : "dbw-muted dbw-small");
  }
  b += rect(px(ghostLo), y - 16, px(zR) - px(ghostLo), 32, "dbw-ghost");
  b += T(px(ghostLo), y - 22, "symmetric (wrong)", "dbw-small dbw-muted", "start");
  b += rect(px(xR), y - 8, px(zR) - px(xR), 16, "dbw-band");
  b += circ(px(xR), y, 5, "dbw-end-closed") + circ(px(zR), y, 5, "dbw-end-closed");
  b += circ(px(yR), y, 5, "dbw-double");
  b += T(px(yR), y - 38, "w", "dbw-blue dbw-strong");
  b += T(px(xR), y + 66, `x = …${M.ratFixed(m.xs, 3).slice(-7)}`, "dbw-small dbw-blue", "end");
  b += T(px(zR), y + 66, `z = …${M.ratFixed(m.zs, 3).slice(-7)}`, "dbw-small dbw-blue", "start");
  // Picked value.
  const pickAbs = r.path === "shorter-big" ? r.bigSignificand * 10n : r.significand;
  const pickRel = Number(pickAbs - base);
  b += circ(px(pickRel), y, 10, "dbw-pick");
  host.innerHTML = svg(W, H, b, `Shorter interval of ${name}`);
  const k = m.k;
  let text = `<p><b>${name}</b> = ${esc(String(x))}. Scale by 10${sup(k)}: x = ${M.group3(M.ratFixed(m.xs, 3))}, z = ${M.group3(M.ratFixed(m.zs, 3))}, width ${M.ratFixed(m.deltas, 3)}. The code gets x<sub>i</sub> = ${r.xi} (rounded up to the first integer inside) and z<sub>i</sub> = ${r.zi} from the cache entry's high word alone.</p>`;
  if (r.path === "shorter-big") {
    text += `<p>10 · ⌊z<sub>i</sub>/10⌋ = ${r.bigSignificand * 10n} ≥ x<sub>i</sub>: a multiple of 10 is inside. Strip zeros: <b>${fmtOut(r.significand, r.exponent)}</b> = ${esc(m.text)}.</p>`;
  } else {
    text += `<p>10 · ⌊z<sub>i</sub>/10⌋ = ${(r.zi / 10n) * 10n} &lt; x<sub>i</sub> = ${r.xi}: no multiple of 10 is inside. Round the centre y = ${M.group3(M.ratFixed(m.ys, 3))} to an integer: <b>${fmtOut(r.significand, r.exponent)}</b> = ${esc(m.text)}.</p>`;
  }
  if (x === 2 ** 64) {
    const bad = "18446744073709550000";
    text += `<p class="dbw-note-box">With a symmetric interval, the multiple of 10 at …550 would seem to fit, giving ${bad}. But that reads back as ${Number(bad) === 2 ** 64 - 2048 ? "18446744073709549568 = 2<sup>64</sup> − 2048" : esc(String(Number(bad)))}, the double below. The lopsided interval is not a detail.</p>`;
  }
  $("dbw-shorter-text").innerHTML = text;
}

// ---------------------------------------------------------------------------
// Code stepper.
function fmtVar(name, v) {
  if (typeof v === "bigint") {
    if (name === "cache") return `${M.hex64(v >> 64n)}<wbr>_${M.hex64(v & M.M64).slice(2)}`;
    if (name === "two_fc") return `${v} <span class="dbw-muted">(${M.hex64(v)})</span>`;
    return v.toString();
  }
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") return "{ " + Object.entries(v).map(([k, x]) => `${k}: ${typeof x === "bigint" ? x : String(x)}`).join(", ") + " }";
  return esc(String(v));
}

function renderCode() {
  const steps = run.steps;
  state.step = Math.min(state.step, steps.length - 1);
  const cur = steps[state.step];
  const executed = new Set(steps.slice(0, state.step + 1).map((s) => M.SOURCE_INDEX.get(s.id)));
  const curLine = M.SOURCE_INDEX.get(cur.id);
  const html = M.SOURCE.map(([id, text], i) => {
    const cls = ["dbw-line"];
    if (i === curLine) cls.push("hl");
    else if (executed.has(i)) cls.push("dbw-ran");
    const note = i === curLine && cur.note ? `<span class="dbw-note">  ← ${esc(cur.note)}</span>` : "";
    return `<span class="${cls.join(" ")}" data-line="${i}"><span class="dbw-ln" aria-hidden="true">${String(i + 1).padStart(2, " ")}</span>${esc(text) || " "}${note}</span>`;
  }).join("");
  const pre = $("dbw-code");
  pre.innerHTML = html;
  const el = pre.querySelector(".hl");
  if (el) {
    const top = el.offsetTop - pre.clientHeight / 2;
    pre.scrollTop = Math.max(0, top);
  }
  const prev = state.step > 0 ? steps[state.step - 1].vars : {};
  const vars = Object.entries(cur.vars).map(([k, v]) => {
    const changed = JSON.stringify(fmtVar(k, v)) !== JSON.stringify(fmtVar(k, prev[k])) ? " dbw-changed" : "";
    return `<div class="dbw-var${changed}"><code>${k}</code><span>${fmtVar(k, v)}</span></div>`;
  }).join("");
  $("dbw-vars").innerHTML = `<p class="dbw-panel-title">Variables</p>${vars || '<p class="dbw-muted-p">(none yet)</p>'}`;
  $("dbw-step-count").textContent = `step ${state.step + 1} of ${steps.length}, line ${curLine + 1}`;
  $("dbw-step-back").disabled = state.step === 0;
  $("dbw-step-reset").disabled = state.step === 0;
  $("dbw-step-next").disabled = state.step === steps.length - 1;
  $("dbw-step-end").disabled = state.step === steps.length - 1;
  $("dbw-code-using").innerHTML = `running ${esc(String(state.x))}`;
}

function renderLimbs() {
  const p = M.productLimbs(state.x);
  const host = $("dbw-limbs");
  if (!p) {
    host.innerHTML = `<p class="dbw-note-box">${esc(String(state.x))} is a power of two: the shorter-interval path gets both ends by shifting the cache entry's high word, with no 192-bit product. Pick another double above to see the product.</p>`;
    return;
  }
  const hex = (v) => M.hex64(v).slice(2).replace(/(.{4})(?=.)/g, "$1​");
  host.innerHTML = `
    <div class="dbw-limb-row"><span class="dbw-limb-label">φ<sub>k</sub>, k = ${minus(p.k)}</span><span class="dbw-limb dbw-limb-cache">${hex(p.cacheHigh)}<small>high</small></span><span class="dbw-limb dbw-limb-cache">${hex(p.cacheLow)}<small>low</small></span></div>
    <div class="dbw-limb-row"><span class="dbw-limb-label">× u = (2f<sub>c</sub>+1) ≪ ${p.beta}</span><span class="dbw-limb dbw-limb-u">${hex(p.u)}<small>64-bit</small></span></div>
    <div class="dbw-limb-row"><span class="dbw-limb-label">= 192 bits</span><span class="dbw-limb dbw-limb-top">${p.top}<small>top word = ⌊z⌋ (decimal)</small></span><span class="dbw-limb dbw-limb-mid">${hex(p.middle)}<small>${p.middle === 0n ? "zero: z is an integer" : "non-zero: z is not an integer"}</small></span><span class="dbw-limb dbw-limb-low">${hex(p.low)}<small>discarded</small></span></div>
    <p class="dbw-limb-note">δ<sub>i</sub> = φ<sub>k</sub>.high ≫ (63 − ${p.beta}) = <b>${p.deltai}</b>, a shift instead of a second multiplication.</p>`;
}

// Flowchart (top to bottom).
function renderFlow() {
  const st = M.BRANCH_STATS;
  const n = st.n;
  $("dbw-flow-n").textContent = n.toLocaleString("en-US");
  const W = 720, H = 640;
  // id: [cx, cy, w, h, lines]
  const N = {
    A: [150, 36, 180, 40, ["decode the bits"]],
    S: [540, 36, 200, 40, ["shorter interval", "(powers of two)"]],
    C: [150, 128, 280, 54, ["one multiply → ⌊z⌋", "δᵢ by a shift", "r = ⌊z⌋ mod 1000"]],
    D: [150, 226, 180, 40, ["compare r with δᵢ"]],
    E: [110, 340, 180, 44, ["is the tick the", "excluded right end?"]],
    F: [340, 340, 130, 44, ["parity of ⌊x⌋"]],
    G: [590, 340, 220, 44, ["dist = r − ⌊δᵢ/2⌋ + 50", "digit = ⌊dist/100⌋"]],
    OB: [110, 470, 190, 44, ["coarse: strip zeros", "≤ 16 digits"]],
    Hd: [590, 452, 170, 40, ["dist % 100 == 0?"]],
    I: [400, 540, 190, 44, ["parity of ⌊y⌋", "(tie → even)"]],
    OS: [590, 606, 190, 40, ["fine: 16–17 digits"]],
  };
  const P = (id, side, dx = 0) => {
    const [x, y, w, h] = N[id];
    return side === "b" ? [x + dx, y + h / 2] : side === "t" ? [x + dx, y - h / 2] : side === "l" ? [x - w / 2, y] : [x + w / 2, y];
  };
  const curve = ([x1, y1], [x2, y2], vertical = true) => vertical
    ? `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`
    : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const p = (c) => c / n;
  const [ex, ey] = P("E", "b", 60), [gx, gy] = P("G", "b", -80);
  const E = [
    ["A-S", curve(P("A", "r"), P("S", "l"), false), 0, "fraction bits = 0: 2046 doubles", [300, 56]],
    ["A-C", curve(P("A", "b"), P("C", "t")), 1, "", null],
    ["C-D", curve(P("C", "b"), P("D", "t")), 1, "", null],
    ["D-E", curve(P("D", "b", -40), P("E", "t")), p(st.lt + st.excluded), `r < δᵢ ${pct(st.lt + st.excluded, n, 1)}`, [40, 284]],
    ["D-F", curve(P("D", "b", 20), P("F", "t")), p(st.eq), `r = δᵢ ${pct(st.eq, n, 2)}`, [236, 304]],
    ["D-G", curve(P("D", "b", 70), P("G", "t")), p(st.gt), `r > δᵢ ${pct(st.gt, n, 1)}`, [500, 262]],
    ["E-OB", curve(P("E", "b"), P("OB", "t")), p(st.lt), `no ${pct(st.lt, n, 1)}`, [60, 410]],
    ["E-G", `M${ex},${ey} C${ex},${ey + 60} ${gx},${gy + 60} ${gx},${gy}`, p(st.excluded), `yes ${pct(st.excluded, n, 3)}`, [300, 400]],
    ["F-OB", curve(P("F", "b", -30), P("OB", "r")), p(st.eqAccept), `inside ${pct(st.eqAccept, n, 2)}`, [262, 430]],
    ["F-G", curve(P("F", "r"), P("G", "l"), false), p(st.eqReject), `outside ${pct(st.eqReject, n, 2)}`, [398, 382]],
    ["G-Hd", curve(P("G", "b", 40), P("Hd", "t", 40)), p(st.small), "", null],
    ["Hd-I", curve(P("Hd", "l"), P("I", "t"), false), p(st.divisible), `yes ${pct(st.divisible, n, 2)}`, [440, 470]],
    ["Hd-OS", curve(P("Hd", "b", 40), P("OS", "t", 40)), p(st.small - st.divisible), `no ${pct(st.small - st.divisible, n, 1)}`, [640, 540]],
    ["I-OS", curve(P("I", "r"), P("OS", "l"), false), p(st.divisible), "", null],
  ];
  const r = run;
  const act = new Set();
  const add = (...ids) => ids.forEach((id) => act.add(id));
  if (r.path.startsWith("shorter")) add("A-S");
  else {
    add("A-C", "C-D");
    if (r.path === "big") {
      if (r.reason === "eq") add("D-F", "F-OB"); else add("D-E", "E-OB");
    } else {
      if (r.reason === "excluded") add("D-E", "E-G");
      else if (r.reason === "eq") add("D-F", "F-G");
      else add("D-G");
      add("G-Hd");
      if (r.divisible) add("Hd-I", "I-OS"); else add("Hd-OS");
    }
  }
  let edges = "", overlay = "", labels = "";
  for (const [id, d, frac, lab, at] of E) {
    const w = frac === 0 ? 1.2 : 1 + 16 * Math.sqrt(frac);
    edges += `<path d="${d}" class="dbw-flow-edge${frac === 0 ? " dbw-flow-dashed" : ""}" style="stroke-width:${w.toFixed(2)}px"/>`;
    if (act.has(id)) overlay += `<path d="${d}" class="dbw-flow-active"/>`;
    if (lab) labels += T(at[0], at[1], lab, "dbw-small dbw-flow-label", "start");
  }
  let nodes = "";
  const activeNodes = new Set([...act].flatMap((e) => e.split("-")));
  for (const [id, [x, y, w, h, lines]] of Object.entries(N)) {
    nodes += rect(x - w / 2, y - h / 2, w, h, `dbw-flow-node${activeNodes.has(id) ? " dbw-flow-node-on" : ""}`, 'rx="3"');
    lines.forEach((t, i) => { nodes += T(x, y + (i - (lines.length - 1) / 2) * 14 + 4, esc(t), "dbw-small"); });
  }
  $("dbw-flow-svg").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Flowchart of compute_nearest with branch frequencies; the path of the current double is highlighted">${edges}${overlay}${nodes}${labels}</svg>`;
  $("dbw-flow-caption").innerHTML = `Of ${n.toLocaleString("en-US")} random bit patterns: the coarse path wins ${pct(st.big, n, 1)}, the fine path ${pct(st.small, n, 1)}. An extra parity product is needed for ${pct(st.eq + st.divisible, n, 2)}. Powers of two (2046 doubles, about 2<sup>−52</sup> of them) never showed up. Every normal double whose shortest form has at most 15 significant digits takes the coarse path; the fine path always prints 16 or 17 digits for normal doubles. Numbers people type almost never pay for the fallback.`;
  $("dbw-rare-freq").innerHTML = `<strong>How rare?</strong> In ${n.toLocaleString("en-US")} random bit patterns: r = δ<sub>i</sub> happened ${pct(st.eq, n, 3)} of the time (${st.eqAccept} accepted, ${st.eqReject} rejected). The fine-path parity check ran ${pct(st.divisible, n, 2)} of the time, and the parity disagreed with the estimate in ${pct(st.yParityFix, n, 2)}. Exact ties: ${pct(st.tie, n, 3)}. The excluded right end: ${pct(st.excluded, n, 3)}.`;
}

// Sidebars.
function renderSidebars() {
  $("dbw-full-size").textContent = `${M.FULL_CACHE_ENTRIES} entries × 16 bytes = ${M.FULL_CACHE_BYTES.toLocaleString("en-US")} bytes`;
  $("dbw-compact-size").textContent = `${M.COMPACT_CACHE_ENTRIES} × 16 + ${M.COMPRESSION_RATIO} × 8 = ${M.COMPACT_CACHE_BYTES} bytes`;
  const r = run;
  const rtz = $("dbw-rtz");
  if (r.path === "big" || r.path === "shorter-big") {
    const bl = M.removeTrailingZerosBranchless(r.bigSignificand);
    rtz.innerHTML = `<div class="dbw-table-wrap" tabindex="0"><table class="dbw-small-table"><caption>Removing zeros from ${r.bigSignificand} (${esc(String(state.x))})</caption><thead><tr><th>n</th><th>rotr(s × inverse, n)</th><th>&lt; bound?</th><th>s after</th></tr></thead><tbody>${bl.steps.map((s) => `<tr><td>${s.n}</td><td>${s.r}</td><td>${s.taken ? "yes" : "no"}</td><td>${s.taken ? s.r : s.before}</td></tr>`).join("")}</tbody></table></div><p>Removed ${bl.removed} = ${bl.steps.map((s) => (s.taken ? s.n : 0)).join(" + ")} zeros.</p>`;
  } else {
    rtz.innerHTML = `<p class="dbw-muted-p">${esc(String(state.x))} takes the fine path, whose result never ends in 0, so no removal runs. Try 0.1 or 123.456.</p>`;
  }
  const k = 0 - r.minus_k;
  const full = M.get_cache(k), cc = M.compact_cache(k);
  const h = (v) => `${M.hex64(v >> 64n)}_${M.hex64(v & M.M64).slice(2)}`;
  $("dbw-cache").innerHTML = `<div class="dbw-table-wrap" tabindex="0"><table class="dbw-small-table"><caption>Entry k = ${minus(k)} for ${esc(String(state.x))}</caption><tbody>
    <tr><th scope="row">full table</th><td><code>${h(full)}</code></td></tr>
    <tr><th scope="row">compact</th><td><code>${h(cc.cache)}</code><br>from entry ${minus(cc.kb)} × 5${sup(cc.offset)}, shifted by ${cc.alpha}, + 1${cc.cache === full ? " (identical)" : ` (larger by ${cc.cache - full} in the last bits)`}</td></tr></tbody></table></div>`;
}

// ---------------------------------------------------------------------------
// Wiring.
function init() {
  readUrl();
  const presetBox = $("dbw-presets");
  for (const [label, x] of PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.x = String(x);
    b.addEventListener("click", () => setX(x));
    presetBox.append(b);
  }
  const chips = $("dbw-frame-chips");
  FRAMES.forEach((label, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.addEventListener("click", () => { state.frame = i; renderWindow(); writeUrl(); });
    chips.append(b);
  });
  $("dbw-prev-frame").addEventListener("click", () => { state.frame = Math.max(0, state.frame - 1); renderWindow(); writeUrl(); });
  $("dbw-next-frame").addEventListener("click", () => { state.frame = Math.min(FRAMES.length - 1, state.frame + 1); renderWindow(); writeUrl(); });
  const show = () => {
    const v = parseDouble($("dbw-input").value);
    const err = $("dbw-error");
    if (!M.isUsable(v)) {
      err.textContent = "Enter a finite, non-zero number, for example 0.1, 2/3, 2^53 or 1e23.";
      err.hidden = false;
      return;
    }
    setX(Math.abs(v));
    if (v < 0) { err.textContent = "Dragonbox handles the sign separately; showing the magnitude."; err.hidden = false; }
  };
  $("dbw-show").addEventListener("click", show);
  $("dbw-input").addEventListener("keydown", (e) => { if (e.key === "Enter") show(); });
  $("dbw-up").addEventListener("click", () => setX(M.nudge(state.x, 1)));
  $("dbw-down").addEventListener("click", () => setX(M.nudge(state.x, -1)));
  $("dbw-random").addEventListener("click", () => setX(M.randomDouble()));

  FOG_CASES.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = c.label;
    b.addEventListener("click", () => { state.fog = i; state.fogReveal = false; renderFog(); writeUrl(); });
    $("dbw-fog-chips").append(b);
  });
  $("dbw-fog-reveal").addEventListener("click", () => { state.fogReveal = !state.fogReveal; renderFog(); writeUrl(); });
  $("dbw-rare-details").addEventListener("toggle", () => { renderFog(); writeUrl(); });

  $("dbw-kappa").addEventListener("input", (e) => { state.kappa = Number(e.target.value); renderKappa(); writeUrl(); });

  SHORTER_CASES.forEach(([label], i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.addEventListener("click", () => { state.p2 = i; renderShorter(); writeUrl(); });
    $("dbw-shorter-chips").append(b);
  });

  const stepTo = (s) => { state.step = Math.max(0, Math.min(run.steps.length - 1, s)); renderCode(); writeUrl(); };
  $("dbw-step-next").addEventListener("click", () => stepTo(state.step + 1));
  $("dbw-step-back").addEventListener("click", () => stepTo(state.step - 1));
  $("dbw-step-reset").addEventListener("click", () => stepTo(0));
  $("dbw-step-end").addEventListener("click", () => stepTo(run.steps.length - 1));

  const step = state.step;
  setX(state.x);
  state.step = step;
  renderCode();
  renderFog();
  renderShorter();
  writeUrl();

  let pending = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => { renderWindow(); renderKappa(); renderFog(); renderShorter(); });
  });
  ro.observe($("dbw-window-svg"));
}

init();
