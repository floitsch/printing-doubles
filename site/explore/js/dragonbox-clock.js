// Copyright (C) 2026 Toit contributors.
//
// DOM and drawing code for the "1000-hour clock" Dragonbox page.

import * as M from "./dragonbox-clock-model.js";
import { nextUp, nextDown } from "../../js/float.js";

const SVGNS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PRESETS = [
  ["0.3", 0.3],
  ["0.1", 0.1],
  ["0.1+0.2", 0.1 + 0.2],
  ["2/3", 2 / 3],
  ["π", Math.PI],
  ["123.456", 123.456],
  ["5e-324", 5e-324],
  ["1e23", 1e23],
  ["max double", Number.MAX_VALUE],
];

const state = {
  value: 0.3,
  dk: 0,
  fold: 0,
  trail: [], // earlier clock states visited with prev/next (most recent first)
  walk: [], // table rows
  rand: { total: 0, hits: 0, bins: Array.from({ length: 9 }, () => ({ n: 0, hits: 0 })), last: null },
  pow: 64,
};

// ---------------------------------------------------------------------------
// Small helpers.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);

function svg(host, w, h, body, label) {
  host.innerHTML = `<svg xmlns="${SVGNS}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
  return host.firstElementChild;
}

/** Narrow hosts get a narrower viewBox so text stays readable on phones. */
const narrow = (host) => (host.clientWidth || 720) < 560;
/** viewBox width: 720 on wide screens, about 1:1 with CSS pixels on phones. */
const vbW = (host) => (narrow(host) ? Math.max(300, Math.round(host.clientWidth)) : 720);

/** "3000000000000000|721.64…" as HTML, the prefix greyed out. */
function splitHTML(q, places = 2) {
  const text = M.qFixed(q, places);
  const neg = text.startsWith("−");
  const body = neg ? text.slice(1) : text;
  const dot = body.search(/[.…]/);
  const int = dot < 0 ? body : body.slice(0, dot);
  const rest = dot < 0 ? "" : body.slice(dot);
  if (int.length <= 3) return `${neg ? "−" : ""}<b>${int}</b>${rest}`;
  return `${neg ? "−" : ""}<span class="dbc-prefix">${int.slice(0, -3)}</span><span class="dbc-bar">|</span><b>${int.slice(-3)}</b>${rest}`;
}

function splitInt(n) {
  const { prefix, last } = M.splitThousands(n);
  return `<span class="dbc-prefix">${prefix}</span><span class="dbc-bar">|</span><b>${last}</b>`;
}

/** Significant-digit rendering of a positive rational (for the unscaled window). */
function qSci(q, digits = 21) {
  let E = q.n.toString().length - q.d.toString().length;
  const ge = (a, p) => (p >= 0 ? a.n >= M.pow10(p) * a.d : a.n * M.pow10(-p) >= a.d);
  while (!ge(q, E)) E--;
  while (ge(q, E + 1)) E++;
  const shift = digits - 1 - E;
  const num = shift >= 0 ? q.n * M.pow10(shift) : q.n;
  const den = shift >= 0 ? q.d : q.d * M.pow10(-shift);
  const int = num / den;
  const exact = int * den === num;
  let s = int.toString();
  if (exact) s = s.replace(/0+$/, "") || "0";
  const tail = exact ? "" : "…";
  if (E >= -6 && E < 21) {
    if (E >= 0) {
      const whole = s.length > E + 1 ? `${s.slice(0, E + 1)}.${s.slice(E + 1)}` : s.padEnd(E + 1, "0");
      return whole + tail;
    }
    return `0.${"0".repeat(-E - 1)}${s}${tail}`;
  }
  return `${s[0]}${s.length > 1 ? "." + s.slice(1) : ""}${tail}e${E}`;
}

const show = (v) => String(v);

// ---------------------------------------------------------------------------
// Shared value controls (repeated in several figures, kept in sync).
function buildControls() {
  for (const host of $$("[data-dbc-controls]")) {
    const id = `dbc-in-${Math.random().toString(36).slice(2, 8)}`;
    host.innerHTML = `
      <label for="${id}">double</label>
      <input id="${id}" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" size="22" aria-describedby="${id}-err">
      <div class="lab-chips" role="group" aria-label="Preset doubles">${PRESETS.map(([l], i) => `<button type="button" data-preset="${i}" aria-pressed="false">${esc(l)}</button>`).join("")}</div>
      <span class="dbc-error" id="${id}-err" role="status"></span>`;
    const input = $("input", host);
    input.addEventListener("change", () => {
      const v = M.parseInput(input.value);
      const err = $(".dbc-error", host);
      if (!Number.isFinite(v) || v === 0) {
        err.textContent = "Enter a finite, non-zero double (e.g. 0.3, 1e23, 2^64, 0.1+0.2).";
        return;
      }
      err.textContent = v < 0 ? "Negative: showing |x|." : "";
      setValue(Math.abs(v), { resetTrail: true });
    });
    for (const b of $$("button[data-preset]", host)) {
      b.addEventListener("click", () => setValue(PRESETS[+b.dataset.preset][1], { resetTrail: true }));
    }
  }
}

function syncControls() {
  for (const host of $$("[data-dbc-controls]")) {
    const input = $("input", host);
    if (document.activeElement !== input) input.value = show(state.value);
    for (const b of $$("button[data-preset]", host)) {
      b.setAttribute("aria-pressed", String(PRESETS[+b.dataset.preset][1] === state.value));
    }
  }
}

function setValue(v, { resetTrail = false, fromWalk = false } = {}) {
  const previous = state.value;
  state.value = v;
  if (resetTrail) { state.trail = []; state.walk = []; }
  if (!fromWalk && !resetTrail && previous !== v) state.trail = [];
  writeURL();
  renderAll();
}

function writeURL() {
  const p = new URLSearchParams(location.search);
  p.set("x", show(state.value));
  if (state.dk) p.set("dk", state.dk); else p.delete("dk");
  history.replaceState(null, "", `${location.pathname}?${p}${location.hash}`);
}

// ---------------------------------------------------------------------------
// 1. Recap: the window of the double on an unscaled line.
function renderRecap() {
  const host = $("#dbc-recap");
  const v = state.value;
  const d = M.decompose(v);
  const W = vbW(host);
  const H = 130;
  const mid = W / 2;
  const unit = W * 0.3;
  const lowGap = d.shorter ? unit / 2 : unit;
  const lo = nextDown(v);
  const hi = nextUp(v);
  const leftX = mid - lowGap / 2;
  const rightX = mid + unit / 2;
  const endStyle = (closed) => (closed ? `fill="var(--blue)"` : `fill="var(--paper)" stroke="var(--blue)" stroke-width="2"`);
  const closed = d.shorter ? true : d.even;
  const fs = W < 500 ? 11 : 12;
  const body = `
    <line x1="10" y1="60" x2="${W - 10}" y2="60" stroke="var(--ink)" stroke-width="1"/>
    <rect x="${leftX}" y="48" width="${rightX - leftX}" height="24" fill="var(--blue)" opacity=".16"/>
    <circle cx="${leftX}" cy="60" r="5" ${endStyle(closed)}/>
    <circle cx="${rightX}" cy="60" r="5" ${endStyle(closed)}/>
    <circle cx="${mid - lowGap}" cy="60" r="4" fill="var(--muted)"/>
    <circle cx="${mid + unit}" cy="60" r="4" fill="var(--muted)"/>
    <circle cx="${mid}" cy="60" r="7" fill="var(--blue)"/>
    <text x="${mid}" y="36" text-anchor="middle" font-size="${fs + 1}" class="dbc-t">w</text>
    <text x="${mid - lowGap}" y="36" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-muted">lower neighbour</text>
    <text x="${mid + unit}" y="36" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-muted">upper neighbour</text>
    <text x="${leftX}" y="94" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-blue">midpoint</text>
    <text x="${rightX}" y="94" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-blue">midpoint</text>
    <text x="${mid}" y="118" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-muted">${d.shorter ? "lopsided window: the lower neighbour is twice as close" : `window: 2^${d.e} wide, endpoints ${closed ? "included" : "excluded"}`}</text>`;
  svg(host, W, H, body, `Number line: the double ${show(v)}, its neighbours, and its rounding window between the midpoints. Endpoints ${closed ? "included" : "excluded"}.`);

  const w = d.shorter ? null : M.scaledWindow(v, 0);
  const lowMid = d.shorter ? (() => { // (fc - 1/4) 2^e
    const s = M.shorterState(v);
    return M.Q(s.x.n * (s.k >= 0 ? 1n : M.pow10(-s.k)), s.x.d * (s.k >= 0 ? M.pow10(s.k) : 1n));
  })() : w.x;
  const highMid = d.shorter ? M.scaledWindow(v, 0).z : w.z;
  $("#dbc-recap-readout").innerHTML = `
    w = ${esc(show(v))} = ${d.fc}·2<sup>${d.e}</sup> <span class="dbc-muted">(f<sub>c</sub> is ${d.even ? "even" : "odd"})</span><br>
    lower neighbour ${esc(show(lo))} · upper neighbour ${esc(show(hi))}<br>
    window = [${qSci(lowMid)}, ${qSci(highMid)}] <span class="dbc-muted">${closed ? "closed" : "open"}</span>`;
}

