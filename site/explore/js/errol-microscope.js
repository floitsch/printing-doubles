// Copyright (C) 2026 Toit contributors.

// DOM code for the Errol "microscope" lab page: the zoomable number line,
// the double-double stepper ("loom") and the Errol3 router.

import {
  Q, qAdd, qSub, qMul, qDiv, qCmp, qAbs, qPow10, qOfDouble, qOfDD, qToNumber, qLog10, qDecimal,
  sigDigits, analyze, outputOf, computedBoundary, bandHalfWidth, verdict, judge, errolDD, route, outputText,
  bitPositions, cIntBug, INT_LOW, INT_HIGH,
} from "./errol-microscope-model.js";
import { formatDecimal } from "../../js/float.js";

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function syncUrl() {
  const q = params.toString();
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
}

function parseInput(text) {
  const t = String(text).trim().replace(/[−–]/g, "-").replace(/_/g, "");
  if (!/^[+]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return { error: "Type a positive decimal number, e.g. 0.1 or 4.0648030339495312e68." };
  const x = Number(t);
  if (!Number.isFinite(x)) return { error: "That is beyond the largest double." };
  if (x <= 0) return { error: "Errol’s code handles positive doubles only (it has no sign or zero handling). Enter a positive number." };
  return { x };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pretty = (s) => String(s).replace(/e\+?(-?)(\d+)$/, (_, m, d) => `e${m ? "-" : ""}${d}`);

// A number in compact scientific HTML: 6.4·10⁻¹⁷.
function sci(x, digits = 2) {
  if (x === 0) return "0";
  const neg = x < 0; const a = Math.abs(x);
  let body;
  if (a >= 1e-3 && a < 1e4) body = String(Number(a.toPrecision(digits)));
  else {
    const [m, e] = a.toExponential(digits - 1).split("e");
    body = `${m}·10<sup>${Number(e) < 0 ? "−" : ""}${Math.abs(Number(e))}</sup>`;
  }
  return (neg ? "−" : "") + body;
}
const ulps = (a, q) => qToNumber(qDiv(q, a.ulp));

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

// ===========================================================================
// 1. The microscope

const PRESETS = [
  ["safe", [["3.14", "3.14"], ["6.62607015e-34", "Planck 6.62607015e-34"]]],
  ["near miss", [["4.0648030339495312e68", "4.0648030339495312e68"], ["9.856469199218561e-57", "9.856469199218561e-57"], ["2.215901545757777e-196", "2.215901545757777e-196"]]],
  ["exact hit", [["2.345678901234567e16", "2.345678901234567e16"], ["23456789012345668", "23456789012345668"], ["1e23", "1e23"], ["1.0000000000000001e23", "1.0000000000000001e23"]]],
];

const scope = {
  x: 4.0648030339495312e68,
  text: "4.0648030339495312e68",
  z: 0,
  p: "106",
  e1: false,
  focus: null,
  a: null,
};

function initScope() {
  const holder = $("em-presets");
  for (const [group, items] of PRESETS) {
    const g = document.createElement("div");
    g.className = "em-preset-group";
    const lab = document.createElement("span");
    lab.className = `em-tag em-tag-${group === "safe" ? "safe" : group === "near miss" ? "near" : "hit"}`;
    lab.textContent = group;
    g.append(lab);
    const chips = document.createElement("div");
    chips.className = "lab-chips";
    for (const [value, label] of items) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.dataset.value = value;
      b.addEventListener("click", () => { $("em-x").value = value; loadScope(value, 0); });
      chips.append(b);
    }
    g.append(chips);
    holder.append(g);
  }
  $("em-form").addEventListener("submit", (e) => { e.preventDefault(); loadScope($("em-x").value, 0); });
  $("em-zoom").addEventListener("input", () => { scope.z = Number($("em-zoom").value); renderScope(); });
  $("em-zoom-in").addEventListener("click", () => setZoom(scope.z + 1));
  $("em-zoom-out-btn").addEventListener("click", () => setZoom(scope.z - 1));
  $("em-jump").addEventListener("click", jumpToGap);
  for (const r of document.querySelectorAll('input[name="em-p"]')) {
    r.addEventListener("change", () => { scope.p = r.value; renderScope(); });
  }
  $("em-e1").addEventListener("change", () => { scope.e1 = $("em-e1").checked; renderScope(); });
  $("em-focus-lower").addEventListener("click", () => { scope.focus = "lower"; if (scope.z === 0) scope.z = 1; renderScope(); });
  $("em-focus-upper").addEventListener("click", () => { scope.focus = "upper"; if (scope.z === 0) scope.z = 1; renderScope(); });
  let pending = 0;
  window.addEventListener("resize", () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => { renderScope(); renderLoom(); }); });

  const x = params.get("x") || scope.text;
  $("em-x").value = x;
  const p = params.get("p");
  if (p && ["53", "64", "106", "exact"].includes(p)) scope.p = p;
  for (const r of document.querySelectorAll('input[name="em-p"]')) r.checked = r.value === scope.p;
  scope.e1 = params.get("e1") === "1"; $("em-e1").checked = scope.e1;
  const b = params.get("b"); if (b === "lower" || b === "upper") scope.focus = b;
  loadScope(x, Number(params.get("z") || 0), true);
}

function setZoom(z) { scope.z = Math.max(0, Math.min(32, z)); renderScope(); }

function loadScope(text, z = 0, keepFocus = false) {
  const r = parseInput(text);
  $("em-x-error").textContent = r.error || "";
  if (r.error) return;
  scope.x = r.x; scope.text = String(text).trim(); scope.z = Math.max(0, Math.min(32, z || 0));
  if (!keepFocus) scope.focus = null;
  try { scope.a = analyze(r.x); } catch (err) { $("em-x-error").textContent = err.message; return; }
  for (const b of document.querySelectorAll("#em-presets button")) b.setAttribute("aria-pressed", String(Number(b.dataset.value) === r.x));
  renderScope();
}

function jumpToGap() {
  const a = scope.a; if (!a) return;
  scope.focus = a.candidate.boundary;
  const B = a.candidate.boundary === "lower" ? a.iv.lower : a.iv.upper;
  const d = Math.abs(ulps(a, qSub(a.candidate.value, B)));
  scope.z = d === 0 ? 32 : Math.max(1, Math.min(32, Math.floor(Math.log10(0.75 / d))));
  renderScope();
}

