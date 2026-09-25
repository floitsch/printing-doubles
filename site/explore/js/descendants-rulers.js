// Copyright (C) 2026 Toit contributors.
//
// DOM and interaction for explore/descendants-rulers.html ("Binade meets decade").
// All numbers come from descendants-rulers-model.js (exact BigInt decisions).

import * as M from "./descendants-rulers-model.js";
import { exactDecimal } from "../../js/oracle.js";
import { nextDown } from "../../js/float.js";

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", n: "ⁿ", s: "ˢ", "+": "⁺" };
const sup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const DBL_MAX = 1.7976931348623157e308;

function fmtBig(x) {
  const t = x.toString();
  if (t.length <= 24) return t;
  return `${t.slice(0, 9)}…${t.slice(-6)} (${M.bitLength(x)} bits)`;
}
const fmtV = (v) => String(v);
const pct = (a, n) => (n ? (100 * a / n) : 0);
function fmtPct(p) { return p === 0 ? "0%" : p < 0.1 ? `${p.toFixed(3)}%` : `${p.toFixed(1)}%`; }
function svgEl(width, height, body, label) {
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}">${body}</svg>`;
}
const widthOf = (el, fallback = 760) => Math.max(300, Math.round(el.clientWidth || fallback));

// ---------------------------------------------------------------- state & URL

const params = new URLSearchParams(location.search);
const state = {
  v: M.parseInput(params.get("v") ?? "") ?? 700,
  est: M.ESTIMATORS[params.get("est")] ? params.get("est") : "bits",
  zoom: ["1.5", "4", "12"].includes(params.get("zoom")) ? Number(params.get("zoom")) : 4,
  race: M.parseInput(params.get("race") ?? "") ?? 5e-324,
  ledger: M.parseInput(params.get("ledger") ?? "") ?? 0.1,
  step: Math.max(0, parseInt(params.get("step") ?? "0", 10) || 0),
  lo: null,
};

function syncURL() {
  const p = new URLSearchParams();
  p.set("v", fmtV(state.v));
  p.set("est", state.est);
  if (state.zoom !== 4) p.set("zoom", String(state.zoom));
  if (state.race !== 5e-324) p.set("race", fmtV(state.race));
  if (state.ledger !== 0.1) p.set("ledger", fmtV(state.ledger));
  if (state.step) p.set("step", String(state.step));
  history.replaceState(null, "", `?${p}${location.hash}`);
}

function chips(container, presets, current, onPick) {
  container.innerHTML = presets.map(([label, v]) =>
    `<button type="button" data-v="${v}" aria-pressed="${v === current}">${esc(label)}</button>`).join("");
  container.onclick = (ev) => {
    const b = ev.target.closest("button[data-v]");
    if (b) onPick(Number(b.dataset.v));
  };
}
function pressChips(container, current) {
  for (const b of container.querySelectorAll("button[data-v]")) b.setAttribute("aria-pressed", String(Number(b.dataset.v) === current));
}

// ---------------------------------------------------------------- 1. race

const RACE_PRESETS = [["0.3", 0.3], ["1e23", 1e23], ["1e100", 1e100], ["DBL_MAX", DBL_MAX], ["1e-100", 1e-100], ["5e-324", 5e-324]];
let raceAnim = 0;
let raceSamples = null;

function renderRace(animate) {
  const v = state.race;
  const it = M.iterativeScale(v);
  const bd = M.burgerDybvig(v);
  pressChips($("dr-race-chips"), v);
  const tread = $("dr-lane-tread");
  tread.innerHTML = `<h3>Treadmill · one decade per step</h3>
    <div><span class="dr-big" id="dr-tread-count">0</span> steps</div>
    <div class="dr-bar" aria-hidden="true"><i id="dr-tread-bar"></i></div>
    <p>${it.mults} bignum multiplications by 10${it.k < 0 ? " (r, m⁺ and m⁻ each step)" : " (s each step)"}, plus a comparison per step. The integers grow to ${it.bits} bits.</p>`;
  const lift = $("dr-lane-lift");
  const scaleText = bd.est >= 0
    ? `s × 10${sup(bd.est)}: <strong>1</strong> multiplication`
    : `r, m⁺, m⁻ × 10${sup(-bd.est)}: <strong>3</strong> multiplications`;
  lift.className = "dr-lane dr-lift";
  lift.innerHTML = `<h3>Elevator · estimate, then one comparison</h3>
    <div><span class="dr-big">${bd.tableMults}</span> table multiplication${bd.tableMults > 1 ? "s" : ""}</div>
    <div class="dr-bar" aria-hidden="true"><i style="width:${Math.max(0.6, 100 * bd.tableMults / 969)}%"></i></div>
    <p>Estimate from the exponent bits: k = ${bd.est}. ${scaleText}, one comparison (the guess was ${bd.low ? "one low; fixing it costs nothing" : "right"}). Same result: ${fmtV(v)} starts in decade 10${sup(bd.E)}.</p>`;
  const target = it.steps;
  const bar = $("dr-tread-bar");
  const count = $("dr-tread-count");
  cancelAnimationFrame(raceAnim);
  const setCount = (n) => { count.textContent = String(n); bar.style.width = `${100 * n / 330}%`; };
  if (!animate || reduceMotion || target === 0) { setCount(target); }
  else {
    const dur = Math.min(1800, 300 + target * 5);
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      setCount(Math.round(target * p));
      if (p < 1) raceAnim = requestAnimationFrame(tick);
    };
    raceAnim = requestAnimationFrame(tick);
  }
  renderRaceChart();
}

