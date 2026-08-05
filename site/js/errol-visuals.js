import { fromBits, nextDown, nextUp } from "./float.js";
import { errolChecked } from "./errol-reference.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CORRECTION_VALUE = fromBits(0x435eb281e7c86675n);
const EXAMPLES = [
  { label: "immediate split · 0.3", value: 0.3, input: "0.3" },
  { label: "sixteen levels · 1/3", value: 1 / 3, input: "0.3333333333333333" },
  { label: "checked correction", value: CORRECTION_VALUE, input: "34562081242061268" },
];

function element(name, attributes = {}, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}

function append(parent, name, attributes, text) {
  const node = element(name, attributes, text);
  parent.append(node);
  return node;
}

function inspect(node, detail, owner) {
  node.setAttribute("tabindex", "0");
  node.setAttribute("role", "button");
  node.classList.add("inspectable-mark");
  node.append(element("title", {}, detail.title));
  const show = () => owner.showDetail(detail);
  node.addEventListener("mouseenter", show);
  node.addEventListener("focus", show);
  node.addEventListener("click", show);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(); }
  });
}

function pairText(pair) {
  return `${pair.hi.toPrecision(17)} ${pair.lo < 0 ? "−" : "+"} ${Math.abs(pair.lo).toExponential(4)}`;
}

class ErrolBase extends HTMLElement {
  bindControls() {
    this.input = this.querySelector(".candidate-input input");
    this.message = this.querySelector(".input-message");
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this.selectValue(Number(this.input.value)); });
    this.querySelectorAll(".errol-presets button").forEach((button, index) => button.addEventListener("click", () => {
      this.input.value = EXAMPLES[index].input;
      this.selectValue(EXAMPLES[index].value);
    }));
  }

  selectValue(value) {
    if (!Number.isFinite(value) || value === 0) { this.message.textContent = "Enter a finite, nonzero binary64 value."; return; }
    this.message.textContent = "";
    this.value = value;
    this.result = errolChecked(value);
    this.valueChanged();
  }

  showDetail(detail) {
    this.inspector.innerHTML = `<strong>${detail.heading}</strong><span>${detail.body}</span>${detail.exact ? `<code>${detail.exact}</code>` : ""}`;
  }
}

