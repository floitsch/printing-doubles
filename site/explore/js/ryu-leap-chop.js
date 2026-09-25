// DOM and interaction for "Ryū · Leap, then chop" (explanation lab, approach A).
import {
  NO_SABOTAGE, parseInput, ryu, whatIfScale, verdict, exactDigits, sciText,
  tickFraction, tickRange, pow5,
} from "./ryu-leap-chop-model.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sup = (n) => `<sup>${String(n).replace("-", "−")}</sup>`;
const minus = (n) => String(n).replace(/^-/, "−");
const pow10h = (e) => `10${sup(e)}`;
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const PRESETS = [
  ["0.3", "0.3 · seventeen chops"],
  ["5e-324", "5e-324 · smallest double"],
  ["0.1+0.2", "0.1+0.2 · one chop"],
  ["1e23", "1e23 · upper end exact"],
  ["7e22", "7e22 · second loop"],
  ["2^-25", "2^-25 · exact tie"],
  ["1125899906842624.25", "1125899906842624.25 · tie"],
  ["2^-1017", "2^-1017 · b = a bump"],
  ["2^-1019", "2^-1019 · power of two"],
  ["123.456", "123.456"],
  ["max", "max double"],
  ["2.9176505403442687e-228", "2.9176505403442687e-228"],
];
const SAB_KEYS = { ignoreBounds: "bounds", symmetricPow2: "pow2", skipBump: "bump", halfUp: "halfup" };
const SAB_TEXT = {
  ignoreBounds: "bounds are always treated as excluded",
  symmetricPow2: "the lower end at a power of two is placed at 4m − 2",
  skipBump: "the b = a check is skipped",
  halfUp: "exact ties round up",
};

const state = { text: "0.3", x: 0.3, chop: 0, rounded: false, unit: 0, sab: { ...NO_SABOTAGE }, fresh: false };
let clean = null; // unsabotaged run: Act 1 and the appendix
let run = null;   // possibly sabotaged run: Act 2
let timer = null;

// ---------- state and URL ----------
function sabActive() { return Object.keys(SAB_KEYS).some((k) => state.sab[k]); }
function setNumber(text, { keepSab = false } = {}) {
  const x = parseInput(text);
  const err = $("rlc-input-error");
  if (x === null) { err.textContent = `Could not read “${text}” as a double.`; return false; }
  err.textContent = "";
  stopTimer();
  state.text = String(text).trim();
  state.x = x;
  state.chop = 0; state.rounded = false; state.unit = 0; state.fresh = false;
  if (!keepSab) state.sab = { ...NO_SABOTAGE };
  compute();
  return true;
}
function compute() {
  const ax = Math.abs(state.x);
  if (!Number.isFinite(ax) || ax === 0) { clean = run = null; return; }
  clean = ryu(ax);
  run = sabActive() ? ryu(ax, state.sab) : clean;
  state.chop = Math.min(state.chop, run.states.length - 1);
  if (state.chop < run.states.length - 1) state.rounded = false;
}
function readURL() {
  const p = new URLSearchParams(location.search);
  if (p.has("x")) { if (!setNumber(p.get("x"))) setNumber("0.3"); } else setNumber("0.3");
  const sab = (p.get("sab") || "").split(",");
  for (const [k, v] of Object.entries(SAB_KEYS)) state.sab[k] = sab.includes(v);
  compute();
  if (!run) return;
  const unit = Number(p.get("unit"));
  if (Number.isInteger(unit)) state.unit = Math.max(-3, Math.min(3, unit));
  const chop = p.get("chop");
  const n = run.states.length - 1;
  if (chop === "end") state.chop = n; else if (chop && Number.isInteger(Number(chop))) state.chop = Math.max(0, Math.min(n, Number(chop)));
  if (p.get("round") === "1") { state.chop = n; state.rounded = true; }
  if (p.get("code") === "1") $("rlc-code-details").open = true;
}
function writeURL() {
  const p = new URLSearchParams();
  p.set("x", state.text);
  if (state.chop) p.set("chop", String(state.chop));
  if (state.rounded) p.set("round", "1");
  if (state.unit) p.set("unit", String(state.unit));
  const sab = Object.entries(SAB_KEYS).filter(([k]) => state.sab[k]).map(([, v]) => v);
  if (sab.length) p.set("sab", sab.join(","));
  if ($("rlc-code-details").open) p.set("code", "1");
  history.replaceState(null, "", `${location.pathname}?${p}${location.hash}`);
}

// ---------- ruler SVG ----------
const PAD = 0.72, LO = -PAD, HI = 1 + PAD;
function frac(d, u) { return Number(((u - d.mm) * 1000000n) / (d.mp - d.mm)) / 1e6; }

function rulerSVG(d, width, height, band, lanes, extra = "") {
  const L = 10, R = width - 10;
  const X = (f) => (L + ((f - LO) / (HI - LO)) * (R - L)).toFixed(2);
  let s = `<svg class="rlc-ruler" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">`;
  s += `<defs><pattern id="rlc-hatch-${band.id}" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 4 L4 0" class="rlc-hatch-line"/></pattern></defs>`;
  s += `<rect class="rlc-band" x="${X(0)}" y="${band.top}" width="${(X(1) - X(0)).toFixed(2)}" height="${band.bottom - band.top}"/>`;
  for (const f of [0, 1]) s += `<line class="rlc-band-edge" x1="${X(f)}" x2="${X(f)}" y1="${band.top}" y2="${band.bottom}"/>`;
  const inc = d.acceptBounds;
  s += `<circle class="${inc ? "rlc-end-in" : "rlc-end-out"}" cx="${X(0)}" cy="${band.top}" r="4.5"/><circle class="${inc ? "rlc-end-in" : "rlc-end-out"}" cx="${X(1)}" cy="${band.top}" r="4.5"/>`;
  s += `<text class="rlc-t-small" x="${+X(0) - 7}" y="${band.top + 4}" text-anchor="end">lower${inc ? "" : " (excl.)"}</text>`;
  s += `<text class="rlc-t-small" x="${+X(1) + 7}" y="${band.top + 4}">upper${inc ? "" : " (excl.)"}</text>`;
  const fv = frac(d, d.mv);
  s += `<line class="rlc-vline" x1="${X(fv)}" x2="${X(fv)}" y1="${band.top + 10}" y2="${band.bottom}"/>`;
  s += `<circle class="rlc-vdot" cx="${X(fv)}" cy="${band.top + 8}" r="4"/><text class="rlc-t-v" x="${+X(fv) + 7}" y="${band.top + 12}">v</text>`;
  for (const lane of lanes) s += lane.binary ? binaryLane(d, lane, X, L, R) : decimalLane(d, lane, X, L, R, band.id);
  return s + extra + "</svg>";
}

