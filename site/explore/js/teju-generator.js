// Copyright (C) 2026 Toit contributors.
//
// DOM code for the "Break the multiplier" Tejú Jaguá page (approach B).
// All numbers come from teju-generator-model.js (exact BigInt arithmetic).

import * as T from "./teju-generator-model.js";

const SVGNS = "http://www.w3.org/2000/svg";
const B64 = T.FORMATS.binary64;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Small helpers.

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "html") node.innerHTML = v;
    else if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
}

function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function setParam(key, value) {
  const params = new URLSearchParams(window.location.search);
  if (value === null || value === undefined) params.delete(key);
  else params.set(key, String(value));
  const q = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
}

const minus = (s) => String(s).replace(/-/g, "−");
// Group long integers with thin spaces for readability.
function group(x) {
  const s = x.toString();
  const neg = s.startsWith("-");
  const d = neg ? s.slice(1) : s;
  if (d.length <= 6) return minus(s);
  return (neg ? "−" : "") + d.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function big(x, keep = 7) {
  const s = x.toString();
  if (s.length <= Math.max(20, 2 * keep + 4)) return group(x);
  return `${s.slice(0, keep)}…${s.slice(-keep)} <span class="tg-dim">(${s.length} digits)</span>`;
}
// "2^40" -> "2<sup>40</sup>", for trusted strings built from numbers.
const supHtml = (s) => s.replace(/\^(-?\d+)/g, (_, e) => `<sup>${minus(e)}</sup>`);
function powerHtml(x) {
  const name = T.powerName(x);
  return name ? supHtml(name) : big(x);
}
const hex = (x, W = 64) => T.hexWord(x, W);
const approx = (q, digits = 4) => {
  const v = T.log2Q(q);
  if (Math.abs(v) < 40) return (2 ** v).toPrecision(digits);
  return `2<sup>${minus(v.toFixed(2))}</sup>`;
};
const supChars = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const supText = (n) => String(n).split("").map((c) => supChars[c] ?? c).join("");

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
}

function chips(container, items, current, onPick) {
  container.replaceChildren();
  for (const item of items) {
    const b = h("button", { type: "button", "aria-pressed": String(item.value === current), html: item.html ?? null }, item.html ? null : item.label);
    b.addEventListener("click", () => {
      for (const other of container.querySelectorAll("button")) other.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
      onPick(item.value);
    });
    container.append(b);
  }
}
function pressChip(container, index) {
  container.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
}

// Run an iterator in time slices so the page stays responsive.
function runChunked(iter, { onYield, onDone, budget = 12 }) {
  let cancelled = false;
  const step = () => {
    if (cancelled) return;
    const t0 = performance.now();
    while (performance.now() - t0 < budget) {
      const { value, done } = iter.next();
      if (done) { onDone?.(value); return; }
      onYield?.(value);
    }
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
  return () => { cancelled = true; };
}

function decodeDouble(x) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const bits = dv.getBigUint64(0);
  const be = Number((bits >> 52n) & 0x7ffn);
  let m = bits & ((1n << 52n) - 1n), e;
  if (be) { m |= 1n << 52n; e = be - 1075; } else e = -1074;
  return { e, m };
}

// binary64 row data by F, computed on demand (proof results cached).
const B64_E0S = T.rowExponents(B64);
const B64_E0_OF_F = new Map(B64_E0S.map((e0) => [T.log10pow2(e0), e0]));
const b64RowCache = new Map();
function b64Row(f) {
  if (!b64RowCache.has(f)) {
    const e0 = B64_E0_OF_F.get(f);
    b64RowCache.set(f, T.proveRow(B64, e0, e0 === B64_E0S[0]));
  }
  return b64RowCache.get(f);
}

function exactQuotient(num, den, digits = 6) {
  const q = num / den, r = num % den;
  const frac = ((r * 10n ** BigInt(digits)) / den).toString().padStart(digits, "0");
  return { q, text: `${group(q)}.${frac}…` };
}

// Headroom and overshoot of one n, as exact fractions.
function worstInfo(alpha, delta, n, shift) {
  const a = alpha % delta;
  const { eps } = T.fastMultiplier(alpha, delta, shift);
  return { head: [delta - (a * n) % delta, delta], over: [n * eps, delta << BigInt(shift)] };
}

// ---------------------------------------------------------------------------
// Section 0: the deal (one multiply for a real double).

function setupDeal() {
  const input = $("tg-deal-input"), out = $("tg-deal-out");
  const presets = ["0.1", "0.6666666666666666", "1e23", "5e-324", "1.7976931348623157e308", "123"];
  const render = () => {
    const text = input.value.trim();
    const x = Number(text);
    if (!text || !Number.isFinite(x) || x <= 0) {
      out.innerHTML = `<p class="tg-error">Type a positive, finite number (for example 0.1 or 5e-324).</p>`;
      return;
    }
    setParam("x", text === "0.1" ? null : text);
    const { e, m } = decodeDouble(x);
    const f = T.log10pow2(e), r = T.residual(e), e0 = e - r;
    const { alpha, delta } = T.alphaDelta(e0);
    const { M } = T.fastMultiplier(alpha, delta, 128);
    const n = (2n * m + 1n) << BigInt(r);
    const exact = exactQuotient(n * alpha, delta);
    const P = n * M, mask = (1n << 64n) - 1n;
    const w2 = P >> 128n, w1 = (P >> 64n) & mask, w0 = P & mask;
    const ok = w2 === exact.q;
    const small = e <= 0 && -e < 53 && ((m >> BigInt(-e)) << BigInt(-e)) === m;
    const pow2 = m === 1n << 52n && e !== -1074;
    out.innerHTML = `
      <dl class="tg-dl">
        <dt>x</dt><dd>${group(m)} · 2<sup>${minus(e)}</sup></dd>
        <dt>F, e<sub>0</sub>, r</dt><dd>F = ⌊${minus(e)} · log<sub>10</sub> 2⌋ = ${minus(f)}, &nbsp;e<sub>0</sub> = ${minus(e0)}, &nbsp;r = ${r}</dd>
        <dt>α / δ</dt><dd>2<sup>${minus(e0 - 1)}</sup> / 10<sup>${minus(f)}</sup> = ${powerHtml(alpha)} / ${powerHtml(delta)}</dd>
        <dt>n</dt><dd>(2m + 1) ≪ ${r} = ${group(n)} <span class="tg-dim">(the upper end of the interval)</span></dd>
        <dt>exact</dt><dd>n · α / δ = ${exact.text} &nbsp;→&nbsp; floor <b class="tg-blue">${group(exact.q)}</b></dd>
        <dt>M</dt><dd>${hex(M >> 64n)} ${hex(M & mask)} <span class="tg-dim">(row F = ${minus(f)}, 128 bits)</span></dd>
        <dt>n · M</dt><dd class="tg-words"><span class="tg-word tg-word-top">${hex(w2)}</span><span class="tg-word">${hex(w1)}</span><span class="tg-word">${hex(w0)}</span></dd>
        <dt>top word</dt><dd><b class="tg-blue">${group(w2)}</b> ${ok ? '<span class="tg-ok">✓ same floor</span>' : '<span class="tg-bad">✗ different</span>'}</dd>
      </dl>
      ${small ? '<p class="tg-note">This x is a small integer, so the real kernel returns it directly without any multiply. The row still works, as shown.</p>' : ""}
      ${pow2 ? '<p class="tg-note">This x is a power of two, so its lower neighbour is closer. The kernel uses (4m − 1) ≪ r for the lower end, but the upper end is computed as shown.</p>' : ""}`;
  };
  chips($("tg-deal-chips"), presets.map((p) => ({ label: p, value: p })), null, (v) => { input.value = v; render(); });
  input.addEventListener("input", render);
  const x = getParam("x");
  if (x) input.value = x;
  render();
}