// ---------------------------------------------------------------------------
// 2. The two-scale ruler with the hypothetical zoom.
function renderRuler() {
  const host = $("#dbc-ruler");
  const out = $("#dbc-ruler-readout");
  const s = M.rulerState(state.value, state.dk);
  $$("[data-dk]").forEach((b) => {
    const target = +b.dataset.dk;
    b.disabled = target !== 0 && Math.abs(state.dk + target) > 2;
    b.classList.toggle("primary", target === 0 && state.dk === 0);
  });
  if (s.shorter) {
    svg(host, 720, 60, `<text x="360" y="34" text-anchor="middle" class="dbc-t dbc-muted" font-size="13">This double is a power of two: its window is lopsided (see section 8).</text>`, "Power of two: see section 8");
    out.innerHTML = `${esc(show(state.value))} is a power of two. Dragonbox handles it on a separate path: <a href="#powers">section 8</a>.`;
    $("#dbc-k-out").textContent = "";
    return;
  }
  const W = vbW(host);
  const H = 150;
  const pad = 14;
  const delta = s.deltaNumber;
  const span = Math.max(delta * 1.7, W < 500 ? 1150 : 1500);
  const scale = (W - 2 * pad) / span;
  const cx = W / 2;
  const yLine = 78;
  const pos = (q) => cx + M.qToNumber(M.qSub(q, s.y)) * scale;
  const loV = M.qSub(s.y, M.Q(BigInt(Math.ceil(span / 2))));
  const first100 = M.qCeil(M.qDivInt(loV, 100n));
  const nTicks = Math.ceil(span / 100) + 2;
  const minorGap = 100 * scale;
  let ticks = "";
  let labels = "";
  const fs = W < 500 ? 10 : 11;
  const inside = (m) => {
    const q = M.Q(m);
    const a = M.qCmp(q, s.x);
    const b = M.qCmp(q, s.z);
    return s.closed ? a >= 0 && b <= 0 : a > 0 && b < 0;
  };
  // Shared prefix of the visible big ticks (for greying).
  const majors = [];
  for (let i = 0; i < nTicks; i++) {
    const m = (first100 + BigInt(i)) * 100n;
    const px = pos(M.Q(m));
    if (px < pad - 1 || px > W - pad + 1) continue;
    const major = m % 1000n === 0n;
    if (major) majors.push({ m, px });
    else if (minorGap >= 5) {
      const on = inside(m);
      ticks += `<line x1="${px}" y1="${yLine - 9}" x2="${px}" y2="${yLine + 9}" stroke="var(--red)" stroke-width="${on ? 2 : 1}" opacity="${on ? 1 : 0.45}"/>`;
      if (minorGap >= (W < 500 ? 24 : 30)) labels += `<text x="${px}" y="${yLine + 24}" text-anchor="middle" font-size="${fs - 1}" class="dbc-t dbc-muted">${(m % 1000n).toString().padStart(3, "0")}</text>`;
    }
  }
  const majorGap = 1000 * scale;
  const shortMajor = majorGap < (W < 500 ? 150 : 170);
  const majorLabelEvery = Math.max(1, Math.ceil((shortMajor ? 80 : 170) / majorGap));
  const centerIdx = majors.reduce((best, mm, i) => (Math.abs(mm.px - cx) < Math.abs(majors[best]?.px - cx) ? i : best), 0);
  majors.forEach((mm, i) => {
    const on = inside(mm.m);
    ticks += `<line x1="${mm.px}" y1="${yLine - 22}" x2="${mm.px}" y2="${yLine + 22}" stroke="var(--red)" stroke-width="${on ? 3.5 : 2}" opacity="${on ? 1 : 0.7}"/>`;
    if ((on && !shortMajor) || (i - centerIdx) % majorLabelEvery === 0) {
      const { prefix, last } = M.splitThousands(mm.m);
      const shown = shortMajor ? "…" + prefix.slice(-3) : prefix.length > 12 && W < 500 ? "…" + prefix.slice(-6) : prefix;
      labels += `<text x="${mm.px}" y="${yLine - 28}" text-anchor="middle" font-size="${fs}" class="dbc-t"><tspan class="dbc-prefix-svg">${shown}|</tspan><tspan font-weight="600" fill="var(--red)">${last}</tspan></text>`;
    }
  });
  const xPx = pos(s.x);
  const zPx = pos(s.z);
  const yPx = pos(s.y);
  const endStyle = s.closed ? `fill="var(--blue)"` : `fill="var(--paper)" stroke="var(--blue)" stroke-width="2"`;
  const bandW = Math.max(zPx - xPx, 1.5);
  const body = `
    <line x1="${pad}" y1="${yLine}" x2="${W - pad}" y2="${yLine}" stroke="var(--ink)"/>
    <rect x="${xPx}" y="${yLine - 14}" width="${bandW}" height="28" fill="var(--blue)" opacity=".18"/>
    ${ticks}
    <circle cx="${xPx}" cy="${yLine}" r="4" ${endStyle}/>
    <circle cx="${zPx}" cy="${yLine}" r="4" ${endStyle}/>
    <circle cx="${yPx}" cy="${yLine}" r="5" fill="var(--blue)"/>
    ${labels}
    <text x="${xPx}" y="${yLine + 44}" text-anchor="${bandW < 60 ? "end" : "middle"}" font-size="${fs}" class="dbc-t dbc-blue">x</text>
    <text x="${zPx}" y="${yLine + 44}" text-anchor="${bandW < 60 ? "start" : "middle"}" font-size="${fs}" class="dbc-t dbc-blue">z</text>
    <text x="${yPx}" y="${yLine + 58}" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-blue">y</text>`;
  const th = s.thousands.count;
  const hu = s.hundreds.count;
  svg(host, W, H, body, `Ruler at scale 10^${s.k}: window width ${fmt(delta, 2)}, ${th} multiple(s) of 1000 and ${hu} multiple(s) of 100 inside.`);

  $("#dbc-k-out").innerHTML = state.dk === 0 ? `k = ${s.k}` : `k = ${s.k} <span class="dbc-muted">(Dragonbox uses ${s.trace.k})</span>`;
  let verdict;
  if (state.dk === 0) {
    verdict = th === 1n
      ? `One multiple of 1000 is inside: <strong>${splitInt(s.thousands.first * 1000n)}</strong>. It is the shortest candidate, and the output is ${esc(s.trace.text)}.`
      : `No multiple of 1000 is inside, but ${hu} multiple${hu === 1n ? "" : "s"} of 100 ${hu === 1n ? "is" : "are"}. The one nearest y gives the output ${esc(s.trace.text)}.`;
  } else if (state.dk < 0) {
    verdict = hu === 0n
      ? `Too coarse: the window is under ${state.dk === -1 ? 100 : 10} wide and here it contains <strong>no</strong> multiple of 100, so "nearest multiple of 100" would land outside the window.`
      : `Too coarse: the window is under ${state.dk === -1 ? 100 : 10} wide. Here a multiple of 100 happens to fit, but that is not guaranteed. For other doubles none fits, and you would need finer ticks and more work.`;
  } else {
    verdict = `Too fine: ${th} multiples of 1000 are inside. To find the shortest one, you would have to keep dividing by 10, 100, …, which is the digit-by-digit search Dragonbox avoids.`;
  }
  out.innerHTML = `
    x = ${splitHTML(s.x)}<br>
    z = ${splitHTML(s.z)}<br>
    δ = 10<sup>${s.k}</sup>·2<sup>${s.e}</sup> = ${M.qFixed(s.delta, 2)} ${state.dk === 0 ? `<span class="dbc-muted">∈ [100, 1000)</span>` : ""}<br>
    multiples of 1000 inside: ${th} · multiples of 100 inside: ${hu}<br>${verdict}`;
}