function renderScope() {
  const a = scope.a; if (!a) return;
  const focusName = scope.focus || a.candidate.boundary;
  const B = focusName === "lower" ? a.iv.lower : a.iv.upper;
  const z = scope.z;
  $("em-zoom").value = String(z);
  $("em-zoom-out").textContent = z === 0 ? "×1" : `×10^${z}`;
  $("em-zoom-out").innerHTML = z === 0 ? "×1" : `×10<sup>${z}</sup>`;
  $("em-focus-lower").setAttribute("aria-pressed", String(z > 0 && focusName === "lower"));
  $("em-focus-upper").setAttribute("aria-pressed", String(z > 0 && focusName === "upper"));
  params.set("x", scope.text); params.set("z", String(z)); params.set("p", scope.p);
  if (scope.e1) params.set("e1", "1"); else params.delete("e1");
  if (scope.focus) params.set("b", scope.focus); else params.delete("b");
  syncUrl();

  const host = $("em-scope");
  const VW = Math.max(300, Math.round(host.clientWidth || 900));
  const phone = VW < 560;
  const H = phone ? 312 : 290;
  const base = 212; // ruler baseline
  const centre = z === 0 ? a.iv.center : B;
  const W = qMul(qMul(a.ulp, Q(3n)), qPow10(-z)); // view width (real units)
  const X = (q) => VW / 2 + VW * qToNumber(qDiv(qSub(q, centre), W));
  const inView = (x) => x >= -1 && x <= VW + 1;
  const clampX = (x) => Math.max(-10, Math.min(VW + 10, x));

  const s = svg("svg", { viewBox: `0 0 ${VW} ${H}`, width: VW, height: H, role: "img", "aria-labelledby": "em-scope-title em-scope-desc" });
  s.append(svg("title", { id: "em-scope-title" }, `Rounding interval of ${scope.text} at zoom ×10^${z}`));

  // Interval shading.
  const xl = X(a.iv.lower); const xu = X(a.iv.upper);
  if (xu > 0 && xl < VW) s.append(svg("rect", { class: "em-int", x: clampX(xl), y: 58, width: Math.max(0, clampX(xu) - clampX(xl)), height: base - 58 }));

  // Error bands around both boundaries.
  if (scope.p !== "exact") {
    for (const bnd of [a.iv.lower, a.iv.upper]) {
      const w = bandHalfWidth(bnd, scope.p);
      const x0 = clampX(X(qSub(bnd, w))); const x1 = clampX(X(qAdd(bnd, w)));
      if (x1 > 0 && x0 < VW) s.append(svg("rect", { class: "em-band", x: x0, y: 30, width: Math.max(1.5, x1 - x0), height: base - 30 }));
    }
  }

  // Decimal ruler: multiples of 10^j, taller for fewer significant digits.
  const maxTicks = Math.max(12, Math.floor(VW / 11));
  const Wlog = qLog10(W);
  let j = Math.ceil(Wlog - Math.log10(maxTicks));
  const left = qSub(centre, qMul(W, Q(1n, 2n)));
  const right = qAdd(centre, qMul(W, Q(1n, 2n)));
  const ticksFor = (jj) => {
    const unit = qPow10(jj);
    const lo = qDiv(left, unit); const hi = qDiv(right, unit);
    let k0 = lo.n / lo.d; if (lo.n > 0n && lo.n % lo.d !== 0n) k0++;
    let k1 = hi.n / hi.d;
    return [k0, k1];
  };
  let [k0, k1] = ticksFor(j);
  while (k1 - k0 > BigInt(maxTicks)) { j++; [k0, k1] = ticksFor(j); }
  const ticks = [];
  for (let k = k0; k <= k1 && ticks.length <= maxTicks + 2; k++) {
    if (k <= 0n) continue;
    ticks.push({ k, sd: sigDigits(k), x: X(qMul(Q(k), qPow10(j))) });
  }
  const minSd = Math.min(...ticks.map((t) => t.sd));
  const tickG = svg("g", { class: "em-ruler" });
  tickG.append(svg("line", { x1: 0, x2: VW, y1: base, y2: base, class: "em-axis" }));
  let labelled = 0;
  const lvlCount = ticks.filter((t) => t.sd === minSd).length;
  for (const t of ticks) {
    const lvl = Math.min(3, t.sd - minSd);
    const h = [64, 40, 24, 12][lvl];
    const short = t.sd <= 17;
    tickG.append(svg("line", { x1: t.x, x2: t.x, y1: base, y2: base - h, class: `em-tick${short ? " em-tick-short" : ""}` }));
    if (lvl === 0 && short && lvlCount <= 4 && labelled < 4) {
      labelled++;
      let kk = t.k; let jj = j;
      while (kk % 10n === 0n) { kk /= 10n; jj++; }
      const right = t.x > VW * 0.6;
      tickG.append(svg("text", { x: right ? t.x - 3 : t.x + 3, y: base - h + 9, "text-anchor": right ? "end" : "start", class: "em-ticklabel" }, pretty(formatDecimal(kk, jj))));
    }
  }
  s.append(tickG);

  // Boundaries (true), with open/closed marker.
  const boundaryMark = (q, name) => {
    const x = X(q); if (!inView(x)) return;
    const g = svg("g", { class: `em-bound${a.iv.closed ? " em-closed" : " em-open"}` });
    g.append(svg("line", { x1: x, x2: x, y1: 24, y2: base + 6 }));
    g.append(svg("text", { x, y: 18, "text-anchor": "middle", class: "em-blabel" }, `${name} · ${a.iv.closed ? "closed" : "open"}`));
    s.append(g);
  };
  boundaryMark(a.iv.lower, "m⁻"); boundaryMark(a.iv.upper, "m⁺");

  // Where Errol's double-double arithmetic put the boundary.
  const hair = (q, cls, label, y) => {
    if (!q) return;
    const x = X(q); if (!inView(x)) return;
    s.append(svg("line", { x1: x, x2: x, y1: y - 4, y2: base, class: cls }));
    s.append(svg("text", { x: x + 4, y, class: `${cls}-label` }, label));
  };
  const cbL = computedBoundary(a, a.dd, "lower"); const cbU = computedBoundary(a, a.dd, "upper");
  if (scope.p === "106") {
    hair(cbL && cbL.value, "em-dd", "Errol’s m⁻", 44);
    hair(cbU && cbU.value, "em-dd", "Errol’s m⁺", 44);
  }
  const e1L = computedBoundary(a, a.dd1, "lower"); const e1U = computedBoundary(a, a.dd1, "upper");
  if (scope.e1) {
    hair(e1L && e1L.value, "em-e1", "Errol1 m⁻", 60);
    hair(e1U && e1U.value, "em-e1", "Errol1 m⁺", 60);
  }

  // Doubles.
  for (const [q, name] of [[a.vPrev, "v⁻"], [a.iv.center, "v"], [a.vNext, "v⁺"]]) {
    const x = X(q); if (!inView(x)) continue;
    s.append(svg("circle", { cx: x, cy: base, r: 5.5, class: "em-double" }));
    s.append(svg("text", { x, y: base + 22, "text-anchor": "middle", class: "em-dlabel" }, name));
  }

  // The candidate decimal.
  const cx = X(a.candidate.value);
  if (inView(cx)) {
    s.append(svg("path", { d: `M${cx} ${base - 9} L${cx + 7} ${base} L${cx} ${base + 9} L${cx - 7} ${base} Z`, class: "em-cand" }));
    const anchor = cx > VW * 0.7 ? "end" : cx < VW * 0.3 ? "start" : "middle";
    s.append(svg("text", { x: cx, y: base + 40, "text-anchor": anchor, class: "em-clabel" }, pretty(a.candidate.text)));
  }

  // Off-screen pointers.
  const off = { l: [], r: [] };
  const items = [[a.vPrev, "v⁻"], [a.iv.center, "v"], [a.vNext, "v⁺"], [a.iv.lower, "m⁻"], [a.iv.upper, "m⁺"], [a.candidate.value, pretty(a.candidate.text), "em-off-cand"]];
  if (scope.p === "106") {
    if (cbL) items.push([cbL.value, "Errol’s m⁻", "em-off-dd"]);
    if (cbU) items.push([cbU.value, "Errol’s m⁺", "em-off-dd"]);
  }
  if (scope.e1) {
    if (e1L) items.push([e1L.value, "Errol1 m⁻", "em-off-e1"]);
    if (e1U) items.push([e1U.value, "Errol1 m⁺", "em-off-e1"]);
  }
  for (const [q, name, cls] of items) {
    const x = X(q); if (inView(x)) continue;
    const d = Math.abs(ulps(a, qSub(q, centre)));
    (x < 0 ? off.l : off.r).push({ name, d, cls });
  }
  const offRow = (list, side) => {
    list.sort((p, q) => p.d - q.d);
    list.slice(0, 4).forEach((it, i) => {
      const y = 76 + i * 16;
      const text = side === "l" ? `◂ ${it.name} ${fmtUlp(it.d)}` : `${it.name} ${fmtUlp(it.d)} ▸`;
      s.append(svg("text", { x: side === "l" ? 4 : VW - 4, y, "text-anchor": side === "l" ? "start" : "end", class: `em-offscreen ${it.cls || ""}` }, text));
    });
  };
  offRow(off.l, "l"); offRow(off.r, "r");

  // Scale.
  const half = 1.5 / 10 ** z;
  const ya = phone ? H - 28 : H - 14;
  const ye = phone ? H - 8 : ya;
  s.append(svg("text", { x: 4, y: ye, class: "em-scale" }, `−${fmtUlp(half)}`));
  s.append(svg("text", { x: VW - 4, y: ye, "text-anchor": "end", class: "em-scale" }, `+${fmtUlp(half)}`));
  const mid = svg("text", { x: VW / 2, y: ya, "text-anchor": "middle", class: "em-scale em-scale-mid" }, z === 0 ? "centred on v · ticks every 10" : `centred on ${focusName === "lower" ? "m⁻" : "m⁺"} · ticks every 10`);
  mid.append(svg("tspan", { dy: -5, "font-size": "8px" }, String(j)));
  s.append(mid);
  s.append(svg("line", { x1: VW / 2, x2: VW / 2, y1: ya - 16, y2: ya - 11, class: "em-centre" }));

  const desc = scopeDescription(a, focusName, B);
  s.append(svg("desc", { id: "em-scope-desc" }, desc));
  host.replaceChildren(s);
  renderVerdict(a, focusName, B, cbL, cbU, e1L, e1U);
  renderValues(a, focusName, B, cbL, cbU, e1L, e1U);
}