function binaryLane(d, lane, X, L, R) {
  const y = lane.y;
  let s = `<line class="rlc-axis rlc-axis-bin" x1="${L}" x2="${R}" y1="${y}" y2="${y}"/>`;
  s += `<text class="rlc-lane-label rlc-bin" x="${L}" y="${y + 36}">${esc(lane.label)}</text>`;
  for (let u = d.prev - 1n; u <= d.next + 1n; u++) {
    const f = frac(d, u);
    if (f < LO || f > HI) continue;
    s += `<line class="rlc-tick-bin" x1="${X(f)}" x2="${X(f)}" y1="${y - 4}" y2="${y + 4}"/>`;
  }
  const named = [
    [d.prev, "prev", "rlc-dbl"], [d.next, "next", "rlc-dbl"],
    [d.mm, d.mmShift === 0n ? "4m−1" : "4m−2", "rlc-mid"], [d.mv, "4m", "rlc-mid"], [d.mp, "4m+2", "rlc-mid"],
  ];
  for (const [u, label, cls] of named) {
    const f = frac(d, u);
    if (f < LO || f > HI) continue;
    s += `<line class="${cls}" x1="${X(f)}" x2="${X(f)}" y1="${y - 9}" y2="${y + 9}"/>`;
    s += `<text class="rlc-t-bin" x="${X(f)}" y="${y + 20}" text-anchor="middle">${label}</text>`;
  }
  return s;
}

function decimalLane(d, lane, X, L, R, id) {
  const y = lane.y;
  let s = `<line class="rlc-axis ${lane.faint ? "rlc-axis-faint" : ""}" x1="${L}" x2="${R}" y1="${y}" y2="${y}"/>`;
  const { nLo, nHi } = tickRange(d, lane.unitExp, LO, HI);
  const count = nHi - nLo + 1n;
  const cls = lane.faint ? " rlc-faint" : "";
  if (count > 260n) {
    s += `<rect x="${L}" y="${y - 5}" width="${R - L}" height="10" fill="url(#rlc-hatch-${id})" class="rlc-dense${cls}"/>`;
    s += `<rect x="${X(0)}" y="${y - 7}" width="${(X(1) - X(0)).toFixed(2)}" height="14" class="rlc-dense-legal${cls}"/>`;
  } else {
    for (let n = nLo; n <= nHi; n++) {
      const f = tickFraction(d, n, lane.unitExp);
      const legal = lane.legal(n);
      s += `<line class="${legal ? "rlc-tick-legal" : "rlc-tick"}${cls}" x1="${X(f)}" x2="${X(f)}" y1="${y - (legal ? 8 : 5)}" y2="${y + (legal ? 8 : 5)}"/>`;
    }
  }
  s += `<text class="rlc-lane-label${cls}" x="${L}" y="${y + 22}">${lane.label}</text>`;
  // markers (a, b, c, …): on-screen labels, off-screen collected at the edges
  const left = [], right = [];
  const groups = new Map();
  for (const m of lane.markers || []) {
    const key = m.n.toString();
    if (!groups.has(key)) groups.set(key, { n: m.n, labels: [], ring: false, row: 9 });
    const g = groups.get(key);
    if (m.ring) g.ring = true; else { g.labels.push(m.label); g.row = Math.min(g.row, m.row ?? 0); }
  }
  for (const g of groups.values()) {
    const f = tickFraction(d, g.n, lane.unitExp);
    const label = g.labels.join("=");
    if (f < LO || f > HI) { const side = f < LO ? left : right; if (label) side.push(label); if (g.ring) side.push("out"); continue; }
    if (label) s += `<text class="rlc-marker" x="${X(f)}" y="${y - 12 - (g.row === 9 ? 0 : g.row) * 11}" text-anchor="middle">${label}</text>`;
    if (g.ring) s += `<circle class="rlc-ring" cx="${X(f)}" cy="${y}" r="7"/><text class="rlc-marker rlc-marker-out" x="${X(f)}" y="${y - 34}" text-anchor="middle">out</text>`;
  }
  if (count === 0n) {
    if (!left.length) left.push("next tick");
    if (!right.length) right.push("next tick");
  }
  if (left.length) s += `<text class="rlc-edge${cls}" x="${L}" y="${y - 12}">← ${left.join(", ")}</text>`;
  if (right.length) s += `<text class="rlc-edge${cls}" x="${R}" y="${y - 12}" text-anchor="end">${right.join(", ")} →</text>`;
  return s;
}

function boxWidth(el) { return Math.max(300, Math.round(el.clientWidth || 700)); }

// ---------- picker ----------
function renderPicker() {
  const sel = $("rlc-preset");
  if (!sel.options.length) {
    sel.innerHTML = `<option value="">custom…</option>` + PRESETS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
  }
  sel.value = PRESETS.some(([v]) => v === state.text) ? state.text : "";
  if (document.activeElement !== $("rlc-input")) $("rlc-input").value = state.text;
  const cur = $("rlc-current");
  if (!clean) { cur.textContent = `= ${state.x}`; return; }
  cur.innerHTML = `= ${esc(String(state.x))}`;
}