// ---------------------------------------------------------------------------
// 3. The fold: ruler curling into a circle of circumference 1000.
let foldAnim = null;
function renderFold() {
  const host = $("#dbc-fold");
  const out = $("#dbc-fold-readout");
  const c = M.clockState(state.value);
  $("#dbc-fold-range").value = String(Math.round(state.fold * 100));
  $("#dbc-fold-play").textContent = state.fold >= 1 ? "Unfold ◀" : "Fold ▶";
  if (c.shorter) {
    svg(host, 720, 60, `<text x="360" y="34" text-anchor="middle" class="dbc-t dbc-muted" font-size="13">Powers of two do not fold onto the clock (section 8).</text>`, "Power of two");
    out.innerHTML = `See <a href="#powers">section 8</a>.`;
    return;
  }
  const t = state.fold;
  const small = narrow(host);
  const W = vbW(host);
  const H = small ? 330 : 400;
  const top = 58;
  const R1 = small ? Math.min(115, W / 2 - 40) : 145; // final radius in px
  const s0 = (W - 40) / 2000;
  const s1 = (TAU * R1) / 1000;
  const sc = s0 + (s1 - s0) * t * t;
  const cx = W / 2;
  // Anchor: the multiple of 1000 nearest y, relative to B (the clock's 12).
  const mRel = 1000n * M.qFloor(M.qDivInt(M.qAdd(c.yc, M.Q(500n)), 1000n)); // multiple of 1000 nearest y (relative to B)
  const rel = (q) => M.qToNumber(M.qSub(q, M.Q(mRel)));
  const pt = (u) => {
    if (t < 1e-4) return [cx + u * sc, top, 0];
    const Ru = 1000 / (TAU * t);
    const th = u / Ru;
    return [cx + sc * Ru * Math.sin(th), top + sc * Ru * (1 - Math.cos(th)), th];
  };
  const inward = (u, d) => {
    const [px, py, th] = pt(u);
    return [px - Math.sin(th) * d, py + Math.cos(th) * d];
  };
  const path = (a, b, step = 5) => {
    const pts = [];
    const n = Math.max(2, Math.ceil(Math.abs(b - a) / step));
    for (let i = 0; i <= n; i++) {
      const [px, py] = pt(a + ((b - a) * i) / n);
      pts.push(`${px.toFixed(2)},${py.toFixed(2)}`);
    }
    return pts.join(" ");
  };
  const fs = small ? 10 : 11;
  let body = `<polyline points="${path(-1000, 1000, 8)}" fill="none" stroke="var(--ink)" stroke-width="1"/>`;
  // window band
  const xr = rel(c.xc);
  const zr = rel(c.zc);
  const yr = rel(c.yc);
  body += `<polyline points="${path(xr, zr, 3)}" fill="none" stroke="var(--blue)" stroke-width="12" stroke-opacity=".28"/>`;
  // ticks
  const prefixFade = Math.max(0, 1 - 2.2 * t);
  for (let u = -1000; u <= 1000; u += 100) {
    const major = u % 1000 === 0;
    const [ax, ay] = inward(u, -(major ? 16 : 8));
    const [bx, by] = inward(u, major ? 16 : 8);
    const outer = Math.abs(u) > 500 || u === -500;
    const fade = outer ? Math.max(0, 1 - 1.6 * t) : 1;
    body += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="var(--red)" stroke-width="${major ? 2.5 : 1}" opacity="${(major ? 1 : 0.6) * (outer && t > 0.99 ? 0 : 1)}"/>`;
    const absM = c.B + mRel + BigInt(u);
    const last = (((absM % 1000n) + 1000n) % 1000n).toString().padStart(3, "0");
    const [lx, ly] = inward(u, major ? -30 : 22);
    if (fade <= 0.01) continue;
    if (major && !small) {
      const { prefix } = M.splitThousands(absM);
      const anchor = t < 0.25 && u === -1000 ? "start" : t < 0.25 && u === 1000 ? "end" : "middle";
      body += `<text x="${lx + (anchor === "start" ? -6 : anchor === "end" ? 6 : 0)}" y="${ly + 4}" text-anchor="${anchor}" font-size="${fs}" class="dbc-t" opacity="${fade}"><tspan class="dbc-prefix-svg" opacity="${prefixFade}">${prefixFade > 0.02 ? prefix + "|" : ""}</tspan><tspan fill="var(--red)" font-weight="600">${last}</tspan></text>`;
    } else if (major || (!small || t > 0.3 || u % 200 === 0)) {
      body += `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="${fs - (major ? 0 : 1)}" class="dbc-t ${major ? "" : "dbc-muted"}" opacity="${fade}" ${major ? `fill="var(--red)" font-weight="600"` : ""}>${last}</text>`;
    }
  }
  const [zx, zy] = pt(zr);
  const [yx, yy] = pt(yr);
  const [zlx, zly] = inward(zr, -26);
  body += `<circle cx="${yx}" cy="${yy}" r="5" fill="var(--blue)"/><circle cx="${zx}" cy="${zy}" r="4" fill="var(--blue)"/><text x="${zlx}" y="${zly + 4}" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-blue">z</text>`;
  if (t >= 0.999) {
    const [ox, oy] = [cx, top + sc * (1000 / TAU)];
    body += `<circle cx="${ox}" cy="${oy}" r="2" fill="var(--ink)"/><text x="${ox}" y="${oy + 18}" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-muted">circumference 1000</text>`;
  }
  svg(host, W, H, body, `The ruler folded ${Math.round(t * 100)}% into a circle of circumference 1000. z sits at ${M.qFixed(c.zMod, 2)} on the circle.`);
  out.innerHTML = `z = ${splitHTML(c.z)} → on the circle: <strong>${M.qFixed(c.zMod, 2)}</strong><br>
    <span class="dbc-muted">Dragonbox keeps the prefix for the output and looks only at the remainder:</span> z<sub>i</sub> = ${splitInt(c.trace.zi)}, so <code>r</code> = ${c.trace.r0}.`;
}

function playFold() {
  if (foldAnim) cancelAnimationFrame(foldAnim);
  const from = state.fold;
  const to = from >= 1 ? 0 : 1;
  if (reduceMotion()) { state.fold = to; renderFold(); return; }
  const t0 = performance.now();
  const dur = 1600;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    state.fold = from + (to - from) * e;
    renderFold();
    if (p < 1) foldAnim = requestAnimationFrame(step);
    else foldAnim = null;
  };
  foldAnim = requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------
// The clock drawing, shared by the main clock and the gallery.
function clockSVG(c, opts = {}) {
  const size = opts.size ?? 440;
  const cx = size / 2;
  const cy = size / 2;
  const R = opts.radius ?? size * 0.34;
  const fs = opts.fontSize ?? 13;
  const angle = (u) => (TAU * u) / 1000;
  const at = (u, r) => [cx + r * Math.sin(angle(u)), cy - r * Math.cos(angle(u))];
  const arc = (a, b, r) => {
    const len = b - a;
    if (len >= 999.999) return `M ${cx} ${cy - r} a ${r} ${r} 0 1 1 0.01 0`;
    const [x0, y0] = at(a, r);
    const [x1, y1] = at(b, r);
    return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${len > 500 ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
  };
  let body = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--ink)" stroke-width="1"/>`;
  // Minor ticks every 10, medium every 50.
  if (!opts.mini) {
    for (let u = 0; u < 1000; u += 10) {
      if (u % 100 === 0) continue;
      const len = u % 50 === 0 ? 7 : 3.5;
      const [a1, b1] = at(u, R);
      const [a2, b2] = at(u, R - len);
      body += `<line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}" stroke="var(--ink)" stroke-width=".7" opacity=".45"/>`;
    }
  }
  // Trail (older arcs spiral inwards).
  (opts.trail || []).forEach((old, i) => {
    const r = R - 16 * (i + 1);
    if (r < R * 0.35) return;
    const a = M.qToNumber(old.xc);
    const b = M.qToNumber(old.zc);
    const op = Math.max(0.12, 0.3 - i * 0.04);
    body += `<path d="${arc(a, b, r)}" fill="none" stroke="var(--blue)" stroke-width="7" stroke-opacity="${op}"/>`;
    const [mx, my] = at(Number(old.markMod), r);
    body += `<circle cx="${mx}" cy="${my}" r="3.2" fill="var(--red)" opacity="${op + 0.3}"/>`;
  });
  // Hour marks.
  for (let h = 0; h < 10; h++) {
    const u = h * 100;
    const isTwelve = h === 0;
    const chosen = Number(c.markMod) === u;
    const [a1, b1] = at(u, R + (isTwelve ? 10 : 6));
    const [a2, b2] = at(u, R - (isTwelve ? 16 : 12));
    const col = chosen ? "var(--red)" : isTwelve ? "var(--ink)" : "var(--muted)";
    body += `<line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}" stroke="${col}" stroke-width="${chosen ? 4 : isTwelve ? 2.5 : 1.6}"/>`;
    if (!opts.mini || isTwelve || chosen) {
      const [lx, ly] = at(u, R + (opts.mini ? 16 : 24));
      body += `<text x="${lx}" y="${ly + fs * 0.35}" text-anchor="middle" font-size="${fs}" class="dbc-t" ${chosen ? `fill="var(--red)" font-weight="600"` : isTwelve ? `font-weight="600"` : `fill="var(--muted)"`}>${String(u).padStart(3, "0")}</text>`;
    }
  }
  // Current arc.
  const a = M.qToNumber(c.xc);
  const b = M.qToNumber(c.zc);
  body += `<path d="${arc(a, b, R)}" fill="none" stroke="var(--blue)" stroke-width="${opts.mini ? 10 : 13}" stroke-opacity=".6"/>`;
  const endStyle = c.closed ? `fill="var(--blue)"` : `fill="var(--paper)" stroke="var(--blue)" stroke-width="2"`;
  const [ex0, ey0] = at(a, R);
  const [ex1, ey1] = at(b, R);
  body += `<circle cx="${ex0}" cy="${ey0}" r="${opts.mini ? 4 : 5}" ${endStyle}/><circle cx="${ex1}" cy="${ey1}" r="${opts.mini ? 4 : 5}" ${endStyle}/>`;
  // Hand to z, dot at y, pointer from y to the chosen mark.
  const [hx, hy] = at(b, R - 8);
  body += `<line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" stroke="var(--blue)" stroke-width="${opts.mini ? 1.5 : 2}"/><circle cx="${cx}" cy="${cy}" r="3" fill="var(--ink)"/>`;
  const yu = M.qToNumber(c.yc);
  const [yx, yy] = at(yu, R);
  body += `<circle cx="${yx}" cy="${yy}" r="${opts.mini ? 3.5 : 4.5}" fill="var(--blue)" stroke="var(--paper)" stroke-width="1.5"/>`;
  if (!c.covers12) {
    const mu = Number(c.markRel);
    const [m1x, m1y] = at(yu, R - 22);
    const [m2x, m2y] = at(mu, R - 22);
    body += `<path d="M ${m1x} ${m1y} L ${m2x} ${m2y}" stroke="var(--red)" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/>`;
  }
  if (!opts.mini) {
    const [zlx, zly] = at(b, R - 34);
    body += `<text x="${zlx}" y="${zly + 4}" text-anchor="middle" font-size="${fs - 1}" class="dbc-t dbc-blue">z</text>`;
    body += `<text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="${fs - 1}" class="dbc-t dbc-muted">δ = ${M.qFixed(c.delta, 1)}</text>`;
  }
  return body;
}

// ---------------------------------------------------------------------------
// 4. The main clock and the walk.
function renderClock() {
  const host = $("#dbc-clock");
  const c = M.clockState(state.value);
  const list = $("#dbc-reasoning");
  if (c.shorter) {
    svg(host, 440, 120, `<text x="220" y="60" text-anchor="middle" class="dbc-t dbc-muted" font-size="14">Power of two: see section 8.</text>`, "Power of two");
    list.innerHTML = `<li>${esc(show(state.value))} is a power of two. Its window is lopsided, so Dragonbox uses the separate path in <a href="#powers">section 8</a>.</li>`;
    $("#dbc-tally").textContent = "";
    renderWalkTable();
    return;
  }
  const trail = state.trail.filter((o) => o.trace.k === c.trace.k).slice(0, 8);
  const small = narrow(host.parentElement);
  svg(host, 440, 440, clockSVG(c, { trail, fontSize: small ? 15 : 13 }), clockLabel(c));
  list.innerHTML = reasoning(c).map((li) => `<li>${li}</li>`).join("");
  const visited = state.walk.length;
  const hits = state.walk.filter((w) => w.covers).length;
  $("#dbc-tally").innerHTML = visited > 1
    ? `Walk tally: 12 covered for <strong>${hits} of ${visited}</strong> doubles (${fmt((100 * hits) / visited, 0)}%). Expected about δ/1000 = ${fmt(M.qToNumber(c.delta) / 10, 1)}%.`
    : `Press <em>next double</em> to walk; the tally compares the hit rate with δ/1000 = ${fmt(M.qToNumber(c.delta) / 10, 1)}%.`;
  renderWalkTable();
}

function clockLabel(c) {
  return `Clock with 1000 marks. The window arc runs from ${M.qFixed(c.xMod, 1)} to ${M.qFixed(c.zMod, 1)} (length ${M.qFixed(c.delta, 1)}). ` +
    (c.covers12 ? "It covers 12 o'clock." : `It misses 12 o'clock; the hour mark nearest its middle (${M.qFixed(c.yMod, 1)}) is ${String(c.markMod).padStart(3, "0")}.`) +
    ` Output ${c.trace.text}.`;
}

function reasoning(c) {
  const t = c.trace;
  const L = [];
  L.push(`k = ${t.k}: z = ${splitHTML(c.z)}<br>z<sub>i</sub> = ${splitInt(t.zi)} → <var>s</var> = ${t.s}, <code>r</code> = <strong>${t.r0}</strong>`);
  L.push(`δ = ${M.qFixed(c.delta, 2)} → <code>deltai</code> = <strong>${t.deltai}</strong>. The arc runs from ${M.qFixed(c.xMod, 2)} to ${M.qFixed(c.zMod, 2)}${M.qCmp(c.xc, M.Q(0n)) < 0 ? " (across 12)" : ""}.`);
  if (t.excludedRight) {
    L.push(`<code>r</code> = 0 and z is an integer: the arc ends <em>exactly</em> on 12. f<sub>c</sub> is odd, so that endpoint is excluded. The code sets <code>--decimal_significand; r = big_divisor;</code> (prefix ${t.sBeforeSmall}, <code>r</code> = 1000) and falls through.`);
  } else if (t.xResult) {
    const inside = t.sub === "big";
    L.push(`<code>r == deltai</code>: integer parts can't tell whether the left end is before 12. Parity of ⌊x⌋ is ${t.xResult.parity ? "odd" : "even"}${t.xResult.isInteger ? ", and x is an integer" : ""}. ${inside ? (t.xResult.parity ? "So x < 1000·s: 12 is covered." : "So x = 1000·s exactly, and f<sub>c</sub> is even: the endpoint counts. 12 is covered.") : "So x ≥ 1000·s: 12 is not covered."}`);
  } else if (t.sub === "big") {
    L.push(`<code>r &lt; deltai</code> (${t.r0} &lt; ${t.deltai}): the arc reaches back past 12. <strong>${t.s}</strong>·1000 is inside.${t.r0 === 0n && t.zIsInteger ? " (It ends exactly on 12, and f<sub>c</sub> is even, so the endpoint counts.)" : ""}`);
  } else {
    L.push(`<code>r &gt; deltai</code> (${t.r0} &gt; ${t.deltai}): the arc misses 12.`);
  }
  if (t.sub === "big") {
    L.push(`Output <var>s</var> = ${t.bigSignificand} × 10<sup>${-t.k + 3}</sup>; strip ${t.removed} trailing zero${t.removed === 1 ? "" : "s"} → <strong>${t.significand}</strong> × 10<sup>${t.exponent}</sup> = <strong>${esc(t.text)}</strong> (${t.digits} digit${t.digits === 1 ? "" : "s"}).`);
  } else {
    L.push(`Middle ≈ <code>r − deltai/2</code>: <code>dist</code> = ${t.r} − ${t.deltai / 2n} + 50 = <strong>${t.dist}</strong> → digit ⌊${t.dist}/100⌋ = ${t.digit0}. <span class="dbc-muted">(exact middle: ${M.qFixed(c.yMod, 2)})</span>`);
    if (t.divisible) {
      L.push(t.yFix === "parity"
        ? `<code>dist</code> is a multiple of 100: the middle is within one unit of halfway. Parity of ⌊y⌋ disagrees with the estimate, so y is just below halfway: digit − 1 = ${t.digit}.`
        : t.yFix === "tie"
          ? `<code>dist</code> is a multiple of 100 and y is an integer: the middle is exactly halfway between two hour marks. Tie → even digit: ${t.digit}.`
          : `<code>dist</code> is a multiple of 100, but the parity of ⌊y⌋ confirms the estimate; no tie. Digit stays ${t.digit}.`);
    }
    L.push(`Output ${t.sBeforeSmall}·10 + ${t.digit} = <strong>${t.significand}</strong> × 10<sup>${t.exponent}</sup> = <strong>${esc(t.text)}</strong> (${t.digits} digits).`);
  }
  return L;
}

function walkRow(v) {
  const c = M.clockState(v);
  if (c.shorter) return { v, text: c.trace.text, covers: false, shorter: true };
  return { v, zi: c.trace.zi, r: c.trace.r0, covers: c.trace.sub === "big", text: c.trace.text, digits: c.trace.digits };
}

function renderWalkTable() {
  const tbody = $("#dbc-walk tbody");
  if (!state.walk.length) state.walk = [walkRow(state.value)];
  tbody.innerHTML = state.walk.slice(-8).reverse().map((w) => `<tr${w.v === state.value ? ` class="dbc-current"` : ""}><td>${esc(show(w.v))}</td><td>${w.shorter ? "—" : splitInt(w.zi)}</td><td>${w.shorter ? "power of two" : w.covers ? "yes" : "no"}</td><td>${esc(w.text)}</td></tr>`).join("");
}

function walk(dir) {
  const before = M.clockState(state.value);
  const v = dir > 0 ? nextUp(state.value) : nextDown(state.value);
  if (!Number.isFinite(v) || v <= 0) return;
  if (!before.shorter) state.trail.unshift(before);
  state.trail = state.trail.slice(0, 10);
  if (!state.walk.length) state.walk = [walkRow(state.value)];
  state.walk.push(walkRow(v));
  animateClock(before, v);
}

let clockAnim = null;
function animateClock(before, v) {
  const after = M.clockState(v);
  const finish = () => { setValue(v, { fromWalk: true }); };
  if (reduceMotion() || before.shorter || after.shorter || before.trace.k !== after.trace.k) { finish(); return; }
  if (clockAnim) cancelAnimationFrame(clockAnim);
  const host = $("#dbc-clock");
  const from = M.qToNumber(before.zc);
  let to = M.qToNumber(after.zc) + 1000 * Number(after.trace.s - before.trace.s);
  const t0 = performance.now();
  const dur = 380;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - p) ** 3;
    const shift = (to - from) * e;
    const temp = { ...before, xc: M.qAdd(before.xc, M.Q(BigInt(Math.round(shift * 1000)), 1000n)), zc: M.qAdd(before.zc, M.Q(BigInt(Math.round(shift * 1000)), 1000n)), yc: M.qAdd(before.yc, M.Q(BigInt(Math.round(shift * 1000)), 1000n)), covers12: true, markMod: -1n };
    svg(host, 440, 440, clockSVG(temp, { trail: state.trail.filter((o) => o.trace.k === before.trace.k).slice(1, 8) }), "Rotating to the next double");
    if (p < 1) clockAnim = requestAnimationFrame(step);
    else { clockAnim = null; finish(); }
  };
  clockAnim = requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------
