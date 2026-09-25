// Copyright (C) 2026 Toit contributors.
// DOM and interaction for explore/errol-hunt.html. All numbers come from errol-hunt-model.js.

import {
  errol3uHP, errol3u, errolInt, decimalText, shortestOf, judge, stripZeros, hex64, bitsOf,
  randomExperiment, VARIANTS, FIRST_BINADE, LAST_BINADE, shortestIsMidpoint, midpointsOf,
  binadeParams, huntBinade, searchedBinade, proofEnum, TOY, toyTable, rebuildTable, ENUM3, inEnum3,
  TWO53, INT_LIMIT,
} from "./errol-hunt-model.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SVGNS = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------------------
// Formatting helpers

const fmt = (n) => Number(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const supText = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");
const pow2 = (e) => `2${supText(e)}`;
const pow2Html = (e) => `2<sup>${e}</sup>`;
const dd = (h) => `${h.val} ${h.off < 0 || Object.is(h.off, -0) ? "−" : "+"} ${Math.abs(h.off)}`;

// log10 of a positive BigInt (enough precision for a chart).
function blog10(x) {
  if (x < 0n) x = -x;
  if (x === 0n) return -Infinity;
  const s = x.toString();
  const lead = Number(s.slice(0, 16)) / 10 ** (Math.min(16, s.length) - 1);
  return s.length - 1 + Math.log10(lead);
}
// "1.1·10^37" style (HTML) for a BigInt.
function sciHtml(x, digits = 2) {
  const neg = x < 0n;
  const s = (neg ? -x : x).toString();
  if (s.length <= 6) return (neg ? "−" : "") + fmt(s);
  const m = (Number(s.slice(0, 8)) / 1e7).toFixed(digits - 1);
  return `${neg ? "−" : ""}${m}·10<sup>${s.length - 1}</sup>`;
}
const sciNum = (v, d = 2) => {
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  return `${m.toFixed(d - 1)}·10<sup>${e}</sup>`;
};
function digitsToBig(digits, exp) { // 0.digits × 10^exp as an exact integer (exp ≥ digits.length)
  return BigInt(digits) * 10n ** BigInt(exp - digits.length);
}
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}
function parseNumber(text) {
  const t = String(text).trim().replace(/\s+/g, "");
  let m = t.match(/^2\^(-?\d+)$/);
  if (m) return 2 ** Number(m[1]);
  if (!/^[+]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return NaN;
  return Number(t);
}
function setParam(key, value) {
  const u = new URL(location.href);
  if (value === null || value === undefined) u.searchParams.delete(key); else u.searchParams.set(key, value);
  history.replaceState(null, "", u);
}
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

// Errol3's real routing, for the note under the setup trace.
function route(x) {
  if (inEnum3(x)) return "the exception table (this input is one of the 432 entries of enum3.h)";
  if (x > TWO53 && x < INT_LIMIT) return "exact 128-bit integer code (errol_int), not this double-double path";
  if (x >= 16 && x <= TWO53) return "exact fixed-point code (errol_fixed), not this double-double path";
  return "this double-double path";
}

// ---------------------------------------------------------------------------
// Setup: trace the double-double path on one number

const SETUP_PRESETS = [["3.14", "3.14"], ["0.3", "0.3"], ["1.2345678", "1.2345678"], ["5e-324", "5e-324"], ["2^-1016", "2^-1016"]];

function renderSetup(text) {
  const x = parseNumber(text);
  const err = $("eh-setup-error");
  if (!(x > 0) || !Number.isFinite(x)) { err.textContent = "Enter a positive finite number (e.g. 0.1, 6.02e23 or 2^-10)."; return; }
  err.textContent = "";
  $("eh-setup-input").value = text;
  for (const b of $("eh-setup-presets").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.x === text));
  const trace = [];
  const r = errol3uHP(x, trace);
  const scale = trace.find((t) => t.step === "scale");
  const bounds = trace.find((t) => t.step === "bounds");
  const digitsSteps = trace.filter((t) => t.step === "digit");
  const last = trace.find((t) => t.step === "last");
  const shortest = shortestOf(x);
  const verdict = judge(r, x);
  const verdictText = { ok: "reads back as v and is as short as possible", long: "reads back as v but is longer than necessary", wrong: "does not read back as v" }[verdict];
  let rows = "";
  digitsSteps.forEach((s, i) => {
    const stop = s.hdig !== s.ldig;
    rows += `<tr class="${stop ? "eh-stop" : ""}"><td>${i + 1}</td><td class="eh-num">${s.high.val}</td><td class="eh-num">${s.low.val}</td><td><b>${s.hdig}</b> / <b>${s.ldig}</b></td><td>${stop ? "differ → stop" : `emit <b class="eh-red">${s.hdig}</b>`}</td></tr>`;
  });
  $("eh-setup-out").innerHTML = `
    <ol class="lab-steps eh-trace">
      <li><b>Scale.</b> Multiply v = ${x} by the tabled double-double 10<sup>${scale.power}</sup> (entry ${scale.index} of <code>lookup.h</code>), then by 10 or 1/10 until the result is in [1, 10). The result is mid = <code class="eh-num">${dd(bounds.mid)}</code>, which stands for v · 10<sup>${1 - bounds.exp}</sup>.</li>
      <li><b>Edges.</b> Add half the gap to each neighbour, scaled the same way, to the <code>off</code> part:<br>high = <code class="eh-num">${dd(bounds.high)}</code><br>low&nbsp; = <code class="eh-num">${dd(bounds.low)}</code></li>
      <li><b>Peel digits</b> from both edges while they agree (<code>val</code> shown; the digit takes the sign of <code>off</code> into account):
        <div class="eh-scroll"><table class="eh-table"><thead><tr><th>#</th><th>high</th><th>low</th><th>digits</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></li>
      <li><b>Last digit.</b> Round the middle: (high + low) / 2 = ${last.tmp} → <b class="eh-red">${last.mdig}</b>.</li>
    </ol>
    <div class="lab-readout">Output 0.${esc(r.digits)} × 10<sup>${r.exp}</sup> = <strong>${esc(decimalText(r.digits, r.exp))}</strong>, ${verdictText}. Shortest has ${shortest.digits.length} digit${shortest.digits.length > 1 ? "s" : ""}.<br><span class="eh-muted">Real Errol3 sends this input to ${route(x)}.</span></div>`;
  setParam("x", text === "3.14" ? null : text);
}

