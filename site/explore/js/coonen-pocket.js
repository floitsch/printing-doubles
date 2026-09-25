// DOM code for the "Pocket Coonen" lab page. All arithmetic comes from
// coonen-pocket-model.js (exact BigInt simulation), nothing is hard-coded.

import * as M from "./coonen-pocket-model.js";

const P = "coonen-pocket-";
const SVGNS = "http://www.w3.org/2000/svg";
const params = new URLSearchParams(location.search);

function setParam(key, value, fallback) {
  if (value === fallback || value === null || value === undefined) params.delete(key);
  else params.set(key, String(value));
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

const $ = (id) => document.getElementById(id);
const minus = (s) => String(s).replace(/-/g, "−");
const pow = (base, exp) => `${base}<sup>${minus(exp)}</sup>`;
const code = (s) => `<code>${s}</code>`;
const ok = (good) => (good ? `<span class="${P}ok">✓</span>` : `<span class="${P}bad">✗</span>`);

function ratDec(num, den, maxFrac = 20) { return M.rationalToDecimal(num, den, maxFrac); }
function extDec(v, maxFrac = 20) { return M.extToDecimal(v, maxFrac); }

function fmtDelta(d) {
  if (d === 0) return "0";
  const [mant, exp] = d.toExponential(2).split("e");
  return `${minus(mant)} · ${pow(10, Number(exp))}`;
}

const DIR_WORD = { nearest: "to nearest", chop: "down", away: "up" };

// ---------------------------------------------------------------------------
// Number line: rows of markers above one axis, laid out in real pixels so the
// text stays readable at phone width. Coordinates are relative to a base
// integer n (x = 0 is n), so huge scaled values keep full precision.

function drawLine(container, spec) {
  container.replaceChildren();
  const W = Math.max(280, Math.round(container.clientWidth || 640));
  const padL = 16; const padR = 16; const rowH = 26; const top = 26;
  const rows = spec.rows;
  const axisY = top + Math.max(rows.length, 1) * rowH + 10;
  const H = axisY + 40;
  const X = (v) => padL + ((v - spec.lo) / (spec.hi - spec.lo)) * (W - padL - padR);
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", spec.label || "Number line");
  const add = (tag, attrs, text) => {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  };
  // register grid
  if (spec.grid) {
    for (let v = Math.ceil(spec.lo / spec.grid) * spec.grid; v <= spec.hi + 1e-9; v += spec.grid) {
      add("line", { x1: X(v), x2: X(v), y1: axisY - 7, y2: axisY, class: `${P}grid` });
    }
  }
  // decision line
  if (spec.decision) {
    const x = X(spec.decision.x);
    add("line", { x1: x, x2: x, y1: 12, y2: axisY + 6, class: `${P}decision` });
    const w = textWidth(spec.decision.label, 6.7);
    const fitsRight = x + 5 + w <= W - 2;
    add("text", { x: fitsRight ? x + 5 : Math.max(w + 2, x - 5), y: 14, class: `${P}decision-label`, "text-anchor": fitsRight ? "start" : "end" }, spec.decision.label);
  }
  add("line", { x1: padL, x2: W - padR, y1: axisY, y2: axisY, class: `${P}axis` });
  for (const t of spec.ticks) {
    const x = X(t.x);
    add("line", { x1: x, x2: x, y1: axisY - 10, y2: axisY + 6, class: `${P}tick` });
    add("text", { x, y: axisY + 22, "text-anchor": "middle", class: `${P}tick-label` }, t.label);
  }
  if (spec.gridLabel) {
    const fits = textWidth(spec.gridLabel, 6.1) <= W - padL - padR;
    add("text", { x: fits ? W - padR : padL, y: axisY + 36, "text-anchor": fits ? "end" : "start", class: `${P}grid-label` }, spec.gridLabel);
  }
  rows.forEach((row, i) => {
    const y = top + i * rowH + rowH / 2;
    const x = X(row.x);
    add("line", { x1: x, x2: x, y1: y, y2: axisY, class: `${P}stem ${P}stem-${row.kind}` });
    const s = 6;
    if (row.kind === "exact") add("path", { d: `M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`, class: `${P}mk-exact` });
    else if (row.kind === "product") add("circle", { cx: x, cy: y, r: 5, class: `${P}mk-product` });
    else if (row.kind === "register") add("rect", { x: x - 5, y: y - 5, width: 10, height: 10, class: `${P}mk-register` });
    else if (row.kind === "sticky") add("rect", { x: x - 5, y: y - 5, width: 10, height: 10, class: `${P}mk-sticky` });
    else if (row.kind === "result") add("circle", { cx: x, cy: y, r: 6, class: `${P}mk-result` });
    else if (row.kind === "wrong") add("path", { d: `M${x - 6} ${y - 6}L${x + 6} ${y + 6}M${x + 6} ${y - 6}L${x - 6} ${y + 6}`, class: `${P}mk-wrong` });
    const w = textWidth(row.label, 7.3);
    let tx; let anchor;
    if (x + 11 + w <= W - 2) { tx = x + 11; anchor = "start"; }
    else if (x - 11 - w >= 2) { tx = x - 11; anchor = "end"; }
    else { tx = W - 2; anchor = "end"; }
    add("text", { x: tx, y: y + 4, "text-anchor": anchor, class: `${P}row-label ${P}row-${row.kind}` }, row.label);
  });
  container.append(svg);
  container._spec = spec;
}

function textWidth(text, perChar) { return [...String(text)].length * perChar; }

const lineObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const box = entry.target;
    if (box._spec && Math.abs((box._lastW || 0) - box.clientWidth) > 4) {
      box._lastW = box.clientWidth;
      drawLine(box, box._spec);
    }
  }
});
function observeLine(box) { box._lastW = box.clientWidth; lineObserver.observe(box); }

