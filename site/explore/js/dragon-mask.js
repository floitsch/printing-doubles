// Copyright (C) 2026 Toit contributors.
//
// "The Mask": interactive Dragon4 explorer.  Panel A shows one decimal digit
// cell with the remainder as a dot and the two error masks as shadows; Panel B
// (doubles only) is the log-scale race between the dot's distance to the cell
// edges and the masks, which climb one decade per digit.

import {
  dragon4, cellStates, decodeBinary64, toyFloat, roundToToy, decimalLabel, groupDigits,
  bitLength, parseNumberInput, TOY_PRESETS, DOUBLE_PRESETS,
} from "./dragon-mask-model.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Human number: 0.3125, 2.78·10⁻¹⁶. */
function fmt(x, digits = 3) {
  if (x === 0) return "0";
  if (!Number.isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a >= 1e-4 && a < 1e6) return String(Number(x.toPrecision(digits + 1)));
  const [m, e] = x.toExponential(digits - 1).split("e");
  return `${Number(m)}·10${sup(Number(e))}`;
}

/** Position of the dot in the cell; near the right edge show 1 − distance. */
function fmtPos(st) {
  if (st.distR < 1e-4 && st.distR > 0) return `1 − ${fmt(st.distR)}`;
  return fmt(st.dot, 4);
}

function fmtPow10(logv) {
  return `10${sup(Math.round(logv))}`;
}

/** Short BigInt display: full when short, else leading digits plus count. */
function shortBig(n) {
  const s = n.toString();
  if (s.length <= 18) return groupDigits(n);
  return `${s.slice(0, 6)}… (${s.length} digits)`;
}

function powerOfTwoLabel(n) {
  // n is 2^e exactly when it has a single set bit
  if (n > 0n && (n & (n - 1n)) === 0n) {
    const e = bitLength(n) - 1;
    return e <= 16 ? String(n) : `2${sup(e)}`;
  }
  return null;
}

function symbolic(n) {
  return powerOfTwoLabel(n) ?? shortBig(n);
}

// ------------------------------------------------------------------ pseudocode

function codeLines(inclusive) {
  const lt = inclusive ? "≤" : "<";
  const gt = inclusive ? "≥" : ">";
  return [
    "R ← f·2^max(q,0);   S ← 2^max(−q,0)",
    "M⁻ ← M⁺ ← 2^max(q,0)            ▹ M/S = one full gap",
    "if unequal gaps: R, S, M⁺ ← 2R, 2S, 2M⁺",
    "k ← 0",
    "while R < ⌈S/10⌉: k ← k−1;  R, M⁻, M⁺ ← 10R, 10M⁻, 10M⁺",
    `while 2R + M⁺ ${inclusive ? "≥" : ">"} 2S:  S ← 10S;  k ← k+1`,
    "H ← k − 1                       ▹ weight of the first digit",
    "loop:",
    "  k ← k − 1",
    "  U ← ⌊10R / S⌋;   R ← 10R mod S   ▹ split, zoom",
    "  M⁻ ← 10M⁻;   M⁺ ← 10M⁺          ▹ shadows grow ×10",
    `  low  ← 2R ${lt} M⁻                  ▹ dot in left shadow`,
    `  high ← 2R ${gt} 2S − M⁺             ▹ dot in right shadow`,
    "  if not low and not high: emit U; repeat",
    "if low and not high: emit U",
    "if high and not low: emit U + 1",
    "if both: emit U if 2R < S, U + 1 if 2R > S (tie: even)",
  ];
}

