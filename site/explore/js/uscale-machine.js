// Copyright (C) 2026 Toit contributors.

// DOM code for the "uscale-machine" explanation page (unrounded scaling, approach B).
import * as M from "./uscale-machine-model.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const hx = (x) => `0x${M.hex64(x)}`;
const U = (u) => `⟨${M.ustr(u)}⟩`;
const fmtInt = (n) => n.toLocaleString("en-US");
const pct = (a, b, digits = 1) => (b ? `${((100 * a) / b).toFixed(digits)}%` : "–");
// A "+" typed into a URL arrives as a space; undo that for the number fields.
const params = new URLSearchParams(location.search.replace(/\+/g, "%2B"));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setParams(obj) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history.replaceState(null, "", url);
}

// Parse the free-text number boxes. Returns a positive finite double or throws.
function readDouble(text) {
  const v = M.evalDouble(text);
  if (!Number.isFinite(v)) throw new Error("that is not a finite number");
  if (v === 0) throw new Error("zero is handled before Short is called; pick a nonzero number");
  if (v < 0) throw new Error("the sign is handled outside Short; enter a positive number");
  return v;
}

function chips(host, items, onPick) {
  host.innerHTML = "";
  const buttons = items.map((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = item.label;
    b.setAttribute("aria-pressed", "false");
    if (item.title) b.title = item.title;
    b.addEventListener("click", () => onPick(item));
    host.append(b);
    return b;
  });
  return (predicate) => buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(predicate(items[i]))));
}