// 5. Random doubles: how often is 12 covered?
let rng = null;
function randomBits() {
  if (!rng) {
    const a = new BigUint64Array(1);
    crypto.getRandomValues(a);
    rng = M.xorshift64(a[0] || 1n);
  }
  return rng();
}

function sample(n) {
  const R = state.rand;
  for (let i = 0; i < n; i++) {
    const v = M.randomDouble(randomBits);
    const t = M.computeNearest(v);
    if (t.shorter) continue;
    const bin = Math.min(8, Math.floor(Number(t.deltai) / 100) - 1);
    R.total++;
    R.bins[bin].n++;
    if (t.sub === "big") { R.hits++; R.bins[bin].hits++; }
    R.last = t;
  }
  renderHist();
}

function renderHist() {
  const host = $("#dbc-hist");
  const R = state.rand;
  const small = narrow(host);
  const W = vbW(host);
  const H = 250;
  const l = 44, r = 14, top = 18, bottom = 44;
  const pw = W - l - r;
  const ph = H - top - bottom;
  const X = (d) => l + ((d - 100) / 900) * pw;
  const Y = (f) => top + (1 - f) * ph;
  const fs = small ? 11 : 11;
  let body = "";
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    body += `<line x1="${l}" y1="${Y(f)}" x2="${W - r}" y2="${Y(f)}" stroke="var(--line)"/><text x="${l - 6}" y="${Y(f) + 4}" text-anchor="end" font-size="${fs}" class="dbc-t dbc-muted">${f * 100}%</text>`;
  }
  R.bins.forEach((b, i) => {
    const x0 = X(100 + i * 100) + 3;
    const x1 = X(200 + i * 100) - 3;
    if (b.n) {
      const f = b.hits / b.n;
      body += `<rect x="${x0}" y="${Y(f)}" width="${x1 - x0}" height="${Y(0) - Y(f)}" fill="var(--red)" opacity=".8"/>`;
    }
    body += `<text x="${(x0 + x1) / 2}" y="${H - bottom + 16}" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-muted">${100 + i * 100}${small ? "" : `–${199 + i * 100}`}</text>`;
    if (!small) body += `<text x="${(x0 + x1) / 2}" y="${H - bottom + 30}" text-anchor="middle" font-size="${fs - 1}" class="dbc-t dbc-muted">n=${b.n}</text>`;
  });
  body += `<line x1="${X(100)}" y1="${Y(0.1)}" x2="${X(1000)}" y2="${Y(1)}" stroke="var(--ink)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  body += `<text x="${X(1000) - 4}" y="${Y(1) + 16}" text-anchor="end" font-size="${fs}" class="dbc-t">δ/1000</text>`;
  body += `<line x1="${l}" y1="${Y(M.EXPECTED_HIT_RATE)}" x2="${W - r}" y2="${Y(M.EXPECTED_HIT_RATE)}" stroke="var(--blue)" stroke-width="1" stroke-dasharray="2 3"/>`;
  body += `<text x="${l + 6}" y="${Y(M.EXPECTED_HIT_RATE) - 5}" font-size="${fs}" class="dbc-t dbc-blue">39.1% overall (expected)</text>`;
  if (small) body += `<text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-muted">deltai</text>`;
  svg(host, W, H, body, `Histogram of random doubles by deltai; overall ${R.total ? fmt((100 * R.hits) / R.total, 1) : 0}% cover 12 o'clock after ${R.total} samples.`);
  const last = R.last;
  $("#dbc-hist-readout").innerHTML = R.total
    ? `<strong>${fmt((100 * R.hits) / R.total, 1)}%</strong> of ${R.total} random doubles cover 12 (expected 0.9/ln 10 = ${fmt(100 * M.EXPECTED_HIT_RATE, 2)}%).<br><span class="dbc-muted">last: ${esc(show(last.value))}, <code>deltai</code> = ${last.deltai}, <code>r</code> = ${last.r0} → ${last.sub === "big" ? "covers 12" : "misses 12"} → ${esc(last.text)}</span>`
    : "No samples yet.";
}

