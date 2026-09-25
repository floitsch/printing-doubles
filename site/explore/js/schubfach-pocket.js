// Pocket Schubfach: DOM and interaction. The math lives in schubfach-pocket-model.js.
import * as M from "./schubfach-pocket-model.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const keyOf = (dec) => `${dec.d}e${dec.e}`;
const plain = (dec) => M.decPlain(dec);
const pow10Label = (j) => M.decPlain({ d: 1n, e: j });
const sup = (n) => String(n).replace(/-/g, "−");

// ===========================================================================
// Act 1: the game
// ===========================================================================

const LESSONS = {
  "0.1": "Look at the tick counts. The ruler whose spacing is just larger than the interval holds at most one tick; the next finer ruler holds at least one. Coarser rulers only have ticks that are also ticks of that ruler, so its single tick 0.1000 was the only short candidate. Its trailing zeros show it is really 0.1.",
  "0.3": "This time the coarse tick sits just below v. Schubfach checks the coarse tick below v (u′) first, then the one above (w′). The interval is narrower than the coarse spacing, so both cannot be inside.",
  "1/3": "No coarse tick is inside, so the answer lies on the fine ruler. The fine ticks inside all have the same length, because none of them ends in 0 (that would make it a coarse tick). Only the two ticks around v can be the closest: 0.3332 and 0.3333. Both read back, and 0.3333 is closer.",
  "pi": "The fine ruler has two ticks inside, 3.140 and 3.141, but the coarse tick 3.14 is shorter and wins. The closest decimal does not matter until the coarse ruler comes up empty.",
  "2.375": "Here the fine ruler has exactly one tick inside, the minimum the pigeonhole principle guarantees. v happens to be a short decimal itself.",
  "2.083984375": "⌊V⌋ = 2083 is just outside the open left end, so only w = 2.084 remains. That is why Schubfach checks u and w separately instead of trusting ⌊V⌋.",
  "1": "A power of two: the neighbour below is only half as far away, so the interval reaches ¼ gap down and ½ gap up. The width is ¾·2^q instead of 2^q, and Schubfach takes k from that width.",
  "0.15625": "An exact tie: 0.1562 and 0.1563 are equally far from v = 0.15625. Schubfach picks the even last digit, as ECMAScript and Java do.",
  "4112": "The coarse tick 4110 sits exactly on the left end of the interval. c = 1028 is even, so the interval is closed: 4110 reads back as 4112, because the tie goes to the even significand. 4110 has three significant digits (411·10¹), so it beats 4112. Its neighbour 4108 has odd c and an open interval, so it has to print itself.",
};

const game = {
  rounds: M.ROUNDS.map((r) => newRound(r)),
  free: null,
  cur: 0,
  ruler: null,
  selected: null,
};

function newRound(r) {
  const info = M.roundInfo(r.input);
  return { ...r, info, checked: new Map(), order: [], printed: null, score: null };
}

const curRound = () => (game.cur === "free" ? game.free : game.rounds[game.cur]);

function setRound(idx, { ruler } = {}) {
  game.cur = idx;
  const r = curRound();
  const rulers = M.offeredRulers(r.info.tr);
  game.ruler = ruler !== undefined && rulers.includes(ruler) ? ruler : rulers[0];
  game.selected = r.printed ? keyOf(r.printed.dec) : null;
  renderGame();
}

function renderRoundChips() {
  const box = $("round-chips");
  box.innerHTML = game.rounds.map((r, i) => {
    const cls = r.score === null ? "" : r.printed.grade.correct ? "sfp-done" : "sfp-miss";
    const label = r.bonus ? `+${i - 6}` : String(i + 1);
    const title = r.bonus ? `Bonus round ${i - 6}: ${r.label}` : `Round ${i + 1}: ${r.label}`;
    return `<button type="button" class="${cls}" data-round="${i}" aria-pressed="${game.cur === i}" aria-label="${esc(title)}" title="${esc(title)}">${label}</button>`;
  }).join("") + (game.free ? `<button type="button" data-round="free" aria-pressed="${game.cur === "free"}">yours</button>` : "");
  box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    setRound(b.dataset.round === "free" ? "free" : Number(b.dataset.round));
  }));
  const played = game.rounds.filter((r) => r.score !== null);
  const you = played.reduce((a, r) => a + r.score, 0);
  const sf = played.reduce((a, r) => a + (10 - r.info.tr.checks.length), 0);
  $("score").innerHTML = played.length
    ? `Score <strong>${you}</strong> · Schubfach ${sf} · ${played.length}/${game.rounds.length} rounds`
    : `Score 0 · ${game.rounds.length} rounds (two bonus)`;
}

function renderGame() {
  const r = curRound();
  const { tr, exact, cq, x } = r.info;
  renderRoundChips();
  const idx = game.cur;
  const title = idx === "free" ? `Your number: ${esc(r.label)}`
    : r.bonus ? `Bonus ${idx - 6} · ${esc(r.label)}` : `Round ${idx + 1} · ${esc(r.label)}`;
  const inexact = M.cmp(x, M.valueOf(cq)) !== 0;
  $("round-head").innerHTML = `<h3>${title}</h3>
    <p>half precision stores <b>v = ${exact}</b>${inexact ? "" : " (exactly)"} · c = ${cq.c}, q = ${sup(cq.q)} · ${tr.closed ? "c even: closed [ ]" : "c odd: open ( )"}${tr.irregular ? " · power of two: lopsided" : ""}</p>`;
  const rulers = M.offeredRulers(tr);
  const chips = $("ruler-chips");
  chips.innerHTML = rulers.map((j) => `<button type="button" data-j="${j}" aria-pressed="${j === game.ruler}">${pow10Label(j)}</button>`).join("");
  chips.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    game.ruler = Number(b.dataset.j);
    renderGame();
  }));
  renderRuler();
  renderActions();
  renderDebrief();
}