/** Relative position of a rational num/den with respect to integer n. */
function rel(num, den, n) { return M.ratioToNumber(num - n * den, den); }
function relExt(v, n) { const r = M.extRational(v); return rel(r.num, r.den, n); }

// ---------------------------------------------------------------------------
// Step-by-step cards.

function makeStepper(figure, key, steps, baseSpec) {
  const controls = figure.querySelector(`.${P}stepper`);
  const list = figure.querySelector(`.${P}lines`);
  const box = figure.querySelector(`.${P}line`);
  const prev = button("Back");
  const next = button("Next step", true);
  const all = button("Show all");
  const reset = button("Reset");
  const counter = document.createElement("span");
  counter.className = `${P}counter`;
  controls.append(prev, next, all, reset, counter);
  list.replaceChildren(...steps.map((s) => {
    const li = document.createElement("li");
    li.innerHTML = s.html;
    return li;
  }));
  let k = clamp(Number(params.get(key)) || 1, 1, steps.length);
  const render = () => {
    [...list.children].forEach((li, i) => { li.hidden = i >= k; li.classList.toggle(`${P}current`, i === k - 1); });
    prev.disabled = k <= 1;
    next.disabled = k >= steps.length;
    all.disabled = k >= steps.length;
    counter.textContent = `step ${k} / ${steps.length}`;
    const rows = steps.slice(0, k).flatMap((s) => s.rows || []);
    const decision = steps.slice(0, k).some((s) => s.decision) ? baseSpec.decision : null;
    drawLine(box, { ...baseSpec, rows, decision, label: `${baseSpec.label} ${rows.map((r) => r.label).join("; ")}` });
    setParam(key, k, 1);
  };
  prev.addEventListener("click", () => { k = Math.max(1, k - 1); render(); });
  next.addEventListener("click", () => { k = Math.min(steps.length, k + 1); render(); if (k === steps.length) prev.focus(); });
  all.addEventListener("click", () => { k = steps.length; render(); });
  reset.addEventListener("click", () => { k = 1; render(); });
  render();
  observeLine(box);
}