// ---------------------------------------------------------------------------
// Section 1: the linear sawtooth on the toy row.

let toyRow = null;
const getToy = () => (toyRow ??= T.labRow("toy"));

function setupSaw() {
  const box = $("tg-saw-svg"), out = $("tg-saw-out");
  const ks = [10, 13, 18, 23];
  let k = Number(getParam("saw")) || 10;
  if (!ks.includes(k)) k = 10;
  const render = () => {
    const row = getToy();
    const width = Math.max(300, Math.floor(box.clientWidth));
    const height = Math.round(Math.min(300, Math.max(220, width * 0.42)));
    const m = { l: 40, r: 10, t: 24, b: 34 };
    const pw = width - m.l - m.r, ph = height - m.t - m.b;
    const nMin = 33, nMax = 992;
    const X = (n) => m.l + ((n - nMin) / (nMax - nMin)) * pw;
    const Y = (v) => m.t + (1 - v) * ph;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "tg-svg", "aria-hidden": "true" });
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append(svgEl("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: "tg-grid" }));
      svg.append(svgEl("text", { x: m.l - 6, y: Y(v) + 4, class: "tg-tick", "text-anchor": "end" }, String(v)));
    }
    for (const n of [33, 200, 400, 600, 800, 992]) {
      svg.append(svgEl("text", { x: X(n), y: height - 16, class: "tg-tick", "text-anchor": "middle" }, String(n)));
    }
    svg.append(svgEl("text", { x: m.l + pw, y: height - 2, class: "tg-axis", "text-anchor": "end" }, "n →"));
    svg.append(svgEl("text", { x: m.l, y: m.t - 10, class: "tg-axis" }, "↑ fractional part of n·α/δ"));
    const { eps, M } = T.fastMultiplier(row.alpha, row.delta, k);
    const K = BigInt(k);
    const delta = Number(row.delta), epsN = Number(eps);
    const over = (n) => (n * epsN) / (delta * 2 ** k);
    // Danger zone above the line.
    const pts = [];
    for (let n = nMin; n <= nMax; n += 7) pts.push(`${X(n)},${Y(Math.max(0, 1 - over(n)))}`);
    pts.push(`${X(nMax)},${Y(Math.max(0, 1 - over(nMax)))}`);
    svg.append(svgEl("polygon", { points: `${X(nMin)},${Y(1)} ${pts.join(" ")} ${X(nMax)},${Y(1)}`, class: "tg-danger" }));
    let fails = 0, example = null;
    const g = svgEl("g");
    for (let i = 0; i < row.count; i++) {
      const n = row.big[i];
      if (n < 33n || n > 992n) continue;
      const frac = 1 - row.gap[i] / delta;
      const bad = n * eps >= row.gapBig[i] << K;
      if (bad) { fails++; if (!example) example = n; }
      g.append(svgEl("circle", { cx: X(Number(n)), cy: Y(frac), r: bad ? 2.8 : 1.7, class: bad ? "tg-dot-fail" : "tg-dot" }));
    }
    svg.append(g);
    svg.append(svgEl("line", { x1: X(nMin), x2: X(nMax), y1: Y(1 - over(nMin)), y2: Y(Math.max(0, 1 - over(nMax))), class: "tg-line" }));
    svg.append(svgEl("text", { x: X(nMax) - 4, y: Y(Math.max(0, 1 - over(nMax))) + 16, class: "tg-linelabel tg-halo", "text-anchor": "end" }, "1 − overshoot"));
    box.replaceChildren(svg);
    const tail = over(992);
    out.innerHTML = `k = ${k}: M = ${group(M)}, ε = ${group(eps)}. The overshoot grows to ${tail < 1e-3 ? tail.toExponential(2) : tail.toFixed(4)} at n = 992. `
      + (fails
        ? `<strong>${fails}</strong> of 960 dots are pushed past the next integer${example ? `, the first at n = ${example}` : ""}.`
        : `No dot is pushed past the next integer: every floor is exact.`);
  };
  chips($("tg-saw-chips"), ks.map((v) => ({ label: `k = ${v}`, value: v })), k, (v) => { k = v; setParam("saw", v === 10 ? null : v); render(); });
  return render;
}

// ---------------------------------------------------------------------------
// Section 2: the lab (log-log scatter, shift slider).

const lab = {
  rows: {},
  id: "toy",
  k: 22,
  selected: null, // index into row arrays
  failCache: new Map(),
  rtCache: new Map(),
  convCancel: null,
  convTimer: 0,
  geom: null,
};

function labRowData(id) {
  if (!lab.rows[id]) lab.rows[id] = id === "toy" ? getToy() : T.labRow(id);
  return lab.rows[id];
}

function labFail(row, k) {
  const key = `${row.id}:${k}`;
  if (!lab.failCache.has(key)) {
    const res = T.labFailures(row, k);
    const set = new Uint8Array(row.count);
    for (const i of res.failures) set[i] = 1;
    res.set = set;
    res.used = res.failures.filter((i) => row.usedFlag[i]);
    lab.failCache.set(key, res);
  }
  return lab.failCache.get(key);
}

function runtimeFor(fmt, k) {
  const key = `${fmt.id}:${k}`;
  if (!lab.rtCache.has(key)) lab.rtCache.set(key, T.buildTable(fmt, k));
  return lab.rtCache.get(key);
}

