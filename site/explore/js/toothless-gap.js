// Copyright (C) 2026 Toit contributors.
// DOM and interaction for explore/toothless-gap.html. All numbers come from
// toothless-gap-model.js (exact integer arithmetic).

import * as M from "./toothless-gap-model.js";

const SVGNS = "http://www.w3.org/2000/svg";
const ALPHA = M.toyAlpha(6); // 8192 / 15625
const HORIZON6 = 8130; // largest question denominator put to entry 6 (verified by the node test)
const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// helpers

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) e.append(kid);
  return e;
}
function s(tag, attrs = {}, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
const fmt = (n) => Number(n).toLocaleString("en-US");
const frac = (n, d) => `${fmt(n)}/${fmt(d)}`;
const dec = (n, d, digits = 8) => (n / d).toFixed(digits);
const pow2 = (e) => `2<sup>${e < 0 ? "−" + -e : e}</sup>`;
const floatHtml = (f, e) => `${f} · ${pow2(e)}`;
const floatText = (f, e) => `${f}·2^${e}`;
function outString(o) { return o ? M.formatDec(o.D, o.x) : "(no output)"; }

const params = new URLSearchParams(location.search);
const state = {
  card: clampInt(params.get("card"), 5, 14, 8),
  b: clampInt(params.get("b"), 4, 14, 8),
  x: [1000, 20000, 100000].includes(+params.get("x")) ? +params.get("x") : 1000,
  sb: clampInt(params.get("sb"), 4, 13, 8),
  lab: clampInt(params.get("lab"), 2, 18, 9),
  cell: parseCell(params.get("cell")),
};
function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function parseCell(v) {
  if (!v) return null;
  const m = /^(\d+),(-?\d+)$/.exec(v);
  if (!m) return null;
  const f = +m[1], e = +m[2];
  if (f < M.TOY.fMin || f > M.TOY.fMax || e < M.TOY.eMin || e > M.TOY.eMax) return null;
  return { f, e };
}
function saveState() {
  const p = new URLSearchParams();
  p.set("card", state.card); p.set("b", state.b); p.set("x", state.x); p.set("sb", state.sb); p.set("lab", state.lab);
  if (state.cell) p.set("cell", `${state.cell.f},${state.cell.e}`);
  history.replaceState(null, "", `${location.pathname}?${p}${location.hash}`);
}

function setupCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim() || "#000";

function showTip(tip, box, px, py, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const bw = box.clientWidth;
  const tw = tip.offsetWidth;
  let left = px + 12;
  if (left + tw > bw) left = Math.max(0, px - tw - 12);
  tip.style.left = left + "px";
  tip.style.top = Math.max(0, py - tip.offsetHeight - 8) + "px";
}

/** viewBox width: 720 on wide screens, 400 on phones (so text stays legible). */
function narrowW(box) { return box.clientWidth && box.clientWidth < 560 ? 400 : 720; }

// ---------------------------------------------------------------------------
// 1. Number line around 183 * 2^-18

function drawLine() {
  const box = $("tgap-line-svg");
  const W = narrowW(box), H = 190;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}` });
  // main scale: significand units of 2^-18, from 181.6 to 184.6
  const lo = 181.6, hi = 184.6, L = 40, R = W - 40;
  const X = (u) => L + ((u - lo) / (hi - lo)) * (R - L);
  svg.append(s("line", { x1: L, y1: 60, x2: R, y2: 60, stroke: css("--ink"), "stroke-opacity": .4 }));
  for (const f of [182, 183, 184]) {
    svg.append(s("circle", { cx: X(f), cy: 60, r: 5, fill: css("--blue") }));
    svg.append(s("text", { x: X(f), y: 44, "text-anchor": "middle", fill: css("--blue") }, `${f}·2⁻¹⁸`));
  }
  for (const m of [182.5, 183.5]) {
    svg.append(s("line", { x1: X(m), y1: 50, x2: X(m), y2: 72, stroke: css("--ink"), "stroke-dasharray": "3 3" }));
  }
  svg.append(s("text", { x: X(183.5), y: 88, "text-anchor": "middle" }, "m⁺ = 367·2⁻¹⁹"));
  // 0.0007 = 183.5008 units (0.0007 * 2^18 = 183.5008)
  const u7 = 0.0007 * 262144;
  svg.append(s("line", { x1: X(u7), y1: 56, x2: X(u7), y2: 64, stroke: css("--red"), "stroke-width": 2 }));
  // inset: magnify +-6e-9 around m+ (in value); m+ = 0.0006999969482421875
  const mPlus = 367 / 524288; // exact in binary
  const d = 0.0007 - mPlus; // 3.0517578125e-9 (exact: 0.0007 is not, but the label uses the exact value)
  const iL = W * 0.2, iR = W * 0.8, iy = 150;
  const span = 8e-9;
  const IX = (v) => iL + ((v - (mPlus - span / 2)) / span) * (iR - iL);
  svg.append(s("rect", { x: iL - 10, y: 112, width: iR - iL + 20, height: 66, fill: css("--paper"), stroke: css("--line") }));
  svg.append(s("line", { x1: X(183.5) - 6, y1: 74, x2: iL - 10, y2: 112, stroke: css("--line") }));
  svg.append(s("line", { x1: X(183.5) + 6, y1: 74, x2: iR + 10, y2: 112, stroke: css("--line") }));
  svg.append(s("line", { x1: iL, y1: iy, x2: iR, y2: iy, stroke: css("--ink"), "stroke-opacity": .4 }));
  svg.append(s("line", { x1: IX(mPlus), y1: iy - 14, x2: IX(mPlus), y2: iy + 10, stroke: css("--ink"), "stroke-dasharray": "3 3" }));
  svg.append(s("text", { x: IX(mPlus) - 4, y: iy + 22, "text-anchor": "end" }, "m⁺"));
  svg.append(s("line", { x1: IX(mPlus + d), y1: iy - 12, x2: IX(mPlus + d), y2: iy + 8, stroke: css("--red"), "stroke-width": 2 }));
  svg.append(s("text", { x: IX(mPlus + d) + 4, y: iy + 22, fill: css("--red") }, "0.0007"));
  svg.append(s("text", { x: (IX(mPlus) + IX(mPlus + d)) / 2, y: iy - 18, "text-anchor": "middle" }, "3.05·10⁻⁹"));
  const mag = ((iR - iL) / span) / ((R - L) / ((hi - lo) / 262144));
  svg.append(s("text", { x: iL - 4, y: 124, fill: css("--muted") }, `inset ×${fmt(Math.round(mag))}`));
  svg.append(s("text", { x: X(u7), y: 20, "text-anchor": "middle", fill: css("--red") }, "0.0007"));
  svg.append(s("line", { x1: X(u7), y1: 24, x2: X(u7), y2: 54, stroke: css("--red"), "stroke-opacity": .5 }));
  box.replaceChildren(svg);
}

// ---------------------------------------------------------------------------
// 2. The 0.0007 question card

const CARD_BUDGETS = [5, 6, 7, 8, 9, 10, 13, 14];
function drawCard() {
  const chips = $("tgap-card-chips");
  chips.replaceChildren(...CARD_BUDGETS.map((B) => h("button", {
    type: "button", "aria-pressed": String(B === state.card),
    onclick: () => { state.card = B; saveState(); drawCard(); },
  }, `B = ${B}`)));
  const B = state.card;
  const ent = M.toyEntry(6, B);
  const cache = M.toyCache(B);
  const run = (f) => { const r = M.toyToothless(f, -18, cache); return r.ok ? M.normalizeDec(r.D, r.x) : null; };
  const o183 = run(183), o184 = run(184);
  const r183 = M.toyReference(183, -18), r184 = M.toyReference(184, -18);
  const same = (a, b) => a && a.D === b.D && a.x === b.x;
  const body = $("tgap-card-body");
  const truthYes = 367 * ALPHA.d >= 700 * ALPHA.n; // false
  const side = ent.exact ? "exact: α itself" : ent.higher ? "higher than α" : "lower than α";
  let answerHtml;
  if (ent.exact) {
    answerHtml = `stand-in = α, so the answer is the true one: <span class="tgap-ok">no</span>`;
  } else {
    const lhs = 367 * ent.den, rhs = 700 * ent.num;
    const sign = Math.sign(lhs - rhs);
    const yes = sign > 0 || (sign === 0 && ent.higher === 1);
    const ok = yes === truthYes;
    answerHtml = `367 × ${fmt(ent.den)} = ${fmt(lhs)} ${sign > 0 ? "&gt;" : sign < 0 ? "&lt;" : "="} 700 × ${fmt(ent.num)} = ${fmt(rhs)}
      → 367/700 is ${sign > 0 ? "above" : sign < 0 ? "below" : "on"} the stand-in → answer <span class="${ok ? "tgap-ok" : "tgap-bad"}">${yes ? "yes, 0.0007 fits" : "no"}</span>
      ${ok ? "(the true answer)" : "(the true answer is no)"}`;
  }
  const intr = M.toyFirstIntruder(6, B);
  let gapHtml;
  if (!intr) gapHtml = "no gap: 15625 &lt; 2<sup>14</sup>, so the table stores α itself";
  else {
    const qIn = Math.sign(367 * ALPHA.d - 700 * ALPHA.n) !== Math.sign(367 * ent.den - 700 * ent.num);
    gapHtml = `first fraction inside: <b>${frac(intr[0], intr[1])}</b>; 367/700 is ${qIn ? '<span class="tgap-bad">inside the gap</span>' : "outside the gap"}`;
  }
  const outLine = (f, o, r) => {
    if (same(o, r)) return `<span class="tgap-ok">${outString(o)}</span> ✓`;
    let why = `should be ${outString(r)}`;
    if (o) {
      const back = M.toyReadBackAs(o.D, o.x);
      if (back && (back.f !== f || back.e !== -18)) why = `reads back as ${floatHtml(back.f, back.e)}; ${why}`;
    }
    return `<span class="tgap-bad">${outString(o)}</span> ✗ (${why})`;
  };
  body.innerHTML = `<dl>
    <dt>stand-in</dt><dd>${frac(ent.num, ent.den)} = ${dec(ent.num, ent.den)} (${side}; α = 0.52428800)</dd>
    <dt>question</dt><dd>${answerHtml}</dd>
    <dt>gap</dt><dd>${gapHtml}</dd>
    <dt>183 · 2<sup>−18</sup></dt><dd>prints ${outLine(183, o183, r183)}</dd>
    <dt>184 · 2<sup>−18</sup></dt><dd>prints ${outLine(184, o184, r184)}</dd>
  </dl>`;
}

// ---------------------------------------------------------------------------
// 3. The sheared wedge

const WINDOWS = [1000, 20000, 100000];
let wedgePoints = [];
let wedgeGeom = null;

/** Questions put to entry 6 in the "small numbers" orientation at budget B. */
function entry6Questions(B) {
  const cache = M.toyCache(B), exact = M.toyCache(Infinity);
  const map = new Map();
  for (let e = -18; e <= -15; e++) {
    for (let f = M.TOY.fMin; f <= M.TOY.fMax; f++) {
      const r = M.toyToothless(f, e, cache);
      if (r.entryK !== 6 || !r.inverted) continue;
      const cul = M.findCulprit(r, M.toyToothless(f, e, exact));
      const add = (x, y, kind, wrong) => {
        if (x <= 0) return;
        const key = `${x},${y}`;
        const who = { f, e, kind, wrong };
        if (!map.has(key)) map.set(key, { x, y, who: [who], wrong });
        else { const m = map.get(key); m.who.push(who); m.wrong ||= wrong; }
      };
      // decimal side X, binary side Y
      r.questions.forEach((q) => add(q.X, q.Y, q.kind, false));
      if (cul && cul.type === "gap") add(cul.Q, cul.P, cul.kind, true);
    }
  }
  return [...map.values()];
}

const KIND_TEXT = {
  floor: "top digits: does this candidate fit below m⁺?",
  stop: "stop test: has the prefix reached m⁻?",
  above: "is the output above v?",
  round: "rounding: is the lower candidate closer?",
  tie: "tie check: exactly halfway?",
  fix: "power-of-two fix-up: below m⁻?",
};

function drawWedge() {
  $("tgap-wedge-b").value = state.b;
  $("tgap-wedge-b-out").value = state.b;
  $("tgap-wedge-win").replaceChildren(...WINDOWS.map((w) => h("button", {
    type: "button", "aria-pressed": String(w === state.x),
    onclick: () => { state.x = w; saveState(); drawWedge(); },
  }, `0 – ${fmt(w)}`)));

  const B = state.b, xmax = state.x;
  const ent = M.toyEntry(6, B);
  const { n: an, d: ad } = ALPHA;
  const slope = ent.num / ent.den - an / ad; // tilt of the stand-in in the sheared view
  const box = $("tgap-wedge-box");
  const canvas = $("tgap-wedge-canvas");
  const W = Math.max(300, box.clientWidth), H = W < 520 ? 260 : 340;
  const ctx = setupCanvas(canvas, W, H);
  const padL = 58, padR = 14, padT = 16, padB = 34;
  const pw = W - padL - padR, ph = H - padT - padB, mid = padT + ph / 2;
  let hh = ent.exact ? 0.5 : Math.min(0.5, Math.max(1e-6, Math.abs(slope) * xmax * 1.3));
  const PX = (x) => padL + (x / xmax) * pw;
  const PY = (off) => mid - (off / hh) * (ph / 2);
  wedgeGeom = { PX, PY, hh };

  ctx.clearRect(0, 0, W, H);
  ctx.font = `11px ${css("--mono")}`;
  // frame
  ctx.strokeStyle = css("--line"); ctx.lineWidth = 1;
  ctx.strokeRect(padL + .5, padT + .5, pw, ph);
  // wedge
  if (!ent.exact) {
    ctx.fillStyle = "rgba(239, 75, 53, .16)";
    ctx.beginPath(); ctx.moveTo(PX(0), mid); ctx.lineTo(PX(xmax), PY(slope * xmax)); ctx.lineTo(PX(xmax), mid); ctx.closePath(); ctx.fill();
  }
  // horizon
  const horizonVisible = HORIZON6 <= xmax;
  if (horizonVisible) {
    ctx.save(); ctx.strokeStyle = css("--tgap-good"); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PX(HORIZON6) + .5, padT); ctx.lineTo(PX(HORIZON6) + .5, padT + ph); ctx.stroke(); ctx.restore();
    ctx.fillStyle = css("--tgap-good"); ctx.textAlign = PX(HORIZON6) > padL + pw - 120 ? "right" : "left";
    ctx.fillText("question horizon 8,130", PX(HORIZON6) + (ctx.textAlign === "right" ? -5 : 5), padT + 13);
  } else {
    ctx.fillStyle = css("--tgap-good"); ctx.textAlign = "right";
    ctx.fillText("question horizon 8,130 →", padL + pw - 4, padT + 13);
  }
  // lattice points: for each x the nearest y
  wedgePoints = [];
  const inked = [];
  let firstIn = null;
  for (let x = 1; x <= xmax; x++) {
    const y = Math.floor((2 * x * an + ad) / (2 * ad));
    const num = y * ad - x * an; // (y - alpha x) * ad
    const off = num / ad;
    if (Math.abs(off) > hh) continue;
    const sA = Math.sign(num), sS = Math.sign(y * ent.den - x * ent.num);
    const inGap = !ent.exact && sA !== 0 && sS !== 0 && sA !== sS;
    const onStand = !ent.exact && sS === 0;
    const p = { x, y, off, inGap, onStand };
    if (inGap && !firstIn) firstIn = p;
    wedgePoints.push(p);
    if (!inGap && !onStand) inked.push(p);
  }
  // ordinary points: tiny grey
  ctx.fillStyle = "rgba(20, 32, 43, .45)";
  const r0 = inked.length > 4000 ? 0.9 : 1.6;
  for (const p of inked) { ctx.beginPath(); ctx.arc(PX(p.x), PY(p.off), r0, 0, 7); ctx.fill(); }
  // true ray and stand-in ray
  ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PX(0), mid); ctx.lineTo(PX(xmax), mid); ctx.stroke();
  if (!ent.exact) {
    ctx.strokeStyle = css("--blue"); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PX(0), mid); ctx.lineTo(PX(xmax), PY(slope * xmax)); ctx.stroke();
  }
  // points on the stand-in line (multiples of the stand-in): decided by the tag
  for (const p of wedgePoints) {
    if (!p.onStand) continue;
    ctx.fillStyle = css("--paper"); ctx.strokeStyle = css("--blue"); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(PX(p.x), PY(p.off), 3, 0, 7); ctx.fill(); ctx.stroke();
  }
  // intruders
  ctx.fillStyle = css("--red");
  const nIn = wedgePoints.filter((p) => p.inGap).length;
  const rIn = nIn > 400 ? 1.4 : 3.2;
  for (const p of wedgePoints) if (p.inGap) { ctx.beginPath(); ctx.arc(PX(p.x), PY(p.off), rIn, 0, 7); ctx.fill(); }
  // questions asked
  const qs = entry6Questions(B);
  let qInView = 0, qWrong = [];
  for (const q of qs) {
    const off = (q.y * ad - q.x * an) / ad;
    if (q.x > xmax || Math.abs(off) > hh) continue;
    qInView++;
    const px = PX(q.x), py = PY(off);
    ctx.strokeStyle = q.wrong ? css("--red") : css("--ink"); ctx.lineWidth = q.wrong ? 2.2 : 1.3;
    const r = q.wrong ? 6 : 4;
    ctx.beginPath(); ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r); ctx.moveTo(px - r, py + r); ctx.lineTo(px + r, py - r); ctx.stroke();
    wedgePoints.push({ x: q.x, y: q.y, off, question: q, inGap: q.wrong });
    if (q.wrong) qWrong.push(q);
  }
  for (const q of qs) if (q.wrong && !qWrong.includes(q)) qWrong.push(q);
  // first intruder ring + label
  const intr = M.toyFirstIntruder(6, B);
  if (intr && intr[1] <= xmax) {
    const off = (intr[0] * ad - intr[1] * an) / ad;
    const px = PX(intr[1]), py = PY(off);
    ctx.strokeStyle = css("--red"); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 8, 0, 7); ctx.stroke();
    const lab = `first intruder ${frac(intr[0], intr[1])}`;
    ctx.fillStyle = css("--ink"); ctx.textAlign = px + 10 + ctx.measureText(lab).width > padL + pw ? "right" : "left";
    const ty = py + (off * slope > 0 || slope === 0 ? 20 : -12);
    const tx = px + (ctx.textAlign === "right" ? -10 : 10), tyc = Math.min(padT + ph - 4, Math.max(padT + 26, ty));
    ctx.save(); ctx.strokeStyle = css("--paper"); ctx.lineWidth = 4; ctx.lineJoin = "round"; ctx.strokeText(lab, tx, tyc); ctx.restore();
    ctx.fillText(lab, tx, tyc);
  }
  // axes labels
  ctx.fillStyle = css("--muted"); ctx.textAlign = "center";
  for (let i = 0; i <= 4; i++) {
    const x = (xmax / 4) * i;
    ctx.fillText(fmt(x), PX(x), padT + ph + 14);
  }
  ctx.fillText("x = decimal-side integer (the question's denominator)", padL + pw / 2, padT + ph + 29);
  ctx.textAlign = "right";
  const hl = fmtSmall(hh);
  ctx.fillText(`+${hl}`, padL - 5, padT + 10);
  ctx.fillText("0", padL - 5, mid + 4);
  ctx.fillText(`−${hl}`, padL - 5, padT + ph - 2);
  ctx.save(); ctx.translate(12, mid); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center";
  ctx.fillText("y − α·x", 0, 0); ctx.restore();

  // readout
  const magn = ((ph / 2) / hh) / (pw / xmax);
  const ro = $("tgap-wedge-readout");
  let html = `<p>B = ${B}: `;
  if (ent.exact) {
    html += `the denominator 15625 fits below 2<sup>${B}</sup>, so the entry is α itself. <span class="tgap-badge tgap-badge-exact">no gap</span></p>`;
  } else {
    const rel = Math.abs(slope) / (an / ad);
    html += `stand-in <strong>${frac(ent.num, ent.den)}</strong>, ${ent.higher ? "higher" : "lower"} than α by ${rel.toExponential(2)} (relative).</p>`;
    html += `<p>Gap clean up to denominator <strong>${fmt(intr[1] - 1)}</strong> (first intruder ${frac(intr[0], intr[1])}); question horizon ${fmt(HORIZON6)}. `;
    html += intr[1] > HORIZON6
      ? `<span class="tgap-badge tgap-badge-good">clean beyond the horizon</span> No question put to this entry can get a wrong answer.`
      : `<span class="tgap-badge tgap-badge-bad">intruders below the horizon</span> Some possible question could get a wrong answer.`;
    html += "</p>";
    const farey = ent.bracket;
    html += `<p>Bracket at this budget: ${frac(...farey.left)} &lt; α &lt; ${frac(...farey.right)}, so by the lemma anything in the gap has a denominator ≥ ${fmt(farey.left[1] + farey.right[1])}.</p>`;
  }
  if (qWrong.length) {
    const ws = qWrong.flatMap((q) => q.who.filter((w) => w.wrong).map((w) => ({ w, q })));
    const show = ws.slice(0, 4).map(({ w, q }) => `${frac(q.y, q.x)} (asked by ${floatHtml(w.f, w.e)})`).join(", ");
    html += `<p>Questions that toy floats actually get a wrong answer to at this budget (red crosses): ${fmt(qWrong.length)} distinct fractions, hit by ${fmt(ws.length)} float${ws.length > 1 ? "s" : ""}${ws.length > 4 ? ", for example" : ":"} ${show}${ws.length > 4 ? ", …" : ""}. Not every wrong answer spoils the final output.</p>`;
  }
  html += `<p class="tgap-small">Shown: ${fmt(qInView)} of ${fmt(qs.length)} distinct questions (the rest lie outside the vertical window). Vertical scale: ±${hl} binary units, stretched ×${magn >= 100 ? fmt(Math.round(magn)) : magn.toFixed(1)} against the horizontal axis.</p>`;
  ro.innerHTML = html;
}
function fmtSmall(v) {
  if (v >= 0.01) return v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return v.toExponential(1).replace("e-", "e−");
}

function wedgeHover(ev) {
  const box = $("tgap-wedge-box"), tip = $("tgap-wedge-tip");
  if (!wedgeGeom) return;
  const rect = $("tgap-wedge-canvas").getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  let best = null, bd = 100;
  for (const p of wedgePoints) {
    const dx = wedgeGeom.PX(p.x) - mx, dy = wedgeGeom.PY(p.off) - my;
    const d = dx * dx + dy * dy;
    if (d < bd || (d === bd && p.question)) { bd = d; best = p; }
  }
  if (!best) { tip.hidden = true; return; }
  let html = `y/x = ${frac(best.y, best.x)}<br>y − α·x = ${best.off >= 0 ? "+" : "−"}${Math.abs(best.off).toExponential(3)}`;
  if (best.onStand) html += "<br>exactly on the stand-in: the tag decides";
  else if (best.inGap) html += `<br><b class="tgap-bad">inside the gap</b>`;
  if (best.question) {
    const who = best.question.who.slice(0, 3).map((w) => `${floatHtml(w.f, w.e)}: ${KIND_TEXT[w.kind]}`).join("<br>");
    html += `<br>asked by ${best.question.who.length} float${best.question.who.length > 1 ? "s" : ""}:<br>${who}${best.question.who.length > 3 ? "<br>…" : ""}`;
  }
  showTip(tip, box, mx, my, html);
}

// ---------------------------------------------------------------------------
// 4. Stern–Brocot walk

let sbStep = 0, sbTimer = null;
function sbData() { return M.sternBrocot(ALPHA.n, ALPHA.d, 2 ** state.sb); }
function sbBracketAt(steps, i) {
  let a = 0, b = 1, c = 1, d = 0;
  for (let j = 0; j < i; j++) {
    const st = steps[j];
    if (st.dir === "R") [a, b] = st.mediant;
    else if (st.dir === "L") [c, d] = st.mediant;
    else { [a, b] = st.mediant; [c, d] = st.mediant; }
  }
  return { a, b, c, d };
}
function drawSB() {
  const sel = $("tgap-sb-b");
  if (!sel.options.length) {
    for (let B = 4; B <= 13; B++) sel.append(h("option", { value: B }, `${B} (den < ${fmt(2 ** B)})`));
  }
  sel.value = state.sb;
  const data = sbData();
  const steps = data.steps;
  if (sbStep > steps.length) sbStep = steps.length;
  const { a, b, c, d } = sbBracketAt(steps, sbStep);
  const done = sbStep === steps.length;
  const next = done ? data.next : [a + c, b + d];
  $("tgap-sb-step").disabled = done;
  $("tgap-sb-run").disabled = done;
  // number line zoomed to the bracket
  const W = narrowW($("tgap-sb-svg")), H = 120, L = 40, R = W - 40;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}` });
  const lo = a / b, hi = d === 0 ? 2 : c / d;
  const X = (v) => L + ((v - lo) / (hi - lo)) * (R - L);
  svg.append(s("line", { x1: L, y1: 60, x2: R, y2: 60, stroke: css("--ink"), "stroke-opacity": .5 }));
  const tick = (v, label, color, y, anchor = "middle") => {
    svg.append(s("line", { x1: X(v), y1: 50, x2: X(v), y2: 70, stroke: color, "stroke-width": 2 }));
    svg.append(s("text", { x: X(v), y, "text-anchor": anchor, fill: color }, label));
  };
  tick(lo, `${a}/${b}`, css("--blue"), 90, "start");
  tick(hi, d === 0 ? "1/0 (∞)" : `${c}/${d}`, css("--blue"), 90, "end");
  const av = ALPHA.n / ALPHA.d;
  if (a !== c || b !== d) {
    svg.append(s("circle", { cx: X(av), cy: 60, r: 5, fill: css("--ink") }));
    svg.append(s("text", { x: X(av), y: 40, "text-anchor": "middle" }, "α"));
  }
  if (next && next[1] > 0) {
    const mv = next[0] / next[1];
    if (mv >= lo && mv <= hi) {
      svg.append(s("line", { x1: X(mv), y1: 54, x2: X(mv), y2: 66, stroke: css("--red"), "stroke-width": 2, "stroke-dasharray": done ? "2 2" : "none" }));
      svg.append(s("text", { x: X(mv), y: 108, "text-anchor": "middle", fill: css("--red") }, `${done ? "next mediant (too big) " : "mediant "}${next[0]}/${next[1]}`));
    }
  }
  svg.append(s("text", { x: W / 2, y: 16, "text-anchor": "middle", fill: css("--muted") }, `zoomed to the bracket: width ${(hi - lo).toExponential(2)}`));
  $("tgap-sb-svg").replaceChildren(svg);
  // readout: path with runs
  const runs = M.runsOf(steps.slice(0, sbStep));
  const pathHtml = runs.map((r, i) => `<span class="${i % 2 ? "tgap-run-b" : "tgap-run-a"}">${r.dir.repeat(r.n)}</span>`).join("");
  let html = `<p>Step ${sbStep} of ${steps.length}. Path: <span class="tgap-path">${pathHtml || "—"}</span></p>`;
  html += `<p>Runs so far: [${runs.map((r) => r.n).join(", ")}]. The terms of α are [0; 1, 1, 9, 1, 3, 1, 5, 26].</p>`;
  html += `<p>Bracket ${a}/${b} &lt; α &lt; ${d === 0 ? "1/0" : `${c}/${d}`}; b·c − a·d = ${b} · ${c} − ${a} · ${d} = <strong>${b * c - a * d}</strong>.</p>`;
  if (done) {
    const ent = M.toyEntry(6, state.sb);
    if (ent.exact) html += `<p>The walk reached α = 8192/15625 itself: its denominator fits the budget.</p>`;
    else html += `<p>The next mediant ${next[0]}/${next[1]} has denominator ${fmt(next[1])} ≥ 2<sup>${state.sb}</sup> = ${fmt(2 ** state.sb)}, so the walk stops. Nothing strictly inside the bracket has a denominator below ${fmt(b + d)}. The table stores the closer end, <strong>${ent.num}/${ent.den}</strong> (${ent.higher ? "higher" : "lower"}).</p>`;
  }
  $("tgap-sb-readout").innerHTML = html;
}
function sbStop() { if (sbTimer) { clearInterval(sbTimer); sbTimer = null; } }