function renderRaceChart() {
  if (!raceSamples) {
    raceSamples = [];
    for (let n = -323; n <= 308; n += (n === 305 ? 3 : 4)) {
      const v = Number(`1e${n}`);
      raceSamples.push({ n, tread: M.iterativeScale(v).mults, lift: M.burgerDybvig(v).tableMults });
    }
  }
  const box = $("dr-race-chart");
  const W = widthOf(box), H = 230;
  const L = 48, R = 14, T = 14, B = 38;
  const xs = (n) => L + (n + 324) / (632) * (W - L - R);
  const ys = (y) => T + (1 - y / 1000) * (H - T - B);
  let g = "";
  for (const y of [0, 250, 500, 750, 1000]) {
    g += `<line x1="${L}" x2="${W - R}" y1="${ys(y)}" y2="${ys(y)}" stroke="var(--line)" stroke-width="1"/>`;
    g += `<text x="${L - 6}" y="${ys(y) + 4}" text-anchor="end" font-size="11" class="dr-muted">${y}</text>`;
  }
  for (const n of W < 600 ? [-300, 0, 300] : [-300, -200, -100, 0, 100, 200, 300]) {
    g += `<text x="${xs(n)}" y="${H - B + 16}" text-anchor="middle" font-size="11" class="dr-muted">10${sup(n)}</text>`;
  }
  g += `<text x="${W - R}" y="${H - 4}" text-anchor="end" font-size="11" class="dr-muted">decimal exponent of v →</text>`;
  const path = (key) => raceSamples.map((s, i) => `${i ? "L" : "M"}${xs(s.n).toFixed(1)},${ys(s[key]).toFixed(1)}`).join("");
  g += `<path d="${path("tread")}" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
  g += `<path d="${path("lift")}" fill="none" stroke="var(--red)" stroke-width="2"/>`;
  g += `<text x="${xs(-250)}" y="${ys(820)}" font-size="12">treadmill: 3 per decade below 1</text>`;
  g += `<text x="${xs(300)}" y="${ys(330) - 14}" font-size="12" text-anchor="end">1 per decade above 1</text>`;
  g += `<text x="${xs(-318)}" y="${ys(0) - 8}" font-size="12" fill="var(--red)" style="fill:var(--red)">elevator: 1–3</text>`;
  // current number
  const E = M.exponentOfV(state.race);
  const cur = { tread: M.iterativeScale(state.race).mults, lift: M.burgerDybvig(state.race).tableMults };
  g += `<line x1="${xs(E)}" x2="${xs(E)}" y1="${T}" y2="${H - B}" stroke="var(--blue)" stroke-dasharray="3 3"/>`;
  g += `<circle cx="${xs(E)}" cy="${ys(cur.tread)}" r="5" fill="var(--ink)" stroke="var(--paper)" stroke-width="2"/>`;
  g += `<circle cx="${xs(E)}" cy="${ys(cur.lift)}" r="5" fill="var(--red)" stroke="var(--paper)" stroke-width="2"/>`;
  g += `<g id="dr-race-hover" visibility="hidden"><line id="dr-race-hl" y1="${T}" y2="${H - B}" stroke="var(--muted)"/></g>`;
  g += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="dr-race-hit"/>`;
  box.innerHTML = svgEl(W, H, g, "Line chart: bignum multiplications by 10 in Dragon4's scaling loop versus the decimal exponent. V-shaped for the treadmill, flat at 1 to 3 for the estimate.") +
    `<p class="dr-chart-read" id="dr-race-read">${fmtV(state.race)}: treadmill ${cur.tread}, elevator ${cur.lift}.</p>`;
  const hit = $("dr-race-hit");
  const show = (ev) => {
    const rect = box.querySelector("svg").getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (W / rect.width);
    let best = raceSamples[0];
    for (const s of raceSamples) if (Math.abs(xs(s.n) - x) < Math.abs(xs(best.n) - x)) best = s;
    $("dr-race-hover").setAttribute("visibility", "visible");
    $("dr-race-hl").setAttribute("x1", xs(best.n)); $("dr-race-hl").setAttribute("x2", xs(best.n));
    $("dr-race-read").textContent = `1e${best.n}: treadmill ${best.tread} multiplications by 10, elevator ${best.lift} table multiplication${best.lift > 1 ? "s" : ""}.`;
  };
  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", () => {
    $("dr-race-hover").setAttribute("visibility", "hidden");
    $("dr-race-read").textContent = `${fmtV(state.race)}: treadmill ${cur.tread}, elevator ${cur.lift}.`;
  });
}

// ---------------------------------------------------------------- 2. rulers

const V_PRESETS = [["700", 700], ["1000", 1000], ["987.654", 987.654], ["1e23", 1e23], ["0.1", 0.1], ["1.5", 1.5], ["5e-324", 5e-324], ["DBL_MAX", DBL_MAX]];
const LOG_MIN = -324.2, LOG_MAX = 308.5;
let dragging = false;

function setV(v, { recenter = true, from = "" } = {}) {
  if (!(v > 0) || !Number.isFinite(v)) return;
  state.v = v;
  const L = Math.log10(v);
  const W = state.zoom;
  if (recenter || state.lo === null || L < state.lo + W * 0.04 || L > state.lo + W * 0.96) state.lo = L - W / 2;
  state.lo = Math.min(Math.max(state.lo, LOG_MIN), LOG_MAX - W);
  if (from !== "input") $("dr-v-input").value = fmtV(v);
  if (from !== "slider") $("dr-slider").value = String(L);
  $("dr-v-error").textContent = "";
  renderRulers();
  renderTangent();
  renderRepair();
  syncURL();
}

function verdictOf(v, est) {
  const E = M.ESTIMATORS[est].E(v);
  const T = M.ESTIMATORS[est].truth(v);
  return { E, T, diff: E - T };
}

