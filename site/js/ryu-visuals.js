import { nextUp } from "./float.js";
import { floorDiv, projectInterval, scaleByInversePower10, subtractRational } from "./interval-core.js";
import { exactDecimalOfRational } from "./oracle.js";
import { ryuExact } from "./ryu-reference.js";

const SVG_NS = "http://www.w3.org/2000/svg";

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

function bitLength(value) {
  return (value < 0n ? -value : value).toString(2).length;
}

function bigintRatio(numerator, denominator) {
  if (numerator === 0n) return 0;
  const negative = (numerator < 0n) !== (denominator < 0n);
  let n = numerator < 0n ? -numerator : numerator;
  let d = denominator < 0n ? -denominator : denominator;
  const nShift = Math.max(0, bitLength(n) - 52);
  const dShift = Math.max(0, bitLength(d) - 52);
  n >>= BigInt(nShift);
  d >>= BigInt(dShift);
  const ratio = Number(n) / Number(d) * 2 ** (nShift - dShift);
  return negative ? -ratio : ratio;
}

function rationalNumber(rational) {
  return bigintRatio(rational.numerator, rational.denominator);
}

function compact(value, limit = 22) {
  const text = String(value);
  return text.length <= limit ? text : `${text.slice(0, 10)}…${text.slice(-7)}`;
}

function exactRational(rational) {
  const decimal = exactDecimalOfRational(rational);
  return decimal.includes("/") ? `${rational.numerator}/${rational.denominator}` : decimal;
}

function activate(node, detail, owner) {
  node.setAttribute("tabindex", "0");
  node.setAttribute("role", "button");
  node.classList.add("inspectable-mark");
  node.append(element("title", {}, detail.title));
  const show = () => owner.showDetail(detail);
  node.addEventListener("mouseenter", show);
  node.addEventListener("focus", show);
  node.addEventListener("click", show);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show();
    }
  });
}

function axis(svg, x1, x2, y, label) {
  append(svg, "line", { x1, x2, y1: y, y2: y, class: "grid-axis" });
  append(svg, "text", { x: x1, y: y - 23, class: "lane-label" }, label);
}

class RyuGuardBits extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab guard-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">Common integer coordinates</span><strong>Magnify half steps until every important point is an integer</strong></div><div class="guard-readout"></div></div>
        <div class="lab-presets guard-presets" aria-label="Boundary spacing"><button type="button" data-kind="regular" class="active">regular spacing</button><button type="button" data-kind="short">power-of-two spacing</button></div>
        <svg class="algorithm-svg guard-svg" role="img" aria-label="Parsing midpoints before and after adding two guard bits"></svg>
        <div class="lab-inspector"><strong>Nothing has moved on the real line.</strong><span>The lower row uses coordinates four times finer, so halves and the shorter quarter-step become integers.</span></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.kind = "regular";
    for (const button of this.querySelectorAll("button")) button.addEventListener("click", () => {
      this.kind = button.dataset.kind;
      for (const item of this.querySelectorAll("button")) item.classList.toggle("active", item === button);
      this.render();
    });
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.render();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  render() {
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const height = 350;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();
    const margin = width < 560 ? 34 : 70;
    const xTop = (value) => margin + (value + 1) / 2 * (width - 2 * margin);
    const xBottom = (value) => margin + (value + 4) / 8 * (width - 2 * margin);
    const lower = this.kind === "regular" ? -.5 : -.25;
    const lowerInteger = this.kind === "regular" ? -2 : -1;
    this.querySelector(".guard-readout").innerHTML = this.kind === "regular"
      ? "<span>midpoints <b>−½, +½</b></span><span>guarded integers <b>−2, 0, +2</b></span>"
      : "<span>midpoints <b>−¼, +½</b></span><span>guarded integers <b>−1, 0, +2</b></span>";
    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    axis(this.svg, margin, width - margin, 105, "ORIGINAL COORDINATES — MIDPOINTS REQUIRE FRACTIONS");
    for (let tick = -1; tick <= 1.001; tick += .25) {
      const major = Number.isInteger(tick);
      append(this.svg, "line", { x1: xTop(tick), x2: xTop(tick), y1: 105 - (major ? 25 : 13), y2: 105 + (major ? 25 : 13), class: major ? "odd-even-tick" : "odd-tick" });
    }
    const compactLabels = width < 560;
    this.drawGuardPoint(xTop(lower), 105, compactLabels ? "lower" : lower === -.5 ? "lower midpoint −½" : "lower midpoint −¼", "boundary");
    this.drawGuardPoint(xTop(0), 105, compactLabels ? "value" : "stored value", "center");
    this.drawGuardPoint(xTop(.5), 105, compactLabels ? "upper" : "upper midpoint +½", "boundary");
    append(this.svg, "path", { d: `M ${margin} 158 H ${width - margin}`, class: "guard-transform" });
    append(this.svg, "text", { x: width / 2, y: 185, "text-anchor": "middle", class: "width-label" }, "append two zero bits to the significand; subtract two from the exponent");
    append(this.svg, "path", { d: `M ${width / 2} 196 v 28`, class: "projection-arrow" });
    axis(this.svg, margin, width - margin, 275, "GUARDED COORDINATES — ALL THREE POSITIONS ARE INTEGERS");
    for (let tick = -4; tick <= 4; tick++) append(this.svg, "line", { x1: xBottom(tick), x2: xBottom(tick), y1: 258, y2: 292, class: tick % 2 === 0 ? "odd-even-tick" : "odd-tick" });
    this.drawGuardPoint(xBottom(lowerInteger), 275, compactLabels ? `${lowerInteger}` : `lower ${lowerInteger}`, "boundary");
    this.drawGuardPoint(xBottom(0), 275, compactLabels ? "0" : "center 0", "center");
    this.drawGuardPoint(xBottom(2), 275, compactLabels ? "+2" : "upper +2", "boundary");
  }

  drawGuardPoint(x, y, label, kind) {
    append(this.svg, "circle", { cx: x, cy: y, r: kind === "center" ? 8 : 6, class: kind === "center" ? "exact-dot" : "guard-boundary-dot" });
    append(this.svg, "text", { x, y: y + 43, "text-anchor": "middle", class: "guard-label" }, label);
  }
}