function renderRuler() {
  const r = curRound();
  const { tr, cq, nb } = r.info;
  const box = $("ruler");
  const W = Math.max(300, Math.round(box.clientWidth || 700));
  const H = 196, padL = 16, padR = 16;
  const iv = M.intervalOf(cq);
  const width = M.rat(iv.vr.n * iv.vl.d - iv.vl.n * iv.vr.d, iv.vr.d * iv.vl.d);
  const lo = sub(iv.vl, scale(width, 3n, 5n));
  const span = scale(width, 11n, 5n); // window = 2.2 widths
  const X = (q) => padL + M.ratToNumber(div(sub(q, lo), span)) * (W - padL - padR);
  const yBase = 128, yBandTop = 38;
  const parts = [];
  const xl = X(iv.vl), xr = X(iv.vr);
  if (r.printed) {
    parts.push(`<rect class="sfp-band" x="${xl}" y="${yBandTop}" width="${xr - xl}" height="${yBase - yBandTop}"/>`);
    parts.push(edgePath(xl, yBandTop, yBase, "left", iv.closed), edgePath(xr, yBandTop, yBase, "right", iv.closed));
  } else {
    // Before printing, show only how wide the interval is (what the printer knows).
    const wpx = xr - xl, x0 = W - padR - wpx, yw = 12;
    parts.push(`<g class="sfp-widthbar"><path d="M${x0},${yw - 5} v10 M${x0},${yw} H${x0 + wpx} M${x0 + wpx},${yw - 5} v10"/><text x="${x0 - 6}" y="${yw + 4}" text-anchor="end">interval width</text></g>`);
    parts.push(`<rect class="sfp-fog" x="${padL}" y="${yBandTop}" width="${W - padL - padR}" height="${yBase - yBandTop}"/>`);
  }
  parts.push(`<line class="sfp-base" x1="${padL}" x2="${W - padR}" y1="${yBase}" y2="${yBase}"/>`);

  // Ticks of the chosen ruler.
  const j = game.ruler;
  const unit = M.pow10rat(j);
  const iStart = M.floorRat(div(lo, unit)) + 1n;
  const iEnd = M.floorRat(div(add(lo, span), unit));
  const n = Number(iEnd - iStart + 1n);
  const gap = M.ratToNumber(div(unit, span)) * (W - padL - padR);
  let note;
  if (n <= 0) {
    note = `no ${pow10Label(j)}-tick anywhere in this window`;
  } else if (gap < 11) {
    note = `${n} ticks in view: too dense to pick (and all longer than the ones on coarser rulers)`;
    if (n <= 1500) {
      const lines = [];
      for (let i = iStart; i <= iEnd; i++) {
        const x = X(M.rat(i * unit.n, unit.d));
        const tz = trailingZeros(i);
        lines.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yBase}" y2="${yBase - 6 - 7 * Math.min(tz, 3)}"/>`);
      }
      parts.push(`<g class="sfp-dense">${lines.join("")}</g>`);
    }
  } else {
    note = `spacing ${pow10Label(j)} · ${n} tick${n === 1 ? "" : "s"} in view`;
    const labelW = (Math.max(...[iStart, iEnd].map((i) => plain(M.normDec(i, j)).length)) * 6.8) + 8;
    const step = [1n, 2n, 5n, 10n, 20n, 50n, 100n].find((s) => Number(s) * gap >= labelW) || 100n;
    const hitW = Math.min(gap, 26);
    for (let i = iStart; i <= iEnd; i++) {
      const dec = M.normDec(i, j);
      const key = keyOf(dec);
      const x = X(M.rat(i * unit.n, unit.d));
      const tz = trailingZeros(i);
      const h = 14 + 8 * Math.min(tz, 3);
      const chk = r.checked.get(key);
      const selected = game.selected === key;
      const label = i % step === 0n ? `<text x="${x}" y="${yBase + 16}">${plain(dec)}</text>` : "";
      let mark = "";
      if (chk) {
        const my = yBase - h - 12;
        mark = `<circle class="${chk.ok ? "sfp-mark-ok" : "sfp-mark-bad"}" cx="${x}" cy="${my}" r="8"/><text class="sfp-mark-text ${chk.ok ? "ok" : "bad"}" x="${x}" y="${my + 3.5}">${chk.ok ? "✓" : "✗"}</text>`;
      }
      const aria = `${plain(dec)}, ${M.decDigits(dec)} significant digit${M.decDigits(dec) === 1 ? "" : "s"}${chk ? (chk.ok ? ", checked: reads back" : ", checked: does not read back") : ", press Enter to check"}`;
      parts.push(`<g class="sfp-tick${selected ? " sfp-selected" : ""}" tabindex="0" role="button" aria-label="${esc(aria)}" data-key="${key}" data-i="${i}">
        <rect class="sfp-hit" x="${x - hitW / 2}" y="${yBandTop - 14}" width="${hitW}" height="${yBase - yBandTop + 34}"/>
        <line x1="${x}" x2="${x}" y1="${yBase}" y2="${yBase - h}"/>${label}${mark}</g>`);
    }
  }
  parts.push(`<text class="sfp-note" x="${padL}" y="14">${esc(note)}</text>`);

  // Schubfach's candidates, after printing.
  if (r.printed) {
    for (const ch of tr.checks) {
      const pos = X(M.rat(ch.tick * M.pow10rat(tr.k).n, M.pow10rat(tr.k).d)); // ticks are in fine units
      const top = ch.coarse ? yBandTop - 6 : yBandTop + 10;
      parts.push(`<g class="sfp-cand${ch.in ? " in" : ""}"><line x1="${pos}" x2="${pos}" y1="${top + 4}" y2="${yBase}" stroke-dasharray="${ch.coarse ? "none" : "3 3"}"/><text x="${pos}" y="${top}">${ch.name}${ch.in ? "✓" : "✗"}</text></g>`);
    }
  }

  // The binary line: v and its neighbours.
  const yB = 168;
  const pts = r.printed ? [[nb.lo, "v⁻", "sfp-nb"], [cq, "v", "sfp-v"], [nb.hi, "v⁺", "sfp-nb"]] : [[cq, "v", "sfp-v"]];
  for (const [p, name, cls] of pts) {
    if (!p || p.c === 0n) continue;
    const x = X(M.valueOf(p));
    if (x < padL - 1 || x > W - padR + 1) continue;
    parts.push(`<circle class="${cls}" cx="${x}" cy="${yB}" r="${name === "v" ? 5 : 4}"/><text class="${name === "v" ? "sfp-vlabel" : "sfp-small"}" x="${x}" y="${yB + 22}" text-anchor="middle">${name}</text>`);
  }
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Rounding interval of v = ${esc(r.info.exact)} on a ruler with spacing ${pow10Label(j)}; ${esc(note)}.">${parts.join("")}</svg>`;
  box.querySelectorAll(".sfp-tick").forEach((g) => {
    g.addEventListener("click", () => onTick(g.dataset.key, BigInt(g.dataset.i)));
    g.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onTick(g.dataset.key, BigInt(g.dataset.i), true); }
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        ev.preventDefault();
        const sib = ev.key === "ArrowRight" ? g.nextElementSibling : g.previousElementSibling;
        if (sib && sib.classList.contains("sfp-tick")) sib.focus();
      }
    });
  });
}