// ---------------------------------------------------------------------------
// 6. Edge-case gallery.
const EDGE_CASES = [
  {
    id: "1e23",
    value: 1e23,
    title: "1e23: right end exactly on 12, included",
    focus: "right",
    text: (c) => `The double is 99999999999999991611392. At k = ${c.trace.k}, z = ${splitHTML(c.z, 1)} is an integer: <code>r</code> = 0, so the arc ends exactly on 12. f<sub>c</sub> is even, so the endpoint is in the window (filled dot). <code>r &lt; deltai</code> accepts it, and the output is <strong>1e23</strong>.`,
  },
  {
    id: "9.5e21",
    value: 9.499999999999999e21,
    title: "9.499999999999999e21: right end on 12, excluded",
    focus: "right",
    text: (c) => `Its z is exactly 9.5e21, the midpoint to its upper neighbour: <code>r</code> = 0 again. But f<sub>c</sub> = ${c.trace.fc} is odd, so that endpoint is <em>not</em> in the window (hollow dot). 9.5e21 reads back as the even neighbour, not this double. The code notices <code>r == 0</code>, <code>is_integer</code> and the excluded endpoint, decrements the prefix and sets <code>r = big_divisor</code> (1000). Then <code>dist</code> = 1000 − ${c.trace.deltai / 2n} + 50 = ${c.trace.dist} gives digit 9: <strong>${esc(c.trace.text)}</strong>.`,
  },
  {
    id: "7e22",
    value: 7e22,
    title: "7e22: left end exactly on 12",
    focus: "left",
    text: (c) => `The double is 70000000000000004194304. At k = ${c.trace.k}, <code>r</code> = <code>deltai</code> = ${c.trace.deltai}: from the integer parts alone, the left end could be just before or just after 12. The parity check says ⌊x⌋ is even and x is an integer, so x lies exactly on 12. f<sub>c</sub> is even, so the endpoint counts, and the output is <strong>7e22</strong>. See below for why one bit is enough.`,
  },
  {
    id: "tie",
    value: 513 * 2 ** -20,
    title: "513·2⁻²⁰: middle exactly between two hours",
    focus: "mid",
    text: (c) => `513·2<sup>−20</sup> = 0.00048923492431640625. Its arc misses 12 (<code>r</code> = ${c.trace.r0} &gt; <code>deltai</code> = ${c.trace.deltai}), and <code>dist</code> = ${c.trace.dist} is a multiple of 100. So the middle is within a unit of halfway between the 200 and 300 marks. y is an integer, so it is exactly halfway, a true tie. Round-half-to-even picks digit 2: <strong>${esc(c.trace.text)}</strong>, not …063. (When y is only <em>near</em> halfway, the parity of ⌊y⌋ decides instead. 24211351596743786000 is an example.)`,
  },
];