// ---------------------------------------------------------------------------
// 5. The toy lab

const refs = M.toyReferences();
const sweeps = new Map();
function sweep(B) {
  if (!sweeps.has(B)) sweeps.set(B, M.toySweep(B, refs));
  return sweeps.get(B);
}
const ROWS = M.TOY.eMax - M.TOY.eMin + 1, COLS = M.TOY.fMax - M.TOY.fMin + 1;
let labGeom = null;
function bandOf(sw) { return sw.wrong > 0 ? "broken" : sw.guaranteed ? "guaranteed" : "lucky"; }

function drawBands() {
  const box = $("tgap-lab-bands");
  const kids = [];
  for (let B = 2; B <= 18; B++) {
    const sw = sweeps.get(B);
    const cls = sw ? `tgap-band tgap-${bandOf(sw)}` : "tgap-band";
    kids.push(h("button", {
      type: "button", class: cls, tabindex: "-1", "aria-current": String(B === state.lab),
      title: sw ? `B = ${B}: ${sw.wrong} wrong, ${bandOf(sw)}` : `B = ${B}`,
      onclick: () => { state.lab = B; state.cell = null; saveState(); drawLab(); },
    }, h("b", {}, String(B)), sw ? String(sw.wrong) : "…"));
  }
  box.replaceChildren(...kids);
}