function setupLab() {
  const canvas = $("tg-lab-canvas"), box = $("tg-lab-box");
  const slider = $("tg-lab-k"), kout = $("tg-lab-kout");
  const hover = $("tg-lab-hover");
  const rowsChips = $("tg-lab-rows");

  const id0 = getParam("lab") === "b16" ? "b16" : "toy";
  lab.id = id0;
  const k0 = Number(getParam("k"));
  const spec0 = T.LAB_ROWS[id0];
  lab.k = Number.isInteger(k0) && k0 >= spec0.kMin && k0 <= spec0.kMax ? k0 : id0 === "b16" ? 23 : 22;

  const setRow = (id, keepK = false) => {
    lab.id = id;
    const spec = T.LAB_ROWS[id];
    slider.min = spec.kMin;
    slider.max = spec.kMax;
    if (!keepK) lab.k = id === "b16" ? 23 : 22;
    slider.value = lab.k;
    lab.selected = null;
    setParam("lab", id === "toy" ? null : id);
    setParam("k", lab.k);
    setParam("n", null);
    if (!lab.rows[id]) {
      $("tg-lab-out").innerHTML = "Building the row (65 507 exact gaps)…";
      setTimeout(() => { labRowData(id); renderLab(); }, 30);
    } else renderLab();
  };

  chips(rowsChips, [
    { html: "toy row F = 6 <span class=\"tg-dim\">8192/15625</span>", value: "toy" },
    { html: "binary16 row F = −8 <span class=\"tg-dim\">5<sup>8</sup>/2<sup>19</sup></span>", value: "b16" },
  ], lab.id, (v) => setRow(v));

  slider.addEventListener("input", () => {
    lab.k = Number(slider.value);
    setParam("k", lab.k);
    renderLab();
  });

  const pick = (ev, preferFail) => {
    const g = lab.geom;
    if (!g) return null;
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    const row = labRowData(lab.id), fails = labFail(row, lab.k);
    let best = -1, bestD = Infinity, bestF = -1, bestFD = Infinity;
    for (let i = 0; i < row.count; i++) {
      const dx = g.X(g.lx[i]) - px, dy = g.Y(g.ly[i]) - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
      if (fails.set[i] && d < bestFD) { bestFD = d; bestF = i; }
    }
    if (preferFail && bestF >= 0 && bestFD <= 144) return bestF;
    return bestD <= 64 ? best : null;
  };
  canvas.addEventListener("pointermove", (ev) => {
    const i = pick(ev, true);
    if (i === null) { hover.innerHTML = "&nbsp;"; return; }
    const row = labRowData(lab.id);
    hover.innerHTML = `n = ${group(row.big[i])} · headroom ${(row.gap[i] / Number(row.delta)).toPrecision(3)} · φ(n) = ${(row.n[i] / row.gap[i]).toPrecision(5)}${row.usedFlag[i] ? " · used by the runtime" : ""}`;
  });
  canvas.addEventListener("pointerleave", () => { hover.innerHTML = "&nbsp;"; });
  canvas.addEventListener("click", (ev) => {
    const i = pick(ev, true);
    if (i === null) return;
    lab.selected = i;
    setParam("n", labRowData(lab.id).big[i]);
    renderLab();
  });

  // Deep link: ?lab=b16&k=23&n=10320
  const n0 = getParam("n");
  slider.min = spec0.kMin;
  slider.max = spec0.kMax;
  slider.value = lab.k;
  const init = () => {
    const row = labRowData(lab.id);
    if (n0 && /^\d+$/.test(n0)) {
      const n = BigInt(n0);
      const i = row.big.indexOf(n);
      if (i >= 0) lab.selected = i;
    }
    renderLab();
  };
  if (lab.id === "b16") { $("tg-lab-out").innerHTML = "Building the row…"; setTimeout(init, 30); } else init();
}

function drawLab() {
  const canvas = $("tg-lab-canvas"), box = $("tg-lab-box");
  const row = labRowData(lab.id), k = lab.k, fails = labFail(row, k);
  const width = Math.max(300, Math.floor(box.clientWidth));
  const height = Math.round(Math.min(400, Math.max(280, width * 0.52)));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const m = { l: 50, r: 12, t: 26, b: 38 };
  const pw = width - m.l - m.r, ph = height - m.t - m.b;
  const log2Delta = Math.log2(Number(row.delta));
  if (!row.lx) {
    row.lx = new Float64Array(row.count);
    row.ly = new Float64Array(row.count);
    for (let i = 0; i < row.count; i++) { row.lx[i] = Math.log2(row.n[i]); row.ly[i] = Math.log2(row.gap[i]) - log2Delta; }
  }
  let xMin = Infinity, xMax = -Infinity;
  for (let i = 0; i < row.count; i++) { xMin = Math.min(xMin, row.lx[i]); xMax = Math.max(xMax, row.lx[i]); }
  xMin = Math.floor(xMin * 2) / 2 - 0.1;
  xMax += 0.2;
  const yMin = -log2Delta - 0.8, yMax = 0.4;
  const X = (lx) => m.l + ((lx - xMin) / (xMax - xMin)) * pw;
  const Y = (ly) => m.t + ((yMax - ly) / (yMax - yMin)) * ph;
  lab.geom = { X, Y, lx: row.lx, ly: row.ly };
  const ink = css("--ink"), muted = css("--muted"), blue = css("--blue"), red = css("--red"), paper = css("--paper");
  ctx.clearRect(0, 0, width, height);
  ctx.font = `11px ${css("--mono") || "monospace"}`;
  // Grid and ticks.
  ctx.strokeStyle = muted; ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
  const yStep = log2Delta > 12 ? 4 : 2;
  for (let yv = 0; yv >= yMin; yv -= yStep) { ctx.beginPath(); ctx.moveTo(m.l, Y(yv)); ctx.lineTo(m.l + pw, Y(yv)); ctx.stroke(); }
  const xStep = (xMax - xMin) / (pw / 46) > 1 ? Math.ceil((xMax - xMin) / (pw / 46)) : 1;
  for (let xv = Math.ceil(xMin); xv <= xMax; xv += xStep) { ctx.beginPath(); ctx.moveTo(X(xv), m.t); ctx.lineTo(X(xv), m.t + ph); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = muted;
  ctx.textAlign = "right";
  for (let yv = 0; yv >= yMin; yv -= yStep) ctx.fillText(yv === 0 ? "1" : `2${supText(yv)}`, m.l - 6, Y(yv) + 4);
  ctx.textAlign = "center";
  for (let xv = Math.ceil(xMin); xv <= xMax; xv += xStep) ctx.fillText(xv <= 16 ? String(2 ** xv) : `2${supText(xv)}`, X(xv), m.t + ph + 16);
  ctx.textAlign = "right";
  ctx.fillText("n →", m.l + pw, height - 4);
  ctx.textAlign = "left";
  ctx.fillText("↑ headroom (distance to the next integer)", m.l, m.t - 12);
  // The overshoot line and the danger zone under it.
  const { eps } = fails;
  const off = Math.log2(Number(eps)) - log2Delta - k;
  const lineY = (lx) => lx + off;
  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
  ctx.fillStyle = red; ctx.globalAlpha = 0.07;
  ctx.beginPath(); ctx.moveTo(X(xMin), Y(lineY(xMin))); ctx.lineTo(X(xMax), Y(lineY(xMax))); ctx.lineTo(X(xMax), m.t + ph); ctx.lineTo(X(xMin), m.t + ph); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // Dots: unused, used, then failures on top.
  const dense = row.count > 5000;
  const s = dense ? 1.6 : 2.4;
  ctx.fillStyle = muted; ctx.globalAlpha = dense ? 0.35 : 0.5;
  for (let i = 0; i < row.count; i++) if (!row.usedFlag[i] && !fails.set[i]) ctx.fillRect(X(row.lx[i]) - s / 2, Y(row.ly[i]) - s / 2, s, s);
  ctx.fillStyle = blue; ctx.globalAlpha = dense ? 0.8 : 0.9;
  for (let i = 0; i < row.count; i++) if (row.usedFlag[i] && !fails.set[i]) ctx.fillRect(X(row.lx[i]) - s / 2, Y(row.ly[i]) - s / 2, s, s);
  ctx.globalAlpha = 1; ctx.fillStyle = red;
  for (const i of fails.failures) { ctx.beginPath(); ctx.arc(X(row.lx[i]), Y(row.ly[i]), row.usedFlag[i] ? 3.6 : 2.4, 0, 2 * Math.PI); ctx.fill(); }
  // Line.
  ctx.strokeStyle = ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(xMin), Y(lineY(xMin))); ctx.lineTo(X(xMax), Y(lineY(xMax))); ctx.stroke();
  ctx.restore();
  // If the line is below the chart, say how far.
  ctx.fillStyle = ink; ctx.textAlign = "right";
  if (lineY(xMax) < yMin) {
    const bits = Math.floor(-log2Delta - lineY(xMax));
    ctx.fillText(`overshoot line: ${bits} bits below the lowest possible dot ↓`, m.l + pw - 4, m.t + ph - 6);
  } else {
    const tx = Math.min(xMax - 0.2, Math.max(xMin + 3, yMin * 0.3 - off));
    const ty = Y(lineY(tx));
    if (ty > m.t + 24 && ty < m.t + ph - 4) {
      ctx.save(); ctx.strokeStyle = paper; ctx.lineWidth = 4; ctx.lineJoin = "round";
      ctx.strokeText(`overshoot, k = ${k}`, X(tx) - 8, ty - 4); ctx.restore();
      ctx.fillText(`overshoot, k = ${k}`, X(tx) - 8, ty - 4);
    }
  }
  // Selection ring.
  if (lab.selected !== null) {
    const i = lab.selected;
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(row.lx[i]), Y(row.ly[i]), 8, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillStyle = ink; ctx.textAlign = X(row.lx[i]) > m.l + pw * 0.7 ? "right" : "left";
    const dx = ctx.textAlign === "right" ? -12 : 12;
    ctx.save(); ctx.strokeStyle = paper; ctx.lineWidth = 4; ctx.strokeText(`n = ${row.big[i]}`, X(row.lx[i]) + dx, Y(row.ly[i]) + 4); ctx.restore();
    ctx.fillText(`n = ${row.big[i]}`, X(row.lx[i]) + dx, Y(row.ly[i]) + 4);
  }
}

