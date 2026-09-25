// Copyright (C) 2026 Toit contributors.
//
// DOM code for the "Pocket Ryū" page: the step card (half or double), the
// bfloat16 exhaustive lab and the binary64 needle lab.

import * as M from "./ryu-pocket-model.js";

const H = M.FORMATS.half, D = M.FORMATS.double, BF = M.FORMATS.bfloat16;
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- formatting

const THIN = " ";
function g(n) {
  const s = String(n);
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [int, frac] = body.split(".");
  const grouped = int.length > 5 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN) : int;
  return (neg ? "−" : "") + grouped + (frac !== undefined ? `.${frac}` : "");
}
const minus = (e) => String(e).replace("-", "−");
const pw = (b, e) => `${b}<sup>${minus(e)}</sup>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// num/den to two decimals, truncated, with "…" when inexact
function approx(num, den) {
  const q = num / den, r = num % den;
  if (r === 0n) return { text: g(q), exact: true, floor: q };
  const two = ((r * 100n) / den).toString().padStart(2, "0");
  return { text: `${g(q)}.${two}…`, exact: false, floor: q };
}
function longExact(m, e, max = 60) {
  const s = M.exactDecimalString(m, e);
  const digits = s.replace(".", "").replace(/^0+/, "").length;
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… <span class="rp-muted">(${digits} significant digits in all)</span>`;
}
const bitsOfLen = (b, n) => b.toString(2).padStart(n, "0");
const line = (html, cls = "") => `<div class="rp-line${cls ? ` ${cls}` : ""}">${html}</div>`;
const note = (html) => line(html, "rp-note");
const badge = (ok, yes, no) => `<span class="rp-flag ${ok ? "on" : ""}">${ok ? yes : no}</span>`;

// ---------------------------------------------------------------- step card

const PRESETS = {
  half: [["0.1", "0.1"], ["3.14", "3.14"], ["0.15625 · tie", "0.15625"], ["2⁻⁶ · lopsided", "0.015625"], ["4112 · bound", "4112"], ["256.25 · c − 1", "256.25"], ["65504 · max", "65504"], ["6e-8 · min", "6e-8"]],
  double: [["0.3", "0.3"], ["0.1 + 0.2", "0.30000000000000004"], ["1e23", "1e23"], ["7e22", "7e22"], ["2⁻²⁵ · tie", "2.9802322387695312e-8"], ["5e-324 · min", "5e-324"], ["max", "1.7976931348623157e308"], ["123.456", "123.456"]],
};
const FMT = { half: H, double: D };
const cards = new Map();

function createCard(root) {
  const st = { fmt: root.dataset.fmt, param: root.dataset.param, bits: 0n, text: root.dataset.value };
  const fromUrl = params.get(st.param);
  const fmtUrl = params.get(`${st.param}fmt`);
  if (fmtUrl === "half" || fmtUrl === "double") st.fmt = fmtUrl;
  if (fromUrl) st.text = fromUrl;
  const id = root.id;
  root.innerHTML = `
    <div class="lab-controls rp-card-controls">
      <div class="ryu-pocket-seg" role="group" aria-label="Format">
        <button type="button" data-fmt="half">binary16 (half)</button><button type="button" data-fmt="double">binary64 (double)</button>
      </div>
      <label for="${id}-in">Value</label>
      <input type="text" id="${id}-in" spellcheck="false" autocomplete="off" inputmode="decimal" size="22">
      <button type="button" class="lab-button" data-step="-1" aria-label="Previous value (one step down)">− step</button>
      <button type="button" class="lab-button" data-step="1" aria-label="Next value (one step up)">+ step</button>
    </div>
    <div class="lab-chips rp-card-presets" role="group" aria-label="Examples"></div>
    <p class="rp-card-error" role="alert"></p>
    <div class="rp-card-summary" aria-live="polite"></div>
    <ol class="lab-steps rp-steps"></ol>`;
  const input = root.querySelector("input");
  const errBox = root.querySelector(".rp-card-error");
  const setFromText = (text) => {
    const b = M.parseToBits(FMT[st.fmt], text);
    if (b === null) { errBox.textContent = `“${text}” is not a number or 0x… bit pattern.`; return false; }
    errBox.textContent = "";
    st.bits = b; st.text = text;
    return true;
  };
  const render = () => {
    const fmt = FMT[st.fmt];
    root.querySelectorAll(".ryu-pocket-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fmt === st.fmt)));
    const chips = root.querySelector(".rp-card-presets");
    chips.innerHTML = PRESETS[st.fmt].map(([label, v]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${M.parseToBits(fmt, v) === st.bits}">${esc(label)}</button>`).join("");
    input.value = st.text;
    renderCard(root, fmt, st.bits, st.text);
    syncUrl(st.param, st.text, st.fmt, root.dataset.fmt);
  };
  root.addEventListener("click", (ev) => {
    const t = ev.target.closest("button");
    if (!t || !root.contains(t)) return;
    if (t.dataset.fmt) { st.fmt = t.dataset.fmt; if (!setFromText(st.text)) setFromText(root.dataset.value); render(); }
    else if (t.dataset.v) { setFromText(t.dataset.v); render(); }
    else if (t.dataset.step) {
      const fmt = FMT[st.fmt];
      const signBit = 1n << BigInt(fmt.P + fmt.EB);
      const sign = st.bits & signBit;
      let mag = st.bits & (signBit - 1n);
      mag += BigInt(t.dataset.step) * (sign ? -1n : 1n);
      if (mag < 0n) mag = 0n;
      if (mag > M.maxFiniteBits(fmt)) mag = M.maxFiniteBits(fmt);
      st.bits = sign | mag;
      st.text = shortText(fmt, st.bits);
      errBox.textContent = "";
      render();
    }
  });
  input.addEventListener("change", () => { if (setFromText(input.value)) render(); });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); if (setFromText(input.value)) render(); } });
  if (!setFromText(st.text)) setFromText(root.dataset.value);
  render();
  cards.set(id, { load: (v, fmt = "half") => { st.fmt = fmt; setFromText(v); render(); } });
}

function shortText(fmt, bits) {
  const r = M.ryu(fmt, bits);
  if (r.special) return r.special === "zero" ? "0" : r.special === "infinity" ? "inf" : `0x${bits.toString(16)}`;
  return r.text.replace("−", "-");
}

function syncUrl(param, text, fmt, defaultFmt) {
  const u = new URL(location.href);
  u.searchParams.set(param, text);
  if (fmt !== defaultFmt) u.searchParams.set(`${param}fmt`, fmt); else u.searchParams.delete(`${param}fmt`);
  history.replaceState(null, "", u);
}