function showError(el, message) {
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

// ------------------------------------------------------------------ word rendering

// Characters of one 64-bit word. For the top word with a shift s, the tail is drawn
// in binary with the cut after the kept bits.
function wordChars(v, opts = {}) {
  const out = [];
  const { s = null, frac = false } = opts;
  if (s === null) {
    for (const ch of M.hex64(v)) out.push({ ch, cls: "" });
  } else {
    const T = Math.min(64, 4 * Math.ceil((Math.min(s, 64) + 2) / 4));
    const headNibbles = 16 - T / 4;
    const head = headNibbles > 0 ? (v >> BigInt(T)).toString(16).padStart(headNibbles, "0") : "";
    for (const ch of head) out.push({ ch, cls: "usm-k" });
    const tail = (v & ((1n << BigInt(T)) - 1n)).toString(2).padStart(T, "0");
    out.push({ open: true });
    for (let i = 0; i < T; i++) {
      const pos = T - 1 - i;
      if (i > 0 && pos % 4 === 3 && pos !== s - 1) out.push({ gap: true });
      if (pos === s - 1) out.push({ cut: true });
      let cls = pos >= s ? "usm-k usm-bit" : "usm-d usm-bit";
      if (pos === s + 1) cls += " usm-half";
      if (pos === s) cls += " usm-quarter";
      out.push({ ch: tail[i], cls });
    }
    out.push({ close: true });
  }
  if (frac) out.push({ ch: "…", cls: "usm-frac" });
  return out;
}

function charsHTML(chars, otherAll) {
  let j = 0;
  const other = otherAll ? otherAll.filter((x) => x.ch !== undefined) : null;
  return chars.map((c) => {
    if (c.open) return '<span class="usm-tail" title="last bits of hi, in binary">';
    if (c.close) return "</span>";
    if (c.gap) return '<span class="usm-gap"></span>';
    if (c.cut) return '<span class="usm-cutmark" aria-hidden="true"></span>';
    const o = other ? other[j] : null;
    j++;
    const diff = o && o.ch !== c.ch ? " usm-diff" : "";
    return `<span class="${c.cls}${diff}">${c.ch}</span>`;
  }).join("");
}

// rows: [{ tag, words: {hi, mid, lo}, frac, ghostLo, note }]
function wordsHTML(rows, s, opts = {}) {
  const names = [["hi", "hi (top)"], ["mid", "mid (middle)"], ["lo", "lo (bottom)"]];
  const shown = opts.only || ["hi", "mid", "lo"];
  const charsFor = (row, name) => wordChars(row.words[name], { s: name === "hi" ? s : null, frac: name === "lo" && row.frac });
  const cols = names.filter(([n]) => shown.includes(n)).map(([name, title]) => {
    const lines = rows.map((row, r) => {
      const chars = charsFor(row, name);
      const other = rows.length === 2 ? charsFor(rows[1 - r], name) : null;
      const ghost = name === "lo" && row.ghostLo ? " usm-ghost" : "";
      return `<div class="usm-wrow"><span class="usm-rtag">${row.tag}</span><code class="usm-wval${ghost}">${charsHTML(chars, other)}</code></div>`;
    }).join("");
    const extra = name === "lo" && opts.loNote ? `<span class="usm-wnote">${opts.loNote}</span>` : "";
    return `<div class="usm-word usm-w-${name}"><div class="usm-wlabel">${title}${extra}</div>${lines}</div>`;
  }).join("");
  return `<div class="usm-words" role="group" aria-label="${esc(opts.aria || "product words")}">${cols}</div>`;
}

// ------------------------------------------------------------------ §3 table widget

function initTable() {
  const input = $("usm-tp");
  const out = $("usm-table-out");
  const items = [
    { label: "17 (0.1)", p: 17 }, { label: "27", p: 27 }, { label: "28", p: 28 }, { label: "55", p: 55 },
    { label: "56", p: 56 }, { label: "−1", p: -1 }, { label: "−7 (1e23)", p: -7 }, { label: "38", p: 38 },
  ];
  const mark = chips($("usm-tp-chips"), items, (it) => { input.value = it.p; render(); });
  function render() {
    let p = Math.round(Number(input.value));
    if (!Number.isFinite(p)) p = -7;
    p = Math.max(M.POW10_MIN, Math.min(M.POW10_MAX, p));
    const t = M.pow10Entry(p);
    mark((it) => it.p === p);
    const kind = t.exact
      ? (t.pmLo === 0n ? "exact, and the bottom 64 bits are zero: 5<sup>p</sup> fits in one word" : "exact: 5<sup>p</sup> still fits in 128 bits")
      : "rounded up: 10<sup>p</sup> has no finite 128-bit form";
    const eps = M.entryError(p);
    const stored = t.lo === 0n
      ? `<code>hi = ${hx(t.hi)}</code>, <code>lo = 0</code>: the top word is exact on its own.`
      : `<code>hi = ${hx(t.hi)}</code> (top word + 1), <code>lo = ${hx(t.lo)}</code>, so pm = hi·2⁶⁴ − lo.`;
    out.innerHTML = `
      <dl class="usm-kv">
        <dt>10<sup>${p}</sup> ≈</dt><dd>pm · 2<sup>${t.pe}</sup></dd>
        <dt>pm</dt><dd><code class="usm-pm"><span>${M.hex64(t.pmHi)}</span> <span>${M.hex64(t.pmLo)}</span></code></dd>
        <dt>entry</dt><dd><span class="usm-pill ${t.exact ? "usm-ok" : "usm-warn"}">${t.exact ? "exact" : "inexact"}</span> ${kind}; ε₀ = ${eps}</dd>
        <dt>stored</dt><dd>${stored}</dd>
      </dl>`;
    setParams({ tp: p === -7 ? null : p });
  }
  input.addEventListener("input", render);
  if (params.has("tp")) input.value = params.get("tp");
  render();
}

// ------------------------------------------------------------------ Short call selection

function callOf(T, which) {
  if (which === "max") return { x: T.max, name: "upper midpoint max" };
  if (which === "m") return { x: T.m, name: "the double m itself" };
  return { x: T.min, name: "lower midpoint min" };
}

function callChips(host, onPick) {
  const items = [{ label: "min", which: "min" }, { label: "max", which: "max" }, { label: "m", which: "m" }];
  return chips(host, items, (it) => onPick(it.which));
}

// ------------------------------------------------------------------ §4 product figure

function initProduct() {
  const frames = [
    { label: "0.1: exact power", f: 0.1, which: "min", title: "p = 17: the table entry is exact" },
    { label: "Avogadro: inexact power", f: 6.02214076e23, which: "min", title: "p = −7: the entry is rounded up" },
    { label: "1e23: an exact result", f: 1e23, which: "max", title: "the upper midpoint is exactly 10^23" },
  ];
  const state = { text: "0.1", f: 0.1, which: "min" };
  const input = $("usm-prod-input");
  const markFrame = chips($("usm-prod-chips"), frames, (fr) => { state.f = fr.f; state.text = String(fr.f); state.which = fr.which; input.value = ""; render(); });
  const markCall = callChips($("usm-prod-calls"), (w) => { state.which = w; render(); });
  $("usm-prod-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    try { state.f = readDouble(input.value); state.text = input.value.trim(); showError($("usm-prod-error"), ""); render(); } catch (err) { showError($("usm-prod-error"), err.message); }
  });

  function render() {
    const T = M.Short(state.f);
    const { x, name } = callOf(T, state.which);
    const P = M.product192(x, T.p);
    const frame = frames.find((fr) => fr.f === state.f && fr.which === state.which);
    markFrame((fr) => fr === frame);
    markCall((it) => it.which === state.which);
    $("usm-prod-title").innerHTML = `${esc(frame ? frame.label : state.text)}: <code>uscale</code> of the ${name}, x = <code>${hx(x)}</code>, p = ${T.p}, s = ${T.s}`;
    $("usm-prod-words").innerHTML = wordsHTML([
      { tag: "ideal", words: P.ideal, frac: P.idealFrac },
      { tag: "x·pm", words: P.computed, ghostLo: true },
    ], T.s, { loNote: "never used", aria: "ideal and computed product words" });
    const mask = (1n << BigInt(T.s)) - 1n;
    const low = P.computed.hi & mask;
    const sticky = low !== 0n || P.computed.mid !== 0n;
    const u = (P.computed.hi >> BigInt(T.s)) | (sticky ? 1n : 0n);
    const exact = M.uscaleExact(x, T.e, T.p);
    const agree = P.ideal.hi === P.computed.hi && P.ideal.mid === P.computed.mid;
    const err = P.errorIsZero ? "0: the table entry is exact, so the product is exact"
      : `x·ε₀ ≈ ${P.errorApprox.toExponential(2)}, below 2⁶⁴ ≈ 1.84e19`;
    const lines = [];
    lines.push(`Table entry for 10<sup>${T.p}</sup>: ${P.entry.exact ? "exact" : "rounded up"}. Error in the product: ${err}.`);
    lines.push(P.errorIsZero ? "Nothing to go wrong: the computed product is the ideal one."
      : agree ? `Top and middle words agree: the error stayed in the bottom word.`
      : `<strong>A carry reached the ${P.carriedIntoHi ? "top" : "middle"} word.</strong>`);
    if (sticky) {
      lines.push(`Below the cut: the low ${T.s} bits of hi are <code>${low.toString(2).padStart(T.s, "0")}</code>, mid is ${P.computed.mid === 0n ? "zero" : "nonzero"} → something is nonzero → sticky = 1.`);
    } else {
      lines.push(`Below the cut everything the code looks at is zero: the low ${T.s} bits of hi and all of mid → sticky = 0, an <strong>exact</strong> result.`);
    }
    lines.push(`uscale = <strong>${U(u)}</strong> · exact rational: ${U(exact)} ${u === exact ? "✓" : "✗"}`);
    $("usm-prod-readout").innerHTML = lines.map((l) => `<p>${l}</p>`).join("");
    setParams({ pf: frame && frame === frames[0] ? null : state.text, pc: frame ? null : state.which });
  }

  if (params.has("pf")) {
    try { state.f = readDouble(params.get("pf")); state.text = params.get("pf"); } catch { /* keep default */ }
    const fr = frames.find((x) => x.f === state.f);
    state.which = params.get("pc") || (fr ? fr.which : "min");
    if (!fr) input.value = state.text;
  }
  render();
}

// ------------------------------------------------------------------ §6 counterexample

