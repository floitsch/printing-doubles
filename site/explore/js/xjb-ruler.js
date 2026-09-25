// DOM and SVG for the "last-digit ruler" explanation of xjb.
import {
  analyze, evaluateInput, decimalString, gridRows, neighbourBars, readBackReport, registers,
  hex64, PRESETS, POWERS_OF_TWO, powerOfTwo, nextTrap, randomDouble, nextDown, nextUp,
  exactDecimal, cmp, rat, toNumber, sub, twoTo,
} from "./xjb-ruler-model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

const SUP = { "-": "⁻", "−": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (n) => String(n).split("").map((ch) => SUP[ch] ?? ch).join("");
const minus = (n) => String(n).replace("-", "−");
const dec = (r, places = 10) => decimalString(r, places);
const ZERO = rat(0n);
const ONE = rat(1n);

// ---------------------------------------------------------------------------
// Number formatting helpers (all from exact values).

/** The exact decimal value of |v|, abbreviated to about `maxDigits` significant digits. */
function exactShort(value, maxDigits = 40) {
  const text = exactDecimal(Math.abs(value));
  const [intPart, fracPart = ""] = text.split(".");
  const significant = (intPart + fracPart).replace(/^0+/, "");
  const exponent10 = intPart !== "0" ? intPart.length - 1 : -(fracPart.search(/[1-9]/) + 1);
  if (exponent10 >= -6 && exponent10 <= 30) {
    if (significant.length <= maxDigits) return text;
    let seen = 0;
    let started = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ".") continue;
      if (text[i] !== "0") started = true;
      if (started && ++seen === maxDigits) return `${text.slice(0, i + 1)}…`;
    }
    return text;
  }
  const digits = significant.replace(/0+$/, "");
  const cut = digits.length > maxDigits;
  return `${digits[0]}.${digits.slice(1, maxDigits)}${cut ? "…" : ""} × 10${sup(exponent10)}`;
}

/** e if r = ±2^e exactly, else null. */
function powerOfTwoExponent(r) {
  const num = r.num < 0n ? -r.num : r.num;
  const isPow2 = (x) => x > 0n && (x & (x - 1n)) === 0n;
  if (!isPow2(num) || !isPow2(r.den)) return null;
  return num.toString(2).length - r.den.toString(2).length;
}

function outcomeWord(a) {
  return a.outcome === "down" ? "down" : a.outcome === "up" ? "up" : "nearest";
}

// ---------------------------------------------------------------------------
// SVG helpers.

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function hostWidth(host) {
  return Math.max(280, Math.floor(host.clientWidth || 640));
}

// ---------------------------------------------------------------------------
// The ruler.

export const STEPS = ["Split", "Dot", "Bar", "Left end", "Right end", "Nearest tick", "Print"];
const LAST_STEP = STEPS.length - 1;

/**
 * Draw the ruler for analysis `a` into `host`.
 * opts: { step, neighbours, enterStep, trueBar (analysis), label }
 */