function fmtUlp(d) {
  if (d === 0) return "0 ulp";
  if (d >= 0.01 && d < 1000) return `${Number(d.toPrecision(2))} ulp`;
  const [m, e] = d.toExponential(1).split("e");
  return `${m}e${e.replace("+", "")} ulp`;
}

function scopeDescription(a, focusName, B) {
  const d = ulps(a, qSub(a.candidate.value, B));
  return `The decimal ${a.candidate.text} is ${d === 0 ? "exactly on" : `${fmtUlp(Math.abs(d))} ${d < 0 ? "below" : "above"}`} ${focusName === "lower" ? "m⁻" : "m⁺"}; it is ${sideText(a.candidate.side)}.`;
}

const sideText = (side) => ({ inside: "inside the interval", outside: "outside the interval", "on-closed": "on the edge of a closed interval, so it belongs to v", "on-open": "on the edge of an open interval, so it does not belong to v" }[side]);
const verdictBadge = (kind) => `<span class="em-tag em-tag-${kind === "safe" ? "safe" : kind === "near" ? "near" : kind === "hit" ? "hit" : "exact"}">${kind === "near" ? "near miss" : kind === "hit" ? "exact hit" : kind === "exact" ? "exact" : "safe"}</span>`;
const mark = (ok) => (ok ? '<span class="em-ok">✓</span>' : '<span class="em-bad">✗</span>');

function outcomeText(v, digits, exp) {
  const j = judge(v, digits, exp);
  if (j.roundTrips && j.shortest) return `${mark(true)} <b>${esc(pretty(j.text))}</b> (shortest, reads back)`;
  if (j.roundTrips) return `${mark(false)} <b>${esc(pretty(j.text))}</b>: reads back, but has ${j.len} digits instead of ${j.bestLen}`;
  return `${mark(false)} <b>${esc(pretty(j.text))}</b>: does <em>not</em> read back as v`;
}