function useText(u) {
  return `${u.kind.replace("m_", "m<sub>").replace(/(m<sub>\w+)/, "$1</sub>")} of x = ${u.m} · 2<sup>${minus(u.e)}</sup>`;
}

function renderLab() {
  $("tg-lab-kout").textContent = lab.k;
  const row = lab.rows[lab.id];
  if (!row) return;
  drawLab();
  const k = lab.k, fails = labFail(row, k);
  const spec = T.LAB_ROWS[lab.id];
  const { M, eps } = fails;
  const exactPlusOne = eps === row.delta;
  const out = $("tg-lab-out");
  const nFail = fails.failures.length, nUsed = fails.used.length;
  const lines = [
    `k = ${k}: M = ⌊α · 2<sup>${k}</sup> / δ⌋ + 1 = ${group(M)}, ε = ${group(eps)}${exactPlusOne ? " (δ divides α · 2<sup>k</sup>, so M is the exact ratio plus 1 and the overshoot is n / 2<sup>k</sup>)" : ""}.`,
    nFail
      ? `<strong>${group(nFail)}</strong> of ${group(row.count)} checked n are on or below the line, and <strong>${nUsed}</strong> of those are operands the runtime really uses.`
      : `No dot is on or below the line: the generator's proof passes for this row at k = ${k}.`,
  ];
  if (lab.id === "toy") {
    lines.push(`A real build of this toy format would use 16-bit words, so k = ${spec.realShift}. The row passes from k = 23.`);
  } else {
    const proof = T.proofAtShift(T.FORMATS.binary16, k);
    lines.push(proof.failing.length
      ? `Generator's proof over all ${proof.rows} binary16 rows: <strong>fails</strong> (rows F = ${proof.failing.map(minus).join(", ")}).`
      : `Generator's proof over all ${proof.rows} binary16 rows: <span class="tg-ok">passes</span>.`);
    lines.push(`<span id="tg-lab-conv">binary16 conversions that print wrong digits at k = ${k}: counting…</span>`);
  }
  out.innerHTML = lines.map((l) => `<p>${l}</p>`).join("");
  if (lab.id === "b16") scheduleConversions(k);

  // Failure chips: used ones first.
  const list = $("tg-lab-fails");
  list.replaceChildren();
  const ordered = [...fails.used, ...fails.failures.filter((i) => !row.usedFlag[i])];
  const shown = ordered.slice(0, 14);
  for (const i of shown) {
    const b = h("button", { type: "button", "aria-pressed": String(i === lab.selected), title: row.usedFlag[i] ? "used by the runtime" : "checked, never used" },
      `${row.big[i]}${row.usedFlag[i] ? " •" : ""}`);
    b.addEventListener("click", () => { lab.selected = i; setParam("n", row.big[i]); renderLab(); });
    list.append(b);
  }
  if (!ordered.length) list.append(h("span", { class: "tg-dim" }, "none: every floor in this row is exact"));
  else if (ordered.length > shown.length) list.append(h("span", { class: "tg-dim" }, `+ ${group(ordered.length - shown.length)} more (click the chart)`));
  renderLabDetail();
}

