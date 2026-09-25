// Copyright (C) 2026 Toit contributors.
//
// DOM code for the "Two rulers" Schubfach page.

import {
  analyze, countTicks, ticksBetween, offsetNumber, formatR, parseInput, PRESETS,
  sup, doubleOf, C_MIN, Q_MIN, trailingZeros, cmpR, intR, pow10,
} from "./schubfach-rulers-model.js";

const SVGNS = "http://www.w3.org/2000/svg";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function newSvg(box, height) {
  const width = Math.max(300, Math.floor(box.clientWidth));
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "sfr-svg", "aria-hidden": "true" });
  box.replaceChildren(svg);
  return { svg, width };
}

function setParam(key, value) {
  const params = new URLSearchParams(window.location.search);
  if (value === null || value === undefined) params.delete(key); else params.set(key, value);
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

const params = new URLSearchParams(window.location.search);

/** Scaled rational r (in ruler units) -> "inside the interval of a?" */
function insideR(a, r) {
  const lo = cmpR(a.Vl, r), hi = cmpR(r, a.Vr);
  return a.closed ? lo <= 0 && hi <= 0 : lo < 0 && hi < 0;
}

/** Tick m of ruler 10^j (relative to k) as a rational in scaled units. */
function tickR(m, j) {
  return j >= 0 ? intR(m * pow10(j)) : { n: m, d: pow10(-j) };
}

/** Offset of tick m·10^j from the BigInt origin, as a Number. */
function tickOffset(m, j, origin) {
  return j >= 0 ? Number(m * pow10(j) - origin) : Number(m - origin * pow10(-j)) / 10 ** -j;
}

function onResize(box, fn) {
  let last = box.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(box.clientWidth - last) >= 1) { last = box.clientWidth; fn(); }
  });
  ro.observe(box);
}

const last2 = (m) => {
  const text = (m < 0n ? -m : m).toString();
  return text.padStart(2, "0").slice(-2);
};

// ---------------------------------------------------------------------------
// 1. Hook: 0.3 versus 0.1 + 0.2
// ---------------------------------------------------------------------------