function renderCard(root, fmt, bits, text) {
  const sum = root.querySelector(".rp-card-summary");
  const list = root.querySelector(".rp-steps");
  const r = M.ryu(fmt, bits);
  const isHalf = fmt === H;
  const hexLen = isHalf ? 4 : 16;
  const hex = `0x${bits.toString(16).toUpperCase().padStart(hexLen, "0")}`;
  if (r.special) {
    const shown = r.special === "zero" ? (r.decoded.sign ? "−0" : "0") : r.special === "infinity" ? (r.decoded.sign ? "−∞" : "∞") : "NaN";
    sum.innerHTML = `<span class="rp-bin">${hex}</span> is <strong>${shown}</strong>. Ryū prints zeros, infinities and NaN before any of the steps below, so there is nothing to show.`;
    list.innerHTML = "";
    return;
  }
  const d = r.decoded;
  const value = `${d.sign ? "−" : ""}${longExact(d.m2, d.e2 + 2)}`;
  sum.innerHTML = `“${esc(text)}” → ${isHalf ? "half" : "double"} <span class="rp-bin">${hex}</span> = <span class="rp-bin">${value}</span> → Ryū prints <strong class="rp-out">${esc(r.text)}</strong>`;
  const steps = [stepDecode(r, fmt), stepInterval(r), stepUnit(r, fmt), stepMultiply(r, fmt), stepFlags(r), stepChop(r, fmt), stepRound(r), stepResult(r, fmt)];
  list.innerHTML = steps.map((s) => `<li><h4>${s.title}</h4><p class="rp-why">${s.why}</p><div class="rp-calc">${s.lines.join("")}</div></li>`).join("");
}

function stepDecode(r, fmt) {
  const d = r.decoded;
  const eb = bitsOfLen(BigInt(d.E), fmt.EB), fb = bitsOfLen(d.F, fmt.P);
  const lines = [];
  lines.push(line(`bits = <span class="rp-bits"><span class="rp-sgn" title="sign">${d.sign}</span> <span class="rp-exp" title="exponent field">${eb}</span> <span class="rp-frac" title="fraction field">${fb}</span></span>`));
  lines.push(line(`exponent field = ${fmt === H ? `${eb}<sub>2</sub> = ` : ""}${d.E}${d.E === 0 ? " → subnormal (no hidden 1; treated like field 1)" : ""}`));
  lines.push(line(`fraction field = ${fmt === H ? `${fb}<sub>2</sub> = ` : ""}${g(d.F)}`));
  if (d.E === 0) lines.push(line(`m2 = fraction = <b>${g(r.m2)}</b>`));
  else lines.push(line(`m2 = ${pw(2, fmt.P)} + fraction = ${g(1n << BigInt(fmt.P))} + ${g(d.F)} = <b>${g(r.m2)}</b>`));
  lines.push(line(`e2 = ${d.E === 0 ? 1 : d.E} − ${fmt.BIAS} − ${fmt.P} − 2 = <b>${minus(r.e2)}</b>`));
  lines.push(line(`value = m2 × ${pw(2, r.e2 + 2)} = ${g(r.m2)} × ${pw(2, r.e2 + 2)} = <span class="rp-bin">${longExact(r.m2, r.e2 + 2)}</span>`));
  if (d.sign) lines.push(note("Sign bit 1: Ryū remembers the “−” and works on the magnitude."));
  return {
    title: "Decode the bits",
    why: `A ${fmt === H ? "half" : "double"} is an integer times a power of two. m2 is the significand with its hidden bit, and e2 is the exponent, already lowered by 2 to make room for the two guard bits of step 2.`,
    lines,
  };
}

function stepInterval(r) {
  const lines = [];
  lines.push(line(`mv = 4 × m2 = 4 × ${g(r.m2)} = <b>${g(r.mv)}</b> <span class="rp-muted">(the value)</span>`));
  lines.push(line(`mp = mv + 2 = <b>${g(r.mp)}</b> <span class="rp-muted">(midpoint to the next value up)</span>`));
  if (r.mmShift === 1n) lines.push(line(`mm = mv − 2 = <b>${g(r.mm)}</b> <span class="rp-muted">(midpoint to the next value down)</span>`));
  else lines.push(line(`mm = mv − 1 = <b>${g(r.mm)}</b> <span class="rp-muted">(power of two: the lower neighbour is twice as close, so is its midpoint)</span>`));
  lines.push(line(`interval = [${g(r.mm)}, ${g(r.mp)}] × ${pw(2, r.e2)}`));
  lines.push(line(`m2 = ${g(r.m2)} is ${r.acceptBounds ? "even → the endpoints are <b>allowed</b> (a tie at the midpoint reads back as this value)" : "odd → the endpoints are <b>excluded</b> (a tie at the midpoint reads back as the even neighbour)"}`));
  return {
    title: "Three integers on one grid",
    why: `The rounding interval ends halfway to the neighbours. Multiplying everything by 4 makes both midpoints integers, all counted in units of ${pw(2, r.e2)}.`,
    lines,
  };
}

function stepUnit(r, fmt) {
  const lines = [];
  const sc = r.scale;
  if (r.e2 < 0) {
    const n = -r.e2;
    const raw = M.log10Pow5(n);
    lines.push(line(`q = max(0, ⌊${n} × log<sub>10</sub>5⌋ − 1) = max(0, ⌊${(n * Math.log10(5)).toFixed(3)}…⌋ − 1) = <b>${r.q}</b>`));
    lines.push(note(`The code computes ⌊${n} × log<sub>10</sub>5⌋ as ⌊${n} × 732923 / ${pw(2, 20)}⌋ = ${raw}.`));
    lines.push(line(`e10 = q + e2 = ${r.q} + (${minus(r.e2)}) = <b>${minus(r.e10)}</b> → count in units of ${pw(10, r.e10)}`));
    lines.push(line(`i = −e2 − q = ${n} − ${r.q} = <b>${sc.i}</b>`));
    lines.push(line(`want ⌊mX × ${pw(2, r.e2)} / ${pw(10, r.e10)}⌋ = ⌊mX × ${pw(5, sc.i)} / ${pw(2, r.q)}⌋ <span class="rp-muted">(because ${pw(2, "e2")}/${pw(10, "q+e2")} = ${pw(5, "−e2−q")}/${pw(2, "q")})</span>`));
  } else {
    const raw = M.log10Pow2(r.e2);
    lines.push(line(`q = max(0, ⌊${r.e2} × log<sub>10</sub>2⌋ − 1) = max(0, ⌊${(r.e2 * Math.log10(2)).toFixed(3)}…⌋ − 1) = <b>${r.q}</b>`));
    lines.push(note(`The code computes ⌊${r.e2} × log<sub>10</sub>2⌋ as ⌊${r.e2} × 78913 / ${pw(2, 18)}⌋ = ${raw}.`));
    lines.push(line(`e10 = q = <b>${r.e10}</b> → count in units of ${pw(10, r.e10)}`));
    lines.push(line(`want ⌊mX × ${pw(2, r.e2)} / ${pw(10, r.q)}⌋ = ⌊mX × ${pw(2, r.e2 - r.q)} / ${pw(5, r.q)}⌋`));
  }
  return {
    title: "Pick the decimal unit",
    why: `Ryū re-counts the three points in whole units of ${pw(10, "e10")}. It picks the unit so that plenty of units fit inside the interval: the “− 1” keeps one digit more than needed, so the digit that decides the rounding survives. The counts still stay small (${fmt === H ? "a few digits for a half" : "at most 19 digits, below 2<sup>62</sup>, for a double"}).`,
    lines,
  };
}