function drawRuler(host, a, opts = {}) {
  const step = opts.step ?? LAST_STEP;
  const W = hostWidth(host);
  const narrow = W < 520;
  const H = 208;
  const xMin = narrow ? -0.3 : -0.5;
  const xMax = a.lopsided ? (narrow ? 1.45 : 1.7) : (narrow ? 1.3 : 1.5);
  const pad = 14;
  const X = (x) => pad + ((x - xMin) / (xMax - xMin)) * (W - 2 * pad);
  const clampX = (x) => X(Math.max(xMin, Math.min(xMax, x)));
  const yTop = 22;
  const yBar = 50;
  const barH = 16;
  const yBase = 122;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "xjb-ruler-svg", role: "img" });
  svg.append(el("title", {}, opts.label || "Ruler"));
  const defs = el("defs");
  const marker = el("marker", { id: `${host.id}-arrow`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
  marker.append(el("path", { d: "M0,0 L10,5 L0,10 z", class: "xjb-ruler-arrowhead" }));
  defs.append(marker);
  const clip = el("clipPath", { id: `${host.id}-clip` });
  clip.append(el("rect", { x: pad, y: 0, width: W - 2 * pad, height: H }));
  defs.append(clip);
  svg.append(defs);

  const group = (cls, revealStep) => {
    const g = el("g", { class: cls });
    if (revealStep !== undefined && opts.enterStep === revealStep && !reducedMotion()) g.classList.add("xjb-ruler-enter");
    svg.append(g);
    return g;
  };

  const n = toNumber(a.n);
  const lo = toNumber(a.lower);
  const hi = toNumber(a.upper);

  // Cell backgrounds and baseline.
  const base = group("xjb-ruler-base");
  base.append(el("rect", { x: X(0), y: yTop - 8, width: X(1) - X(0), height: yBase - yTop + 26, class: "xjb-ruler-cell" }));
  base.append(el("line", { x1: X(xMin), x2: X(xMax), y1: yBase, y2: yBase, class: "xjb-ruler-axis faded" }));
  base.append(el("line", { x1: X(0), x2: X(1), y1: yBase, y2: yBase, class: "xjb-ruler-axis" }));

  // Ticks.
  const ticks = group("xjb-ruler-ticks");
  const inside = (x) => {
    const r = rat(BigInt(x), 10n);
    const p = cmp(r, a.lower);
    const q = cmp(r, a.upper);
    return (p > 0 || (a.closed && p === 0)) && (q < 0 || (a.closed && q === 0));
  };
  for (let j = Math.ceil(xMin * 10); j <= Math.floor(xMax * 10 + 1e-9); j++) {
    const x = X(j / 10);
    const major = j % 10 === 0;
    const inCell = j >= 0 && j <= 10;
    const candidate = step >= 2 && inside(j);
    const cls = `xjb-ruler-tick${major ? " major" : ""}${inCell ? "" : " faded"}${candidate ? " candidate" : ""}`;
    ticks.append(el("line", { x1: x, x2: x, y1: yBase - (major ? 16 : 8), y2: yBase + (major ? 10 : 6), class: cls }));
    if (j > 0 && j < 10) {
      ticks.append(el("text", { x, y: yBase + 24, class: `xjb-ruler-ticklabel${candidate ? " candidate" : ""}` }, String(j)));
    } else if (!inCell && !narrow && !major) {
      ticks.append(el("text", { x, y: yBase + 24, class: "xjb-ruler-ticklabel faded" }, String(((j % 10) + 10) % 10)));
    }
  }
  ticks.append(el("text", { x: X(0), y: yBase + 44, class: "xjb-ruler-endlabel" }, "m"));
  ticks.append(el("text", { x: X(1), y: yBase + 44, class: "xjb-ruler-endlabel" }, "m+1"));
  if (!narrow) {
    ticks.append(el("text", { x: X(-0.5) + 2, y: yBase + 44, class: "xjb-ruler-endlabel faded start" }, "m−1’s cell"));
    ticks.append(el("text", { x: X(xMax) - 2, y: yBase + 44, class: "xjb-ruler-endlabel faded end" }, "m+1’s cell"));
  }

  // Neighbour bars.
  if (step >= 2 && opts.neighbours) {
    const nb = group("xjb-ruler-neighbours", 2);
    for (const [name, bar] of Object.entries(opts.neighbours)) {
      if (!bar) continue;
      const l = toNumber(bar.lower);
      const u = toNumber(bar.upper);
      if (u < xMin || l > xMax) continue;
      const x1 = clampX(l);
      const x2 = clampX(u);
      nb.append(el("rect", { x: x1, y: yBar - barH / 2 + 3, width: Math.max(0, x2 - x1), height: barH - 6, class: "xjb-ruler-nbar", "clip-path": `url(#${host.id}-clip)` }));
      const at = toNumber(bar.at);
      if (at >= xMin && at <= xMax) nb.append(el("circle", { cx: X(at), cy: yBar, r: 3, class: "xjb-ruler-ndot" }));
      if (x2 - x1 > 34) nb.append(el("text", { x: (x1 + x2) / 2, y: yTop, class: "xjb-ruler-nlabel" }, name === "prev" ? "double below" : "double above"));
    }
  }

  // Drop lines from the bar ends to the axis, and the bar itself.
  if (step >= 2) {
    const bar = group("xjb-ruler-bar-group", 2);
    for (const x of [lo, hi]) {
      if (x >= xMin && x <= xMax) bar.append(el("line", { x1: X(x), x2: X(x), y1: yBar + barH / 2, y2: yBase, class: "xjb-ruler-drop" }));
    }
    const bx1 = clampX(lo);
    const bx2 = clampX(hi);
    const rect = el("rect", { x: bx1, y: yBar - barH / 2, width: bx2 - bx1, height: barH, class: `xjb-ruler-bar${a.symmetric ? " naive" : ""}` });
    if (opts.enterStep === 2 && !reducedMotion()) {
      rect.classList.add("xjb-ruler-grow");
      rect.style.transformOrigin = `${X(n)}px ${yBar}px`;
    }
    bar.append(rect);
    for (const [x, isLow] of [[lo, true], [hi, false]]) {
      if (x < xMin || x > xMax) continue;
      bar.append(el("circle", { cx: X(x), cy: yBar, r: 5, class: `xjb-ruler-cap${a.closed ? " closed" : " open"}${a.symmetric ? " naive" : ""}`, "data-end": isLow ? "low" : "high" }));
    }
    if (opts.trueBar) {
      const t = opts.trueBar;
      const tl = toNumber(t.lower);
      const tu = toNumber(t.upper);
      bar.append(el("line", { x1: clampX(tl), x2: clampX(tu), y1: yBar + barH / 2 + 8, y2: yBar + barH / 2 + 8, class: "xjb-ruler-truebar" }));
      bar.append(el("line", { x1: X(tl), x2: X(tl), y1: yBar + barH / 2 + 3, y2: yBar + barH / 2 + 13, class: "xjb-ruler-truebar" }));
      bar.append(el("text", { x: X(tl) + 4, y: yBar + barH / 2 + 22, class: "xjb-ruler-truelabel" }, "true bar starts here"));
    }
  }

  // The dot (v).
  if (step >= 1) {
    const dot = group("xjb-ruler-dot-group", 1);
    dot.append(el("line", { x1: X(n), x2: X(n), y1: yTop + 4, y2: yBar + barH / 2, class: "xjb-ruler-dotline" }));
    dot.append(el("circle", { cx: X(n), cy: yBar, r: 5.5, class: "xjb-ruler-dot" }));
    const needsNLabel = step < 2 || !opts.neighbours;
    dot.append(el("text", { x: X(n), y: yTop - 2, class: "xjb-ruler-vlabel" }, needsNLabel ? `v (n = ${dec(a.n, 3)})` : "v"));
  }

  // End tests.
  const endMark = (x, hit, stepIndex) => {
    if (step < stepIndex) return;
    const g = group("xjb-ruler-endtest", stepIndex);
    g.append(el("circle", { cx: X(x), cy: yBase, r: 10, class: `xjb-ruler-ring${hit ? " hit" : ""}` }));
    g.append(el("text", { x: X(x), y: yBase + 60, class: `xjb-ruler-ringlabel${hit ? " hit" : ""}` }, hit ? "inside" : "outside"));
  };
  endMark(0, a.downHit, 3);
  endMark(1, a.upHit, 4);

  // Nearest tick.
  if (step >= 5 && a.outcome === "nearest") {
    const g = group("xjb-ruler-nearest", 5);
    const from = X(n);
    const arrow = (tick, cls) => {
      const to = X(tick / 10);
      const mid = (from + to) / 2;
      const lift = Math.min(26, 8 + Math.abs(to - from) / 2);
      g.append(el("path", { d: `M${from},${yBar + barH / 2 + 2} Q${mid},${yBar + barH / 2 + lift + 22} ${to},${yBase - 12}`, class: cls, "marker-end": `url(#${host.id}-arrow)` }));
    };
    if (a.bumped) {
      arrow(a.roundedTick, "xjb-ruler-arrow rejected");
      g.append(el("text", { x: X(a.roundedTick / 10), y: yBase - 14, class: "xjb-ruler-note reject" }, "×"));
    }
    arrow(a.nearestTick, "xjb-ruler-arrow");
    if (a.tie) g.append(el("text", { x: X(n), y: yBase + 76, class: "xjb-ruler-note" }, `tie: 10n = ${dec(a.tenN, 2)} → even ${a.nearestTick}`));
  }

  // The printed result.
  if (step >= 6) {
    const g = group("xjb-ruler-result", 6);
    const x = X(a.digit / 10);
    g.append(el("path", { d: `M${x - 7},${yBase - 30} L${x + 7},${yBase - 30} L${x},${yBase - 18} z`, class: `xjb-ruler-out${a.roundTrips ? "" : " wrong"}` }));
    const label = a.outcome === "down" ? "d = 10m" : a.outcome === "up" ? "d = 10(m+1)" : `digit ${a.digit}`;
    const anchor = x < 70 ? "start" : x > W - 70 ? "end" : "middle";
    g.append(el("text", { x: x + (anchor === "start" ? -6 : anchor === "end" ? 6 : 0), y: yBase - 36, class: `xjb-ruler-outlabel ${anchor}${a.roundTrips ? "" : " wrong"}` }, label));
  }

  host.replaceChildren(svg);
}

/** The digit strip above the ruler: v, and v·10^(−k−1) split into m | digit | rest. */
function drawStrip(host, a) {
  const scale = -(a.k + 1);
  const nDigits = dec(a.n, 18);
  const [, fraction = "0"] = nDigits.split(".");
  const first = fraction[0] || "0";
  const rest = fraction.slice(1);
  const sign = a.negative ? "−" : "";
  host.innerHTML = `
    <div><span class="xjb-ruler-strip-label">v</span><span class="xjb-ruler-strip-value">${sign}${esc(exactShort(a.value))}</span></div>
    <div><span class="xjb-ruler-strip-label">|v| × 10${sup(scale)}</span><span class="xjb-ruler-strip-value"><b class="xjb-ruler-m" title="m">${a.m}</b>.<b class="xjb-ruler-digit" title="first digit of n: the last-digit position">${first}</b><span class="xjb-ruler-rest">${esc(rest)}</span></span></div>
    <div class="xjb-ruler-strip-legend"><span><b class="xjb-ruler-m">m</b> = all digits but the last</span><span><b class="xjb-ruler-digit">n</b> = the fraction; its first digit sits at 10${sup(minus(a.k))}</span></div>`;
}

// ---------------------------------------------------------------------------
// Text for the main ruler.

function endTestText(a, which) {
  if (which === "left") {
    const c = cmp(a.lower, ZERO);
    const lowName = a.lopsided && !a.symmetric ? "n − h/2" : "n − h";
    if (c < 0) return `The bar starts at ${lowName} = ${dec(a.lower, 4)}, left of 0: m is inside.`;
    if (c === 0) return `The bar starts exactly at 0. ${a.closed ? "c is even, so the end is included: m is inside." : "c is odd, so the end is excluded: m is outside."}`;
    return `The bar starts at ${lowName} = ${dec(a.lower, 4)}, right of 0: m is outside.`;
  }
  const c = cmp(a.upper, ONE);
  if (c > 0) return `The bar ends at n + h = ${dec(a.upper, 4)}, past 1: m+1 is inside.`;
  if (c === 0) return `The bar ends exactly at 1. ${a.closed ? "c is even, so the end is included: m+1 is inside." : "c is odd, so the end is excluded: m+1 is outside."}`;
  return `The bar ends at n + h = ${dec(a.upper, 4)}, before 1: m+1 is outside.`;
}

function narration(a, step) {
  const scale = -(a.k + 1);
  switch (step) {
    case 0: return `Scale by 10${sup(minus(scale))}: m = ${a.m} is fixed, and only the fraction n decides the last digit. The ruler is the cell from m to m+1, with ticks at tenths.`;
    case 1: return `v sits at n = ${dec(a.n, 10)} on the ruler.`;
    case 2: {
      const width = `${dec(a.widthTicks, 3)} ticks wide`;
      if (a.lopsided && !a.symmetric) return `The bar reaches h/2 = ${dec(a.hLow, 6)} to the left and h = ${dec(a.h, 6)} to the right: [${dec(a.lower, 4)}, ${dec(a.upper, 4)}], ${width}. Red ticks are inside.`;
      return `The bar reaches h = ${dec(a.h, 6)} each way: [${dec(a.lower, 4)}, ${dec(a.upper, 4)}], ${width}. Red ticks are inside.`;
    }
    case 3: return `Left end: ${endTestText(a, "left")}${a.downHit ? " Drop the last digit." : ""}`;
    case 4: return a.downHit ? "Right end: no need to look, since the bar cannot reach both ends." : `Right end: ${endTestText(a, "right")}${a.upHit ? " Carry." : ""}`;
    case 5:
      if (a.outcome !== "nearest") return "Nearest tick: not needed, because an end of the cell is inside the bar.";
      if (a.bumped) return `Nearest tick: round(10n) = round(${dec(a.tenN, 4)}) = ${a.roundedTick}, but that tick is off the short left end. Take ${a.nearestTick}, the next tick up.`;
      if (a.tie) return `Nearest tick: 10n = ${dec(a.tenN, 4)} is an exact tie, so round to the even digit ${a.nearestTick}.`;
      return `Nearest tick: round(10n) = round(${dec(a.tenN, 4)}) = ${a.nearestTick}. It is inside the bar without any check.`;
    default: {
      const d = a.d.toString();
      const strip = a.stripped ? `, strip ${a.stripped} zero${a.stripped > 1 ? "s" : ""}` : "";
      const coef = `${a.negative ? "−" : ""}${a.coefficient < 0n ? -a.coefficient : a.coefficient} × 10${sup(minus(a.exponent))}`;
      return a.stripped ? `Print: d = ${d}${strip} → ${coef} = “${a.text}”.` : `Print: d × 10${sup(minus(a.k))} = ${coef} = “${a.text}”.`;
    }
  }
}

function drawCases(host, a, step) {
  const lowName = a.lopsided && !a.symmetric ? "h/2" : "h";
  const le = a.closed ? "≤" : "<";
  const cards = [
    { key: "down", title: "Left end inside → drop the digit", formula: "d = 10m", test: `n ${le} ${lowName}: ${dec(a.n, 4)} ${le} ${dec(a.hLow, 4)}?`, answer: a.downHit, at: 3 },
    { key: "up", title: "Right end inside → carry", formula: "d = 10(m+1)", test: `1 − n ${le} h: ${dec(a.oneMinusN, 4)} ${le} ${dec(a.h, 4)}?`, answer: a.upHit, at: 4 },
    { key: "nearest", title: "Neither → nearest tick", formula: "d = 10m + round(10n)", test: `round(${dec(a.tenN, 3)}) = ${a.roundedTick}${a.tie ? " (tie → even)" : ""}${a.bumped ? `, off the short end → ${a.nearestTick}` : ""}`, answer: null, at: 5 },
  ];
  const decidedAt = a.outcome === "down" ? 3 : a.outcome === "up" ? 4 : 5;
  host.innerHTML = cards.map((card) => {
    const evaluated = step >= card.at;
    const skipped = evaluated && step >= decidedAt && card.at > decidedAt;
    const chosen = step >= decidedAt && a.outcome === card.key;
    let result = "";
    if (evaluated && !skipped) result = card.answer === null ? "" : card.answer ? " <b>yes</b>" : " <b>no</b>";
    if (skipped) result = " <i>not needed</i>";
    return `<div class="xjb-ruler-case${chosen ? " chosen" : ""}${skipped ? " skipped" : ""}"><strong>${card.title}</strong><code>${card.formula}</code><span>${evaluated ? esc(card.test) + result : "…"}</span></div>`;
  }).join("");
}

function drawReadout(host, a) {
  const q = a.q;
  const scale = -(a.k + 1);
  const rows = [];
  rows.push(["double", `c = ${a.c}, q = ${minus(q)}; c is ${a.even ? "even: the ends are included" : "odd: the ends are excluded"}${a.lopsided ? "; power of two: lopsided bar" : ""}`]);
  rows.push(["zoom", a.lopsided && !a.symmetric
    ? `k = ⌊log₁₀(¾·2${sup(minus(q))})⌋ = ${minus(a.k)}, so scale by 10${sup(minus(scale))}`
    : `k = ⌊q·log₁₀2⌋ = ${minus(a.k)}, so scale by 10${sup(minus(scale))}`]);
  rows.push(["split", `m = ${a.m}, n = ${dec(a.n, 12)}`]);
  rows.push(["half-width", a.lopsided && !a.symmetric
    ? `h = 2${sup(minus(q - 1))}·10${sup(minus(scale))} = ${dec(a.h, 10)} (right), h/2 = ${dec(a.hLow, 10)} (left)`
    : `h = 2${sup(minus(q - 1))}·10${sup(minus(scale))} = ${dec(a.h, 10)}`]);
  rows.push(["bar", `[${dec(a.lower, 8)}, ${dec(a.upper, 8)}], ${a.closed ? "closed" : "open"}, ${dec(a.widthTicks, 4)} ticks wide`]);
  rows.push(["outcome", `${outcomeWord(a)}: d = ${a.d}${a.stripped ? ` → strip ${a.stripped} zero${a.stripped > 1 ? "s" : ""}` : ""} → <strong>${esc(a.text)}</strong>`]);
  const same = a.roundTrips ? `reads back as v` : `reads back as a <em>different</em> double`;
  const js = String(Math.abs(a.value));
  rows.push(["check", `Number("${esc(a.asciiText)}") ${same}; JavaScript’s String(v) is “${esc((a.negative ? "−" : "") + js)}”${js === a.text.replace("−", "") ? " (same digits)" : ""}`]);
  host.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

// ---------------------------------------------------------------------------
// State for the main ruler.

const main = { input: "0.1+0.2", value: 0.1 + 0.2, step: LAST_STEP, neighbours: true, playing: null, enterStep: null };
let mainAnalysis = null;

function setMainValue(value, input, { keepStep = false } = {}) {
  let a;
  try {
    a = analyze(value);
  } catch (error) {
    $("xjb-ruler-error").textContent = error.message;
    return false;
  }
  $("xjb-ruler-error").textContent = "";
  main.value = value;
  main.input = input ?? String(value);
  mainAnalysis = a;
  if (!keepStep) main.step = LAST_STEP;
  main.enterStep = null;
  $("xjb-ruler-input").value = main.input;
  renderMain();
  renderRegisters();
  writeUrl();
  return true;
}

function renderMain() {
  const a = mainAnalysis;
  drawStrip($("xjb-ruler-strip"), a);
  drawRuler($("xjb-ruler-svg"), a, {
    step: main.step,
    neighbours: main.neighbours ? neighbourBars(a) : null,
    enterStep: main.enterStep,
    label: `Ruler for ${a.text}: m = ${a.m}, n = ${dec(a.n, 6)}, bar from ${dec(a.lower, 4)} to ${dec(a.upper, 4)}, outcome ${outcomeWord(a)}, printed as ${a.text}.`,
  });
  $("xjb-ruler-narration").innerHTML = `<b>Step ${main.step + 1}/${STEPS.length} · ${STEPS[main.step]}.</b> ${esc(narration(a, main.step))}`;
  drawCases($("xjb-ruler-cases"), a, main.step);
  drawReadout($("xjb-ruler-readout"), a);
  for (const [i, chip] of [...$("xjb-ruler-stepchips").querySelectorAll("button")].entries()) {
    chip.setAttribute("aria-pressed", String(i === main.step));
    chip.classList.toggle("done", i < main.step);
  }
  for (const chip of $("xjb-ruler-chips").querySelectorAll("button")) chip.setAttribute("aria-pressed", String(chip.dataset.input === main.input));
  const abs = Math.abs(main.value);
  $("xjb-ruler-prev").disabled = !(nextDown(abs) > 0);
  $("xjb-ruler-next").disabled = !Number.isFinite(nextUp(abs));
  $("xjb-ruler-back").disabled = main.step === 0;
  $("xjb-ruler-step").disabled = main.step === LAST_STEP;
  $("xjb-ruler-play").textContent = main.playing ? "Pause" : "Play";
}

function goStep(step, animate = true) {
  const next = Math.max(0, Math.min(LAST_STEP, step));
  main.enterStep = animate && next === main.step + 1 ? next : null;
  main.step = next;
  renderMain();
  writeUrl();
}

function stopPlay() {
  if (main.playing) clearTimeout(main.playing);
  main.playing = null;
}

function play() {
  if (main.playing) { stopPlay(); renderMain(); return; }
  if (main.step === LAST_STEP) { main.step = 0; main.enterStep = 0; }
  const tick = () => {
    if (main.step >= LAST_STEP) { stopPlay(); renderMain(); return; }
    main.playing = setTimeout(tick, reducedMotion() ? 2200 : 1700);
    goStep(main.step + 1);
    if (main.step === LAST_STEP) { stopPlay(); renderMain(); }
  };
  main.playing = setTimeout(tick, 1200);
  renderMain();
}

// ---------------------------------------------------------------------------
// Zoom intro figure.

const zoom = { value: 0.1 + 0.2, input: "0.1+0.2" };
const ZOOM_PRESETS = [
  { label: "0.3", input: "0.3" },
  { label: "0.1+0.2", input: "0.1+0.2" },
  { label: "π", input: "pi" },
  { label: "123.456", input: "123.456" },
];

function renderZoom() {
  const host = $("xjb-ruler-zoom");
  const a = analyze(zoom.value);
  const rows = gridRows(a);
  const W = hostWidth(host);
  const narrow = W < 560;
  const labelW = narrow ? 0 : 190;
  const rowH = narrow ? 58 : 46;
  const top = 8;
  const H = top + rows.length * rowH + 8;
  const xMin = -0.5;
  const xMax = 1.5;
  const x0 = labelW + 10;
  const X = (x) => x0 + ((x - xMin) / (xMax - xMin)) * (W - x0 - 10);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "xjb-ruler-svg", role: "img" });
  svg.append(el("title", {}, `Grid points inside the rounding interval of ${a.text}: ${rows.map((r) => `spacing 10^${r.exponent}: ${r.count}`).join("; ")}.`));
  const lo = toNumber(a.lower);
  const hi = toNumber(a.upper);
  svg.append(el("rect", { x: X(Math.max(lo, xMin)), y: top, width: X(Math.min(hi, xMax)) - X(Math.max(lo, xMin)), height: rows.length * rowH, class: "xjb-ruler-band" }));
  const names = ["too coarse", "coarse: m’s grid", "fine: the ticks", "too fine"];
  rows.forEach((row, i) => {
    const y = top + i * rowH + rowH - 14;
    const labelY = narrow ? y - 22 : y + 4;
    const labelX = narrow ? x0 : 0;
    const role = i === 1 || i === 2 ? " key" : "";
    svg.append(el("text", { x: labelX, y: labelY, class: `xjb-ruler-rowlabel${role}` }, `10${sup(minus(row.exponent))} · ${names[i]} · ${row.count} inside`));
    svg.append(el("line", { x1: X(xMin), x2: X(xMax), y1: y, y2: y, class: "xjb-ruler-axis faded" }));
    const dense = row.points.length > 60;
    for (const p of row.points) {
      svg.append(el("line", { x1: X(p.x), x2: X(p.x), y1: y - (dense ? 5 : 9), y2: y + (dense ? 5 : 9), class: `xjb-ruler-gridpt${p.inside ? " candidate" : ""}${dense ? " dense" : ""}` }));
    }
  });
  const dotX = X(toNumber(a.n));
  svg.append(el("line", { x1: dotX, x2: dotX, y1: top, y2: top + rows.length * rowH, class: "xjb-ruler-dotline" }));
  host.replaceChildren(svg);
  const q = a.q;
  const widthFine = a.lopsided ? "" : `The bar is 2${sup(minus(q))} = ${dec(a.widthTicks, 3)} × 10${sup(minus(a.k))} wide: between one and ten fine steps.`;
  $("xjb-ruler-zoom-note").innerHTML = `<b>${esc(a.text)}</b>: q = ${minus(q)}, so k = ⌊${minus(q)} × log₁₀2⌋ = ${minus(a.k)}. ${widthFine}`;
  for (const chip of $("xjb-ruler-zoom-chips").querySelectorAll("button")) chip.setAttribute("aria-pressed", String(chip.dataset.input === zoom.input));
}