// ---------- Act 1: the two rulers and the unit slider ----------
function renderAct1() {
  const box = $("rlc-ruler1");
  const L = clean && clean.leap;
  if (!L) {
    box.innerHTML = `<p class="rlc-special">${esc(specialText())}</p>`;
    $("rlc-unit-table").innerHTML = ""; $("rlc-unit-out").textContent = ""; return;
  }
  const e10 = L.e10 + state.unit;
  const w = whatIfScale(Math.abs(state.x), e10);
  const lowerLegal = w.start.vmIsTrailingZeros;
  const legal = (n) => (lowerLegal ? n >= w.start.vm : n > w.start.vm) && n <= w.start.vp;
  const width = boxWidth(box);
  const lanes = [
    { binary: true, y: 66, label: `binary grid · unit 2^${minus(L.e2)} · m = ${L.m2}${L.powerOfTwoGap ? " (power of two)" : ""}` },
    {
      y: 146, unitExp: e10, legal,
      label: `decimal grid · unit 10^${minus(e10)} · ${w.candidates} tick${w.candidates === 1n ? "" : "s"} in the band`,
      markers: [{ n: w.start.vm, label: "a", row: 0 }, { n: w.start.vr, label: "b", row: 1 }, { n: w.start.vp, label: "c", row: 0 }],
    },
  ];
  box.innerHTML = rulerSVG(L, width, 180, { id: "r1", top: 24, bottom: 160 }, lanes);
  $("rlc-ruler1-alt").textContent = `Binary grid with the double at 4m and the interval from ${L.mmShift === 0n ? "4m−1" : "4m−2"} to 4m+2; decimal grid at unit 10^${e10} with ${w.candidates} ticks inside the interval. a = ${w.start.vm}, b = ${w.start.vr}, c = ${w.start.vp}.`;

  const slider = $("rlc-unit");
  slider.value = String(state.unit);
  const rel = state.unit === 0 ? "Ryū’s choice" : state.unit < 0 ? `${-state.unit} step${state.unit < -1 ? "s" : ""} finer than Ryū` : `${state.unit} step${state.unit > 1 ? "s" : ""} coarser than Ryū`;
  $("rlc-unit-out").innerHTML = `${pow10h(e10)} · <b>${rel}</b>`;
  slider.setAttribute("aria-valuetext", `10 to the ${e10}, ${rel}`);

  const rows = [["a", "lower end", w.start.vm, w.exact.vm], ["b", "v", w.start.vr, w.exact.vr], ["c", "upper end", w.start.vp, w.exact.vp]];
  const bits = (n) => (n === 0n ? 0 : n.toString(2).length);
  let t = `<table class="rlc-table"><thead><tr><th scope="col"><span class="lab-sr-only">point</span></th><th scope="col">in units of ${pow10h(e10)}</th><th scope="col">digits</th><th scope="col">bits</th></tr></thead><tbody>`;
  for (const [name, what, n, ex] of rows) {
    const b = bits(n);
    t += `<tr><th scope="row">${name} <small>${what}</small></th><td class="rlc-mono">${n}${ex ? ` <span class="rlc-badge-exact">exact</span>` : ""}</td><td>${n.toString().length}</td><td class="${b > 64 ? "rlc-bad" : ""}">${b}${b > 64 ? " &gt; 64" : ""}</td></tr>`;
  }
  t += "</tbody></table>";
  const v = verdict(state.x, w.digits, w.exponent);
  const out = sciText(w.digits, w.exponent, state.x < 0);
  let judge;
  if (v.correct) judge = `<span class="rlc-ok">✓ the correct answer</span>`;
  else if (v.shortest) judge = `<span class="rlc-bad">✗ reads back, but is not the closest shortest decimal (${esc(sciText(v.best.digits, v.best.exponent, state.x < 0))})</span>`;
  else if (v.roundTrips) judge = `<span class="rlc-bad">✗ reads back, but is not the shortest (${esc(sciText(v.best.digits, v.best.exponent, state.x < 0))})</span>`;
  else judge = `<span class="rlc-bad">✗ reads back as a different double</span>`;
  const maxBits = Math.max(...rows.map((r) => bits(r[2])));
  t += `<p class="rlc-unit-verdict">${w.chops} chop${w.chops === 1 ? "" : "s"} from here, then round → <b class="rlc-mono">${esc(out)}</b> ${judge}.`;
  if (w.chops === 0 && !v.correct) t += ` No digit was ever erased, so the rounding digit is unknown and the floor b is printed as is.`;
  if (w.candidates === 0n) t += ` The band holds no tick at this unit.`;
  if (maxBits > 64) t += ` The counts no longer fit in a 64-bit register.`;
  t += `</p>`;
  $("rlc-unit-table").innerHTML = t;
}

function specialText() {
  const x = state.x;
  if (Number.isNaN(x)) return "NaN is handled before Ryū starts: it prints “NaN”.";
  if (!Number.isFinite(x)) return `${x > 0 ? "+" : "−"}Infinity is handled before Ryū starts.`;
  return "Zero is handled before Ryū starts: it prints “0E0”.";
}