function stepMultiply(r, fmt) {
  const lines = [];
  const sc = r.scale;
  const pts = [["a", "mm", r.mm, r.start.vm], ["b", "mv", r.mv, r.start.vr], ["c", "mp", r.mp, r.start.vp]];
  if (fmt === H) {
    if (r.e2 >= 0) {
      lines.push(line(`q = 0: the unit is ${pw(10, 0)} = 1, so there is nothing to divide by`));
      for (const [n, nm, m, v] of pts) lines.push(line(`${n} = ${nm} × ${pw(2, r.e2)} = ${g(m)} × ${1 << r.e2} = <b>${g(v)}</b>`));
      lines.push(note(`A double at this step multiplies by a stored, rounded-up 1/${pw(5, "q")}. With q = 0 even d2s.c's entry is just ${pw(2, 125)} + 1, and the “+ 1” changes no floor.`));
    } else {
      const P = M.pow5(sc.i), Q = 1n << BigInt(r.q);
      lines.push(line(`${pw(5, sc.i)} = ${g(P)} and ${pw(2, r.q)} = ${g(Q)}`));
      for (const [n, nm, m, v] of pts) {
        const prod = m * P, a = approx(prod, Q);
        lines.push(line(`${n}: ${g(m)} × ${g(P)} = ${g(prod)};  ÷ ${g(Q)} = ${a.text} → <b>${g(v)}</b>`));
      }
      const k = sc.k;
      lines.push(note(`In the code: the table holds ${pw(5, sc.i)} scaled to 21 bits, ${g(P)} × ${pw(2, -k)} = ${g(sc.mul)}, and shifts by q − k = ${r.q} + ${-k} = ${sc.shift}. So b = ${g(r.mv)} × ${g(sc.mul)} = ${g(r.mv * sc.mul)}, and >> ${sc.shift} gives ${g(r.start.vr)}, the same. Every power of five a half needs fits in 21 bits, so nothing is ever truncated.`));
    }
  } else {
    if (r.e2 < 0) {
      const bitsI = M.pow5bits(sc.i);
      if (sc.k <= 0) lines.push(line(`table entry = ${pw(5, sc.i)} × ${pw(2, -sc.k)} = <b>${g(sc.mul)}</b> <span class="rp-muted">(${pw(5, sc.i)} has ${bitsI} bits, so it is stored exactly, padded to 125 bits)</span>`));
      else lines.push(line(`table entry = ⌊${pw(5, sc.i)} / ${pw(2, sc.k)}⌋ = <b>${g(sc.mul)}</b> <span class="rp-muted">(${pw(5, sc.i)} has ${bitsI} bits; the table keeps the top 125 and <em>truncates</em> the rest)</span>`));
      lines.push(line(`shift j = q − k = ${r.q} − (${minus(sc.k)}) = ${sc.shift}`));
    } else {
      lines.push(line(`k = 125 + ⌈log<sub>2</sub>${pw(5, r.q)}⌉ − 1 = ${sc.k}`));
      lines.push(line(`table entry = ⌊${pw(2, sc.k)} / ${pw(5, r.q)}⌋ + 1 = <b>${g(sc.mul)}</b> <span class="rp-muted">(the reciprocal of ${pw(5, r.q)}, <em>rounded up</em>)</span>`));
      lines.push(line(`shift j = −e2 + q + k = ${-r.e2} + ${r.q} + ${sc.k} = ${sc.shift}`));
    }
    for (const [n, nm, m, v] of pts) {
      lines.push(line(`${n}: ${nm} × entry = ${g(m)} × ${g(sc.mul)} = ${g(m * sc.mul)}; >> ${sc.shift} → <b>${g(v)}</b>`, "rp-long"));
    }
    const ex = pts.map(([, , m]) => M.exactFloor(m, r.e2, r.e10));
    const same = ex[0] === r.start.vm && ex[1] === r.start.vr && ex[2] === r.start.vp;
    lines.push(line(`check with unbounded integers: ⌊mX × ${pw(2, r.e2)} / ${pw(10, r.e10)}⌋ = ${ex.map(g).join(", ")} ${same ? '<span class="rp-ok">✓ identical</span>' : '<span class="rp-bad">✗ differs</span>'}`));
    lines.push(note(`mX fits in 64 bits and the entry in two 64-bit words: each line above is one 64×128-bit multiply that keeps the high part.`));
  }
  return {
    title: "Multiply and shift",
    why: "One multiplication per point replaces a long division. The result is the exact floor: whatever falls below the unit is dropped.",
    lines,
  };
}