// ---------------------------------------------------------------------------
// Powers of two panel.

const pow = { exponent: 64, symmetric: false, readBack: false };
const POW_PRESETS = [
  { label: "2⁶⁴", e: 64 },
  { label: "2⁸⁹", e: 89 },
  { label: "1 = 2⁰", e: 0 },
];

function renderPow() {
  const v = powerOfTwo(pow.exponent);
  const good = analyze(v);
  const a = pow.symmetric ? analyze(v, { symmetric: true }) : good;
  drawStrip($("xjb-ruler-pow-strip"), a);
  drawRuler($("xjb-ruler-pow-svg"), a, {
    step: LAST_STEP,
    neighbours: neighbourBars(a),
    trueBar: pow.symmetric ? good : null,
    label: `Ruler for 2^${pow.exponent} with the ${pow.symmetric ? "naive symmetric" : "true lopsided"} bar: printed as ${a.text}${a.roundTrips ? "" : ", which reads back as a different double"}.`,
  });
  const lines = [];
  lines.push(`${pow.symmetric ? "Naive symmetric bar" : "True bar"}: [${dec(a.lower, 6)}, ${dec(a.upper, 6)}] → ${outcomeWord(a)}${a.bumped ? ` (nearest tick ${a.roundedTick} is off the short end → ${a.nearestTick})` : ""} → prints <strong>${esc(a.text)}</strong>`);
  if (pow.symmetric && good.k !== a.k) lines.push(`(The naive rule also uses the ordinary k = ${minus(a.k)} instead of ${minus(good.k)}, so the ruler is zoomed differently.)`);
  if (pow.readBack) {
    const r = readBackReport(a);
    if (r.same) lines.push(`Read it back: Number("${esc(a.asciiText)}") = ${esc(exactShort(r.back, 34))} = 2${sup(minus(pow.exponent))}. Correct.`);
    else {
      const diff = r.difference;
      const sign = diff.num < 0n ? "−" : "+";
      const size = diff.num < 0n ? -diff.num : diff.num;
      const e2 = powerOfTwoExponent(diff);
      const diffText = diff.den === 1n && size < 10n ** 24n ? `${sign} ${size}` : e2 !== null ? `${sign} 2${sup(minus(e2))}` : `${sign} ${dec(rat(size, diff.den), 6)}`;
      lines.push(`Read it back: Number("${esc(a.asciiText)}") = ${esc(exactShort(r.back, 34))} = 2${sup(minus(pow.exponent))} ${diffText}. <strong class="xjb-ruler-bad">That is the double ${r.steps < 0 ? "below" : "above"}, not 2${sup(minus(pow.exponent))}.</strong>`);
    }
  } else {
    lines.push(`Press “Read it back” to parse the printed string.`);
  }
  $("xjb-ruler-pow-readout").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
  $("xjb-ruler-pow-true").setAttribute("aria-pressed", String(!pow.symmetric));
  $("xjb-ruler-pow-sym").setAttribute("aria-pressed", String(pow.symmetric));
  $("xjb-ruler-pow-exp").value = String(pow.exponent);
  for (const chip of $("xjb-ruler-pow-chips").querySelectorAll("button")) chip.setAttribute("aria-pressed", String(Number(chip.dataset.e) === pow.exponent));
  $("xjb-ruler-pow-prevtrap").disabled = nextTrap(pow.exponent, -1) === null;
  $("xjb-ruler-pow-nexttrap").disabled = nextTrap(pow.exponent, 1) === null;
}