function initSetup() {
  const box = $("eh-setup-presets");
  for (const [label, x] of SETUP_PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.x = x;
    b.addEventListener("click", () => renderSetup(x));
    box.appendChild(b);
  }
  $("eh-setup-form").addEventListener("submit", (ev) => { ev.preventDefault(); renderSetup($("eh-setup-input").value); });
  renderSetup(params.get("x") || "3.14");
}

// ---------------------------------------------------------------------------
// Benches: random doubles per binade

const DETAIL_FROM = 40, DETAIL_TO = 80, Y_MAX = 25; // percent
const benches = {};
const listeners = { errol1: [] };

function drawBench(bench) {
  const box = bench.chart;
  const W = Math.max(300, box.clientWidth || 600);
  const narrow = W < 560;
  const L = narrow ? 34 : 44, R = 10;
  const stripTop = 18, stripH = 22;
  const top = stripTop + stripH + 44, H = narrow ? 170 : 210, bottom = top + H;
  const total = bottom + 30;
  box.innerHTML = "";
  const svg = el("svg", { viewBox: `0 0 ${W} ${total}`, width: W, height: total, class: "eh-svg" }, box);
  const rows = bench.rows;
  // Overview strip
  const xs = (e) => L + ((e - FIRST_BINADE) / (LAST_BINADE - FIRST_BINADE + 1)) * (W - L - R);
  el("rect", { x: xs(53), y: stripTop, width: xs(128) - xs(53), height: stripH, class: "eh-exact" }, svg);
  const doneTo = rows.length ? rows[rows.length - 1].e : FIRST_BINADE - 1;
  el("rect", { x: L, y: stripTop + stripH / 2 - 1, width: Math.max(0, xs(doneTo + 1) - L), height: 2, class: "eh-sampled" }, svg);
  el("line", { x1: L, x2: W - R, y1: stripTop + stripH, y2: stripTop + stripH, class: "eh-axis" }, svg);
  for (const row of rows) {
    const f = row.long + row.wrong;
    if (f) el("rect", { x: xs(row.e) - 1, y: stripTop, width: 2, height: stripH, class: "eh-bar" }, svg);
  }
  for (const e of [-1000, -500, 0, 500, 1000]) {
    const t = el("text", { x: xs(e), y: stripTop + stripH + 14, "text-anchor": "middle", class: "eh-tick" }, svg);
    t.textContent = pow2(e);
  }
  const st = el("text", { x: L, y: stripTop - 6, class: "eh-label" }, svg);
  st.textContent = "all binades 2⁻¹⁰²² … 2¹⁰²³";
  // bracket linking detail window
  el("path", { d: `M${xs(DETAIL_FROM)},${stripTop + stripH + 18} L${xs(DETAIL_FROM)},${stripTop + stripH + 22} L${L},${top - 8} M${xs(DETAIL_TO + 1)},${stripTop + stripH + 18} L${xs(DETAIL_TO + 1)},${stripTop + stripH + 22} L${W - R},${top - 8}`, class: "eh-bracket" }, svg);
  // Detail chart
  const nb = DETAIL_TO - DETAIL_FROM + 1;
  const bw = (W - L - R) / nb;
  const xb = (e) => L + (e - DETAIL_FROM) * bw;
  const y = (pct) => bottom - (Math.min(pct, Y_MAX) / Y_MAX) * H;
  el("rect", { x: xb(53), y: top, width: xb(DETAIL_TO + 1) - xb(53), height: H, class: "eh-exact" }, svg);
  const ex = el("text", { x: W - R - 6, y: top + 14, "text-anchor": "end", class: "eh-label eh-exact-label" }, svg);
  ex.textContent = narrow ? "exact integers (Errol2/3)" : "Errol2 and Errol3 use exact integers here (up to 2¹²⁸)";
  for (let p = 0; p <= Y_MAX; p += 5) {
    el("line", { x1: L, x2: W - R, y1: y(p), y2: y(p), class: p ? "eh-grid" : "eh-axis" }, svg);
    const t = el("text", { x: L - 6, y: y(p) + 4, "text-anchor": "end", class: "eh-tick" }, svg);
    t.textContent = `${p}%`;
  }
  const byE = new Map(rows.map((r) => [r.e, r]));
  for (let e = DETAIL_FROM; e <= DETAIL_TO; e++) {
    const row = byE.get(e);
    if (e % 5 === 0) {
      const t = el("text", { x: xb(e) + bw / 2, y: bottom + 16, "text-anchor": "middle", class: "eh-tick" }, svg);
      t.textContent = pow2(e);
    }
    if (!row) continue;
    const f = row.long + row.wrong;
    const pct = (100 * f) / row.n;
    const g = el("g", { class: "eh-bargroup" + (bench.variant === "errol1" && f ? " eh-clickable" : "") + (bench.selected === e ? " eh-selected" : "") }, svg);
    const title = el("title", {}, g);
    title.textContent = `${pow2(e)} … ${pow2(e + 1)}: ${f} of ${fmt(row.n)} not shortest or wrong (${pct.toFixed(2)}%)` + (row.flagged ? `, ${row.flagged} flagged by the wide check` : "");
    el("rect", { x: xb(e), y: top, width: bw, height: H, class: "eh-hit" }, g);
    if (f) {
      const h = Math.max(2, bottom - y(pct));
      el("rect", { x: xb(e) + 1, y: bottom - h, width: Math.max(1, bw - 2), height: h, rx: Math.min(2, bw / 4), class: "eh-bar" }, g);
      if (bw >= 16) {
        const t = el("text", { x: xb(e) + bw / 2, y: bottom - h - 4, "text-anchor": "middle", class: "eh-count" }, g);
        t.textContent = f;
      }
    }
    if (bench.variant === "errol1" && f) g.addEventListener("click", () => selectBinade(e, true));
  }
  const yl = el("text", { x: L, y: top - 6, class: "eh-label" }, svg);
  yl.textContent = "not shortest or wrong, per binade";
}