function stepFlags(r) {
  const lines = [];
  const { mv, mm, mp, q } = r;
  const f = r.afterFlags;
  switch (r.flagRule) {
    case "mv": lines.push(line(`mv = ${g(mv)} is a multiple of 5, so test b: b exact ⇔ ${pw(5, q)} divides mv; mv has ${M.p5(mv)} factor${M.p5(mv) === 1 ? "" : "s"} of 5 → ${f.vrTZ ? "yes" : "no"}`)); break;
    case "mm": lines.push(line(`endpoints allowed, so test a: a exact ⇔ ${pw(5, q)} divides mm; mm = ${g(mm)} has ${M.p5(mm)} factor${M.p5(mm) === 1 ? "" : "s"} of 5 → ${f.vmTZ ? "yes" : "no"}`)); break;
    case "mp": lines.push(line(`endpoints excluded, so test c: c exact ⇔ ${pw(5, q)} divides mp; mp = ${g(mp)} has ${M.p5(mp)} factor${M.p5(mp) === 1 ? "" : "s"} of 5 → ${f.vpExactDrop ? `yes: c is an excluded endpoint, so c = c − 1 = ${g(f.vp)}` : "no"}`)); break;
    case "q1-mm": lines.push(line(`q ≤ 1 drops at most one binary place, and mv = 4 × m2 is even → b is exact`)); lines.push(line(`endpoints allowed: a exact ⇔ mm is even ⇔ ${r.mmShift === 1n ? "yes" : "no (mm = mv − 1 is odd)"}`)); break;
    case "q1-mp": lines.push(line(`q ≤ 1 drops at most one binary place, and mv = 4 × m2 is even → b is exact`)); lines.push(line(`endpoints excluded: mp = mv + 2 is even, so c is exact and excluded → c = c − 1 = ${g(f.vp)}`)); break;
    case "p2": lines.push(line(`b exact ⇔ ${pw(2, q)} divides mv; mv = ${g(mv)} has ${M.p2(mv)} factor${M.p2(mv) === 1 ? "" : "s"} of 2 → ${f.vrTZ ? "yes" : "no"}`)); lines.push(line(`a and c: mm and mp have at most one factor of 2, so they are never exact when q ≥ 2`)); break;
    default: lines.push(line(r.e2 >= 0 ? `q > 21: ${pw(5, "q")} is bigger than any mX, so nothing is exact` : `q ≥ 63: ${pw(2, "q")} is bigger than any mX, so nothing is exact`));
  }
  if (r.e2 >= 0 && r.q <= 21 && r.flagRule !== "mv") lines.push(note("mm, mv and mp lie within 4 of each other, so at most one of them is a multiple of 5. The code tests only that one."));
  lines.push(line(`a ${badge(f.vmTZ, "exact", "rounded down")} · b ${badge(f.vrTZ, "exact", "rounded down")}${f.vpExactDrop ? ` · c ${badge(true, "− 1 (excluded)", "")}` : ""}`));
  lines.push(line(`start: a = <b>${g(f.vm)}</b>, b = <b>${g(f.vr)}</b>, c = <b>${g(f.vp)}</b>`));
  return {
    title: "Did the floor drop anything?",
    why: `Two later decisions need to know whether a floor was exact: can the lower bound itself be printed, and is the value an exact tie? The dropped part is zero exactly when ${r.e2 >= 0 ? `${pw(5, "q")} divides mX` : `${pw(2, "q")} divides mX`}. That is a cheap test on mX, and it needs no extra arithmetic on the product.`,
    lines,
  };
}

function stepChop(r, fmt) {
  const rows = [];
  const f = r.afterFlags;
  const loop2 = r.steps.some((s) => s.loop === 2);
  rows.push(`<tr class="rp-start"><td>0</td><td>${f.vm}</td><td>${f.vr}</td><td>${f.vp}</td><td>–</td>${loop2 ? "<td></td>" : ""}</tr>`);
  r.steps.forEach((s, i) => {
    rows.push(`<tr><td>${i + 1}</td><td>${s.vm}</td><td>${s.vr}</td><td>${s.vp}</td><td class="rp-dig">${s.last}</td>${loop2 ? `<td class="rp-loop2">${s.loop === 2 ? "loop 2" : ""}</td>` : ""}</tr>`);
  });
  const fin = r.final;
  const lines = [`<div class="rp-tablewrap"><table class="rp-chop"><thead><tr><th scope="col">#</th><th scope="col">a</th><th scope="col">b</th><th scope="col">c</th><th scope="col">deleted</th>${loop2 ? '<th scope="col"></th>' : ""}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`];
  const vm1 = r.loop1End.vm, vp1 = r.loop1End.vp;
  lines.push(line(`stop: ⌊c/10⌋ = ${g(vp1 / 10n)} is not &gt; ⌊a/10⌋ = ${g(vm1 / 10n)}. One digit fewer would leave no whole number between a and c.`));
  if (r.steps.some((s) => s.loop === 2)) lines.push(line(`second loop: a is exact and allowed, and it ended in 0, so deleting that 0 loses nothing. Ryū keeps deleting while a ends in 0 (a is now ${g(fin.vm)}).`));
  if (fmt === D && !r.general) lines.push(note("With neither flag set (the common case), d2s.c first deletes two digits at once if it can. The result is the same."));
  return {
    title: "Delete digits from the right",
    why: "Dividing by 10 deletes the last digit of all three counts, which makes the unit 10 times coarser. Ryū keeps going while a whole number still fits between a and c at the coarser unit, and it remembers the last digit deleted from b.",
    lines,
  };
}

function stepRound(r) {
  const fin = r.final;
  const lines = [];
  const lastRaw = r.steps.length ? r.steps[r.steps.length - 1].last : 0n;
  lines.push(line(`last digit deleted from b: <b>${r.steps.length ? lastRaw : "none (counts as 0)"}</b>`));
  if (r.tie) lines.push(line(`b was exact and only zeros were deleted before that 5, so the value is <b>exactly halfway</b>. b = ${g(fin.vr)} is even, so round half to even: treat the 5 as 4`));
  if (r.outside) lines.push(line(`b = a = ${g(fin.vm)}, and a is not allowed (${r.acceptBounds ? "a is not exact, so it lies below the lower end" : "m2 is odd, so a is either the excluded lower end itself or below it"}) → b is <b>outside</b> the interval: take b + 1`));
  if (!r.tie && !r.outside) lines.push(line(fin.vr === fin.vm ? `b = a = ${g(fin.vm)}, but a is exact and allowed → b is inside the interval` : `b = ${g(fin.vr)} is above a, so it is inside the interval`));
  if (r.digitUp) lines.push(line(`digit ${fin.last} ≥ 5 → round up`));
  else if (!r.outside) lines.push(line(`digit ${fin.last} &lt; 5 → keep b`));
  lines.push(line(`output = ${g(fin.vr)} + ${r.up ? 1 : 0} = <b class="rp-out">${g(r.output)}</b>`));
  lines.push(line(`exponent = e10 + deleted digits = ${minus(r.e10)} + ${r.removed} = <b class="rp-out">${minus(r.exponent)}</b>`));
  return {
    title: "Round",
    why: "b is the value rounded down to the final unit, so the answer is b or b + 1. Round up when the last deleted digit is 5 or more (an exact tie goes to the even one), or when b fell outside the interval.",
    lines,
  };
}