class ErrolPairLab extends ErrolBase {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab errol-pair-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">Residual microscope</span><strong>The second double records a displacement too small for the first to show</strong></div><output class="candidate-result pair-result"></output></div>
        <form class="candidate-input"><label for="errol-pair-value">Binary64 value</label><div><input id="errol-pair-value" value="0.3" inputmode="decimal"><button type="submit">Scale</button></div><p class="input-message"></p></form>
        <div class="lab-presets errol-presets">${EXAMPLES.map((example) => `<button type="button">${example.label}</button>`).join("")}</div>
        <div class="pair-choice"><button type="button" data-endpoint="low" class="active">lower endpoint</button><button type="button" data-endpoint="high">upper endpoint</button></div>
        <div class="candidate-facts pair-facts"></div>
        <svg class="algorithm-svg errol-pair-svg" role="img" aria-label="A double-double endpoint shown at ordinary scale and under a residual magnifier"></svg>
        <div class="lab-inspector" aria-live="polite"></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.inspector = this.querySelector(".lab-inspector");
    this.endpoint = "low";
    this.querySelectorAll(".pair-choice button").forEach((button) => button.addEventListener("click", () => {
      this.endpoint = button.dataset.endpoint;
      this.querySelectorAll(".pair-choice button").forEach((item) => item.classList.toggle("active", item === button));
      this.render();
    }));
    this.bindControls();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.selectValue(0.3);
  }
  disconnectedCallback() { this.resizeObserver?.disconnect(); }
  valueChanged() { this.render(); }

  render() {
    if (!this.result) return;
    const state = this.result.states[0];
    const pair = this.endpoint === "low" ? state.low : state.high;
    const toward = pair.lo >= 0 ? nextUp(pair.hi) : nextDown(pair.hi);
    const ulp = Math.abs(toward - pair.hi);
    const offsetUlps = pair.lo / ulp;
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const mobile = width < 560;
    const height = mobile ? 430 : 350;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();
    this.querySelector(".pair-result").innerHTML = `<span>${this.endpoint} endpoint · hi</span><strong>${pair.hi.toPrecision(17)}</strong><small>plus residual ${pair.lo.toExponential(3)}</small>`;
    this.querySelector(".pair-facts").innerHTML = `<p><span>Leading double</span><strong>${pair.hi.toPrecision(17)}</strong><small>ordinary binary64 coordinate</small></p><p><span>Residual</span><strong>${pair.lo.toExponential(6)}</strong><small>${offsetUlps.toFixed(4)} ulp of the leading value</small></p><p><span>Represented endpoint</span><strong>hi + lo</strong><small>the mathematical sum, not a rounded JS addition</small></p>`;
    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    const left = mobile ? 34 : 70; const right = width - left; const center = (left + right) / 2;
    append(this.svg, "text", { x: left, y: 40, class: "lane-label" }, "ORDINARY SCALE");
    append(this.svg, "line", { x1: left, y1: 86, x2: right, y2: 86, class: "dd-axis" });
    const merged = append(this.svg, "g", { class: "dd-merged" });
    append(merged, "line", { x1: center, y1: 62, x2: center, y2: 110 });
    append(merged, "circle", { cx: center, cy: 86, r: 7 });
    append(merged, "text", { x: center, y: 52, "text-anchor": "middle" }, "hi and hi + lo appear at the same pixel");
    inspect(merged, { title: "Ordinary-scale endpoint", heading: "One double cannot display the residual", body: "At the scale of the decimal decade, the leading approximation and represented pair are visually coincident. Rounding the mathematical sum back to binary64 would lose the offset again.", exact: pairText(pair) }, this);
    append(this.svg, "path", { d: `M ${center - 28} 120 L ${center - 100} ${mobile ? 190 : 175} M ${center + 28} 120 L ${center + 100} ${mobile ? 190 : 175}`, class: "dd-magnifier" });
    const zoomY = mobile ? 245 : 225;
    append(this.svg, "text", { x: left, y: zoomY - 48, class: "lane-label" }, mobile ? "RESIDUAL SCALE · ULPS OF HI" : "RESIDUAL SCALE · DISTANCE MEASURED IN ULPS OF HI");
    append(this.svg, "line", { x1: left, y1: zoomY, x2: right, y2: zoomY, class: "dd-axis" });
    for (let i = -2; i <= 2; i++) {
      const x = center + i * (right - left) / 5;
      append(this.svg, "line", { x1: x, y1: zoomY - 8, x2: x, y2: zoomY + 8, class: "dd-tick" });
      append(this.svg, "text", { x, y: zoomY + 25, class: "lane-note", "text-anchor": "middle" }, i === 0 ? "hi" : `${i > 0 ? "+" : ""}${i} ulp`);
    }
    const pairX = center + offsetUlps * (right - left) / 5;
    const residual = append(this.svg, "g", { class: "dd-residual" });
    append(residual, "line", { x1: center, y1: zoomY - 27, x2: pairX, y2: zoomY - 27 });
    append(residual, "circle", { cx: pairX, cy: zoomY, r: 7 });
    append(residual, "text", { x: pairX, y: zoomY - 38, "text-anchor": offsetUlps < 0 ? "end" : "start" }, `hi + lo · ${offsetUlps.toFixed(4)} ulp`);
    inspect(residual, { title: "Residual displacement", heading: "The low component locates the endpoint between doubles", body: "The pair retains this offset without folding it into the leading double. Compensated operations update both components so digit decisions can use the more accurate coordinate.", exact: `lo = ${pair.lo}; local ulp = ${ulp}` }, this);
    append(this.svg, "text", { x: width / 2, y: zoomY + (mobile ? 105 : 80), class: "dd-conclusion", "text-anchor": "middle" }, "TWO DOUBLES · ONE MORE PRECISE COORDINATE");
    this.showDetail({ heading: "Read the pair as an unevaluated exact sum", body: "The browser would round hi + lo if it were added normally. Double-double routines instead transform both fields and reconstruct each operation’s rounding residue.", exact: pairText(pair) });
  }
}