function benchReadout(bench) {
  const rows = bench.rows;
  let n = 0, long = 0, wrong = 0, flagged = 0;
  const failBins = [];
  for (const r of rows) { n += r.n; long += r.long; wrong += r.wrong; flagged += r.flagged; if (r.long + r.wrong) failBins.push(r.e); }
  const f = long + wrong;
  const label = VARIANTS[bench.variant].label;
  let html = `${label}: <strong>${fmt(f)}</strong> of ${fmt(n)} doubles not shortest or wrong (${n ? ((100 * f) / n).toFixed(4) : 0}%): ${fmt(long)} too long, ${fmt(wrong)} wrong.`;
  if (failBins.length) html += ` All in ${pow2Html(failBins[0])} … ${pow2Html(failBins[failBins.length - 1] + 1)}.`;
  if (bench.variant === "errol1") {
    const unflagged = rows.reduce((a, r) => a + r.failures.filter((x) => !x.flagged).length, 0);
    html += ` The wide-interval check flagged ${fmt(flagged)} doubles; ${unflagged === 0 ? "every" : `all but ${unflagged}`} real failure among them.`;
  }
  if (bench.running) html += ` <span class="eh-muted">(running: up to ${pow2Html(rows.length ? rows[rows.length - 1].e : FIRST_BINADE)})</span>`;
  bench.readout.innerHTML = html;
}

async function runBench(bench, sync = false) {
  if (bench.running) return;
  bench.running = true;
  bench.button.disabled = true;
  bench.rows = [];
  bench.selected = null;
  const n = Number(bench.select.value);
  const gen = randomExperiment(bench.variant, n);
  const t0 = performance.now();
  let lastDraw = 0;
  for (;;) {
    const sliceEnd = performance.now() + 30;
    let step;
    while (!(step = gen.next()).done) {
      bench.rows.push(step.value);
      if (!sync && performance.now() > sliceEnd) break;
    }
    const now = performance.now();
    if (step.done || now - lastDraw > 250) {
      bench.progress.textContent = step.done ? `${fmt(n * bench.rows.length)} doubles in ${((now - t0) / 1000).toFixed(1)} s` : `${Math.round((100 * bench.rows.length) / (LAST_BINADE - FIRST_BINADE + 1))}%`;
      drawBench(bench); benchReadout(bench); lastDraw = now;
    }
    if (step.done) break;
    await nextFrame();
  }
  bench.running = false;
  bench.button.disabled = false;
  benchReadout(bench);
  for (const fn of listeners[bench.variant] || []) fn(bench);
}

function initBench(fig) {
  const bench = {
    fig, variant: fig.dataset.variant, rows: [], running: false, selected: null,
    chart: fig.querySelector("[data-chart]"), readout: fig.querySelector("[data-readout]"),
    progress: fig.querySelector("[data-progress]"), button: fig.querySelector("[data-run]"), select: fig.querySelector("select"),
  };
  benches[bench.variant] = bench;
  const n = params.get("n");
  if (n && [...bench.select.options].some((o) => o.value === n)) bench.select.value = n;
  bench.button.addEventListener("click", () => runBench(bench));
  drawBench(bench);
  bench.readout.innerHTML = `<span class="eh-muted">Not run yet. Press the button.</span>`;
  return bench;
}

// ---------------------------------------------------------------------------
// Entry 2: inspect failures of one binade

function selectBinade(e, scroll) {
  const bench = benches.errol1;
  bench.selected = e;
  drawBench(bench);
  renderInspector();
  if (scroll) $("eh-inspect").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}

function renderInspector() {
  const bench = benches.errol1;
  const chips = $("eh-inspect-chips");
  const failRows = bench.rows.filter((r) => r.failures.length);
  if (!failRows.length) { chips.innerHTML = `<span class="eh-muted">${bench.running ? "Entry 1 is running…" : "Run entry 1 first."}</span>`; $("eh-inspect-out").innerHTML = ""; return; }
  if (bench.selected === null || !failRows.some((r) => r.e === bench.selected)) bench.selected = failRows[0].e;
  chips.innerHTML = "";
  for (const r of failRows) {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `${pow2Html(r.e)} · ${r.failures.length}`;
    b.setAttribute("aria-pressed", String(r.e === bench.selected));
    b.setAttribute("aria-label", `binade 2 to the ${r.e}, ${r.failures.length} failures`);
    b.addEventListener("click", () => selectBinade(r.e, false));
    chips.appendChild(b);
  }
  const row = failRows.find((r) => r.e === bench.selected);
  const half = 1n << BigInt(row.e - 53);
  let allMid = 0, allEven = 0, allTotal = 0;
  for (const r of failRows) for (const f of r.failures) { allTotal++; if (shortestIsMidpoint(f.d)) allMid++; if (midpointsOf(f.d).even) allEven++; }
  const showAll = $("eh-inspect-out").dataset.all === String(row.e);
  const list = showAll ? row.failures : row.failures.slice(0, 8);
  let body = "", mid = 0, even = 0;
  for (const f of row.failures) { if (shortestIsMidpoint(f.d)) mid++; if (midpointsOf(f.d).even) even++; }
  for (const f of list) {
    const v = BigInt(f.d);
    const m = midpointsOf(f.d);
    const s = shortestOf(f.d);
    const sv = digitsToBig(s.digits, s.exp);
    const pv = digitsToBig(stripZeros(f.digits), f.exp);
    const hit = shortestIsMidpoint(f.d);
    const diff = sv - v;
    body += `<tr><td class="eh-num">${v}</td><td>${m.even ? "even" : "odd"}</td><td class="eh-num">${pv} <span class="eh-muted">(${stripZeros(f.digits).length})</span></td><td class="eh-num">${sv} <span class="eh-muted">(${stripZeros(s.digits).length})</span></td><td>${hit ? `v ${diff < 0n ? "−" : "+"} ${diff < 0n ? -diff : diff} = <b>${hit.side} midpoint</b>` : "not a midpoint"}</td></tr>`;
  }
  $("eh-inspect-out").innerHTML = `
    <p class="eh-inspect-head">Binade ${pow2Html(row.e)} … ${pow2Html(row.e + 1)}: doubles are ${half * 2n} apart, so the midpoints are v ± ${half}.</p>
    <div class="eh-scroll"><table class="eh-table"><thead><tr><th>v (exact)</th><th>significand</th><th>Errol1 prints (digits)</th><th>shortest (digits)</th><th>shortest is</th></tr></thead><tbody>${body}</tbody></table></div>
    ${row.failures.length > 8 ? `<button type="button" class="lab-button eh-more" id="eh-inspect-more">${showAll ? "Show fewer" : `Show all ${row.failures.length}`}</button>` : ""}
    <div class="lab-readout">In this binade: <strong>${mid} of ${row.failures.length}</strong> failures have a shortest decimal that is exactly a midpoint; ${even} of ${row.failures.length} have an even significand (closed interval). Across all binades of the run: <strong>${allMid} of ${allTotal}</strong> and ${allEven} of ${allTotal}.</div>`;
  const more = $("eh-inspect-more");
  if (more) more.addEventListener("click", () => { $("eh-inspect-out").dataset.all = showAll ? "" : String(row.e); renderInspector(); });
}