function initHook() {
  const box = document.getElementById("sfr-hook-svg");
  if (!box) return;
  const prev = document.getElementById("sfr-hook-prev");
  const next = document.getElementById("sfr-hook-next");
  const label = document.getElementById("sfr-hook-label");
  const caption = document.getElementById("sfr-hook-caption");
  const A = analyze(0.3);
  const B = analyze(0.1 + 0.2);
  const origin = 30000000000000000n; // 0.3 · 10^17
  const off = (r) => offsetNumber(r, origin);
  const aVl = off(A.Vl), aVr = off(A.Vr), aV = off(A.V);
  const bVl = off(B.Vl), bVr = off(B.Vr), bV = off(B.V);
  const aFine = countTicks(A, 0), bFine = countTicks(B, 0);
  const aCoarse = countTicks(A, 1), bCoarse = countTicks(B, 1);
  const dU = formatR({ n: B.V.n - B.s * B.V.d, d: B.V.d }, 3);
  const dW = formatR({ n: (B.s + 1n) * B.V.d - B.V.n, d: B.V.d }, 3);

  const WIDE = [-7.6, 11.6], ZOOM = [0.9, 8.1];
  const captions = [
    `Two neighbouring doubles, two rounding intervals. 0.3 has odd c, so its interval is open: ( ). 0.1 + 0.2 has even c, so its interval is closed: [ ]. They share the endpoint ${formatR(A.Vr)}, which belongs to the even one. Both are ${formatR(A.width)} units wide.`,
    `Add the 10⁻¹⁷ ruler: one tick per unit. It can't miss either interval. 0.3's interval holds ${aFine} ticks and the other holds ${bFine}. Each of them is a 17-digit decimal that reads back correctly.`,
    `Add the 10⁻¹⁶ ruler: one tick every 10 units. 0.3's interval catches ${aCoarse} of them (30000000000000000, i.e. 0.3); the other catches ${bCoarse}. Its nearest coarse ticks, …00 and …10, are both outside. So 0.3 prints as “0.3”.`,
    `For 0.1 + 0.2 only 17-digit ticks remain, all equally long, so take the one closest to v. The two ticks around v are …04 and …05. v is ${dU} from …04 and ${dW} from …05, so it prints as “0.30000000000000004”.`,
  ];

  let frame = Math.min(3, Math.max(0, Number.parseInt(params.get("frame") || "1", 10) - 1 || 0));
  let domain = frame === 3 ? ZOOM : WIDE;
  let anim = 0;

  function draw() {
    const height = 314;
    const { svg, width } = newSvg(box, height);
    const mL = 10, mR = 10;
    const [d0, d1] = domain;
    const X = (t) => mL + ((t - d0) / (d1 - d0)) * (width - mL - mR);
    const clampX = (t) => Math.max(mL, Math.min(width - mR, X(t)));
    const top = 40, bandBottom = frame >= 1 ? 266 : 96;
    const coarseY = 128, fineY = 214;

    // bands
    svg.append(el("rect", { x: clampX(aVl), y: top, width: Math.max(0, clampX(aVr) - clampX(aVl)), height: bandBottom - top, class: "sfr-band sfr-band-a" }));
    svg.append(el("rect", { x: clampX(bVl), y: top, width: Math.max(0, clampX(bVr) - clampX(bVl)), height: bandBottom - top, class: "sfr-band sfr-band-b" }));
    for (const [x, closed] of [[aVl, false], [aVr, false], [bVl, true], [bVr, true]]) {
      if (x < d0 || x > d1) continue;
      svg.append(el("line", { x1: X(x), x2: X(x), y1: top, y2: bandBottom, class: closed ? "sfr-edge" : "sfr-edge sfr-edge-open" }));
    }
    // bracket glyphs
    const glyph = (x, text, anchor) => { if (x >= d0 && x <= d1) svg.append(el("text", { x: X(x), y: top + 30, class: "sfr-bracket", "text-anchor": anchor }, text)); };
    glyph(aVl, "(", "start"); glyph(aVr, ")", "end"); glyph(bVl, "[", "start"); glyph(bVr, "]", "end");
    // labels over bands
    const labelAt = (lo, hi, text, cls) => {
      const x = (clampX(lo) + clampX(hi)) / 2;
      svg.append(el("text", { x, y: 18, "text-anchor": "middle", class: `sfr-band-label ${cls}` }, text));
    };
    labelAt(aVl, aVr, "0.3", "sfr-a");
    labelAt(bVl, bVr, "0.1 + 0.2", "sfr-b");
    // v dots
    for (const [x, cls] of [[aV, "sfr-a"], [bV, "sfr-b"]]) {
      if (x < d0 || x > d1) continue;
      svg.append(el("circle", { cx: X(x), cy: top + 22, r: 5, class: `sfr-vdot ${cls}` }));
    }
    if (frame === 0) {
      const tail = (r) => { const t = formatR(r); const dot = t.indexOf("."); return `…${t.slice(dot < 0 ? -2 : dot - 2)}`; };
      const endLabel = (x, text, y, anchor = "middle") => svg.append(el("text", { x: X(x), y, "text-anchor": anchor, class: "sfr-small" }, text));
      endLabel(aVl, tail(A.Vl), 114);
      endLabel(aVr, `${tail(A.Vr)} (shared)`, 132);
      endLabel(bVr, tail(B.Vr), 114);
      endLabel(aV, `v = ${tail(A.V)}`, 150);
      endLabel(bV, `v = ${tail(B.V)}`, 150);
    }

    if (frame >= 1) {
      // fine ruler
      svg.append(el("line", { x1: mL, x2: width - mR, y1: fineY, y2: fineY, class: "sfr-baseline" }));
      svg.append(el("text", { x: mL, y: fineY - 20, class: "sfr-row-label sfr-halo" }, "fine ruler · 10⁻¹⁷"));
      const pxUnit = (width - mL - mR) / (d1 - d0);
      for (let m = Math.ceil(d0); m <= Math.floor(d1); m++) {
        const r = intR(origin + BigInt(m));
        const inA = insideR(A, r), inB = insideR(B, r);
        const isUW = frame === 3 && (m === 4 || m === 5);
        svg.append(el("line", { x1: X(m), x2: X(m), y1: fineY - 8, y2: fineY + 8, class: `sfr-tick${inA || inB ? " sfr-tick-in" : ""}${isUW ? " sfr-tick-strong" : ""}` }));
        if (pxUnit >= 17 || m % 2 === 0) svg.append(el("text", { x: X(m), y: fineY + 22, "text-anchor": "middle", class: `sfr-ticklabel${isUW ? " sfr-strong" : ""}` }, last2(origin + BigInt(m))));
      }
      if (frame < 3) {
        svg.append(el("text", { x: (clampX(aVl) + clampX(aVr)) / 2, y: fineY + 42, "text-anchor": "middle", class: "sfr-count" }, `${aFine} inside`));
        svg.append(el("text", { x: (clampX(bVl) + clampX(bVr)) / 2, y: fineY + 42, "text-anchor": "middle", class: "sfr-count" }, `${bFine} inside`));
      }
    }
    if (frame === 2) {
      svg.append(el("line", { x1: mL, x2: width - mR, y1: coarseY, y2: coarseY, class: "sfr-baseline" }));
      svg.append(el("text", { x: mL, y: coarseY - 20, class: "sfr-row-label sfr-halo" }, "coarse ruler · 10⁻¹⁶"));
      for (let m = Math.ceil(d0 / 10) * 10; m <= d1; m += 10) {
        const inA = insideR(A, intR(origin + BigInt(m)));
        svg.append(el("line", { x1: X(m), x2: X(m), y1: coarseY - 12, y2: coarseY + 12, class: `sfr-tick sfr-coarse${inA ? " sfr-tick-hit" : ""}` }));
        const full = m === 0 && width >= 560;
        svg.append(el("text", { x: X(m), y: coarseY + 26, "text-anchor": "middle", class: `sfr-ticklabel${inA ? " sfr-strong" : ""}` }, full ? "30000000000000000" : `…${last2(origin + BigInt(m))}`));
      }
      svg.append(el("text", { x: (clampX(aVl) + clampX(aVr)) / 2, y: coarseY + 46, "text-anchor": "middle", class: "sfr-count" }, width >= 560 ? `${aCoarse} inside → “0.3”` : `${aCoarse} inside`));
      svg.append(el("text", { x: (clampX(bVl) + clampX(bVr)) / 2, y: coarseY + 46, "text-anchor": "middle", class: "sfr-count" }, `${bCoarse} inside`));
    }
    if (frame === 3) {
      const y = 256;
      const xv = X(bV), xu = X(4), xw = X(5);
      svg.append(el("line", { x1: xv, x2: xv, y1: top + 22, y2: y + 8, class: "sfr-guide" }));
      svg.append(el("line", { x1: xu, x2: xv, y1: y, y2: y, class: "sfr-dist sfr-dist-win" }));
      svg.append(el("line", { x1: xv, x2: xw, y1: y + 8, y2: y + 8, class: "sfr-dist" }));
      svg.append(el("text", { x: (xu + xv) / 2, y: y - 6, "text-anchor": "middle", class: "sfr-small sfr-strong" }, dU));
      svg.append(el("text", { x: (xv + xw) / 2, y: y + 24, "text-anchor": "middle", class: "sfr-small" }, dW));
      svg.append(el("text", { x: width / 2, y: 302, "text-anchor": "middle", class: "sfr-result" }, width >= 560 ? "u = …04 wins → 0.30000000000000004" : "…04 → 0.30000000000000004"));
    }
  }

  function setFrame(nextFrame) {
    const old = domain;
    frame = nextFrame;
    const target = frame === 3 ? ZOOM : WIDE;
    label.textContent = `Frame ${frame + 1} of 4`;
    caption.textContent = captions[frame];
    box.setAttribute("aria-label", captions[frame]);
    prev.disabled = frame === 0;
    next.disabled = frame === 3;
    setParam("frame", frame === 0 ? null : String(frame + 1));
    cancelAnimationFrame(anim);
    if (reduceMotion || (old[0] === target[0] && old[1] === target[1])) { domain = target; draw(); return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 450);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      domain = [old[0] + (target[0] - old[0]) * e, old[1] + (target[1] - old[1]) * e];
      draw();
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  prev.addEventListener("click", () => setFrame(Math.max(0, frame - 1)));
  next.addEventListener("click", () => setFrame(Math.min(3, frame + 1)));
  onResize(box, draw);
  domain = frame === 3 ? ZOOM : WIDE;
  setFrame(frame);
}

// ---------------------------------------------------------------------------
// 2. Warm-up: an abstract drawer over six rulers
// ---------------------------------------------------------------------------

function initWarm() {
  const box = document.getElementById("sfr-warm-svg");
  if (!box) return;
  const widthInput = document.getElementById("sfr-warm-width");
  const posInput = document.getElementById("sfr-warm-pos");
  const readout = document.getElementById("sfr-warm-readout");
  const ROWS = [4, 3, 2, 1, 0, -1];

  if (params.has("W")) {
    const w = Number(params.get("W"));
    if (w >= 1 && w < 1000) widthInput.value = String(Math.round(Math.log10(w) * 1000));
  }
  if (params.has("pos")) posInput.value = String(Math.max(0, Math.min(1000, Number(params.get("pos")) || 0)));

  // All lengths in milli-units (integers), so edge cases are exact.
  function state() {
    let W = Number((10 ** (Number(widthInput.value) / 1000)).toPrecision(3));
    if (W >= 1000) W = 999;
    const Wm = Math.round(W * 1000);
    const k = String(Wm).length - 4; // Wm in [1000, 999000]
    const viewM = 20 * 10 ** k * 1000;
    const xM = Math.round((Number(posInput.value) / 1000) * (viewM - Wm));
    return { W, Wm, k, viewM, xM };
  }
  const count = (xM, Wm, spM) => Math.floor((xM + Wm) / spM) - Math.ceil(xM / spM) + 1;

  let dragging = null;

  function draw() {
    const { W, Wm, k, viewM, xM } = state();
    const rowH = 44, top = 8;
    const height = top + ROWS.length * rowH + 8;
    const { svg, width } = newSvg(box, height);
    const mL = 10, mR = 10, plotW = width - mL - mR;
    const X = (m) => mL + (m / viewM) * plotW;
    const counts = [];
    const labels = [];

    ROWS.forEach((j, i) => {
      const y = top + i * rowH;
      const base = y + 30;
      const spM = 10 ** (j + 3);
      const role = j === k + 1 ? "coarse" : j === k ? "fine" : "";
      if (role) svg.append(el("rect", { x: 0, y, width, height: rowH, class: "sfr-row-hl" }));
      svg.append(el("line", { x1: mL, x2: width - mR, y1: base, y2: base, class: "sfr-baseline" }));
      const px = (spM / viewM) * plotW;
      if (px < 2.2) {
        svg.append(el("rect", { x: mL, y: base - 5, width: plotW, height: 10, class: "sfr-dense" }));
        svg.append(el("rect", { x: X(xM), y: base - 5, width: X(xM + Wm) - X(xM), height: 10, class: "sfr-dense sfr-dense-in" }));
      } else {
        for (let m = 0; m * spM <= viewM; m++) {
          const at = m * spM;
          const inside = at >= xM && at <= xM + Wm;
          svg.append(el("line", { x1: X(at), x2: X(at), y1: base - (role ? 8 : 6), y2: base + (role ? 8 : 6), class: `sfr-tick${inside ? " sfr-tick-in" : ""}${inside && role === "coarse" ? " sfr-tick-hit" : ""}` }));
        }
      }
      const n = count(xM, Wm, spM);
      counts.push({ j, n, role });
      const name = `10${sup(j)}${role ? ` · ${role}` : ""}`;
      labels.push(el("text", { x: mL, y: y + 14, class: `sfr-row-label sfr-halo${role ? " sfr-row-label-hl" : ""}` }, name));
      labels.push(el("text", { x: width - mR, y: y + 14, "text-anchor": "end", class: `sfr-count sfr-halo${role ? " sfr-strong" : ""}` }, `${n} inside`));
    });

    // the drawer
    const bx = X(xM), bw = Math.max(2, X(xM + Wm) - X(xM));
    const band = el("rect", { x: bx, y: top + 18, width: bw, height: ROWS.length * rowH - 18, class: "sfr-band sfr-drawer" });
    svg.append(band);
    svg.append(el("line", { x1: bx, x2: bx, y1: top + 18, y2: top + ROWS.length * rowH, class: "sfr-edge" }));
    svg.append(el("line", { x1: bx + bw, x2: bx + bw, y1: top + 18, y2: top + ROWS.length * rowH, class: "sfr-edge" }));
    svg.append(...labels);
    band.addEventListener("pointerdown", (event) => {
      dragging = { startX: event.clientX, startPos: Number(posInput.value), span: plotW * (1 - Wm / viewM) };
      box.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    const fine = counts.find((c) => c.role === "fine");
    const coarse = counts.find((c) => c.role === "coarse");
    readout.innerHTML = `W = <strong>${W}</strong>, so k = ${k} (10${sup(k)} ≤ W &lt; 10${sup(k + 1)}). ` +
      `Coarse ruler 10${sup(k + 1)}: <strong>${coarse.n}</strong> tick${coarse.n === 1 ? "" : "s"} inside (never more than 1). ` +
      `Fine ruler 10${sup(k)}: <strong>${fine.n}</strong> inside (never fewer than 1).`;
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", `Drawer of width ${W} over six rulers. ` + counts.map((c) => `Spacing 10 to the ${c.j}: ${c.n} ticks inside.`).join(" "));
  }

  box.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const delta = ((event.clientX - dragging.startX) / Math.max(1, dragging.span)) * 1000;
    posInput.value = String(Math.max(0, Math.min(1000, Math.round(dragging.startPos + delta))));
    update();
  });
  const stop = () => { dragging = null; };
  box.addEventListener("pointerup", stop);
  box.addEventListener("pointercancel", stop);

  function update() {
    draw();
    setParam("W", String(state().W));
    setParam("pos", posInput.value);
  }
  widthInput.addEventListener("input", update);
  posInput.addEventListener("input", update);
  onResize(box, draw);
  draw();
}

// ---------------------------------------------------------------------------
// 3. Main explorable: five rulers over a real double
// ---------------------------------------------------------------------------

const PATH_TEXT = {
  "u'": "u′ is inside: the coarse tick at or below v",
  "w'": "w′ is inside: the coarse tick above v",
  u: "no coarse tick; only u is inside",
  w: "no coarse tick; only w is inside",
  "u-closer": "no coarse tick; u and w are both inside, u is closer",
  "w-closer": "no coarse tick; u and w are both inside, w is closer",
  tie: "no coarse tick; u and w are both inside and exactly as close: the even one wins",
};

function widthText(a) {
  const pow = `2${sup(a.q)}`;
  const real = (a.irregular ? 0.75 : 1) * 2 ** a.q;
  return `${a.irregular ? `¾ · ${pow}` : pow} ≈ ${Number(real.toPrecision(4))}`;
}

function resultLine(a) {
  const R = a.digits * pow10(a.exp - a.k); // the chosen tick in scaled units
  const zeros = trailingZeros(R);
  const name = { "u'": "u′", "w'": "w′", u: "u", w: "w", "u-closer": "u", "w-closer": "w", tie: (a.s & 1n) === 0n ? "u" : "w" }[a.path];
  const strip = zeros ? ` = ${a.f} × 10${sup(a.fe)} (${zeros} trailing zero${zeros === 1 ? "" : "s"} stripped)` : "";
  return `${name} = ${R} × 10${sup(a.k)}${strip} → <strong>${a.negative ? "−" : ""}${a.text}</strong>`;
}

function initMain() {
  const box = document.getElementById("sfr-main-svg");
  if (!box) return;
  const chips = document.getElementById("sfr-presets");
  const form = document.getElementById("sfr-form");
  const input = document.getElementById("sfr-input");
  const error = document.getElementById("sfr-error");
  const binade = document.getElementById("sfr-binade");
  const binadeOut = document.getElementById("sfr-binade-readout");
  const readout = document.getElementById("sfr-main-readout");
  const trace = document.getElementById("sfr-trace");
  const traceHead = document.getElementById("sfr-trace-head");

  let current = null;

  for (const preset of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.label;
    button.dataset.input = preset.input;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => load(preset.input));
    chips.append(button);
  }

  function load(text, { fromBinade = false } = {}) {
    const value = parseInput(text);
    if (value === null || !Number.isFinite(value) || value === 0) {
      error.textContent = value === 0 ? "Zero has no rounding interval to show." : "Enter a finite, nonzero number.";
      return false;
    }
    error.textContent = "";
    current = analyze(value);
    current.input = text;
    input.value = text;
    for (const button of chips.children) button.setAttribute("aria-pressed", String(button.dataset.input === text));
    if (!fromBinade) syncBinade();
    setParam("x", text);
    draw();
    renderReadout();
    renderTrace(trace, traceHead, current);
    return true;
  }

  function syncBinade() {
    const a = current;
    const subnormal = a.q === Q_MIN && a.c < C_MIN;
    const lo = subnormal ? 1n : C_MIN, span = subnormal ? C_MIN - 2n : C_MIN - 1n;
    binade.value = String(Number(((a.c - lo) * 1000n + span / 2n) / span));
  }

  function renderBinadeReadout() {
    const a = current;
    binadeOut.innerHTML = `c = ${a.c}, q = ${a.q} (fixed) → k = <strong>${a.k}</strong>${a.irregular ? " (power of two: ¾-width interval)" : ""}`;
  }

  binade.addEventListener("input", () => {
    const a = current;
    const subnormal = a.q === Q_MIN && a.c < C_MIN;
    const lo = subnormal ? 1n : C_MIN, span = subnormal ? C_MIN - 2n : C_MIN - 1n;
    const c = lo + (span * BigInt(binade.value)) / 1000n;
    const value = doubleOf(c, a.q) * (a.negative ? -1 : 1);
    load(String(value), { fromBinade: true });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    load(input.value.trim());
  });

  for (const button of document.querySelectorAll(".sfr-try")) {
    button.addEventListener("click", () => {
      if (!load(button.dataset.x)) return;
      const fig = document.getElementById("sfr-main");
      const rect = fig.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.5) fig.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  function renderReadout() {
    const a = current;
    const lines = [];
    lines.push(`v = ${a.negative ? "−" : ""}${String(a.value)} = ${a.c} × 2${sup(a.q)} · c is ${a.closed ? "even → edges included [ ]" : "odd → edges excluded ( )"}`);
    lines.push(`width = ${widthText(a)} → <strong>k = ${a.k}</strong>. Scaled by 10${sup(-a.k)}: V<sub>l</sub> = ${formatR(a.Vl)}, V = ${formatR(a.V)}, V<sub>r</sub> = ${formatR(a.Vr)} (width ${formatR(a.width)})`);
    if (a.coarseChecked) {
      lines.push(`coarse ruler 10${sup(a.k + 1)}: u′ = ${a.uP} ${a.uPin ? "✓ inside" : "✗ outside"}, w′ = ${a.wP} ${a.wPin ? "✓ inside" : "✗ outside"}`);
    } else {
      lines.push(`s = ${a.s} &lt; 10: coarse step skipped (u′ would be 0)`);
    }
    if (!(a.path === "u'" || a.path === "w'")) {
      lines.push(`fine ruler 10${sup(a.k)}: u = ${a.s} ${a.uIn ? "✓" : "✗"}, w = ${a.t} ${a.wIn ? "✓" : "✗"}; ${PATH_TEXT[a.path]}`);
    } else {
      lines.push(PATH_TEXT[a.path]);
    }
    lines.push(`result: ${resultLine(a)}`);
    readout.innerHTML = lines.map((line) => `<div>${line}</div>`).join("");
    renderBinadeReadout();
  }

  function draw() {
    const a = current;
    if (!a) return;
    const rowH = 68, y0 = 70, rows = [2, 1, 0, -1, -2];
    const height = y0 + rows.length * rowH + 30;
    const { svg, width } = newSvg(box, height);
    const mL = 12, mR = 12, plotW = width - mL - mR;
    const origin = a.s;
    const vl = offsetNumber(a.Vl, origin), vr = offsetNumber(a.Vr, origin), vv = offsetNumber(a.V, origin);
    const mid = (vl + vr) / 2, half = ((vr - vl) / 2) * 2.25;
    const d0 = mid - half, d1 = mid + half;
    const X = (t) => mL + ((t - d0) / (d1 - d0)) * plotW;
    const pxUnit = plotW / (d1 - d0);
    const SC = 1_000_000n;
    const loR = { n: origin * SC + BigInt(Math.floor(d0 * 1e6)), d: SC };
    const hiR = { n: origin * SC + BigInt(Math.ceil(d1 * 1e6)), d: SC };
    const bottom = y0 + rows.length * rowH - 6;

    // Result tick (scaled integer) and how many rulers it sits on.
    const resultScaled = a.digits * pow10(a.exp - a.k);
    const resultTz = trailingZeros(resultScaled);

    // highlight coarse/fine rows
    rows.forEach((j, i) => {
      if (j === 1 || j === 0) svg.append(el("rect", { x: 0, y: y0 + i * rowH, width, height: rowH, class: "sfr-row-hl" }));
    });

    // band and edges
    svg.append(el("rect", { x: X(vl), y: 22, width: X(vr) - X(vl), height: bottom - 22, class: "sfr-band" }));
    for (const x of [vl, vr]) svg.append(el("line", { x1: X(x), x2: X(x), y1: 22, y2: bottom, class: a.closed ? "sfr-edge" : "sfr-edge sfr-edge-open" }));
    svg.append(el("text", { x: X(vl), y: 52, "text-anchor": "start", class: "sfr-bracket" }, a.closed ? "[" : "("));
    svg.append(el("text", { x: X(vr), y: 52, "text-anchor": "end", class: "sfr-bracket" }, a.closed ? "]" : ")"));

    // v and neighbours
    const nb = [[offsetNumber(a.lowerNeighbour, origin), "v⁻"], [offsetNumber(a.upperNeighbour, origin), "v⁺"]];
    for (const [x, name] of nb) {
      if (x < d0 || x > d1) continue;
      svg.append(el("circle", { cx: X(x), cy: 40, r: 4, class: "sfr-nbdot" }));
      svg.append(el("text", { x: X(x), y: 20, "text-anchor": "middle", class: "sfr-small" }, name));
    }
    svg.append(el("circle", { cx: X(vv), cy: 40, r: 5.5, class: "sfr-vdot" }));
    svg.append(el("text", { x: X(vv), y: 20, "text-anchor": "middle", class: "sfr-vlabel" }, "v"));

    // The chosen tick: red line through every ruler it belongs to.
    const xr = X(Number(resultScaled - origin));
    const topRow = Math.min(2, resultTz); // highest shown row containing it
    const rowIndex = (j) => rows.indexOf(j);
    const yTop = y0 + rowIndex(topRow) * rowH + 30;
    const yBot = y0 + rowIndex(0) * rowH + 54;
    svg.append(el("line", { x1: xr, x2: xr, y1: yTop, y2: yBot, class: "sfr-hitline" }));
    const note = resultTz >= 2 ? `on every ruler up to 10${sup(a.k + resultTz)}` : "";
    if (note) {
      const anchor = xr + 10 + note.length * 6.6 > width - mR ? "end" : "start";
      svg.append(el("text", { x: xr + (anchor === "start" ? 6 : -6), y: yTop + 4, "text-anchor": anchor, class: "sfr-small sfr-strong sfr-halo" }, note));
    }

    rows.forEach((j, i) => {
      const y = y0 + i * rowH;
      const base = y + 44;
      const role = j === 1 ? "coarse" : j === 0 ? "fine" : "";
      svg.append(el("line", { x1: mL, x2: width - mR, y1: base, y2: base, class: "sfr-baseline" }));
      const px = 10 ** j * pxUnit;
      if (px < 2.2) {
        svg.append(el("rect", { x: mL, y: base - 5, width: plotW, height: 10, class: "sfr-dense" }));
        svg.append(el("rect", { x: X(vl), y: base - 5, width: X(vr) - X(vl), height: 10, class: "sfr-dense sfr-dense-in" }));
      } else {
        const ticks = ticksBetween(loR, hiR, j, 3000) || [];
        for (const m of ticks) {
          const x = X(tickOffset(m, j, origin));
          const inside = insideR(a, tickR(m, j));
          const h = role ? 9 : 6;
          let cls = "sfr-tick";
          if (inside) cls += role === "fine" || !role ? " sfr-tick-in" : " sfr-tick-hit";
          svg.append(el("line", { x1: x, x2: x, y1: base - h, y2: base + h, class: cls }));
          if (j === 0 && px >= 19) svg.append(el("text", { x, y: base + 21, "text-anchor": "middle", class: "sfr-ticklabel" }, last2(m)));
        }
      }
      const n = countTicks(a, j);
      const name = `10${sup(a.k + j)}${role ? ` · ${role}` : ""}`;
      svg.append(el("text", { x: mL, y: y + 13, class: `sfr-row-label sfr-halo${role ? " sfr-row-label-hl" : ""}` }, name));
      svg.append(el("text", { x: width - mR, y: y + 13, "text-anchor": "end", class: `sfr-count sfr-halo${role ? " sfr-strong" : ""}` }, `${n} inside`));

      // candidate markers
      const marker = (value, name, verdict, dim) => {
        const x = Number(value - origin);
        const text = `${name}${verdict === null ? "" : verdict ? " ✓" : " ✗"}`;
        const cls = `sfr-cand${dim ? " sfr-dim" : ""}${verdict ? " sfr-cand-in" : ""}`;
        if (x < d0) {
          svg.append(el("text", { x: mL + 2, y: base + 20, "text-anchor": "start", class: cls }, `◂ ${text}`));
        } else if (x > d1) {
          svg.append(el("text", { x: width - mR - 2, y: base + 20, "text-anchor": "end", class: cls }, `${text} ▸`));
        } else {
          svg.append(el("path", { d: `M${X(x) - 4},${base - 15} L${X(x) + 4},${base - 15} L${X(x)},${base - 10} Z`, class: `sfr-cand-arrow${dim ? " sfr-dim" : ""}` }));
          const isResult = value === resultScaled;
          svg.append(el("text", { x: X(x) + (isResult ? -7 : 0), y: base - 17, "text-anchor": isResult ? "end" : "middle", class: cls }, text));
        }
      };
      const coarseReturned = a.path === "u'" || a.path === "w'";
      if (j === 1) {
        const skipped = !a.coarseChecked;
        marker(a.uP, "u′", skipped ? null : a.uPin, skipped);
        if (!(a.path === "u'")) marker(a.wP, "w′", skipped ? null : a.wPin, skipped);
        else marker(a.wP, "w′", null, true);
      }
      if (j === 0) {
        marker(a.s, "u", coarseReturned ? null : a.uIn, coarseReturned);
        marker(a.t, "w", coarseReturned ? null : a.wIn, coarseReturned);
      }
    });

    // axis note
    const first = ticksBetween(loR, hiR, 0, 1000);
    const range = first && first.length ? `${first[0]} … ${first.length > 1 ? last2(first.at(-1)) : ""}` : "";
    svg.append(el("text", { x: mL, y: height - 8, class: "sfr-small" }, `×10${sup(-a.k)} · fine ticks: ${range}`));

    box.setAttribute("aria-label",
      `Rounding interval of ${a.text} scaled by 10 to the ${-a.k}: from ${formatR(a.Vl)} to ${formatR(a.Vr)}, ${a.closed ? "closed" : "open"}. ` +
      rows.map((j) => `Ruler 10 to the ${a.k + j}: ${countTicks(a, j)} ticks inside.`).join(" ") +
      ` Result ${a.text}.`);
  }

  onResize(box, draw);
  const initial = params.get("x") || "0.3";
  if (!load(initial)) load("0.3");
}

// ---------------------------------------------------------------------------
// 4. Code trace
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTrace(list, head, a) {
  const sub = (n, d) => formatR({ n, d });
  const le = a.closed ? "≤" : "<";
  const mark = (b) => (b ? "✓" : "✗");
  const coarseRet = a.path === "u'" || a.path === "w'";
  const reached = {
    coarse: a.coarseChecked,
    wP: a.coarseChecked && !a.uPin,
    fine: !coarseRet,
    l16: !coarseRet && !(a.path === "u"),
    l17: !coarseRet && !["u", "w"].includes(a.path),
    l18: !coarseRet && !["u", "w", "u-closer"].includes(a.path),
    l19: a.path === "tie",
  };
  const dU = sub(a.V.n - a.s * a.V.d, a.V.d);
  const dW = sub(a.t * a.V.d - a.V.n, a.V.d);
  const ret = (p) => a.path === p;
  const lines = [
    { code: "c, q = decompose(v)", note: `c = ${a.c}, q = ${a.q}` },
    { code: "irregular = (c == 2⁵² and q > −1074)", note: a.irregular ? "true: v is a power of two" : "false" },
    { code: "closed = (c is even)", note: `${a.closed} → ends ${a.closed ? "included" : "excluded"}` },
    { code: "lo = irregular ? c − ¼ : c − ½", note: `${a.c - 1n}.${a.irregular ? "75" : "5"}` },
    { code: "width = (c + ½ − lo) · 2^q", note: widthText(a) },
    { code: "k = ⌊log₁₀ width⌋", note: `${a.k}` },
    { code: "Vl = lo · 2^q · 10^−k", note: formatR(a.Vl) },
    { code: "V  = c · 2^q · 10^−k", note: formatR(a.V) },
    { code: "Vr = (c + ½) · 2^q · 10^−k", note: formatR(a.Vr) },
    { code: "in(x) = closed ? Vl ≤ x ≤ Vr : Vl < x < Vr", note: "" },
    { code: "s = ⌊V⌋", note: `${a.s}` },
    { code: "if s ≥ 10:", note: `${mark(a.coarseChecked)}`, test: true },
    { code: "  s′ = ⌊s/10⌋; u′ = 10·s′; w′ = u′ + 10", note: `u′ = ${a.uP}, w′ = ${a.wP}`, run: reached.coarse },
    { code: "  if in(u′): return s′ × 10^(k+1)", note: `Vl ${le} u′? ${mark(a.uPin)}`, run: reached.coarse, ret: ret("u'"), test: true },
    { code: "  if in(w′): return (s′+1) × 10^(k+1)", note: `w′ ${le} Vr? ${mark(a.wPin)}`, run: reached.wP, ret: ret("w'"), test: true },
    { code: "u = s; w = s + 1", note: `u = ${a.s}, w = ${a.t}`, run: reached.fine },
    { code: "if in(u) and not in(w): return u × 10^k", note: `Vl ${le} u? ${mark(a.uIn)}   w ${le} Vr? ${mark(a.wIn)}`, run: reached.fine, ret: ret("u"), test: true },
    { code: "if in(w) and not in(u): return w × 10^k", note: `${mark(a.wIn && !a.uIn)}`, run: reached.l16, ret: ret("w"), test: true },
    { code: "if V − u < w − V: return u × 10^k", note: `${dU} < ${dW}? ${mark(a.cmpClose < 0)}`, run: reached.l17, ret: ret("u-closer"), test: true },
    { code: "if V − u > w − V: return w × 10^k", note: `${dU} > ${dW}? ${mark(a.cmpClose > 0)}`, run: reached.l18, ret: ret("w-closer"), test: true },
    { code: "return (u even ? u : w) × 10^k", note: `tie: ${a.s} is ${a.s % 2n === 0n ? "even" : "odd"}`, run: reached.l19, ret: ret("tie") },
    { code: "strip trailing zeros, format", note: a.zeros ? `${a.digits} × 10${sup(a.exp)} → ${a.f} × 10${sup(a.fe)} → ${a.text}` : `${a.digits} × 10${sup(a.exp)} (no zeros) → ${a.text}` },
  ];
  head.innerHTML = `Tracing <strong>${a.negative ? "−" : ""}${a.text}</strong>${a.negative ? " (the sign is handled separately)" : ""}. Lines 14, 15 and 17 test the four candidates u′, w′, u and w.`;
  list.replaceChildren();
  lines.forEach((line, i) => {
    const li = document.createElement("li");
    const run = line.run !== false;
    li.className = `${run ? "" : "sfr-skip"}${line.ret ? " sfr-ret" : ""}`;
    const num = document.createElement("span");
    num.className = "sfr-ln";
    num.textContent = String(i + 1);
    const code = document.createElement("code");
    code.textContent = line.code;
    const note = document.createElement("span");
    note.className = "sfr-val";
    const text = run ? line.note + (line.ret ? "  → return" : "") : "not reached";
    note.innerHTML = escapeHtml(text).replace(/✓/g, '<b class="sfr-yes">✓</b>').replace(/✗/g, '<b class="sfr-no">✗</b>');
    li.append(num, code, note);
    list.append(li);
  });
}

// ---------------------------------------------------------------------------

initHook();
initWarm();
initMain();