function setPow(exponent) {
  if (!Number.isInteger(exponent) || exponent < -1022 || exponent > 1023) return;
  pow.exponent = exponent;
  pow.readBack = false;
  renderPow();
  writeUrl();
}

// ---------------------------------------------------------------------------
// Register figure (section 5).

function renderRegisters() {
  const host = $("xjb-ruler-regs");
  const a = mainAnalysis;
  const r = registers(a);
  if (!r) {
    host.innerHTML = `<p class="xjb-ruler-regs-note">${esc(a.text)} is a power of two, so the code takes its separate branch (section 4). Pick another double in section 2 to see the regular path.</p>`;
    return;
  }
  const two64 = twoTo(64);
  const frac = (x) => dec(rat(x * two64.den, two64.num), 6);
  const tableHex = r.table.toString(16).padStart(32, "0");
  const e = r.e;
  const skip = a.downHit || a.upHit;
  const line = (code, value, meaning, cls = "") => `<div class="xjb-ruler-reg${cls}"><code>${code}</code><span class="xjb-ruler-reg-value">${value}</span><span class="xjb-ruler-reg-meaning">${meaning}</span></div>`;
  host.innerHTML = [
    `<div class="xjb-ruler-regs-head">${esc(a.text)} · c = ${a.c}, q = ${minus(a.q)}, k = ${minus(a.k)}</div>`,
    line(`T = table[${minus(e)}]`, `0x${tableHex.slice(0, 16)}<wbr>${tableHex.slice(16)}`, `⌈10${sup(minus(e))}·2${sup(minus(r.tableShift))}⌉, 128 bits`),
    line(`hi:lo = (c &lt;&lt; ${r.shift}) × T`, "top 128 bits", "one 64×128 multiply"),
    line("m = hi &gt;&gt; 9", String(r.m), `= m ${r.m === a.m ? "(exact)" : "(differs!)"}`),
    line("dot_one = next 64 bits", hex64(r.dotOne), `${frac(r.dotOne)}·2⁶⁴ ≈ n = ${dec(a.n, 6)}`),
    line(`half_ulp = (T_hi &gt;&gt; ${-r.h}) + ${r.evenBit}`, hex64(r.halfUlp), `${frac(r.halfUlp)}·2⁶⁴ ≈ h = ${dec(a.h, 6)}${r.evenBit ? " (+1: c even, ends closed)" : ""}`),
    line("down = half_ulp &gt; dot_one", String(r.down), "left end inside?", r.down ? " hit" : ""),
    line("up = half_ulp &gt; ~dot_one", String(r.up), `right end inside? (~dot_one ≈ (1−n)·2⁶⁴)`, r.up ? " hit" : ""),
    line(`one = (10·dot_one + ${r.tieFix ? "0" : "2⁶³ + 6"}) &gt;&gt; 64`, String(r.one), skip ? "nearest tick (unused: an end is inside)" : `nearest tick = round(10n)${r.tieFix ? " (n = ¼: tie goes down)" : ""}`, skip ? " unused" : " hit"),
    line("print", `${r.m + (r.up ? 1n : 0n)}${skip ? "" : ` then ${r.one}`}`, `m + up, then the digit unless up or down → “${esc(a.text)}”`),
  ].join("");
}