function renderLabDetail() {
  const detail = $("tg-lab-detail");
  const row = lab.rows[lab.id];
  if (lab.selected === null) {
    detail.innerHTML = `<p class="tg-dim">Pick a dot (click the chart or a number above) to see its floors.</p>`;
    return;
  }
  const i = lab.selected, n = row.big[i], k = lab.k;
  const { M, eps } = labFail(row, k);
  const exact = exactQuotient(n * row.alpha, row.delta, 5);
  const fast = (n * M) >> BigInt(k);
  const bad = fast !== exact.q;
  const head = row.gap[i] / Number(row.delta);
  const over = (Number(n) * Number(eps)) / (Number(row.delta) * 2 ** k);
  const parts = [
    `<p><b>n = ${group(n)}</b>${n > row.U ? " (one of the extra power-of-two operands)" : ""}: n · α / δ = ${exact.text}</p>`,
    `<p>headroom = ${group(row.gapBig[i])} / ${group(row.delta)} ≈ ${head.toPrecision(3)}, &nbsp;overshoot = n · ε / (δ · 2<sup>${k}</sup>) ≈ ${over.toPrecision(3)}</p>`,
    `<p>true floor <b class="tg-blue">${group(exact.q)}</b>, fast floor ⌊n · M / 2<sup>${k}</sup>⌋ = <b class="${bad ? "tg-bad" : "tg-blue"}">${group(fast)}</b> ${bad ? '<span class="tg-bad">✗ one too big</span>' : '<span class="tg-ok">✓ exact</span>'}</p>`,
  ];
  const uses = row.used.get(n);
  if (!uses) {
    parts.push(`<p class="tg-dim">No value of this format ever produces this n, but the generator checks it anyway.</p>`);
  } else {
    const fmt = row.fmt;
    const rt = runtimeFor(fmt, k), ref = runtimeFor(fmt, 2 * fmt.W);
    const items = uses.slice(0, 3).map((u) => {
      const got = T.toDecimal(fmt, rt, u.e, u.m), want = T.toDecimal(fmt, ref, u.e, u.m);
      const g = T.formatDecimal(got.c, got.f), w = T.formatDecimal(want.c, want.f);
      const verdict = g === w
        ? `prints ${minus(w)} <span class="tg-ok">✓ same digits</span>${bad ? " (the wrong floor did not matter)" : ""}`
        : `prints <b class="tg-bad">${minus(g)}</b> instead of <b class="tg-red">${minus(w)}</b> <span class="tg-bad">✗</span>`;
      return `<li>${useText(u)}: ${verdict}</li>`;
    });
    parts.push(`<p>The runtime uses this n as:</p><ul class="tg-uses">${items.join("")}</ul>`);
  }
  detail.innerHTML = parts.join("");
}

// Count binary16 conversions that change under shift k (chunked).
const convCache = new Map();
function scheduleConversions(k) {
  clearTimeout(lab.convTimer);
  lab.convCancel?.();
  const show = (res) => {
    const span = $("tg-lab-conv");
    if (!span || lab.k !== k || lab.id !== "b16") return;
    if (!res.wrong) {
      span.innerHTML = `binary16 conversions that print wrong digits at k = ${k}: <span class="tg-ok">none</span> of ${group(res.total)}.`;
    } else {
      const ex = res.examples[0];
      span.innerHTML = `binary16 conversions that print wrong digits at k = ${k}: <strong>${group(res.wrong)}</strong> of ${group(res.total)}, e.g. ${ex.m} · 2<sup>${minus(ex.e)}</sup> prints ${minus(T.formatDecimal(ex.got.c, ex.got.f))} instead of ${minus(T.formatDecimal(ex.want.c, ex.want.f))}.`;
    }
  };
  if (convCache.has(k)) { show(convCache.get(k)); return; }
  lab.convTimer = setTimeout(() => {
    const fmt = T.FORMATS.binary16;
    const rt = runtimeFor(fmt, k), ref = runtimeFor(fmt, 64);
    const res = { wrong: 0, total: 0, examples: [] };
    function* work() {
      for (const [e, m] of T.allValues(fmt)) {
        res.total++;
        const got = T.toDecimal(fmt, rt, e, m), want = T.toDecimal(fmt, ref, e, m);
        const [gc, gf] = T.normalize(got.c, got.f), [wc, wf] = T.normalize(want.c, want.f);
        if (gc !== wc || gf !== wf) { res.wrong++; if (res.examples.length < 4) res.examples.push({ e, m, got, want }); }
        yield;
      }
    }
    lab.convCancel = runChunked(work(), { budget: 10, onDone: () => { convCache.set(k, res); show(res); } });
  }, 180);
}

// ---------------------------------------------------------------------------
// Section 3: records and the recursion.

function setupRecords() {
  const row = getToy();
  const recs = T.records(row);
  const table = $("tg-records");
  const rows = recs.map((r, i) => {
    const step = i ? r.n - recs[i - 1].n : null;
    const cls = step === 21n ? "tg-run1" : step === 103n ? "tg-run2" : "";
    return `<tr class="${cls}"><td>${r.n}</td><td>${step === null ? "" : `+${step}`}</td><td>${r.gap}</td><td>${(Number(r.n) / Number(r.gap)).toFixed(3)}</td></tr>`;
  });
  table.insertAdjacentHTML("beforeend", `<thead><tr><th>n</th><th>step</th><th>gap δ − α·n mod δ</th><th>φ(n) = n / gap</th></tr></thead><tbody>${rows.join("")}</tbody>`);
  const cf = T.continuedFraction(8192n, 15625n);
  $("tg-cf").textContent = `[${cf[0]}; ${cf.slice(1).join(", ")}]`;
}

const rec = { choice: "toy" };
function recChoices() {
  return [
    { value: "toy", html: "toy F = 6" },
    { value: "b16", html: "binary16 F = −8" },
    { value: "-17", html: "binary64 F = −17" },
    { value: "7", html: "binary64 F = 7" },
    { value: "-199", html: "binary64 F = −199" },
  ];
}

function setupRecursion() {
  const c = getParam("rec");
  if (c === "toy" || c === "b16" || (c && B64_E0_OF_F.has(Number(c)))) rec.choice = c;
  renderRecChips();
  renderRecursion();
}

function renderRecChips() {
  const items = recChoices();
  if (!items.some((i) => i.value === rec.choice)) items.push({ value: rec.choice, html: `binary64 F = ${minus(rec.choice)}` });
  chips($("tg-rec-rows"), items, rec.choice, (v) => { rec.choice = v; setParam("rec", v === "toy" ? null : v); renderRecursion(); });
}