// ---------- Act 1: ribbon and formula card ----------
function renderLeap() {
  const rib = $("rlc-ribbon"), card = $("rlc-formula");
  if (!clean) { rib.innerHTML = `<p class="rlc-special">${esc(specialText())}</p>`; card.innerHTML = ""; return; }
  const L = clean.leap;
  const ex = exactDigits(Math.abs(state.x));
  const bs = L.vr.toString();
  const kept = ex.digits.padEnd(bs.length, "0").slice(0, bs.length);
  const rest = ex.digits.slice(bs.length);
  const dot = (s) => (s.length > 1 ? `${s[0]}.${s.slice(1)}` : s);
  rib.innerHTML = `<p class="rlc-ribbon-head"><span class="rlc-never">never computed</span> The exact value of v has <b>${ex.digits.length}</b> significant digit${ex.digits.length === 1 ? "" : "s"}:</p>
    <div class="rlc-ribbon-digits" tabindex="0" aria-label="Exact decimal digits of v"><span class="rlc-kept">${esc(dot(kept))}</span><span class="rlc-rest">${esc(rest)}</span><span class="rlc-exp"> × 10${sup(ex.firstExp)}</span></div>
    <p class="rlc-ribbon-foot">${rest.length
      ? `The leap lands directly on the first ${bs.length}, which are b = ${bs} (v counted in units of ${pow10h(L.e10)}). The other ${rest.length} digits are never produced.`
      : `Here nothing is thrown away: b = ${bs} holds every digit of v.`}</p>`;

  const q = L.q, e2 = L.e2;
  const hex = (n) => { const h = n.toString(16).padStart(32, "0"); return `0x${h.slice(0, 16)} 0x${h.slice(16)}`; };
  let unitLine, want, table, name;
  if (L.kind === "inv") {
    const raw = e2 * Math.log10(2);
    unitLine = `q = max(0, ⌊${e2} · log₁₀2⌋ − 1) = max(0, ⌊${(Math.floor(raw * 1000) / 1000).toFixed(3)}…⌋ − 1) = <b>${q}</b>, &nbsp; e10 = q = <b>${L.e10}</b>`;
    want = `b = ⌊mv · 2${sup(e2)} / 10${sup(q)}⌋ = ⌊mv · 2${sup(e2 - q)} / 5${sup(q)}⌋`;
    name = `POW5_INV[${q}]`;
    table = `${name} = ⌊2${sup(L.k)} / 5${sup(q)}⌋ + 1 &nbsp;<span class="rlc-note">(reciprocal of 5${sup(q)}, rounded up)</span>`;
  } else {
    const raw = -e2 * Math.log10(5);
    unitLine = `q = max(0, ⌊${-e2} · log₁₀5⌋ − 1) = max(0, ⌊${(Math.floor(raw * 1000) / 1000).toFixed(3)}…⌋ − 1) = <b>${q}</b>, &nbsp; e10 = e2 + q = <b>${minus(L.e10)}</b>`;
    want = `b = ⌊mv · 2${sup(e2)} / 10${sup(L.e10)}⌋ = ⌊mv · 5${sup(L.i)} / 2${sup(q)}⌋ &nbsp;<span class="rlc-note">(i = −e2 − q = ${L.i})</span>`;
    name = `POW5[${L.i}]`;
    table = L.k < 0
      ? `${name} = 5${sup(L.i)} · 2${sup(-L.k)} &nbsp;<span class="rlc-note">(exact: 5${sup(L.i)} fits in 125 bits)</span>`
      : `${name} = ⌊5${sup(L.i)} / 2${sup(L.k)}⌋ &nbsp;<span class="rlc-note">(the top 125 bits of 5${sup(L.i)}, truncated)</span>`;
  }
  const line = (label, m, v, adj) => `<div class="rlc-mul"><span class="rlc-mul-name">${label}</span><span class="rlc-mono">(${m} × ${name}) &gt;&gt; ${L.shift} = <b>${L.raw[v]}</b>${adj ? ` − 1 = <b>${L.vp}</b> <span class="rlc-note">(exact but excluded)</span>` : ""}</span></div>`;
  card.innerHTML = `<p class="rlc-card-title">The leap for ${esc(String(state.x))} · ${L.kind === "inv" ? "e2 ≥ 0: divide by a power of 5" : "e2 &lt; 0: multiply by a power of 5"}</p>
    <dl class="rlc-card">
      <dt>decode</dt><dd class="rlc-mono">m = ${L.m2}, e2 = ${minus(e2)} · mm, mv, mp = ${L.mm}, ${L.mv}, ${L.mp}</dd>
      <dt>unit</dt><dd>${unitLine}</dd>
      <dt>want</dt><dd>${want}</dd>
      <dt>table</dt><dd>${table}<br><span class="rlc-mono rlc-wrap">= ${L.mul}</span><br><span class="rlc-note">${L.mulBits} bits, stored as two 64-bit words ${hex(L.mul)}</span></dd>
      <dt>shift</dt><dd>${L.kind === "inv" ? `k − e2 + q = ${L.k} − ${e2} + ${q}` : `q − k = ${q} − (${minus(L.k)})`} = <b>${L.shift}</b></dd>
      <dt>leap</dt><dd>${line("b =", L.mv, "vr")}${line("a =", L.mm, "vm")}${line("c =", L.mp, "vp", L.vpExactExcluded)}</dd>
    </dl>
    <p class="rlc-note">Each line is one 64×128-bit multiply (mv has ${L.mv.toString(2).length} bits) and a shift. The page checks with exact arithmetic that these equal ⌊point / 10${sup(L.e10)}⌋.</p>`;
}