function drawLab() {
  $("tgap-lab-b").value = state.lab;
  $("tgap-lab-b-out").value = state.lab;
  const sw = sweep(state.lab);
  drawBands();
  const box = $("tgap-lab-box"), canvas = $("tgap-lab-canvas");
  const avail = Math.max(260, box.clientWidth);
  const cw = Math.max(2, Math.min(7, Math.floor(avail / COLS)));
  const ch = Math.max(4, cw);
  const W = cw * COLS, H = ch * ROWS;
  canvas.style.width = W + "px";
  const ctx = setupCanvas(canvas, W, H);
  labGeom = { cw, ch };
  const colOk = css("--paper-deep"), colBad = css("--red"), colTie = css("--ink");
  for (const c of sw.cells) {
    const col = c.f - M.TOY.fMin, row = M.TOY.eMax - c.e;
    ctx.fillStyle = c.correct ? colOk : c.status === "tie" ? colTie : colBad;
    ctx.fillRect(col * cw, row * ch, cw - (cw > 3 ? 1 : 0), ch - 1);
  }
  const nBad = sw.cells.filter((c) => !c.correct).length;
  if (nBad && nBad <= 60) {
    ctx.lineWidth = 1.5;
    for (const c of sw.cells) {
      if (c.correct) continue;
      const col = c.f - M.TOY.fMin, row = M.TOY.eMax - c.e;
      ctx.strokeStyle = c.status === "tie" ? colTie : colBad;
      ctx.strokeRect(col * cw - 3 * cw + .5, row * ch - 3 * ch + .5, 7 * cw - 1, 7 * ch - 1);
    }
  }
  if (state.cell) {
    const col = state.cell.f - M.TOY.fMin, row = M.TOY.eMax - state.cell.e;
    ctx.strokeStyle = css("--ink"); ctx.lineWidth = 2;
    ctx.fillStyle = css("--acid");
    ctx.fillRect(col * cw - 2, row * ch - 2, cw + 3, ch + 3);
    ctx.strokeRect(col * cw - 2, row * ch - 2, cw + 3, ch + 3);
  }
  // summary
  const band = bandOf(sw);
  const badge = band === "broken" ? "tgap-badge-bad" : band === "lucky" ? "tgap-badge-lucky" : "tgap-badge-good";
  const q = sw.cats;
  $("tgap-lab-summary").innerHTML = `B = ${state.lab}: <strong>${fmt(sw.wrong)}</strong> of 6,528 wrong` +
    (sw.wrong ? ` (${fmt(q.roundtrip)} read back as a different float or print nothing, ${fmt(q.long)} too long, ${fmt(q.closest)} not the closest; ${fmt(sw.ties)} of them tie cases)` : "") +
    `. <span class="tgap-badge ${badge}">${band}</span>` +
    (band === "lucky" ? " Some entry's gap still holds a fraction below 2<sup>14</sup>." : "");
  // failure list
  const fails = sw.cells.filter((c) => !c.correct);
  const list = $("tgap-lab-fails");
  const MAX = 24;
  const btns = fails.slice(0, MAX).map((c) => h("button", {
    type: "button", class: c.status === "tie" ? "tgap-tiebtn" : "",
    "aria-pressed": String(!!state.cell && state.cell.f === c.f && state.cell.e === c.e),
    onclick: () => { state.cell = { f: c.f, e: c.e }; saveState(); drawLab(); },
  }, `${c.f}·2^${c.e}`));
  if (fails.length > MAX) btns.push(h("span", {}, `… and ${fmt(fails.length - MAX)} more: click the red cells`));
  list.replaceChildren(...btns);
  drawLabCard(sw);
}