function magnifier(c, focus, W = 300) {
  // A linear strip of +-3 units around the critical point.
  const H = 64;
  const lowMark = 100n * M.qFloor(M.qDivInt(c.yc, 100n));
  const center = focus === "mid" ? M.Q(lowMark + 50n) : M.Q(0n);
  const scale = W / 7;
  const px = (q) => W / 2 + M.qToNumber(M.qSub(q, center)) * scale;
  const clip = (v) => Math.max(-8, Math.min(W + 8, v));
  const x0 = clip(px(c.xc));
  const x1 = clip(px(c.zc));
  let body = `<line x1="0" y1="32" x2="${W}" y2="32" stroke="var(--ink)"/>`;
  body += `<rect x="${Math.max(0, x0)}" y="22" width="${Math.max(0, Math.min(W, x1) - Math.max(0, x0))}" height="20" fill="var(--blue)" opacity=".2"/>`;
  for (let u = -3; u <= 3; u++) {
    const x = W / 2 + u * scale;
    body += `<line x1="${x}" y1="27" x2="${x}" y2="37" stroke="var(--ink)" opacity=".4"/>`;
  }
  const endStyle = c.closed ? `fill="var(--blue)"` : `fill="var(--paper)" stroke="var(--blue)" stroke-width="2"`;
  let label;
  if (focus === "mid") {
    const yx = px(c.yc);
    body += `<line x1="${W / 2}" y1="14" x2="${W / 2}" y2="50" stroke="var(--red)" stroke-dasharray="3 2"/><circle cx="${yx}" cy="32" r="5" fill="var(--blue)"/>`;
    const mm = (v) => String(((v % 1000n) + 1000n) % 1000n).padStart(3, "0");
    label = `y = ${M.qFixed(c.yMod, 3)}: halfway between ${mm(lowMark)} and ${mm(lowMark + 100n)}`;
  } else {
    body += `<line x1="${W / 2}" y1="12" x2="${W / 2}" y2="52" stroke="var(--red)" stroke-width="3"/>`;
    const ex = focus === "right" ? x1 : x0;
    body += `<circle cx="${ex}" cy="32" r="6" ${endStyle}/>`;
    label = focus === "right" ? `z = 12 o'clock exactly · endpoint ${c.closed ? "included" : "excluded"}` : `x = 12 o'clock exactly · endpoint ${c.closed ? "included" : "excluded"}`;
  }
  body += `<text x="${W / 2}" y="${H - 1}" text-anchor="middle" font-size="11" class="dbc-t dbc-muted">${label}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Magnifier: ${esc(label)}">${body}</svg>`;
}