function edgePath(x, y0, y1, side, closed) {
  const d = side === "left" ? 1 : -1;
  if (closed) {
    return `<path class="sfp-edge" d="M${x + 6 * d},${y0} H${x} V${y1} H${x + 6 * d}"/>`;
  }
  const mid = (y0 + y1) / 2;
  return `<path class="sfp-edge sfp-edge-open" d="M${x},${y0} V${y1}"/><path class="sfp-edge" d="M${x + 7 * d},${y0 + 4} Q${x - 2 * d},${mid} ${x + 7 * d},${y1 - 4}"/>`;
}

function trailingZeros(i) {
  if (i === 0n) return 3;
  let t = 0;
  while (i % 10n === 0n && t < 3) { i /= 10n; t++; }
  return t;
}
function sub(a, b) { return M.rat(a.n * b.d - b.n * a.d, a.d * b.d); }
function add(a, b) { return M.rat(a.n * b.d + b.n * a.d, a.d * b.d); }
function div(a, b) { return M.rat(a.n * b.d, a.d * b.n); }
function scale(a, num, den) { return M.rat(a.n * num, a.d * den); }

function onTick(key, i, keyboard = false) {
  const r = curRound();
  const dec = M.normDec(i, game.ruler);
  if (!r.printed && !r.checked.has(key)) {
    const rb = M.readBack(dec, r.info.cq);
    r.checked.set(key, { dec, ...rb });
    r.order.push(key);
  }
  game.selected = key;
  renderRuler();
  renderActions();
  if (keyboard) {
    const g = $("ruler").querySelector(`[data-key="${key}"]`);
    if (g) g.focus();
  }
}