function renderVerdict(a, focusName, B, cbL, cbU, e1L, e1U) {
  const c = a.candidate;
  const bName = c.boundary === "lower" ? "m⁻" : "m⁺";
  const Bc = c.boundary === "lower" ? a.iv.lower : a.iv.upper;
  const dq = qSub(c.value, Bc);
  const dU = ulps(a, dq);
  const dRel = qToNumber(qDiv(dq, Bc));
  const lines = [];
  const where = dU === 0 ? `exactly on ${bName}` : `${sci(Math.abs(dU))} ulp ${dU < 0 ? "below" : "above"} ${bName} (${sci(Math.abs(dRel))} relative)`;
  lines.push(`<p><b class="em-red">${esc(pretty(c.text))}</b> (${c.sig} digit${c.sig > 1 ? "s" : ""}) is ${where}: ${sideText(c.side)}. The interval is ${a.iv.closed ? "closed (f is even)" : "open (f is odd)"}. Shortest correct output: <b>${esc(pretty(a.out.text))}</b> (${a.out.sig} digit${a.out.sig > 1 ? "s" : ""}).</p>`);
  const v = verdict(a, scope.p);
  const wU = ulps(a, v.w);
  if (scope.p === "exact") {
    lines.push(`<p>${verdictBadge(v.kind === "hit" ? "hit" : "exact")} With exact arithmetic an edge is a line with no band, and ties are decided by the parity of f. This is what Dragon4 or Errol’s integer path do.</p>`);
  } else {
    const what = scope.p === "106" ? "Errol’s proven bound 79·2<sup>−106</sup>" : `one rounding at ${scope.p} bits`;
    let msg;
    if (v.kind === "hit") msg = "The decimal is the edge. No precision can separate them, and the approximate edge may land on either side.";
    else if (v.kind === "near") msg = `The decimal is inside the band, so the computed edge could land on either side of it.`;
    else msg = `Margin: the decimal is ${sci(Math.abs(dU) / wU, 2)} band-widths away.`;
    lines.push(`<p>${verdictBadge(v.kind)} ${scope.p} bits (${what}): a computed ${bName} could be anywhere within ±${sci(wU)} ulp. ${msg}</p>`);
  }
  // What the real double-double code did.
  const cb = c.boundary === "lower" ? cbL : cbU;
  const r = a.route;
  const ddNote = r.path === "dd" ? "" : " (real Errol3 does not use this path for this input, see below)";
  if (a.dd.overflow) {
    lines.push("<p>The double-double path overflows here: next(v) is infinite.</p>");
  } else if (cb) {
    const eU = ulps(a, qSub(cb.value, Bc));
    const trueIn = c.side === "inside" || c.side === "on-closed";
    const cmp = qCmp(c.value, cb.value);
    const compIn = c.boundary === "lower" ? cmp >= 0 : cmp <= 0;
    const same = trueIn === compIn;
    const pos = eU === 0 ? `exactly on the true ${bName}` : `${sci(Math.abs(eU))} ulp ${eU < 0 ? "below" : "above"} the true ${bName}`;
    const side = c.side.startsWith("on") ? (compIn ? "which counts the decimal as inside" : "which counts the decimal as outside") : same ? "on the correct side of the decimal" : "<b>on the wrong side of the decimal</b>";
    lines.push(`<p><span class="em-key-dd"></span>Errol’s double-double arithmetic put ${bName} ${pos} (at digit ${cb.step}), ${side}. Fast path${ddNote}: ${outcomeText(a.v, a.dd.digits, a.dd.exp)}.</p>`);
  }
  if (scope.e1 && !a.dd1.overflow) {
    const e1 = c.boundary === "lower" ? e1L : e1U;
    const eU = e1 ? ulps(a, qSub(e1.value, Bc)) : 0;
    lines.push(`<p><span class="em-key-e1"></span>Errol1 narrows: its ${bName} sits ${sci(Math.abs(eU))} ulp ${eU < 0 ? "below" : "above"} the true one. Errol1 prints ${outcomeText(a.v, a.dd1.digits, a.dd1.exp)}${a.dd1.opt ? "" : " and raises its “maybe not optimal” flag"}.</p>`);
  }
  lines.push(`<p>Real Errol3: ${routeSentence(a.v, r)}</p>`);
  $("em-verdict").innerHTML = lines.join("");
}

function routeSentence(v, r) {
  const best = outputOf(v).text;
  if (r.path === "table") return `this input is one of the 432 table entries, so it prints the stored <b>${esc(pretty(outputText(r.digits, r.exp)))}</b> without any arithmetic.`;
  if (r.path === "int") {
    const bug = cIntBug(v);
    return `v is in (2<sup>53</sup>, 2<sup>128</sup>), so the exact 128-bit integer path runs. Correct output: <b>${esc(pretty(best))}</b>.${bug ? ` <span class="em-bad">Note:</span> the reference C code gets this one wrong (it prints “${esc(bug.digits)}” with exponent ${bug.exp}), see the <a href="#caveats">caveats</a>.` : ""}`;
  }
  if (r.path === "fixed") return `v is in [16, 2<sup>53</sup>], so the exact fixed-point path runs. Output: <b>${esc(pretty(best))}</b>.`;
  return "not in the table and outside the exact ranges, so the double-double path above is the real one.";
}

function decParts(q) {
  const d = qDecimal(q);
  return d; // {neg, digits, point}
}