function renderGallery() {
  const host = $("#dbc-gallery");
  host.innerHTML = EDGE_CASES.map((ec) => {
    const c = M.clockState(ec.value);
    return `<article class="dbc-card">
      <h4>${ec.title}</h4>
      <div class="dbc-card-figs">
        <svg viewBox="0 0 220 220" role="img" aria-label="${esc(clockLabel(c))}">${clockSVG(c, { size: 220, radius: 78, mini: true, fontSize: 11 })}</svg>
        <div class="dbc-mag">${magnifier(c, ec.focus)}</div>
      </div>
      <p>${ec.text(c)}</p>
      <button class="lab-button" type="button" data-edge="${ec.id}">Show on the big clock ↑</button>
    </article>`;
  }).join("");
  for (const b of $$("button[data-edge]", host)) {
    b.addEventListener("click", () => {
      const ec = EDGE_CASES.find((e) => e.id === b.dataset.edge);
      setValue(ec.value, { resetTrail: true });
      $("#clock").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" });
    });
  }
  // Tiny doubles table.
  const rows = [];
  for (let n = 1; n <= 12; n++) {
    const v = n * 5e-324;
    const c = M.clockState(v);
    const t = c.trace;
    const chosen = t.sub === "big" ? t.s * 1000n : t.sBeforeSmall * 1000n + 100n * t.digit;
    rows.push(`<tr${n === 9 || n === 11 ? ` class="dbc-current"` : ""}><td>${n}</td><td>${M.qFixed(c.x, 2)}</td><td>${M.qFixed(c.y, 2)}</td><td>${M.qFixed(c.z, 2)}</td><td>${t.sub === "big" ? "yes" : "no"}</td><td>${chosen}</td><td><button type="button" class="dbc-linkbtn" data-tiny="${n}">${esc(show(v))}</button></td></tr>`);
  }
  $("#dbc-tiny tbody").innerHTML = rows.join("");
  for (const b of $$("button[data-tiny]")) {
    b.addEventListener("click", () => {
      setValue(+b.dataset.tiny * 5e-324, { resetTrail: true });
      $("#clock").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" });
    });
  }
}

// ---------------------------------------------------------------------------
// 7. The code with live values.
function renderCode() {
  const pre = $("#dbc-code");
  const c = M.clockState(state.value);
  const t = c.trace;
  if (c.shorter) {
    pre.innerHTML = esc(`// ${show(state.value)} is a power of two: compute_nearest takes the
// shorter-interval branch (section 8) before reaching this code.`);
    return;
  }
  const hex = t.cache.toString(16).padStart(32, "0");
  const lines = [];
  const L = (code, comment = "", on = true) => lines.push({ code, comment, on });
  L("// Step 1: one multiplication");
  L("minus_k = floor_log10_pow2(e) - kappa;", `e = ${t.e}, k = ${t.k}`);
  L("cache   = get_cache(-minus_k);", `0x${hex.slice(0, 16)}'${hex.slice(16)}`);
  L("beta    = e + floor_log2_pow10(-minus_k);", `${t.beta}`);
  L("deltai  = compute_delta(cache, beta);", `cache.high >> (63 - beta) = ${t.deltai}`);
  L("z_result = compute_mul((two_fc | 1) << beta, cache);", `zi = ${t.zi}, is_integer = ${t.zIsInteger}`);
  L("");
  L("// Step 2: try big_divisor = 1000");
  L("decimal_significand = z_result.integer_part / big_divisor;", `${t.s}`);
  L("r = z_result.integer_part - big_divisor * decimal_significand;", `${t.r0}`);
  const lt = t.r0 < t.deltai;
  const eq = t.r0 === t.deltai;
  L("if (r < deltai) {", `${t.r0} < ${t.deltai}: ${lt}`);
  L("  if (r == 0 && z_result.is_integer && !include_right_endpoint)", lt ? `f_c ${t.even ? "even" : "odd"}` : "", lt);
  L("    { --decimal_significand; r = big_divisor; goto step3; }", t.excludedRight ? "taken" : "", !!t.excludedRight);
  L("} else if (r > deltai) {", !lt && !eq ? `${t.r0} > ${t.deltai}` : "", !lt && !eq);
  L("  goto step3;", "", !lt && !eq);
  L("} else {  // r == deltai: compare fractional parts", "", eq);
  L("  x_result = compute_mul_parity(two_fc - 1, cache, beta);", eq ? `parity = ${t.xResult.parity}, is_integer = ${t.xResult.isInteger}` : "", eq);
  L("  if (!(x_result.parity | (x_result.is_integer & include_left_endpoint)))", "", eq);
  L("    goto step3;", eq && t.sub !== "big" ? "taken" : "", eq && t.sub !== "big");
  L("}");
  const big = t.sub === "big";
  L("return remove_trailing_zeros(decimal_significand, minus_k + kappa + 1);", big ? `${t.significand}e${t.exponent}` : "", big);
  L("");
  L("step3: // Step 3: small_divisor = 100", "", !big);
  L("decimal_significand *= 10;", !big ? `${t.sBeforeSmall * 10n}` : "", !big);
  L("dist = r - (deltai / 2) + (small_divisor / 2);", !big ? `${t.r} - ${t.deltai / 2n} + 50 = ${t.dist}` : "", !big);
  L("decimal_significand += dist / small_divisor;", !big ? `+ ${t.digit0}` : "", !big);
  L("if (dist % small_divisor == 0) { /* parity of floor(y), tie → even */ }", !big && t.divisible ? (t.yFix ? `fix: ${t.yFix} → ${t.significand}` : "no change") : "", !big && !!t.divisible);
  L("return {decimal_significand, minus_k + kappa};", !big ? `${t.significand}e${t.exponent}` : "", !big);
  const width = Math.min(46, Math.max(...lines.map((l) => l.code.length)));
  pre.innerHTML = lines.map((l) => {
    const text = l.comment ? `${l.code.padEnd(width)} // ${l.comment}` : l.code;
    const cls = l.code.startsWith("//") || l.code === "" ? "" : l.on ? "hl" : "dbc-off";
    return cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text);
  }).join("\n");
}