function renderRecursion() {
  let fmt, alpha, delta, isMin, shift, bruteRow = null, label;
  if (rec.choice === "toy" || rec.choice === "b16") {
    const spec = T.LAB_ROWS[rec.choice];
    fmt = spec.fmt;
    ({ alpha, delta } = T.alphaDelta(spec.e0));
    isMin = spec.e0 === T.e0of(fmt.EMIN);
    shift = 2 * fmt.W;
    bruteRow = rec.choice === "toy" ? getToy() : (lab.rows.b16 ??= T.labRow("b16"));
    label = rec.choice === "toy" ? "toy row F = 6" : "binary16 row F = −8";
  } else {
    const f = Number(rec.choice);
    const e0 = B64_E0_OF_F.get(f);
    fmt = B64;
    ({ alpha, delta } = T.alphaDelta(e0));
    isMin = e0 === B64_E0S[0];
    shift = 128;
    label = `binary64 row F = ${minus(f)}`;
  }
  const trace = [];
  const max = T.worstOf(fmt, alpha, delta, isMin, trace);
  const n = T.argmaxN(fmt, alpha, delta, isMin, max);
  const table = $("tg-rec-table");
  const body = trace.map((s, i) => {
    const size = s.U - s.L + 1n;
    return `<tr><td>${i + 1}</td><td>φ<sub>${s.fn}</sub></td><td>${big(s.alpha, 5)}</td><td>${big(s.delta, 5)}</td><td>[${big(s.L, 5)}, ${big(s.U, 5)}]</td><td>${size < 10n ** 12n ? group(size) : `≈ 2<sup>${T.bitLength(size) - 1}</sup>`}</td></tr>`;
  });
  table.innerHTML = `<caption class="lab-sr-only">Steps of the generator's recursion for ${label}</caption><thead><tr><th>#</th><th>form</th><th>α</th><th>δ</th><th>range [L, U]</th><th>values</th></tr></thead><tbody>${body.join("")}</tbody>`;
  const { eps } = T.fastMultiplier(alpha, delta, shift);
  const limit = [1n << BigInt(shift), eps];
  const bits = T.log2Q(limit) - T.log2Q(max);
  const w = worstInfo(alpha, delta, n, shift);
  const lines = [
    `${label}: ${trace.length} calls. The worst n is <b class="tg-blue">${group(n)}</b>: its headroom is ${approx(w.head, 4)}, and at the real shift k = ${shift} its overshoot is ${approx(w.over, 4)}.`,
    `So the row passes with <strong>${bits.toFixed(2)}</strong> bits to spare (the φ test: ${approx(max, 5)} &lt; 2<sup>${shift}</sup>/ε ≈ ${approx(limit, 5)}).`,
  ];
  if (bruteRow) {
    const b = T.bruteMaximum(bruteRow);
    const same = T.cmpQ(b.max, max) === 0;
    lines.push(`Brute force over all ${group(bruteRow.count)} checked n: maximum at n = ${group(b.n)} ${same ? '<span class="tg-ok">✓ same maximum</span>' : '<span class="tg-bad">✗ differs</span>'}.`);
  } else {
    const { L, U } = T.rowDomain(fmt, isMin);
    lines.push(`Brute force would need ≈ 2<sup>${Math.round(T.log2Big(U - L + 1n))}</sup> evaluations here, so it is not attempted.`);
  }
  $("tg-rec-out").innerHTML = lines.map((l) => `<p>${l}</p>`).join("");
}

// ---------------------------------------------------------------------------
// Section 4: generate binary64.

const gen = { rows: [], result: null, running: false, selected: -199, ms: 0 };

function headroomColor(bits) {
  // Sequential single hue: little headroom = dark, plenty = pale.
  const t = Math.max(0, Math.min(1, (bits - 3) / 37));
  const dark = [11, 42, 110], light = [178, 200, 250];
  const c = dark.map((d, i) => Math.round(d + (light[i] - d) * t));
  return `rgb(${c.join(",")})`;
}

function drawGenChart() {
  const box = $("tg-gen-svg");
  const width = Math.max(300, Math.floor(box.clientWidth));
  const height = Math.round(Math.min(240, Math.max(190, width * 0.3)));
  const m = { l: 34, r: 8, t: 12, b: 30 };
  const pw = width - m.l - m.r, ph = height - m.t - m.b;
  const fMin = -324, fMax = 292, bw = pw / 617, yMax = 72;
  const X = (f) => m.l + (f - fMin) * bw;
  const Y = (b) => m.t + (1 - b / yMax) * ph;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "tg-svg tg-genchart", "aria-hidden": "true" });
  for (const b of [0, 16, 32, 48, 64]) {
    svg.append(svgEl("line", { x1: m.l, x2: m.l + pw, y1: Y(b), y2: Y(b), class: "tg-grid" }));
    svg.append(svgEl("text", { x: m.l - 5, y: Y(b) + 4, class: "tg-tick", "text-anchor": "end" }, String(b)));
  }
  for (const f of [-300, -200, -100, 0, 100, 200, 292]) {
    svg.append(svgEl("text", { x: X(f) + bw / 2, y: height - 12, class: "tg-tick", "text-anchor": "middle" }, minus(f)));
  }
  svg.append(svgEl("text", { x: m.l + pw, y: height - 1, class: "tg-axis", "text-anchor": "end" }, "decimal exponent F →"));
  svg.append(svgEl("text", { x: m.l + 4, y: m.t + 9, class: "tg-axis" }, "headroom (bits)"));
  const g = svgEl("g");
  for (const row of gen.rows) {
    g.append(svgEl("rect", { x: X(row.f), y: Y(row.headroomBits), width: Math.max(0.6, bw), height: Y(0) - Y(row.headroomBits), fill: headroomColor(row.headroomBits) }));
  }
  svg.append(g);
  if (!gen.rows.length) {
    svg.append(svgEl("text", { x: m.l + pw / 2, y: m.t + ph / 2, class: "tg-axis", "text-anchor": "middle" }, "Press “Generate binary64” to prove the rows."));
  }
  if (gen.result?.ok) {
    const bits = gen.rows.map((r) => r.headroomBits);
    const min = Math.min(...bits), med = T.median(bits);
    const minRow = gen.rows[bits.indexOf(min)];
    svg.append(svgEl("line", { x1: m.l, x2: m.l + pw, y1: Y(med), y2: Y(med), class: "tg-median" }));
    svg.append(svgEl("line", { x1: m.l, x2: m.l + pw, y1: Y(min), y2: Y(min), class: "tg-minline" }));
    $("tg-gen-key").innerHTML = `<span><i class="tg-key-min"></i>minimum ${min.toFixed(2)} bits, at F = ${minus(minRow.f)}</span><span><i class="tg-key-median"></i>median ${med.toFixed(1)} bits</span>`;
  }
  const sel = gen.rows.find((r) => r.f === gen.selected);
  if (sel) {
    const x = X(sel.f) + bw / 2;
    svg.append(svgEl("line", { x1: x, x2: x, y1: m.t, y2: Y(0), class: "tg-selline" }));
    svg.append(svgEl("path", { d: `M${x - 5},${m.t - 2} L${x + 5},${m.t - 2} L${x},${m.t + 5} Z`, class: "tg-seltri" }));
  }
  box.replaceChildren(svg);
  gen.geom = { X, bw, m, pw };
}

function genPick(ev) {
  const g = gen.geom;
  if (!g || !gen.rows.length) return null;
  const rect = $("tg-gen-svg").getBoundingClientRect();
  const px = ev.clientX - rect.left;
  const f = Math.round(-324 + (px - g.m.l) / g.bw - 0.5);
  return gen.rows.find((r) => r.f === Math.max(-324, Math.min(292, f))) ?? null;
}