// ---------- Act 1: exactness badges ----------
function trailingZeroBits(n) { let c = 0; while (n > 0n && (n & 1n) === 0n) { n >>= 1n; c++; } return c; }
function renderExact() {
  const box = $("rlc-exact");
  if (!clean) { box.innerHTML = `<p class="rlc-special">${esc(specialText())}</p>`; return; }
  const L = clean.leap, q = L.q;
  const test = (m) => {
    if (q === 0) return `q = 0: nothing is divided away`;
    if (L.e2 >= 0) return `5${sup(q)}${q <= 27 ? ` = ${pow5(q)}` : ""} divides ${m}? <b>${m % pow5(q) === 0n ? "yes" : "no"}</b>`;
    const tz = trailingZeroBits(m);
    return `${m} ends in ${tz} zero bit${tz === 1 ? "" : "s"}; needs q = ${q}: <b>${tz >= q ? "yes" : "no"}</b>`;
  };
  const inc = L.acceptBounds;
  const cards = [
    ["a", "lower end", L.mmShift === 0n ? "mm = 4m − 1" : "mm = 4m − 2", L.mm, L.exact.vm,
      L.exact.vm ? (inc ? "Included and exactly on a tick: a itself is a legal output. Code: vmIsTrailingZeros = true." : "On a tick, but excluded (m is odd): a is still not a legal output.")
        : "a is below the lower end, so a itself is never a legal output."],
    ["b", "the double", "mv = 4m", L.mv, L.exact.vr,
      L.exact.vr ? "b is v exactly. If the last erased digit is later a 5 followed by zeros, it is a true tie. Code: vrIsTrailingZeros." : "v lies strictly between b and b + 1."],
    ["c", "upper end", "mp = 4m + 2", L.mp, L.exact.vp,
      L.exact.vp ? (inc ? "Included and exactly on a tick: c itself is a legal output." : `Exact but excluded (m is odd): Ryū lowers c by one, to ${L.vp}.`)
        : "c is below the upper end, so c is a legal output."],
  ];
  let h = `<div class="rlc-exact-grid">`;
  for (const [name, what, formula, m, ex, then] of cards) {
    h += `<div class="rlc-exact-card ${ex ? "is-exact" : ""}"><p class="rlc-exact-name"><b>${name}</b> · ${what} <span class="${ex ? "rlc-badge-exact" : "rlc-badge-floor"}">${ex ? "exact" : "floored"}</span></p>
      <p class="rlc-mono rlc-small">${formula}</p><p class="rlc-small">${test(m)}</p><p class="rlc-small">${then}</p></div>`;
  }
  h += `</div>`;
  const ran = L.checks.performed
    ? (L.checks.tested === "small-q" ? `q ≤ 1, so the code sets the flags directly` : `the code tests ${L.checks.tested} (${L.checks.limit})`)
    : `q = ${q} is beyond ${L.checks.limit}: the code skips the test, because it cannot change the output`;
  h += `<p class="rlc-small rlc-flags">Ends are ${inc ? "<b>included</b> (m even)" : "<b>excluded</b> (m odd)"}. In d2s.c ${ran}: vmIsTrailingZeros = <b>${L.vmIsTrailingZeros}</b>, vrIsTrailingZeros = <b>${L.vrIsTrailingZeros}</b>${L.vpExactExcluded ? ", and vp −= 1" : ""}.</p>`;
  box.innerHTML = h;
}

// ---------- Act 2: the chopper ----------
function lowerLegalOf(s, acceptBounds) { return acceptBounds && s.vmIsTrailingZeros; }