class RyuLattice extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab ryu-lattice-lab">
        <div class="algorithm-lab-head">
          <div><span class="lab-kicker">Decimal-resolution laboratory</span><strong>Coarsen the grid until the interval would contain no integer</strong></div>
          <output class="candidate-result ryu-result"></output>
        </div>
        <form class="candidate-input ryu-input">
          <label for="ryu-value">Binary64 value</label><div><input id="ryu-value" name="value" value="0.3" inputmode="decimal"><button type="submit">Inspect</button></div><p class="input-message"></p>
        </form>
        <div class="lab-presets" aria-label="Example values">
          <button type="button" data-value="0.3">long collapse · 0.3</button>
          <button type="button" data-value="0.3333333333333333">early stop · 1/3</button>
          <button type="button" data-value="nextUp1">seventeen digits · nextUp(1)</button>
          <button type="button" data-value="1e23">decimal carry · 1e23</button>
          <button type="button" data-value="5e-324">smallest subnormal</button>
        </div>
        <div class="resolution-control"><label>Decimal resolution <output></output><input type="range" min="0" value="0" aria-label="Decimal grid resolution"></label><div class="resolution-ends"><span>finer initial grid</span><span>one step too coarse</span></div></div>
        <div class="candidate-facts ryu-facts"></div>
        <svg class="algorithm-svg ryu-lattice-svg" role="img" aria-label="Ryū's projected integer interval at the selected decimal resolution"></svg>
        <div class="lab-inspector" aria-live="polite"></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.inspector = this.querySelector(".lab-inspector");
    this.form = this.querySelector("form");
    this.input = this.querySelector("input");
    this.message = this.querySelector(".input-message");
    this.resolution = this.querySelector('.resolution-control input[type="range"]');
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.selectValue(Number(this.input.value));
    });
    for (const button of this.querySelectorAll(".lab-presets button")) button.addEventListener("click", () => {
      const value = button.dataset.value === "nextUp1" ? nextUp(1) : Number(button.dataset.value);
      this.input.value = button.dataset.value === "nextUp1" ? "1.0000000000000002" : button.dataset.value;
      this.selectValue(value);
    });
    this.resolution.addEventListener("input", () => this.render());
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.selectValue(.3);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  selectValue(value) {
    if (!Number.isFinite(value) || value === 0) {
      this.message.textContent = "Enter a finite, nonzero value. The diagram requires an ordinary parsing interval.";
      return;
    }
    this.value = value;
    this.result = ryuExact(value);
    this.message.textContent = value < 0 ? "The diagram uses the magnitude; the output restores the minus sign." : "";
    this.resolution.max = String(this.result.states.length);
    this.resolution.value = "0";
    this.render();
  }

  showDetail(detail) {
    this.inspector.innerHTML = `<strong>${detail.heading}</strong><span>${detail.body}</span>${detail.exact ? `<code>${detail.exact}</code>` : ""}`;
  }

  render() {
    if (!this.result) return;
    const result = this.result;
    const index = Math.min(Number(this.resolution.value), result.states.length);
    const ghost = index === result.states.length;
    const current = ghost ? projectInterval(result.interval, result.states.at(-1).exponent + 1) : result.states[index];
    const previous = ghost ? result.states.at(-1) : index > 0 ? result.states[index - 1] : null;
    const next = !ghost && index + 1 < result.states.length ? result.states[index + 1] : !ghost ? projectInterval(result.interval, current.exponent + 1) : null;
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const height = width < 560 ? 590 : 530;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();
    this.querySelector(".resolution-control output").textContent = ghost ? `10^${current.exponent} · empty` : `10^${current.exponent} · ${index} digit${index === 1 ? "" : "s"} removed`;
    this.querySelector(".ryu-result").innerHTML = `<span>shortest result</span><strong>${result.text}</strong><small>${result.removed} decimal digits removed</small>`;

    const lastValid = result.states.at(-1);
    this.querySelector(".ryu-facts").innerHTML = `
      <p><span>Current grid</span><strong>10<sup>${current.exponent}</sup></strong><small>${ghost ? "no admissible integer" : `${current.last - current.first + 1n} admissible integer${current.last === current.first ? "" : "s"}`}</small></p>
      <p><span>Nearest integer</span><strong>${ghost ? "none" : compact(current.candidate)}</strong><small>${ghost ? "the previous grid was the last valid one" : `integer × 10^${current.exponent}`}</small></p>
      <p><span>Stopping grid</span><strong>10<sup>${lastValid.exponent}</sup></strong><small>the next coarser grid is empty</small></p>`;

    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    if (ghost) this.drawGhost(width, height, previous);
    else this.drawValid(width, height, current, next, index);
  }

  scaledLocal(rational, exponent, base) {
    const scaled = scaleByInversePower10(rational, exponent);
    return bigintRatio(scaled.numerator - base * scaled.denominator, scaled.denominator);
  }

  drawValid(width, height, state, next, index) {
    const margin = width < 560 ? 34 : 65;
    const centerScaled = scaleByInversePower10(this.result.interval.center, state.exponent);
    const base = floorDiv(centerScaled.numerator, centerScaled.denominator);
    const lower = this.scaledLocal(this.result.interval.lower, state.exponent, base);
    const center = this.scaledLocal(this.result.interval.center, state.exponent, base);
    const upper = this.scaledLocal(this.result.interval.upper, state.exponent, base);
    const first = Number(state.first - base);
    const last = Number(state.last - base);
    const candidate = Number(state.candidate - base);
    let domainMin = Math.min(lower, first, candidate) - 1.5;
    let domainMax = Math.max(upper, last, candidate) + 1.5;
    if (domainMax - domainMin < 12) {
      const extra = (12 - (domainMax - domainMin)) / 2;
      domainMin -= extra;
      domainMax += extra;
    }
    const x = (value) => margin + (value - domainMin) / (domainMax - domainMin) * (width - 2 * margin);
    const intervalY = 88;
    const intervalHeight = 92;
    append(this.svg, "text", { x: margin, y: 30, class: "lane-label" }, `PROJECTED PARSING INTERVAL · GRID 10^${state.exponent}`);
    append(this.svg, "rect", { x: x(lower), y: intervalY, width: Math.max(2, x(upper) - x(lower)), height: intervalHeight, rx: 4, class: "interval-drawer" });
    append(this.svg, "line", { x1: x(center), x2: x(center), y1: 60, y2: 260, class: "value-line" });
    const centerMark = append(this.svg, "g", { class: "value-mark" });
    append(centerMark, "circle", { cx: x(center), cy: intervalY + intervalHeight / 2, r: 8 });
    append(centerMark, "text", { x: x(center), y: intervalY + intervalHeight / 2 - 17, "text-anchor": "middle" }, "stored value");
    activate(centerMark, { title: "Exact stored value", heading: "The center of the projected interval", body: `The exact binary value is shown in units of 10^${state.exponent}.`, exact: exactRational(this.result.interval.center) }, this);
    for (const [kind, coordinate] of [["lower", lower], ["upper", upper]]) {
      const mark = append(this.svg, "g", { class: `boundary-mark ${this.result.interval.closed ? "included" : "excluded"}` });
      append(mark, "line", { x1: x(coordinate), x2: x(coordinate), y1: intervalY - 8, y2: intervalY + intervalHeight + 8 });
      append(mark, "circle", { cx: x(coordinate), cy: intervalY + intervalHeight / 2, r: 6 });
      activate(mark, { title: `${kind} boundary — ${this.result.interval.closed ? "included" : "excluded"}`, heading: `${kind[0].toUpperCase()}${kind.slice(1)} parsing boundary`, body: `A decimal exactly here is ${this.result.interval.closed ? "accepted" : "rejected"} by round-to-nearest, ties-to-even for this input.`, exact: exactRational(this.result.interval[kind]) }, this);
    }

    const gridY = 260;
    axis(this.svg, margin, width - margin, gridY, `CURRENT DECIMAL GRID · ${state.last - state.first + 1n} ADMISSIBLE`);
    const count = state.last - state.first + 1n;
    if (count <= 30n) {
      for (let value = state.first; value <= state.last; value++) {
        const role = value === state.candidate ? "nearest" : value === state.first ? "lower bound" : value === state.last ? "upper bound" : "";
        this.drawIntegerMark(x(Number(value - base)), gridY, value, value === state.candidate, state.exponent, width > 700 && count <= 8n ? compact(value) : role);
      }
    } else {
      this.drawIntegerMark(x(first), gridY, state.first, state.first === state.candidate, state.exponent, "lower bound");
      if (state.candidate !== state.first && state.candidate !== state.last) this.drawIntegerMark(x(candidate), gridY, state.candidate, true, state.exponent, "nearest");
      this.drawIntegerMark(x(last), gridY, state.last, state.last === state.candidate, state.exponent, "upper bound");
      append(this.svg, "text", { x: (x(first) + x(last)) / 2, y: gridY + 44, "text-anchor": "middle", class: "lane-note" }, `${count - 3n} additional admissible integers are compressed in this view`);
    }

    const groupY = 380;
    append(this.svg, "text", { x: margin, y: 340, class: "lane-label" }, next?.valid ? "GROUP TEN FINE CELLS INTO ONE COARSE CELL" : "TRY ONE GRID TEN TIMES COARSER");
    const cellArea = width - 2 * margin;
    const cellWidth = cellArea / 10;
    const remainder = Number((state.candidate % 10n + 10n) % 10n);
    for (let digit = 0; digit < 10; digit++) {
      const cell = append(this.svg, "g", { class: `ryu-group-cell ${digit === remainder ? "active" : ""}` });
      append(cell, "rect", { x: margin + digit * cellWidth, y: groupY, width: cellWidth - 2, height: 58 });
      append(cell, "text", { x: margin + (digit + .5) * cellWidth, y: groupY + 35, "text-anchor": "middle" }, String(digit));
    }
    append(this.svg, "path", { d: `M ${margin} ${groupY + 72} V ${groupY + 82} H ${width - margin} V ${groupY + 72}`, class: "width-bracket" });
    if (next?.valid) {
      append(this.svg, "text", { x: width / 2, y: groupY + 108, "text-anchor": "middle", class: "width-label" }, `one coarser cell · at least one integer still survives on 10^${next.exponent}`);
    } else {
      append(this.svg, "text", { x: width / 2, y: groupY + 108, "text-anchor": "middle", class: "ryu-empty-label" }, `no integer survives on 10^${state.exponent + 1} · stop here`);
    }
    this.showDetail({ heading: index === 0 ? "Start deliberately finer than necessary" : `${index} decimal digit${index === 1 ? " has" : "s have"} been removed`, body: next?.valid ? `The current interval contains ${count} integer${count === 1n ? "" : "s"}. Grouping cells by ten still leaves an admissible integer, so the resolution slider may move one place coarser.` : "The current grid is the last one that contains an admissible integer. Its candidate is therefore shortest; the ghost position to the right shows the failed next grid.", exact: `candidate ${state.candidate} × 10^${state.exponent}` });
  }

  drawIntegerMark(x, y, value, selected, exponent, visibleLabel) {
    const mark = append(this.svg, "g", { class: `ryu-integer-mark ${selected ? "selected" : ""}` });
    append(mark, "line", { x1: x, x2: x, y1: y - (selected ? 35 : 23), y2: y + (selected ? 35 : 23) });
    append(mark, "circle", { cx: x, cy: y, r: selected ? 8 : 5 });
    if (visibleLabel) append(mark, "text", { x, y: y + (selected ? 59 : 48), "text-anchor": "middle" }, visibleLabel);
    activate(mark, { title: `${value} × 10^${exponent}${selected ? " — nearest candidate" : ""}`, heading: selected ? "Nearest admissible integer" : "Admissible integer", body: `This integer lies inside the projected parsing interval on the 10^${exponent} grid.`, exact: `${value} × 10^${exponent}` }, this);
  }

  drawGhost(width, height, previous) {
    const margin = width < 560 ? 34 : 65;
    append(this.svg, "text", { x: margin, y: 34, class: "lane-label" }, `ONE STEP TOO COARSE · GRID 10^${previous.exponent + 1}`);
    const centerX = width / 2;
    append(this.svg, "rect", { x: margin, y: 80, width: width - 2 * margin, height: 112, rx: 4, class: "ryu-empty-interval" });
    append(this.svg, "line", { x1: margin, x2: width - margin, y1: 250, y2: 250, class: "grid-axis" });
    append(this.svg, "circle", { cx: centerX, cy: 250, r: 7, class: "ghost-grid-point" });
    append(this.svg, "path", { d: `M ${centerX} 213 v 27`, class: "projection-arrow" });
    append(this.svg, "text", { x: centerX, y: 138, "text-anchor": "middle", class: "ryu-empty-title" }, "NO DECIMAL-GRID INTEGER LIES INSIDE");
    append(this.svg, "text", { x: centerX, y: 166, "text-anchor": "middle", class: "width-label" }, `the last valid grid was 10^${previous.exponent}`);
    const digits = previous.candidate.toString();
    append(this.svg, "text", { x: margin, y: 350, class: "lane-label" }, "THE LAST VALID INTEGER IS KEPT");
    append(this.svg, "rect", { x: margin, y: 375, width: width - 2 * margin, height: 80, rx: 3, class: "ryu-digit-tape" });
    append(this.svg, "text", { x: width / 2, y: 425, "text-anchor": "middle", class: "ryu-digits" }, `${compact(digits, width < 560 ? 16 : 28)} × 10^${previous.exponent}`);
    this.showDetail({ heading: "The failed grid proves shortestness", body: `The 10^${previous.exponent + 1} grid has no admissible integer. Every still coarser decimal is also represented on that grid, so none can recover the input.`, exact: `last valid candidate ${previous.candidate} × 10^${previous.exponent}; output ${this.result.text}` });
  }
}