function renderValues(a, focusName, B, cbL, cbU, e1L, e1U) {
  const ref = decParts(B);
  const rows = [];
  const push = (label, q, cls = "") => {
    if (!q) return;
    const d = decParts(q);
    let digits = d.digits;
    if (d.point === ref.point && digits.length < ref.digits.length) {
      // Pad with (exact) zeros up to the first digit that differs from the reference.
      const padded = digits.padEnd(ref.digits.length, "0");
      let i = 0; while (i < padded.length && padded[i] === ref.digits[i]) i++;
      digits = padded.slice(0, Math.max(digits.length, Math.min(padded.length, i + 1)));
    }
    const maxLen = 64;
    const cut = digits.length > maxLen;
    if (cut) digits = digits.slice(0, maxLen);
    let common = 0;
    if (d.point === ref.point) { while (common < digits.length && common < ref.digits.length && digits[common] === ref.digits[common]) common++; }
    const sameAsRef = d.point === ref.point && d.digits === ref.digits;
    const head = digits.slice(0, common); const tail = digits.slice(common);
    const fmt = (h, t) => {
      const all = h + t;
      const one = all[0]; const rest = all.slice(1);
      const hh = h.length ? `<span class="em-same">${esc(one)}${h.length > 1 ? "." + esc(h.slice(1)) : "."}</span>` : "";
      if (h.length) return `${hh}${t.length ? `<span class="em-diff">${esc(t)}</span>` : ""}`;
      return `<span class="em-diff">${esc(one)}.${esc(rest)}</span>`;
    };
    const exp = d.point - 1;
    rows.push(`<div class="em-row ${cls}"><span class="em-row-label">${label}</span><span class="em-row-val">${sameAsRef && label.indexOf(focusName === "lower" ? "m⁻" : "m⁺") === 0 ? `<span class="em-same">${esc(digits[0])}.${esc(digits.slice(1))}</span>` : fmt(head, tail)}${cut ? "…" : ""}e${exp}</span></div>`);
  };
  push(`m⁻ (${a.iv.closed ? "closed" : "open"})`, a.iv.lower);
  push("candidate", a.candidate.value, "em-row-cand");
  if (cbL) push(`Errol’s m⁻ (digit ${cbL.step})`, cbL.value, "em-row-dd");
  if (scope.e1 && e1L) push(`Errol1’s m⁻ (digit ${e1L.step})`, e1L.value, "em-row-e1");
  push("v", a.iv.center, "em-row-v");
  if (cbU) push(`Errol’s m⁺ (digit ${cbU.step})`, cbU.value, "em-row-dd");
  if (scope.e1 && e1U) push(`Errol1’s m⁺ (digit ${e1U.step})`, e1U.value, "em-row-e1");
  push(`m⁺ (${a.iv.closed ? "closed" : "open"})`, a.iv.upper);
  $("em-values").innerHTML = `<p class="em-values-note">Digits that agree with ${focusName === "lower" ? "m⁻" : "m⁺"} are grey; the first differing digit onward is dark. Long values are cut after 64 digits.</p>${rows.join("")}`;
}

// ===========================================================================
// 2. The loom (double-double digit stepper)

const LOOM_PRESETS = ["0.1", "0.3", "3.141592653589793", "1.1", "5e-324", "3.14", "4.0648030339495312e68"];

const CODE = [
  ["index", "frexp(val, &e);"],
  ["index", "exp = 307 + (double)e * 0.30103;      /* truncates */"],
  ["index", "if (exp < 20) exp = 20; else if (exp >= 600) exp = 599;"],
  ["prod", "mid = hp_prod(lookup_table[exp], val);"],
  ["prod", "lten = lookup_table[exp].val; ten = 1.0; exp -= 307;"],
  ["fix", "while (mid > 10) exp++, hp_div10(&mid), ten /= 10.0;"],
  ["fix", "while (mid < 1)  exp--, hp_mul10(&mid), ten *= 10.0;"],
  ["bounds", "high.val = mid.val;"],
  ["bounds", "high.off = mid.off + (fpnext(val) - val) * lten * ten / 2.0;"],
  ["bounds", "low.val  = mid.val;"],
  ["bounds", "low.off  = mid.off + (fpprev(val) - val) * lten * ten / 2.0;"],
  ["bounds", "hp_normalize(&high); hp_normalize(&low);"],
  ["rescale", "while (high > 10) exp++, hp_div10(&high), hp_div10(&low);"],
  ["rescale", "while (high < 1)  exp--, hp_mul10(&high), hp_mul10(&low);"],
  ["loop", "while (true) {"],
  ["digit", "  hdig = (uint8_t)high.val;"],
  ["negfix", "  if (high.val == hdig && high.off < 0) hdig -= 1;"],
  ["digit", "  ldig = (uint8_t)low.val;"],
  ["negfix", "  if (low.val == ldig && low.off < 0) ldig -= 1;"],
  ["digit", "  if (ldig != hdig) break;"],
  ["peel", "  *buf++ = hdig + '0';"],
  ["peel", "  high.val -= hdig; low.val -= ldig;"],
  ["peel", "  hp_mul10(&high); hp_mul10(&low);"],
  ["loop", "}"],
  ["last", "tmp = (high.val + low.val) / 2.0;"],
  ["last", "mdig = tmp + 0.5; if ((mdig - tmp) == 0.5 && (mdig & 1)) mdig--;"],
  ["last", "*buf++ = mdig + '0';"],
];

const loom = { text: "0.1", x: 0.1, step: 0, negFix: true, last: "round", run: null, frames: [] };

function initLoom() {
  const chips = $("em-loom-presets");
  for (const p of LOOM_PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = p; b.dataset.value = p;
    b.addEventListener("click", () => { $("em-lx").value = p; loadLoom(p, 0); });
    chips.append(b);
  }
  $("em-loom-form").addEventListener("submit", (e) => { e.preventDefault(); loadLoom($("em-lx").value, 0); });
  $("em-step").addEventListener("click", () => setStep(loom.step + 1));
  $("em-back").addEventListener("click", () => setStep(loom.step - 1));
  $("em-run").addEventListener("click", () => setStep(loom.frames.length - 1));
  $("em-reset").addEventListener("click", () => setStep(0));
  $("em-negfix").addEventListener("click", () => {
    loom.negFix = !loom.negFix; rebuildLoom(true);
  });
  $("em-last-round").addEventListener("click", () => { loom.last = "round"; rebuildLoom(true); });
  $("em-last-hdig").addEventListener("click", () => { loom.last = "hdig"; rebuildLoom(true); });
  loom.negFix = params.get("fix") !== "0";
  loom.last = params.get("last") === "hdig" ? "hdig" : "round";
  const lx = params.get("lx") || "0.1";
  $("em-lx").value = lx;
  loadLoom(lx, Number(params.get("ls") || 0));
}