class ErrolPrefixLab extends ErrolBase {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab errol-prefix-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">Common-prefix zoom</span><strong>Keep a shared digit, then stretch its decimal cell to fill the line</strong></div><output class="candidate-result errol-result"></output></div>
        <form class="candidate-input"><label for="errol-prefix-value">Binary64 value</label><div><input id="errol-prefix-value" value="0.3" inputmode="decimal"><button type="submit">Generate</button></div><p class="input-message"></p></form>
        <div class="lab-presets errol-presets">${EXAMPLES.map((example) => `<button type="button">${example.label}</button>`).join("")}</div>
        <div class="resolution-control errol-depth"><label>Decimal depth <output></output><input type="range" min="0" max="0" value="0"><span class="resolution-ends"><span>leading digit</span><span>end of common prefix</span></span></label></div>
        <div class="candidate-facts errol-facts"></div>
        <svg class="algorithm-svg errol-prefix-svg" role="img" aria-label="Lower and upper double-double endpoints in decimal digit cells, with a shared cell expanded by ten"></svg>
        <div class="lab-inspector" aria-live="polite"></div>
      </div>`;
    this.svg = this.querySelector("svg"); this.inspector = this.querySelector(".lab-inspector");
    this.slider = this.querySelector("input[type=range]");
    this.slider.addEventListener("input", () => this.render());
    this.bindControls();
    this.resizeObserver = new ResizeObserver(() => this.render()); this.resizeObserver.observe(this.svg);
    this.selectValue(0.3);
  }
  disconnectedCallback() { this.resizeObserver?.disconnect(); }
  valueChanged() { this.slider.max = String(this.result.states.length - 1); this.slider.value = this.slider.max; this.render(); }

  render() {
    if (!this.result) return;
    const index = Math.min(Number(this.slider.value), this.result.states.length - 1);
    const state = this.result.states[index]; const split = state.lowerDigit !== state.upperDigit;
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900)); const mobile = width < 560; const height = mobile ? 500 : 405;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`); this.svg.replaceChildren();
    this.querySelector(".errol-depth output").textContent = `${index + 1} of ${this.result.states.length} · prefix ${state.prefix || "empty"}`;
    this.querySelector(".errol-result").innerHTML = `<span>${this.result.corrected ? "checked correction" : "pair core"}</span><strong>${this.result.text}</strong><small>${this.result.corrected ? `core attempted ${this.result.coreText}` : "core agrees with exact control"}</small>`;
    this.querySelector(".errol-facts").innerHTML = `<p><span>Prefix before this level</span><strong>${state.prefix || "empty"}</strong><small>${index} shared decimal digits</small></p><p><span>Endpoint digits</span><strong>${state.lowerDigit} / ${state.upperDigit}</strong><small>${split ? "the common prefix ends here" : "the complete interval shares this digit"}</small></p><p><span>Next action</span><strong>${split ? "round middle" : `keep ${state.upperDigit}; zoom ×10`}</strong><small>${split ? "then normalize trailing zeros" : "subtract the shared digit first"}</small></p>`;
    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    const left = mobile ? 25 : 55; const right = width - left; const span = right - left; const y = mobile ? 155 : 145; const cellWidth = span / 10;
    append(this.svg, "text", { x: left, y: 38, class: "lane-label" }, "PREFIX ALREADY FIXED");
    append(this.svg, "text", { x: left, y: 78, class: "errol-prefix-tape" }, state.prefix || "(none yet)");
    append(this.svg, "text", { x: left, y: y - 34, class: "lane-label" }, "CURRENT DECIMAL DIGIT CELLS");
    for (let digit = 0; digit < 10; digit++) {
      const group = append(this.svg, "g", { class: `errol-digit-cell ${digit === state.lowerDigit || digit === state.upperDigit ? split ? "split" : "shared" : ""}` });
      append(group, "rect", { x: left + digit * cellWidth, y, width: cellWidth, height: 92 });
      append(group, "text", { x: left + (digit + .5) * cellWidth, y: y + 78, "text-anchor": "middle" }, String(digit));
    }
    const coordinate = (pair) => Math.max(0, Math.min(10, pair.hi + pair.lo));
    const lowerX = left + coordinate(state.low) / 10 * span; const upperX = left + coordinate(state.high) / 10 * span;
    const lower = append(this.svg, "g", { class: "errol-endpoint lower" });
    append(lower, "line", { x1: lowerX, y1: y - 5, x2: lowerX, y2: y + 52 }); append(lower, "circle", { cx: lowerX, cy: y + 26, r: 6 });
    inspect(lower, { title: "Lower double-double endpoint", heading: `The lower endpoint truncates to ${state.lowerDigit}`, body: "If the leading component is an integer but the residual is negative, truncation is reduced by one. That is why a point just below 3 belongs to cell 2.", exact: pairText(state.low) }, this);
    const upper = append(this.svg, "g", { class: "errol-endpoint upper" });
    append(upper, "line", { x1: upperX, y1: y + 34, x2: upperX, y2: y + 91 }); append(upper, "circle", { cx: upperX, cy: y + 65, r: 6 });
    inspect(upper, { title: "Upper double-double endpoint", heading: `The upper endpoint truncates to ${state.upperDigit}`, body: "The two endpoints enclose every admissible value represented by this teaching core. A digit may be kept only when both truncate to the same integer.", exact: pairText(state.high) }, this);
    const actionY = y + 145;
    if (!split) {
      const cellLeft = left + state.upperDigit * cellWidth;
      append(this.svg, "path", { d: `M ${cellLeft} ${y + 98} L ${left} ${actionY} M ${cellLeft + cellWidth} ${y + 98} L ${right} ${actionY}`, class: "errol-zoom-lines" });
      append(this.svg, "text", { x: width / 2, y: actionY + 34, class: "errol-action", "text-anchor": "middle" }, `KEEP ${state.upperDigit} · SUBTRACT ${state.upperDigit} · MULTIPLY BOTH REMAINDERS BY 10`);
      append(this.svg, "text", { x: width / 2, y: actionY + 66, class: "lane-note", "text-anchor": "middle" }, "the selected cell becomes the complete 0…10 line at the next depth");
    } else {
      append(this.svg, "path", { d: `M ${lowerX} ${y + 105} H ${upperX}`, class: "errol-middle-bracket" });
      append(this.svg, "text", { x: (lowerX + upperX) / 2, y: actionY + 18, class: "errol-action split", "text-anchor": "middle" }, "END OF COMMON PREFIX · ROUND THE MIDDLE POSITION");
      append(this.svg, "text", { x: width / 2, y: actionY + 58, class: "lane-note", "text-anchor": "middle" }, this.result.corrected ? "the checked teaching wrapper replaces this core result" : "the resulting decimal agrees with the exact interval control");
    }
    this.showDetail({ heading: split ? "The endpoints have entered different digit cells" : `Every represented point begins with ${state.upperDigit}`, body: split ? "No further digit is common to the complete interval. The core rounds its middle position for the final digit." : "The shared cell is translated to zero and enlarged tenfold. This is ordinary decimal zoom expressed as compensated endpoint arithmetic.", exact: `lower ${pairText(state.low)}; upper ${pairText(state.high)}` });
  }
}

if (!customElements.get("errol-pair-lab")) customElements.define("errol-pair-lab", ErrolPairLab);
if (!customElements.get("errol-prefix-lab")) customElements.define("errol-prefix-lab", ErrolPrefixLab);