function stepResult(r, fmt) {
  const lines = [];
  const sign = r.decoded.sign ? "−" : "";
  lines.push(line(`${sign}${g(r.output)} × ${pw(10, r.exponent)} = <b class="rp-out">${esc(r.text)}</b>`));
  const back = M.parseToBits(fmt, r.text.replace("−", "-"));
  const hexLen = fmt === H ? 4 : 16;
  lines.push(line(`read back: “${esc(r.text)}” rounds to 0x${back.toString(16).toUpperCase().padStart(hexLen, "0")} ${back === r.decoded.bits ? '<span class="rp-ok">✓ the same bits</span>' : '<span class="rp-bad">✗ different</span>'}`));
  if (fmt === H) {
    const ref = M.referenceShortest(fmt, r.decoded.bits & ((1n << 15n) - 1n));
    const got = M.normalizeDigits(r.output, r.exponent);
    const ok = ref.digits === got.digits && ref.exponent === got.exponent;
    lines.push(line(`brute force (try every decimal grid, keep the closest shortest): ${g(ref.digits)} × ${pw(10, ref.exponent)} ${ok ? '<span class="rp-ok">✓ same</span>' : '<span class="rp-bad">✗</span>'}`));
  } else {
    const x = M.doubleFromBits(r.decoded.bits);
    const js = String(Math.abs(x));
    const ok = Number(r.text.replace("−", "-")) === x && M.normalizeDigits(r.output, r.exponent).digits.toString() === js.replace(/e.*$/, "").replace(".", "").replace(/^0+/, "").replace(/0+$/, "");
    lines.push(line(`JavaScript's own shortest: ${sign}${js} ${ok ? '<span class="rp-ok">✓ same digits</span>' : '<span class="rp-bad">✗</span>'}`));
  }
  return { title: "Result", why: "The shortest decimal that reads back as the same value, and among those the closest.", lines };
}

// ---------------------------------------------------------------- bfloat16 lab

function fracDigits(num, den, n = 12) {
  const scaled = num * 10n ** BigInt(n);
  const s = (scaled / den).toString().padStart(n, "0").replace(/0+$/, "");
  return scaled % den === 0n ? s : `${s}…`;
}

function initBf16() {
  const slider = document.getElementById("rp-bf-B");
  const out = document.getElementById("rp-bf-Bout");
  const box = document.getElementById("rp-bf-out");
  if (!slider) return;
  const fromUrl = Number(params.get("bf"));
  if (fromUrl >= 16 && fromUrl <= 40) slider.value = String(fromUrl);
  let pending = 0;
  const run = () => {
    const B = Number(slider.value);
    out.textContent = `${B} bits`;
    const res = M.exhaustiveSmall(BF, B);
    let html = `<strong>${g(res.wrong)}</strong> wrong floors of ${g(res.total)}, in <strong>${res.exponentsAffected}</strong> of ${res.exponents} exponents.`;
    if (res.wrong === 0) html += ` Every floor is exact: at ${B} bits the table is safe for all of bfloat16.`;
    if (res.wrong > 0 && res.wrong <= 3) {
      const ex = res.examples[0];
      const value = ex.m2 << BigInt(ex.e2 + 2);
      const fr = M.fractionOf(ex.m, ex.e2, ex.q);
      html += `<br>The survivor${res.wrong > 1 ? "s include" : " is"} ${g(ex.m2)} × ${pw(2, ex.e2 + 2)} = ${g(value)} (the ${ex.m === 4n * ex.m2 ? "value" : ex.m < 4n * ex.m2 ? "lower bound" : "upper bound"}). Scaled by ${pw(10, -ex.q)}, it is ${g(ex.exact)}.${fracDigits(fr.num, fr.den)}, just ${M.fracSci(fr.den - fr.num, fr.den)} below ${g(ex.exact + 1n)}. The rounded-up reciprocal of ${pw(5, ex.q)} tips it over: computed floor ${g(ex.trunc)}, exact floor ${g(ex.exact)}.`;
    }
    box.innerHTML = html;
    const u = new URL(location.href); u.searchParams.set("bf", String(B)); history.replaceState(null, "", u);
  };
  slider.addEventListener("input", () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(run); });
  run();
}

// ---------------------------------------------------------------- needle lab

const lab = { B: 112, job: null, live: [], needles: [], needleSource: "", selected: null };
const HUNT = new Map(M.CHART_HUNT.map((r) => [r[0], r]));
const RAND = new Map(M.CHART_RANDOM.map((r) => [r[0], r]));
const liveHunt = new Map(); // B → exponents with needle (from live re-hunts)

const VERIFIED = [
  [1.9939634903624638e47, 100], [5.5624373126011584e212, 112], [1.3588129002659584e-245, 116],
  [2.1789991853451517e-166, 122], [1.85006342392073e233, 123],
];

function initLab() {
  const slider = document.getElementById("rp-B");
  if (!slider) return;
  const fromUrl = Number(params.get("B"));
  if (fromUrl >= 64 && fromUrl <= 125) slider.value = String(fromUrl);
  lab.B = Number(slider.value);
  slider.addEventListener("input", () => {
    lab.B = Number(slider.value);
    document.getElementById("rp-Bout").textContent = `${lab.B} bits`;
    lab.needles = []; lab.needleSource = "";
    renderChart(); renderSummary(); renderNeedleChips();
    if (lab.selected) showNeedle(lab.selected.x, lab.B, false);
    syncLabUrl();
    autoHunt();
  });
  document.getElementById("rp-Bout").textContent = `${lab.B} bits`;
  document.getElementById("rp-random").addEventListener("click", () => startRandom());
  document.getElementById("rp-hunt").addEventListener("click", () => startHunt([lab.B]));
  document.getElementById("rp-sweep").addEventListener("click", () => startHunt(Array.from({ length: 62 }, (_, i) => 64 + i)));
  document.getElementById("rp-stop").addEventListener("click", () => stopJob("Stopped."));
  document.getElementById("rp-presets").innerHTML = VERIFIED.map(([x, B]) => `<button type="button" data-x="${x}" data-b="${B}">${B} bits: ${x}</button>`).join("");
  document.getElementById("rp-presets").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    setWidth(Number(b.dataset.b)); showNeedle(Number(b.dataset.x), lab.B, true);
  });
  document.getElementById("rp-needles").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    showNeedle(Number(b.dataset.x), lab.B, true);
  });
  document.querySelectorAll("[data-needle]").forEach((b) => b.addEventListener("click", () => {
    setWidth(Number(b.dataset.b));
    showNeedle(Number(b.dataset.needle), lab.B, true);
    document.getElementById("rp-lab").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }));
  setupChartHover();
  let lastW = 0;
  new ResizeObserver(() => { const w = document.getElementById("rp-chart").clientWidth; if (Math.abs(w - lastW) > 8) { lastW = w; renderChart(); } }).observe(document.getElementById("rp-chart"));
  renderChart(); renderSummary(); renderTable(); renderNeedleChips();
  const nx = Number(params.get("needle"));
  showNeedle(Number.isFinite(nx) && nx > 0 ? nx : 5.5624373126011584e212, lab.B, false);
  if (params.get("run") === "hunt") startHunt([lab.B]);
  else if (params.get("run") === "random") startRandom();
  else autoHunt(0);
}

