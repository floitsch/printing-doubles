// Copyright (C) 2026 Toit contributors.
import { interval, grid, closest, contains, dragonSteps, decimal, rightEndpoint } from "./one-number-model.js";

const fmt = (n) => Number(n.toFixed(8)).toString();
const tag = (ok) => `<span class="lesson-verdict ${ok ? "fits" : "misses"}">${ok ? "inside" : "outside"}</span>`;
const caption = (text) => `<p class="lesson-caption">${text}</p>`;
const svg = (label, height, body) => `<svg viewBox="0 0 640 ${height}" role="img" aria-label="${label}">${body}</svg>`;
const line = (x1, y1, x2, y2, cls = "") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}"/>`;
const text = (x, y, value, cls = "", anchor = "middle") => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${value}</text>`;
const circle = (x, y, cls = "", r = 5) => `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
const rect = (x, y, width, height, cls) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" class="${cls}"/>`;

function setup(host, controls, render) {
  host.innerHTML = `<p class="lesson-label">Worked miniature · 8 significant binary bits</p>${controls}<div class="lesson-scene"></div><div class="lesson-result" aria-live="polite" aria-atomic="true"></div>`;
  const scene = host.querySelector(".lesson-scene");
  const result = host.querySelector(".lesson-result");
  const update = () => render(scene, result);
  host.addEventListener("input", update);
  host.addEventListener("change", update);
  update();
  return update;
}

function destination(host) {
  setup(host, "", (scene, result) => {
    const x = (v) => 50 + (v - 6.24) / .08 * 540;
    const i = interval();
    scene.innerHTML = svg("6.27, 6.28 and 6.29 are inside the parsing interval; 6.28 is nearest the stored value", 225,
      rect(x(i.lower / 64), 45, x(i.upper / 64) - x(i.lower / 64), 100, "lesson-band") +
      line(35, 145, 610, 145, "lesson-axis") +
      [6.25, 6.28125, 6.3125].map((v, j) => line(x(v), 38, x(v), 60, "lesson-binary") + circle(x(v), 45, "lesson-binary") + text(x(v), 25, fmt(v), "lesson-blue")).join("") +
      [626, 627, 628, 629, 630].map((n) => {
        const yes = contains(201, n, 2);
        return circle(x(n / 100), 145, yes ? "lesson-hit" : "lesson-miss") + text(x(n / 100), 171, decimal(n, 2)) + text(x(n / 100), 191, yes ? "inside" : "outside", "lesson-small");
      }).join("") +
      [i.lower, i.upper].map((v) => line(x(v / 64), 62, x(v / 64), 126, "lesson-edge") + circle(x(v / 64), 126, "lesson-open", 4)).join("")) +
      caption("Blue dots: stored binary values. Lower dots: decimal choices. The green band is the rounding interval.");
    result.innerHTML = `<strong>6.28 rounds back to 6.28125.</strong><p>Every decimal strictly between 6.265625 and 6.296875 rounds to our stored value. Of the shortest choices inside, 6.28 is closest.</p>`;
  });
}

function dragon(host) {
  let step = 0;
  const rows = dragonSteps();
  const update = setup(host, `<div class="lesson-controls"><button type="button" data-action="back">Previous digit</button><button type="button" data-action="next">Reveal next digit</button></div>`, (scene, result) => {
    const s = rows[step];
    const arithmeticOpen = scene.querySelector("details")?.open;
    host.querySelector('[data-action="back"]').disabled = step === 0;
    host.querySelector('[data-action="next"]').disabled = step === rows.length - 1;
    const prefix = decimal(s.prefix, s.places);
    const exact = "6.28125";
    const length = step === 0 ? 1 : step + 2;
    const upper = decimal(s.prefix + 1, s.places);
    const distanceDown = fmt(s.remainder / (64 * 10 ** s.places));
    const distanceUp = fmt((64 - s.remainder) / (64 * 10 ** s.places));
    scene.innerHTML = `<div class="lesson-digit-tape" aria-label="Digits written so far: ${prefix}"><span>${exact.slice(0, length)}</span><span class="lesson-unwritten">${exact.slice(length)}</span></div><p class="lesson-tape-label">Written so far <span>Still unwritten</span></p><div class="lesson-fork"><div><span>Stop here</span><strong>${prefix}</strong>${tag(s.low)}</div><div><span>Round up</span><strong>${upper}</strong>${tag(s.high)}</div></div><details class="lesson-arithmetic" ${arithmeticOpen ? "open" : ""}><summary>Show the integer calculation for this digit</summary><p>Write the value as 402/64. Its boundary distances are both 1/64. Each new decimal place multiplies the remainder and the allowed distances by ten.</p><div class="lesson-division"><code>${s.numerator} = <b>${s.digit}</b> × 64 + <b>${s.remainder}</b></code><span>digit: ${s.digit} · remainder: ${s.remainder} · allowed distance: ${s.margin}</span></div></details>`;
    result.innerHTML = s.low || s.high
      ? `<strong>Stop. Both fit; 6.28 is closer.</strong><p>6.28 is ${distanceDown} below the stored value; 6.29 is ${distanceUp} above it. Both errors are smaller than the allowed 0.015625. We can stop before writing the remaining digits.</p>`
      : `<strong>Neither choice fits. We need another digit.</strong><p>${prefix} is ${distanceDown} below the stored value; ${upper} is ${distanceUp} above it. Both errors are larger than the allowed 0.015625.</p>`;
  });
  host.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    step = Math.max(0, Math.min(rows.length - 1, step + (action === "next" ? 1 : -1)));
    update();
  });
}