function cellAt(sw, f, e) { return sw.cells[(e - M.TOY.eMin) * COLS + (f - M.TOY.fMin)]; }

function drawLabCard(sw) {
  const card = $("tgap-lab-card");
  if (!state.cell) {
    card.innerHTML = sw.wrong ? "<p>Pick a red cell to see which question went wrong.</p>" : "<p>Every toy float prints its shortest, closest decimal at this budget.</p>";
    return;
  }
  const c = cellAt(sw, state.cell.f, state.cell.e);
  const { f, e } = c;
  let html = `<h4>${floatHtml(f, e)} = ${M.toyValueString(f, e)}</h4><dl>`;
  html += `<dt>correct output</dt><dd>${outString(c.want)}</dd>`;
  if (c.correct) {
    html += `<dt>toy output</dt><dd><span class="tgap-ok">${outString(c.got)}</span> ✓</dd></dl>`;
    card.innerHTML = html;
    return;
  }
  const catText = { roundtrip: "reads back as a different float", long: "reads back correctly, but is too long", closest: "right length, but not the closest" }[c.category];
  let back = "";
  if (c.got && c.category === "roundtrip") {
    const bk = M.toyReadBackAs(c.got.D, c.got.x);
    back = bk ? ` (it reads back as ${floatHtml(bk.f, bk.e)})` : "";
  }
  html += `<dt>toy output</dt><dd><span class="tgap-bad">${outString(c.got)}</span> ✗ ${catText}${back}</dd>`;
  const cu = c.culprit;
  if (cu) {
    const ent = M.toyEntry(cu.k, state.lab);
    const [sn, sd] = cu.standIn, [an, ad] = cu.alpha;
    html += `<dt>entry</dt><dd>k = ${cu.k}: α = 2<sup>${M.floorLog2Pow10(cu.k)}</sup>/10<sup>${cu.k}</sup> = ${frac(an, ad)}; stand-in ${frac(sn, sd)} (${ent.higher ? "higher" : "lower"})${c.run.inverted ? "; used upside down, as for all small numbers" : ""}</dd>`;
    html += `<dt>first wrong question</dt><dd>${KIND_TEXT[cu.kind]}</dd>`;
    const red = cu.reduced[0] !== cu.P ? ` = ${frac(...cu.reduced)}` : "";
    if (cu.type === "tie") {
      html += `<dt>its fraction</dt><dd>${frac(cu.P, cu.Q)}${red}: <b>exactly α</b>. The decimal lies exactly halfway, and the tag rule breaks the tie differently from round-half-even. In the real table α's denominator is 5<sup>k</sup> &gt; 2<sup>63</sup> for every inexact entry, so this cannot happen there.</dd>`;
    } else {
      const bsum = ent.bracket.left[1] + ent.bracket.right[1];
      html += `<dt>its fraction</dt><dd>${frac(cu.P, cu.Q)}${red}, strictly between the stand-in and α. Its denominator ${fmt(cu.reduced[1])} ≥ ${fmt(bsum)}, the lemma's bound for this bracket.</dd>`;
    }
    html += "</dl>";
    html += miniLine(sn / sd, an / ad, cu.P / cu.Q, cu);
  } else {
    html += "</dl>";
  }
  card.innerHTML = html;
}