function loadLoom(text, step) {
  const r = parseInput(text);
  $("em-lx-error").textContent = r.error || "";
  if (r.error) return;
  loom.text = String(text).trim(); loom.x = r.x;
  for (const b of document.querySelectorAll("#em-loom-presets button")) b.setAttribute("aria-pressed", String(Number(b.dataset.value) === r.x));
  rebuildLoom(false, step);
}

function rebuildLoom(keepEnd, step = 0) {
  const wasEnd = loom.frames.length && loom.step === loom.frames.length - 1;
  loom.run = errolDD(loom.x, { negFix: loom.negFix, lastDigit: loom.last });
  loom.frames = buildFrames(loom.x, loom.run);
  loom.step = keepEnd && wasEnd ? loom.frames.length - 1 : keepEnd ? Math.min(loom.step, loom.frames.length - 1) : Math.max(0, Math.min(step, loom.frames.length - 1));
  renderLoom();
}

function setStep(i) {
  loom.step = Math.max(0, Math.min(loom.frames.length - 1, i));
  renderLoom();
}

// Turn the trace into frames: one card each.
function buildFrames(v, run) {
  const frames = [];
  if (run.overflow) {
    frames.push({ tag: "bounds", title: "The double-double path overflows", html: "<p>For the largest double, next(v) is infinite, so the gap to the upper neighbour cannot be computed. Errol3 stores DBL_MAX in its table instead.</p>", regs: [] });
    return frames;
  }
  const exact = { v: qOfDouble(v) };
  let exp = null;
  for (const t of run.trace) {
    if (t.kind === "index") {
      const est = 307 + t.e2 * 0.30103;
      frames.push({
        tag: "index",
        title: "Pick a power of ten from the table",
        html: `<p>frexp writes v = f·2<sup>e₂</sup> with f in [0.5, 1): here e₂ = ${t.e2}. Since log₁₀2 ≈ 0.30103, the estimate 307 + e₂·0.30103 = ${est.toFixed(3)} truncates to ${t.raw}${t.raw !== t.idx ? `, which is clamped to ${t.idx}. The table stops at 10<sup>288</sup>, so extra ×10 steps will follow` : ""}. Entry ${t.idx} holds 10<sup>${t.k}</sup> as a double-double: val is the double nearest to 10<sup>${t.k}</sup>, off is the double nearest to the rest.</p>
          <p class="em-note">The table (600 entries, 10<sup>308</sup> down to 10<sup>−291</sup>) is rebuilt here with BigInt; it matches Errol’s lookup.h.</p>`,
        regs: [{ name: `10^${t.k}`, dd: t.entry, err: relErr(qOfDD(t.entry), qPow10(t.k)) }],
      });
    } else if (t.kind === "prod") {
      exact.scaled = qMul(qOfDouble(v), qPow10(t.k));
      frames.push({
        tag: "prod",
        title: `Multiply: mid = v × 10^${t.k}`,
        html: `<p>The product of two doubles is exact as a double-double: split each factor into a 26-bit high part (by clearing the low 27 bits) and the rest, and add up the exact partial products. The table’s off part adds its correction, off × v.</p>`,
        regs: [{ name: "mid", dd: t.mid, err: relErr(qOfDD(t.mid), exact.scaled) }],
      });
    } else if (t.kind === "fix") {
      const n = t.steps.length; const last = t.steps.at(-1);
      const op = last.op === "mul10" ? "×10" : "÷10";
      const trueMid = qMul(qOfDouble(v), qPow10(1 - t.exp));
      frames.push({
        tag: "fix",
        title: `Bring mid into [1, 10): ${op}${n > 1 ? ` ${n} times` : ""}`,
        html: `${n > 1 ? `<p>The estimate was off, so ${op} runs ${n} times. The last one is shown.</p>` : ""}${opHtml(last)}`,
        regs: [{ name: "before", dd: last.before }, { name: "mid", dd: t.mid, err: relErr(qOfDD(t.mid), trueMid) }],
      });
    } else if (t.kind === "bounds") {
      exp = t.exp;
      frames.push({
        tag: "bounds",
        title: "Build both edges around mid",
        html: `<p>The half-gaps to the neighbours, scaled the same way: (next(v) − v)·10<sup>k</sup>/2 = ${sci(t.upTerm, 4)} and (prev(v) − v)·10<sup>k</sup>/2 = ${sci(t.downTerm, 4)}. They are added to <em>off only</em>, then each pair is normalized. There is no safety margin: Errol3 uses the true midpoints.</p>`,
        regs: [{ name: "high", dd: t.high }, { name: "low", dd: t.low }],
        bounds: true,
      });
    } else if (t.kind === "rescale") {
      exp = t.exp;
      frames.push({
        tag: "rescale",
        title: `Rescale both edges (${t.ops.length}× ${t.ops[0] === "mul10" ? "×10" : "÷10"})`,
        html: "<p>The upper edge left [1, 10) (it crossed a power of ten), so both edges are rescaled together.</p>",
        regs: [{ name: "high", dd: t.high }, { name: "low", dd: t.low }],
      });
    } else if (t.kind === "digit") {
      const lines = [];
      lines.push(`<p><b>high</b>: trunc(${fmtD(t.high.val)}) = ${t.htrunc}${t.hfixed ? `, but val is an integer and off &lt; 0, so the true value is just below it: <b>${t.hdig}</b>` : ""}. <b>low</b>: trunc(${fmtD(t.low.val)}) = ${t.ltrunc}${t.lfixed ? `, but val is an integer and off &lt; 0, so the true value is just below it: <b>${t.ldig}</b>` : ""}.</p>`);
      if (!loom.negFix && t.high.val === t.htrunc && t.high.off < 0) lines.push(`<p class="em-warn">The fix is deleted: high reads ${t.htrunc} although its true value is below ${t.htrunc}.</p>`);
      if (!loom.negFix && t.low.val === t.ltrunc && t.low.off < 0) lines.push(`<p class="em-warn">The fix is deleted: low reads ${t.ltrunc} although its true value is below ${t.ltrunc}.</p>`);
      if (t.same) {
        const lh = t.mulHigh.loss; const ll = t.mulLow.loss;
        const lossText = lh === 0 && ll === 0
          ? "Both ×10 steps are exact here: no rounding loss, off just gets multiplied by 10."
          : `The ×10 of high lost ${sci(lh, 3)} to rounding and that of low lost ${sci(ll, 3)}; the losses are computed exactly and moved into off.`;
        lines.push(`<p>Both say <b>${t.hdig}</b>: emit it, subtract it from both vals, and multiply both by 10. ${lossText}</p>`);
      } else {
        lines.push(`<p>They <b>differ</b> (${t.hdig} vs ${t.ldig}): the digits so far are shared by the whole interval, and one more digit is enough. Stop.</p>`);
      }
      frames.push({
        tag: "digit", same: t.same, fixed: t.hfixed || t.lfixed,
        title: `Digit ${t.index}: high says ${t.hdig}, low says ${t.ldig}`,
        html: lines.join(""),
        regs: [{ name: "high", dd: t.high, bval: t.highValue }, { name: "low", dd: t.low, bval: t.lowValue }],
        prefix: t.prefix, hdig: t.hdig, ldig: t.ldig,
      });
    } else if (t.kind === "last") {
      const digits = run.digits;
      const j = judge(v, digits, run.exp);
      const other = t.lastDigit === "hdig" ? `The current code would take round(${fmtD(t.tmp)}) = ${t.mdig}.` : `The paper-era code emitted hdig = ${t.hdig} instead.`;
      const chosenWhy = t.lastDigit === "hdig" ? `Paper-era rule: emit hdig = <b>${t.hdig}</b>.` : `Current rule: round the middle, tmp = (high.val + low.val)/2 = ${fmtD(t.tmp)} → <b>${t.mdig}</b> (ties to even).`;
      frames.push({
        tag: "last",
        title: "The last digit",
        html: `<p>Any digit from ldig + 1 to hdig would be inside the interval. ${chosenWhy} ${other}</p>
          <p class="em-result">Output: digits “${esc(digits)}”, exponent ${run.exp} → ${outcomeText(v, digits, run.exp)}. ${j.roundTrips && j.shortest && j.text !== j.best ? `Shortest, but not the closest (${esc(pretty(j.best))}).` : ""}</p>`,
        regs: [{ name: "high", dd: t.high }, { name: "low", dd: t.low }],
        done: true,
      });
    }
  }
  return frames;
}