// ---------------------------------------------------------------------------
// URL state.

function writeUrl() {
  const params = new URLSearchParams();
  params.set("x", main.input);
  if (main.step !== LAST_STEP) params.set("step", String(main.step));
  if (!main.neighbours) params.set("nb", "0");
  if (zoom.input !== "0.1+0.2") params.set("z", zoom.input);
  if (pow.exponent !== 64) params.set("p", String(pow.exponent));
  if (pow.symmetric) params.set("sym", "1");
  if (pow.readBack) params.set("read", "1");
  history.replaceState(null, "", `${location.pathname}?${params}${location.hash}`);
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  const x = params.get("x");
  if (x) {
    try { main.value = evaluateInput(x); main.input = x; } catch { /* keep default */ }
  }
  const step = Number(params.get("step"));
  if (params.has("step") && Number.isInteger(step)) main.step = Math.max(0, Math.min(LAST_STEP, step));
  if (params.get("nb") === "0") main.neighbours = false;
  const z = params.get("z");
  if (z) {
    try { const v = evaluateInput(z); analyze(v); zoom.value = v; zoom.input = z; } catch { /* keep default */ }
  }
  const p = Number(params.get("p"));
  if (params.has("p") && Number.isInteger(p) && p >= -1022 && p <= 1023) pow.exponent = p;
  pow.symmetric = params.get("sym") === "1";
  pow.readBack = params.get("read") === "1";
}