function ryu(host) {
  let stage = 0;
  const update = setup(host, `<div class="lesson-controls"><button type="button" data-action="reset">Start over</button><button type="button" data-action="remove">Try one fewer place</button></div>`, (scene, result) => {
    host.querySelector('[data-action="reset"]').disabled = stage === 0;
    host.querySelector('[data-action="remove"]').disabled = stage === 2;
    scene.innerHTML = `<div class="lesson-resolution">${[3, 2, 1].map((p, j) => {
      const g = grid(201, p);
      const shown = j <= stage;
      return `<div class="lesson-resolution-row ${shown ? "" : "lesson-pending"} ${j === stage ? "lesson-current" : ""}"><div><strong>${["Thousandths", "Hundredths", "Tenths"][j]}</strong><span>one integer unit = ${decimal(1, p)}</span></div><div>${shown ? `<code>${g.count ? `${g.first} … ${g.last}` : "no integer"}</code><span>${g.count ? `${g.count} acceptable choices` : "first would be 63; last would be 62"}</span>` : `<span>Not tried yet</span>`}</div></div>`;
    }).join("")}</div>` + (stage === 0
      ? `<div class="lesson-survivors"><span>Only these multiples of 10 can survive:</span><div>${[6270, 6280, 6290].map((n) => `<code>${n / 10}<del>0</del></code>`).join("")}</div><span>Each becomes an integer at hundredths.</span></div>`
      : stage === 1 ? `<div class="lesson-survivors"><span>Try to find another multiple of 10:</span><div><s>620</s><code>627</code><code>628</code><code>629</code><s>630</s></div><span>620 and 630 are outside the surviving range.</span></div>` : `<div class="lesson-survivors"><span>Keep the last successful precision</span><div><strong>628 × 0.01 = 6.28</strong></div></div>`);
    result.innerHTML = stage === 0
      ? `<strong>Begin with three decimal places.</strong><p>6266…6296 means 6.266…6.296. Only 6270, 6280, and 6290 end in zero, so only those choices can lose a place.</p>`
      : stage === 1 ? `<strong>One place removed; three choices survive.</strong><p>627 ÷ 100 is the same value as 6270 ÷ 1000: 6.27. The other survivors are 6.28 and 6.29. None can lose another place.</p>`
      : `<strong>Another removal fails. The shortest answer is 6.28.</strong><p>The tenths set is empty, so return to hundredths and choose its closest candidate. The exact value in hundredths is 628.125; 628 is nearest.</p>`;
  });
  host.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    stage = action === "reset" ? 0 : Math.min(2, stage + 1);
    update();
  });
}