function setWidth(B) {
  const slider = document.getElementById("rp-B");
  slider.value = String(B);
  slider.dispatchEvent(new Event("input"));
}

function syncLabUrl() {
  const u = new URL(location.href);
  u.searchParams.set("B", String(lab.B));
  if (lab.selected) u.searchParams.set("needle", String(lab.selected.x)); else u.searchParams.delete("needle");
  history.replaceState(null, "", u);
}

function setBusy(busy) {
  for (const id of ["rp-random", "rp-hunt", "rp-sweep"]) document.getElementById(id).disabled = busy;
  document.getElementById("rp-stop").disabled = !busy;
  document.getElementById("rp-B").disabled = busy;
}
function status(text, frac) {
  document.getElementById("rp-status").textContent = text;
  if (frac !== undefined) document.getElementById("rp-progress").value = frac;
}
function stopJob(msg) {
  if (lab.job) lab.job.cancelled = true;
  lab.job = null; setBusy(false);
  if (msg) status(msg);
}

// Run work(budgetMs) repeatedly without blocking the page; work returns true when done.
function runChunked(job, work, done, quiet = false) {
  if (quiet) lab.quiet = job; else { lab.job = job; setBusy(true); }
  const tick = () => {
    if (job.cancelled) return;
    const t0 = performance.now();
    let finished = false;
    while (!finished && performance.now() - t0 < 24) finished = work();
    if (finished) {
      if (quiet) lab.quiet = null; else { lab.job = null; setBusy(false); }
      done();
    } else setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
}

function cancelQuiet() { clearTimeout(autoTimer); if (lab.quiet) { lab.quiet.cancelled = true; lab.quiet = null; } }

// Silently list the needles at the current width (not plotted as a run).
let autoTimer = 0;
function autoHunt(delay = 250) {
  cancelQuiet();
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (lab.job) return;
    const B = lab.B, hunter = M.makeHunter(B), job = {};
    renderNeedleChips(`Listing the needles at ${B} bits…`);
    runChunked(job, () => { hunter.run(3); return hunter.done; }, () => {
      if (lab.B !== B || lab.job) return;
      lab.needles = hunter.needles.map((n) => n.x); lab.needleSource = `hunt at ${B} bits`;
      renderNeedleChips();
    }, true);
  }, delay);
}

function startRandom() {
  cancelQuiet();
  const B = lab.B, total = 100000;
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const tester = M.makeRandomTester(B, seed);
  const job = {};
  const t0 = performance.now();
  runChunked(job, () => {
    tester.run(250);
    status(`Random test at ${B} bits: ${g(tester.tested)} of ${g(total)} doubles, ${g(tester.wrongFloors)} with a wrong floor so far.`, tester.tested / total);
    return tester.tested >= total;
  }, () => {
    const ms = Math.round(performance.now() - t0);
    lab.live.push({ kind: "random", B, value: tester.exponents.size, detail: tester });
    lab.needles = tester.examples.map((e) => e.x); lab.needleSource = `random test at ${B} bits`;
    status(`Random test at ${B} bits done in ${(ms / 1000).toFixed(1)} s: ${g(tester.wrongFloors)} of ${g(total)} doubles had a wrong floor (${g(tester.wrongOutputs)} a wrong output), in ${tester.exponents.size} exponents.`, 1);
    renderChart(); renderSummary(); renderNeedleChips();
  });
}

function startHunt(widths) {
  cancelQuiet();
  const job = {};
  let wi = 0, hunter = M.makeHunter(widths[0]);
  const t0 = performance.now();
  const one = widths.length === 1;
  runChunked(job, () => {
    hunter.run(3);
    const frac = (wi + hunter.next / 2047) / widths.length;
    status(one ? `Hunting at ${hunter.B} bits: exponent ${hunter.next} of 2,047, needles in ${hunter.exponentsWithNeedle} so far.` : `Re-hunting all widths: ${hunter.B} bits (${wi + 1} of ${widths.length}).`, frac);
    if (hunter.done) {
      liveHunt.set(hunter.B, hunter.exponentsWithNeedle);
      if (hunter.B === lab.B) { lab.needles = hunter.needles.map((n) => n.x); lab.needleSource = `hunt at ${hunter.B} bits`; }
      if (one) lab.live.push({ kind: "hunt", B: hunter.B, value: hunter.exponentsWithNeedle, detail: hunter });
      wi++;
      if (wi >= widths.length) return true;
      hunter = M.makeHunter(widths[wi]);
      renderChart();
    }
    return false;
  }, () => {
    const ms = Math.round(performance.now() - t0);
    const h = hunter;
    if (one) status(`Hunt at ${h.B} bits done in ${(ms / 1000).toFixed(1)} s: needles in ${h.exponentsWithNeedle} of 2,047 exponents (${h.posNeedles} with e2 ≥ 0, ${h.negNeedles} with e2 < 0)${h.undecided ? `; ${h.undecided} exponents undecided (candidate cap)` : ""}. ${h.candidates} candidates checked.`, 1);
    else {
      const diffs = [...liveHunt].filter(([B, v]) => HUNT.get(B)?.[1] !== v).length;
      status(`Re-hunted all ${widths.length} widths in ${(ms / 1000).toFixed(1)} s. ${diffs === 0 ? "Every count matches the stored curve." : `${diffs} widths differ from the stored curve.`}`, 1);
    }
    renderChart(); renderSummary(); renderTable(); renderNeedleChips();
  });
}

// --- chart

const CH = { w: 720, h: 300, l: 56, r: 24, t: 18, b: 64 };
const LOGMAX = Math.log10(2047);
const cx = (B) => CH.l + ((B - 64) / (125 - 64)) * (CH.w - CH.l - CH.r);
const zeroY = CH.h - CH.b + 22;
const cy = (v) => (v <= 0 ? zeroY : CH.t + (1 - Math.log10(v) / LOGMAX) * (CH.h - CH.b - CH.t));