// ---------------------------------------------------------------------------
// Wiring.

function chip(label, data, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  for (const [k, v] of Object.entries(data)) button.dataset[k] = v;
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", onClick);
  return button;
}

function init() {
  readUrl();

  // Zoom figure.
  for (const preset of ZOOM_PRESETS) {
    $("xjb-ruler-zoom-chips").append(chip(preset.label, { input: preset.input }, () => {
      zoom.value = evaluateInput(preset.input);
      zoom.input = preset.input;
      renderZoom();
      writeUrl();
    }));
  }
  $("xjb-ruler-zoom-random").addEventListener("click", () => {
    zoom.value = randomDouble();
    zoom.input = String(zoom.value);
    renderZoom();
    writeUrl();
  });

  // Main ruler.
  for (const preset of PRESETS) {
    $("xjb-ruler-chips").append(chip(preset.label, { input: preset.input }, () => {
      stopPlay();
      setMainValue(evaluateInput(preset.input), preset.input);
    }));
  }
  STEPS.forEach((name, i) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${i + 1} ${name}`;
    button.addEventListener("click", () => { stopPlay(); goStep(i, false); });
    li.append(button);
    $("xjb-ruler-stepchips").append(li);
  });
  $("xjb-ruler-form").addEventListener("submit", (event) => {
    event.preventDefault();
    stopPlay();
    const text = $("xjb-ruler-input").value;
    let value;
    try { value = evaluateInput(text); } catch (error) { $("xjb-ruler-error").textContent = error.message; return; }
    setMainValue(value, text.trim());
  });
  const stepTo = (value) => { stopPlay(); setMainValue(value, String(value), { keepStep: true }); };
  $("xjb-ruler-prev").addEventListener("click", () => stepTo(Math.sign(main.value) * nextDown(Math.abs(main.value))));
  $("xjb-ruler-next").addEventListener("click", () => stepTo(Math.sign(main.value) * nextUp(Math.abs(main.value))));
  $("xjb-ruler-random").addEventListener("click", () => { stopPlay(); setMainValue(randomDouble()); });
  $("xjb-ruler-neighbours").checked = main.neighbours;
  $("xjb-ruler-neighbours").addEventListener("change", (event) => { main.neighbours = event.target.checked; main.enterStep = null; renderMain(); writeUrl(); });
  $("xjb-ruler-back").addEventListener("click", () => { stopPlay(); goStep(main.step - 1, false); });
  $("xjb-ruler-step").addEventListener("click", () => { stopPlay(); goStep(main.step + 1); });
  $("xjb-ruler-play").addEventListener("click", play);

  // Powers of two.
  for (const preset of POW_PRESETS) $("xjb-ruler-pow-chips").append(chip(preset.label, { e: String(preset.e) }, () => setPow(preset.e)));
  $("xjb-ruler-pow-exp").addEventListener("change", (event) => setPow(Number(event.target.value)));
  $("xjb-ruler-pow-prevtrap").addEventListener("click", () => { const e = nextTrap(pow.exponent, -1); if (e !== null) setPow(e); });
  $("xjb-ruler-pow-nexttrap").addEventListener("click", () => { const e = nextTrap(pow.exponent, 1); if (e !== null) setPow(e); });
  $("xjb-ruler-pow-true").addEventListener("click", () => { pow.symmetric = false; renderPow(); writeUrl(); });
  $("xjb-ruler-pow-sym").addEventListener("click", () => { pow.symmetric = true; renderPow(); writeUrl(); });
  $("xjb-ruler-pow-read").addEventListener("click", () => { pow.readBack = true; renderPow(); writeUrl(); });
  for (const node of document.querySelectorAll(".xjb-ruler-stat")) node.textContent = String(POWERS_OF_TWO[node.dataset.stat]);

  if (!setMainValue(main.value, main.input, { keepStep: true })) setMainValue(0.1 + 0.2, "0.1+0.2");
  renderZoom();
  renderPow();

  let lastWidth = 0;
  const observer = new ResizeObserver(() => {
    const width = $("xjb-ruler-svg").clientWidth;
    if (Math.abs(width - lastWidth) < 2) return;
    lastWidth = width;
    main.enterStep = null;
    renderMain();
    renderZoom();
    renderPow();
  });
  observer.observe($("xjb-ruler-svg"));
}

init();