function renderChop() {
  const rowsBox = $("rlc-rows");
  const disable = (id, v) => { $(id).disabled = v; };
  document.querySelectorAll(".rlc-sabotage input").forEach((cb) => { cb.checked = !!state.sab[cb.dataset.sab]; });
  const banner = $("rlc-sab-banner");
  const active = Object.keys(SAB_KEYS).filter((k) => state.sab[k]);
  banner.hidden = !active.length;
  banner.innerHTML = active.length ? `<b>Sabotaged:</b> ${active.map((k) => SAB_TEXT[k]).join("; ")}. The rows start from the sabotaged leap.` : "";
  if (!run) {
    rowsBox.innerHTML = `<p class="rlc-special">${esc(specialText())}</p>`;
    ["rlc-chop-status", "rlc-test", "rlc-ruler2", "rlc-roundcard"].forEach((id) => { $(id).innerHTML = ""; });
    ["rlc-back", "rlc-step", "rlc-end", "rlc-round"].forEach((id) => disable(id, true));
    return;
  }
  const L = run.leap, states = run.states, n = states.length - 1;
  const s0 = states[0], cur = states[state.chop];
  const unitExp = L.e10 + cur.removed;
  const lowerLegal = lowerLegalOf(cur, L.acceptBounds);
  disable("rlc-back", state.chop === 0 && !state.rounded);
  disable("rlc-step", state.chop >= n);
  disable("rlc-end", state.chop >= n && state.rounded);
  disable("rlc-round", state.chop < n || state.rounded);

  const loopName = cur.phase === 2 ? "second loop" : "first loop";
  $("rlc-chop-status").innerHTML = `x = ${esc(String(state.x))} · unit ${pow10h(unitExp)} · ${cur.removed} digit${cur.removed === 1 ? "" : "s"} erased${cur.removed ? ` · last step: ${loopName}` : ""}${state.rounded ? " · rounded" : ""}`;

  // digit rows
  const starts = [s0.vm.toString(), s0.vr.toString(), s0.vp.toString()];
  const width = Math.max(...starts.map((s) => s.length)) + 1;
  const k = cur.removed;
  const rowHTML = (name, sub, full, curVal, pre, post, lamp) => {
    const keptLen = Math.max(0, full.length - k);
    let kept = full.slice(0, keptLen);
    const cut = full.slice(keptLen);
    if (kept === "" && curVal === 0n) kept = "0";
    const pad = width - kept.length - cut.length;
    let cells = `<span class="rlc-pad">${"&nbsp;".repeat(Math.max(0, pad))}</span><span class="rlc-kept-digits">${kept}</span>`;
    if (cut) {
      const fresh = state.fresh ? `<span class="rlc-cut rlc-fresh">${cut[0]}</span>` : `<span class="rlc-cut">${cut[0]}</span>`;
      cells += fresh + `<span class="rlc-cut">${cut.slice(1)}</span>`;
    }
    return `<div class="rlc-row"><span class="rlc-rname">${name}</span><span class="rlc-rsub">${sub}</span><span class="rlc-glyph">${pre}</span><span class="rlc-digits" style="--rlc-w:${width}">${cells}</span><span class="rlc-glyph">${post}</span><span class="rlc-lampcell">${lamp}</span></div>`;
  };
  const lamp = (on, text, title) => `<span class="rlc-lamp ${on ? "is-on" : ""}" title="${esc(title)}"><i aria-hidden="true"></i>${text}<span class="lab-sr-only">: ${on ? "on" : "off"}</span></span>`;
  let rows = rowHTML("a", "lower", starts[0], cur.vm, lowerLegal ? "[" : "(", "", lamp(cur.vmIsTrailingZeros, "a exact", "vmIsTrailingZeros: a is still exactly the lower end"));
  rows += rowHTML("b", "value", starts[1], cur.vr, "", "", lamp(cur.vrIsTrailingZeros, "b’s tail is 0", "vrIsTrailingZeros: all digits erased from b before the last one were 0, and b was exact"));
  rows += rowHTML("c", "upper", starts[2], cur.vp, "", "]", L.vpExactExcluded ? `<span class="rlc-tag">c lowered by 1</span>` : "");
  const digits = cur.removedDigits;
  const pocket = digits.length
    ? digits.map((dg, i) => `<span class="${i === digits.length - 1 ? "rlc-pocket-last" : ""}">${dg}</span>`).join("")
    : `<span class="rlc-muted">empty</span>`;
  rowsBox.innerHTML = `<div class="rlc-rowgrid">${rows}</div><div class="rlc-pocket"><span class="rlc-pocket-label">erased from b</span><span class="rlc-pocket-digits">${pocket}</span>${digits.length ? `<span class="rlc-pocket-note">last = <b>${digits.at(-1)}</b>: the rounding digit</span>` : ""}</div>`;

  // stop test
  const next = states[state.chop + 1];
  const a10 = cur.vm / 10n, c10 = cur.vp / 10n;
  let test;
  if (next && next.phase === 1) {
    test = `<b>Chop?</b> Coarser grid ${pow10h(unitExp + 1)}: ⌊c/10⌋ = ${c10} &gt; ⌊a/10⌋ = ${a10}. It still has a tick inside the band → <b class="rlc-ok">chop</b>.`;
  } else if (next && next.phase === 2) {
    test = `<b>Chop?</b> ⌊c/10⌋ = ⌊a/10⌋ = ${a10}, but the lower end is included and a = ${cur.vm} is exactly on it and ends in 0. The coarser grid has a tick right at the closed end [a → <b class="rlc-ok">chop</b> (second loop).`;
  } else if (!state.rounded) {
    test = `<b>Chop?</b> Coarser grid ${pow10h(unitExp + 1)}: ⌊c/10⌋ = ${c10} = ⌊a/10⌋ = ${a10}. No tick inside the band`;
    if (lowerLegal) test += `, and a = ${cur.vm} does not end in 0`;
    test += ` → <b class="rlc-bad">stop</b>. ${pow10h(unitExp)} is the coarsest grid with an answer. Press Round.`;
  } else test = `<b>Done.</b> Rounded on the grid ${pow10h(unitExp)}.`;
  $("rlc-test").innerHTML = test;

  // ruler
  const box = $("rlc-ruler2");
  const legal = (m) => (lowerLegal ? m >= cur.vm : m > cur.vm) && m <= cur.vp;
  const legalCount = cur.vp - (lowerLegal ? cur.vm : cur.vm + 1n) + 1n;
  const nextLow = lowerLegal ? (cur.vm + 9n) / 10n : cur.vm / 10n + 1n;
  const nextCount = c10 >= nextLow ? c10 - nextLow + 1n : 0n;
  const markers = [{ n: cur.vm, label: "a", row: 0 }, { n: cur.vr, label: "b", row: 1 }, { n: cur.vp, label: "c", row: 0 }];
  if (state.rounded) {
    markers.push({ n: run.round.output, ring: true });
  }
  const lanes = [
    { y: 78, unitExp, legal, markers, label: `current grid · 10^${minus(unitExp)} · ${legalCount} legal tick${legalCount === 1n ? "" : "s"}` },
    { y: 136, unitExp: unitExp + 1, faint: true, legal: (m) => m >= nextLow && m <= c10, label: `next grid · 10^${minus(unitExp + 1)} · ${nextCount} tick${nextCount === 1n ? "" : "s"} in the band` },
  ];
  box.innerHTML = rulerSVG(L, boxWidth(box), 164, { id: "r2", top: 22, bottom: 150 }, lanes);
  $("rlc-ruler2-alt").textContent = `Current grid 10^${unitExp}: ${legalCount} legal ticks inside the interval. Next coarser grid: ${nextCount} ticks inside.`;

  renderRoundCard();
}

function renderRoundCard() {
  const card = $("rlc-roundcard");
  if (!state.rounded) { card.innerHTML = ""; return; }
  const L = run.leap, r = run.round, last = run.states.at(-1);
  const unitExp = L.e10 + last.removed;
  const d = r.lastRemovedDigit;
  const reasons = [];
  if (r.rule === "bump" || r.rule === "bump+digit") {
    reasons.push(`b = a = ${last.vm}, and a is not a legal output (${L.acceptBounds ? "the lower end is not exactly on this grid" : "the lower end is excluded"}). b lies at or below the lower end, so take b + 1.`);
    if (r.rule === "bump+digit") reasons.push(`The last erased digit, ${d}, would also round up.`);
    else reasons.push(`The last erased digit, ${d}, alone would have kept b.`);
  } else if (r.rule === "tie-even-down") reasons.push(`The last erased digit is 5 and everything after it was 0: v is exactly halfway. Round half to even: b = ${last.vr} is even → keep b.`);
  else if (r.rule === "tie-even-up") reasons.push(`The last erased digit is 5 and everything after it was 0: v is exactly halfway. Round half to even: b = ${last.vr} is odd → take b + 1.`);
  else if (r.rule === "tie-halfup") reasons.push(`Exact tie (5 followed by zeros). <b>Sabotaged:</b> half rounds up → b + 1.`);
  else if (r.rule === "digit-up") reasons.push(`The last erased digit is ${d} ≥ 5: v is at least halfway to b + 1 → take b + 1.`);
  else reasons.push(last.removed ? `The last erased digit is ${d} &lt; 5 → keep b.` : `No digit was erased and b is exact → keep b.`);
  if (state.sab.skipBump && last.vr === last.vm && !r.lowerLegal) reasons.push(`<b>Sabotaged:</b> b = a, but the check that would add 1 is switched off.`);
  const v = verdict(state.x, r.output, unitExp);
  const text = sciText(r.output, unitExp, state.x < 0);
  const checks = [
    [v.roundTrips, v.roundTrips ? `reads back as ${esc(String(state.x))}` : `reads back as ${esc(String(state.x < 0 ? -v.readsAs : v.readsAs))}, a different double`],
    [v.shortest, v.shortest ? `shortest (${v.len} digit${v.len === 1 ? "" : "s"})` : `not the shortest: ${v.bestLen} digit${v.bestLen === 1 ? " is" : "s are"} enough`],
    [v.correct, v.correct ? `matches the closest shortest decimal` : `the correct output is ${esc(sciText(v.best.digits, v.best.exponent, state.x < 0))}`],
  ];
  card.innerHTML = `<p class="rlc-card-title">Round</p>
    <p>Candidates on the grid ${pow10h(unitExp)}: b = <span class="rlc-mono">${last.vr}</span> or b + 1 = <span class="rlc-mono">${last.vr + 1n}</span>.</p>
    <ul class="rlc-reasons">${reasons.map((x) => `<li>${x}</li>`).join("")}</ul>
    <p class="rlc-output">Output: <span class="rlc-mono">${r.output} × ${pow10h(unitExp)}</span> = <b class="rlc-mono">${esc(text)}</b></p>
    <ul class="rlc-checks">${checks.map(([ok, t]) => `<li class="${ok ? "rlc-ok" : "rlc-bad"}">${ok ? "✓" : "✗"} ${t}</li>`).join("")}</ul>`;
}