function miniLine(sv, av, qv, cu) {
  const vals = [sv, av, qv];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.25 || Math.abs(av) * 1e-6;
  lo -= pad; hi += pad;
  const W = innerWidth < 560 ? 330 : 560, L = 20, R = W - 20;
  const X = (v) => L + ((v - lo) / (hi - lo)) * (R - L);
  const parts = [`<svg viewBox="0 0 ${W} 74" role="img" aria-label="stand-in, alpha and the culprit fraction on a number line">`,
    `<line x1="${L}" y1="36" x2="${R}" y2="36" stroke="${css("--ink")}" stroke-opacity=".4"/>`,
    `<rect x="${Math.min(X(sv), X(av))}" y="28" width="${Math.abs(X(av) - X(sv))}" height="16" fill="rgba(239,75,53,.16)"/>`];
  const mark = (v, color, label, y, anchor) => {
    parts.push(`<line x1="${X(v)}" y1="26" x2="${X(v)}" y2="46" stroke="${color}" stroke-width="2"/>`);
    parts.push(`<text x="${X(v)}" y="${y}" text-anchor="${anchor}" fill="${color}">${label}</text>`);
  };
  const aLeft = av < sv;
  mark(sv, css("--blue"), "stand-in", 62, aLeft ? "start" : "end");
  mark(av, css("--ink"), "α", 16, "middle");
  if (cu.type === "gap") mark(qv, css("--red"), `${cu.reduced[0]}/${cu.reduced[1]}`, 62, aLeft ? "end" : "start");
  parts.push("</svg>");
  return parts.join("");
}