function initCounterexample() {
  const P = M.product192(0xd5bc71e52b31e483n, 62);
  $("usm-counter-words").innerHTML = wordsHTML([
    { tag: "ideal", words: P.ideal, frac: P.idealFrac },
    { tag: "x·pm", words: P.computed },
  ], null, { aria: "counterexample: ideal and computed words" }) +
    `<p class="usm-counter-cap">x = <code>0xd5bc71e52b31e483</code>, 10<sup>62</sup> entry. Ideal middle <code>ffff…ffff</code> + a carry = computed middle <code>0000…0000</code>, and the top word is off by one.</p>`;
}

// ------------------------------------------------------------------ §5 toy sandbox

function initToy() {
  const state = { mode: "carry", value: 0x6fa, err: 11 };
  const presets = {
    carry: [
      { label: "stops in bottom", value: 0x6a3, err: 5 },
      { label: "into the middle", value: 0x6a9, err: 11 },
      { label: "all the way", value: 0x6fa, err: 11 },
    ],
    borrow: [
      { label: "stops in bottom", value: 0x6a8, err: 5 },
      { label: "into the middle", value: 0x6b4, err: 11 },
      { label: "all the way", value: 0x705, err: 11 },
    ],
  };
  const host = $("usm-toy");
  const slider = $("usm-toy-err");
  const out = $("usm-toy-err-out");
  let mark = () => {};
  function setPresets() {
    mark = chips($("usm-toy-presets"), presets[state.mode], (pr) => { state.value = pr.value; state.err = pr.err; slider.value = pr.err; render(); });
  }
  function setMode(mode) {
    state.mode = mode;
    $("usm-toy-carry").setAttribute("aria-pressed", String(mode === "carry"));
    $("usm-toy-borrow").setAttribute("aria-pressed", String(mode === "borrow"));
    const pr = presets[mode][2];
    state.value = pr.value; state.err = pr.err; slider.value = pr.err;
    setPresets();
    render();
  }
  $("usm-toy-carry").addEventListener("click", () => setMode("carry"));
  $("usm-toy-borrow").addEventListener("click", () => setMode("borrow"));
  slider.addEventListener("input", () => { state.err = Number(slider.value); render(); });

  const nib = (v, g) => (v >> (4 * g)) & 15;
  const bin4 = (v) => v.toString(2).padStart(4, "0");

  function rowHTML(tag, v, { editable = false, only = null, changed = [], seen = false } = {}) {
    const groups = [2, 1, 0].map((g) => {
      const cells = [3, 2, 1, 0].map((b) => {
        const pos = 4 * g + b;
        const bit = (v >> pos) & 1;
        if (only !== null && !only.includes(g)) return '<span class="usm-tbit usm-tblank"></span>';
        const rip = changed.includes(pos) ? (pos >= 4 ? " usm-rip" : " usm-rip-low") : "";
        if (editable) return `<button type="button" class="usm-tbit usm-tedit${rip}" data-pos="${pos}" aria-label="bit ${pos}, ${bit}">${bit}</button>`;
        return `<span class="usm-tbit${rip}">${bit}</span>`;
      }).join("");
      return `<span class="usm-tgroup usm-tg${g}">${cells}</span>`;
    }).join("");
    return `<div class="usm-trow${seen ? " usm-tseen" : ""}"><span class="usm-ttag">${tag}</span>${groups}</div>`;
  }

  function render() {
    out.value = String(state.err);
    const r = M.toyRipple(state.value, state.err, state.mode);
    const carry = state.mode === "carry";
    $("usm-toy-err-label").textContent = carry ? "error (added)" : "error (subtracted)";
    mark((pr) => pr.value === state.value && pr.err === state.err);
    const head = `<div class="usm-trow usm-thead"><span class="usm-ttag"></span><span class="usm-tgroup">top</span><span class="usm-tgroup">middle</span><span class="usm-tgroup">bottom</span></div>`;
    host.innerHTML = head + (carry
      ? rowHTML("ideal", state.value, { editable: true }) + rowHTML("+ error", state.err, { only: [0] }) + rowHTML("computed", r.result, { changed: r.changed, seen: true })
      : rowHTML("seen", state.value, { editable: true, seen: true }) + rowHTML("− error", state.err, { only: [0] }) + rowHTML("true", r.result, { changed: r.changed }));
    host.querySelectorAll(".usm-tedit").forEach((b) => b.addEventListener("click", () => {
      state.value ^= 1 << Number(b.dataset.pos);
      render();
      host.querySelector(`.usm-tedit[data-pos="${b.dataset.pos}"]`)?.focus();
    }));
    const seenMid = bin4(r.seenMid);
    const topBefore = bin4(nib(state.value, 2));
    const topAfter = bin4(nib(r.result, 2));
    let msg;
    if (carry) {
      if (r.seenMid !== 0) {
        msg = `The machine sees the middle <code>${seenMid}</code>. It contains a 1, so no carry can have crossed it: the top <code>${topAfter}</code> is right${r.reachedMid ? " (the carry did get into the middle, and stopped there)" : ""}.`;
      } else {
        msg = `The machine sees the middle <code>0000</code>: the danger sign. ${r.reachedTop ? `Here the carry really did cross it, and the top changed from <code>${topBefore}</code> to <code>${topAfter}</code>.` : "Here the carry did not reach the top, but from top and middle alone the machine cannot tell."} This is the case the proof must rule out (section 6).`;
      }
    } else if (r.seenMid !== 0) {
      msg = `The machine sees the middle <code>${seenMid}</code>. A borrow turns 0s into 1s and stops at the first 1, so it cannot pass this middle: the seen top <code>${topBefore}</code> is the true top${r.reachedMid ? " (the borrow got into the middle and stopped there)" : ""}.`;
    } else {
      msg = `The machine sees the middle <code>0000</code>: a borrow could run straight through. ${r.reachedTop ? `Here it did: the true top is <code>${topAfter}</code>, not <code>${topBefore}</code>.` : "Here it did not, but the machine cannot know without computing the error."} In section 7 this is exactly when <code>uscale</code> does its second multiply.`;
    }
    $("usm-toy-readout").innerHTML = `<p>${msg}</p>`;
  }
  setPresets();
  render();
}

