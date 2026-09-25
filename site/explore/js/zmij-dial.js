// Copyright (C) 2026 Toit contributors.
//
// Interaction for explore/zmij-dial.html: the fraction dial, the tiling spiral,
// the decision map and the output assembly. All numbers come from
// zmij-dial-model.js (exact BigInt arithmetic).

import {
  zmij, classify, parseInput, hex64, ratToDecimal, halfUlpForExponent, neighbour,
  jsShortest, TWO64, M64,
} from "./zmij-dial-model.js";
import { fromBits } from "../../js/float.js";

const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const PRESETS = [
  ["0.3", "0.3"],
  ["0.1", "0.1"],
  ["2/3", "2/3"],
  ["1/7", "1/7"],
  ["0.1+0.2", "0.1+0.2"],
  ["1e23", "1e23"],
  ["70368744177664.125", "70368744177664.125"],
  ["2^-1017", "2^-1017"],
  ["5e-324", "5e-324"],
  ["max", "1.7976931348623157e308"],
];

const params = new URLSearchParams(location.search);
const state = {
  input: params.get("x") || "0.3",
  x: 0.3,
  odd: params.get("odd") === "1",
  z: null,
  animate: params.get("anim") !== "0" && !reducedMotion,
  mapE: params.has("e") ? Number(params.get("e")) : null,
};

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const minus = (n) => String(n).replace("-", "−");
const pow10Html = (n) => `10<sup>${minus(n)}</sup>`;
const turns = (v) => Number(v) / 2 ** 64;
function dec(r, places = 18) {
  const d = ratToDecimal(r, places);
  return d.exact ? d.text : `${d.text}…`;
}
const machineTurns = (w, places = 20) => dec({ num: w, den: TWO64 }, places);
function commonPrefixHtml(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `${esc(a.slice(0, i))}<span class="zmij-dial-diff">${esc(a.slice(i))}</span>`;
}
function polar(turn, r) {
  const a = turn * 2 * Math.PI;
  return [r * Math.sin(a), -r * Math.cos(a)];
}
function arcPath(t0, t1, r) {
  if (t1 - t0 < 1e-9) return "";
  const span = Math.min(t1 - t0, 0.9999);
  const [x0, y0] = polar(t0, r);
  const [x1, y1] = polar(t0 + span, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function tween(ms, fn) {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;
    const finish = () => { if (!done) { done = true; fn(1); resolve(); } };
    // Safety net: frames may not run (background tab, headless); finish anyway.
    const guard = setTimeout(finish, ms + 250);
    const frame = (now) => {
      if (done) return;
      const t = Math.min(1, (now - start) / ms);
      if (t >= 1) { clearTimeout(guard); finish(); return; }
      fn(t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
function syncUrl() {
  const p = new URLSearchParams(location.search);
  p.set("x", state.input);
  if (state.odd) p.set("odd", "1"); else p.delete("odd");
  if (state.mapE !== null) p.set("e", String(state.mapE));
  history.replaceState(null, "", `${location.pathname}?${p}${location.hash}`);
}
function hLowTurns(z) { return z.regular ? turns(z.h) : turns(z.h) / 2; }

// ---------------------------------------------------------------- dial SVG

const R = 142;
const dial = {};
function buildDial() {
  const svg = $("zmij-dial-svg");
  el("circle", { class: "zmij-dial-rim", r: R + 44 }, svg);
  el("circle", { class: "zmij-dial-ring", r: R }, svg);
  dial.arc = el("path", { class: "zmij-dial-arc" }, svg);
  dial.over = el("path", { class: "zmij-dial-over" }, svg);
  dial.under = el("path", { class: "zmij-dial-under" }, svg);
  for (let j = 1; j < 10; j++) {
    const [x0, y0] = polar(j / 10, R - 9);
    const [x1, y1] = polar(j / 10, R + 9);
    el("line", { class: "zmij-dial-tick", x1: x0, y1: y0, x2: x1, y2: y1 }, svg);
    const [lx, ly] = polar(j / 10, R + 29);
    const t = el("text", { class: "zmij-dial-ticklabel", x: lx, y: ly + 5, "text-anchor": "middle" }, svg);
    t.textContent = String(j);
  }
  dial.twelve = el("line", { class: "zmij-dial-twelve", x1: 0, y1: -(R - 22), x2: 0, y2: -(R + 18) }, svg);
  const tl = el("text", { class: "zmij-dial-twelvelabel", x: 0, y: -(R + 25), "text-anchor": "middle" }, svg);
  tl.textContent = "12 = a whole turn";
  dial.tickRing = el("circle", { class: "zmij-dial-tickring", r: 14, cx: 0, cy: 0, visibility: "hidden" }, svg);
  dial.tickRing2 = el("circle", { class: "zmij-dial-tickring alt", r: 14, cx: 0, cy: 0, visibility: "hidden" }, svg);
  dial.rawX = el("path", { class: "zmij-dial-rawx", visibility: "hidden" }, svg);
  dial.capLo = el("circle", { class: "zmij-dial-cap", r: 5.5 }, svg);
  dial.capHi = el("circle", { class: "zmij-dial-cap", r: 5.5 }, svg);
  dial.point = el("circle", { class: "zmij-dial-point", r: 7.5 }, svg);
}

function drawDial(z, pt, s, verdict) {
  const h = turns(z.h), lo = hLowTurns(z);
  const a0 = pt - s * lo, a1 = pt + s * h;
  dial.arc.setAttribute("d", arcPath(a0, a1, R));
  dial.over.setAttribute("d", a1 >= 1 ? arcPath(1, a1, R) : "");
  dial.under.setAttribute("d", a0 < 0 ? arcPath(a0, 0, R) : "");
  const closed = z.regular ? z.even : true;
  for (const [cap, t] of [[dial.capLo, a0], [dial.capHi, a1]]) {
    const [x, y] = polar(t, R);
    cap.setAttribute("cx", x); cap.setAttribute("cy", y);
    cap.classList.toggle("open", !closed);
    cap.setAttribute("visibility", s > 0.02 ? "visible" : "hidden");
  }
  const [px, py] = polar(pt, R);
  dial.point.setAttribute("cx", px); dial.point.setAttribute("cy", py);
  const crossed = verdict && z.decision !== "digit";
  dial.twelve.classList.toggle("lit", crossed);
  for (const ring of [dial.tickRing, dial.tickRing2]) ring.setAttribute("visibility", "hidden");
  dial.rawX.setAttribute("visibility", "hidden");
  if (verdict && z.decision === "digit") {
    const place = (ring, d) => {
      const [x, y] = polar(d / 10, R + 29);
      ring.setAttribute("cx", x); ring.setAttribute("cy", y); ring.setAttribute("visibility", "visible");
    };
    place(dial.tickRing, z.digit);
    if (z.tieFix) place(dial.tickRing2, 3);
    if (z.clamped) {
      const [x, y] = polar(z.digitRaw / 10, R + 29);
      const d = 8;
      dial.rawX.setAttribute("d", `M${x - d} ${y - d}L${x + d} ${y + d}M${x - d} ${y + d}L${x + d} ${y - d}`);
      dial.rawX.setAttribute("visibility", "visible");
    }
  }
}

// ---------------------------------------------------------------- odometer

const WHEELS = 16;
const odo = { wheels: [], last: null };
function buildOdometer() {
  const host = $("zmij-dial-odo");
  const strip = () => `<span class="zmij-dial-strip">${Array.from({ length: 20 }, (_, i) => `<span>${i % 10}</span>`).join("")}</span>`;
  host.innerHTML = `${Array.from({ length: WHEELS }, () => `<span class="zmij-dial-wheel">${strip()}</span>`).join("")}<span class="zmij-dial-sep" aria-hidden="true"></span><span class="zmij-dial-wheel last">${strip()}</span>`;
  odo.wheels = [...host.querySelectorAll(".zmij-dial-wheel:not(.last)")];
  odo.last = host.querySelector(".zmij-dial-wheel.last");
  for (const w of [...odo.wheels, odo.last]) { w.dataset.d = "0"; w._tok = 0; }
}
function setWheel(w, digit, { animate = false, dir = 1, delay = 0 } = {}) {
  const strip = w.firstChild;
  const cur = Number(w.dataset.d);
  const tok = ++w._tok;
  w.dataset.d = String(digit);
  const place = (pos, ms, dl = 0) => {
    strip.style.transition = ms ? `transform ${ms}ms cubic-bezier(.35,.7,.3,1) ${dl}ms` : "none";
    strip.style.transform = `translateY(${-pos * 5}%)`;
  };
  if (!animate || cur === digit) { place(digit, 0); return; }
  if (dir > 0) {
    const target = digit < cur ? digit + 10 : digit;
    place(cur, 0); void strip.offsetHeight;
    place(target, 480, delay);
    if (target !== digit) {
      strip.addEventListener("transitionend", () => { if (w._tok === tok) place(digit, 0); }, { once: true });
    }
  } else {
    const start = digit > cur ? cur + 10 : cur;
    place(start, 0); void strip.offsetHeight;
    place(digit, 480, delay);
  }
}
function setOdometer(I, { animate = false, dir = 1 } = {}) {
  const s = I.toString().padStart(WHEELS, "0");
  const lead = WHEELS - (I === 0n ? 0 : I.toString().length);
  let changedFromRight = 0;
  for (let i = WHEELS - 1; i >= 0; i--) {
    const w = odo.wheels[i];
    const d = Number(s[i]);
    const changed = Number(w.dataset.d) !== d;
    setWheel(w, d, { animate, dir, delay: changed ? changedFromRight++ * 45 : 0 });
    w.classList.toggle("lead", i < lead);
    w.classList.remove("fade");
  }
}
function setLastWheel(digit, { animate = false } = {}) {
  odo.last.classList.toggle("empty", digit === null);
  if (digit !== null) setWheel(odo.last, digit, { animate, dir: 1 });
  else setWheel(odo.last, 0, {});
  odo.last.classList.remove("fade");
}
function fadeTrailingZeros(z) {
  if (z.hasLastDigit) return;
  const s = z.sig.toString().padStart(WHEELS, "0");
  for (let i = WHEELS - 1; i >= 0 && s[i] === "0" && z.sig !== 0n; i--) odo.wheels[i].classList.add("fade");
}

// ---------------------------------------------------------------- side panel

function describeQuestions(z, show) {
  const items = $("zmij-dial-questions").querySelectorAll("li");
  const sumT = turns(z.sum);
  const texts = {
    up: z.roundUp ? `yes: F + h ${z.sum === TWO64 ? "= 2⁶⁴ exactly (1 turn)" : `≈ ${sumT.toFixed(4)} turns`} → carry`
      : TWO64 - z.sum < 1024n ? `no: F + h = 2⁶⁴ − ${TWO64 - z.sum}, just short` : `no: F + h ≈ ${sumT.toFixed(4)}`,
    down: z.regular
      ? (z.roundDown ? `yes: F ≈ ${turns(z.F).toFixed(4)} < h ≈ ${turns(z.h).toFixed(4)}` : `no: F ≈ ${turns(z.F).toFixed(4)} ≥ h ≈ ${turns(z.h).toFixed(4)}`)
      : (z.roundDown ? `yes: F < h/2 ≈ ${(turns(z.h) / 2).toFixed(4)} (lopsided)` : `no: F ≥ h/2 ≈ ${(turns(z.h) / 2).toFixed(4)} (lopsided)`),
    digit: z.hasLastDigit
      ? (z.tieFix ? "10F = 2.5 exactly: tie, even digit 2"
        : z.clamped ? `nearest tick ${z.digitRaw} is outside the arc → ${z.digit}`
        : `10F ≈ ${(10 * turns(z.F)).toFixed(4)} → tick ${z.digit}`)
      : "not needed",
  };
  for (const li of items) {
    const q = li.dataset.q;
    const yes = q === z.decision;
    li.dataset.state = show ? (yes ? "yes" : "no") : "";
    li.querySelector("em").textContent = show ? texts[q] : "";
  }
}

function renderSide(z) {
  const hLine = z.regular
    ? `h = ${dec(z.exact.h, 16)}`
    : `h = ${dec(z.exact.h, 16)} forward, h/2 = ${dec(z.exact.lowReach, 16)} back`;
  $("zmij-dial-cvalue").innerHTML =
    `<span>x = <code>${esc(String(z.negative ? -z.x : z.x))}</code>${z.negative ? " (sign printed separately; the dial shows |x|)" : ""}</span>` +
    `<span>m = ${z.m} (${z.rawEven ? "even" : "odd"}), e = ${minus(z.e)}, k = ${minus(z.k)}</span>` +
    `<span>c = x·${pow10Html(z.K)} = <code>${dec(z.exact.c, 16)}</code></span>` +
    `<span>${hLine}</span>` +
    `<span>one turn = ${pow10Html(z.k + 1)}</span>`;
}

function renderOut(z, show) {
  const out = $("zmij-dial-out");
  if (!show) { out.innerHTML = ""; return; }
  const js = String(Math.abs(z.x));
  const ref = jsShortest(z.x);
  const same = ref.digits === z.digits && ref.leadExp === z.leadExp;
  out.innerHTML = `<span class="zmij-dial-outlabel">Żmij writes</span><strong class="zmij-dial-outtext">${esc(z.text)}</strong>` +
    `<span class="zmij-dial-check ${same ? "ok" : "bad"}">JavaScript: ${esc((z.negative ? "-" : "") + js)} ${same ? "✓ same digits" : "✗ different digits"}</span>` +
    (!same && state.odd ? `<span class="zmij-dial-check">Still reads back as x, but it is not the shortest: you removed the tie rule.</span>` : "");
}

function renderNote(z) {
  const notes = [];
  if (!z.regular) notes.push(`<strong>Power of two.</strong> The neighbour below is twice as close, so the arc reaches only h/2 back. Żmij takes its separate path: k from ¾·2<sup>e</sup>, “keep I” tests F &lt; h/2, and the digit is clamped into the arc.`);
  if (z.regular && z.sum === TWO64) notes.push(`<strong>Knife edge.</strong> F + h = 2<sup>64</sup> exactly: the arc ends on 12. ${z.evenAdd ? "The +1 for even m is what makes the add carry." : "Without the +1 there is no carry."}`);
  if (z.regular && z.sum < TWO64 && TWO64 - z.sum < 1024n) notes.push(`<strong>Knife edge.</strong> F + h = 2<sup>64</sup> − ${TWO64 - z.sum}: the arc stops just short of 12, so there is no carry.`);
  if (z.regular && z.rawEven && state.odd) notes.push(`<strong>Pretending m is odd:</strong> the +1 on h is dropped, so the interval’s ends no longer count.`);
  if (z.regular && !z.rawEven && state.odd) notes.push(`m is already odd, so the toggle changes nothing.`);
  if (z.tieFix) notes.push(`<strong>Tie.</strong> F is exactly a quarter turn. The rounding constant would round 2.5 up to 3; one special case in the code rounds it to the even 2.`);
  if (z.exact.frac.num === 0n && z.F !== 0n) notes.push(`<strong>Exact integer.</strong> c is exactly ${z.exact.I}. The truncated power of ten puts the machine a hair below it (F ≈ 1 − 2<sup>−64</sup>), so it takes the carry and lands on the same integer.`);
  if (z.subnormal) notes.push(`<strong>Subnormal.</strong> Same path, but I has fewer digits; the writer counts them and pads.`);
  $("zmij-dial-note").innerHTML = notes.join(" ");
}

function renderSummary(z) {
  const verdict = z.decision === "up" ? `the arc passes twelve going forward, so the carry rounds I up to ${z.sig}`
    : z.decision === "down" ? `the arc reaches back past twelve, so I = ${z.sig} is kept`
    : `the arc does not reach twelve, so the nearest tick, ${z.digit}, is appended to ${z.sig}`;
  $("zmij-dial-summary").textContent = `${z.text}: F is ${turns(z.F).toFixed(4)} of a turn, h is ${turns(z.h).toFixed(4)}; ${verdict}. Output ${z.text}.`;
  $("zmij-dial-svg-title").textContent = `Fraction dial for ${z.text}: point at ${turns(z.F).toFixed(3)} turn, arc ±${turns(z.h).toFixed(3)}; ${z.decision === "digit" ? `digit ${z.digit}` : z.decision === "up" ? "carry, round up" : "keep floor"}.`;
}

// ---------------------------------------------------------------- 64-bit bar and registers

function renderBar(z) {
  const W = 480, x0 = 30, x1 = 450;
  const X = (t) => x0 + ((t + 0.5) / 2) * (x1 - x0);
  const F = turns(z.F), h = turns(z.h), lo = hLowTurns(z);
  let s = `<svg viewBox="0 0 ${W} 104" role="img" aria-label="64-bit fraction line: F at ${F.toFixed(4)}, interval from ${(F - lo).toFixed(4)} to ${(F + h).toFixed(4)}; ${z.roundUp ? "crosses 2^64, carry" : z.roundDown ? "crosses 0" : "stays inside the word"}">`;
  s += `<rect class="zmij-bar-under" x="${X(-0.5)}" y="30" width="${X(0) - X(-0.5)}" height="30"/>`;
  s += `<rect class="zmij-bar-over" x="${X(1)}" y="30" width="${X(1.5) - X(1)}" height="30"/>`;
  s += `<rect class="zmij-bar-word" x="${X(0)}" y="30" width="${X(1) - X(0)}" height="30"/>`;
  for (let j = 0; j <= 10; j++) {
    s += `<line class="zmij-bar-tick" x1="${X(j / 10)}" x2="${X(j / 10)}" y1="${j % 10 ? 52 : 26}" y2="60"/>`;
  }
  s += `<text class="zmij-bar-label" x="${X(0)}" y="76" text-anchor="middle">0</text>`;
  s += `<text class="zmij-bar-label" x="${X(0.5)}" y="76" text-anchor="middle">2⁶³</text>`;
  s += `<text class="zmij-bar-label red" x="${X(1)}" y="76" text-anchor="middle">2⁶⁴</text>`;
  s += `<text class="zmij-bar-note" x="${X(-0.25)}" y="96" text-anchor="middle">below 0: F &lt; h</text>`;
  s += `<text class="zmij-bar-note red" x="${X(1.25)}" y="96" text-anchor="middle">past 2⁶⁴: carry out</text>`;
  s += `<text class="zmij-bar-note mid" x="${X(0.5)}" y="96" text-anchor="middle">one 64-bit word = one turn</text>`;
  const bx0 = X(F - lo), bx1 = X(F + h);
  s += `<rect class="zmij-bar-band" x="${bx0}" y="36" width="${bx1 - bx0}" height="18"/>`;
  if (F + h >= 1) s += `<rect class="zmij-bar-band over" x="${X(1)}" y="36" width="${bx1 - X(1)}" height="18"/>`;
  if (F - lo < 0) s += `<rect class="zmij-bar-band under" x="${bx0}" y="36" width="${X(0) - bx0}" height="18"/>`;
  s += `<line class="zmij-bar-f" x1="${X(F)}" x2="${X(F)}" y1="24" y2="62"/><circle class="zmij-bar-fdot" cx="${X(F)}" cy="45" r="4.5"/>`;
  s += `<text class="zmij-bar-label" x="${X(F)}" y="18" text-anchor="middle">F</text>`;
  if (bx1 - bx0 > 70) {
    s += `<text class="zmij-bar-label muted" x="${bx1}" y="18" text-anchor="${F + h > 1.35 ? "end" : "middle"}">F+h</text>`;
    s += `<text class="zmij-bar-label muted" x="${bx0}" y="18" text-anchor="${F - lo < -0.35 ? "start" : "middle"}">${z.regular ? "F−h" : "F−h/2"}</text>`;
  }
  s += "</svg>";
  $("zmij-dial-bar").innerHTML = s;
}

function renderRegs(z) {
  const Ft = machineTurns(z.F, 24), Fx = dec(z.exact.frac, 24);
  const ht = machineTurns(z.h, 24), hx = dec(z.exact.h, 24);
  const same = (w, r) => w * r.den === r.num * TWO64;
  const Fsame = same(z.F, z.exact.frac), hsame = same(z.h, z.exact.h);
  const carry = z.sum > M64 ? 1 : 0;
  const rows = [];
  rows.push(`<tr><th scope="row">I</th><td><code>${z.integral0}</code></td><td colspan="2">integer part (55 bits of the product)${z.integral0 !== z.exact.I ? `; exact ⌊c⌋ is ${z.exact.I} (see note)` : ""}</td></tr>`);
  rows.push(`<tr><th scope="row">F</th><td><code>${hex64(z.F)}</code></td><td>F/2⁶⁴ ${Fsame ? "=" : "≈"} <code>${commonPrefixHtml(Ft, Fx)}</code>${Fsame ? " (exact here)" : ""}</td><td>true <code>${Fx}</code></td></tr>`);
  rows.push(`<tr><th scope="row">h</th><td><code>${hex64(z.h)}</code></td><td>h/2⁶⁴ ${hsame ? "=" : "≈"} <code>${commonPrefixHtml(ht, hx)}</code>${hsame ? " (exact here)" : ""}</td><td>true <code>${hx}</code>${z.evenAdd ? " (machine h includes +1: m even)" : ""}</td></tr>`);
  rows.push(`<tr class="${z.roundUp ? "hit" : ""}"><th scope="row">F + h</th><td><code>${hex64(z.sum)}</code></td><td colspan="2">carry out = <strong>${carry}</strong> → <code>round_up = ${carry}</code>${z.sum === TWO64 ? " (exactly 2⁶⁴)" : ""}</td></tr>`);
  rows.push(`<tr class="${z.roundDown ? "hit" : ""}"><th scope="row">${z.regular ? "h &gt; F" : "h/2 &gt; F"}</th><td><code>${z.roundDown}</code></td><td colspan="2">→ <code>round_down = ${z.roundDown ? 1 : 0}</code></td></tr>`);
  const digitExpr = z.regular
    ? `<code>hi64(10·F + 2⁶³ + 6) = ${z.digitRaw}</code>${z.tieFix ? ` → F = 2⁶² exactly, so <code>digit = 2</code>` : ""}`
    : `<code>max(hi64(10·F + 2⁶³ − 1), ⌈10·(F − h/2)⌉) = max(${z.digitRaw}, ${z.lo}) = ${z.digit}</code>`;
  rows.push(`<tr class="${z.hasLastDigit ? "hit" : ""}"><th scope="row">digit</th><td><code>${z.digit}</code></td><td colspan="2">${digitExpr}${z.hasLastDigit ? "" : " (computed anyway, then ignored)"}</td></tr>`);
  const outV = z.hasLastDigit ? `${z.sig}·10 + ${z.digit} = ${z.full.coef}` : `${z.sig}`;
  rows.push(`<tr><th scope="row">result</th><td colspan="3"><code>has_last_digit = ${z.hasLastDigit ? 1 : 0}</code> → <code>${outV}</code> × ${pow10Html(z.full.exp)}</td></tr>`);
  $("zmij-dial-regs").innerHTML = `<caption class="lab-sr-only">Machine words for ${esc(z.text)}</caption><thead><tr><th scope="col">word</th><th scope="col">machine</th><th scope="col">as a fraction of a turn</th><th scope="col">exact value</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

function renderOrigin(z) {
  const P = z.P;
  const pHex = `0x${P.hi.toString(16).padStart(16, "0")}_${P.lo.toString(16).padStart(16, "0")}`;
  const phex = `0x${(z.p >> 64n).toString(16).padStart(16, "0")}_${(z.p & M64).toString(16).padStart(16, "0")}`;
  $("zmij-dial-origin").innerHTML = `<ol class="zmij-origin">
    <li><code>m = ${hex64(z.m, { groups: false })}</code> (${z.m}), <code>e = ${minus(z.e)}</code>${z.subnormal ? " (subnormal: e fixed at −1074)" : ""}.</li>
    <li><code>k = ${z.regular ? "(e·315653) ≫ 20" : "(e·315653 − 131072) ≫ 20"} = ${minus(z.k)}</code>, i.e. ${z.regular ? "⌊e·log₁₀2⌋" : "⌊log₁₀(¾·2<sup>e</sup>)⌋"}. We multiply by ${pow10Html(z.K)}.</li>
    <li>Table entry <code>P</code>: the top 128 bits of ${pow10Html(z.K)}, rounded down: <code>${pHex}</code> (${P.exactInTable ? "exact" : "truncated"}).</li>
    <li><code>shift = ${z.shift}</code>: aligns the binary point so that 64 + 9 bits sit below it (always 6 to 9).</li>
    <li>One multiply: <code>p</code> = top 128 bits of <code>P × (m ≪ ${z.shift})</code> = <code>${phex}</code>.</li>
    <li><code>I = p ≫ 73 = ${z.integral0}</code>; <code>F</code> = the next 64 bits = <code>${hex64(z.F)}</code>; the last 9 bits (<code>${z.tail9.toString(2).padStart(9, "0")}</code>) are dropped.</li>
    <li>No second multiply for h: <code>h = P<sub>hi</sub> ≫ (10 − shift)${z.regular ? " + even" : ""} = ${hex64(z.h)}</code>. Half an ulp at this scale is the same power of ten, just shifted.</li>
  </ol>`;
}

// ---------------------------------------------------------------- tiling spiral

function renderTiles(x0) {
  const svg = $("zmij-tile-svg");
  const list = $("zmij-tile-list");
  let x = x0;
  let z0 = zmij(x, { exact: false });
  let note = "";
  if (!z0.regular) {
    x = neighbour(x, 1); z0 = zmij(x, { exact: false });
    note = " (the power of two itself is lopsided; the spiral starts one double above it)";
  }
  const u = 2 * turns(z0.h);
  const n = Math.max(4, Math.min(12, Math.ceil(1.2 / u) + 1));
  const seq = [];
  for (let i = 0; i < n && x !== null; i++) {
    const z = zmij(x, { exact: false });
    if (z.e !== z0.e || z.k !== z0.k || !z.regular) break;
    seq.push(z);
    x = neighbour(x, 1);
  }
  $("zmij-tile-start").textContent = `${z0.text}${note}`;
  let s = `<title id="zmij-tile-title">Rounding arcs of ${seq.length} consecutive doubles starting at ${esc(z0.text)}, drawn as a spiral; each arc starts where the previous one ends.</title>`;
  const dr = Math.min(16, 100 / seq.length), r0 = 146 - dr * seq.length;
  for (let j = 0; j < 10; j++) {
    const [ax, ay] = polar(j / 10, r0 - 12), [bx, by] = polar(j / 10, r0 + dr * seq.length + 4);
    s += `<line class="zmij-tile-spoke${j ? "" : " twelve"}" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/>`;
    const [lx, ly] = polar(j / 10, r0 + dr * seq.length + 18);
    s += `<text class="zmij-dial-ticklabel small" x="${lx}" y="${ly + 4}" text-anchor="middle">${j === 0 ? "12" : j}</text>`;
  }
  const base = seq[0].integral0;
  seq.forEach((z, i) => {
    const r = r0 + dr * i;
    const F = turns(z.F) + Number(z.integral0 - base);
    const h = turns(z.h);
    const cls = z.decision === "digit" ? (i % 2 ? "digit alt" : "digit") : "short";
    s += `<path class="zmij-tile-arc ${cls}" d="${arcPath(F - h, F + h, r)}"/>`;
    const [px, py] = polar(F, r);
    s += `<circle class="zmij-tile-dot" cx="${px}" cy="${py}" r="3"/>`;
    const [ex, ey] = polar(F + h, r), [fx, fy] = polar(F + h, r + dr);
    if (i < seq.length - 1) s += `<line class="zmij-tile-join" x1="${ex}" y1="${ey}" x2="${fx}" y2="${fy}"/>`;
  });
  svg.innerHTML = s;
  list.innerHTML = seq.map((z) => {
    const v = z.decision === "up" ? "passes 12 forward: I + 1" : z.decision === "down" ? "passes 12 back: I" : `digit ${z.digit}`;
    return `<li class="${z.decision === "digit" ? "" : "short"}"><code>${esc(z.text)}</code> <span>${v}</span></li>`;
  }).join("");
}

// ---------------------------------------------------------------- decision map

const MAP = { L: 52, Rt: 544, T: 14, B: 434 };
const MX = (F) => MAP.L + F * (MAP.Rt - MAP.L);
const MY = (h) => MAP.B - (h / 0.5) * (MAP.B - MAP.T);
const rain = { bits: [], random: [], short: [] };
const counts = { bits: null, random: null, short: null };
const map = {};

function buildMap() {
  const svg = $("zmij-map-svg");
  const pts = (arr) => arr.map(([F, h]) => `${MX(F).toFixed(1)},${MY(h).toFixed(1)}`).join(" ");
  let s = `<defs><pattern id="zmij-map-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="zmij-map-hatchline"/></pattern></defs>`;
  s += `<rect class="zmij-map-none" x="${MX(0)}" y="${MY(0.05)}" width="${MX(1) - MX(0)}" height="${MY(0) - MY(0.05)}" fill="url(#zmij-map-hatch)"/>`;
  s += `<polygon class="zmij-map-floor" points="${pts([[0, 0.05], [0.05, 0.05], [0.5, 0.5], [0, 0.5]])}"/>`;
  s += `<polygon class="zmij-map-ceil" points="${pts([[0.95, 0.05], [1, 0.05], [1, 0.5], [0.5, 0.5]])}"/>`;
  for (let j = 1; j <= 9; j++) {
    const a = (j - 0.5) / 10, b = (j + 0.5) / 10;
    const poly = [[a, 0.05], [b, 0.05], [b, Math.min(b, 1 - b)]];
    if (a < 0.5 && b > 0.5) poly.push([0.5, 0.5]);
    poly.push([a, Math.min(a, 1 - a)]);
    s += `<polygon class="zmij-map-stripe${j % 2 ? "" : " alt"}" data-digit="${j}" points="${pts(poly)}"/>`;
    s += `<text class="zmij-map-digit" x="${MX(j / 10)}" y="${MY(0.066)}" text-anchor="middle">${j}</text>`;
  }
  // The would-be stripes 0 and 10 exist only below h = 0.05.
  s += `<polygon class="zmij-map-ghost" points="${pts([[0, 0], [0.05, 0.05], [0, 0.05]])}"/>`;
  s += `<polygon class="zmij-map-ghost" points="${pts([[0.95, 0.05], [1, 0], [1, 0.05]])}"/>`;
  s += `<polygon class="zmij-map-ghost0" points="${pts([[0, 0], [0.05, 0], [0.05, 0.05]])}"/>`;
  s += `<polygon class="zmij-map-ghost0" points="${pts([[0.95, 0], [1, 0], [0.95, 0.05]])}"/>`;
  s += `<text class="zmij-map-ghostlabel" x="${MX(0.07)}" y="${MY(0.012)}">← digit 0: F &lt; .05</text>`;
  s += `<text class="zmij-map-ghostlabel" x="${MX(0.93)}" y="${MY(0.012)}" text-anchor="end">digit 10: F ≥ .95 →</text>`;
  s += `<text class="zmij-map-nonelabel" x="${MX(0.5)}" y="${MY(0.034) + 4}" text-anchor="middle">h &lt; 0.05: no double lands here</text>`;
  s += `<line class="zmij-map-diag" x1="${MX(0.05)}" y1="${MY(0.05)}" x2="${MX(0.5)}" y2="${MY(0.5)}"/>`;
  s += `<line class="zmij-map-diag" x1="${MX(0.95)}" y1="${MY(0.05)}" x2="${MX(0.5)}" y2="${MY(0.5)}"/>`;
  s += `<text class="zmij-map-region floor" x="${MX(0.13)}" y="${MY(0.4)}" text-anchor="middle">keep I</text>`;
  s += `<text class="zmij-map-formula" x="${MX(0.13)}" y="${MY(0.4) + 18}" text-anchor="middle">F &lt; h</text>`;
  s += `<text class="zmij-map-region ceil" x="${MX(0.87)}" y="${MY(0.4)}" text-anchor="middle">I + 1</text>`;
  s += `<text class="zmij-map-formula" x="${MX(0.87)}" y="${MY(0.4) + 18}" text-anchor="middle">F + h ≥ 1</text>`;
  s += `<text class="zmij-map-region" x="${MX(0.5)}" y="${MY(0.2)}" text-anchor="middle">append digit</text>`;
  s += `<text class="zmij-map-formula" x="${MX(0.5)}" y="${MY(0.2) + 18}" text-anchor="middle">round(10F)</text>`;
  s += `<rect class="zmij-map-frame" x="${MX(0)}" y="${MY(0.5)}" width="${MX(1) - MX(0)}" height="${MY(0) - MY(0.5)}"/>`;
  for (let j = 0; j <= 10; j++) {
    s += `<line class="zmij-map-axis" x1="${MX(j / 10)}" x2="${MX(j / 10)}" y1="${MAP.B}" y2="${MAP.B + 5}"/>`;
    if (j % 2 === 0) s += `<text class="zmij-map-axislabel" x="${MX(j / 10)}" y="${MAP.B + 19}" text-anchor="middle">${j === 0 ? "0" : j === 10 ? "1" : `.${j}`}</text>`;
  }
  for (const h of [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5]) {
    s += `<line class="zmij-map-axis" x1="${MAP.L - 5}" x2="${MAP.L}" y1="${MY(h)}" y2="${MY(h)}"/>`;
    s += `<text class="zmij-map-axislabel" x="${MAP.L - 8}" y="${MY(h) + 4}" text-anchor="end">${h === 0 ? "0" : String(h).replace("0.", ".")}</text>`;
  }
  s += `<text class="zmij-map-axistitle" x="${MX(0.5)}" y="${MAP.B + 35}" text-anchor="middle">F (fraction of a turn) →</text>`;
  s += `<text class="zmij-map-axistitle" x="14" y="${MY(0.25)}" text-anchor="middle" transform="rotate(-90 14 ${MY(0.25)})">h (half-ulp) →</text>`;
  s += `<g id="zmij-map-rain"><path class="zmij-map-rain bits"/><path class="zmij-map-rain random"/><path class="zmij-map-rain short"/></g>`;
  s += `<g id="zmij-map-eline"><line class="zmij-map-eline" x1="${MX(0)}" x2="${MX(1)}"/><circle class="zmij-map-ecross" r="4"/><circle class="zmij-map-ecross" r="4"/></g>`;
  s += `<g id="zmij-map-dot" visibility="hidden"><line class="zmij-map-leader"/><circle class="zmij-map-dot" r="7"/><text class="zmij-map-dotlabel"></text></g>`;
  svg.insertAdjacentHTML("beforeend", s);
  map.rainPaths = {
    bits: svg.querySelector(".zmij-map-rain.bits"),
    random: svg.querySelector(".zmij-map-rain.random"),
    short: svg.querySelector(".zmij-map-rain.short"),
  };
  map.eline = svg.querySelector("#zmij-map-eline");
  map.dot = svg.querySelector("#zmij-map-dot");
}

function setMapExponent(e) {
  state.mapE = e;
  const info = halfUlpForExponent(e);
  const y = MY(info.hn);
  const [line, c1, c2] = map.eline.children;
  line.setAttribute("y1", y); line.setAttribute("y2", y);
  c1.setAttribute("cx", MX(info.hn)); c1.setAttribute("cy", y);
  c2.setAttribute("cx", MX(1 - info.hn)); c2.setAttribute("cy", y);
  $("zmij-map-exp").value = String(e);
  $("zmij-map-exp-out").innerHTML = `e = ${minus(e)}, k = ${minus(info.k)}, one turn = ${pow10Html(info.k + 1)}, h = ${dec(info.exact, 6)}`;
}

function setMapDot(x) {
  const z = zmij(x, { exact: false });
  $("zmij-map-input").value = String(Math.abs(x));
  const label = map.dot.querySelector("text");
  if (!z.regular) {
    map.dot.setAttribute("visibility", "hidden");
    setMapStatus(`${z.text} is a power of two: its arc is lopsided (h/2 back, h forward), so it is not on this map. The dial handles it.`);
    return;
  }
  const F = turns(z.F), h = turns(z.h);
  const circle = map.dot.querySelector("circle");
  circle.setAttribute("cx", MX(F)); circle.setAttribute("cy", MY(h));
  const ly = h < 0.13 ? MY(0.14) : MY(h) - 12;
  const lx = MX(F) + (F > 0.6 ? -6 : 6);
  label.setAttribute("x", lx);
  label.setAttribute("y", ly);
  const leader = map.dot.querySelector("line");
  leader.setAttribute("x1", MX(F)); leader.setAttribute("y1", MY(h));
  leader.setAttribute("x2", lx); leader.setAttribute("y2", ly + 4);
  leader.setAttribute("visibility", h < 0.13 ? "visible" : "hidden");
  label.setAttribute("text-anchor", F > 0.6 ? "end" : "start");
  label.textContent = z.text;
  map.dot.setAttribute("visibility", "visible");
  setMapExponent(z.e);
  const where = z.decision === "up" ? "right triangle: I + 1" : z.decision === "down" ? "left triangle: keep I" : `stripe ${z.digit}: append ${z.digit}`;
  setMapStatus(`${z.text}: F ≈ ${F.toFixed(4)}, h ≈ ${h.toFixed(4)} → ${where}.`);
}
function setMapStatus(text) { $("zmij-map-status").textContent = text; }

function randomBits() {
  const a = new BigUint64Array(1);
  crypto.getRandomValues(a);
  return a[0] & 0x7fffffffffffffffn;
}
function sample(kind) {
  for (;;) {
    let x;
    if (kind === "bits") x = fromBits(randomBits());
    else if (kind === "random") x = Math.random();
    else {
      const nd = 1 + Math.floor(Math.random() * 10);
      let digits = String(1 + Math.floor(Math.random() * 9));
      for (let i = 1; i < nd; i++) digits += Math.floor(Math.random() * 10);
      const point = Math.floor(Math.random() * (nd + 4)) - 3; // digits before the point
      x = Number(`${digits}e${point - nd}`);
    }
    if (Number.isFinite(x) && x !== 0) return x;
  }
}
function doRain(kind, n = 2000) {
  const c = counts[kind] || (counts[kind] = { n: 0, up: 0, down: 0, digit: 0, pow2: 0 });
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = sample(kind);
    const r = classify(x);
    if (!r.regular) { c.pow2++; continue; }
    c.n++; c[r.decision]++;
    d += `M${MX(r.Fn).toFixed(1)} ${MY(r.hn).toFixed(1)}h0`;
  }
  const path = map.rainPaths[kind];
  const old = path.getAttribute("d") || "";
  // keep at most ~12k dots per source
  path.setAttribute("d", old.length > 400000 ? d : old + d);
  renderCounts();
}
function renderCounts() {
  const names = { bits: "random bit patterns", random: "Math.random()", short: "short typed decimals" };
  const rows = Object.entries(counts).filter(([, c]) => c).map(([k, c]) => {
    const pct = (v) => `${((100 * v) / c.n).toFixed(1)}%`;
    return `<tr><th scope="row"><span class="zmij-map-key ${k}"></span>${names[k]}</th><td>${c.n.toLocaleString("en")}</td><td>${pct(c.down)}</td><td>${pct(c.up)}</td><td>${pct(c.digit)}</td><td>${c.pow2}</td></tr>`;
  });
  $("zmij-map-counts").innerHTML = rows.length
    ? `<caption class="lab-sr-only">Rain counts</caption><thead><tr><th scope="col">source</th><th scope="col">dots</th><th scope="col">keep I</th><th scope="col">I + 1</th><th scope="col">digit</th><th scope="col">2ⁿ (skipped)</th></tr></thead><tbody>${rows.join("")}</tbody>`
    : `<tbody><tr><td class="zmij-map-empty">No rain yet. Each button scatters 2,000 doubles and keeps a running count.</td></tr></tbody>`;
}

// ---------------------------------------------------------------- output assembly

function renderOutput(z) {
  const full = z.full.coef.toString();
  const kept = z.digits;
  const zeros = full.slice(kept.length);
  const has16 = z.sig >= 10n ** 15n;
  const formula = z.subnormal
    ? `subnormal: the writer counts the digits of I and pads; the leading digit’s exponent is ${minus(z.leadExp)}`
    : `k + 15 + (I ≥ 10¹⁵) = ${minus(z.k)} + 15 + ${has16 ? 1 : 0} = <strong>${minus(z.leadExp)}</strong>`;
  const fixed = z.leadExp >= -4 && z.leadExp <= 15;
  $("zmij-out-steps").innerHTML = `<ol class="zmij-out">
    <li><span>to_decimal gives</span><code>${z.sig}${z.hasLastDigit ? ` ‖ <b class="zmij-out-digit">${z.digit}</b>` : ""}</code><em>${z.decision === "up" ? "I + 1 (the carry)" : z.decision === "down" ? "I" : "I, then the extra digit"} × ${pow10Html(z.full.exp)}</em></li>
    <li><span>drop trailing zeros</span><code>${esc(kept)}<s class="zmij-out-zeros">${esc(zeros)}</s></code><em>${zeros.length ? `${zeros.length} zero${zeros.length > 1 ? "s" : ""} removed` : z.hasLastDigit ? "none: the extra digit is 1–9" : "none"}</em></li>
    <li><span>leading exponent</span><code>${formula}</code><em>${fixed ? "in [−4, 15] → fixed notation" : "outside [−4, 15] → scientific notation"}</em></li>
    <li><span>write</span><code class="zmij-out-final">${esc(z.text)}</code><em>${esc(String(z.x)) === z.text ? "same as JavaScript" : `JavaScript writes ${esc(String(z.x))} (its own layout rule, same digits)`}</em></li>
  </ol>`;
}

// ---------------------------------------------------------------- orchestration

let animToken = 0;
let prevZ = null;

async function show(x, { input = null, animate = state.animate, step = 0, fast = false } = {}) {
  const tok = ++animToken;
  const z = zmij(x, { pretendOdd: state.odd });
  state.x = x;
  state.z = z;
  if (input !== null) state.input = input;
  $("zmij-dial-input").value = state.input;
  for (const b of $("zmij-dial-presets").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.x === state.input));
  $("zmij-dial-odd").disabled = !z.regular;
  syncUrl();
  renderSide(z);
  renderBar(z);
  renderRegs(z);
  renderOrigin(z);
  renderNote(z);
  renderSummary(z);
  renderTiles(Math.abs(x));
  renderOutput(z);
  setMapDot(Math.abs(x));
  syncUrl();

  const F = turns(z.F);
  const sameScale = prevZ && prevZ.k === z.k && prevZ.regular === z.regular && prevZ.e === z.e;
  const prev = prevZ;
  prevZ = z;

  if (!animate) {
    drawDial(z, F, 1, true);
    setOdometer(z.sig);
    setLastWheel(z.hasLastDigit ? z.digit : null);
    fadeTrailingZeros(z);
    describeQuestions(z, true);
    renderOut(z, true);
    return;
  }

  const k = fast ? 0.45 : 1;
  describeQuestions(z, false);
  renderOut(z, false);
  let from = 0;
  if (step && sameScale) {
    const delta = Number(prev.integral0 - z.integral0);
    if (Math.abs(delta) < 3) from = delta + turns(prev.F);
    setOdometer(prev.integral0);
  } else {
    setOdometer(z.integral0);
  }
  setLastWheel(null);
  drawDial(z, from, 0, false);
  let rolled = !(step && sameScale);
  await tween((step ? 420 : 900) * k, (t) => {
    if (tok !== animToken) return;
    const p = from + (F - from) * t;
    drawDial(z, p, 0, false);
    if (!rolled && Math.floor(p) !== Math.floor(from) || (!rolled && t === 1)) {
      rolled = true;
      setOdometer(z.integral0, { animate: true, dir: z.integral0 >= prev.integral0 ? 1 : -1 });
    }
  });
  if (tok !== animToken) return;
  if (!rolled) setOdometer(z.integral0, { animate: true, dir: z.integral0 >= prev.integral0 ? 1 : -1 });
  await tween(500 * k, (t) => { if (tok === animToken) drawDial(z, F, t, false); });
  if (tok !== animToken) return;
  drawDial(z, F, 1, true);
  describeQuestions(z, true);
  if (z.roundUp) setOdometer(z.sig, { animate: true, dir: 1 });
  if (z.hasLastDigit) setLastWheel(z.digit, { animate: true });
  await sleep((z.roundUp ? 900 : 500) * k);
  if (tok !== animToken) return;
  fadeTrailingZeros(z);
  renderOut(z, true);
}

function loadInput(text, opts = {}) {
  const x = parseInput(text);
  if (x === null || !Number.isFinite(x) || x === 0) {
    $("zmij-dial-note").textContent = `“${text}” is not a finite, nonzero double. Try 0.3, 1/7, 2^-1017 or 0x3fd3333333333333.`;
    return false;
  }
  show(x, { input: text, ...opts });
  return true;
}

let walking = false;
async function walk() {
  const btn = $("zmij-dial-walk");
  if (walking) { walking = false; return; }
  walking = true;
  btn.textContent = "stop";
  for (let i = 0; i < 12 && walking; i++) {
    const y = neighbour(state.x, 1);
    if (y === null) break;
    await show(y, { input: String(y), step: 1, fast: true });
    await sleep(state.animate ? 250 : 500);
  }
  walking = false;
  btn.textContent = "walk 12 doubles";
}

function init() {
  buildDial();
  buildOdometer();
  buildMap();
  const chips = $("zmij-dial-presets");
  chips.innerHTML = PRESETS.map(([label, x]) => `<button type="button" data-x="${esc(x)}" aria-pressed="false">${esc(label)}</button>`).join("");
  chips.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b) loadInput(b.dataset.x);
  });
  $("zmij-dial-form").addEventListener("submit", (ev) => { ev.preventDefault(); loadInput($("zmij-dial-input").value); });
  $("zmij-dial-prev").addEventListener("click", () => { const y = neighbour(state.x, -1); if (y !== null) show(y, { input: String(y), step: -1 }); });
  $("zmij-dial-next").addEventListener("click", () => { const y = neighbour(state.x, 1); if (y !== null) show(y, { input: String(y), step: 1 }); });
  $("zmij-dial-walk").addEventListener("click", walk);
  $("zmij-dial-replay").addEventListener("click", () => { prevZ = null; show(state.x, { animate: !reducedMotion }); });
  const odd = $("zmij-dial-odd");
  odd.checked = state.odd;
  odd.addEventListener("change", () => { state.odd = odd.checked; show(state.x); });
  for (const b of document.querySelectorAll(".zmij-dial-load")) {
    b.addEventListener("click", () => {
      loadInput(b.dataset.x);
      $("dial").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    });
  }
  $("zmij-map-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const x = parseInput($("zmij-map-input").value);
    if (x === null || !Number.isFinite(x) || x === 0) { setMapStatus("Not a finite, nonzero double."); return; }
    setMapDot(Math.abs(x));
    syncUrl();
  });
  $("zmij-map-exp").addEventListener("input", (ev) => { setMapExponent(Number(ev.target.value)); syncUrl(); });
  for (const b of document.querySelectorAll("[data-rain]")) b.addEventListener("click", () => doRain(b.dataset.rain));
  $("zmij-map-clear").addEventListener("click", () => {
    for (const k of Object.keys(counts)) counts[k] = null;
    for (const p of Object.values(map.rainPaths)) p.setAttribute("d", "");
    renderCounts();
  });

  renderCounts();
  if (!loadInput(state.input, { animate: state.animate })) loadInput("0.3");
  if (state.mapE !== null && Number.isInteger(state.mapE) && state.mapE >= -1074 && state.mapE <= 971) setMapExponent(state.mapE);
  for (const kind of (params.get("rain") || "").split(",")) if (kind in rain) doRain(kind);
}

init();