function renderActions() {
  const r = curRound();
  const box = $("actions");
  const n = r.checked.size;
  const cost = `<span>checks so far: <strong>${n}</strong></span>`;
  if (r.printed) {
    box.innerHTML = `<span class="sfp-sel">You printed <strong>${plain(r.printed.dec)}</strong> after ${n} check${n === 1 ? "" : "s"}.</span>
      <button class="lab-button" type="button" id="replay">Play again</button>
      ${nextRoundIndex() !== null ? `<button class="lab-button primary" type="button" id="next-round">Next round</button>` : ""}`;
    $("replay").addEventListener("click", () => {
      const fresh = newRound(r);
      if (game.cur === "free") game.free = fresh; else game.rounds[game.cur] = fresh;
      setRound(game.cur, { ruler: game.ruler });
    });
    const nx = $("next-round");
    if (nx) nx.addEventListener("click", () => { setRound(nextRoundIndex()); $("game").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
    return;
  }
  const sel = game.selected && r.checked.get(game.selected);
  if (!sel) {
    box.innerHTML = `${cost}<span>Click a tick to check it.</span>`;
    return;
  }
  const dist = M.decToRat(sel.dec);
  const v = M.valueOf(r.info.cq);
  const dd = sub(dist, v);
  const absd = dd.n < 0n ? M.rat(-dd.n, dd.d) : dd;
  const digits = M.decDigits(sel.dec);
  const status = sel.ok
    ? `reads back as v ✓ · distance to v ${M.ratToDecimalString(absd, 30)}`
    : `reads back as ${sel.backString} ✗`;
  box.innerHTML = `${cost}<span class="sfp-sel"><strong>${plain(sel.dec)}</strong> · ${digits} significant digit${digits === 1 ? "" : "s"} · ${status}</span>
    <button class="lab-button primary" type="button" id="print-btn" ${sel.ok ? "" : "disabled"}>Print ${plain(sel.dec)}</button>`;
  $("print-btn").addEventListener("click", () => doPrint(sel.dec));
}

function nextRoundIndex() {
  if (game.cur === "free") return null;
  return game.cur + 1 < game.rounds.length ? game.cur + 1 : null;
}

function doPrint(dec, focus = true) {
  const r = curRound();
  const grade = M.grade(dec, r.info.tr);
  r.printed = { dec, grade };
  r.score = grade.correct ? Math.max(0, 10 - r.checked.size) : 0;
  if (game.cur === "free") r.score = null; // free play does not count
  renderGame();
  const main = game.rounds.slice(0, 7);
  if (main.every((x) => x.printed)) $("spoiler").open = true;
  if (focus) $("debrief").focus({ preventScroll: false });
}

function renderDebrief() {
  const r = curRound();
  const box = $("debrief");
  if (!r.printed) { box.hidden = true; box.innerHTML = ""; return; }
  const { tr } = r.info;
  const g = r.printed.grade;
  const answer = tr.result;
  const par = tr.checks.length;
  const you = r.checked.size;
  let head;
  if (g.correct) head = `Correct: ${plain(answer)}`;
  else head = `Not quite: the answer is ${plain(answer)}`;
  let why = "";
  if (g.why === "longer") why = `<p>${plain(r.printed.dec)} reads back, but ${plain(answer)} also reads back and has fewer significant digits (${M.decDigits(answer)} vs ${M.decDigits(r.printed.dec)}).</p>`;
  if (g.why === "farther") why = `<p>${plain(r.printed.dec)} reads back and is just as short as ${plain(answer)}, but ${tr.closer === "tie" ? "on an exact tie the even last digit wins" : `${plain(answer)} is closer to v`}.</p>`;
  const pts = r.score === null ? "" : ` → ${r.score} point${r.score === 1 ? "" : "s"}`;
  const rulers = M.offeredRulers(tr);
  const census = rulers.map((j) => {
    const cnt = M.countInside(tr, j);
    const cls = j === tr.k + 1 ? "sfp-coarse" : j === tr.k ? "sfp-fine" : "";
    const tag = j === tr.k + 1 ? "<small>coarse: ≤ 1</small>" : j === tr.k ? "<small>fine: ≥ 1</small>" : "";
    return `<li class="${cls}">${tag}${pow10Label(j)}: <b>${cnt}</b></li>`;
  }).join("");
  const unitDec = (tick) => plain(M.normDec(tick, tr.k));
  const checks = tr.checks.map((c) => {
    const where = c.coarse ? "coarse tick" : "fine tick";
    return `<li class="${c.in ? "ok" : "bad"}">${c.name} = ${unitDec(c.tick)} (${where} ${c.name.startsWith("u") ? "below" : "above"} v): ${c.in ? "inside ✓" : "outside ✗"}</li>`;
  }).join("");
  let closer = "";
  if (tr.closer) {
    const V2 = M.ratFixed(tr.V, 4);
    closer = `<li class="ok">both inside; V = ${V2} in fine units, so ${tr.closer === "tie" ? `an exact tie → the even one` : `${tr.closer} is closer`} → ${plain(answer)}</li>`;
  }
  const widthStr = M.ratToDecimalString(tr.width, 40);
  const lesson = LESSONS[r.input] || genericLesson(tr);
  box.hidden = false;
  box.innerHTML = `<h4>${head}</h4>
    <p>You: ${you} check${you === 1 ? "" : "s"}${g.correct ? pts : " → 0 points"}. Schubfach: ${par} check${par === 1 ? "" : "s"}${r.score === null ? "" : ` → ${10 - par} points`}.</p>
    ${why}${g.correct && you < par ? `<p>You beat the printer here by reading the picture. The printer only knows v and the width. With that alone it never needs more than four checks, whatever the number.</p>` : ""}
    <p class="sfp-mono">width = ${widthStr} → k = ${sup(tr.k)}: fine ruler ${pow10Label(tr.k)}, coarse ruler ${pow10Label(tr.k + 1)}</p>
    <p>Ticks inside the interval, per ruler:</p>
    <ul class="sfp-census">${census}</ul>
    <p>Schubfach's checks, in order:</p>
    <ul class="sfp-checks">${checks}${closer}</ul>
    <p>${esc(lesson)}</p>`;
}

function genericLesson(tr) {
  if (tr.path.startsWith("u′") || tr.path.startsWith("w′")) return `One coarse tick is inside, so it is the shortest answer. After removing trailing zeros it prints as ${plain(tr.result)}.`;
  if (tr.closer === "tie") return "An exact tie between the two fine ticks: the even one wins.";
  if (tr.closer) return "No coarse tick is inside. Both fine ticks next to v read back, so the closer one wins.";
  return "No coarse tick is inside, and only one of the two fine ticks next to v reads back.";
}

function initGame() {
  $("free-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = $("free-input").value;
    playFree(text);
  });
  let start = 0;
  const pr = Number(params.get("round"));
  if (pr >= 1 && pr <= game.rounds.length) start = pr - 1;
  const h = params.get("h");
  if (h && playFree(h, false)) start = "free";
  const ruler = params.has("ruler") ? Number(params.get("ruler")) : undefined;
  setRound(start, { ruler });
  const pr2 = params.get("print");
  if (pr2) {
    const x = M.parseRational(pr2);
    const r = curRound();
    if (x) {
      // find the decimal as d*10^e
      const str = pr2.trim();
      const m = str.match(/^(\d*)(?:\.(\d*))?$/);
      if (m) {
        const f = m[2] || "";
        const dec = M.normDec(BigInt((m[1] || "") + f || "0"), -f.length);
        const rb = M.readBack(dec, r.info.cq);
        r.checked.set(keyOf(dec), { dec, ...rb });
        if (rb.ok) doPrint(dec, false);
      }
    }
  }
  if (params.get("reveal") === "1") $("spoiler").open = true;
  let lastW = $("ruler").clientWidth;
  window.addEventListener("resize", () => {
    const w = $("ruler").clientWidth;
    if (w !== lastW) { lastW = w; renderRuler(); }
  });
}

function playFree(text, render = true) {
  const info = M.roundInfo(text);
  const msg = $("free-msg");
  if (info.error) { msg.textContent = info.error; return false; }
  msg.textContent = "";
  game.free = { input: text, label: text.trim(), info, checked: new Map(), order: [], printed: null, score: null };
  if (render) setRound("free");
  return true;
}

// Exhaustive binary16 check.
function initVerify() {
  $("verify-all").addEventListener("click", () => {
    const btn = $("verify-all");
    btn.disabled = true;
    const out = $("verify-out");
    const it = M.allValues(M.HALF);
    let n = 0, bad = 0, noRt = 0;
    const paths = {};
    const step = () => {
      for (let i = 0; i < 1500; i++) {
        const nx = it.next();
        if (nx.done) {
          const list = Object.entries(paths).sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p}: ${c}`).join(" · ");
          out.innerHTML = `Checked <strong>${n.toLocaleString("en-US")}</strong> values. Different from brute force: <strong>${bad}</strong>. Not reading back: <strong>${noRt}</strong>.<br>Where the answer came from: ${list}.`;
          btn.disabled = false;
          return;
        }
        const cq = nx.value;
        const tr = M.schubfachExact(cq, M.HALF);
        const o = M.shortestOracle(cq, M.HALF);
        n++;
        if (!M.decEq(tr.result, o)) bad++;
        if (!M.readBack(tr.result, cq).ok) noRt++;
        const p = tr.path.replace(/ \(closer\)/, " (both in, closer)");
        paths[p] = (paths[p] || 0) + 1;
      }
      out.textContent = `Checking… ${n.toLocaleString("en-US")} / 31,743`;
      setTimeout(step, 0);
    };
    step();
  });
}

// ===========================================================================
// Act 2: round to odd demo
// ===========================================================================

function initRoDemo() {
  const input = $("ro-x");
  const render = () => {
    const hund = Math.round(Number(input.value) * 100);
    const x = hund / 100;
    const fl = Math.floor(hund / 100);
    const isInt = hund % 100 === 0;
    const ro = isInt && fl % 2 === 0 ? fl : fl | 1;
    $("ro-x-out").textContent = x.toFixed(2);
    const W = Math.max(300, $("ro-svg").clientWidth || 600), H = 92, pad = 22;
    const X = (t) => pad + (t / 8) * (W - 2 * pad);
    const parts = [`<line class="sfp-base" x1="${pad}" x2="${W - pad}" y1="54" y2="54" stroke="currentColor"/>`];
    for (let j = 0; j <= 8; j++) {
      if (j % 2 === 0) {
        parts.push(`<line class="sfp-q-exact" x1="${X(j)}" x2="${X(j)}" y1="38" y2="62"/><text class="sfp-q-label" x="${X(j)}" y="78">${j}</text>`);
      } else {
        parts.push(`<rect class="sfp-q-half" x="${X(j - 1) + 4}" y="42" width="${X(j + 1) - X(j - 1) - 8}" height="8" rx="4"/><line class="sfp-q-odd" x1="${X(j)}" x2="${X(j)}" y1="44" y2="62"/><text class="sfp-q-label" x="${X(j)}" y="78">${j}</text>`);
      }
    }
    parts.push(`<circle class="sfp-q-true" cx="${X(x)}" cy="54" r="5"/>`);
    parts.push(`<path class="sfp-q-est" d="M${X(ro) - 6},${22} h12 l-6,10 z"/><text class="sfp-q-target-label" x="${X(ro)}" y="16">ro</text>`);
    parts.push(`<path fill="var(--muted)" d="M${X(fl) - 5},${92 - 4} h10 l-5,-8 z"/>`);
    $("ro-svg").innerHTML = `<svg viewBox="0 0 ${W} ${H + 4}" role="img" aria-label="x = ${x.toFixed(2)} on a line from 0 to 8; round to odd gives ${ro}, truncation gives ${fl}.">${parts.join("")}</svg>`;
    const rows = [2, 4, 6].map((t) => {
      const rel = (a, b) => (a < b ? "<" : a > b ? ">" : "=");
      const truth = rel(hund, t * 100), rr = rel(ro, t), tt = rel(fl, t);
      return `x ${truth} ${t} &nbsp; ro: ${ro} ${rr} ${t} ${rr === truth ? "✓" : "✗"} &nbsp; truncation: ${fl} ${tt} ${t} ${tt === truth ? "✓" : "<strong>✗</strong>"}`;
    });
    $("ro-readout").innerHTML = `x = ${x.toFixed(2)} → ⌊x⌋ = ${fl}${isInt ? " (x is an integer)" : ", x is not an integer"} → ro(x) = ${ro}${ro % 2 ? " (odd: “strictly between " + (ro - 1) + " and " + (ro + 1) + "”)" : " (even: exact)"}<br>${rows.join("<br>")}`;
  };
  input.addEventListener("input", render);
  window.addEventListener("resize", render);
  render();
}

// ===========================================================================
// Act 2: the honest ruler on real doubles
// ===========================================================================

const PRESETS = [
  { label: "1.4430606624460001e122", v: 1.4430606624460001e122 },
  { label: "18014398509481988", v: 18014398509481988 },
  { label: "1476640867921609.25", v: 1476640867921609.25 },
  { label: "0.3", v: 0.3 },
  { label: "0.1+0.2", v: 0.1 + 0.2 },
  { label: "1e23", v: 1e23 },
  { label: "2^-10", v: 2 ** -10 },
  { label: "5e-324", v: 5e-324 },
];
const honest = { v: PRESETS[0].v, mode: "trunc" };

function initHonest() {
  const px = params.get("x");
  if (px !== null) {
    const v = Number(px);
    if (Number.isFinite(v) && v > 0) honest.v = v;
  }
  if (M.MODES[params.get("mode")]) honest.mode = params.get("mode");
  if (params.get("bits") === "1") $("bits-details").open = true;
  $("x-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = $("x-input").value.trim();
    const v = Number(text);
    if (!text || !Number.isFinite(v) || v <= 0) { $("x-msg").textContent = "Type a positive finite number."; return; }
    $("x-msg").textContent = "";
    honest.v = v;
    renderHonest();
  });
  $("mode-chips").innerHTML = Object.entries(M.MODES).map(([k, label]) => `<button type="button" data-mode="${k}">${label}</button>`).join("");
  $("mode-chips").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { honest.mode = b.dataset.mode; renderHonest(); }));
  $("x-chips").innerHTML = PRESETS.map((p, i) => `<button type="button" data-i="${i}">${p.label}</button>`).join("");
  $("x-chips").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { honest.v = PRESETS[Number(b.dataset.i)].v; renderHonest(); }));
  $("bits-details").addEventListener("toggle", renderBits);
  window.addEventListener("resize", () => renderQuarterRows());
  renderHonest();
}

let honestCache = null;
function renderHonest() {
  const v = honest.v;
  const ex = M.exact64(v);
  const fa = M.fast64(v, honest.mode);
  const ro = M.fast64(v, "ro");
  honestCache = { v, ex, fa, ro };
  $("x-input").value = String(v);
  $("mode-chips").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === honest.mode)));
  $("x-chips").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(PRESETS[Number(b.dataset.i)].v === v)));
  $("honest-head").innerHTML = `v = <strong>${String(v)}</strong> · c = ${fa.c} (${fa.out ? "odd: open" : "even: closed"}) · q = ${sup(fa.q)}${fa.irregular ? " · power of two" : ""}<br>k = ${sup(fa.k)} · h = ${fa.h} · g = 0x${fa.g.toString(16)} · s = ⌊V⌋ = ${fa.s}`;
  renderQuarterRows();
  renderTests();
  renderBits();
}

function targetsFor(fa) {
  const coarse = fa.s >= 10n;
  const sp10 = (fa.s / 10n) * 10n;
  return {
    Vl: [...(coarse ? [["4u′", sp10 << 2n]] : []), ["4u", fa.s << 2n]],
    V: [["2(u+w)", (fa.s << 2n) + 2n]],
    Vr: [["4w", (fa.s + 1n) << 2n], ...(coarse ? [["4w′", (sp10 + 10n) << 2n]] : [])],
  };
}

function renderQuarterRows() {
  if (!honestCache) return;
  const { ex, fa } = honestCache;
  const box = $("quarter-rows");
  const W = Math.max(300, box.clientWidth || 700);
  const tg = targetsFor(fa);
  const rows = [
    ["Vℓ", ex.Vl, fa.vbl, tg.Vl],
    ["V", ex.V, fa.vb, tg.V],
    ["Vr", ex.Vr, fa.vbr, tg.Vr],
  ];
  box.innerHTML = rows.map(([name, X, est, targets]) => quarterRow(name, X, est, targets, W)).join("");
}

function quarterRow(name, X, est, targets, W) {
  const H = 84, pad = 18;
  const exactRo = M.roExact(X);
  const x4 = M.rat(4n * X.n, X.d);
  const m = M.floorRat(x4);
  const base = m - 3n; // window [m-3, m+4]
  const U = 7;
  const pos = (j) => pad + (Number(j - base) / U) * (W - 2 * pad);
  const posR = (r) => pad + (M.ratToNumber(M.rat(r.n - base * r.d, r.d)) / U) * (W - 2 * pad);
  const parts = [`<line x1="${pad}" x2="${W - pad}" y1="52" y2="52" stroke="var(--ink)"/>`];
  for (let j = base; j <= base + BigInt(U); j++) {
    if ((j & 1n) === 0n) {
      parts.push(`<line class="sfp-q-exact" x1="${pos(j)}" x2="${pos(j)}" y1="38" y2="62"/><text class="sfp-q-label" x="${pos(j)}" y="78">${quarterLabel(j)}</text>`);
    } else {
      const x0 = Math.max(pad, pos(j - 1n) + 4), x1 = Math.min(W - pad, pos(j + 1n) - 4);
      parts.push(`<rect class="sfp-q-half" x="${x0}" y="40" width="${x1 - x0}" height="8" rx="4"/><line class="sfp-q-odd" x1="${pos(j)}" x2="${pos(j)}" y1="44" y2="60"/>`);
    }
  }
  const byPos = new Map();
  for (const [label, t] of targets) {
    if (t < base || t > base + BigInt(U)) continue;
    byPos.set(t, byPos.has(t) ? `${byPos.get(t)} = ${label}` : label);
  }
  for (const [t, label] of byPos) {
    parts.push(`<line class="sfp-q-target" x1="${pos(t)}" x2="${pos(t)}" y1="14" y2="66"/><text class="sfp-q-target-label" x="${pos(t)}" y="11">${label}</text>`);
  }
  parts.push(`<circle class="sfp-q-true" cx="${posR(x4)}" cy="52" r="5"/>`);
  const wrong = est !== exactRo;
  if (est >= base && est <= base + BigInt(U)) {
    const xe = pos(est);
    parts.push(`<path class="${wrong ? "sfp-q-est-bad" : "sfp-q-est"}" d="M${xe - 7},20 h14 l-7,12 z"/>`);
  }
  const d2 = M.log2DistToInteger(X);
  const dist = d2 === -Infinity ? `2${name} is an exact integer` : `2${name} is 2<sup>${d2.toFixed(2).replace("-", "−")}</sup> from the nearest integer`;
  const modeName = M.MODES[honest.mode];
  const verdict = wrong
    ? `<span class="bad">${est} ✗ (exact ro is ${exactRo}: ${(exactRo & 1n) ? "not exact" : "exact"}, but the estimate says ${(est & 1n) ? "not exact" : "exact"})</span>`
    : `${est} ✓`;
  return `<div class="sfp-q-row"><p>${name} = ${M.ratFixed(X, 3)} · 4${name} = ${M.ratFixed(x4, 3)} · ${dist}</p>
    <p>${modeName}: ${verdict}</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Quarter ruler around 4${name}: true value ${M.ratFixed(x4, 3)}, estimate ${est}${wrong ? ", which is wrong" : ""}.">${parts.join("")}</svg></div>`;
}

function quarterLabel(j) {
  // j is 4X; label X = j/4 by its last digits.
  const ip = j >> 2n;
  const frac = Number(j & 3n);
  const last = ip.toString().slice(-3);
  const pre = ip.toString().length > 3 ? "…" : "";
  return `${pre}${last}${frac === 2 ? ".5" : frac === 0 ? "" : frac === 1 ? ".25" : ".75"}`;
}

function renderTests() {
  const { v, ex, fa } = honestCache;
  const out = fa.out;
  const roL = M.roExact(ex.Vl), roV = M.roExact(ex.V), roR = M.roExact(ex.Vr);
  const s = fa.s, t = s + 1n;
  const sp10 = (s / 10n) * 10n, tp10 = sp10 + 10n;
  const yes = (b) => (b ? "yes" : "no");
  const rows = [];
  if (s >= 10n) {
    rows.push(["u′ inside?", `vbℓ + out ≤ 4·${sp10}`, `${fa.vbl} + ${out} ≤ ${sp10 << 2n}`, fa.vbl + out <= sp10 << 2n, roL + out <= sp10 << 2n]);
    rows.push(["w′ inside?", `4·${tp10} + out ≤ vbr`, `${tp10 << 2n} + ${out} ≤ ${fa.vbr}`, (tp10 << 2n) + out <= fa.vbr, (tp10 << 2n) + out <= roR]);
  }
  rows.push(["u inside?", `vbℓ + out ≤ 4·${s}`, `${fa.vbl} + ${out} ≤ ${s << 2n}`, fa.vbl + out <= s << 2n, roL + out <= s << 2n]);
  rows.push(["w inside?", `4·${t} + out ≤ vbr`, `${t << 2n} + ${out} ≤ ${fa.vbr}`, (t << 2n) + out <= fa.vbr, (t << 2n) + out <= roR]);
  const rel = (a, b) => (a < b ? "<" : a > b ? ">" : "=");
  rows.push(["v closer to u or w?", "vb vs 4s + 2", `${fa.vb} vs ${(s << 2n) + 2n}`, rel(fa.vb, (s << 2n) + 2n), rel(roV, (s << 2n) + 2n)]);
  const fmt = (b) => (typeof b === "boolean" ? yes(b) : b);
  const body = rows.map(([q, formula, nums, got, want]) => `<tr class="${got !== want ? "mismatch" : ""}"><td>${q}</td><td>${nums}</td><td>${formula}</td><td>${fmt(got)}</td><td>${fmt(want)}${got !== want ? " ✗" : ""}</td></tr>`).join("");
  const want = String(v);
  const text = fa.text;
  const back = Number(text);
  const rt = back === v;
  let where = "";
  if (!rt) {
    const steps = Number(bitsOf(back) - bitsOf(v));
    where = ` It parses as the double ${Math.abs(steps)} step${Math.abs(steps) === 1 ? "" : "s"} ${steps > 0 ? "above" : "below"} v${Number.isFinite(back) ? ` (exactly ${exactShort(back)})` : ""}.`;
  }
  const verdict = text === want
    ? `Prints <strong>${text}</strong> ✓ (the correct shortest, then closest, output)`
    : rt
      ? `Prints <strong>${text}</strong> ✗ It reads back, but it is not the right choice: the correct output is ${want}.`
      : `Prints <strong>${text}</strong> ✗ It does not read back.${where} The correct output is ${want}.`;
  $("honest-tests").innerHTML = `<div class="sfp-table-wrap"><table>
    <thead><tr><th scope="col">Question</th><th scope="col">With the estimates</th><th scope="col">Test</th><th scope="col">Answer</th><th scope="col">Exact answer</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <div class="sfp-verdict${text === want ? "" : " bad"}">${verdict} Path: ${fa.path}.</div>`;
}

function exactShort(x) {
  // Exact value of a double, abbreviated when long.
  const dec = M.ratToDecimalString(M.valueOf(M.decompose64(x)), 1200);
  return dec.length > 40 ? `${dec.slice(0, 24)}…(${dec.replace(".", "").length} digits)` : dec;
}

const dvw = new DataView(new ArrayBuffer(8));
function bitsOf(x) { dvw.setFloat64(0, x); return dvw.getBigUint64(0); }

function renderBits() {
  if (!$("bits-details").open || !honestCache) return;
  const { fa } = honestCache;
  const mode = honest.mode;
  const rows = [["c̄ℓ", fa.cbl, fa.pl, fa.vbl], ["c̄", fa.cb, fa.p, fa.vb], ["c̄r", fa.cbr, fa.pr, fa.vbr]];
  const html = rows.map(([name, cbar, p, est]) => {
    const bin = p.toString(2).padStart(128, "0");
    const hi = bin.slice(0, bin.length - 127);
    const mid = bin.slice(bin.length - 127, bin.length - 64);
    const lo = bin.slice(bin.length - 64);
    const midZero = !/1/.test(mid);
    const loZero = !/1/.test(lo);
    const note = mode === "ro"
      ? (midZero ? "bits 64–126 all zero → sticky 0" : "bits 64–126 not all zero → sticky 1")
      : mode === "naive"
        ? (midZero && loZero ? "all low bits zero → sticky 0" : "some low bit set → sticky 1")
        : "truncation: low bits dropped";
    return `<div class="sfp-bitrow"><p>(${name}·2<sup>${fa.h}</sup>) · g = ${cbar << BigInt(fa.h)} · g, ${bin.length} bits · ⌊4X′⌋ = ${p >> 127n} · ${note} → ${est}</p>
      <div class="sfp-bitstr"><span class="hi">${hi}</span><span class="mid${midZero ? " zero" : ""}">${mid}</span><span class="lo">${lo}</span></div></div>`;
  }).join("");
  $("bits").innerHTML = `<div class="sfp-bitlegend"><span class="hi">bits ≥ 127: ⌊4X′⌋</span><span class="mid">bits 64–126: sticky (ro′)</span><span class="lo">bits 0–63: dust, ignored by ro′</span></div>${html}`;
}

// ===========================================================================
// Fuzzer
// ===========================================================================

function initFuzz() {
  const tbody = $("fuzz-table").querySelector("tbody");
  const draw = (stats, n) => {
    tbody.innerHTML = Object.entries(M.MODES).map(([k, label]) => {
      const st = stats[k];
      if (!n) return `<tr><th scope="row">${label}</th><td>—</td><td>—</td><td>not run yet</td></tr>`;
      const pct = (x) => (n ? ` (${((100 * x) / n).toFixed(x && x / n < 0.001 ? 3 : 2)}%)` : "");
      const ex = st.example ? `${st.example.v} → ${st.example.got}${st.example.rt ? "" : " (doesn't read back)"}` : "—";
      return `<tr><th scope="row">${label}</th><td class="${st.wrong ? "nonzero" : "zero"}">${st.wrong.toLocaleString("en-US")}${pct(st.wrong)}</td><td class="${st.noRoundTrip ? "nonzero" : "zero"}">${st.noRoundTrip.toLocaleString("en-US")}${pct(st.noRoundTrip)}</td><td>${ex}</td></tr>`;
    }).join("");
  };
  const empty = () => Object.fromEntries(Object.keys(M.MODES).map((k) => [k, { wrong: 0, noRoundTrip: 0, example: null }]));
  draw(empty(), 0);
  const run = () => {
    const total = Number($("fuzz-n").value);
    const btn = $("fuzz-run");
    btn.disabled = true;
    const stats = empty();
    let done = 0;
    const chunk = () => {
      const size = Math.min(2000, total - done);
      const vals = Array.from({ length: size }, () => M.randomDouble());
      const st = M.fuzz(vals);
      for (const k of Object.keys(stats)) {
        stats[k].wrong += st[k].wrong;
        stats[k].noRoundTrip += st[k].noRoundTrip;
        if (st[k].example && (!stats[k].example || (stats[k].example.rt && !st[k].example.rt))) stats[k].example = st[k].example;
      }
      done += size;
      draw(stats, done);
      $("fuzz-progress").textContent = `${done.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} doubles`;
      if (done < total) setTimeout(chunk, 0);
      else btn.disabled = false;
    };
    chunk();
  };
  $("fuzz-run").addEventListener("click", run);
  const pf = Number(params.get("fuzz"));
  if (pf > 0) { $("fuzz-n").value = [...$("fuzz-n").options].some((o) => o.value === String(pf)) ? String(pf) : "10000"; run(); }
}

initGame();
initVerify();
initRoDemo();
initHonest();
initFuzz();