// ------------------------------------------------------------------ §7 one multiply

function initOneMultiply() {
  const examples = [
    { label: "8.07e-23", f: 8.07e-23, which: "min" },
    { label: "1e23", f: 1e23, which: "max" },
    { label: "0.3", f: 0.3, which: "min" },
    { label: "Avogadro", f: 6.02214076e23, which: "min" },
    { label: "2^89", f: 2 ** 89, which: "max" },
  ];
  const state = { f: 8.07e-23, text: "8.07e-23", which: "min", cut: false };
  const input = $("usm-om-input");
  const cutBox = $("usm-om-cut");
  const markEx = chips($("usm-om-chips"), examples, (ex) => { state.f = ex.f; state.text = ex.label; state.which = ex.which; input.value = ""; render(); });
  const markCall = callChips($("usm-om-calls"), (w) => { state.which = w; render(); });
  cutBox.addEventListener("change", () => { state.cut = cutBox.checked; render(); });
  $("usm-om-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    try { state.f = readDouble(input.value); state.text = input.value.trim(); showError($("usm-om-error"), ""); render(); } catch (err) { showError($("usm-om-error"), err.message); }
  });

  function render() {
    const T = M.Short(state.f);
    const { x, name } = callOf(T, state.which);
    const pre = M.prescale(T.e, T.p, T.lp);
    const c = M.uscale(x, pre, { skipCheck: state.cut });
    const exact = M.uscaleExact(x, T.e, T.p);
    const ex = examples.find((e) => e.f === state.f && e.which === state.which);
    markEx((e) => e === ex);
    markCall((it) => it.which === state.which);
    const t = pre.entry;
    const s = c.s;
    const lowStr = c.lowBits.toString(2).padStart(s, "0");
    const steps = [];
    const note = state.which === "m" && T.branch !== "round" ? " (Short makes this third call only in its round case; shown anyway)" : "";
    steps.push(`<li><p><code>uscale</code> of the ${name} of ${esc(state.text)}${note}: x = <code>${hx(x)}</code>, p = ${T.p}, s = ${s}. Table entry: <code>pm.hi = ${hx(t.hi)}</code>${t.lo === 0n ? " (exact, lo = 0)" : ` (rounded up), <code>pm.lo = ${hx(t.lo)}</code>`}.</p></li>`);
    steps.push(`<li><p>One multiply, <code>x · pm.hi</code>:</p>${wordsHTML([{ tag: "x·hi", words: { hi: c.hiRaw, mid: c.mid, lo: 0n } }], s, { only: ["hi", "mid"], aria: "first product" })}</li>`);
    let result;
    if (state.cut) {
      steps.push(`<li><p><strong>Check deleted.</strong> The code trusts <code>hi</code> and sets sticky = 1${c.lowBits === 0n ? `, even though the ${s} dropped bits <code>${lowStr}</code> are all zero and a borrow could run through them` : ` (here that happens to be safe: the dropped bits <code>${lowStr}</code> contain a 1)`}.</p></li>`);
    } else if (c.fast) {
      steps.push(`<li><p>The ${s} bits about to be dropped are <code>${lowStr}</code>. They contain a 1, which stops any borrow: the kept bits are right and the result is inexact. <strong>Done after one multiply</strong>; sticky = 1.</p></li>`);
    } else {
      const diff = (c.mid - c.mid2) & M.M64;
      steps.push(`<li><p>The ${s} bits about to be dropped are <code>${lowStr}</code>: no firewall. <strong>Second multiply:</strong> <code>mid2</code> = top half of <code>x · pm.lo</code> = <code>${hx(c.mid2)}</code>.</p>
        <p><code>mid − mid2</code> = <code>${hx(diff)}</code> (mod 2⁶⁴) → sticky = ${c.sticky}${c.sticky === 0n ? ": a difference of 0 or 1 means the true middle is zero, an <strong>exact</strong> result" : ""}.</p>
        <p><code>mid ${c.borrow ? "&lt;" : "≥"} mid2</code> → ${c.borrow ? `<strong>borrow</strong>: hi becomes <code>${hx(c.hi)}</code>` : "no borrow; hi stays"}.</p>
        ${c.borrow ? wordsHTML([{ tag: "hi − 1", words: { hi: c.hi, mid: 0n, lo: 0n } }], s, { only: ["hi"], aria: "corrected top word" }) : ""}</li>`);
    }
    const ok = c.u === exact;
    result = `<li><p><code>hi &gt;&gt; ${s} | sticky</code> = <strong>${U(c.u)}</strong>. Exact rational ⟨x·2<sup>${T.e}</sup>·10<sup>${T.p}</sup>⟩ = ${U(exact)} <span class="${ok ? "usm-good" : "usm-bad"}">${ok ? "✓ same" : "✗ different"}</span></p></li>`;
    steps.push(result);
    const good = M.Short(state.f);
    const cut = M.Short(state.f, { skipCheck: true });
    const goodStr = M.jsString(good.d, good.q);
    const cutStr = M.jsString(cut.d, cut.q);
    const [a0, a1] = M.trimZeros(good.d, good.q);
    const [b0, b1] = M.trimZeros(cut.d, cut.q);
    const same = a0 === b0 && a1 === b1;
    const roundTrips = Number(`${cut.d}e${cut.q}`) === state.f;
    const shortLine = `<p class="usm-om-final"><code>Short(${esc(state.text)})</code> as written prints <strong>${goodStr}</strong>. With the corner cut it prints <strong class="${same ? "" : "usm-bad"}">${cutStr}</strong>${same ? " (same)" : roundTrips ? ": it still reads back as the same double, but it is not the shortest" : ": it does not even read back as the same double"}.</p>`;
    $("usm-om-steps").innerHTML = `<ol class="lab-steps usm-steps">${steps.join("")}</ol>${shortLine}`;
    // highlight code lines
    document.querySelectorAll("#usm-fast-code .usm-cl").forEach((ln) => {
      const inIf = ln.classList.contains("usm-cl-if");
      ln.classList.toggle("usm-cl-dim", inIf && (c.fast || state.cut));
      ln.classList.toggle("usm-cl-cut", inIf && state.cut);
    });
    setParams({ om: ex && ex === examples[0] ? null : state.text, oc: ex ? null : state.which, cut: state.cut ? 1 : null });
  }

  if (params.has("om")) {
    try { state.f = readDouble(params.get("om")); state.text = params.get("om"); } catch { /* default */ }
    const ex = examples.find((e) => e.f === state.f);
    state.which = params.get("oc") || (ex ? ex.which : "min");
    if (ex) state.text = ex.label; else input.value = state.text;
  }
  if (params.get("cut") === "1") { state.cut = true; cutBox.checked = true; }
  render();

  // expose a loader for the stats examples
  return (f) => {
    state.f = f; state.text = String(f); input.value = state.text;
    const a = M.Short(f);
    const which = ["min", "max", "m"].find((w) => {
      const { x } = callOf(a, w);
      const pre = M.prescale(a.e, a.p, a.lp);
      return M.uscale(x, pre).u !== M.uscale(x, pre, { skipCheck: true }).u;
    });
    state.which = which || "min";
    state.cut = true; cutBox.checked = true;
    render();
    $("usm-om-fig").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };
}