function button(text, primary = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `lab-button${primary ? " primary" : ""}`;
  b.textContent = text;
  return b;
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function quarterTicks(n) {
  return [{ x: 0, label: String(n) }, { x: 0.5, label: `${n}.5` }, { x: 1, label: String(n + 1) }];
}

function cardA() {
  const m = 60; const e = -16;
  const c = M.convertToy(m, e);
  const p = c.run.passes[0];
  const n = c.ref.scaled.num / c.ref.scaled.den; // 915
  const nn = Number(n);
  const exact = c.ref.scaled;
  const exactText = ratDec(exact.num, exact.den);
  const zText = extDec(p.power.z);
  const zm = p.power.z.m; const ze = p.power.z.e;
  const prodText = ratDec(p.exactProduct.num, p.exactProduct.den);
  const regText = extDec(p.register);
  const shift = M.ratioToNumber(exact.num * p.exactProduct.den - p.exactProduct.num * exact.den, exact.den * p.exactProduct.den);
  const aboveHalf = rel(exact.num, exact.den, n) - 0.5;
  const bound = 1000 * 2 ** -12;
  const steps = [
    { html: `x = 60 × ${pow(2, e)} = ${ratDec(BigInt(m), 1n << BigInt(-e))} (significand ${code("111100")}). It lies in [${pow(10, -4)}, ${pow(10, -3)}), so LOGX = −4 and SCALE = 3 − (−4) − 1 = <b>${p.scale}</b>.` },
    { html: `Goal: x · ${pow(10, 6)} = <b>${exactText}</b> exactly. That is above ${nn}.5, so it should round to <b class="${P}red">${c.ref.coefficient}</b> and print as 9.16e−4.`, rows: [{ x: rel(exact.num, exact.den, n), kind: "exact", label: `exact ${exactText}` }], decision: true },
    { html: `${pow(10, 6)} = ${pow(2, 6)} · ${pow(5, 6)}, and ${pow(5, 6)} = 15625 needs 14 bits. The 12-bit register keeps ${zm} · ${pow(2, ze)} = <b>${zText}</b> (rounded to nearest), so δ = ${fmtDelta(p.power.delta)}.` },
    { html: `Multiply: 60 · ${zText} / ${pow(2, 16)} = ${prodText}. Near ${nn} the register has quarter steps, so chopping keeps ${code(M.extToBinary(p.chopped))} = <b>${extDec(p.chopped)}</b>.`, rows: [{ x: rel(p.exactProduct.num, p.exactProduct.den, n), kind: "product", label: `x · z = ${prodText}` }, { x: relExt(p.chopped, n), kind: "register", label: `chopped ${extDec(p.chopped)}` }] },
    { html: `Bits were chopped off, so step S3 ORs a 1 into the last bit. It is already 1, so the register stays at ${regText}.` },
    { html: `Round to nearest: ${regText} → <b>${c.run.coefficient}</b>, printed as 9.15e−4. ${ok(false)} The correct answer is 9.16e−4.`, rows: [{ x: Number(c.run.coefficient - n), kind: "wrong", label: `result ${c.run.coefficient}` }] },
    { html: `Why: z was ${Number(10n ** 6n - M.extRational(p.power.z).num)} too small, which pulled the product down by ${shift.toFixed(4)}. The exact value was only ${aboveHalf.toFixed(4)} above the ½ line. In the toy, a rounded z has δ up to ${pow(2, -12)}, so the shift can reach 1000 · ${pow(2, -12)} ≈ ${bound.toFixed(2)} of the last digit.` },
  ];
  makeStepper(document.querySelector(`[data-card="a"]`), "a", steps, {
    lo: -0.2, hi: 1.2, grid: 0.25, gridLabel: "blue ticks: register values, 1/4 apart", ticks: quarterTicks(nn),
    decision: { x: 0.5, label: "halfway: round to nearest decides here" }, label: "Card A number line.",
  });
}

function cardB() {
  const c = M.convertToy(41, -6);
  const r = M.convertToy(41, -6, "nearest", { sticky: "round" });
  const p = c.run.passes[0]; const pr = r.run.passes[0];
  const exact = c.ref.scaled;
  const n = exact.num / exact.den; const nn = Number(n);
  const exactText = ratDec(exact.num, exact.den);
  const steps = [
    { html: `x = 41 / 64 = ${ratDec(41n, 64n)} (significand ${code("101001")}). LOGX = −1 and SCALE = 3 − (−1) − 1 = ${p.scale}. z = 1000 = ${pow(2, 3)} · 125 fits in 12 bits: it is <b>exact</b>.` },
    { html: `Exact product: <b>${exactText}</b>. That is above the ½ line at ${nn}.5, so the answer must be <b class="${P}red">${c.ref.coefficient}</b>.`, rows: [{ x: rel(exact.num, exact.den, n), kind: "exact", label: `exact ${exactText}` }], decision: true },
    { html: `${nn} needs 10 bits, so the register has 2 fraction bits. It can hold ${code("1010000000.10")} = ${nn}.5 or ${code("1010000000.11")} = ${nn}.75, but not ${exactText}. The exact product is exactly halfway between the two.` },
    { html: `The obvious approach: round the product to nearest. That is a tie, and the even neighbour is ${code(M.extToBinary(pr.register))} = <b>${extDec(pr.register)}</b>.`, rows: [{ x: relExt(pr.register, n), kind: "register", label: `rounded product ${extDec(pr.register)}` }] },
    { html: `Step B5 now sees ${extDec(pr.register)}, which looks like an exact tie between ${nn} and ${nn + 1}. It goes to even: <b>${r.run.coefficient}</b> ${ok(false)}. Each rounding followed the rules, and the final answer is still wrong.`, rows: [{ x: Number(r.run.coefficient - n), kind: "wrong", label: `double rounding → ${r.run.coefficient}` }] },
    { html: `Coonen's way: <b>chop</b> the product to ${code(M.extToBinary(p.chopped))} = ${extDec(p.chopped)}, and let the inexact flag record that bits were lost.`, rows: [{ x: relExt(p.chopped, n), kind: "register", label: `chopped ${extDec(p.chopped)} + flag` }] },
    { html: `OR the flag into the last bit: ${code(M.extToBinary(p.register))} = <b>${extDec(p.register)}</b>. B5 rounds that to <b>${c.run.coefficient}</b> ${ok(true)}.`, rows: [{ x: relExt(p.register, n), kind: "sticky", label: `sticky ${extDec(p.register)}` }, { x: Number(c.run.coefficient - n), kind: "result", label: `result ${c.run.coefficient}` }] },
    { html: `Why this is safe: after the OR, the register no longer claims “exactly ${nn}.5”. It says “somewhere strictly between ${nn}.5 and ${nn + 1}”, and that is all B5 needs to know. The sticky bit sits one bit below the ½ bit, so it can break a false tie but never move the value across the ½ line.` },
  ];
  makeStepper(document.querySelector(`[data-card="b"]`), "b", steps, {
    lo: -0.2, hi: 1.2, grid: 0.25, gridLabel: "blue ticks: register values, 1/4 apart", ticks: quarterTicks(nn),
    decision: { x: 0.5, label: "halfway" }, label: "Card B number line.",
  });
}

function cardC() {
  const good = M.convertToy(58, -16, "up");
  const nz = M.convertToy(58, -16, "up", { directedZ: false });
  const nochop = M.convertToy(58, -16, "up", { sticky: "chop" });
  const p = good.run.passes[0]; const q = nz.run.passes[0]; const s = nochop.run.passes[0];
  const exact = good.ref.scaled;
  const n = exact.num / exact.den; const nn = Number(n);
  const exactText = ratDec(exact.num, exact.den);
  const steps = [
    { html: `x = 58 × ${pow(2, -16)} = ${ratDec(58n, 1n << 16n)}. Mode: <b>toward +∞</b>. SCALE = ${p.scale}, and the exact product is ${exactText}. That is above ${nn}, so the answer must be <b class="${P}red">${good.ref.coefficient}</b>.`, rows: [{ x: rel(exact.num, exact.den, n), kind: "exact", label: `exact ${exactText}` }], decision: true },
    { html: `Try the nearest z = ${extDec(q.power.z)} (too small). 58 · ${extDec(q.power.z)} / ${pow(2, 16)} = ${ratDec(q.exactProduct.num, q.exactProduct.den)}, which is <em>below</em> ${nn}.`, rows: [{ x: rel(q.exactProduct.num, q.exactProduct.den, n), kind: "product", label: `nearest z: ${ratDec(q.exactProduct.num, q.exactProduct.den)}` }] },
    { html: `Chop to ${extDec(q.chopped)}, set the sticky bit (already 1), round up: <b>${nz.run.coefficient}</b>. That prints 8.85e−4, which is less than x. ${ok(false)} The direction promise is broken.`, rows: [{ x: Number(nz.run.coefficient - n), kind: "wrong", label: `nearest z → ${nz.run.coefficient}` }] },
    { html: `Step S0: the result must grow and we multiply, so round z <b>up</b>: 3907 · ${pow(2, 8)} = <b>${extDec(p.power.z)}</b> ≥ ${pow(10, 6)}.` },
    { html: `58 · ${extDec(p.power.z)} / ${pow(2, 16)} = ${ratDec(p.exactProduct.num, p.exactProduct.den)}. Chopping to quarters gives ${code(M.extToBinary(p.chopped))} = <b>${extDec(p.chopped)}</b>, and bits were lost.`, rows: [{ x: rel(p.exactProduct.num, p.exactProduct.den, n), kind: "product", label: `z up: ${ratDec(p.exactProduct.num, p.exactProduct.den)}` }, { x: relExt(p.chopped, n), kind: "register", label: `chopped ${extDec(p.chopped)}` }] },
    { html: `Without the sticky bit, the register holds the integer ${extDec(s.register)}, and rounding up leaves <b>${nochop.run.coefficient}</b>. ${ok(false)} Wrong again: the chop made the value look exact.`, rows: [{ x: Number(nochop.run.coefficient - n), kind: "wrong", label: `no sticky → ${nochop.run.coefficient}` }] },
    { html: `With the sticky bit: ${code(M.extToBinary(p.register))} = ${extDec(p.register)}, which rounds up to <b>${good.run.coefficient}</b> ${ok(true)}. This card needs both safeguards.`, rows: [{ x: relExt(p.register, n), kind: "sticky", label: `sticky ${extDec(p.register)}` }, { x: Number(good.run.coefficient - n), kind: "result", label: `result ${good.run.coefficient}` }] },
  ];
  makeStepper(document.querySelector(`[data-card="c"]`), "c", steps, {
    lo: -0.45, hi: 1.25, grid: 0.25, gridLabel: "blue ticks: register values, 1/4 apart",
    ticks: [{ x: -0.25, label: `${nn - 1}.75` }, { x: 0, label: String(nn) }, { x: 0.5, label: `${nn}.5` }, { x: 1, label: String(nn + 1) }],
    decision: { x: 0, label: `toward +∞: anything above ${nn} → ${nn + 1}` }, label: "Card C number line.",
  });
}

// ---------------------------------------------------------------------------
// Pocket formats figure.

function pocketFigure() {
  const reg = $(`${P}register`);
  const c = M.convertToy(60, -16);
  const v = c.run.passes[0].chopped; // 915.25 = 1110010011.01
  const bits = v.m.toString(2);
  const frac = -v.e;
  const cells = [...bits].map((b, i) => {
    const isFrac = i >= bits.length - frac;
    const label = isFrac ? (i === bits.length - frac ? "1/2" : "1/4") : "";
    return `<span class="${P}cell${isFrac ? ` ${P}cell-frac` : ""}"><b>${b}</b><i>${label}</i></span>`;
  });
  cells.splice(bits.length - frac, 0, `<span class="${P}point" aria-hidden="true">.</span>`);
  reg.innerHTML = `<div class="${P}cells">${cells.join("")}</div><p class="${P}register-caption">${code(M.extToBinary(v))} = ${extDec(v)}: ${bits.length - frac} integer bits, ${frac} spare bits after the point</p>`;

  const rows = [];
  for (let k = 0; k <= 8; k++) {
    const five = 5n ** BigInt(k);
    const bitsK = M.bitLength(five);
    const near = M.powerOfTen(k, 12, "nearest", "direct");
    const up = M.powerOfTen(k, 12, "away", "direct");
    const down = M.powerOfTen(k, 12, "chop", "direct");
    const cell = (x) => (x.exact ? `<td class="${P}exact">${extDec(x.z)}</td>` : `<td>${extDec(x.z)}</td>`);
    rows.push(`<tr><th scope="row">${pow(10, k)}</th><td>${five} <small>(${bitsK} bits)</small></td>${near.exact ? `<td class="${P}exact" colspan="3">exact: ${extDec(near.z)}</td>` : cell(near) + cell(up) + cell(down)}</tr>`);
  }
  $(`${P}powers`).innerHTML = `<table class="${P}powers-table"><caption class="lab-sr-only">Toy powers of ten in a 12-bit register</caption><thead><tr><th scope="col">power</th><th scope="col">5<sup>k</sup></th><th scope="col">nearest</th><th scope="col">rounded up</th><th scope="col">rounded down</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Generic trace (toy playground, real doubles, fuzzer detail).

function traceLines(check, { toy = false, onlyLast = false } = {}) {
  const { run, ref } = check;
  const lines = [];
  const { m, e, neg } = run.input;
  const sign = neg ? "−" : "";
  if (toy) {
    const [num, den] = ratOfInput(run.input);
    lines.push(`x = ${m} × ${pow(2, e)} = ${ratDec(num, den, 30)} (significand ${code(m.toString(2))}). Its decade: LOGX = ${minus(run.trueDecade)}. The toy uses the exact decade; real doubles use Algorithm L.`);
  } else if (!onlyLast && run.logInfo) {
    const L = run.logInfo;
    lines.push(`Algorithm L: x = 1.f × ${pow(2, L.E)}, so “e.f” ≈ ${minus(L.l2xNumber.toFixed(4))}. Multiply by log<sub>10</sub>2 chopped to 32 bits${L.bumped ? " (bumped up one unit, because e.f &lt; 0)" : ""}: ${minus(L.productNumber.toFixed(4))}. LOGX = ${minus(L.logx)}${L.logx === run.trueDecade ? " (correct)" : ` (the true decade is ${minus(run.trueDecade)}: one too low, which is allowed)`}.`);
  }
  const passes = onlyLast ? run.passes.slice(-1) : run.passes;
  for (const p of passes) {
    const k = Math.abs(p.scale);
    const prefix = run.passes.length > 1 ? `Pass ${p.pass}: ` : "";
    lines.push(`${prefix}SCALE = ${run.N} − (${minus(p.logx)}) − 1 = <b>${minus(p.scale)}</b>.${p.scale < 0 ? ` Negative, so divide by z = ${pow(10, k)}.` : ""}`);
    const five = 5n ** BigInt(k);
    if (p.power.exact) {
      lines.push(`z = ${pow(10, k)} is exact: ${pow(5, k)} has ${M.bitLength(five)} bits, which fits in ${run.p}.`);
    } else {
      const how = toy ? `z = <b>${extDec(p.power.z)}</b>` : `z is built from ${p.power.steps.map((s) => pow(10, s.power)).join(" · ")}`;
      const guardNote = run.guards.directedZ ? "" : " (directed z switched off)";
      lines.push(`${pow(10, k)} does not fit (${pow(5, k)} has ${M.bitLength(five)} bits). Rounded ${DIR_WORD[p.zdir]}${guardNote}: ${how}, δ = ${fmtDelta(p.power.delta)}.`);
    }
    const prod = ratDec(p.exactProduct.num, p.exactProduct.den, toy ? 30 : 14);
    const regWhat = p.productDir === "chop" ? "chopped" : `rounded ${DIR_WORD[p.productDir]}`;
    const regShow = toy ? `${code(M.extToBinary(p.chopped))} = ${extDec(p.chopped)}` : `${extDec(p.chopped, 24)} (${M.fractionBits(p.chopped)} bits after the point)`;
    lines.push(`Exact x ${p.scale < 0 ? "/" : "·"} z = ${prod}. The ${run.p}-bit register, ${regWhat}: ${regShow}${p.inexact ? "" : ", exact"}.`);
    if (run.guards.sticky === "on") {
      if (!p.inexact) lines.push("Nothing was chopped off, so no sticky bit is needed.");
      else if (p.stickySet) lines.push(`Sticky: OR 1 into the last bit → ${toy ? `${code(M.extToBinary(p.register))} = ` : ""}<b>${extDec(p.register, 24)}</b>.`);
      else lines.push("Sticky: the last bit is already 1, so the value stays the same.");
    } else if (run.guards.sticky === "chop" && p.inexact) {
      lines.push(`<span class="${P}warn">Sticky bit switched off:</span> the lost bits are forgotten.`);
    } else if (run.guards.sticky === "round" && p.inexact) {
      lines.push(`<span class="${P}warn">Sticky bit switched off:</span> the product was rounded instead of chopped, so there are two roundings.`);
    }
    const digits = p.rounded.toString().length;
    let tail = "";
    if (p.check === "retry") tail = ` That has ${digits} digits (≥ ${pow(10, run.N)}), so B6 raises LOGX to ${minus(p.logx + 1)} and starts again from the original x.`;
    else if (p.check === "forced") tail = ` Below ${pow(10, run.N - 1)}, so B6 forces it up to ${pow(10, run.N - 1)}.`;
    else if (!run.guards.b6 && digits !== run.N) tail = ` <span class="${P}warn">B6 switched off:</span> ${digits} digits in an ${run.N}-digit field.`;
    lines.push(`B5, rounding ${M.MODE_LABEL[run.mode]}: → <b>${p.rounded}</b>.${tail}`);
  }
  const out = `${sign}${M.scientific(run.coefficient, run.logx, run.N)}`;
  const refOut = `${sign}${M.scientific(ref.coefficient, ref.logx, run.N)}`;
  let verdict = `Output <b class="${P}red">${out}</b>. Correctly rounded: ${refOut} ${ok(check.correct)}`;
  if (!check.correct) verdict += check.run.zExact ? " Coonen promises this case." : check.broken.length ? "" : " (allowed: z was rounded)";
  if (!check.directionOK) verdict += ` <span class="${P}warn">Wrong side of x for ${M.MODE_LABEL[run.mode]}.</span>`;
  if (check.roundTrip !== null) verdict += ` Reads back to the same double: ${ok(check.roundTrip)}`;
  verdict += ` Error: ${check.error.toFixed(4)} of the last digit.`;
  lines.push(verdict);
  return lines;
}

function traceLineSpec(check, toy) {
  const { run, ref } = check;
  const p = run.passes[run.passes.length - 1];
  // true x · 10^SCALE (what an exact power of ten would give)
  const [xn, xd] = ratOfInput({ ...run.input, neg: false });
  const k = BigInt(Math.abs(p.scale));
  const ex = p.scale >= 0 ? { num: xn * 10n ** k, den: xd } : { num: xn, den: xd * 10n ** k };
  const n = ex.num / ex.den;
  const rows = [];
  rows.push({ x: rel(ex.num, ex.den, n), kind: "exact", label: toy ? `exact ${ratDec(ex.num, ex.den, 12)}` : `exact x · 10^${p.scale}` });
  if (!p.power.exact) {
    const pr = p.exactProduct;
    rows.push({ x: rel(pr.num, pr.den, n), kind: "product", label: toy ? `x · z = ${ratDec(pr.num, pr.den, 12)}` : "x · z (rounded z)" });
  }
  rows.push({ x: relExt(p.chopped, n), kind: "register", label: p.productDir === "chop" ? "chopped register" : "rounded register" });
  if (p.register.m !== p.chopped.m) rows.push({ x: relExt(p.register, n), kind: "sticky", label: "after sticky" });
  const res = Number(p.q - n);
  rows.push({ x: res, kind: check.correct ? "result" : "wrong", label: `result ${toy ? p.q : `…${String(p.q).slice(-3)}`}` });
  const shortN = toy ? String(n) : `…${String(n).slice(-3)}`;
  const shortN1 = toy ? String(n + 1n) : `…${String(n + 1n).slice(-3)}`;
  const dir = run.dir;
  return {
    lo: Math.min(-0.2, res - 0.2), hi: Math.max(1.2, res + 0.2),
    grid: toy ? 2 ** p.chopped.e : null, gridLabel: toy ? `blue ticks: register values (${2 ** p.chopped.e} apart)` : `register: ${M.fractionBits(p.chopped)} bits after the point`,
    ticks: [{ x: 0, label: shortN }, { x: 1, label: shortN1 }],
    decision: dir === "nearest" ? { x: 0.5, label: "halfway" } : null,
    rows, label: `Number line near ${n}.`,
  };
}

// ---------------------------------------------------------------------------
// Toy playground.

function toyPlayground() {
  const mIn = $("toy-m"); const eIn = $("toy-e"); const modeIn = $("toy-mode");
  const stickyIn = $("toy-sticky"); const dzIn = $("toy-dz");
  mIn.value = clamp(Number(params.get("tm")) || 60, 32, 63);
  eIn.value = clamp(Number.isFinite(Number(params.get("te"))) && params.has("te") ? Number(params.get("te")) : -16, -30, 20);
  if (M.MODES.includes(params.get("tmode"))) modeIn.value = params.get("tmode");
  if (["on", "chop", "round"].includes(params.get("tsticky"))) stickyIn.value = params.get("tsticky");
  if (params.get("tdz") === "0") dzIn.checked = false;
  const box = $("toy-line");
  let surveyKey = "";
  const render = () => {
    const m = clamp(Math.round(Number(mIn.value)) || 60, 32, 63);
    const e = clamp(Math.round(Number(eIn.value)) || 0, -30, 20);
    const mode = modeIn.value;
    const guards = { sticky: stickyIn.value, directedZ: dzIn.checked };
    const check = M.convertToy(m, e, mode, guards);
    $("toy-lines").innerHTML = traceLines(check, { toy: true }).map((l) => `<li>${l}</li>`).join("");
    drawLine(box, traceLineSpec(check, true));
    setParam("tm", m, 60); setParam("te", e, -16); setParam("tmode", mode, "nearest");
    setParam("tsticky", guards.sticky, "on"); setParam("tdz", guards.directedZ ? 1 : 0, 1);
    const key = `${mode}|${guards.sticky}|${guards.directedZ}`;
    if (key !== surveyKey) { surveyKey = key; survey(mode, guards); }
    for (const chip of $("toy-misses").children) chip.setAttribute("aria-pressed", String(chip.dataset.m === String(m) && chip.dataset.e === String(e)));
  };
  const survey = (mode, guards) => {
    const misses = [];
    let total = 0; let wrong = 0; let wrongBand = 0; let wrongSide = 0;
    for (let e = -30; e <= 20; e++) {
      for (let m = 32; m < 64; m++) {
        const c = M.convertToy(m, e, mode, guards);
        total++;
        if (!c.directionOK) wrongSide++;
        if (!c.correct) { wrong++; if (c.run.zExact) wrongBand++; misses.push({ m, e, c }); }
      }
    }
    $("toy-survey").innerHTML = `All ${total} toy inputs, ${M.MODE_LABEL[mode]}: <b>${wrong}</b> not correctly rounded. Of those, <b>${wrongBand}</b> had an exact z (Coonen promises those)${mode === "nearest" ? "" : ` and <b>${wrongSide}</b> landed on the wrong side of x`}.`;
    $("toy-misses").replaceChildren(...misses.slice(0, 12).map(({ m, e, c }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.m = m; b.dataset.e = e;
      b.textContent = `${m}·2^${e} → ${c.run.coefficient} (not ${c.ref.coefficient})`;
      b.addEventListener("click", () => { mIn.value = m; eIn.value = e; render(); });
      return b;
    }));
    if (misses.length > 12) {
      const more = document.createElement("span");
      more.className = `${P}more`;
      more.textContent = `+ ${misses.length - 12} more`;
      $("toy-misses").append(more);
    }
    if (mode === "nearest" && guards.sticky === "on" && guards.directedZ) $("map-toy-rate").innerHTML = `${wrong} of ${total} toy inputs (computed on this page), all with a rounded z`;
  };
  for (const input of [mIn, eIn, modeIn, stickyIn, dzIn]) input.addEventListener("input", render);
  render();
  // The mapping table always shows the as-designed survey.
  const base = M.toySurvey(-30, 20);
  $("map-toy-rate").innerHTML = `${base.wrong} of ${base.total} toy inputs (computed on this page), all with a rounded z`;
  observeLine(box);
}

// ---------------------------------------------------------------------------
// Real doubles.

const PRESETS = [
  { label: "0.1", x: "0.1" },
  { label: "1.0439", x: "1.0439" },
  { label: "0.5308290954995201", x: "0.5308290954995201" },
  { label: "1.0408207851369739e-12", x: "1.0408207851369739e-12" },
  { label: "1e23, N = 6", x: "1e23", n: 6 },
  { label: "5e-324", x: "5e-324" },
  { label: "1.7976931348623157e308", x: "1.7976931348623157e308" },
];

function realSection() {
  const xIn = $("real-x"); const nIn = $("real-n"); const modeIn = $("real-mode");
  for (let n = 1; n <= 17; n++) nIn.append(new Option(String(n), String(n)));
  xIn.value = params.get("x") || "0.1";
  nIn.value = String(clamp(Number(params.get("n")) || 17, 1, 17));
  if (M.MODES.includes(params.get("mode"))) modeIn.value = params.get("mode");
  const chips = $("real-presets");
  for (const preset of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = preset.label;
    b.addEventListener("click", () => { xIn.value = preset.x; nIn.value = String(preset.n || 17); render(); });
    b._preset = preset;
    chips.append(b);
  }
  const box = $("real-line");
  const render = () => {
    const value = Number(xIn.value.trim());
    const N = Number(nIn.value); const mode = modeIn.value;
    for (const b of chips.children) b.setAttribute("aria-pressed", String(b._preset.x === xIn.value.trim() && (b._preset.n || 17) === N));
    if (!Number.isFinite(value) || value === 0 || xIn.value.trim() === "") {
      $("real-lines").innerHTML = `<li>Enter a finite, nonzero number (for example 0.1 or 6.02e23).</li>`;
      box.replaceChildren(); box._spec = null;
      return;
    }
    const check = M.convertDouble(value, N, mode);
    const lines = [`x = ${xIn.value.trim()} is stored as the double ${M.rationalToDecimal(...ratOfInput(check.run.input), 60)}.`, ...traceLines(check)];
    $("real-lines").innerHTML = lines.map((l) => `<li>${l}</li>`).join("");
    drawLine(box, traceLineSpec(check, false));
    setParam("x", xIn.value.trim(), "0.1"); setParam("n", N, 17); setParam("mode", mode, "nearest");
  };
  xIn.addEventListener("change", render);
  xIn.addEventListener("keydown", (ev) => { if (ev.key === "Enter") render(); });
  nIn.addEventListener("input", render); modeIn.addEventListener("input", render);
  render();
  observeLine(box);
  return { show(value, mode) { xIn.value = String(value); nIn.value = "17"; modeIn.value = mode; render(); $("real").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } };
}

function ratOfInput({ m, e, neg }) {
  const num = neg ? -m : m;
  return e >= 0 ? [num << BigInt(e), 1n] : [num, 1n << BigInt(-e)];
}

// ---------------------------------------------------------------------------
// Fuzzer.

const VARIANTS = {
  none: { label: "nothing (as designed)", guards: {}, mode: "nearest", region: "anywhere", note: "Every promise should hold. Expect about one result in a thousand that is not correctly rounded, all with a rounded z, and zero broken promises." },
  chop: { label: "sticky bit → plain chop", guards: { sticky: "chop" }, mode: "nearest", region: "exact", note: "Sampling where z is exact, so every result should be correctly rounded. Without the sticky bit, a chopped value of exactly …½ looks like a tie (card B)." },
  round: { label: "sticky bit → round the product", guards: { sticky: "round" }, mode: "nearest", region: "exact", note: "The product is rounded to 64 bits, then rounded again to an integer. Double rounding goes wrong when the first rounding lands exactly on …½ (card B)." },
  dz: { label: "directed z → nearest z", guards: { directedZ: false }, mode: "up", region: "rounded", note: "Rounding toward +∞ where z must be rounded. A z rounded to nearest may be too small, and the result then lands below x (card C). This is rarer: give it a few seconds." },
  b6: { label: "B6 length check → none", guards: { b6: false }, mode: "nearest", region: "anywhere", note: "Algorithm L is one too low about 2% of the time, and a scaled value can also round up to 10¹⁷. Without B6 the output then has 18 digits." },
};

const BROKEN_TEXT = {
  "exact-band": "not correctly rounded although z was exact",
  direction: "wrong side of x",
  digits: "wrong number of digits",
  bound: "error above the bound",
  "round-trip": "does not read back",
};

function fuzzer(real) {
  const regions = M.regions(17);
  const chips = $("fuzz-off"); const modeIn = $("fuzz-mode"); const regionIn = $("fuzz-region");
  const runBtn = $("fuzz-run"); const stopBtn = $("fuzz-stop");
  for (const [key, r] of Object.entries(regions)) regionIn.append(new Option(r.label.replace(/\^(-?\d+)/g, (_, d) => toSup(d)), key));
  let off = VARIANTS[params.get("off")] ? params.get("off") : "none";
  const seed0 = Number(params.get("seed")) || 1;
  let running = false; let state = null;
  for (const [key, v] of Object.entries(VARIANTS)) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.key = key; b.textContent = v.label;
    b.addEventListener("click", () => { select(key, true); });
    chips.append(b);
  }
  const select = (key, applyDefaults) => {
    off = key;
    for (const b of chips.children) b.setAttribute("aria-pressed", String(b.dataset.key === key));
    if (applyDefaults) { modeIn.value = VARIANTS[key].mode; regionIn.value = VARIANTS[key].region; }
    $("fuzz-note").textContent = VARIANTS[key].note;
    stop();
    state = null;
    renderCounters();
    $("fuzz-examples").replaceChildren();
    $("fuzz-detail").replaceChildren();
    setParam("off", key, "none"); setParam("fmode", modeIn.value, VARIANTS[key].mode); setParam("region", regionIn.value, VARIANTS[key].region);
  };
  const renderCounters = () => {
    const s = state || { tried: 0, broken: 0, notCR: 0, rtFail: 0, rtChecked: 0 };
    const cell = (label, value, cls = "") => `<div class="${P}count ${cls}"><b>${value.toLocaleString("en-US")}</b><span>${label}</span></div>`;
    $("fuzz-counters").innerHTML = cell("doubles tried", s.tried)
      + cell("promises broken", s.broken, s.broken ? `${P}count-bad` : "")
      + cell("not correctly rounded, allowed (z rounded)", s.notCR)
      + (modeIn.value === "nearest" ? cell("round-trip failures", s.rtFail, s.rtFail ? `${P}count-bad` : "") : "");
  };
  const MAX = 150000; const MAX_EXAMPLES = 10;
  const tick = () => {
    if (!running) return;
    const t0 = performance.now();
    const guards = VARIANTS[off].guards; const mode = modeIn.value; const region = regions[regionIn.value];
    while (performance.now() - t0 < 14 && state.tried < MAX && state.examples.length < MAX_EXAMPLES) {
      const s = M.sampleRegion(state.rng, region);
      const c = M.checkConversion(s, { p: 64, N: 17, mode, pow10: "Q", log: "L", safeguards: guards, roundTripValue: s.value });
      state.tried++;
      if (c.roundTrip === false) state.rtFail++;
      if (c.broken.length) { state.broken++; state.examples.push({ s, c }); addExample(state.examples.length - 1); }
      else if (!c.correct) state.notCR++;
    }
    renderCounters();
    if (state.tried >= MAX || state.examples.length >= MAX_EXAMPLES) { stop(); return; }
    setTimeout(tick, 0);
  };
  const start = () => {
    if (running) return;
    if (!state) state = { tried: 0, broken: 0, notCR: 0, rtFail: 0, examples: [], rng: M.makeRng(seed0) };
    running = true; runBtn.disabled = true; stopBtn.disabled = false;
    runBtn.textContent = "Running…";
    tick();
  };
  function stop() {
    running = false; runBtn.disabled = false; stopBtn.disabled = true;
    runBtn.textContent = state && state.tried ? "Continue" : "Run fuzzer";
    if (state && state.tried >= MAX) runBtn.disabled = true;
  }
  const addExample = (i) => {
    const { s, c } = state.examples[i];
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<span class="${P}ex-x">${s.value}</span> → ${M.scientific(c.run.coefficient, c.run.logx, 17)} <span class="${P}warn">${c.broken.map((k) => BROKEN_TEXT[k]).join(", ")}</span>`;
    b.addEventListener("click", () => showDetail(i));
    li.append(b);
    $("fuzz-examples").append(li);
    if (i === 0) showDetail(0);
  };
  const showDetail = (i) => {
    const { s, c } = state.examples[i];
    for (const [j, li] of [...$("fuzz-examples").children].entries()) li.firstChild.setAttribute("aria-pressed", String(j === i));
    const mode = modeIn.value;
    const designed = M.checkConversion(s, { p: 64, N: 17, mode, pow10: "Q", log: "L", roundTripValue: s.value });
    const col = (title, check) => `<div><h4>${title}</h4><ol class="${P}lines ${P}lines-all">${traceLines(check, { onlyLast: true }).map((l) => `<li>${l}</li>`).join("")}</ol></div>`;
    $("fuzz-detail").innerHTML = `<p class="${P}detail-x">x = ${s.value} = ${s.m} × ${pow(2, s.e)}, ${M.MODE_LABEL[mode]}, N = 17 <button type="button" class="lab-button" id="fuzz-trace">Trace in section 8</button></p><div class="${P}compare">${col(`Safeguard off: ${VARIANTS[off].label}`, c)}${col("As designed", designed)}</div>`;
    $("fuzz-trace").addEventListener("click", () => real.show(s.value, mode));
  };
  runBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
  modeIn.addEventListener("input", () => { stop(); state = null; $("fuzz-examples").replaceChildren(); $("fuzz-detail").replaceChildren(); renderCounters(); setParam("fmode", modeIn.value, VARIANTS[off].mode); });
  regionIn.addEventListener("input", () => { stop(); state = null; $("fuzz-examples").replaceChildren(); $("fuzz-detail").replaceChildren(); renderCounters(); setParam("region", regionIn.value, VARIANTS[off].region); });
  select(off, true);
  if (M.MODES.includes(params.get("fmode"))) { modeIn.value = params.get("fmode"); setParam("fmode", modeIn.value, VARIANTS[off].mode); }
  if (regions[params.get("region")]) { regionIn.value = params.get("region"); setParam("region", regionIn.value, VARIANTS[off].region); }
  renderCounters();
  if (params.get("run") === "1") start();
}

function toSup(d) {
  const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return [...String(d)].map((ch) => map[ch]).join("");
}

// ---------------------------------------------------------------------------

pocketFigure();
cardA();
cardB();
cardC();
toyPlayground();
const real = realSection();
fuzzer(real);