function renderRulers() {
  const v = state.v;
  const d = M.decompose(v);
  const W = state.zoom;
  const lo = state.lo, hi = lo + W;
  const box = $("dr-ruler");
  const PW = widthOf(box), PH = 250;
  const pad = 10;
  const X = (L) => pad + (L - lo) / W * (PW - 2 * pad);
  const yB0 = 34, yB1 = 84, yD = 162;
  let g = `<defs><pattern id="dr-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--dr-red-soft)"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--red)" stroke-width="3"/></pattern>
    <clipPath id="dr-clip"><rect x="${pad}" y="0" width="${PW - 2 * pad}" height="${PH}"/></clipPath></defs>`;
  g += `<text x="${pad}" y="20" font-size="11" class="dr-muted">BINARY RULER · binades 2${sup("s")} (each 0.301 decades)</text>`;
  g += `<text x="${pad}" y="${yD + 70}" font-size="11" class="dr-muted">DECIMAL RULER · decades 10${sup("n")}</text>`;
  g += `<g clip-path="url(#dr-clip)">`;
  // binade cells
  const sLo = Math.max(-1074, Math.floor(lo / M.LOG10_2) - 1), sHi = Math.min(1023, Math.ceil(hi / M.LOG10_2) + 1);
  const cellW = M.LOG10_2 / W * (PW - 2 * pad);
  const labelEvery = Math.max(1, Math.ceil(46 / cellW));
  for (let s = sLo; s <= sHi; s++) {
    const a = X(s * M.LOG10_2), b = X((s + 1) * M.LOG10_2);
    const current = s === d.s;
    const fill = current ? "var(--dr-blue-mid)" : (s & 1) ? "var(--dr-blue-soft)" : "var(--paper)";
    g += `<rect x="${a}" y="${yB0}" width="${b - a}" height="${yB1 - yB0}" fill="${fill}" stroke="var(--blue)" stroke-width="${current ? 2 : 0.6}"/>`;
    if (current || (s % labelEvery === 0 && (labelEvery === 1 || Math.abs(s - d.s) >= labelEvery))) g += `<text x="${(a + b) / 2}" y="${yB1 - 8}" text-anchor="middle" font-size="12" ${current ? 'font-weight="600"' : ""}>2${sup(s)}</text>`;
  }
  // miss zones
  if (state.est !== "log") {
    for (const [a, b] of M.missZones(state.est, lo, hi)) {
      g += `<rect x="${X(a)}" y="${yB0}" width="${Math.max(1.5, X(b) - X(a))}" height="18" fill="url(#dr-hatch)" stroke="var(--red)" stroke-width="0.8"/>`;
    }
  }
  // projection of the current binade
  const pa = X(d.s * M.LOG10_2), pb = X((d.s + 1) * M.LOG10_2);
  g += `<polygon points="${pa},${yB1} ${pb},${yB1} ${pb},${yD} ${pa},${yD}" fill="var(--blue)" opacity="0.10"/>`;
  g += `<line x1="${pa}" y1="${yB1}" x2="${pa}" y2="${yD}" stroke="var(--blue)" stroke-dasharray="3 3"/><line x1="${pb}" y1="${yB1}" x2="${pb}" y2="${yD}" stroke="var(--blue)" stroke-dasharray="3 3"/>`;
  // decimal ruler
  const { E: Eest, T: Etrue } = verdictOf(v, state.est);
  const band = (n, y, h, fill) => `<rect x="${X(n)}" y="${y}" width="${X(n + 1) - X(n)}" height="${h}" fill="${fill}"/>`;
  g += band(Etrue, yD, 22, "var(--dr-red-soft)");
  g += `<line x1="${pad}" x2="${PW - pad}" y1="${yD}" y2="${yD}" stroke="var(--ink)"/>`;
  const nLo = Math.floor(lo) - 1, nHi = Math.ceil(hi) + 1;
  const minorOk = W <= 4;
  for (let n = nLo; n <= nHi; n++) {
    if (n < -325 || n > 309) continue;
    g += `<line x1="${X(n)}" x2="${X(n)}" y1="${yD - 10}" y2="${yD + 14}" stroke="var(--red)" stroke-width="2"/>`;
    const every = W > 8 ? 2 : 1;
    if (n % every === 0 && X(n) > pad + 14 && X(n) < PW - pad - 14) g += `<text x="${X(n)}" y="${yD + 32}" text-anchor="middle" font-size="12" fill="var(--red)" style="fill:var(--red)">10${sup(n)}</text>`;
    if (minorOk) for (let m = 2; m <= 9; m++) {
      const x = X(n + Math.log10(m));
      g += `<line x1="${x}" x2="${x}" y1="${yD}" y2="${yD + 6}" stroke="var(--red)" stroke-width="0.8" opacity="0.6"/>`;
    }
  }
  // estimate bracket
  const ex0 = X(Eest), ex1 = X(Eest + 1);
  const yE = yD + 44;
  g += `<path d="M${ex0},${yE - 6} V${yE} H${ex1} V${yE - 6}" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
  g += `<text x="${Math.min(Math.max((ex0 + ex1) / 2, pad + 60), PW - pad - 60)}" y="${yE + 14}" text-anchor="middle" font-size="12">guess Ê = ${Eest}${Eest === Etrue ? " ✓" : ` · truth ${Etrue}`}</text>`;
  g += `</g>`;
  // marker
  const xv = X(Math.log10(v));
  g += `<g class="dr-handle" id="dr-handle" tabindex="0" role="slider" aria-label="v on a log scale" aria-valuemin="${LOG_MIN}" aria-valuemax="${LOG_MAX}" aria-valuenow="${Math.log10(v).toFixed(4)}" aria-valuetext="v = ${fmtV(v)}">
    <line x1="${xv}" x2="${xv}" y1="${yB0 - 6}" y2="${yD + 16}" stroke="var(--blue)" stroke-width="2.5"/>
    <circle cx="${xv}" cy="${(yB1 + yD) / 2}" r="11" fill="var(--blue)" stroke="var(--paper)" stroke-width="2"/>
    <text x="${xv}" y="${(yB1 + yD) / 2 + 4}" text-anchor="middle" font-size="12" fill="var(--paper)" style="fill:var(--paper)">v</text></g>`;
  box.innerHTML = svgEl(PW, PH, g, `Binary ruler and decimal ruler around v = ${fmtV(v)}: binade 2^${d.s}, estimate ${Eest}, true exponent ${Etrue}.`);
  $("dr-handle").addEventListener("keydown", onHandleKey);
  renderMinimap();
  renderLens();
  renderRulerReadout();
}

function onHandleKey(ev) {
  const step = ev.shiftKey ? state.zoom / 10 : state.zoom / 200;
  const L = Math.log10(state.v);
  if (ev.key === "ArrowRight" || ev.key === "ArrowUp") { ev.preventDefault(); setV(snapFromLog(L + step), { recenter: false }); }
  else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") { ev.preventDefault(); setV(snapFromLog(L - step), { recenter: false }); }
  else if (ev.key === "PageUp") { ev.preventDefault(); nudgeBinade(1); }
  else if (ev.key === "PageDown") { ev.preventDefault(); nudgeBinade(-1); }
  else return;
  $("dr-handle")?.focus();
}

function snapFromLog(L) {
  L = Math.min(Math.max(L, Math.log10(5e-324)), Math.log10(DBL_MAX));
  const n = Math.round(L);
  if (Math.abs(L - n) < state.zoom * 0.004 && n >= -323 && n <= 308) return Number(`1e${n}`);
  let v = 10 ** L;
  if (!Number.isFinite(v)) v = DBL_MAX;
  if (v <= 0) v = 5e-324;
  // Round to 6 significant digits so the input box stays readable.
  const r = Number(v.toPrecision(6));
  return r > 0 && Number.isFinite(r) ? r : v;
}

function nudgeBinade(dir) {
  const d = M.decompose(state.v);
  const s = Math.min(1023, Math.max(-1074, d.s + dir));
  // Same relative position (significand) in the neighbouring binade.
  const x = state.v / 2 ** d.s;
  let v = x * 2 ** s;
  if (!(v > 0) || !Number.isFinite(v)) v = 2 ** s;
  setV(v, { recenter: false });
}

function installDrag() {
  const box = $("dr-ruler");
  const toV = (ev) => {
    const svg = box.querySelector("svg");
    const rect = svg.getBoundingClientRect();
    const PW = svg.viewBox.baseVal.width;
    const x = (ev.clientX - rect.left) * (PW / rect.width);
    const L = state.lo + (x - 10) / (PW - 20) * state.zoom;
    return snapFromLog(L);
  };
  box.addEventListener("pointerdown", (ev) => {
    if (!box.querySelector("svg")) return;
    dragging = true;
    box.setPointerCapture?.(ev.pointerId);
    setV(toV(ev), { recenter: false });
  });
  box.addEventListener("pointermove", (ev) => { if (dragging) setV(toV(ev), { recenter: false }); });
  const end = () => { dragging = false; };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
}

function renderMinimap() {
  const box = $("dr-minimap");
  const W = widthOf(box), H = 26;
  const X = (L) => 4 + (L - LOG_MIN) / (LOG_MAX - LOG_MIN) * (W - 8);
  let g = `<rect x="4" y="8" width="${W - 8}" height="8" fill="var(--paper-deep)"/>`;
  for (const n of [-300, -200, -100, 0, 100, 200, 300]) g += `<line x1="${X(n)}" x2="${X(n)}" y1="6" y2="18" stroke="var(--muted)"/>`;
  g += `<text x="4" y="26" font-size="9" class="dr-muted">10⁻³²⁴</text><text x="${W - 4}" y="26" font-size="9" text-anchor="end" class="dr-muted">10³⁰⁸</text>`;
  g += `<rect x="${X(state.lo)}" y="3" width="${Math.max(3, X(state.lo + state.zoom) - X(state.lo))}" height="18" fill="none" stroke="var(--blue)" stroke-width="2"/>`;
  box.innerHTML = svgEl(W, H, g, "Overview of all doubles from 10^-324 to 10^308; the blue frame is the visible window. Click to jump.");
  box.onclick = (ev) => {
    const rect = box.querySelector("svg").getBoundingClientRect();
    const L = LOG_MIN + ((ev.clientX - rect.left) * (W / rect.width) - 4) / (W - 8) * (LOG_MAX - LOG_MIN);
    setV(snapFromLog(L));
  };
}

/** (10^n − v) / ulp as a Number, exactly rounded enough for drawing. */
function ulpOffset(v, n) {
  const d = M.decompose(v);
  // (10^n − f·2^e) / 2^e = 10^n·2^−e − f
  let num, den;
  if (n >= 0) { num = M.pow10(n); den = 1n; } else { num = 1n; den = M.pow10(-n); }
  if (d.e >= 0) den <<= BigInt(d.e); else num <<= BigInt(-d.e);
  const diff = num - d.f * den;
  return Number((diff << 20n) / den) / 2 ** 20;
}

function renderLens() {
  const v = state.v;
  const d = M.decompose(v);
  const box = $("dr-lens");
  const W = widthOf(box, 360), H = 118;
  const span = 2.6;
  const X = (u) => W / 2 + u / span * (W / 2 - 18);
  const y = 64;
  const lowGap = d.asymmetric ? 0.5 : 1;
  let g = `<text x="10" y="16" font-size="11" class="dr-muted">LENS · 1 unit = 1 ulp of v (gap above)</text>`;
  g += `<line x1="8" x2="${W - 8}" y1="${y}" y2="${y}" stroke="var(--ink)"/>`;
  // interval
  const lo = X(-lowGap / 2), hi = X(0.5);
  g += `<rect x="${lo}" y="${y - 10}" width="${hi - lo}" height="20" fill="var(--dr-blue-soft)" stroke="var(--blue)" stroke-width="1" ${d.even ? "" : 'stroke-dasharray="3 2"'}/>`;
  g += `<text x="${hi}" y="${y - 16}" text-anchor="middle" font-size="11">high${d.even ? "" : " (excl.)"}</text>`;
  g += `<text x="${lo}" y="${y - 16}" text-anchor="middle" font-size="11">low</text>`;
  const tick = (u, label, strong) => `<line x1="${X(u)}" x2="${X(u)}" y1="${y - 7}" y2="${y + 7}" stroke="var(--blue)" stroke-width="${strong ? 3 : 1.5}"/><text x="${X(u)}" y="${y + 22}" text-anchor="middle" font-size="11">${label}</text>`;
  g += tick(-lowGap, "v⁻") + tick(0, "v", true) + tick(1, "v⁺");
  // nearby powers of ten
  const Ev = M.exponentOfV(v);
  const near = [];
  for (const n of [Ev, Ev + 1]) {
    if (n < -324 || n > 309) continue;
    const u = ulpOffset(v, n);
    if (Math.abs(u) <= span) near.push([n, u]);
    else near.push([n, u, true]);
  }
  let note = "";
  for (const [n, u, far] of near) {
    if (!far) {
      g += `<line x1="${X(u)}" x2="${X(u)}" y1="${y - 26}" y2="${y + 30}" stroke="var(--red)" stroke-width="2"/>`;
      g += `<text x="${X(u)}" y="${y + 44}" text-anchor="middle" font-size="12" fill="var(--red)" style="fill:var(--red)">10${sup(n)}</text>`;
    } else {
      note += `10${sup(n)} is ${Math.abs(u) >= 1e6 ? Math.abs(u).toExponential(2) : Math.abs(u).toFixed(1)} ulps ${u < 0 ? "below" : "above"}. `;
    }
  }
  box.innerHTML = svgEl(W, H, g, `Lens around v: rounding interval and nearby powers of ten. ${note}`) +
    `<p class="dr-small-read dr-lens-note">${note || "A power of ten is inside the lens."}</p>`;
}

function renderRulerReadout() {
  const v = state.v;
  const d = M.decompose(v);
  const est = state.est;
  const { E, T, diff } = verdictOf(v, est);
  const a = d.s * M.LOG10_2, b = (d.s + 1) * M.LOG10_2;
  // Exact candidates: the decades of the smallest and the largest double in this binade.
  const exactCands = [...new Set([M.exponentOfV(2 ** d.s), M.exponentOfV(nextDown(2 ** (d.s + 1)))])].sort((x, y) => x - y);
  let formula;
  if (est === "bits") {
    const r = M.bdBitsEstimate(v);
    formula = `k = ⌈${d.s} × 0.30103 − 10⁻¹⁰⌉ = ${r.k} → Ê = ${r.E}`;
  } else if (est === "log") {
    const r = M.bdLogEstimate(v);
    formula = `k = ⌈log₁₀ v − 10⁻¹⁰⌉ = ⌈${r.log} − 10⁻¹⁰⌉ = ${r.k} → Ê = ${r.E}`;
  } else {
    const r = M.gayEstimate(v);
    formula = `ds = (${r.x.toPrecision(8)} − 1.5)·0.28953 + 0.17609 + ${r.i}·0.30103 = ${r.ds.toFixed(5)} → Ê = ⌊ds⌋ = ${r.E}`;
  }
  const truthText = est === "gay"
    ? `⌊log₁₀ v⌋ = ${T} (dtoa's target, exact)`
    : `${T}, decided by high = v + ½ulp, which is ${d.even ? "included" : "excluded"} (exact)`;
  const verdict = diff === 0
    ? `<span class="dr-verdict-ok">right</span>`
    : `<span class="dr-verdict-miss">one ${diff < 0 ? "low" : "high"}</span>: ${diff < 0 ? "B&D's gate r + m⁺ ≥ s adds one, for free" : (M.gayRepair(v).check === "float" ? `the double compare v < 1e${E} lowers it` : "the bignum check b < S lowers it")} (Section 4)`;
  $("dr-readout").innerHTML = `
    <span class="dr-row"><span class="dr-key">v</span> = ${fmtV(v)} = ${d.f} × 2${sup(d.e)}</span>
    <span class="dr-row"><span class="dr-key">binade</span> s = e + len(f) − 1 = ${d.e} + ${d.len} − 1 = <strong>${d.s}</strong>: 2${sup(d.s)} ≤ v &lt; 2${sup(d.s + 1)}, log₁₀ ∈ [${a.toFixed(3)}, ${b.toFixed(3)})</span>
    <span class="dr-row"><span class="dr-key">candidates</span> ${exactCands.length > 1 ? `E ∈ {${exactCands.join(", ")}}: the binade holds 10${sup(exactCands[1])}` : `E = ${exactCands[0]} only: no power of ten inside this binade`}</span>
    <span class="dr-row"><span class="dr-key">${M.ESTIMATORS[est].short}</span> ${formula}</span>
    <span class="dr-row"><span class="dr-key">truth</span> E = ${truthText}</span>
    <span class="dr-row"><span class="dr-key">verdict</span> ${verdict}</span>`;
}

// ---------------------------------------------------------------- 3. tangent + binade 2^9

function renderTangent() {
  const box = $("dr-tangent");
  const W = widthOf(box, 380), H = 240;
  const L = 40, R = 12, T = 12, B = 30;
  const X = (x) => L + (x - 1) * (W - L - R);
  const Y = (y) => T + (1 - (y + 0.01) / 0.35) * (H - T - B);
  const tan = (x) => (x - 1.5) * M.GAY_SLOPE + M.GAY_INTERCEPT;
  let curve = "", gap = "";
  const pts = [];
  for (let i = 0; i <= 80; i++) { const x = 1 + i / 80; pts.push([x, Math.log10(x)]); }
  curve = pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("");
  gap = `M${X(1)},${Y(tan(1))} L${X(2)},${Y(tan(2))} ` + pts.slice().reverse().map(([x, y]) => `L${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("") + "Z";
  let g = "";
  for (const y of [0, 0.1, 0.2, 0.3]) g += `<line x1="${L}" x2="${W - R}" y1="${Y(y)}" y2="${Y(y)}" stroke="var(--line)"/><text x="${L - 5}" y="${Y(y) + 4}" font-size="10" text-anchor="end" class="dr-muted">${y.toFixed(1)}</text>`;
  for (const x of [1, 1.25, 1.5, 1.75, 2]) g += `<text x="${X(x)}" y="${H - 10}" font-size="10" text-anchor="middle" class="dr-muted">${x}</text>`;
  g += `<path d="${gap}" fill="var(--acid)" opacity="0.7"/>`;
  g += `<path d="${curve}" fill="none" stroke="var(--red)" stroke-width="2"/>`;
  g += `<line x1="${X(1)}" y1="${Y(tan(1))}" x2="${X(2)}" y2="${Y(tan(2))}" stroke="var(--ink)" stroke-width="2"/>`;
  g += `<circle cx="${X(1.5)}" cy="${Y(tan(1.5))}" r="3" fill="var(--ink)"/>`;
  g += `<text x="${X(1.03)}" y="${Y(0.3)}" font-size="11">tangent at 1.5</text>`;
  g += `<text x="${X(1.55)}" y="${Y(0.13)}" font-size="11" fill="var(--red)" style="fill:var(--red)">log₁₀ x</text>`;
  const r = M.gayEstimate(state.v);
  const x = r.x;
  g += `<line x1="${X(x)}" x2="${X(x)}" y1="${Y(Math.log10(x))}" y2="${Y(tan(x))}" stroke="var(--blue)" stroke-width="2"/>`;
  g += `<circle cx="${X(x)}" cy="${Y(tan(x))}" r="5" fill="var(--blue)" stroke="var(--paper)" stroke-width="2"/>`;
  box.innerHTML = svgEl(W, H, g, "log10 x and its tangent at 1.5 on [1,2]; the tangent is always above.") +
    `<p class="dr-small-read">v = ${fmtV(state.v)} → x = ${x.toPrecision(10)}, log₁₀ x = ${Math.log10(x).toFixed(5)}, tangent = ${tan(x).toFixed(5)}, overshoot ${(tan(x) - Math.log10(x)).toFixed(5)} decades.</p>`;
  renderBinade9();
}

function renderBinade9() {
  const box = $("dr-binade9");
  const W = widthOf(box, 380), H = 240;
  const L = 14, R = 14;
  const X = (v) => L + (v - 512) / 512 * (W - L - R);
  const bdZone = M.missZones("bits", Math.log10(512), Math.log10(1024)).map(([a, b]) => [10 ** a, 10 ** b]);
  const gayStart = M.gayThreshold(9, 3);
  let g = `<defs><pattern id="dr-hatch2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="var(--dr-red-soft)"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--red)" stroke-width="3"/></pattern></defs>`;
  g += `<text x="${L}" y="16" font-size="11" class="dr-muted">BINADE 2⁹ = [512, 1024), linear</text>`;
  const row = (y, label, zones, zoneLabel) => {
    let s = `<text x="${L}" y="${y - 8}" font-size="12">${label}</text>`;
    s += `<rect x="${X(512)}" y="${y}" width="${X(1024) - X(512)}" height="26" fill="var(--dr-blue-soft)" stroke="var(--blue)"/>`;
    for (const [a, b] of zones) s += `<rect x="${X(a)}" y="${y}" width="${Math.max(2, X(b) - X(a))}" height="26" fill="url(#dr-hatch2)" stroke="var(--red)"/>`;
    s += `<text x="${X(zones[0][0]) - 4}" y="${y + 42}" font-size="11" text-anchor="end" fill="var(--red)" style="fill:var(--red)">${zoneLabel}</text>`;
    return s;
  };
  g += row(52, "B&D bits: guess Ê = 2 everywhere", bdZone, `miss: [${Math.round(bdZone[0][0])}, 1024) → one low`);
  g += row(142, "Gay tangent: guess 2, then 3", [[gayStart, 1000]], `miss: [${gayStart.toFixed(2)}, 1000) → one high`);
  g += `<line x1="${X(1000)}" x2="${X(1000)}" y1="36" y2="${H - 24}" stroke="var(--red)" stroke-width="2"/>`;
  g += `<text x="${X(1000)}" y="${H - 10}" text-anchor="middle" font-size="12" fill="var(--red)" style="fill:var(--red)">10³</text>`;
  for (const t of [512, 768]) g += `<text x="${X(t)}" y="${H - 10}" text-anchor="middle" font-size="11" class="dr-muted">${t}</text>`;
  if (state.v >= 512 && state.v < 1024) {
    g += `<line x1="${X(state.v)}" x2="${X(state.v)}" y1="44" y2="${H - 24}" stroke="var(--blue)" stroke-width="2.5"/>`;
    g += `<text x="${X(state.v) - 4}" y="${H - 24}" text-anchor="end" font-size="11" fill="var(--blue)" style="fill:var(--blue)">v</text>`;
  }
  box.innerHTML = svgEl(W, H, g, `Binade 512 to 1024: Burger and Dybvig miss from 1000 to 1024 (one low); Gay misses from ${gayStart.toFixed(2)} to 1000 (one high).`) +
    `<p class="dr-small-read">Zone edges computed from the formulas: B&amp;D's starts where high reaches 1000; Gay's where ds reaches 3 (x·2⁹ = ${gayStart.toFixed(4)}).</p>`;
}

// ---------------------------------------------------------------- 4. repair

function renderRepair() {
  const v = state.v;
  pressChips($("dr-repair-chips"), v);
  const bd = M.burgerDybvig(v);
  const { r, s, mp, mm } = bd.init;
  const sc = bd.scaled;
  const rel = bd.init.even ? "≥" : ">";
  const scaleLine = bd.est >= 0 ? `s × 10${sup(bd.est)}` : `r, m⁺, m⁻ × 10${sup(-bd.est)}`;
  $("dr-repair-bd").innerHTML = `<h3>Burger &amp; Dybvig</h3>
    <dl>
      <dt>Table 1</dt><dd>r = ${fmtBig(r)}, s = ${fmtBig(s)}, m⁺ = ${fmtBig(mp)}, m⁻ = ${fmtBig(mm)}</dd>
      <dt>estimate</dt><dd>k = ${bd.est} (Ê = ${bd.est - 1}) from the bits</dd>
      <dt>scale</dt><dd>${scaleLine} (table lookup)</dd>
      <dt>gate</dt><dd>r + m⁺ = ${fmtBig(sc.r + sc.mp)} ${bd.low ? rel : (bd.init.even ? "<" : "≤")} s = ${fmtBig(sc.s)}</dd>
    </dl>
    <div class="dr-lanes2">
      <div class="${bd.low ? "dr-taken" : ""}"><b>guess one low</b>k = est + 1<br>generate(r, s, m⁺, m⁻)<br><span class="dr-x10 dr-skipped">×10</span> skipped</div>
      <div class="${bd.low ? "" : "dr-taken"}"><b>guess right</b>k = est<br>generate(<span class="dr-x10">10</span>r, s, <span class="dr-x10">10</span>m⁺, <span class="dr-x10">10</span>m⁻)<br>the loop's own ×10</div>
    </div>
    <div class="dr-out">0.${bd.digits} × 10${sup(bd.k)} = ${bd.digits[0]}${bd.digits.length > 1 ? "." + bd.digits.slice(1) : ""} × 10${sup(bd.k - 1)}</div>`;
  const g = M.gayDtoa(v);
  const rep = g.rep;
  const check = rep.check === "float"
    ? `0 ≤ k̂ ≤ 22, so compare in doubles: v &lt; 1e${rep.E}? ${rep.lowered ? "yes → k = " + (rep.E - 1) : "no → k = " + rep.E}`
    : `k̂ outside [0, 22]: set k_check. After building b and S (b/S = v/10${sup(rep.E)}): b &lt; S? ${rep.lowered ? `yes → k = ${rep.E - 1}, b ×10, mhi ×10` : "no → keep k"}`;
  const exitText = g.path === "small-int"
    ? "small-integer lane: digits from double arithmetic, no bignums"
    : `digit loop: ${g.loops} round${g.loops > 1 ? "s" : ""}, exit on the ${g.exit}`;
  $("dr-repair-gay").innerHTML = `<h3>Gay's dtoa</h3>
    <dl>
      <dt>estimate</dt><dd>ds = ${rep.ds.toFixed(5)} → k̂ = ${rep.E}</dd>
      <dt>repair</dt><dd>${check}</dd>
      <dt>then</dt><dd>${esc(exitText).replace("round_9_up", "<code>round_9_up</code> (a 9 carries into a new leading 1, k + 1)")}</dd>
    </dl>
    <div class="dr-out">"${g.digits}", decpt ${g.decpt} → ${g.digits[0]}${g.digits.length > 1 ? "." + g.digits.slice(1) : ""} × 10${sup(g.decpt - 1)}</div>`;
}

function render1e23() {
  const v = 1e23;
  const L = Math.log10(v);
  const rep = M.gayRepair(v);
  const bd = M.burgerDybvig(v);
  const g = M.gayDtoa(v);
  $("dr-1e23-text").innerHTML = `Type <code>1e23</code> and you get the double ${exactDecimal(v)}, just <em>below</em> 10²³. In this browser <code>Math.log10(1e23)</code> returns ${L}, and floor gives ${Math.floor(L)}. The exact answer is ⌊log₁₀ v⌋ = ${M.exponentOfV(v)}. Gay's tangent gives ds = ${rep.ds.toFixed(5)}, so k̂ = ${rep.E}. That is outside [0, 22], so the bignum check runs, finds b &lt; S and lowers k to ${rep.k}. The digit loop then produces a 9 whose remainder sits exactly on the upper boundary. The significand is even, so the boundary is allowed, and <code>round_9_up</code> carries: "${g.digits}", decpt ${g.decpt}. Burger &amp; Dybvig reach the same "1e23" by the other route: the bits guess k = ${bd.est}, the gate finds r + m⁺ = s exactly, and k becomes ${bd.k}. Either way, an exact comparison has the last word.`;
}

// ---------------------------------------------------------------- 5. sweep

let sweepCounts = null;
let sweepBusy = false;

function renderSweep() {
  const box = $("dr-sweep-chart");
  const c = sweepCounts;
  const n = c ? c.n : 0;
  const panels = ["bits", "log", "gay"].map((key) => {
    const W = 260, H = 170;
    const bars = [-1, 0, 1];
    const bw = (W - 30) / 3;
    const Y = (p) => 26 + (1 - p / 100) * (H - 60);
    let g = `<line x1="10" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink)"/>`;
    bars.forEach((b, i) => {
      const cnt = c ? (c[key][b] || 0) : 0;
      const p = pct(cnt, n);
      const x = 15 + i * bw + 6;
      const h = Y(0) - Y(p);
      const fill = b === 0 ? "var(--blue)" : "var(--red)";
      if (n && cnt > 0) {
        g += `<path d="M${x},${Y(0)} V${Y(0) - Math.max(0, h - 4)} q0,-4 4,-4 H${x + bw - 16} q4,0 4,4 V${Y(0)} Z" fill="${fill}"/>`;
        if (h < 4 && cnt > 0) g += `<rect x="${x}" y="${Y(0) - 2}" width="${bw - 12}" height="2" fill="${fill}"/>`;
      }
      if (n) g += `<text x="${x + (bw - 12) / 2}" y="${Y(p) - 6}" text-anchor="middle" font-size="11">${fmtPct(p)}</text>`;
      g += `<text x="${x + (bw - 12) / 2}" y="${H - 14}" text-anchor="middle" font-size="12">${b > 0 ? "+1" : b}</text>`;
    });
    g += `<text x="${W / 2}" y="${H}" text-anchor="middle" font-size="10" class="dr-muted">estimate − truth</text>`;
    const label = `${M.ESTIMATORS[key].label}: ${n ? bars.map((b) => `${b}: ${fmtPct(pct(c[key][b] || 0, n))}`).join(", ") : "no samples yet"}`;
    return `<div class="dr-sweep-panel"><h3>${esc(M.ESTIMATORS[key].label)}</h3>${svgEl(W, H, g, label)}</div>`;
  });
  box.innerHTML = panels.join("");
  $("dr-sweep-status").textContent = n ? `${n.toLocaleString("en-US")} doubles sampled` : "";
}

function runSweep(total) {
  if (sweepBusy) return;
  sweepBusy = true;
  if (!sweepCounts) sweepCounts = { n: 0, bits: {}, log: {}, gay: {} };
  let left = total;
  const chunk = () => {
    const k = Math.min(2500, left);
    M.sweep(k, Math.random, sweepCounts);
    left -= k;
    renderSweep();
    if (left > 0) { $("dr-sweep-status").textContent += ` · ${(total - left).toLocaleString("en-US")} / ${total.toLocaleString("en-US")}`; setTimeout(chunk, 0); }
    else sweepBusy = false;
  };
  chunk();
}

// ---------------------------------------------------------------- 6. ledger

const LEDGER_PRESETS = [["0.1", 0.1], ["0.3", 0.3], ["1e23", 1e23], ["2⁻¹⁰⁰⁰", 2 ** -1000], ["5e-324", 5e-324], ["DBL_MAX", DBL_MAX], ["1000", 1000]];
const LEDGER_STEPS = ["d2b", "place", "margin", "cancel", "spec", "dshift", "build", "digit"];

function ledgerModel() { return M.gayDtoa(state.ledger); }

function renderLedger() {
  const g = ledgerModel();
  pressChips($("dr-ledger-chips"), state.ledger);
  const small = g.path === "small-int";
  const last = small ? 1 : LEDGER_STEPS.length - 1;
  state.step = Math.min(state.step, last);
  const step = state.step;
  $("dr-ledger-prev").disabled = step === 0;
  $("dr-ledger-next").disabled = step === last;
  $("dr-ledger-pos").textContent = `step ${step + 1} of ${last + 1}`;
  const byId = Object.fromEntries(g.stages.map((s) => [s.id, s]));
  const stageFor = (i) => {
    const id = LEDGER_STEPS[Math.min(i, 5)];
    return byId[id] || g.stages.at(-1);
  };
  const cur = stageFor(step);
  const prev = step > 0 ? stageFor(step - 1) : null;
  const max = Math.max(8, ...g.stages.flatMap((s) => [s.b2, s.b5, s.s2, s.s5, s.m2 ?? 0, s.m5 ?? 0]));
  const meter = (cls, val, old) => {
    if (val === null || val === undefined) return `<span class="dr-absent">—</span>`;
    const changed = old !== null && old !== undefined && old !== val;
    return `<div class="dr-meter ${cls}"><span class="dr-track"><i style="width:${100 * Math.max(0, val) / max}%"></i></span><b class="${changed ? "dr-changed" : ""}">${cls === "two" ? "2" : "5"}${sup(val)}</b></div>`;
  };
  const built = step >= 6 && g.built;
  const rows = [
    ["b", built ? `${fmtBig(g.built.b)}` : `${g.odd}`, cur.b2, cur.b5, prev?.b2, prev?.b5],
    ["S", built ? `${fmtBig(g.built.S)}` : "1", cur.s2, cur.s5, prev?.s2, prev?.s5],
    ["mhi", built ? `${fmtBig(g.built.mhi)}` : (cur.m2 === null ? "—" : "1"), cur.m2, cur.m5, prev ? prev.m2 : null, prev ? prev.m5 : null],
  ];
  let html = `<span class="dr-lh">row</span><span class="dr-lh">${built ? "built integer" : "odd part"}</span><span class="dr-lh">${built ? "size" : "factors of 2"}</span><span class="dr-lh">${built ? "" : "factors of 5"}</span>`;
  for (const [name, odd, x2, x5, p2, p5] of rows) {
    const absent = x2 === null && name === "mhi";
    html += `<span class="dr-lname">${name}</span><span class="dr-odd">${absent ? '<span class="dr-absent">not yet</span>' : esc(odd)}</span>`;
    html += built ? `<span class="dr-absent">${name === "b" ? g.built.bBits : name === "S" ? g.built.SBits : M.bitLength(g.built.mhi)} bits</span><span></span>`
      : (absent ? `<span></span><span></span>` : meter("two", x2, p2) + meter("five", x5, p5));
  }
  $("dr-ledger-board").innerHTML = html;
  $("dr-ledger-text").innerHTML = ledgerText(g, step);
  syncURL();
}

function ledgerText(g, step) {
  const v = state.ledger;
  const d = M.decompose(v);
  const st = Object.fromEntries(g.stages.map((s) => [s.id, s]));
  const i = d.s;
  if (step === 0) {
    return `<strong>d2b.</strong> Strip trailing zero bits: v = ${fmtV(v)} = b · 2${sup(g.be)} with b = ${g.odd} odd (${g.bbits} bits). The top bit of v is 2${sup(i)}. ` +
      (g.path === "small-int" ? "" : `Estimate k̂ = ${g.rep.E}${g.rep.check === "float" ? `, fixed at once by the double compare → k = ${g.rep.k}` : ", checked later (k_check)"}.`);
  }
  if (g.path === "small-int") {
    const k = g.E;
    return `<strong>Fast lane.</strong> v is an integer (binary exponent ${g.be} ≥ 0) and k = ${k} ≤ 14, so dtoa never builds the ledger. It divides by 10${sup(k)} in doubles: digits "${g.digits}", decpt ${g.decpt}. See the fast lane below.`;
  }
  const k = st.place.s5 ? st.place.s5 : -st.place.b5;
  switch (LEDGER_STEPS[step]) {
    case "place": {
      const j = g.bbits - i - 1;
      return `<strong>Place 10${sup(k)}.</strong> v = b · 2${sup(-j)} (j = bbits − 1 − i = ${j}), so ${j >= 0 ? `s2 = ${j}` : `b2 = ${-j}`}. Then 10${sup(k)} = 2${sup(k)} · 5${sup(k)} goes ${k >= 0 ? `<em>under</em> the bar: s5 = ${k}, s2 += ${k}` : `<em>over</em> the bar (dividing by 10${sup(k)}): b5 = ${-k}, b2 += ${-k}`}. Now b·2${sup("b2")}·5${sup("b5")} / (2${sup("s2")}·5${sup("s5")}) = v / 10${sup(k)}. No bignum has been built yet; these are just counters.`;
    }
    case "margin":
      return `<strong>The margin.</strong> The margin row copies b's factors (m2 = b2, m5 = b5), and b2 and s2 both grow by ${st.margin.add} (${d.normal ? "1 + 53 − bbits" : "be + 1075 for a subnormal"}). The fraction b/S is unchanged, but now mhi/S is exactly half an ulp of v, divided by 10${sup(k)}. The same unit then measures the value and the rounding interval.`;
    case "cancel":
      return `<strong>Cancel common 2s.</strong> min(m2, s2) = ${g.cancel} factors of 2 appear in all three rows, so they come off all three: plain subtraction on counters. ${g.cancel ? "" : "(Nothing to cancel for this v.)"} The 5s never need cancelling: all of 10${sup(k)}'s 5s sit on one side.`;
    case "spec":
      return g.spec
        ? `<strong>spec_case.</strong> v is a normal power of two, so the gap below is half the gap above. dtoa adds one more 2 to b and S (b2, s2 += 1). mlo stays half the lower gap, and it will set mhi = 2 · mlo.`
        : `<strong>spec_case?</strong> Only a normal power of two (other than the smallest normal) has a narrower gap below. v is not one, so the counters are unchanged and mlo = mhi.`;
    case "dshift":
      return `<strong>dshift.</strong> Shift all three rows by ${g.shift} more bits so that S's top 32-bit word has exactly 4 leading zero bits. This is pure alignment: it changes no ratio and exists to make quotient estimates cheap.`;
    case "build": {
      const b = g.built;
      return `<strong>Build the bignums.</strong> pow5mult raises 5 by binary powering from cached 5⁴, 5⁸, 5¹⁶, …, then the shifts apply the 2s. b has ${b.bBits} bits, S has ${b.SBits} (${b.unshiftedSBits} before dshift), mlo = ${fmtBig(b.mlo)}${g.spec ? `, mhi = 2·mlo` : ""}. ` +
        (g.rep.check === "bignum" ? `k_check: b &lt; S? ${g.kFixed ? `yes, so k = ${g.rep.E - 1}, and b and mhi were multiplied by 10.` : "no, so the estimate stands."}` : `k was already settled by the double compare.`);
    }
    case "digit": {
      const q = g.first;
      return `<strong>First digit (quorem).</strong> ${q.early ? "b has fewer words than S, so the quotient is 0." : `Estimate q̂ = ⌊${q.topB} / (${q.topS} + 1)⌋ = ${q.qhat} from the top words.`} ${q.corrected ? `The remainder is still ≥ S, so add one: digit ${q.q}. The same "estimate, then fix once" as the exponent.` : `The remainder is < S: digit ${q.q}, no correction.`} The stopping tests compare b with mlo and S − mhi. Here the loop ran ${g.loops} round${g.loops > 1 ? "s" : ""} and exited on the ${esc(g.exit)}: output "${g.digits}", decpt ${g.decpt}.`;
    }
  }
  return "";
}

function renderSizeTable() {
  const rows = [["0.1", 0.1], ["1e23", 1e23], ["1e-300", 1e-300], ["2.2250738585072014e-308", 2.2250738585072014e-308], ["5e-324", 5e-324], ["DBL_MAX", DBL_MAX]];
  let html = `<thead><tr><th>v</th><th>B&amp;D s</th><th>dtoa S</th><th>+ dshift</th></tr></thead><tbody>`;
  for (const [label, v] of rows) {
    const g = M.gayDtoa(v);
    const b = M.bdSizes(v);
    html += `<tr><td>${esc(label)}</td><td>${b.s}</td><td>${g.built.unshiftedSBits}</td><td>${g.built.SBits}</td></tr>`;
  }
  $("dr-size-table").innerHTML = html + "</tbody>";
}

function renderFast() {
  const raw = $("dr-fast-input").value;
  const v = M.parseInput(raw);
  const box = $("dr-fast");
  if (v === null) { box.innerHTML = `<span class="dr-verdict-miss">Type a positive number.</span>`; return; }
  const g = M.gayDtoa(v);
  if (g.path !== "small-int") {
    const why = !Number.isInteger(v) ? "v is not an integer" : `k = ${g.E} > 14 (v ≥ 10¹⁵)`;
    box.innerHTML = `${fmtV(v)}: not in the fast lane (${why}), so dtoa takes the bignum path. Output "${g.digits}", decpt ${g.decpt}.`;
    return;
  }
  const k = g.E;
  let rows = g.trace.map((t, i) => `<tr><td>${i + 1}</td><td>${t.L}</td><td>${t.u}</td><td>${t.u ? "×10, continue" : "zero → stop"}</td></tr>`).join("");
  box.innerHTML = `${fmtV(v)}: integer, k = ${k} ≤ 14. Loop: L = ⌊u / 10${sup(k)}⌋, u −= L·10${sup(k)}, u ×= 10.
    <table class="dr-fast-table"><thead><tr><th>round</th><th>digit L</th><th>remainder u</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    Output "${g.digits}" (trailing zeros dropped), decpt ${g.decpt}.`;
}

// ---------------------------------------------------------------- wiring

function init() {
  chips($("dr-race-chips"), RACE_PRESETS, state.race, (v) => { state.race = v; renderRace(true); syncURL(); });
  $("dr-race-go").addEventListener("click", () => renderRace(true));

  chips($("dr-v-chips"), V_PRESETS, state.v, (v) => { setV(v); pressChips($("dr-v-chips"), v); });
  chips($("dr-repair-chips"), [["1000", 1000], ["987.654", 987.654], ["1e23", 1e23], ["0.3", 0.3], ["5e-324", 5e-324]], state.v, (v) => { setV(v); pressChips($("dr-v-chips"), v); });
  const radios = $("dr-est-radios");
  for (const [key, e] of Object.entries(M.ESTIMATORS)) {
    radios.insertAdjacentHTML("beforeend", `<label><input type="radio" name="dr-est" value="${key}" ${key === state.est ? "checked" : ""}> ${esc(e.short)}</label>`);
  }
  radios.addEventListener("change", (ev) => { state.est = ev.target.value; renderRulers(); syncURL(); });
  $("dr-zoom").value = String(state.zoom);
  $("dr-zoom").addEventListener("change", (ev) => { state.zoom = Number(ev.target.value); setV(state.v); });
  const apply = () => {
    const v = M.parseInput($("dr-v-input").value);
    if (v === null) { $("dr-v-error").textContent = "Enter a positive finite number, e.g. 1e23 or 0.1."; return; }
    setV(v, { from: "input" });
    pressChips($("dr-v-chips"), v);
  };
  $("dr-v-apply").addEventListener("click", apply);
  $("dr-v-input").addEventListener("keydown", (ev) => { if (ev.key === "Enter") apply(); });
  $("dr-slider").addEventListener("input", (ev) => setV(snapFromLog(Number(ev.target.value)), { recenter: false, from: "slider" }));
  $("dr-prev-binade").addEventListener("click", () => nudgeBinade(-1));
  $("dr-next-binade").addEventListener("click", () => nudgeBinade(1));
  installDrag();

  $("dr-sweep-go").addEventListener("click", () => { sweepCounts = null; runSweep(20000); });
  $("dr-sweep-more").addEventListener("click", () => runSweep(100000));
  $("dr-sweep-reset").addEventListener("click", () => { sweepCounts = null; renderSweep(); });

  chips($("dr-ledger-chips"), LEDGER_PRESETS, state.ledger, (v) => { state.ledger = v; state.step = 0; renderLedger(); });
  $("dr-ledger-prev").addEventListener("click", () => { state.step = Math.max(0, state.step - 1); renderLedger(); });
  $("dr-ledger-next").addEventListener("click", () => { state.step += 1; renderLedger(); });
  $("dr-fast-apply").addEventListener("click", renderFast);
  $("dr-fast-input").addEventListener("keydown", (ev) => { if (ev.key === "Enter") renderFast(); });

  renderRace(false);
  setV(state.v);
  pressChips($("dr-v-chips"), state.v);
  render1e23();
  renderSweep();
  if (params.get("sweep")) runSweep(Math.min(200000, Number(params.get("sweep")) || 20000));
  else setTimeout(() => runSweep(20000), 400);
  renderLedger();
  renderSizeTable();
  renderFast();

  let t = 0;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => { renderRaceChart(); renderRulers(); renderTangent(); renderSweep(); }, 120);
  });
}

init();