// Entry 3: the hand-picked doubles
function runNeedles() {
  const h = huntBinade(227);
  const bad = h.inputs.filter((x) => x.verdict !== "ok");
  const random = benches.errol3u.rows.reduce((a, r) => a + r.n, 0);
  const lines = bad.map((x) => `<br>${x.d} → prints <strong>${esc(decimalText(x.r.digits, x.r.exp))}</strong>: ${x.verdict === "long" ? "correct but too long" : "reads back as a different double"}.`).join("");
  const out = $("eh-needles-out");
  out.hidden = false;
  out.innerHTML = `Errol3 without its table: <strong>${bad.length} of ${h.inputs.length}</strong> hand-picked doubles fail${random ? `, compared with 0 of ${fmt(random)} random ones` : ""}.${lines}`;
}

// ---------------------------------------------------------------------------
// Toy clock

const toy = { step: 0, timer: null };
const toyRun = proofEnum(TOY);
const TOY_LIM = 16n;
const toyUp = toyRun.up.filter((r) => r.idx < TOY_LIM);
const toyDown = toyRun.down.filter((r) => r.idx < TOY_LIM);
const toyRows = toyTable();

function toyStates() {
  const states = [];
  const res = (k) => toyRows[k].residue;
  states.push({ visited: [], current: null, text: `The 16 midpoints 1056 + 64k, divided by 4, land on the clock at 264 + 16k mod 25. Each dot is labelled with its k. The multiples of 100 all sit at 0, and the budget ±1 is the shaded wedge. Which dots fall inside it?` });
  states.push({ visited: [], current: null, showRecords: true, text: `First, the records. Up: the steps k·16 whose residue is a new smallest positive value (k = ${toyUp.map((r) => r.idx).join(", ")}). Down: the same on the negative side (k = ${toyDown.map((r) => r.idx).join(", ")}). Each is built from two earlier ones, e.g. 2 = 1 + 1: 16 + (−9) = 7.` });
  const path = toyRun.path;
  const visited = [];
  path.forEach((p, i) => {
    visited.push(Number(p.k));
    const r = Number(p.r);
    const inside = Math.abs(r) <= 1;
    let text;
    if (i === 0) text = `Start at k = 0, residue ${r}. It is negative, so look for an up-record: the largest one that does not overshoot to more than +${-r}.`;
    else {
      const shift = Number(p.r - path[i - 1].r);
      text = `Add the record ${shift > 0 ? "+" : "−"}${Math.abs(shift)} (a step of ${p.by}): k = ${p.k}, residue ${r > 0 ? "+" : ""}${r}.` + (inside ? ` That is within ±1: a hit, found after ${i} hops.` : ` Now ${r > 0 ? "positive, so use a down-record" : "negative, so use an up-record"}.`);
    }
    states.push({ visited: [...visited], current: Number(p.k), showRecords: true, shift: i ? Number(p.by) : null, text });
  });
  const extra = toyRun.hits.slice(1).map((h) => Number(h.k));
  const first = Number(toyRun.hits[0].k);
  states.push({ visited: [...visited, ...extra], current: extra[0] ?? first, hits: toyRun.hits.map((h) => Number(h.k)), showRecords: true,
    text: `Fan out from k = ${first}: add each record that keeps the residue within ±1. The step 3 (−2) gives k = ${extra.join(", ")} with residue ${toyRun.hits.slice(1).map((h) => Number(h.r)).join(", ")}. The +1 record (step 11) would give k = ${first + 11}, past the end of the binade.` });
  const s = toyRun.hits.map((h) => toyRows[Number(h.k)].m);
  states.push({ visited: [...visited, ...extra], current: null, hits: toyRun.hits.map((h) => Number(h.k)), showRecords: true, done: true,
    text: `Suspects: midpoints ${s.join(" and ")}, each 4 away from a multiple of 100. Their neighbours ${s.map((m) => `${m - 32} and ${m + 32}`).join(", ")} get tested with the real printer. The table below confirms that no other midpoint is within ±4. The search visited ${visited.length + extra.length} of 16 midpoints; at real scale it is a few dozen of 2⁵².` });
  return states;
}
const TOY_STATES = toyStates();