// ---------- appendix: code with live values ----------
function renderCode() {
  $("rlc-code-x").textContent = state.text;
  const pre = $("rlc-code");
  if (!clean) { pre.textContent = specialText(); return; }
  const r = clean, L = r.leap, st = r.states, last = st.at(-1);
  const n1 = st.filter((s) => s.phase === 1).length, n2 = st.filter((s) => s.phase === 2).length;
  const after1 = st.filter((s) => s.phase <= 1).at(-1);
  const pos = L.e2 >= 0, t = L.checks.tested;
  const tri = (s) => `${s.vm}, ${s.vr}, ${s.vp}`;
  const rnd = r.round;
  const tieFix = st.at(-1).vrIsTrailingZeros && last.lastRemovedDigit === 5n && last.vr % 2n === 0n;
  const lines = [
    ["d2d(ieeeMantissa, ieeeExponent):", `fields ${L.ieeeMantissa}, ${L.ieeeExponent}`],
    ["  // 1. decode"],
    ["  if ieeeExponent == 0: m2 = ieeeMantissa;          e2 = 1 − 1077", L.subnormal ? `m2 = ${L.m2}, e2 = ${L.e2}` : null, L.subnormal],
    ["  else:                 m2 = 2^52 | ieeeMantissa;   e2 = ieeeExponent − 1077", !L.subnormal ? `m2 = ${L.m2}, e2 = ${L.e2}` : null, !L.subnormal],
    ["  acceptBounds = (m2 % 2 == 0)", `${L.acceptBounds}`],
    ["  // 2. the interval, times 4"],
    ["  mv = 4 · m2;  mp = mv + 2", `${L.mv}, ${L.mp}`],
    ["  mmShift = (ieeeMantissa != 0 || ieeeExponent <= 1)", `${L.mmShift}`],
    ["  mm = mv − 1 − mmShift", `${L.mm}`],
    ["  // 3. the leap"],
    ["  if e2 >= 0:", null, pos],
    ["    q = log10Pow2(e2) − (e2 > 3);  e10 = q", pos ? `q = ${L.q}, e10 = ${L.e10}` : null, pos],
    ["    k = 125 + pow5bits(q) − 1;  j = −e2 + q + k", pos ? `k = ${L.k}, j = ${L.shift}` : null, pos],
    ["    vr = mulShift(mv, POW5_INV[q], j)  // vp, vm alike", pos ? `vm, vr, vp = ${L.raw.vm}, ${L.raw.vr}, ${L.raw.vp}` : null, pos],
    ["    if q <= 21:", null, pos && L.checks.performed],
    ["      if mv % 5 == 0:    vrIsTrailingZeros = multipleOfPowerOf5(mv, q)", pos && t === "mv" ? `${L.vrIsTrailingZeros}` : null, pos && t === "mv"],
    ["      elif acceptBounds: vmIsTrailingZeros = multipleOfPowerOf5(mm, q)", pos && t === "mm" ? `${L.vmIsTrailingZeros}` : null, pos && t === "mm"],
    ["      else:              vp −= multipleOfPowerOf5(mp, q)", pos && t === "mp" ? `vp −= ${L.vpExactExcluded ? 1 : 0}` : null, pos && t === "mp"],
    ["  else:", null, !pos],
    ["    q = log10Pow5(−e2) − (−e2 > 1);  e10 = q + e2", !pos ? `q = ${L.q}, e10 = ${L.e10}` : null, !pos],
    ["    i = −e2 − q;  k = pow5bits(i) − 125;  j = q − k", !pos ? `i = ${L.i}, k = ${L.k}, j = ${L.shift}` : null, !pos],
    ["    vr = mulShift(mv, POW5[i], j)      // vp, vm alike", !pos ? `vm, vr, vp = ${L.raw.vm}, ${L.raw.vr}, ${L.raw.vp}` : null, !pos],
    ["    if q <= 1:", null, !pos && t === "small-q"],
    ["      vrIsTrailingZeros = true", null, !pos && t === "small-q"],
    ["      if acceptBounds: vmIsTrailingZeros = (mmShift == 1)", !pos && t === "small-q" && L.acceptBounds ? `${L.vmIsTrailingZeros}` : null, !pos && t === "small-q" && L.acceptBounds],
    ["      else:            vp −= 1", !pos && t === "small-q" && !L.acceptBounds ? `vp = ${L.vp}` : null, !pos && t === "small-q" && !L.acceptBounds],
    ["    elif q < 63:", null, !pos && t === "mv"],
    ["      vrIsTrailingZeros = multipleOfPowerOf2(mv, q)", !pos && t === "mv" ? `${L.vrIsTrailingZeros}` : null, !pos && t === "mv"],
    ["  // 4. the chop"],
    ["  removed = 0;  lastRemovedDigit = 0"],
    ["  while vp / 10 > vm / 10:", `ran ${n1}×`, n1 > 0],
    ["    vmIsTrailingZeros &= (vm % 10 == 0)", null, n1 > 0],
    ["    vrIsTrailingZeros &= (lastRemovedDigit == 0)", null, n1 > 0],
    ["    lastRemovedDigit = vr % 10", null, n1 > 0],
    ["    vr /= 10;  vp /= 10;  vm /= 10;  removed++", n1 > 0 ? `now ${tri(after1)}` : null, n1 > 0],
    ["  if vmIsTrailingZeros:", `${after1.vmIsTrailingZeros}`, after1.vmIsTrailingZeros],
    ["    while vm % 10 == 0:", after1.vmIsTrailingZeros ? `ran ${n2}×` : null, n2 > 0],
    ["      vrIsTrailingZeros &= (lastRemovedDigit == 0)", null, n2 > 0],
    ["      lastRemovedDigit = vr % 10", null, n2 > 0],
    ["      vr /= 10;  vp /= 10;  vm /= 10;  removed++", n2 > 0 ? `now ${tri(last)}` : null, n2 > 0],
    ["  // 5. round", `lastRemovedDigit = ${last.lastRemovedDigit}, removed = ${last.removed}`],
    ["  if vrIsTrailingZeros && lastRemovedDigit == 5 && vr % 2 == 0:", `${tieFix}`],
    ["    lastRemovedDigit = 4", null, tieFix],
    ["  output = vr + ((vr == vm && !(acceptBounds && vmIsTrailingZeros))", `vr == vm: ${last.vr === last.vm}`],
    ["                 || lastRemovedDigit >= 5)", `${rnd.output}`],
    ["  return (output, e10 + removed)", `${rnd.output}, ${L.e10 + last.removed}  →  ${sciText(rnd.output, L.e10 + last.removed)}`],
  ];
  const w = Math.max(...lines.map((l) => l[0].length));
  pre.innerHTML = lines.map(([code, note, active = true]) => {
    const c = `<span class="${active ? "" : "rlc-off"}">${esc(code.padEnd(w))}</span>`;
    return note != null && active ? `${c}  <span class="rlc-cnote">// ${esc(note)}</span>` : c;
  }).join("\n");
}