function renderGenDetail() {
  const det = $("tg-gen-detail");
  const row = b64Row(gen.selected);
  $("tg-gen-rowout").textContent = minus(gen.selected);
  const exps = [];
  for (let e = row.e0; e <= row.e0 + 3; e++) if (e >= B64.EMIN && e <= B64.EMAX && T.e0of(e) === row.e0) exps.push(minus(e));
  const n = T.argmaxN(B64, row.alpha, row.delta, row.isMin, row.max);
  const trace = [];
  T.worstOf(B64, row.alpha, row.delta, row.isMin, trace);
  const minK = T.minimalShift(B64, row);
  const w = worstInfo(row.alpha, row.delta, n, 128);
  det.innerHTML = `
    <dl class="tg-dl">
      <dt>row</dt><dd>F = ${minus(row.f)}, e<sub>0</sub> = ${minus(row.e0)}, serves e = ${exps.join(", ")}</dd>
      <dt>α / δ</dt><dd>${powerHtml(row.alpha)} / ${powerHtml(row.delta)}</dd>
      <dt>M</dt><dd>upper ${hex(row.upper)}, lower ${hex(row.lower)}${row.eps === row.delta ? " <span class=\"tg-dim\">(exact ratio + 1)</span>" : ""}</dd>
      <dt>worst n</dt><dd>${group(n)} <span class="tg-dim">(found in ${trace.length} calls)</span></dd>
      <dt>its floor</dt><dd>headroom ${approx(w.head, 4)}, overshoot ${approx(w.over, 4)}</dd>
      <dt>headroom</dt><dd><strong>${row.headroomBits.toFixed(2)} bits</strong> · the smallest shift that would pass is ${minK}</dd>
    </dl>
    <p><button type="button" class="lab-button" id="tg-gen-showrec">Show its recursion ↑</button></p>`;
  $("tg-gen-showrec").addEventListener("click", () => {
    rec.choice = String(row.f);
    setParam("rec", rec.choice);
    renderRecChips();
    renderRecursion();
    $("tg-rec").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
}

function selectGenRow(f) {
  gen.selected = f;
  $("tg-gen-row").value = f;
  setParam("row", f === -199 ? null : f);
  drawGenChart();
  renderGenDetail();
}

function codeExcerpt(fmt, result, highlight) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const lines = T.emitC(fmt, result).split("\n");
  const out = [];
  const rowLine = (i) => lines.findIndex((l) => l.endsWith(`// ${i}`) && l.includes("{ 0x"));
  const keep = new Set();
  const addRange = (a, b) => { for (let i = a; i <= b; i++) keep.add(i); };
  const start = lines.indexOf("static const teju_multiplier_t multipliers[] = {");
  addRange(0, start + 3);
  for (const f of highlight) { const i = rowLine(f); if (i >= 0) addRange(i - 1, i + 1); }
  const end = lines.indexOf("};");
  addRange(end - 1, end + 7);
  addRange(lines.length - 3, lines.length - 1);
  let skipped = false;
  lines.forEach((l, i) => {
    if (!keep.has(i)) { if (!skipped) out.push(`<span class="tg-skip">  …</span>`); skipped = true; return; }
    skipped = false;
    const isHl = highlight.some((f) => l.includes("{ 0x") && l.endsWith(`// ${f}`) && i < end);
    out.push(isHl ? `<span class="hl">${esc(l)}</span>` : esc(l));
  });
  return { html: out.join("\n"), full: lines.map(esc).join("\n"), count: lines.length };
}

function checksHtml(checks) {
  return checks.map((c) => {
    const mark = c.skipped ? "–" : c.ok ? "✓" : "✗";
    const cls = c.skipped ? "tg-skipped" : c.ok ? "tg-okitem" : "tg-baditem";
    return `<li class="${cls}"><span class="tg-mark" aria-hidden="true">${mark}</span><code>${c.label}</code> <span>${c.what}${c.skipped ? " (skipped)" : ""}</span><span class="lab-sr-only">${c.skipped ? "skipped" : c.ok ? "passes" : "fails"}</span></li>`;
  }).join("");
}

function finishGen(result) {
  gen.result = result;
  gen.running = false;
  const status = $("tg-gen-status");
  const bits = gen.rows.map((r) => r.headroomBits);
  const minBits = Math.min(...bits);
  status.innerHTML = `<span class="tg-ok">✓</span> ${gen.rows.length} rows proved in ${Math.round(gen.ms)} ms. Tightest F = ${minus(gen.rows[bits.indexOf(minBits)].f)} (${minBits.toFixed(2)} bits), median ${T.median(bits).toFixed(1)} bits.`;
  $("tg-gen-run").textContent = "Generate again";
  $("tg-gen-run").disabled = false;
  drawGenChart();
  renderGenDetail();
  $("tg-gen-after").hidden = false;
  $("tg-gen-checks").innerHTML = checksHtml(result.checks);
  const ex = codeExcerpt(B64, result, [-199, -17]);
  $("tg-gen-code").innerHTML = ex.html;
  $("tg-gen-full").innerHTML = ex.full;
  $("tg-gen-lines").textContent = ex.count;
  const repo = [];
  for (const pin of T.PINNED_BINARY64) {
    const row = result.rows.find((r) => r.f === pin.f);
    const mine = T.emitMultiplierRow(row, 64).trim();
    repo.push({ ok: mine === pin.text, label: pin.text, what: `multipliers, F = ${minus(pin.f)}` });
  }
  for (const pin of T.PINNED_MINVERSE) {
    const mine = T.emitMinverseRow(result.minverse[pin.f], 64).trim();
    repo.push({ ok: mine === pin.text, label: pin.text, what: `minverse, f = ${pin.f}` });
  }
  repo.push({ ok: result.sorted === false, label: "#define teju_calculation_sorted 0u", what: "sorted flag" });
  $("tg-gen-repo").innerHTML = checksHtml(repo);
  factorySummary("binary64", result);
}

function setupGen() {
  const run = $("tg-gen-run"), status = $("tg-gen-status"), slider = $("tg-gen-row");
  const start = () => {
    if (gen.running) return;
    gen.running = true;
    gen.rows = [];
    gen.result = null;
    run.disabled = true;
    $("tg-gen-after").hidden = true;
    setParam("gen", 1);
    const t0 = performance.now();
    let lastDraw = 0;
    runChunked(T.generate(B64), {
      budget: 14,
      onYield: (row) => {
        gen.rows.push(row);
        const now = performance.now();
        if (now - lastDraw > 60) {
          lastDraw = now;
          status.textContent = `Proving row F = ${minus(row.f)} (${gen.rows.length} / 617)…`;
          drawGenChart();
        }
      },
      onDone: (result) => { gen.ms = performance.now() - t0; finishGen(result); },
    });
  };
  run.addEventListener("click", start);
  slider.addEventListener("input", () => selectGenRow(Number(slider.value)));
  chips($("tg-gen-chips"), [-324, -199, -17, 7, 292].map((f) => ({ label: `F = ${minus(f)}`, value: f })), null, (f) => selectGenRow(f));
  const svgBox = $("tg-gen-svg"), hover = $("tg-gen-hover");
  svgBox.addEventListener("pointermove", (ev) => {
    const row = genPick(ev);
    hover.innerHTML = row ? `F = ${minus(row.f)} · headroom ${row.headroomBits.toFixed(2)} bits` : "&nbsp;";
  });
  svgBox.addEventListener("pointerleave", () => { hover.innerHTML = "&nbsp;"; });
  svgBox.addEventListener("click", (ev) => { const row = genPick(ev); if (row) selectGenRow(row.f); });
  const f0 = Number(getParam("row"));
  if (getParam("row") !== null && B64_E0_OF_F.has(f0)) gen.selected = f0;
  $("tg-gen-row").value = gen.selected;
  $("tg-gen-rowout").textContent = minus(gen.selected);
  drawGenChart();
  renderGenDetail();
  if (getParam("gen") === "1") start();
}

// ---------------------------------------------------------------------------
// Section 5: the format factory.

const fac = { fmt: "binary32", W: 32, MW: 24, cancel: null };
const summary = new Map();

function factorySummary(id, result) {
  if (id && result) summary.set(id, result);
  const body = $("tg-fac-summary");
  const rows = ["binary16", "bfloat16", "binary32", "binary64"].map((fid) => {
    const f = T.FORMATS[fid], r = summary.get(fid);
    if (!r) return `<tr><td>${fid}</td><td>${f.W}</td><td>${2 * f.W}</td><td colspan="4" class="tg-dim">computing…</td></tr>`;
    const min = Math.min(...r.rows.map((x) => x.headroomBits));
    return `<tr><td>${fid}</td><td>${f.W}</td><td>${2 * f.W}</td><td>${r.rows.length}</td><td>${r.minverse.length}</td><td>${r.sorted ? 1 : 0}</td><td>${min.toFixed(2)} bits</td></tr>`;
  });
  body.innerHTML = rows.join("");
}

function setupFactory() {
  const fmtChips = $("tg-fac-fmts"), wSel = $("tg-fac-w"), mwIn = $("tg-fac-mw"), run = $("tg-fac-run");
  const pf = getParam("fmt");
  if (pf && T.FORMATS[pf]) fac.fmt = pf;
  const base = T.FORMATS[fac.fmt];
  fac.W = [16, 32, 64, 128].includes(Number(getParam("w"))) ? Number(getParam("w")) : base.W;
  const mw = Number(getParam("mw"));
  fac.MW = Number.isInteger(mw) && mw >= 2 && mw <= 120 ? mw : base.MW;
  const sync = () => { wSel.value = String(fac.W); mwIn.value = String(fac.MW); };
  const fmtIds = Object.keys(T.FORMATS);
  chips(fmtChips, fmtIds.map((id) => ({ label: id, value: id })), fac.fmt, (id) => {
    fac.fmt = id; fac.W = T.FORMATS[id].W; fac.MW = T.FORMATS[id].MW; sync(); go();
  });
  const breaks = [
    { label: "binary64, 60-bit significand", value: { fmt: "binary64", W: 64, MW: 60 } },
    { label: "binary64, 55-bit significand", value: { fmt: "binary64", W: 64, MW: 55 } },
    { label: "bfloat16, 9-bit significand", value: { fmt: "bfloat16", W: 16, MW: 9 } },
    { label: "binary16 on 16-bit words", value: { fmt: "binary16", W: 16, MW: 11 } },
  ];
  chips($("tg-fac-breaks"), breaks, null, (v) => {
    Object.assign(fac, v);
    pressChip(fmtChips, fmtIds.indexOf(v.fmt));
    sync();
    go();
  });
  run.addEventListener("click", () => {
    fac.W = Number(wSel.value);
    const v = Math.round(Number(mwIn.value));
    fac.MW = Number.isFinite(v) ? Math.max(2, Math.min(120, v)) : T.FORMATS[fac.fmt].MW;
    sync();
    go();
  });
  sync();

  function go() {
    fac.cancel?.();
    const base = T.FORMATS[fac.fmt];
    const fmt = { ...base, W: fac.W, MW: fac.MW };
    const isRepo = fmt.W === base.W && fmt.MW === base.MW;
    setParam("fmt", fac.fmt === "binary32" ? null : fac.fmt);
    setParam("w", fmt.W === base.W ? null : fmt.W);
    setParam("mw", fmt.MW === base.MW ? null : fmt.MW);
    const status = $("tg-fac-status"), checks = $("tg-fac-checks"), code = $("tg-fac-code");
    status.textContent = `Running the generator for ${fac.fmt} with W = ${fmt.W}, ${fmt.MW}-bit significands, shift ${2 * fmt.W}…`;
    checks.innerHTML = "";
    code.innerHTML = "";
    let count = 0;
    const t0 = performance.now();
    fac.cancel = runChunked(T.generate(fmt), {
      budget: 12,
      onYield: () => { count++; if (count % 50 === 0) status.textContent = `Proving rows… ${count}`; },
      onDone: (result) => {
        const ms = Math.round(performance.now() - t0);
        checks.innerHTML = checksHtml(result.checks);
        if (result.ok) {
          status.innerHTML = `<span class="tg-ok">✓</span> ${result.rows.length} rows, ${result.minverse.length} minverse rows, sorted = ${result.sorted ? 1 : 0}, in ${ms} ms.${isRepo ? ` This is the repo's <code>${base.repo}</code> configuration.` : ""}`;
          const ex = codeExcerpt(fmt, result, []);
          code.innerHTML = ex.html;
          if (isRepo) factorySummary(fac.fmt, result);
        } else {
          let extra = "";
          if (result.failedRow) {
            const r = result.failedRow;
            extra = ` Row F = ${minus(r.f)}: the worst φ ≈ ${approx(r.max, 5)} is not below 2<sup>${r.shift}</sup>/ε ≈ ${approx(r.limit, 5)} (short by ${(-r.headroomBits).toFixed(2)} bits).`;
          }
          status.innerHTML = `<span class="tg-bad">✗ The generator stops: “${result.stop}”</span>${extra}`;
        }
      },
    });
  }
  go();

  // Fill the repo summary table in the background.
  const pending = ["binary16", "bfloat16", "binary32", "binary64"].filter((id) => !summary.has(id));
  factorySummary(null, null);
  const next = () => {
    const id = pending.shift();
    if (!id) return;
    if (summary.has(id)) { next(); return; }
    runChunked(T.generate(T.FORMATS[id]), { budget: 8, onDone: (r) => { if (!summary.has(id)) factorySummary(id, r); next(); } });
  };
  setTimeout(next, 400);
}

// ---------------------------------------------------------------------------

let redrawSaw = null;
function init() {
  setupDeal();
  redrawSaw = setupSaw();
  redrawSaw();
  setupLab();
  setupRecords();
  setupRecursion();
  setupGen();
  setupFactory();
  let t = 0, lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      redrawSaw();
      if (lab.rows[lab.id]) drawLab();
      drawGenChart();
    }, 150);
  });
}

init();