function relErr(q, truth) {
  const d = qSub(q, truth);
  if (d.n === 0n) return 0;
  return qToNumber(qDiv(d, truth));
}

function fmtD(x) { return pretty(String(x)); }

function opHtml(o) {
  if (o.op === "mul10") {
    return `<p>×10: fl(10·val) = ${fmtD(o.rounded)} is rounded. The loss (h − 8·val) − 2·val = ${sci(o.loss, 4)} is computed exactly and subtracted from 10·off. Then normalize.</p>`;
  }
  return `<p>÷10: fl(val/10) = ${fmtD(o.rounded)} is rounded. The remainder val − 10·fl(val/10) = ${sci(o.loss, 4)} is computed exactly, divided by 10 and added to off. Then normalize.</p>`;
}

// A bit strip for one double-double: val's bits, then off's bits, on one
// binary ruler.
function bitStrip(dd) {
  const N = 112; const cw = 6; const hgt = 16;
  const pv = bitPositions(dd.val); const po = bitPositions(dd.off);
  const top = pv.top !== null ? pv.top : po.top;
  const s = svg("svg", { viewBox: `0 0 ${N * cw} ${hgt}`, class: "em-strip", "aria-hidden": "true", preserveAspectRatio: "none" });
  if (top === null) return s;
  const valSet = new Set(pv.bits); const offSet = new Set(po.bits);
  const valLow = pv.top !== null ? pv.top - 52 : Infinity;
  const offTop = po.top; const offLow = po.top !== null ? po.top - 52 : null;
  for (let i = 0; i < N; i++) {
    const p = top - i;
    let cls = null;
    if (pv.top !== null && p <= pv.top && p >= valLow) cls = valSet.has(p) ? "em-b-val1" : "em-b-val0";
    else if (offTop !== null && p <= offTop && p >= offLow) cls = offSet.has(p) ? "em-b-off1" : "em-b-off0";
    if (cls) s.append(svg("rect", { x: i * cw + 0.5, y: 1, width: cw - 1, height: hgt - 2, class: cls }));
  }
  return s;
}