function drawToy() {
  const st = TOY_STATES[toy.step];
  const box = $("eh-toy-clock");
  box.innerHTML = "";
  const S = 340, cx = S / 2, cy = S / 2 + 4, R = 128;
  const svg = el("svg", { viewBox: `0 0 ${S} ${S + 10}`, class: "eh-svg eh-clock" }, box);
  const ang = (r) => (2 * Math.PI * r) / 25 - Math.PI / 2;
  const pt = (r, rad) => [cx + rad * Math.cos(ang(r)), cy + rad * Math.sin(ang(r))];
  // budget wedge ±1 (inclusive): cover -1.5 .. 1.5
  const [ax, ay] = pt(-1.5, R + 18), [bx, by] = pt(1.5, R + 18);
  el("path", { d: `M${cx},${cy} L${ax},${ay} A${R + 18},${R + 18} 0 0 1 ${bx},${by} Z`, class: "eh-wedge" }, svg);
  el("circle", { cx, cy, r: R, class: "eh-dial" }, svg);
  for (let r = -12; r <= 12; r++) {
    const [x1, y1] = pt(r, R - 6), [x2, y2] = pt(r, R + 6);
    el("line", { x1, y1, x2, y2, class: r === 0 ? "eh-zero" : "eh-tickline" }, svg);
    if (r % 4 === 0 && r !== 0) {
      const [tx, ty] = pt(r, R + 18);
      const t = el("text", { x: tx, y: ty + 4, "text-anchor": "middle", class: "eh-tick" }, svg);
      t.textContent = r > 0 ? `+${r}` : String(r);
    }
  }
  const lbl = el("text", { x: cx, y: 12, "text-anchor": "middle", class: "eh-label eh-red-text" }, svg);
  lbl.textContent = "0 = multiple of 100";
  // path arrows
  const v = st.visited;
  for (let i = 1; i < v.length; i++) {
    const [x1, y1] = pt(toyRows[v[i - 1]].residue, R - 34), [x2, y2] = pt(toyRows[v[i]].residue, R - 34);
    el("path", { d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`, class: "eh-hop", "marker-end": "url(#eh-arrow)" }, svg);
  }
  const defs = el("defs", {}, svg);
  const mk = el("marker", { id: "eh-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", class: "eh-arrowhead" }, mk);
  for (const row of toyRows) {
    const [x, y] = pt(row.residue, R - 34);
    const isHit = st.hits && st.hits.includes(row.k);
    const cls = ["eh-dot"];
    if (v.includes(row.k)) cls.push("eh-visited");
    if (isHit) cls.push("eh-hitdot");
    if (st.current === row.k) cls.push("eh-current");
    const g = el("g", {}, svg);
    el("circle", { cx: x, cy: y, r: st.current === row.k ? 11 : 9, class: cls.join(" ") }, g);
    const t = el("text", { x, y: y + 4, "text-anchor": "middle", class: "eh-dotlabel" + (isHit || st.current === row.k ? " eh-dotlabel-strong" : "") }, g);
    t.textContent = row.k;
    const tt = el("title", {}, g);
    tt.textContent = `k = ${row.k}: midpoint ${row.m}, ${row.dist >= 0 ? "+" : ""}${row.dist} from ${row.nearest}; residue ${row.residue}`;
  }
  box.setAttribute("aria-label", `Clock of 25 ticks with 16 midpoints. ${st.text}`);
  $("eh-toy-caption").textContent = st.text;
  $("eh-toy-count").textContent = `Step ${toy.step + 1} of ${TOY_STATES.length}`;
  $("eh-toy-prev").disabled = toy.step === 0;
  $("eh-toy-next").disabled = toy.step === TOY_STATES.length - 1;
  const recs = (list, name) => `<table class="eh-table eh-rec"><caption>${name}</caption><thead><tr><th>step</th><th>residue</th></tr></thead><tbody>${list.map((r) => `<tr class="${st.shift === Number(r.idx) && used(r) ? "eh-used" : ""}"><td>${r.idx}</td><td>${Number(r.val) > 0 ? "+" : ""}${r.val}</td></tr>`).join("")}</tbody></table>`;
  const cur = toy.step;
  function used(r) { // the record used at this state's hop
    const i = cur - 2; // states 2.. are path points
    const p = toyRun.path;
    if (i < 1 || i >= p.length) return false;
    return p[i].r - p[i - 1].r === r.val;
  }
  $("eh-toy-records").innerHTML = st.showRecords ? `<div class="eh-recs">${recs(toyUp, "up-records")}${recs(toyDown, "down-records")}</div>` : "";
  setParam("toy", toy.step ? String(toy.step) : null);
}

function initToy() {
  const hits = new Set(toyRun.hits.map((h) => Number(h.k)));
  $("eh-toy-table").innerHTML = `<div class="eh-scroll"><table class="eh-table"><thead><tr><th>k</th><th>midpoint</th><th>nearest 100</th><th>distance</th><th>÷4 residue</th></tr></thead><tbody>${toyRows.map((r) => `<tr class="${hits.has(r.k) ? "eh-used" : ""}"><td>${r.k}</td><td>${r.m}</td><td>${r.nearest}</td><td>${r.dist > 0 ? "+" : ""}${r.dist}</td><td>${r.residue > 0 ? "+" : ""}${r.residue}</td></tr>`).join("")}</tbody></table></div><p class="eh-muted">Within ±4: ${toyRows.filter((r) => Math.abs(r.dist) <= 4).map((r) => r.m).join(" and ")}, the same two the search found.</p>`;
  const go = (d) => { toy.step = Math.max(0, Math.min(TOY_STATES.length - 1, toy.step + d)); drawToy(); };
  $("eh-toy-prev").addEventListener("click", () => { stopPlay(); go(-1); });
  $("eh-toy-next").addEventListener("click", () => { stopPlay(); go(1); });
  function stopPlay() { if (toy.timer) { clearInterval(toy.timer); toy.timer = null; $("eh-toy-play").textContent = "Play"; } }
  $("eh-toy-play").addEventListener("click", () => {
    if (toy.timer) { stopPlay(); return; }
    if (toy.step === TOY_STATES.length - 1) toy.step = 0;
    $("eh-toy-play").textContent = "Pause";
    drawToy();
    toy.timer = setInterval(() => { if (toy.step >= TOY_STATES.length - 1) { stopPlay(); return; } go(1); }, reducedMotion ? 4000 : 2200);
  });
  const s = Number(params.get("toy"));
  if (Number.isInteger(s) && s > 0 && s < TOY_STATES.length) toy.step = s;
  drawToy();
}

// ---------------------------------------------------------------------------
// One real binade

const REAL_PRESETS = [227, -650, -187, 1002];
const real = { e: 227, hunt: null };

function paramsHtml(P) {
  if (P.kind === "large") {
    return `<span>n = ${P.n}</span><span>τ = 5<sup>${P.n}</sup> ≈ ${sciHtml(P.tau)}</span><span>α = 2<sup>${P.e - 52 - P.n}</sup></span><span>Δ = 179 · 2<sup>${Math.max(0, P.e - 104 - P.n)}</sup> ≈ ${sciHtml(P.delta)}</span><span>integer midpoints, residue mod 5<sup>${P.n}</sup></span>`;
  }
  const m = -P.e + P.p + 1 - P.n;
  return `<span>n = ${P.n}</span><span>τ = 2<sup>${P.n}</sup> · 2<sup>51</sup></span><span>α = 2 · 5<sup>${m}</sup> · 2<sup>51</sup></span><span>Δ = 79 · 5<sup>${m}</sup></span><span>${P.p < 52 ? `subnormal (p = ${P.p}), ` : ""}fractional midpoints, residue mod 2<sup>${P.n}</sup></span>`;
}

function drawLadder() {
  const h = real.hunt;
  const box = $("eh-real-chart");
  box.innerHTML = "";
  const W = Math.max(300, box.clientWidth || 600);
  const narrow = W < 560;
  const L = narrow ? 44 : 56, R = 12, top = 26, H = narrow ? 200 : 240, bottom = top + H, total = bottom + (narrow ? 56 : 40);
  const svg = el("svg", { viewBox: `0 0 ${W} ${total}`, width: W, height: total, class: "eh-svg" }, box);
  const alpha = h.params.alpha;
  const ulp = (r) => blog10(r) - blog10(alpha);
  const path = h.path;
  const maxPts = narrow ? 150 : 400;
  const stride = Math.max(1, Math.ceil(path.length / maxPts));
  const shown = path.filter((_, i) => i % stride === 0 || i === path.length - 1).map((p) => ({ ...p, i: path.indexOf(p) }));
  const ys = shown.map((p) => ulp(p.r)).filter(Number.isFinite);
  const budget = ulp(h.params.delta);
  const yTop = Math.ceil(Math.max(0, ...ys));
  const yBot = Math.floor(Math.min(budget, ...ys)) - 1;
  const X = (i) => L + (path.length > 1 ? (i / (path.length - 1)) * (W - L - R) : (W - L - R) / 2);
  const Y = (v) => top + ((yTop - v) / (yTop - yBot)) * H;
  const stepY = Math.max(1, Math.ceil((yTop - yBot) / 8));
  for (let v = yTop; v >= yBot; v -= stepY) {
    el("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: v === yTop ? "eh-axis" : "eh-grid" }, svg);
    const t = el("text", { x: L - 6, y: Y(v) + 4, "text-anchor": "end", class: "eh-tick" }, svg);
    t.textContent = `10${supText(v)}`;
  }
  el("line", { x1: L, x2: W - R, y1: Y(budget), y2: Y(budget), class: "eh-budget" }, svg);
  const bl = el("text", { x: L + 6, y: Y(budget) + 14, class: "eh-label eh-red-text" }, svg);
  bl.textContent = `budget Δ = ${(10 ** (budget - Math.floor(budget))).toFixed(1)}·10${supText(Math.floor(budget))} ulp`;
  const yl = el("text", { x: L, y: top - 10, class: "eh-label" }, svg);
  yl.textContent = narrow ? "distance to a short decimal (ulps, log)" : "distance to the nearest short decimal, in ulps (log scale)";
  const line = shown.filter((p) => p.r !== 0n).map((p, j) => `${j ? "L" : "M"}${X(p.i).toFixed(1)},${Y(ulp(p.r)).toFixed(1)}`).join(" ");
  el("path", { d: line, class: "eh-ladder" }, svg);
  for (const p of shown) {
    if (p.r === 0n) continue;
    const g = el("g", {}, svg);
    const x = X(p.i), y = Y(ulp(p.r));
    if (p.r > 0n) el("circle", { cx: x, cy: y, r: 4, class: "eh-pos" }, g);
    else el("rect", { x: x - 3.5, y: y - 3.5, width: 7, height: 7, class: "eh-neg" }, g);
    const tt = el("title", {}, g);
    tt.textContent = `hop ${p.i}: k = ${fmt(p.k)}, midpoint ${p.r > 0n ? "above" : "below"} a short decimal by ${(10 ** (ulp(p.r) - Math.floor(ulp(p.r)))).toFixed(2)}e${Math.floor(ulp(p.r))} ulp`;
  }
  const hops = path.length - 1;
  for (const i of [0, hops]) {
    const t = el("text", { x: X(i), y: bottom + 16, "text-anchor": i ? "end" : "start", class: "eh-tick" }, svg);
    t.textContent = i ? `hop ${fmt(i)}` : "start (k = 0)";
  }
  const lg = el("g", { transform: `translate(${L + 4},${bottom + 32})` }, svg);
  el("circle", { cx: 4, cy: -4, r: 4, class: "eh-pos" }, lg);
  const t1 = el("text", { x: 14, y: 0, class: "eh-tick" }, lg); t1.textContent = "midpoint above the short decimal";
  const [bx, by] = narrow ? [0, 16] : [230, 0];
  el("rect", { x: bx + 0.5, y: by - 7.5, width: 7, height: 7, class: "eh-neg" }, lg);
  const t2 = el("text", { x: bx + 14, y: by, class: "eh-tick" }, lg); t2.textContent = narrow ? "midpoint below it" : "below";
  box.setAttribute("aria-label", `Descent in binade 2^${h.params.e}: ${hops} hops from ${(10 ** ulp(path[0].r)).toExponential(1)} ulp down to ${(10 ** ulp(path.at(-1).r)).toExponential(1)} ulp; budget ${(10 ** budget).toExponential(1)} ulp.`);
  return stride;
}

function renderReal(e) {
  const err = $("eh-real-error");
  if (!Number.isInteger(e) || !searchedBinade(e)) {
    err.textContent = e > 4 && e < 128 ? "Binades 2^5 … 2^127 use exact code; the search skips them." : "Pick e in −1074 … 4 or 128 … 1023.";
    return;
  }
  err.textContent = "";
  real.e = e;
  $("eh-real-input").value = e;
  for (const b of $("eh-real-presets").querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.e) === e));
  const t0 = performance.now();
  real.hunt = huntBinade(e);
  const ms = performance.now() - t0;
  const h = real.hunt;
  $("eh-real-params").innerHTML = paramsHtml(h.params);
  const stride = drawLadder();
  const hops = h.path.length - 1;
  const last = h.path.at(-1);
  const recCount = h.up.length + h.down.length;
  let text;
  if (h.hits.length) {
    const lastUlp = last.r === 0n ? 0 : 10 ** (blog10(last.r) - blog10(h.params.alpha));
    text = `${fmt(recCount)} records; the descent takes <strong>${fmt(hops)} hops</strong> to reach midpoint k = ${fmt(last.k)}, ${sciNum(lastUlp)} ulp from a short decimal. Fanning out finds <strong>${fmt(h.hits.length)} suspect midpoints</strong>, so ${fmt(h.inputs.length)} doubles to test.`;
  } else {
    text = `${fmt(recCount)} records; the descent ran ${fmt(hops)} hops to the end of the binade without getting inside the budget. <strong>No suspects</strong> in this binade.`;
  }
  if (stride > 1) text += ` <span class="eh-muted">(Chart shows every ${stride}th hop.)</span>`;
  text += ` <span class="eh-muted">Search time ${ms.toFixed(0)} ms, instead of ${fmt(2 ** 52)} midpoints.</span>`;
  $("eh-real-readout").innerHTML = text;
  $("eh-real-tests").innerHTML = "";
  $("eh-real-test").disabled = !h.inputs.length;
  setParam("e", e === 227 ? null : String(e));
}

function testSuspects() {
  const h = real.hunt;
  const counts = { ok: 0, long: 0, wrong: 0 };
  for (const x of h.inputs) counts[x.verdict]++;
  const bad = h.inputs.filter((x) => x.verdict !== "ok");
  const rows = bad.map((x) => {
    const dist = 10 ** (blog10(x.hit.r) - blog10(h.params.alpha));
    return `<tr><td class="eh-num">${x.d}</td><td class="eh-num">${hex64(x.d)}</td><td class="eh-num">${x.r.digits ? esc(decimalText(x.r.digits, x.r.exp)) : "(empty)"}</td><td>${x.verdict === "long" ? "too long" : "wrong"}</td><td class="eh-num">${sciNum(dist)}</td><td>${x.inTable ? "✓ yes" : "✗ no"}</td></tr>`;
  }).join("");
  $("eh-real-tests").innerHTML = `<div class="lab-readout">Tested ${fmt(h.inputs.length)} doubles: <strong>${counts.ok} fine</strong>, ${counts.long} too long, ${counts.wrong} wrong.</div>` +
    (bad.length ? `<div class="eh-scroll"><table class="eh-table"><thead><tr><th>input (shortest)</th><th>bits</th><th>fast path prints</th><th>verdict</th><th>midpoint off by (ulp)</th><th>in enum3.h</th></tr></thead><tbody>${rows}</tbody></table></div><p class="eh-muted eh-note">"Wrong" means the printed decimal reads back as a different double. The last numeric column is how far the suspect midpoint is from its short decimal.</p>` : "");
}

function initReal() {
  const box = $("eh-real-presets");
  for (const e of REAL_PRESETS) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.e = e; b.innerHTML = pow2Html(e);
    b.addEventListener("click", () => renderReal(e));
    box.appendChild(b);
  }
  $("eh-real-form").addEventListener("submit", (ev) => { ev.preventDefault(); renderReal(Number($("eh-real-input").value)); });
  $("eh-real-test").addEventListener("click", testSuspects);
  const e = Number(params.get("e") ?? 227);
  renderReal(searchedBinade(e) ? e : 227);
  if (params.get("test")) testSuspects();
}

// ---------------------------------------------------------------------------
// Rebuild the whole table

const rebuild = { worker: null, stop: false, running: false };

function tallyHtml(s, elapsed) {
  const wrong = s.failsList.filter((f) => f.verdict === "wrong").length;
  const long = s.failsList.filter((f) => f.verdict === "long").length;
  const inTable = s.failsList.filter((f) => f.inTable).length;
  let html = `<dl class="eh-tally-grid">
    <div><dt>binades searched</dt><dd>${fmt(s.index)} / ${fmt(s.total)}</dd></div>
    <div><dt>suspect midpoints</dt><dd>${fmt(s.mids)}</dd></div>
    <div><dt>doubles tested</dt><dd>${fmt(s.inputs)}</dd></div>
    <div><dt>fast path fails</dt><dd>${fmt(s.failsList.length)} <small>${wrong} wrong · ${long} too long</small></dd></div>
    <div><dt>of those in enum3.h</dt><dd>${fmt(inTable)}</dd></div>
    <div><dt>time</dt><dd>${(elapsed / 1000).toFixed(1)} s</dd></div></dl>`;
  if (s.done) {
    const manual = s.failsList.filter((f) => f.manual);
    const ok = !s.missingFromTable.length && !s.tableNotFound.length;
    html += `<div class="lab-readout">${fmt(s.failsList.length - manual.length)} failures from the search${manual.length ? ` + ${manual.map((f) => f.hex === "7fefffffffffffff" ? "DBL_MAX" : f.hex).join(", ")} (checked by hand)` : ""} = <strong>${fmt(s.failsList.length)}</strong> inputs. enum3.h has ${ENUM3.size}. ${ok ? "<strong>Identical sets</strong>: every input found is in the table, and every table entry was found." : `Differences: ${s.missingFromTable.length} found but not in the table, ${s.tableNotFound.length} table entries not found.`}</div>`;
  }
  return html;
}

function startRebuild() {
  if (rebuild.running) return;
  rebuild.running = true; rebuild.stop = false;
  $("eh-rebuild-run").disabled = true; $("eh-rebuild-stop").disabled = false;
  const state = { index: 0, total: 1975, mids: 0, inputs: 0, failsList: [], done: false };
  const t0 = performance.now();
  const apply = (step) => {
    Object.assign(state, { index: step.index, total: step.total, mids: step.mids, inputs: step.inputs, done: step.done });
    state.failsList.push(...step.fresh);
    if (step.done) { state.missingFromTable = step.missingFromTable; state.tableNotFound = step.tableNotFound; }
  };
  const show = () => { $("eh-rebuild-bar").value = state.index; $("eh-rebuild-bar").max = state.total; $("eh-rebuild-tally").innerHTML = tallyHtml(state, performance.now() - t0); };
  const finish = () => { rebuild.running = false; $("eh-rebuild-run").disabled = false; $("eh-rebuild-stop").disabled = true; show(); };
  show();
  let worker = null;
  try { worker = new Worker(new URL("./errol-hunt-model.js", import.meta.url), { type: "module" }); } catch { worker = null; }
  if (worker) {
    rebuild.worker = worker;
    let gotAny = false;
    const fallbackTimer = setTimeout(() => { if (!gotAny) { worker.terminate(); rebuild.worker = null; mainThread(); } }, 4000);
    worker.onmessage = (ev) => {
      gotAny = true; clearTimeout(fallbackTimer);
      for (const step of ev.data) apply(step);
      show();
      if (state.done) { worker.terminate(); rebuild.worker = null; finish(); }
    };
    worker.onerror = () => { clearTimeout(fallbackTimer); worker.terminate(); rebuild.worker = null; if (!gotAny) mainThread(); };
    worker.postMessage({ cmd: "rebuild" });
  } else mainThread();

  async function mainThread() {
    const gen = rebuildTable();
    for (;;) {
      const end = performance.now() + 30;
      let r;
      while (!(r = gen.next()).done) { apply(r.value); if (r.value.done || performance.now() > end) break; }
      show();
      if (state.done || r.done || rebuild.stop) break;
      await nextFrame();
    }
    finish();
  }
}

function initRebuild() {
  $("eh-rebuild-run").addEventListener("click", startRebuild);
  $("eh-rebuild-stop").addEventListener("click", () => {
    rebuild.stop = true;
    if (rebuild.worker) { rebuild.worker.terminate(); rebuild.worker = null; rebuild.running = false; $("eh-rebuild-run").disabled = false; $("eh-rebuild-stop").disabled = true; }
  });
  $("eh-rebuild-tally").innerHTML = `<p class="eh-muted">Not run yet.</p>`;
  if (params.get("rebuild")) startRebuild();
}

// ---------------------------------------------------------------------------
// Ledger: run the reference integer path

const LEDGER = [["1e23", 1e23], ["1e38", 1e38], ["2e38", 2e38], [pow2(64), 2 ** 64], [pow2(65), 2 ** 65]];

function runLedger(label, x) {
  const r = errolInt(x);
  const exact = BigInt(x);
  let text = `errol_int(${label} = ${exact}) → "${esc(r.digits)}", exponent ${r.exp}. `;
  if (!r.digits) text += `<strong>Empty output</strong>; the code also wrote one byte before the buffer.`;
  else if (!/^[0-9]+$/.test(r.digits)) text += `<strong>Not a number</strong>: the digit 9 was rounded up to the next character code without a carry.`;
  else {
    const back = Number(`0.${r.digits}e${r.exp}`);
    const verdict = judge(r, x);
    const diff = BigInt(back) - exact;
    if (verdict === "wrong") text += `That is ${decimalText(r.digits, r.exp)}, which reads back as ${BigInt(back)} = <strong>v ${diff < 0n ? "−" : "+"} ${diff < 0n ? -diff : diff}</strong>, a different double.`;
    else text += `That is ${decimalText(r.digits, r.exp)}: ${verdict === "long" ? "correct but too long" : "correct and shortest"}.`;
  }
  text += ` Shortest correct output: ${String(x)}.`;
  $("eh-ledger-out").innerHTML = text;
  for (const b of $("eh-ledger-chips").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.label === label));
}

function initLedger() {
  const box = $("eh-ledger-chips");
  for (const [label, x] of LEDGER) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.label = label;
    b.addEventListener("click", () => runLedger(label, x));
    box.appendChild(b);
  }
}

// ---------------------------------------------------------------------------

function init() {
  initSetup();
  for (const fig of document.querySelectorAll(".eh-bench")) initBench(fig);
  listeners.errol1.push(() => renderInspector());
  $("eh-needles").addEventListener("click", runNeedles);
  initToy();
  initReal();
  initRebuild();
  initLedger();
  const sync = params.has("sync");
  const all = params.get("run") === "all";
  for (const v of ["errol1", "errol2", "errol3u"]) {
    if (v === "errol1" || all) runBench(benches[v], sync);
  }
  if (sync && all) runNeedles();
  if (params.get("inspect")) selectBinade(Number(params.get("inspect")), false);
  let rt = null;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { for (const b of Object.values(benches)) drawBench(b); if (real.hunt) drawLadder(); }, 150);
  });
}

init();