function labPointer(ev, click) {
  if (!labGeom) return;
  const canvas = $("tgap-lab-canvas");
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const col = Math.floor(mx / labGeom.cw), row = Math.floor(my / labGeom.ch);
  const tip = $("tgap-lab-tip");
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) { tip.hidden = true; return; }
  const f = M.TOY.fMin + col, e = M.TOY.eMax - row;
  const sw = sweep(state.lab);
  const c = cellAt(sw, f, e);
  if (click) {
    state.cell = { f, e }; saveState(); drawLab(); tip.hidden = true; return;
  }
  const off = canvas.offsetLeft;
  showTip(tip, $("tgap-lab-box"), mx + off, my, `${floatHtml(f, e)}<br>${c.correct ? `prints ${outString(c.got)} ✓` : `prints ${outString(c.got)}, want ${outString(c.want)}${c.status === "tie" ? " (tie)" : ""}`}`);
}

function computeAllSweeps() {
  let B = 2;
  const next = () => {
    while (B <= 18 && sweeps.has(B)) B++;
    if (B > 18) { drawBands(); return; }
    sweep(B); B++;
    drawBands();
    setTimeout(next, 0);
  };
  setTimeout(next, 30);
}

// ---------------------------------------------------------------------------
// 6. Real table

function drawReal() {
  const rows = M.realTableFacts();
  const bits = M.realQuestionBits();
  const inex = rows.filter((r) => !r.exact);
  const W = narrowW($("tgap-real-svg")), H = W < 720 ? 340 : 300, L = 44, R = W - 10, T = 14, Bm = H - 36;
  const yLo = 57, yHi = 76;
  const X = (k) => L + ((k - 28) / (324 - 28)) * (R - L);
  const Y = (b) => Bm - ((b - yLo) / (yHi - yLo)) * (Bm - T);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}` });
  svg.append(s("rect", { x: L, y: Y(63), width: R - L, height: Y(59) - Y(63), fill: "rgba(29,127,74,.10)" }));
  for (let b = 58; b <= 76; b += 2) {
    svg.append(s("line", { x1: L, y1: Y(b), x2: R, y2: Y(b), stroke: css("--line"), "stroke-opacity": .5 }));
    svg.append(s("text", { x: L - 6, y: Y(b) + 4, "text-anchor": "end", fill: css("--muted") }, `2^${b}`));
  }
  svg.append(s("line", { x1: L, y1: Y(59), x2: R, y2: Y(59), stroke: css("--tgap-good"), "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
  svg.append(s("text", { x: R - 4, y: Y(59) + 14, "text-anchor": "end", fill: css("--tgap-good") }, W < 720 ? "questions < 2^59" : "question horizon: every question < 2^59"));
  svg.append(s("line", { x1: L, y1: Y(63), x2: R, y2: Y(63), stroke: css("--ink"), "stroke-width": 1 }));
  svg.append(s("text", { x: L + 6, y: Y(63) + 14 }, "2^63: the table's budget"));
  svg.append(s("text", { x: (L + R) / 2 + (W < 720 ? 40 : 0), y: Y(61) + 4, "text-anchor": "middle", fill: css("--tgap-good") }, "≈ 4 bits of headroom"));
  for (const k of W < 720 ? [28, 150, 300] : [28, 100, 200, 300]) {
    svg.append(s("text", { x: X(k), y: Bm + 16, "text-anchor": "middle", fill: css("--muted") }, `k = ${k}`));
  }
  for (const r of inex) {
    const c = s("circle", { cx: X(r.k), cy: Y(Math.min(yHi, r.gapDenLog2)), r: 2.6, fill: r.closest ? css("--blue") : css("--paper"), stroke: css("--blue"), "stroke-width": 1.2 });
    c.append(s("title", {}, `k = ${r.k}: stand-in ${r.lower ? "lower" : "higher"}; first intruder denominator 2^${r.gapDenLog2.toFixed(2)}, numerator 2^${r.gapNumLog2.toFixed(2)}; ${r.closest ? "closest 63-bit fraction" : "not the closest 63-bit fraction"}${r.draftBest ? "" : "; a closer fraction has a smaller denominator"}`));
    svg.append(c);
  }
  $("tgap-real-svg").replaceChildren(svg);
  const minDen = inex.reduce((m, r) => (r.gapDenLog2 < m.gapDenLog2 ? r : m));
  const minNum = inex.reduce((m, r) => (r.gapNumLog2 < m.gapNumLog2 ? r : m));
  const worst = inex.reduce((m, r) => (r.relErrLog2 > m.relErrLog2 ? r : m));
  const notClosest = inex.filter((r) => !r.closest).length;
  const notBest = inex.filter((r) => !r.draftBest).length;
  const allBracket = inex.every((r) => r.bracketEnd && r.fareyDet === 1n);
  const closeFails = rows.filter((r) => !r.closeEnough).map((r) => r.k);
  $("tgap-real-notclosest").textContent = notClosest;
  $("tgap-real-notbest").textContent = notBest;
  $("tgap-real-bits").innerHTML = `the shifted boundaries stay below 2<sup>${bits.boundary}</sup>, R below 2<sup>${bits.R}</sup>, and only the doubled rounding test needs ${bits.twice} bits (it stays below 2<sup>${bits.twice}</sup>)`;
  $("tgap-real-readout").innerHTML = `<p>${inex.length} inexact entries (${inex.filter((r) => r.lower).length} lower, ${inex.filter((r) => r.higher).length} higher; every tag matches the true side). ${allBracket ? "<strong>All</strong>" : "<strong>Not all</strong>"} are one end of the Farey bracket of α with denominators below 2<sup>63</sup> (b·c − a·d = 1 checked).</p>
    <p>Smallest intruder denominator: 2<sup>${minDen.gapDenLog2.toFixed(3)}</sup> (k = ${minDen.k}). Smallest intruder numerator: 2<sup>${minNum.gapNumLog2.toFixed(2)}</sup> (k = ${minNum.k}). Largest relative error of a stand-in: 2<sup>${worst.relErrLog2.toFixed(1)}</sup> (k = ${worst.k}).</p>
    <p>Not the closest 63-bit fraction: ${notClosest}. Beaten by a fraction with a smaller denominator: ${notBest}. The loop condition den + 2 ≤ 2·num and num + 2 ≤ 2·den fails only for k = ${closeFails.join(", ")} (1/1, exact).</p>`;
}

// ---------------------------------------------------------------------------
// wiring

function init() {
  drawLine();
  drawCard();
  drawWedge();
  drawSB();
  drawLab();

  $("tgap-wedge-b").addEventListener("input", (ev) => { state.b = +ev.target.value; saveState(); drawWedge(); });
  const wc = $("tgap-wedge-canvas");
  wc.addEventListener("pointermove", wedgeHover);
  wc.addEventListener("pointerdown", wedgeHover);
  wc.addEventListener("pointerleave", () => { $("tgap-wedge-tip").hidden = true; });

  $("tgap-sb-b").addEventListener("change", (ev) => { sbStop(); state.sb = +ev.target.value; sbStep = 0; saveState(); drawSB(); });
  $("tgap-sb-reset").addEventListener("click", () => { sbStop(); sbStep = 0; drawSB(); });
  $("tgap-sb-step").addEventListener("click", () => { sbStop(); sbStep++; drawSB(); });
  $("tgap-sb-run").addEventListener("click", () => {
    sbStop();
    const n = sbData().steps.length;
    if (reduceMotion) { sbStep = n; drawSB(); return; }
    sbTimer = setInterval(() => { sbStep++; drawSB(); if (sbStep >= n) sbStop(); }, 160);
  });

  $("tgap-lab-b").addEventListener("input", (ev) => { state.lab = +ev.target.value; state.cell = null; saveState(); drawLab(); });
  const lc = $("tgap-lab-canvas");
  lc.addEventListener("pointermove", (ev) => labPointer(ev, false));
  lc.addEventListener("click", (ev) => labPointer(ev, true));
  lc.addEventListener("pointerleave", () => { $("tgap-lab-tip").hidden = true; });

  // default: start the Stern–Brocot walk finished if deep-linked
  if (params.has("sb")) { sbStep = sbData().steps.length; drawSB(); }
  if (!state.cell) {
    const sw = sweep(state.lab);
    const first = sw.cells.find((c) => !c.correct && c.status === "gap");
    if (first && !params.has("lab")) { state.cell = { f: first.f, e: first.e }; drawLab(); }
  }

  let rt = null;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { drawWedge(); drawLab(); drawLine(); drawSB(); drawReal(); }, 120); });
  setTimeout(drawReal, 0);
  computeAllSweeps();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