// ---------- rendering and events ----------
function renderAll() {
  renderPicker();
  renderAct1();
  renderLeap();
  renderExact();
  renderChop();
  renderCode();
  writeURL();
}

function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
function step() {
  if (!run) return false;
  if (state.chop < run.states.length - 1) { state.chop++; state.fresh = true; return true; }
  return false;
}

function bind() {
  $("rlc-preset").addEventListener("change", (e) => { if (e.target.value && setNumber(e.target.value)) renderAll(); });
  $("rlc-form").addEventListener("submit", (e) => { e.preventDefault(); if (setNumber($("rlc-input").value)) renderAll(); });
  $("rlc-random").addEventListener("click", () => {
    const hi = Math.floor(Math.random() * 0x7fe00000) + 0x00100000; // normal, positive, finite
    const lo = Math.floor(Math.random() * 2 ** 32);
    const dv = new DataView(new ArrayBuffer(8)); dv.setUint32(0, hi); dv.setUint32(4, lo);
    if (setNumber(String(dv.getFloat64(0)))) renderAll();
  });
  $("rlc-unit").addEventListener("input", (e) => { state.unit = Number(e.target.value); renderAct1(); writeURL(); });
  $("rlc-unit-reset").addEventListener("click", () => { state.unit = 0; renderAct1(); writeURL(); });
  $("rlc-step").addEventListener("click", () => { stopTimer(); step(); renderChop(); writeURL(); state.fresh = false; });
  $("rlc-back").addEventListener("click", () => {
    stopTimer(); state.fresh = false;
    if (state.rounded) state.rounded = false; else if (state.chop > 0) state.chop--;
    renderChop(); writeURL();
  });
  $("rlc-reset").addEventListener("click", () => { stopTimer(); state.chop = 0; state.rounded = false; state.fresh = false; renderChop(); writeURL(); });
  $("rlc-round").addEventListener("click", () => { stopTimer(); state.rounded = true; state.fresh = false; renderChop(); writeURL(); });
  $("rlc-end").addEventListener("click", () => {
    stopTimer();
    if (!run) return;
    if (reduceMotion()) { state.chop = run.states.length - 1; state.rounded = true; state.fresh = false; renderChop(); writeURL(); return; }
    const tick = () => {
      if (!step()) { stopTimer(); state.rounded = true; state.fresh = false; }
      renderChop(); writeURL();
    };
    tick();
    timer = setInterval(tick, 220);
  });
  document.querySelectorAll(".rlc-sabotage input").forEach((cb) => cb.addEventListener("change", () => {
    stopTimer();
    state.sab[cb.dataset.sab] = cb.checked;
    state.chop = 0; state.rounded = false; state.fresh = false;
    compute(); renderChop(); writeURL();
  }));
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button.rlc-inline");
    if (!b) return;
    const sab = b.dataset.sab;
    if (!setNumber(b.dataset.x)) return;
    if (b.dataset.unit) state.unit = Number(b.dataset.unit);
    if (sab) {
      state.sab = { ...NO_SABOTAGE, [sab]: true };
      compute();
      state.chop = run.states.length - 1; state.rounded = true;
    }
    renderAll();
    if (sab) document.querySelector(".rlc-chopper").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  });
  $("rlc-code-details").addEventListener("toggle", writeURL);
  let raf = 0, lastW = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { renderAct1(); renderChop(); });
  });
}

readURL();
bind();
renderAll();