// ---------------------------------------------------------------------------
// 8. Powers of two.
const exactish = (d) => (Number.isInteger(d) && d < 2 ** 80 ? BigInt(d).toString() : show(d));
const POWERS = [64, -25, 0, 53];
function renderPowers() {
  const chips = $("#dbc-pow-chips");
  if (!chips.childElementCount) {
    chips.innerHTML = POWERS.map((p) => `<button type="button" data-pow="${p}" aria-pressed="false">2^${p}</button>`).join("");
    for (const b of $$("button", chips)) b.addEventListener("click", () => { state.pow = +b.dataset.pow; renderPowers(); });
  }
  for (const b of $$("button", chips)) b.setAttribute("aria-pressed", String(+b.dataset.pow === state.pow));
  const v = 2 ** state.pow;
  const s = M.shorterState(v);
  const host = $("#dbc-pow");
  const small = narrow(host);
  const W = vbW(host);
  const H = 150;
  const span = 16;
  const scale = (W - 30) / span;
  const cx = W / 2;
  const yl = 74;
  const px = (q) => cx + M.qToNumber(M.qSub(q, s.y)) * scale;
  const fs = small ? 10 : 11;
  let body = `<defs><pattern id="dbc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--blue)" stroke-width="1.5" opacity=".5"/></pattern></defs>`;
  body += `<line x1="10" y1="${yl}" x2="${W - 10}" y2="${yl}" stroke="var(--ink)"/>`;
  body += `<rect x="${px(s.ghostX)}" y="${yl - 14}" width="${px(s.x) - px(s.ghostX)}" height="28" fill="url(#dbc-hatch)"/>`;
  body += `<rect x="${px(s.x)}" y="${yl - 14}" width="${px(s.z) - px(s.x)}" height="28" fill="var(--blue)" opacity=".2"/>`;
  const firstInt = M.qFloor(s.y) - 8n;
  for (let i = 0n; i <= 17n; i++) {
    const m = firstInt + i;
    const x = px(M.Q(m));
    if (x < 10 || x > W - 10) continue;
    const major = m % 10n === 0n;
    body += `<line x1="${x}" y1="${yl - (major ? 22 : 9)}" x2="${x}" y2="${yl + (major ? 22 : 9)}" stroke="var(--red)" stroke-width="${major ? 2.5 : 1}" opacity="${major ? 1 : 0.5}"/>`;
    if (major || !small) {
      const txt = major ? `…${(m % 1000n).toString().padStart(3, "0")}` : (m % 10n).toString();
      body += `<text x="${x}" y="${yl + (major ? -28 : 24)}" text-anchor="middle" font-size="${fs}" class="dbc-t ${major ? "" : "dbc-muted"}">${txt}</text>`;
    }
  }
  body += `<circle cx="${px(s.y)}" cy="${yl}" r="5" fill="var(--blue)"/><text x="${px(s.y)}" y="${yl + 42}" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-blue">y</text>`;
  body += `<circle cx="${px(s.x)}" cy="${yl}" r="4" fill="var(--blue)"/><circle cx="${px(s.z)}" cy="${yl}" r="4" fill="var(--blue)"/>`;
  body += `<text x="${px(s.x)}" y="${yl + 42}" text-anchor="end" font-size="${fs}" class="dbc-t dbc-blue">x</text><text x="${px(s.z)}" y="${yl + 42}" text-anchor="start" font-size="${fs}" class="dbc-t dbc-blue">z</text>`;
  const out = s.trace;
  const outX = px(M.Q(out.significand * M.pow10(out.exponent + s.k)));
  body += `<path d="M ${outX} ${yl + 26} l -6 10 h 12 z" fill="var(--red)"/><text x="${outX}" y="${yl + 60}" text-anchor="middle" font-size="${fs}" class="dbc-t" fill="var(--red)" font-weight="600">output</text>`;
  if (s.ghostCandidate) {
    const gx = px(M.Q(s.ghostCandidate.scaled));
    body += `<text x="${gx}" y="${yl - 46}" text-anchor="middle" font-size="${fs}" class="dbc-t dbc-muted">✗ symmetric pick</text>`;
  }
  svg(host, W, H, body, `Lopsided window of 2^${state.pow} at scale 10^${s.k}.`);
  const tens = s.tens.count;
  $("#dbc-pow-readout").innerHTML = `
    2<sup>${state.pow}</sup> = ${esc(show(v))} · k = ${s.k}<br>
    x = ${M.qFixed(s.x, 3)} · y = ${M.qFixed(s.y, 3)} · z = ${M.qFixed(s.z, 3)} <span class="dbc-muted">(width ${M.qFixed(M.qSub(s.z, s.x), 3)})</span><br>
    ${tens > 0n ? `A multiple of 10 is inside: ${s.tens.last * 10n} → strip zeros → <strong>${esc(out.text)}</strong>.` : `No multiple of 10 inside. Round y up to the integer ${out.roundUpY}${out.significand < out.roundUpY ? `. Here y ends in exactly .5 (possible only for e = −77), a tie, so round to even: ${out.significand}` : out.significand > out.roundUpY ? `, which is below x, so add 1: ${out.significand}` : ""} → <strong>${esc(out.text)}</strong>.`}
    ${s.ghostCandidate ? `<br>A symmetric window would reach down to ${M.qFixed(s.ghostX, 3)} and contain ${s.ghostCandidate.scaled}, i.e. <strong>${esc(s.ghostCandidate.text)}</strong>. That reads back as ${esc(exactish(s.ghostCandidate.readsBackAs))}${s.ghostCandidate.readsBackAs === nextDown(v) ? ", the next double down" : ", a different double"}, not 2<sup>${state.pow}</sup>.` : ""}`;
}

// ---------------------------------------------------------------------------
function renderAll() {
  syncControls();
  renderRecap();
  renderRuler();
  renderFold();
  renderClock();
  renderCode();
}

function readURL() {
  const p = new URLSearchParams(location.search);
  if (p.has("x")) {
    const v = Math.abs(M.parseInput(p.get("x")));
    if (Number.isFinite(v) && v !== 0) state.value = v;
  }
  if (p.has("dk")) state.dk = Math.max(-2, Math.min(2, parseInt(p.get("dk"), 10) || 0));
  if (p.has("t")) state.fold = Math.max(0, Math.min(1, (+p.get("t") || 0) / 100));
  if (p.has("pow")) {
    const pw = parseInt(p.get("pow"), 10);
    if (Number.isFinite(pw) && pw >= -1022 && pw <= 1023) state.pow = pw;
  }
  return { walk: parseInt(p.get("walk") || "0", 10) || 0, rand: parseInt(p.get("rand") || "0", 10) || 0 };
}

function init() {
  const { walk: walkSteps, rand } = readURL();
  buildControls();
  $$("[data-dk]").forEach((b) => b.addEventListener("click", () => {
    const d = +b.dataset.dk;
    state.dk = d === 0 ? 0 : Math.max(-2, Math.min(2, state.dk + d));
    writeURL();
    renderRuler();
  }));
  $("#dbc-fold-play").addEventListener("click", playFold);
  $("#dbc-fold-range").addEventListener("input", (e) => {
    if (foldAnim) { cancelAnimationFrame(foldAnim); foldAnim = null; }
    state.fold = +e.target.value / 100;
    renderFold();
  });
  $("#dbc-next").addEventListener("click", () => walk(1));
  $("#dbc-prev").addEventListener("click", () => walk(-1));
  $("#dbc-clear").addEventListener("click", () => { state.trail = []; state.walk = []; renderClock(); });
  $$("[data-rand]").forEach((b) => b.addEventListener("click", () => sample(+b.dataset.rand)));
  $("#dbc-rand-reset").addEventListener("click", () => {
    state.rand = { total: 0, hits: 0, bins: Array.from({ length: 9 }, () => ({ n: 0, hits: 0 })), last: null };
    renderHist();
  });
  // Deep-linked walk (for screenshots): take |walk| steps without animation.
  for (let i = 0; i < Math.min(40, Math.abs(walkSteps)); i++) {
    const before = M.clockState(state.value);
    const v = walkSteps > 0 ? nextUp(state.value) : nextDown(state.value);
    if (!Number.isFinite(v) || v <= 0) break;
    if (!before.shorter) state.trail.unshift(before);
    if (!state.walk.length) state.walk = [walkRow(state.value)];
    state.walk.push(walkRow(v));
    state.value = v;
  }
  if (rand > 0) {
    rng = M.xorshift64(0x5eedn);
    sample(Math.min(20000, rand));
  } else renderHist();
  renderGallery();
  renderPowers();
  renderAll();
  // Auto-fold once when the fold figure scrolls into view.
  const foldHost = $("#dbc-fold");
  if ("IntersectionObserver" in window && state.fold === 0 && !new URLSearchParams(location.search).has("t")) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        if (state.fold === 0) setTimeout(playFold, 400);
      }
    }, { threshold: 0.6 });
    io.observe(foldHost);
  }
  let lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - lastW) < 40) return;
    lastW = window.innerWidth;
    renderAll();
    renderHist();
    renderGallery();
    renderPowers();
  });
}

init();