function schubfach(host) {
  setup(host, `<div class="lesson-controls"><label>Move the stored value <input type="range" min="200" max="204" value="201" step="1" aria-label="Stored significand, divided by 32"></label></div>`, (scene, result) => {
    const m = Number(host.querySelector("input").value);
    host.querySelector("input").setAttribute("aria-valuetext", fmt(m / 32));
    const i = interval(m);
    const x = (v) => 35 + (v - 6.2) / .22 * 570;
    const low = x(i.lower / 64), high = x(i.upper / 64);
    const coarse = grid(m, 1), fine = grid(m, 2);
    scene.innerHTML = svg(`Rounding interval around ${m / 32}, width 0.03125; ${coarse.count ? "a tenth fits" : "tenths miss; use hundredths"}`, 235,
      rect(low, 45, high - low, 130, "lesson-band") +
      text((low + high) / 2, 25, fmt(m / 32), "lesson-blue") +
      line(low, 40, low, 183, "lesson-edge") + line(high, 40, high, 183, "lesson-edge") +
      [85, 165].map((y, row) => {
        const p = row + 1;
        const start = row ? 620 : 62, end = row ? 642 : 64;
        return line(30, y, 610, y, "lesson-comb-spine") + Array.from({ length: end - start + 1 }, (_, j) => {
          const n = start + j, pos = x(n / 10 ** p), yes = contains(m, n, p);
          return line(pos, y - 15, pos, y + 12, yes ? "lesson-tooth-hit" : "lesson-tooth") + (yes ? circle(pos, y + 12, "lesson-hit", 4) : "") + (!row || n % 5 === 0 ? text(pos, y + 34, decimal(n, p), "lesson-small") : "");
        }).join("");
      }).join("")) + caption("The same interval on both combs. Teeth are 0.1 apart above, 0.01 apart below. Filled dots mark the decimals inside.");
    result.innerHTML = `<strong>${coarse.count ? `A tenth fits: ${decimal(closest(m, 1), 1)}.` : `Tenths miss. Use hundredths: ${decimal(closest(m, 2), 2)}.`}</strong><p>For the stored value ${fmt(m / 32)}, ${fine.count} hundredths and ${coarse.count} tenths lie inside the interval. Its width is always 0.03125.</p><p>The interval runs from ${fmt(i.lower / 64)} to ${fmt(i.upper / 64)}. ${i.closed ? "These endpoints are included." : "These endpoints are excluded."}</p>`;
  });
}

function dragonbox(host) {
  setup(host, `<div class="lesson-controls"><label>Choose a stored value <select aria-label="Dragonbox worked input"><option value="201">6.28125 · no tenth fits</option><option value="202">6.3125 · a tenth fits</option></select></label></div>`, (scene, result) => {
    const m = Number(host.querySelector("select").value);
    const i = interval(m), d = rightEndpoint(m);
    const width = d.width / 10000, remainder = d.remainder / 10000;
    const x = (v) => 50 + (v - 6.19) / .16 * 540;
    const low = x(i.lower / 64), high = x(i.upper / 64), candidate = x(d.q / 10);
    scene.innerHTML = svg(`Backward distance ${fmt(remainder)} ${d.accepted ? "fits within" : "exceeds"} interval width ${fmt(width)}`, 250,
      rect(low, 55, high - low, 80, "lesson-band") +
      line(40, 135, 605, 135, "lesson-axis") +
      line(low, 48, low, 143, "lesson-edge") + line(high, 48, high, 143, "lesson-edge") +
      line(low, 55, high, 55, "lesson-width") + text((low + high) / 2, 35, `width ${fmt(width)}`, "lesson-green") +
      line(candidate, 96, high, 96, "lesson-walk") + text((candidate + high) / 2, 83, fmt(remainder)) +
      `<path d="M ${candidate + 9} 89 L ${candidate} 96 L ${candidate + 9} 103" class="lesson-walk"/>` +
      circle(candidate, 135, d.accepted ? "lesson-hit" : "lesson-miss") +
      text(candidate, 163, decimal(d.q, 1)) + text(high, 186, fmt(i.upper / 64))) +
      caption("The arrow measures back from the right edge to the preceding tenth. Compare its length with the green interval’s width.") +
      `<div class="lesson-division"><code>${fmt(i.upper / 64)} = <b>${d.q}</b> × 0.1 + <b>${fmt(remainder)}</b></code><span>${d.q} complete tenths, plus the remaining distance</span></div>`;
    result.innerHTML = d.accepted
      ? `<strong>The distance is smaller than the width: ${decimal(d.q, 1)} fits.</strong><p>${fmt(remainder)} is less than ${fmt(width)}. The preceding tenth lies inside the interval. Return ${decimal(d.q, 1)}.</p>`
      : `<strong>The distance is greater than the width: 6.2 is outside.</strong><p>${fmt(remainder)} is greater than ${fmt(width)}. No tenth fits. Try hundredths, reusing the remainder to find the final digit of 6.28.</p>`;
  });
}