function renderChart() {
  const host = document.getElementById("rp-chart");
  if (!host) return;
  // Draw at the box's own width so text stays at its real size on phones.
  CH.w = Math.round(Math.max(320, Math.min(720, host.clientWidth || 720)));
  CH.l = CH.w < 500 ? 44 : 56;
  const hunt = M.CHART_HUNT.map((r) => [r[0], r[1]]);
  const rand = M.CHART_RANDOM.map((r) => [r[0], r[1]]);
  const path = (pts) => pts.map(([B, v], i) => `${i ? "L" : "M"}${cx(B).toFixed(1)} ${cy(v).toFixed(1)}`).join(" ");
  let s = `<svg viewBox="0 0 ${CH.w} ${CH.h}" role="img" aria-labelledby="rp-chart-t rp-chart-d" class="rp-chart">`;
  s += `<title id="rp-chart-t">Exponents with a wrong floor, by table width</title><desc id="rp-chart-d">Log scale. The hunt finds wrong floors in most exponents up to about 108 bits, then fewer, with the last one at 123 bits and none at 124 or 125. Random testing of 100,000 doubles finds them only up to 76 bits.</desc>`;
  for (const v of [1, 10, 100, 1000]) s += `<line x1="${CH.l}" x2="${CH.w - CH.r}" y1="${cy(v)}" y2="${cy(v)}" class="rp-grid"/><text x="${CH.l - 8}" y="${cy(v) + 4}" class="rp-ax" text-anchor="end">${g(v)}</text>`;
  s += `<text x="${CH.l - 8}" y="${zeroY + 4}" class="rp-ax" text-anchor="end">0</text><line x1="${CH.l}" x2="${CH.w - CH.r}" y1="${zeroY}" y2="${zeroY}" class="rp-grid rp-zero"/>`;
  for (let B = 64; B <= 120; B += CH.w < 500 ? 16 : 8) s += `<text x="${cx(B)}" y="${CH.h - 16}" class="rp-ax" text-anchor="middle">${B}</text>`;
  s += `<text x="${cx(124)}" y="${CH.h - 16}" class="rp-ax" text-anchor="middle">124</text>`;
  s += `<text x="${(CH.l + CH.w - CH.r) / 2}" y="${CH.h - 1}" class="rp-ax rp-axt" text-anchor="middle">table width B (bits)</text>`;
  // reference markers
  s += `<line x1="${cx(124)}" x2="${cx(124)}" y1="${CH.t}" y2="${zeroY + 6}" class="rp-ref"/><text x="${cx(124) - 4}" y="${CH.t + 10}" class="rp-ax rp-refl" text-anchor="end">paper: 124</text>`;
  s += `<line x1="${cx(125)}" x2="${cx(125)}" y1="${CH.t + 16}" y2="${zeroY + 6}" class="rp-ref"/><text x="${cx(124) - 4}" y="${CH.t + 24}" class="rp-ax rp-refl" text-anchor="end">d2s.c: 125</text>`;
  // current width
  s += `<line x1="${cx(lab.B)}" x2="${cx(lab.B)}" y1="${CH.t}" y2="${zeroY + 8}" class="rp-cur"/>`;
  s += `<path d="${path(rand)}" class="rp-line rp-rand"/><path d="${path(hunt)}" class="rp-line rp-hunt"/>`;
  // direct labels
  s += `<text x="${cx(96)}" y="${cy(1848) - 10}" class="rp-dl rp-dl-hunt">hunt</text><text x="${cx(79)}" y="${zeroY - 8}" class="rp-dl rp-dl-rand">random 100k</text>`;
  // points at current width
  const hv = HUNT.get(lab.B)[1], rv = RAND.get(lab.B)[1];
  s += `<circle cx="${cx(lab.B)}" cy="${cy(hv)}" r="4.5" class="rp-pt rp-hunt-pt"/><circle cx="${cx(lab.B)}" cy="${cy(rv)}" r="4.5" class="rp-pt rp-rand-pt"/>`;
  for (const lv of lab.live) s += `<circle cx="${cx(lv.B)}" cy="${cy(lv.value)}" r="7" class="rp-live ${lv.kind === "hunt" ? "rp-live-hunt" : "rp-live-rand"}"><title>your ${lv.kind} at ${lv.B} bits: ${lv.value} exponents</title></circle>`;
  s += `<rect x="${CH.l}" y="0" width="${CH.w - CH.l - CH.r}" height="${CH.h - 30}" class="rp-hit"/>`;
  s += `</svg>`;
  host.innerHTML = s;
}

function setupChartHover() {
  const host = document.getElementById("rp-chart");
  const tip = document.getElementById("rp-tip");
  const Bat = (ev) => {
    const svg = host.querySelector("svg"); if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * CH.w;
    const B = Math.round(64 + ((x - CH.l) / (CH.w - CH.l - CH.r)) * 61);
    return B < 64 || B > 125 ? null : { B, rect, x: ev.clientX - host.getBoundingClientRect().left };
  };
  host.addEventListener("pointermove", (ev) => {
    const a = Bat(ev);
    if (!a) { tip.hidden = true; return; }
    const h = HUNT.get(a.B), r = RAND.get(a.B);
    const live = lab.live.filter((l) => l.B === a.B).map((l) => `your ${l.kind}: ${l.value}`).join(" · ");
    tip.innerHTML = `<b>${a.B} bits</b><br>hunt: ${h[1]} exponents${h[4] ? ` (+${h[4]} undecided)` : ""}<br>random 100k: ${r[1]} exponents, ${g(r[2])} wrong floors, ${r[3]} wrong outputs${live ? `<br>${live}` : ""}<br><span class="rp-muted">click to select this width</span>`;
    tip.hidden = false;
    const w = host.getBoundingClientRect().width;
    tip.style.left = `${Math.min(Math.max(a.x + 12, 0), w - 220)}px`;
  });
  host.addEventListener("pointerleave", () => { tip.hidden = true; });
  host.addEventListener("click", (ev) => { const a = Bat(ev); if (a && !lab.job) setWidth(a.B); });
}

function renderSummary() {
  const h = HUNT.get(lab.B), r = RAND.get(lab.B);
  const el = document.getElementById("rp-summary");
  let html = `At <strong>${lab.B} bits</strong>: the hunt finds wrong floors in <strong>${h[1]}</strong> of 2,047 exponents (${h[2]} with e2 ≥ 0, ${h[3]} with e2 &lt; 0${h[4] ? `, ${h[4]} undecided` : ""}). A random test of 100,000 doubles (seed 1) finds <strong>${g(r[2])}</strong> wrong floors in ${r[1]} exponents, ${r[3]} of which change the output.`;
  if (lab.B >= 124) html += " Nothing is wrong anywhere, which matches the paper's 124 bits.";
  el.innerHTML = html;
}