class RyuProductWindow extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab product-window-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">Bounded multiplication</span><strong>Retain the product columns that can influence the quotient</strong></div><div class="product-readout"><span>53-bit significand</span><span>× roughly 128-bit scale</span></div></div>
        <svg class="algorithm-svg product-svg" role="img" aria-label="A wide product with a movable retained bit window"></svg>
        <div class="lab-inspector"><strong>Fixed width is a proof obligation, not a guess.</strong><span>The cache precision and shift are chosen so every bit capable of changing the projected integer lies in the retained window.</span></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.render();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  render() {
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const height = 310;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();
    const margin = width < 560 ? 28 : 60;
    const columns = width < 560 ? 32 : 48;
    const cell = (width - 2 * margin) / columns;
    const windowColumns = Math.max(8, Math.floor(columns * .31));
    const start = Math.floor((columns - windowColumns) * .62);
    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    append(this.svg, "text", { x: margin, y: 35, class: "lane-label" }, "CONCEPTUAL WIDE PRODUCT · HIGH COLUMNS ON THE LEFT");
    for (let index = 0; index < columns; index++) {
      const retained = index >= start && index < start + windowColumns;
      const bit = append(this.svg, "rect", { x: margin + index * cell, y: 70, width: cell - 1, height: 105, class: retained ? "product-bit retained" : "product-bit discarded" });
      bit.append(element("title", {}, retained ? "Retained: this column may influence the projected integer." : "Discarded in this projection: the proof shows this column cannot alter the required quotient."));
    }
    append(this.svg, "path", { d: `M ${margin + start * cell} 60 V 48 H ${margin + (start + windowColumns) * cell} V 60`, class: "product-window-bracket" });
    append(this.svg, "text", { x: margin + (start + windowColumns / 2) * cell, y: 28, "text-anchor": "middle", class: "width-label" }, "required quotient window");
    append(this.svg, "text", { x: margin, y: 218, class: "product-zone-label" }, "more significant");
    append(this.svg, "text", { x: width - margin, y: 218, "text-anchor": "end", class: "product-zone-label" }, "discarded fractional columns");
    append(this.svg, "path", { d: `M ${margin} 238 H ${width - margin}`, class: "guard-transform" });
    append(this.svg, "text", { x: width / 2, y: 278, "text-anchor": "middle", class: "width-label" }, "the table entry and shift place the desired integer bits inside this window");
  }
}

if (!customElements.get("ryu-guard-bits")) customElements.define("ryu-guard-bits", RyuGuardBits);
if (!customElements.get("ryu-lattice")) customElements.define("ryu-lattice", RyuLattice);
if (!customElements.get("ryu-product-window")) customElements.define("ryu-product-window", RyuProductWindow);