function grisu(host) {
  setup(host, `<div class="lesson-controls"><label>Illustrative boundary uncertainty <input type="range" min="1" max="20" value="1" aria-label="Boundary uncertainty in thousandths"></label></div>`, (scene, result) => {
    const e = Number(host.querySelector("input").value) / 1000;
    host.querySelector("input").setAttribute("aria-valuetext", `plus or minus ${fmt(e)}`);
    const i = interval(), l = i.lower / 64, u = i.upper / 64;
    const x = (v) => 40 + (v - 6.24) / .085 * 560;
    const safe = 6.28 > l + e && 6.28 < u - e;
    scene.innerHTML = svg(`Boundary uncertainty plus or minus ${e}; membership of 6.28 is ${safe ? "certified" : "unresolved"}`, 195,
      (l + e < u - e ? rect(x(l + e), 50, x(u - e) - x(l + e), 80, "lesson-band") : "") +
      [l, u].map((v) => rect(x(v - e), 50, x(v + e) - x(v - e), 80, "lesson-uncertainty") + line(x(v - e), 46, x(v - e), 135, "lesson-dashed") + line(x(v + e), 46, x(v + e), 135, "lesson-dashed")).join("") +
      line(30, 130, 610, 130, "lesson-axis") +
      line(x(6.28), 32, x(6.28), 143, "lesson-binary") + circle(x(6.28), 130, "lesson-binary") + text(x(6.28), 24, "candidate 6.28", "lesson-blue")) +
      caption(`Each boundary can move by ±${fmt(e)}. Dashed bands show possible boundary positions; green is definitely inside.`);
    result.innerHTML = `<strong>${safe ? "6.28 is definitely inside." : "We cannot prove that 6.28 is inside."}</strong><p>${safe ? "Every boundary position allowed by the bands leaves 6.28 inside the interval." : "The lower boundary might lie past 6.28. An exact algorithm can resolve the comparison."}</p><p>The lower boundary could lie between ${fmt(l - e)} and ${fmt(l + e)}; the upper between ${fmt(u - e)} and ${fmt(u + e)}.</p>`;
  });
}

function errol(host) {
  setup(host, `<div class="lesson-controls"><label><input type="checkbox" checked> Keep the small correction</label></div>`, (scene, result) => {
    const keep = host.querySelector("input").checked;
    scene.innerHTML = `<div class="lesson-measurement"><div><span>Main measurement</span><strong>6.28</strong><small>three significant decimal digits</small></div><span class="lesson-plus">+</span><div class="${keep ? "" : "lesson-discarded"}"><span>Saved correction</span><strong>0.00125</strong><small>exact value − main measurement</small></div></div>` + svg("Magnified correction above 6.28", 100,
      line(60, 40, 580, 40, "lesson-axis") +
      [0, 1, 2].map((n) => line(80 + n * 230, 30, 80 + n * 230, 50, "lesson-edge") + text(80 + n * 230, 76, `+${(n / 1000).toFixed(3)}`, "lesson-small")).join("") +
      circle(keep ? 80 + 1.25 * 230 : 80, 40, "lesson-binary", 7) + text(320, 18, "Magnifying the offset from 6.28", "lesson-small"));
    result.innerHTML = `<strong>${keep ? "Together, the two numbers describe 6.28125." : "Only 6.28 remains. The correction is lost."}</strong><p>${keep ? "The positive correction tells us the value is above 6.28. Keeping the two numbers separate preserves that information." : "Different exact values can round to 6.28. That rounded value alone cannot tell us what the correction was."}</p>`;
  });
}

function coonen(host) {
  setup(host, `<div class="lesson-controls"><label>Requested significant digits <select aria-label="Requested significant digits"><option>2</option><option>3</option><option selected>4</option><option>5</option></select></label></div>`, (scene, result) => {
    const digits = Number(host.querySelector("select").value), places = digits - 1;
    const numerator = 201 * 10 ** places;
    const q = Math.floor(numerator / 32), r = numerator % 32;
    const rounded = q + (r > 16 || (r === 16 && q % 2 === 1) ? 1 : 0);
    scene.innerHTML = `<ol class="lesson-scale-flow"><li><span>Move point ${places} places</span><strong>${fmt(numerator / 32)}</strong><small>6.28125 × ${10 ** places}</small></li><li><span>Round to an integer</span><strong>${rounded}</strong><small>${digits} significant digits</small></li><li><span>Restore the point</span><strong>${decimal(rounded, places)}</strong><small>divide by ${10 ** places}</small></li></ol>`;
    result.innerHTML = `<strong>The request fixes the decimal precision: ${decimal(rounded, places)}.</strong><p>${digits === 2 ? "6.3 does not recover 6.28125 in our miniature format. Requested precision and shortest round trip are different contracts." : `The miniature shortest answer is 6.28; the caller has requested ${digits} significant digits here.`} This is ideal decimal rounding, before Coonen’s finite-precision scaling error is introduced.</p>`;
  });
}

const lessons = { destination, dragon, ryu, schubfach, dragonbox, grisu, errol, coonen };
for (const host of document.querySelectorAll("[data-lesson]")) {
  lessons[host.dataset.lesson]?.(host);
}