function renderTable() {
  const el = document.getElementById("rp-table");
  const rows = M.CHART_HUNT.map((h) => { const r = RAND.get(h[0]); const lh = liveHunt.get(h[0]); return `<tr><td>${h[0]}</td><td>${h[1]}${lh !== undefined ? (lh === h[1] ? " ✓" : ` (live ${lh})`) : ""}</td><td>${h[4]}</td><td>${r[1]}</td><td>${g(r[2])}</td><td>${r[3]}</td></tr>`; }).join("");
  el.innerHTML = `<div class="rp-tablewrap"><table class="rp-data"><thead><tr><th scope="col">B</th><th scope="col">hunt: exponents</th><th scope="col">undecided</th><th scope="col">random: exponents</th><th scope="col">random: wrong floors</th><th scope="col">random: wrong outputs</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderNeedleChips(pending) {
  const el = document.getElementById("rp-needles");
  if (pending || !lab.needles.length) {
    el.innerHTML = `<span class="rp-muted rp-small">${pending ? esc(pending) : lab.needleSource ? `None found by the ${esc(lab.needleSource)}${lab.needleSource.startsWith("hunt") ? ": every floor of every double is exact at this width" : ""}.` : "…"}</span>`;
    return;
  }
  const n = lab.needles.length, show = Math.min(n, 24);
  const pick = Array.from({ length: show }, (_, i) => lab.needles[Math.floor((i * n) / show)]);
  el.innerHTML = `<span class="rp-muted rp-small">${g(n)} from the ${esc(lab.needleSource)}${n > show ? `, ${show} shown` : ""}; ● = changes the output:</span>` + pick.map((x) => {
    const rep = M.needleReport(x, lab.B);
    return `<button type="button" data-x="${x}" title="${x}">${rep.outputDiffers ? "● " : ""}${shortNum(x)}</button>`;
  }).join("");
}
const shortNum = (x) => { const [m, e] = x.toExponential().split("e"); return `${m.slice(0, 7)}…e${e}`; };

function showNeedle(x, B, scroll) {
  lab.selected = { x };
  const el = document.getElementById("rp-needle");
  const rep = M.needleReport(x, B);
  const names = ["a (lower bound)", "b (value)", "c (upper bound)"];
  const sc = rep.scale;
  const kind = rep.e2 >= 0 ? `⌊${pw(2, "k")}/${pw(5, rep.q)}⌋ + 1, the reciprocal rounded up` : `⌊${pw(5, sc.i)}/${pw(2, "k")}⌋, truncated`;
  const good = M.ryu(D, M.doubleBits(x));
  const ms = [good.mm, good.mv, good.mp];
  const rows = [0, 1, 2].map((j) => {
    const f = rep.fracs[j];
    const wrong = rep.wrong.includes(j);
    const err = M.constantError(ms[j], rep.e2, rep.e10, sc.mul, sc.shift);
    const near = f.num * 2n > f.den ? `${M.fracSci(f.den - f.num, f.den)} below the next integer` : `${M.fracSci(f.num, f.den)} above the integer`;
    return `<tr class="${wrong ? "rp-wrongrow" : ""}"><th scope="row">${names[j]}</th><td>${diffDigits(rep.exact[j], rep.trunc[j])}</td><td>${diffDigits(rep.trunc[j], rep.exact[j], wrong)}</td><td class="rp-wrap">${near}</td><td class="rp-wrap">${err.num < 0n ? "−" : "+"}${M.fracSci(err.num < 0n ? -err.num : err.num, err.den)}</td></tr>`;
  }).join("");
  const chopCol = (c, other) => c.rows.map((row, i) => { const o = other.rows[i]; const diff = !o || o.vr !== row.vr || o.vm !== row.vm || o.vp !== row.vp; return `<tr class="${diff ? "rp-diffrow" : ""}"><td>${row.vm}</td><td>${row.vr}</td><td>${row.vp}</td><td>${row.last ?? "–"}</td></tr>`; }).join("");
  const chopTable = (title, c, other) => `<div><p class="rp-small"><b>${title}</b> → ${esc(c.text)}</p><div class="rp-tablewrap"><table class="rp-chop rp-chop-s"><thead><tr><th scope="col">a</th><th scope="col">b</th><th scope="col">c</th><th scope="col">del.</th></tr></thead><tbody>${chopCol(c, other)}</tbody></table></div></div>`;
  let verdict;
  if (!rep.wrong.length) verdict = `<span class="rp-ok">At ${B} bits every floor of this double is exact.</span> ${B >= 124 ? "" : "(It is a needle at a narrower width.)"}`;
  else if (!rep.outputDiffers) verdict = `A floor is wrong, but deleting digits throws the wrong digit away: the output is still <b>${esc(rep.goodText)}</b>.`;
  else if (rep.readsBack) verdict = `The output changes to <b class="rp-bad">${esc(rep.badText)}</b> instead of ${esc(rep.goodText)}. It still reads back as the same double, but it is not the closest shortest decimal.`;
  else verdict = `The output changes to <b class="rp-bad">${esc(rep.badText)}</b> instead of ${esc(rep.goodText)}, and it reads back as a <b>different double</b>, ${ulpText(x, rep.readsBackAs)}. Ryū would have printed a wrong number.`;
  el.innerHTML = `<h4>${x} with a ${B}-bit table</h4>
    <p class="rp-small">e2 = ${minus(rep.e2)}, q = ${rep.q}, unit ${pw(10, rep.e10)}. Constant: ${kind}, ${B} bits. Correct output: <b>${esc(rep.goodText)}</b>.</p>
    <div class="rp-tablewrap"><table class="rp-data rp-needle-t"><thead><tr><th scope="col"></th><th scope="col">exact floor</th><th scope="col">${B}-bit result</th><th scope="col">exact scaled value</th><th scope="col">error from the constant</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="rp-verdict">${verdict}</p>
    <div class="rp-chops">${chopTable("Exact floors", rep.goodChop, rep.badChop)}${chopTable(`${B}-bit floors`, rep.badChop, rep.goodChop)}</div>`;
  syncLabUrl();
  if (scroll) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
}

function ulpText(x, y) {
  const d = M.doubleBits(y) - M.doubleBits(x);
  const n = d < 0n ? -d : d;
  return n === 1n ? `its neighbour ${d > 0n ? "above" : "below"}` : `${n} steps ${d > 0n ? "above" : "below"} it`;
}

function diffDigits(a, b, mark = false) {
  const s = a.toString(), t = b.toString();
  if (s === t) return s;
  let i = 0;
  while (i < s.length && s[i] === t[i]) i++;
  return `${s.slice(0, i)}<span class="${mark ? "rp-diff-bad" : "rp-diff"}">${s.slice(i)}</span>`;
}

// ---------------------------------------------------------------- boot

document.querySelectorAll(".ryu-pocket-card").forEach(createCard);
document.querySelectorAll("[data-card][data-load]").forEach((b) => b.addEventListener("click", () => {
  const c = cards.get(b.dataset.card);
  if (!c) return;
  c.load(b.dataset.load, "half");
  document.getElementById(b.dataset.card).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}));
initBf16();
initLab();