function initStats(loadExample) {
  const btn = $("usm-stats-run");
  const out = $("usm-stats-out");
  const prog = $("usm-stats-progress");
  const N = 10000;
  const start = (sync) => {
    btn.disabled = true;
    const acc = M.newStats();
    const next = M.makeRandomDoubles(Date.now());
    const step = () => {
      M.statsBatch(next, sync ? N : 400, acc);
      paint(acc);
      prog.textContent = `${fmtInt(acc.n)} / ${fmtInt(N)}`;
      if (acc.n < N) setTimeout(step, 0);
      else { btn.disabled = false; btn.textContent = "Run another 10,000"; prog.textContent = "done"; }
    };
    step();
  };
  btn.addEventListener("click", () => start(false));
  if (params.get("run") === "1") start(true); // for screenshots
  function paint(a) {
    const calls = a.calls.fast + a.calls.slow;
    const share = calls ? a.calls.fast / calls : 0;
    out.innerHTML = `
      <div class="usm-stat"><span class="usm-stat-num">${pct(a.calls.fast, calls)}</span><span class="usm-stat-label">of ${fmtInt(calls)} <code>uscale</code> calls finished after one multiply</span>
        <span class="usm-meter" aria-hidden="true"><span style="width:${(share * 100).toFixed(2)}%"></span></span></div>
      <div class="usm-stat"><span class="usm-stat-num">${pct(a.allFast, a.n)}</span><span class="usm-stat-label">of ${fmtInt(a.n)} <code>Short</code> calls never needed the second multiply</span></div>
      <div class="usm-stat"><span class="usm-stat-num">${fmtInt(a.mismatch)}</span><span class="usm-stat-label">outputs differ from JavaScript’s (as written)</span></div>
      <div class="usm-stat usm-stat-bad"><span class="usm-stat-num">${fmtInt(a.cutWrong)}</span><span class="usm-stat-label">wrong outputs with the corner cut (${pct(a.cutWrong, a.n, 2)}), ${fmtInt(a.cutNoRoundTrip)} of them not even reading back</span></div>
      <p class="usm-stat-mix">Short’s case mix: a valid integer ending in 0: ${pct(a.branch.zero, a.n)} · exactly one valid integer: ${pct(a.branch.single, a.n)} · round the value: ${pct(a.branch.round, a.n)}</p>
      ${a.examples.length ? `<p class="usm-stat-mix">Doubles that print wrong with the corner cut (click to inspect): <span class="lab-chips usm-ex-chips"></span></p>` : ""}`;
    const host = out.querySelector(".usm-ex-chips");
    if (host) chips(host, a.examples.map((f) => ({ label: String(f), f })), (it) => loadExample(it.f));
  }
}

// ------------------------------------------------------------------ §8 code with values

const V = (s) => `<span class="usm-v">${s}</span>`;
const B = (ok) => `<span class="usm-b ${ok ? "usm-btrue" : "usm-bfalse"}">${ok ? "true" : "false"}</span>`;
function callTag(c) {
  const exact = M.uscaleExact(c.x, c.e, c.p);
  return `<span class="usm-mul">${c.fast ? "1 multiply" : "2 multiplies"}</span>${c.u === exact ? '<span class="usm-check" title="equals the exact rational">✓</span>' : '<span class="usm-bad">✗</span>'}`;
}
const callSpan = (s) => s.replace(/⟦(.*?)⟧/g, '<span class="usm-call">$1</span>');