function renderLoom() {
  const f = loom.frames[loom.step]; if (!f) return;
  params.set("lx", loom.text); params.set("ls", String(loom.step));
  if (!loom.negFix) params.set("fix", "0"); else params.delete("fix");
  if (loom.last === "hdig") params.set("last", "hdig"); else params.delete("last");
  syncUrl();
  $("em-stepcount").textContent = `step ${loom.step + 1} of ${loom.frames.length}`;
  $("em-back").disabled = loom.step === 0;
  $("em-step").disabled = loom.step === loom.frames.length - 1;
  $("em-negfix").setAttribute("aria-pressed", String(!loom.negFix));
  $("em-negfix").textContent = loom.negFix ? "Delete the negative-offset lines" : "Restore the negative-offset lines";
  $("em-last-round").setAttribute("aria-pressed", String(loom.last === "round"));
  $("em-last-hdig").setAttribute("aria-pressed", String(loom.last === "hdig"));

  const r = route(loom.x);
  const banner = $("em-loom-route");
  if (r.path === "dd") { banner.hidden = true; banner.textContent = ""; }
  else {
    banner.hidden = false;
    banner.innerHTML = r.path === "table" ? "Real Errol3 would answer this input from its table (the fast path below gets it wrong). Shown anyway." :
      r.path === "int" ? "Real Errol3 sends this input to its exact 128-bit integer path. The double-double path is shown anyway." :
        "Real Errol3 sends this input to its exact fixed-point path. The double-double path is shown anyway.";
  }

  const card = $("em-card");
  card.innerHTML = `<p class="em-card-kicker">step ${loom.step + 1}</p><h3>${esc(f.title).replace(/\^(-?\d+)/g, "<sup>$1</sup>")}</h3>${f.html}`;
  const regs = document.createElement("div");
  regs.className = "em-regs";
  for (const reg of f.regs) {
    const row = document.createElement("div");
    row.className = "em-reg";
    const sum = qOfDD(reg.dd);
    const d = qDecimal(sum);
    let sumText = "";
    if (d) {
      const ds = d.digits.length > 40 ? d.digits.slice(0, 40) : d.digits;
      const more = d.digits.length > 40 ? "…" : "";
      if (d.point >= 1 && d.point <= 4) sumText = `${ds.slice(0, d.point).padEnd(d.point, "0")}${ds.length > d.point ? "." + ds.slice(d.point) : ""}${more}`;
      else if (d.point <= 0 && d.point > -4) sumText = `0.${"0".repeat(-d.point)}${ds}${more}`;
      else sumText = `${ds[0]}.${ds.slice(1)}${more}e${d.point - 1}`;
    }
    const errText = reg.err === undefined ? "" : reg.err === 0 ? " · exact" : ` · error ${sci(Math.abs(reg.err))} relative`;
    row.innerHTML = `<div class="em-reg-head"><span class="em-reg-name">${esc(reg.name).replace(/\^(-?\d+)/, "<sup>$1</sup>")}</span><span class="em-reg-pair"><span class="em-val">${esc(fmtD(reg.dd.val))}</span> <span class="em-plus">+</span> <span class="em-off">${esc(fmtD(reg.dd.off))}</span></span></div>`;
    row.append(bitStrip(reg.dd));
    const foot = document.createElement("div");
    foot.className = "em-reg-sum";
    foot.innerHTML = `sum = ${esc(sumText || "0")}${errText}`;
    row.append(foot);
    regs.append(row);
  }
  card.append(regs);

  // Odometer: digits so far.
  const od = $("em-odometer");
  const done = [];
  let prefix = ""; let pending = null;
  for (let i = 0; i <= loom.step; i++) {
    const fr = loom.frames[i];
    if (fr.tag === "digit") { prefix = fr.prefix; pending = fr; }
  }
  if (f.done) prefix = loom.run.digits;
  if (prefix) for (const ch of prefix) done.push(`<span class="em-od-cell">${ch}</span>`);
  if (!f.done && pending && f === pending) done.push(`<span class="em-od-cell em-od-pending${pending.same ? "" : " em-od-split"}"><i>${pending.hdig}</i><i>${pending.ldig}</i></span>`);
  od.innerHTML = `<span class="em-od-label">digits</span>${done.join("") || '<span class="em-od-empty">none yet</span>'}${loom.run.exp !== undefined && prefix ? `<span class="em-od-exp">× 10<sup>${loom.run.exp}</sup> (as 0.d₁d₂…)</span>` : ""}`;

  // Code.
  const code = $("em-code");
  const hl = new Set([f.tag]);
  if (f.tag === "digit") { hl.add("loop"); if (f.fixed) hl.add("negfix"); if (f.same) hl.add("peel"); }
  code.innerHTML = CODE.map(([tag, line]) => {
    const cls = [hl.has(tag) ? "hl" : "", tag === "negfix" && !loom.negFix ? "em-deleted" : ""].filter(Boolean).join(" ");
    return `<span class="em-line${cls ? ` ${cls}` : ""}">${esc(line)}</span>`;
  }).join("");
  if (!reduceMotion) { card.classList.remove("em-flash"); void card.offsetWidth; card.classList.add("em-flash"); }
}

// ===========================================================================
// 3. The router

const ROUTE_PRESETS = ["123.456", "0.1", "1e23", "18446744073709551616", "4.0648030339495312e68", "1e300", "5e-324"];

function initRouter() {
  const chips = $("em-route-presets");
  for (const p of ROUTE_PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = p === "18446744073709551616" ? "2^64" : p; b.dataset.value = p;
    b.addEventListener("click", () => { $("em-rx").value = p; renderRoute(p); });
    chips.append(b);
  }
  $("em-route-form").addEventListener("submit", (e) => { e.preventDefault(); renderRoute($("em-rx").value); });
  const rx = params.get("rx") || "123.456";
  $("em-rx").value = rx;
  renderRoute(rx);
}

function renderRoute(text) {
  const r = parseInput(text);
  $("em-rx-error").textContent = r.error || "";
  if (r.error) return;
  const v = r.x;
  params.set("rx", String(text).trim()); syncUrl();
  for (const b of document.querySelectorAll("#em-route-presets button")) b.setAttribute("aria-pressed", String(Number(b.dataset.value) === v));
  const rt = route(v);
  const inInt = v > INT_LOW && v < INT_HIGH;
  const inFixed = v >= 16 && v <= INT_LOW;
  const steps = [
    ["table", "Look up all 64 bits in the 432-entry table (enum3.h)", rt.path === "table" ? "hit: return the stored digits" : "no match"],
    ["int", "2<sup>53</sup> &lt; v &lt; 3.40282366920938e38 → errol_int, exact 128-bit midpoints", rt.path === "table" ? "not reached" : inInt ? "yes" : "no"],
    ["fixed", "16 ≤ v ≤ 2<sup>53</sup> → errol_fixed, exact integer part and fraction", rt.path === "table" || inInt ? "not reached" : inFixed ? "yes" : "no"],
    ["dd", "otherwise → the double-double path (the loom above)", rt.path === "dd" ? "yes" : "not reached"],
  ];
  $("em-router").innerHTML = steps.map(([key, label, res]) => `<li class="${key === rt.path ? "em-taken" : res === "not reached" ? "em-skipped" : ""}"><span>${label}</span><b>${res}</b></li>`).join("");
  const best = outputOf(v).text;
  let out;
  if (rt.path === "table") out = `Errol3 prints the stored answer <strong>${esc(pretty(outputText(rt.digits, rt.exp)))}</strong> (shortest, checked). Without the table the fast path would print ${outcomeText(v, errolDD(v).digits, errolDD(v).exp)}.`;
  else if (rt.path === "dd") { const d = errolDD(v); out = `The double-double path prints ${outcomeText(v, d.digits, d.exp)}.`; }
  else {
    const bug = cIntBug(v);
    out = `The exact path’s correct answer is <strong>${esc(pretty(best))}</strong>. The double-double code is never run for this input.${bug ? ` <br>Known bug: the reference C code (5364de4) prints “${esc(bug.digits)}” with exponent ${bug.exp} here (${bug.digits === "" || /:/.test(bug.digits) ? "single-digit answer, issue #12" : "swapped gaps at a power of two"}).` : ""}`;
  }
  $("em-route-out").innerHTML = `v = ${esc(pretty(String(v)))}. ${out}`;
}

// ===========================================================================

initScope();
initLoom();
initRouter();