function activeLines(state, run) {
  if (state.j === 0) return run.loops1 || run.loops2 ? [4, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
  if (!state.final) return [8, 9, 10, 11, 12, 13];
  const which = state.choice === "low" ? 14 : state.choice === "high" ? 15 : 16;
  return [11, 12, which];
}

// ------------------------------------------------------------------ Panel A: the cell

// Geometry: wide (desktop) or compact (phone) viewBox; set before each render.
let VW = 760;
let X0 = 40;
let X1 = 720;
let W = X1 - X0;
let COMPACT = false;
function setGeometry(compact) {
  COMPACT = compact;
  VW = compact ? 440 : 760;
  X0 = compact ? 14 : 40;
  X1 = VW - X0;
  W = X1 - X0;
}
const BAR_Y = 70;
const BAR_H = 50;

function cellSVG(st, prev, run, zoom) {
  // zoom: null (static) or {U, e} with e in [0,1] easing progress from the previous cell.
  const e = zoom ? zoom.e : 1;
  const U = zoom ? zoom.U : 0;
  const a = zoom ? X0 + (U / 10) * W * (1 - e) : X0;
  const b = zoom ? X0 + ((U + 1) / 10) * W + (X1 - (X0 + ((U + 1) / 10) * W)) * e : X1;
  const X = (u) => a + u * (b - a);
  const showMag = !zoom && Math.max(st.shadowL, st.shadowR) < 0.006;
  const height = showMag ? 340 : 222;
  const parts = [];
  parts.push(`<svg viewBox="0 0 ${VW} ${height}" role="img" aria-labelledby="${run.id}-cell-title" class="dragon-mask-cellsvg${COMPACT ? " compact" : ""}">`);
  parts.push(`<title id="${run.id}-cell-title">${esc(cellDescription(st, run))}</title>`);
  parts.push(`<defs>
    <pattern id="${run.id}-hatchL" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--blue)" stroke-width="2.2" opacity=".55"/></pattern>
    <pattern id="${run.id}-hatchR" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--blue)" stroke-width="2.2" opacity=".55"/></pattern>
    <clipPath id="${run.id}-clip"><rect x="${X0}" y="${BAR_Y - 30}" width="${W}" height="${BAR_H + 60}"/></clipPath>
  </defs>`);

  // Lamps
  const lamp = (x, on, label, anchor) => `<g class="dragon-mask-lamp${on && e === 1 ? " on" : ""}"><circle cx="${x}" cy="22" r="9"/><text x="${anchor === "start" ? x + 16 : x - 16}" y="26" text-anchor="${anchor}">${label}</text></g>`;
  if (st.j > 0) {
    parts.push(lamp(X0 + 9, st.low, COMPACT ? "low" : "low: prefix inside", "start"));
    parts.push(lamp(X1 - 9, st.high, COMPACT ? "high" : "high: prefix+1 inside", "end"));
  } else {
    parts.push(`<text class="dragon-mask-note" x="${X0}" y="26">starting cell: no digit yet, no test yet</text>`);
  }

  // Bar background
  parts.push(`<rect class="dragon-mask-bar" x="${X0}" y="${BAR_Y}" width="${W}" height="${BAR_H}"/>`);
  parts.push(`<g clip-path="url(#${run.id}-clip)">`);

  // Old shadows fading out during the zoom (anchored at the previous cell's edges).
  if (zoom && prev) {
    const o = 1 - e;
    const sl = st.shadowL; // in new units = 10 × old width
    const sr = st.shadowR;
    parts.push(`<rect x="${X(-U)}" y="${BAR_Y}" width="${Math.max(0, X(-U + sl) - X(-U))}" height="${BAR_H}" fill="url(#${run.id}-hatchL)" opacity="${o}"/>`);
    parts.push(`<rect x="${X(10 - U - sr)}" y="${BAR_Y}" width="${Math.max(0, X(10 - U) - X(10 - U - sr))}" height="${BAR_H}" fill="url(#${run.id}-hatchR)" opacity="${o}"/>`);
    for (let i = 0; i <= 10; i++) {
      parts.push(`<line class="dragon-mask-oldtick" x1="${X(i - U)}" x2="${X(i - U)}" y1="${BAR_Y}" y2="${BAR_Y + BAR_H}" opacity="${o}"/>`);
    }
  }

  // Current shadows
  const wl = Math.min(st.shadowL, 1.2);
  const wr = Math.min(st.shadowR, 1.2);
  const shadowRect = (x, w, side) => `<rect class="dragon-mask-shadowbg" x="${x}" y="${BAR_Y}" width="${w}" height="${BAR_H}"/><rect x="${x}" y="${BAR_Y}" width="${w}" height="${BAR_H}" fill="url(#${run.id}-hatch${side})"/>`;
  parts.push(shadowRect(X(0), Math.max(0.6, X(wl) - X(0)), "L"));
  parts.push(shadowRect(X(1 - wr), Math.max(0.6, X(1) - X(1 - wr)), "R"));

  // Sub-cell ticks (the next split) and their digit labels
  const nextU = st.final ? null : Math.min(9, Math.floor(st.dot * 10));
  for (let i = 1; i < 10; i++) {
    parts.push(`<line class="dragon-mask-tick" x1="${X(i / 10)}" x2="${X(i / 10)}" y1="${BAR_Y}" y2="${BAR_Y + BAR_H}" opacity="${e}"/>`);
  }
  if (nextU !== null && !zoom) {
    parts.push(`<rect class="dragon-mask-next" x="${X(nextU / 10)}" y="${BAR_Y}" width="${X((nextU + 1) / 10) - X(nextU / 10)}" height="${BAR_H}"/>`);
  }
  if (!zoom) {
    for (let i = 0; i < 10; i++) {
      parts.push(`<text class="dragon-mask-subdigit${i === nextU ? " next" : ""}" x="${X((i + 0.5) / 10)}" y="${BAR_Y + 13}" text-anchor="middle">${i}</text>`);
    }
  }
  parts.push(`</g>`);
  parts.push(`<rect class="dragon-mask-frame" x="${X0}" y="${BAR_Y}" width="${W}" height="${BAR_H}"/>`);

  // Both lamps: centre line
  if (!zoom && st.final && st.low && st.high) {
    parts.push(`<line class="dragon-mask-centre" x1="${X(0.5)}" x2="${X(0.5)}" y1="${BAR_Y - 8}" y2="${BAR_Y + BAR_H + 8}"/>`);
    parts.push(`<text class="dragon-mask-note" x="${X(0.5)}" y="${BAR_Y - 12}" text-anchor="middle">centre: 2R vs S</text>`);
  }

  // Dot
  const dx = Math.max(X0, Math.min(X1, X(st.dot)));
  parts.push(`<circle class="dragon-mask-dot" cx="${dx}" cy="${BAR_Y + BAR_H / 2 + 4}" r="7"/>`);
  if (!zoom) {
    const anchor = dx > X1 - (COMPACT ? 100 : 130) ? "end" : dx < X0 + (COMPACT ? 100 : 130) ? "start" : "middle";
    const lx = anchor === "end" ? Math.min(dx + 6, X1) : anchor === "start" ? Math.max(dx - 6, X0) : dx;
    parts.push(`<text class="dragon-mask-dotlabel" x="${lx}" y="${BAR_Y + BAR_H + 18}" text-anchor="${anchor}">v: R/S = ${esc(fmtPos(st))}</text>`);
  }

  // Edge labels (decimal candidates)
  if (!zoom) {
    const left = decimalLabel(st.leftCoef, st.edgeExp, st.j);
    const right = decimalLabel(st.rightCoef, st.edgeExp, st.j);
    const chosen = st.final ? (st.out === st.U ? "L" : "R") : null;
    parts.push(`<line class="dragon-mask-edge" x1="${X0}" x2="${X0}" y1="${BAR_Y - 6}" y2="${BAR_Y + BAR_H + 44}"/>`);
    parts.push(`<line class="dragon-mask-edge" x1="${X1}" x2="${X1}" y1="${BAR_Y - 6}" y2="${BAR_Y + BAR_H + 44}"/>`);
    const lcap = st.j === 0 ? "zero" : COMPACT ? `prefix (U = ${st.U})` : `prefix (keep U = ${st.U})`;
    const rcap = st.j === 0 ? `10${sup(run.start.k)} (k = ${run.start.k})` : COMPACT ? `prefix+1 (U+1 = ${st.U + 1})` : `prefix + 1 (U + 1 = ${st.U + 1})`;
    parts.push(`<text class="dragon-mask-edgecap" x="${X0 + 6}" y="${BAR_Y + BAR_H + 56}">${esc(lcap)}</text>`);
    parts.push(`<text class="dragon-mask-edgelabel${chosen === "L" ? " chosen" : ""}" x="${X0 + 6}" y="${BAR_Y + BAR_H + 76}">${esc(left)}${chosen === "L" ? (COMPACT ? " ←" : "  ← output") : ""}</text>`);
    parts.push(`<text class="dragon-mask-edgecap" x="${X1 - 6}" y="${BAR_Y + BAR_H + 56}" text-anchor="end">${esc(rcap)}</text>`);
    parts.push(`<text class="dragon-mask-edgelabel${chosen === "R" ? " chosen" : ""}" x="${X1 - 6}" y="${BAR_Y + BAR_H + 76}" text-anchor="end">${chosen === "R" ? (COMPACT ? "→ " : "output →  ") : ""}${esc(right)}</text>`);
    // shadow width captions
    const cap = (w) => (w >= 1 && !COMPACT ? `${fmt(w)} (covers the cell)` : fmt(w));
    parts.push(`<text class="dragon-mask-shadowcap" x="${X0 + 4}" y="${BAR_Y - 8}">M⁻/2S = ${esc(cap(st.shadowL))}</text>`);
    parts.push(`<text class="dragon-mask-shadowcap" x="${X1 - 4}" y="${BAR_Y - 8}" text-anchor="end">M⁺/2S = ${esc(cap(st.shadowR))}</text>`);
  }

  if (showMag) parts.push(magnifierSVG(st, run));
  parts.push(`</svg>`);
  return parts.join("");
}

function magnifierSVG(st, run) {
  const y = 262;
  const h = 44;
  const bw = Math.min(300, (W - 24) / 2);
  const out = [];
  const box = (x, side) => {
    const s = side === "L" ? st.shadowL : st.shadowR;
    const w = 4 * s; // window width in cell units: the shadow fills a quarter
    const dist = side === "L" ? st.distL : st.distR;
    const logDist = side === "L" ? st.logDistL : st.logDistR;
    const g = [];
    const zoomLog = -Math.log10(w);
    g.push(`<text class="dragon-mask-note" x="${side === "L" ? x : x + bw}" y="${y - 8}" text-anchor="${side === "L" ? "start" : "end"}">${side === "L" ? "left" : "right"} edge ×${fmtPow10(zoomLog)}</text>`);
    g.push(`<rect class="dragon-mask-bar" x="${x}" y="${y}" width="${bw}" height="${h}"/>`);
    const sw = bw / 4;
    const sx = side === "L" ? x : x + bw - sw;
    g.push(`<rect class="dragon-mask-shadowbg" x="${sx}" y="${y}" width="${sw}" height="${h}"/><rect x="${sx}" y="${y}" width="${sw}" height="${h}" fill="url(#${run.id}-hatch${side})"/>`);
    g.push(`<rect class="dragon-mask-frame" x="${x}" y="${y}" width="${bw}" height="${h}"/>`);
    const edgeX = side === "L" ? x : x + bw;
    g.push(`<line class="dragon-mask-edge" x1="${edgeX}" x2="${edgeX}" y1="${y - 4}" y2="${y + h + 4}"/>`);
    if (dist < w) {
      const px = side === "L" ? x + (dist / w) * bw : x + bw - (dist / w) * bw;
      g.push(`<circle class="dragon-mask-dot" cx="${px}" cy="${y + h / 2}" r="6"/>`);
      g.push(`<text class="dragon-mask-note" x="${x + bw / 2}" y="${y + h + 18}" text-anchor="middle">dot ${fmt(dist)} ${COMPACT ? "in" : "from the edge"}</text>`);
    } else {
      const ax = side === "L" ? x + bw - 8 : x + 8;
      g.push(`<text class="dragon-mask-note" x="${ax}" y="${y + h / 2 + 4}" text-anchor="${side === "L" ? "end" : "start"}">${side === "L" ? "dot far →" : "← dot far"}</text>`);
      g.push(`<text class="dragon-mask-note" x="${x + bw / 2}" y="${y + h + 18}" text-anchor="middle">${COMPACT ? `dot ${fmt(dist)} away` : `dot ${fmt(dist)} away = ${fmtPow10(logDist - Math.log10(w))} window widths`}</text>`);
    }
    return g.join("");
  };
  out.push(`<line class="dragon-mask-magline" x1="${X0}" y1="${BAR_Y + BAR_H}" x2="${X0}" y2="${y}"/>`);
  out.push(`<line class="dragon-mask-magline" x1="${X1}" y1="${BAR_Y + BAR_H}" x2="${X1}" y2="${y}"/>`);
  out.push(box(X0, "L"));
  out.push(box(X1 - bw, "R"));
  return out.join("");
}

function cellDescription(st, run) {
  const left = decimalLabel(st.leftCoef, st.edgeExp, st.j);
  const right = decimalLabel(st.rightCoef, st.edgeExp, st.j);
  let s = `Digit cell from ${left} to ${right}. The dot (v) sits at ${fmt(st.dot, 4)} of the cell. Left shadow ${fmt(st.shadowL)}, right shadow ${fmt(st.shadowR)} of the cell.`;
  if (st.j > 0) s += ` low ${st.low ? "on" : "off"}, high ${st.high ? "on" : "off"}.`;
  if (st.final) s += ` Output ${run.text}.`;
  return s;
}

// ------------------------------------------------------------------ Panel B: the race

function raceSVG(run, states, j) {
  const steps = states.slice(1);
  const n = steps.length;
  const PX0 = COMPACT ? 46 : 70;
  const PX1 = COMPACT ? VW - 8 : 700;
  const PY0 = 24;
  const PY1 = 250;
  let lo = 0;
  for (const s of steps) {
    for (const v of [s.logDistL, s.logDistR, s.logShadowL, s.logShadowR]) if (Number.isFinite(v)) lo = Math.min(lo, v);
  }
  const yMin = Math.floor(lo) - 1;
  const yMax = 1;
  const cols = Math.max(n, 8);
  const colW = (PX1 - PX0) / cols;
  const cx = (i) => PX0 + (i - 0.5) * colW;
  const Y = (v) => PY1 - ((Math.max(v, yMin) - yMin) / (yMax - yMin)) * (PY1 - PY0);
  const p = [];
  p.push(`<svg viewBox="0 0 ${VW} 332" role="img" aria-labelledby="${run.id}-race-title" class="dragon-mask-racesvg${COMPACT ? " compact" : ""}">`);
  p.push(`<title id="${run.id}-race-title">${esc(raceDescription(run, states))}</title>`);
  // grid
  const stepDec = yMax - yMin > 12 ? 2 : 1;
  for (let v = yMax; v >= yMin; v--) {
    if (Math.abs(v) % stepDec !== 0) continue;
    p.push(`<line class="dragon-mask-grid${v === 0 ? " one" : ""}" x1="${PX0}" x2="${PX1}" y1="${Y(v)}" y2="${Y(v)}"/>`);
    p.push(`<text class="dragon-mask-axis" x="${PX0 - 8}" y="${Y(v) + 4}" text-anchor="end">10${sup(v)}</text>`);
  }
  if (!COMPACT) p.push(`<text class="dragon-mask-axis" x="${PX1}" y="${Y(0) - 5}" text-anchor="end">1 cell width</text>`);
  // current column
  if (j >= 1) {
    const fin = states[j].final;
    p.push(`<rect class="dragon-mask-current${fin ? " final" : ""}" x="${cx(j) - colW / 2}" y="${PY0}" width="${colW}" height="${PY1 - PY0}"/>`);
  }
  // mask lines
  const line = (key, cls) => {
    const pts = steps.map((s, i) => `${cx(i + 1)},${Y(s[key])}`).join(" ");
    return `<polyline class="${cls}" points="${pts}"/>`;
  };
  p.push(line("logShadowR", "dragon-mask-maskline right"));
  p.push(line("logShadowL", "dragon-mask-maskline left"));
  steps.forEach((s, i) => {
    const x = cx(i + 1);
    const hw = Math.min(colW * 0.42, 22);
    p.push(`<line class="dragon-mask-masktick right" x1="${x - hw}" x2="${x + hw}" y1="${Y(s.logShadowR)}" y2="${Y(s.logShadowR)}"/>`);
    p.push(`<line class="dragon-mask-masktick left" x1="${x - hw}" x2="${x + hw}" y1="${Y(s.logShadowL)}" y2="${Y(s.logShadowL)}"/>`);
  });
  // points
  steps.forEach((s, i) => {
    const k = i + 1;
    const future = k > j ? " future" : "";
    const yl = Number.isFinite(s.logDistL) ? Y(s.logDistL) : PY1;
    const yr = Number.isFinite(s.logDistR) ? Y(s.logDistR) : PY1;
    const inL = s.low ? " hit" : "";
    const inR = s.high ? " hit" : "";
    p.push(`<circle class="dragon-mask-pt left${future}${inL}" cx="${cx(k) - 5}" cy="${yl}" r="5"/>`);
    p.push(`<rect class="dragon-mask-pt right${future}${inR}" x="${cx(k) + 5 - 4.5}" y="${yr - 4.5}" width="9" height="9" transform="rotate(45 ${cx(k) + 5} ${yr})"/>`);
    if (!Number.isFinite(s.logDistL)) p.push(`<text class="dragon-mask-note" x="${cx(k) - 5}" y="${PY1 - 8}" text-anchor="middle">0</text>`);
    // digit labels
    const lbl = s.final ? `${s.U}${s.out !== s.U ? `→${s.out}` : ""}` : String(s.U);
    p.push(`<text class="dragon-mask-axis digit${future}" x="${cx(k)}" y="${PY1 + 18}" text-anchor="middle">${lbl}</text>`);
    if (n <= 20 || k % 2 === 1 || k === n) p.push(`<text class="dragon-mask-axis small${future}" x="${cx(k)}" y="${PY1 + 32}" text-anchor="middle">${k}</text>`);
  });
  p.push(`<text class="dragon-mask-axis" x="${PX0 - 8}" y="${PY1 + 18}" text-anchor="end">${COMPACT ? "U" : "digit U"}</text>`);
  p.push(`<text class="dragon-mask-axis small" x="${PX0 - 8}" y="${PY1 + 32}" text-anchor="end">step</text>`);
  // legend (two rows)
  const l1 = 304;
  const l2 = 323;
  const lx2 = COMPACT ? PX0 + 160 : PX0 + 300;
  const t = COMPACT
    ? ["to left edge", "left shadow (low)", "to right edge", "right shadow (high)"]
    : ["dot to left edge (R/S)", "left shadow M⁻/2S (low when circle is below)", "dot to right edge (1 − R/S)", "right shadow M⁺/2S (high when diamond is below)"];
  const lx0 = COMPACT ? 12 : PX0;
  p.push(`<circle class="dragon-mask-pt left" cx="${lx0 + 4}" cy="${l1 - 4}" r="5"/><text class="dragon-mask-axis" x="${lx0 + 16}" y="${l1}">${t[0]}</text>`);
  p.push(`<line class="dragon-mask-maskline left" x1="${lx2}" x2="${lx2 + 36}" y1="${l1 - 4}" y2="${l1 - 4}"/><text class="dragon-mask-axis" x="${lx2 + 44}" y="${l1}">${t[1]}</text>`);
  p.push(`<rect class="dragon-mask-pt right" x="${lx0 - 0.5}" y="${l2 - 8.5}" width="9" height="9" transform="rotate(45 ${lx0 + 4} ${l2 - 4})"/><text class="dragon-mask-axis" x="${lx0 + 16}" y="${l2}">${t[2]}</text>`);
  p.push(`<line class="dragon-mask-maskline right" x1="${lx2}" x2="${lx2 + 36}" y1="${l2 - 4}" y2="${l2 - 4}"/><text class="dragon-mask-axis" x="${lx2 + 44}" y="${l2}">${t[3]}</text>`);
  p.push(`</svg>`);
  return p.join("");
}

function raceDescription(run, states) {
  const last = states.at(-1);
  const where = last.low && last.high ? "both distances fall" : last.low ? "the distance to the left edge falls" : "the distance to the right edge falls";
  return `Race chart over ${states.length - 1} digits. The mask lines climb one decade per digit; the algorithm stops at digit ${last.j}, where ${where} under the mask line. Output ${run.text}.`;
}

// ------------------------------------------------------------------ explorer

class MaskExplorer {
  constructor(root, kind) {
    this.root = root;
    this.kind = kind;
    this.id = root.id || `dm${Math.random().toString(36).slice(2, 7)}`;
    this.q = (role) => root.querySelector(`[data-role="${role}"]`);
    this.j = 0;
    this.inclusive = false;
    this.timer = null;
    this.anim = null;
    this.buildPresets();
    this.bind();
  }

  buildPresets() {
    const box = this.q("presets");
    const presets = this.kind === "toy" ? TOY_PRESETS : DOUBLE_PRESETS;
    box.innerHTML = presets.map((p) => `<button type="button" data-id="${esc(p.id)}" aria-pressed="false">${esc(p.label)}</button>`).join("");
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      const p = presets.find((x) => x.id === b.dataset.id);
      this.stop();
      this.loadPreset(p);
      this.setStep(0, false);
      this.pushURL();
    });
  }

  bind() {
    const on = (role, fn) => { const el = this.q(role); if (el) el.addEventListener("click", fn); };
    on("reset", () => { this.stop(); this.setStep(0, false); this.pushURL(); });
    on("back", () => { this.stop(); this.setStep(this.j - 1, false); this.pushURL(); });
    on("step", () => { this.stop(); this.setStep(this.j + 1, true); this.pushURL(); });
    on("end", () => { this.stop(); this.setStep(this.states.length - 1, false); this.pushURL(); });
    on("play", () => this.togglePlay());
    const form = this.q("form");
    if (form) {
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        this.stop();
        if (this.loadText(this.q("input").value)) { this.setStep(0, false); this.pushURL(); }
      });
    }
    const incl = this.q("inclusive");
    if (incl) {
      incl.addEventListener("change", () => {
        this.inclusive = incl.checked;
        const j = this.j;
        this.compute();
        this.setStep(Math.min(j, this.states.length - 1), false);
        this.pushURL();
      });
    }
  }

  loadPreset(p) {
    this.preset = p;
    if (this.kind === "toy") {
      this.v = toyFloat(p.f, p.q, 5);
      this.inputText = p.id;
    } else {
      this.v = decodeBinary64(p.x);
      this.inputText = p.id;
    }
    const input = this.q("input");
    if (input) input.value = this.kind === "toy" ? String(this.v.value) : p.id;
    this.compute();
  }

  loadText(text) {
    const msg = this.q("message");
    const presets = this.kind === "toy" ? TOY_PRESETS : DOUBLE_PRESETS;
    const preset = presets.find((p) => p.id === String(text).trim());
    if (preset) { this.loadPreset(preset); if (msg) msg.textContent = ""; return true; }
    const x = parseNumberInput(text);
    if (x === null) {
      if (msg) msg.textContent = "Enter a positive finite number, e.g. 0.3, 1e23, 2^-44, 1/3 or 0.1+0.2.";
      return false;
    }
    this.preset = null;
    this.inputText = String(text).trim();
    if (this.kind === "toy") {
      this.v = roundToToy(x, 5);
      if (msg) msg.textContent = this.v.value === x ? "" : `Rounded to the nearest 5-bit toy float: ${this.v.value} = ${this.v.f}·2${sup(this.v.q)}.`;
    } else {
      this.v = decodeBinary64(x);
      if (msg) msg.textContent = "";
    }
    this.compute();
    return true;
  }

  compute() {
    this.run = dragon4(this.v, { inclusive: this.inclusive });
    this.run.id = this.id;
    this.states = cellStates(this.run);
    this.root.querySelectorAll("[data-role=presets] button").forEach((b) => {
      b.setAttribute("aria-pressed", String(this.preset && b.dataset.id === this.preset.id));
    });
    this.renderSetup();
  }

  geometry() {
    setGeometry(this.root.clientWidth > 0 && this.root.clientWidth < 620);
  }

  setStep(j, animate) {
    this.geometry();
    j = Math.max(0, Math.min(this.states.length - 1, j));
    const prevJ = this.j;
    this.j = j;
    if (this.anim) { cancelAnimationFrame(this.anim); this.anim = null; }
    const st = this.states[j];
    if (animate && j === prevJ + 1 && j >= 1 && !reduceMotion.matches) {
      const U = st.U;
      const prev = this.states[prevJ];
      const t0 = performance.now();
      const dur = 750;
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        if (t < 1) {
          this.geometry();
          this.q("cell").innerHTML = cellSVG(st, prev, this.run, { U, e });
          this.anim = requestAnimationFrame(frame);
        } else {
          this.anim = null;
          this.renderAll();
        }
      };
      this.renderAll(true);
      this.anim = requestAnimationFrame(frame);
    } else {
      this.renderAll();
    }
  }

  renderAll(skipCell = false) {
    const st = this.states[this.j];
    if (!skipCell) this.q("cell").innerHTML = cellSVG(st, null, this.run, null);
    const race = this.q("race");
    if (race) race.innerHTML = raceSVG(this.run, this.states, this.j);
    this.renderTape();
    this.renderReadout();
    this.renderDrawer();
    const last = this.states.length - 1;
    this.q("back").disabled = this.j === 0;
    this.q("reset").disabled = this.j === 0;
    this.q("step").disabled = this.j === last;
    this.q("end").disabled = this.j === last;
    this.q("status").textContent = this.j === 0 ? `setup · ${last} digit${last === 1 ? "" : "s"} to go` : `digit ${this.j} of ${last}`;
  }

  renderSetup() {
    const r = this.run;
    const { f, q } = this.v;
    const isToy = this.kind === "toy";
    const k = r.start.k;
    const vText = isToy ? String(this.v.value) : String(this.v.value);
    const Sdesc = symbolic(r.init.S);
    const Mdesc = symbolic(r.init.Mm);
    const Rdesc = q > 0 ? `f·2${sup(q)}` : groupDigits(r.init.R);
    const cards = [];
    cards.push(`<div><span>1 · input</span><b>v = ${esc(vText)}</b><em>= f·2${sup(q)}, f = ${esc(isToy || f < 10n ** 18n ? groupDigits(f) : shortBig(f))}${isToy ? " (5-bit toy)" : ""}</em></div>`);
    cards.push(`<div><span>2 · integers, v = R/S</span><b>R = ${esc(Rdesc)}</b><em>S = ${esc(Sdesc)}; M⁻ = M⁺ = ${esc(Mdesc)}</em></div>`);
    cards.push(`<div><span>3 · unequal gaps?</span><b>${r.unequal ? "yes: R, S, M⁺ ×2" : "no"}</b><em>${r.unequal ? "f is a power of two: the gap below is half the gap above" : "both neighbours are one gap away"}</em></div>`);
    const l1 = r.loops1 ? `${r.loops1}× (R, M⁻, M⁺ ×10)` : "loop 1: 0×";
    const l2 = r.loops2 ? `${r.loops2}× (S ×10)` : "loop 2: 0×";
    cards.push(`<div><span>4 · Fixup finds k</span><b>${esc(r.loops1 ? l1 : l2)}</b><em>${esc(r.loops1 ? l2 : l1)} → k = ${k}, first digit weighs 10${sup(k - 1)}</em></div>`);
    this.q("setup").innerHTML = cards.join("");
  }

  renderTape() {
    const st = this.states[this.j];
    const tape = this.q("tape");
    const digits = [];
    for (let i = 1; i <= this.j; i++) {
      const s = this.states[i];
      if (s.final && s.out !== s.U) digits.push(`<span class="bumped"><s>${s.U}</s>${s.out}</span>`);
      else digits.push(`<span${s.final ? ' class="last"' : ""}>${s.U}</span>`);
    }
    const w = this.run.H;
    let result = "";
    if (st.final) result = `<strong>= ${esc(this.run.text)}</strong>`;
    tape.innerHTML = `<small>digits (first weighs 10${sup(w)})</small>${digits.join("") || "<i>none yet</i>"}${result}`;
  }

  renderReadout() {
    const st = this.states[this.j];
    const r = this.run;
    const out = [];
    if (st.j === 0) {
      out.push(`Setup done. The cell is [0, ${esc(decimalLabel(st.rightCoef, st.edgeExp, 0))}); v sits at R/S = ${esc(fmtPos(st))} of it. Shadows M⁻/2S = ${esc(fmt(st.shadowL))}, M⁺/2S = ${esc(fmt(st.shadowR))}. Press Step for the first digit.`);
    } else {
            out.push(`Digit ${st.j}: 10·R/S splits into U = <strong>${st.U}</strong> and the new remainder R/S = ${esc(fmtPos(st))} (the dot). Shadows ×10: ${esc(fmt(st.shadowL))} and ${esc(fmt(st.shadowR))}.`);
      // Exact comparisons (in integers) decide the symbol; the decimals are rounded for display.
      const cmp = (a, b) => (a < b ? "<" : a > b ? ">" : "=");
      const opL = cmp(2n * st.R, st.Mm);
      const opR = cmp(2n * (r.S - st.R), st.Mp);
      const lowTxt = `low ${st.low ? "ON" : "off"} (dot ${esc(fmtPos(st))} ${opL} ${esc(fmt(st.shadowL))})`;
      const highTxt = `high ${st.high ? "ON" : "off"} (1 − dot = ${esc(fmt(st.distR))} ${opR} ${esc(fmt(st.shadowR))})`;
      const tieNote = (opL === "=" || opR === "=") ? `An exact tie with a shadow edge counts ${r.inclusive ? "(inclusive mode)" : "only in inclusive mode; strict Dragon4 treats it as outside"}.` : "";
      out.push(`${lowTxt}; ${highTxt}.`);
      if (tieNote) out.push(tieNote);
      if (!st.final) out.push(`Neither edge is inside the rounding interval yet: emit ${st.U} and zoom in.`);
      else {
        const why = st.choice === "low" ? `Only low: keep U = ${st.U}.`
          : st.choice === "high" ? `Only high: the last digit becomes U + 1 = ${st.out}.`
            : st.choice === "nearer-low" ? `Both: the dot is left of the centre (2R < S), keep U = ${st.U}.`
              : st.choice === "nearer-high" ? `Both: the dot is right of the centre (2R > S), take U + 1 = ${st.out}.`
                : `Both, and the dot is exactly on the centre: take the even digit ${st.out}.`;
        out.push(`${why} Output <strong>${esc(r.text)}</strong>${this.kind === "double" ? ` · JavaScript prints ${esc(String(this.v.value))}${String(this.v.value) === r.text ? "" : " (differs: see “Strict or inclusive?”)"}` : ""}.`);
      }
    }
    if (this.preset && this.preset.note) out.push(`<span class="dragon-mask-presetnote">${esc(this.preset.note)}</span>`);
    this.q("readout").innerHTML = out.join(" ");
  }

  renderDrawer() {
    const st = this.states[this.j];
    const r = this.run;
    const ints = this.q("ints");
    if (this.kind === "toy") {
      const rows = [];
      rows.push(`<tr><td>setup</td><td></td><td></td><td>${this.states[0].R}</td><td>${r.S}</td><td>${this.states[0].Mm}</td><td>${this.states[0].Mp}</td><td></td><td></td></tr>`);
      for (let i = 1; i <= this.j; i++) {
        const s = this.states[i];
        const lt = r.inclusive ? "≤" : "<";
        const gt = r.inclusive ? "≥" : ">";
        rows.push(`<tr${i === this.j ? ' class="current"' : ""}><td>${i}</td><td>${s.tenR}</td><td><b>${s.U}</b></td><td>${s.R}</td><td>${r.S}</td><td>${s.Mm}</td><td>${s.Mp}</td>`
          + `<td class="${s.low ? "yes" : ""}">${2n * s.R} ${s.low ? lt : (r.inclusive ? ">" : "≥")} ${s.Mm}</td>`
          + `<td class="${s.high ? "yes" : ""}">${2n * s.R} ${s.high ? gt : (r.inclusive ? "<" : "≤")} ${2n * r.S - s.Mp}</td></tr>`);
      }
      ints.innerHTML = `<div class="table-scroll" tabindex="0"><table class="dragon-mask-ledger"><thead><tr><th>digit</th><th>10R</th><th>U</th><th>R</th><th>S</th><th>M⁻</th><th>M⁺</th><th>low: 2R vs M⁻</th><th>high: 2R vs 2S−M⁺</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
    } else {
      const row = (name, n, note = "") => `<div><dt>${name}</dt><dd><code>${groupDigits(n)}</code><small>${n.toString().length} digits, ${bitLength(n)} bits${note}</small></dd></div>`;
      const parts = [row("R", st.R), row("S", r.S, " (fixed during the digit loop)"), row("M⁻", st.Mm), row("M⁺", st.Mp)];
      if (st.j > 0) {
        parts.push(`<div><dt>low</dt><dd>2R ${st.low ? (r.inclusive ? "≤" : "<") : (r.inclusive ? ">" : "≥")} M⁻ → <b>${st.low ? "true" : "false"}</b></dd></div>`);
        parts.push(`<div><dt>high</dt><dd>2R ${st.high ? (r.inclusive ? "≥" : ">") : (r.inclusive ? "<" : "≤")} 2S − M⁺ → <b>${st.high ? "true" : "false"}</b></dd></div>`);
      }
      ints.innerHTML = `<dl class="dragon-mask-ints">${parts.join("")}</dl>`;
    }
    const code = this.q("code");
    const act = activeLines(st, r);
    code.innerHTML = codeLines(r.inclusive).map((l, i) => `<li${act.includes(i) ? ' class="active"' : ""}>${esc(l)}</li>`).join("");
  }

  togglePlay() {
    if (this.timer) { this.stop(); return; }
    if (this.j >= this.states.length - 1) this.setStep(0, false);
    const btn = this.q("play");
    btn.textContent = "Pause";
    btn.setAttribute("aria-pressed", "true");
    const tick = () => {
      if (this.j >= this.states.length - 1) { this.stop(); this.pushURL(); return; }
      this.setStep(this.j + 1, true);
      this.timer = setTimeout(tick, reduceMotion.matches ? 700 : 1300);
    };
    this.timer = setTimeout(tick, 150);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const btn = this.q("play");
    btn.textContent = "Play";
    btn.setAttribute("aria-pressed", "false");
  }

  pushURL() {
    const url = new URL(window.location.href);
    const pv = this.kind === "toy" ? "t" : "x";
    const ps = this.kind === "toy" ? "ts" : "step";
    url.searchParams.set(pv, this.inputText);
    url.searchParams.set(ps, String(this.j));
    if (this.kind === "double") {
      if (this.inclusive) url.searchParams.set("incl", "1");
      else url.searchParams.delete("incl");
    }
    window.history.replaceState(null, "", url);
  }

  initFromURL(params, defaults) {
    const pv = this.kind === "toy" ? "t" : "x";
    const ps = this.kind === "toy" ? "ts" : "step";
    if (this.kind === "double" && params.get("incl") === "1") {
      this.inclusive = true;
      this.q("inclusive").checked = true;
    }
    const text = params.get(pv);
    if (!(text && this.loadText(text))) this.loadPreset(defaults);
    const step = params.get(ps);
    this.setStep(step === "end" ? this.states.length - 1 : Number(step) || 0, false);
  }

  /** Load a number from a prose link. */
  show(text, step) {
    this.stop();
    if (this.loadText(text)) {
      this.setStep(step === "end" ? this.states.length - 1 : Number(step) || 0, false);
      this.pushURL();
    }
  }
}

// ------------------------------------------------------------------ boot

function boot() {
  const params = new URLSearchParams(window.location.search);
  const toyRoot = document.getElementById("toy-explorer");
  const raceRoot = document.getElementById("race-explorer");
  const toy = toyRoot ? new MaskExplorer(toyRoot, "toy") : null;
  const race = raceRoot ? new MaskExplorer(raceRoot, "double") : null;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if ((window.innerWidth < 700) === (lastWidth < 700)) return;
    lastWidth = window.innerWidth;
    for (const x of [toy, race]) if (x) x.setStep(x.j, false);
  });
  if (toy) toy.initFromURL(params, TOY_PRESETS[0]);
  if (race) race.initFromURL(params, DOUBLE_PRESETS[1]);
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[data-mask-load]");
    if (!a) return;
    const target = a.dataset.maskTarget === "toy" ? toy : race;
    if (!target) return;
    ev.preventDefault();
    if (target === race && a.dataset.maskIncl !== undefined) {
      race.inclusive = a.dataset.maskIncl === "1";
      race.q("inclusive").checked = race.inclusive;
    }
    target.show(a.dataset.maskLoad, a.dataset.maskStep);
    target.root.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
  });
}

boot();