// line: [src, values(T) -> html|"", active(T) -> bool (default true)]
const SHORT_LINES = [
  ["func Short(f float64) (d uint64, p int) {", (T) => V(`f = ${T.f}`)],
  ["\tconst minExp = -1085"],
  ["\tm, e := unpack64(f)", (T) => V(`m = ${hx(T.m)}`) + V(`e = ${T.e}`)],
  ["\tvar min uint64"],
  ["\tz := 11"],
  ["\tif m == 1<<63 && e > minExp {", (T) => B(T.skew) + (T.skew ? V("a power of two: skewed interval") : "")],
  ["\t\tp = -skewed(e + z)", (T) => V(`p = ${T.p}`), (T) => T.skew],
  ["\t\tmin = m - 1<<(z-2)", (T) => V(`min = ${hx(T.min)}`), (T) => T.skew],
  ["\t} else {", null, (T) => !T.skew],
  ["\t\tif e < minExp {", (T) => B(T.sub) + (T.sub ? V("subnormal") : ""), (T) => !T.skew],
  ["\t\t\tz = 11 + (minExp - e)", (T) => V(`z = ${T.z}`), (T) => T.sub],
  ["\t\t}", null, (T) => !T.skew],
  ["\t\tp = -log10Pow2(e + z)", (T) => V(`p = ${T.p}`), (T) => !T.skew],
  ["\t\tmin = m - 1<<(z-1)", (T) => V(`min = ${hx(T.min)}`), (T) => !T.skew],
  ["\t}"],
  ["\tmax := m + 1<<(z-1)", (T) => V(`max = ${hx(T.max)}`)],
  ["\todd := int(m>>z) & 1", (T) => V(`odd = ${T.odd}`) + V(T.odd ? "odd: endpoints excluded" : "even: endpoints included")],
  ["\tpre := prescale(e, p, log2Pow10(p))", (T) => V(`s = ${T.s}`) + V(`table entry 10^${T.p}`)],
  ["\tdmin := ⟦uscale(min, pre)⟧.nudge(+odd).ceil()", (T) => V(U(T.cmin.u)) + callTag(T.cmin) + (T.odd ? V(`nudge → ${U(T.cmin.u + 1n)}`) : "") + V(`dmin = ${T.dmin}`)],
  ["\tdmax := ⟦uscale(max, pre)⟧.nudge(-odd).floor()", (T) => V(U(T.cmax.u)) + callTag(T.cmax) + (T.odd ? V(`nudge → ${U(T.cmax.u - 1n)}`) : "") + V(`dmax = ${T.dmax}`)],
  ["\tif d = dmax / 10; d*10 >= dmin {", (T) => V(`d = ${T.d10}`) + V(`d·10 = ${T.d10 * 10n} ≥ ${T.dmin}?`) + B(T.branch === "zero")],
  ["\t\treturn trimZeros(d, -(p - 1))", (T) => V(`${T.untrimmed}·10^${-(T.p - 1)} → d = ${T.d}, p = ${T.q}`), (T) => T.branch === "zero"],
  ["\t}"],
  ["\tif d = dmin; d < dmax {", (T) => V(`d = ${T.dmin}`) + V(`${T.dmin} < ${T.dmax}?`) + B(T.branch === "round"), (T) => T.branch !== "zero"],
  ["\t\td = ⟦uscale(m, pre)⟧.round()", (T) => V(U(T.cm.u)) + callTag(T.cm) + V(`round → d = ${T.d}`), (T) => T.branch === "round"],
  ["\t}", null, (T) => T.branch !== "zero"],
  ["\treturn d, -p", (T) => V(`d = ${T.d}, p = ${T.q}`), (T) => T.branch !== "zero"],
  ["}"],
];

const FIXED_LINES = [
  ["func FixedWidth(f float64, n int) (d uint64, p int) {", (T) => V(`f = ${T.f}`) + V(`n = ${T.n}`)],
  ["\tm, e := unpack64(f)", (T) => V(`m = ${hx(T.m)}`) + V(`e = ${T.e}`)],
  ["\tp = n - 1 - log10Pow2(e+63)", (T) => V(`p = ${T.p0}`)],
  ["\tu := ⟦uscale(m, prescale(e, p, log2Pow10(p)))⟧", (T) => V(`s = ${T.s}`) + V(`u = ${U(T.u)}`) + callTag(T.call)],
  ["\td = u.round()", (T) => V(`d = ${T.d0}`)],
  ["\tif d >= uint64pow10[n] {", (T) => V(`${T.d0} ≥ 10^${T.n}?`) + B(T.div !== null)],
  ["\t\td, p = u.div(10).round(), p-1", (T) => V(`u.div(10) = ${U(T.div)}`) + V(`d = ${T.d}, p = ${T.p}`), (T) => T.div !== null],
  ["\t}"],
  ["\treturn d, -p", (T) => V(`d = ${T.d}, p = ${T.q}`)],
  ["}"],
];

const PARSE_LINES = [
  ["func Parse(d uint64, p int) float64 {", (T) => V(`d = ${T.d}`) + V(`p = ${T.p}`)],
  ["\tb := bits.Len64(d)", (T) => V(`b = ${T.b}`)],
  ["\tlp := log2Pow10(p)", (T) => V(`lp = ${T.lp}`)],
  ["\te := min(1074, 53-b-lp)", (T) => V(`e = ${T.e0}`)],
  ["\tu := ⟦uscale(d<<(64-b), prescale(e-(64-b), p, lp))⟧", (T) => V(`x = ${hx(T.x)}`) + V(`s = ${T.s}`) + V(`u = ${U(T.u0)}`) + callTag(T.call)],
  ["\ts := bool2[int](u >= unmin(1<<53))", (T) => V(`s = ${T.sh}`) + V(T.sh ? "54 bits: shift one more" : "fits in 53 bits")],
  ["\tu = (u >> s) | u&1", (T) => V(`u = ${U(T.u)}`)],
  ["\te = e - s", (T) => V(`e = ${T.e}`)],
  ["\treturn pack64(u.round(), -e)", (T) => V(`mant = ${T.mant}`) + (T.f === null ? V("overflow") : V(`f = ${T.f}`))],
  ["}"],
];

function codeHTML(lines, T, host) {
  const width = Math.max(...lines.map(([src]) => src.replace(/\t/g, "    ").replace(/[⟦⟧]/g, "").length));
  host.style.setProperty("--usm-codew", `${width + 1}ch`);
  return lines.map(([src, vals, active]) => {
    const on = active ? active(T) : true;
    const v = on && vals ? vals(T) : "";
    return `<div class="usm-line${on ? "" : " usm-off"}"><code class="usm-src">${callSpan(esc(src))}</code><span class="usm-vals">${v}</span></div>`;
  }).join("");
}

// toPrecision-style formatting of d·10^q with exactly n significant digits.
function precisionString(d, q, n) {
  const digits = d.toString().padStart(n, "0");
  const exp = q + digits.length - 1;
  if (exp < -6 || exp >= n) return `${digits[0]}${n > 1 ? `.${digits.slice(1)}` : ""}e${exp >= 0 ? "+" : "-"}${Math.abs(exp)}`;
  if (exp >= 0) return n > exp + 1 ? `${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}` : digits;
  return `0.${"0".repeat(-exp - 1)}${digits}`;
}

function initCode() {
  const tabs = { short: $("usm-tab-short"), fixed: $("usm-tab-fixed"), parse: $("usm-tab-parse") };
  const controls = $("usm-code-controls");
  const code = $("usm-code");
  const readout = $("usm-code-readout");
  const errEl = $("usm-code-error");
  const state = {
    tab: params.get("tab") in tabs ? params.get("tab") : "short",
    x: params.get("x") || "0.3",
    f: params.get("f") || "pi",
    n: Math.max(1, Math.min(18, Number(params.get("n")) || 15)),
    s: params.get("s") || "1e23",
  };

  function selectTab(name, focus) {
    state.tab = name;
    for (const [k, b] of Object.entries(tabs)) {
      b.setAttribute("aria-selected", String(k === name));
      b.tabIndex = k === name ? 0 : -1;
    }
    $("usm-panel").setAttribute("aria-labelledby", tabs[name].id);
    if (focus) tabs[name].focus();
    buildControls();
    render();
  }
  Object.entries(tabs).forEach(([name, b], i, all) => {
    b.addEventListener("click", () => selectTab(name));
    b.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      ev.preventDefault();
      const j = (i + (ev.key === "ArrowRight" ? 1 : all.length - 1)) % all.length;
      selectTab(all[j][0], true);
    });
  });

  let mark = () => {};
  function buildControls() {
    controls.innerHTML = "";
    const chipHost = document.createElement("span");
    chipHost.className = "lab-chips";
    chipHost.setAttribute("role", "group");
    chipHost.setAttribute("aria-label", "Presets");
    controls.append(chipHost);
    const form = document.createElement("form");
    form.className = "usm-form";
    if (state.tab === "short") {
      const items = [["0.3", "0.3"], ["0.1+0.2", "0.1+0.2"], ["2/3", "2/3"], ["2^89", "2^89"], ["5e-324", "5e-324"], ["1e23", "1e23"]].map(([label, x]) => ({ label, x }));
      form.innerHTML = `<label for="usm-short-in">f =</label><input id="usm-short-in" type="text" spellcheck="false" autocomplete="off" size="16"><button class="lab-button" type="submit">Run</button>
        <button class="lab-button" type="button" id="usm-prev" title="previous double">◀ double</button><button class="lab-button" type="button" id="usm-next" title="next double">double ▶</button>`;
      controls.append(form);
      const input = form.querySelector("input");
      input.value = state.x;
      mark = chips(chipHost, items, (it) => { state.x = it.x; input.value = it.x; render(); });
      form.addEventListener("submit", (ev) => { ev.preventDefault(); state.x = input.value.trim(); render(); });
      const step = (dir) => {
        let f;
        try { f = readDouble(state.x); } catch { return; }
        const b = M.bitsOf(f) + BigInt(dir);
        const g = M.fromBits(b);
        if (!Number.isFinite(g) || g <= 0) return;
        state.x = String(g); input.value = state.x; render();
      };
      form.querySelector("#usm-prev").addEventListener("click", () => step(-1));
      form.querySelector("#usm-next").addEventListener("click", () => step(+1));
    } else if (state.tab === "fixed") {
      const items = [{ label: "π, 15", f: "pi", n: 15 }, { label: "1.125, 3", f: "1.125", n: 3 }, { label: "9.999999, 3", f: "9.999999", n: 3 }, { label: "1.005, 3", f: "1.005", n: 3 }];
      form.innerHTML = `<label for="usm-fixed-in">f =</label><input id="usm-fixed-in" type="text" spellcheck="false" autocomplete="off" size="12">
        <label for="usm-fixed-n">n =</label><input id="usm-fixed-n" type="range" min="1" max="18" step="1"><output id="usm-fixed-n-out" for="usm-fixed-n"></output><button class="lab-button" type="submit">Run</button>`;
      controls.append(form);
      const fin = form.querySelector("#usm-fixed-in");
      const nin = form.querySelector("#usm-fixed-n");
      const nout = form.querySelector("#usm-fixed-n-out");
      mark = chips(chipHost, items, (it) => { state.f = it.f; state.n = it.n; fin.value = it.f; nin.value = it.n; nout.value = it.n; render(); });
      fin.value = state.f; nin.value = state.n; nout.value = state.n;
      nin.addEventListener("input", () => { state.n = Number(nin.value); nout.value = state.n; render(); });
      form.addEventListener("submit", (ev) => { ev.preventDefault(); state.f = fin.value.trim(); render(); });
    } else {
      const items = ["1e23", "0.1", "9007199254740993", "5e-324", "1.7976931348623157e308"].map((s) => ({ label: s, s }));
      form.innerHTML = `<label for="usm-parse-in">text =</label><input id="usm-parse-in" type="text" spellcheck="false" autocomplete="off" size="22"><button class="lab-button" type="submit">Parse</button>`;
      controls.append(form);
      const sin = form.querySelector("input");
      sin.value = state.s;
      mark = chips(chipHost, items, (it) => { state.s = it.s; sin.value = it.s; render(); });
      form.addEventListener("submit", (ev) => { ev.preventDefault(); state.s = sin.value.trim(); render(); });
    }
  }

  function fail(message) {
    showError(errEl, message);
    code.innerHTML = "";
    readout.innerHTML = "";
  }

  function render() {
    showError(errEl, "");
    if (state.tab === "short") {
      mark((it) => it.x === state.x);
      let f;
      try { f = readDouble(state.x); } catch (err) { return fail(`Cannot read “${state.x}”: ${err.message}.`); }
      const T = M.Short(f);
      code.innerHTML = codeHTML(SHORT_LINES, T, code);
      const str = M.jsString(T.d, T.q);
      const js = String(f);
      const n = T.dmax - T.dmin + 1n;
      const kase = T.branch === "zero"
        ? `the interval holds ${n} integer${n === 1n ? "" : "s"} from ${T.dmin} to ${T.dmax}, and ${T.d10 * 10n} ends in 0: drop that zero, then trim the rest`
        : T.branch === "single" ? `exactly one integer, ${T.dmin}, lies in the interval`
          : `${n} integers from ${T.dmin} to ${T.dmax}, none ending in 0: round the scaled value itself`;
      readout.innerHTML = `<p><code>Short(${esc(state.x)})</code> = ${T.d} · 10<sup>${T.q}</sup> → <strong>${str}</strong>. JavaScript prints <code>${js}</code> ${str === js ? '<span class="usm-good">✓</span>' : '<span class="usm-bad">✗</span>'}</p><p>Case: ${kase}.</p>`;
      setParams({ tab: null, x: state.x === "0.3" ? null : state.x, f: null, n: null, s: null });
    } else if (state.tab === "fixed") {
      mark((it) => it.f === state.f && it.n === state.n);
      let f;
      try { f = readDouble(state.f); } catch (err) { return fail(`Cannot read “${state.f}”: ${err.message}.`); }
      const T = M.FixedWidth(f, state.n);
      code.innerHTML = codeHTML(FIXED_LINES, T, code);
      const uu = T.div ?? T.u;
      const modes = [["floor", M.floorU], ["½ down", M.roundHalfDownU], ["½ even", M.roundU], ["½ up", M.roundHalfUpU], ["ceil", M.ceilU]]
        .map(([name, fn]) => `${name} ${fn(uu)}`).join(" · ");
      const ours = precisionString(T.d, T.q, state.n);
      const js = f.toPrecision(state.n);
      const tie = (uu & 3n) === 2n;
      readout.innerHTML = `<p><code>FixedWidth(${esc(state.f)}, ${state.n})</code> = ${T.d} · 10<sup>${T.q}</sup> → <strong>${ours}</strong>. JavaScript <code>toPrecision(${state.n})</code>: <code>${js}</code> ${ours === js ? '<span class="usm-good">✓</span>' : tie ? "(JavaScript breaks exact ties upward)" : '<span class="usm-bad">✗</span>'}</p>
        <p>The same unrounded ${U(uu)}, rounded five ways: ${modes}.${tie ? " An exact tie: only the rounding rule decides." : ""}</p>`;
      setParams({ tab: "fixed", x: null, f: state.f, n: state.n, s: null });
    } else {
      mark((it) => it.s === state.s);
      const dp = M.parseText(state.s);
      if (!dp) return fail(`Cox’s ParseText does not accept “${state.s}”: it wants digits, an optional point, an optional exponent of at most 3 digits, and at most 19 digits in all.`);
      if (dp.p < M.POW10_MIN || dp.p > M.POW10_MAX) return fail(`The exponent works out to p = ${dp.p}, outside the table [${M.POW10_MIN}, ${M.POW10_MAX}]; a real parser returns 0 or ∞ before calling Parse.`);
      const T = M.Parse(dp.d, dp.p);
      code.innerHTML = codeHTML(PARSE_LINES, T, code);
      const js = Number(state.s);
      if (T.f === null) {
        readout.innerHTML = `<p>The result overflows: the exponent field would exceed 2046. <code>Parse</code> leaves ±∞ to its caller; JavaScript gives <code>${js}</code>.</p>`;
      } else {
        const exactStr = M.exactDecimal(T.mant, -T.e);
        const tie = (T.u & 3n) === 2n;
        readout.innerHTML = `<p><code>Parse(${T.d}, ${T.p})</code> = ${T.mant} · 2<sup>${-T.e}</sup> = <code class="usm-long">${exactStr}</code>, the double <strong>${T.f}</strong>. JavaScript’s <code>Number("${esc(state.s)}")</code> ${Object.is(js, T.f) ? 'is the same double <span class="usm-good">✓</span>' : `gives ${js} <span class="usm-bad">✗</span>`}</p>
          ${tie ? `<p>${U(T.u)} is an exact tie between two doubles: round-half-even picks the even mantissa, ${T.mant}.</p>` : ""}`;
      }
      setParams({ tab: "parse", x: null, f: null, n: null, s: state.s });
    }
  }

  selectTab(state.tab, false);
}

// ------------------------------------------------------------------ §9 verify

function initVerify() {
  const btn = $("usm-verify-run");
  const bar = $("usm-verify-bar");
  const out = $("usm-verify-out");
  const prog = $("usm-verify-progress");
  const N = 100000;
  const start = (sync) => {
    btn.disabled = true;
    const acc = { n: 0, bad: 0, parseBad: 0, badExamples: [] };
    const next = M.makeRandomDoubles(Date.now() ^ 0x5bd1e995);
    const t0 = performance.now();
    const step = () => {
      M.verifyBatch(next, sync ? N : 2000, acc);
      bar.style.width = `${(100 * acc.n) / N}%`;
      prog.textContent = `${fmtInt(acc.n)} / ${fmtInt(N)}`;
      out.innerHTML = `<p>${fmtInt(acc.n)} random doubles: <strong>${fmtInt(acc.bad)}</strong> differ from <code>Number.prototype.toString</code>; <strong>${fmtInt(acc.parseBad)}</strong> fail to parse back with <code>Parse</code>.</p>`;
      if (acc.n < N) { setTimeout(step, 0); return; }
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      out.innerHTML += `<p>Done in ${secs} s (BigInt arithmetic in your browser; the Go original gets by with plain 64-bit multiplies).${acc.badExamples.length ? ` Failures: ${acc.badExamples.map((f) => `<code>${f}</code>`).join(", ")}` : ""}</p>`;
      btn.disabled = false;
      btn.textContent = "Verify another 100,000";
      prog.textContent = "done";
    };
    step();
  };
  btn.addEventListener("click", () => start(false));
  if (params.get("run") === "1") start(true); // for screenshots
}

// ------------------------------------------------------------------ boot

initTable();
initProduct();
initCounterexample();
initToy();
const loadExample = initOneMultiply();
initStats(loadExample);
initCode();
initVerify();
