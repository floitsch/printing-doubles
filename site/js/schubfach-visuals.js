import { nextUp } from "./float.js";
import { normalizeDecimal, scaleByInversePower10, subtractRational } from "./interval-core.js";
import { exactDecimalOfRational } from "./oracle.js";
import { schubfachExact } from "./schubfach-reference.js";

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

function coordinateAtScale(rational, center, exponent) {
  return rationalNumber(scaleByInversePower10(subtractRational(rational, center), exponent));
}

function compactInteger(value, limit = 21) {
  const text = String(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, 10)}…${text.slice(-7)}`;
}

function exactRational(rational) {
  const decimal = exactDecimalOfRational(rational);
  if (!decimal.includes("/")) return decimal;
  return `${rational.numerator}/${rational.denominator}`;
}

function candidateDisplay(candidate) {
  return normalizeDecimal(candidate.coefficient, candidate.exponent).text;
}

function isSelectedCandidate(candidate, result) {
  return candidate.coefficient === result.selected.coefficient && candidate.exponent === result.selected.exponent;
}

function svgTitle(node, text) {
  node.append(element("title", {}, text));
}

function activate(node, detail, owner) {
  node.setAttribute("tabindex", "0");
  node.setAttribute("role", "button");
  node.classList.add("inspectable-mark");
  svgTitle(node, detail.title);
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
  append(svg, "text", { x: x1, y: y - 25, class: "lane-label" }, label);
}

class SchubfachLemma extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab lemma-lab">
        <div class="algorithm-lab-head">
          <div><span class="lab-kicker">Geometric experiment</span><strong>Move one interval across two linked decimal grids</strong></div>
          <div class="lemma-readout" aria-live="polite"></div>
        </div>
        <div class="lab-controls lemma-controls">
          <label>Interval width <output data-output="width"></output><input data-control="width" type="range" min="12" max="98" value="46"></label>
          <label>Alignment <output data-output="phase"></output><input data-control="phase" type="range" min="0" max="100" value="38"></label>
        </div>
        <svg class="algorithm-svg" role="img" aria-label="A movable interval over fine and coarse decimal grids"></svg>
        <div class="lab-inspector" aria-live="polite"><strong>Try the controls.</strong><span>The fine ticks are one unit apart. Every tenth fine tick is also a coarse tick.</span></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.inspector = this.querySelector(".lab-inspector");
    this.widthControl = this.querySelector('[data-control="width"]');
    this.phaseControl = this.querySelector('[data-control="phase"]');
    this.widthControl.addEventListener("input", () => this.render());
    this.phaseControl.addEventListener("input", () => this.render());
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.render();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  showDetail(detail) {
    this.inspector.innerHTML = `<strong>${detail.heading}</strong><span>${detail.body}</span>`;
  }

  render() {
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const height = width < 560 ? 440 : 400;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();

    const intervalWidth = Number(this.widthControl.value) / 10;
    const center = -5 + Number(this.phaseControl.value) / 10;
    const lower = center - intervalWidth / 2;
    const upper = center + intervalWidth / 2;
    const domain = [-15, 15];
    const margin = width < 560 ? 28 : 55;
    const x = (value) => margin + (value - domain[0]) / (domain[1] - domain[0]) * (width - 2 * margin);
    const inside = (value) => value >= lower && value <= upper;
    const fineInside = [];
    const coarseInside = [];
    for (let tick = -20; tick <= 20; tick++) {
      if (inside(tick)) fineInside.push(tick);
      if (tick % 10 === 0 && inside(tick)) coarseInside.push(tick);
    }

    this.querySelector('[data-output="width"]').textContent = `${intervalWidth.toFixed(1)} fine steps`;
    this.querySelector('[data-output="phase"]').textContent = `${Number(this.phaseControl.value)}%`;
    this.querySelector(".lemma-readout").innerHTML = `<span>Fine grid: <b>${fineInside.length}</b> inside</span><span>Coarse grid: <b>${coarseInside.length}</b> inside</span>`;

    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    const bandY = 64;
    const bandHeight = 82;
    append(this.svg, "text", { x: margin, y: 32, class: "lane-label" }, "ONE PARSING INTERVAL — THE DRAWER");
    append(this.svg, "rect", { x: x(lower), y: bandY, width: x(upper) - x(lower), height: bandHeight, rx: 4, class: "interval-drawer" });
    append(this.svg, "circle", { cx: x(lower), cy: bandY + bandHeight / 2, r: 6, class: "endpoint included" });
    append(this.svg, "circle", { cx: x(upper), cy: bandY + bandHeight / 2, r: 6, class: "endpoint included" });
    const intervalMark = append(this.svg, "rect", { x: x(lower), y: bandY, width: Math.max(12, x(upper) - x(lower)), height: bandHeight, class: "interaction-overlay" });
    activate(intervalMark, {
      title: `Interval width ${intervalWidth.toFixed(1)} fine-grid steps`,
      heading: "The drawer",
      body: `Its width is ${intervalWidth.toFixed(1)} times the fine spacing and ${(intervalWidth / 10).toFixed(2)} times the coarse spacing. The experiment keeps it strictly wider than one fine step and strictly narrower than one coarse step.`,
    }, this);

    const lanes = [{ y: 235, step: 10, label: "COARSE GRID — TEN TIMES FARTHER APART", kind: "coarse" }, { y: 345, step: 1, label: "FINE GRID", kind: "fine" }];
    for (const lane of lanes) {
      axis(this.svg, margin, width - margin, lane.y, lane.label);
      for (let tick = -20; tick <= 20; tick += lane.step) {
        if (tick < domain[0] || tick > domain[1]) continue;
        const hit = inside(tick);
        const group = append(this.svg, "g", { class: `grid-tick ${lane.kind} ${hit ? "inside" : "outside"}` });
        const tickHeight = lane.kind === "coarse" ? 58 : tick % 5 === 0 ? 46 : 30;
        append(group, "line", { x1: x(tick), x2: x(tick), y1: lane.y - tickHeight / 2, y2: lane.y + tickHeight / 2 });
        if (lane.kind === "coarse" || (width > 600 && tick % 5 === 0)) append(group, "text", { x: x(tick), y: lane.y + tickHeight / 2 + 22, "text-anchor": "middle" }, String(tick));
        activate(group, {
          title: `${lane.kind} grid point ${tick}: ${hit ? "inside" : "outside"}`,
          heading: `${lane.kind === "fine" ? "Fine" : "Coarse"} grid point ${tick}`,
          body: hit
            ? `This point lies inside the interval. ${lane.kind === "coarse" ? "No second coarse point can fit because adjacent coarse points are ten fine steps apart." : "The fine grid therefore cannot miss this alignment."}`
            : `This point is outside the interval. Its distance from the interval is ${Math.min(Math.abs(tick - lower), Math.abs(tick - upper)).toFixed(2)} fine steps.`,
        }, this);
      }
    }

    append(this.svg, "path", { d: `M ${x(lower)} ${bandY + bandHeight + 12} V 185 H ${x(upper)} V ${bandY + bandHeight + 12}`, class: "width-bracket" });
    append(this.svg, "text", { x: (x(lower) + x(upper)) / 2, y: 178, "text-anchor": "middle", class: "width-label" }, `${intervalWidth.toFixed(1)} × fine spacing; ${(intervalWidth / 10).toFixed(2)} × coarse spacing`);
  }
}

class SchubfachCandidates extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab candidate-lab">
        <div class="algorithm-lab-head">
          <div><span class="lab-kicker">Exact candidate laboratory</span><strong>Two grids around one actual binary64 value</strong></div>
          <output class="candidate-result" aria-live="polite"></output>
        </div>
        <form class="candidate-input">
          <label for="schubfach-value">Binary64 value</label>
          <div><input id="schubfach-value" name="value" value="0.3" inputmode="decimal"><button type="submit">Inspect</button></div>
          <p class="input-message"></p>
        </form>
        <div class="lab-presets" aria-label="Example values">
          <button type="button" data-value="0.3">coarse hit · 0.3</button>
          <button type="button" data-value="nextUp1">coarse miss · nextUp(1)</button>
          <button type="button" data-value="0.06250000000290681">two admissible fine neighbors</button>
          <button type="button" data-value="2">asymmetric interval · 2</button>
          <button type="button" data-value="5e-324">smallest subnormal</button>
        </div>
        <div class="candidate-facts"></div>
        <svg class="algorithm-svg candidate-svg" role="img" aria-label="The parsing interval and Schubfach's fine and coarse decimal candidates"></svg>
        <div class="lab-inspector" aria-live="polite"></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.inspector = this.querySelector(".lab-inspector");
    this.form = this.querySelector("form");
    this.input = this.querySelector("input");
    this.message = this.querySelector(".input-message");
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.selectValue(Number(this.input.value));
    });
    for (const button of this.querySelectorAll(".lab-presets button")) button.addEventListener("click", () => {
      const value = button.dataset.value === "nextUp1" ? nextUp(1) : Number(button.dataset.value);
      this.input.value = button.dataset.value === "nextUp1" ? "1.0000000000000002" : button.dataset.value;
      this.selectValue(value);
    });
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.selectValue(0.3);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  selectValue(value) {
    if (!Number.isFinite(value) || value === 0) {
      this.message.textContent = "Enter a finite, nonzero value. Signs are accepted; the diagram uses its magnitude.";
      return;
    }
    this.message.textContent = value < 0 ? "The diagram uses the magnitude; the selected output restores the minus sign." : "";
    this.value = value;
    this.result = schubfachExact(value);
    this.render();
  }

  showDetail(detail) {
    this.inspector.innerHTML = `<strong>${detail.heading}</strong><span>${detail.body}</span>${detail.exact ? `<code>${detail.exact}</code>` : ""}`;
  }

  render() {
    if (!this.result) return;
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const height = width < 560 ? 520 : 470;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();

    const result = this.result;
    const interval = result.interval;
    const k = result.k;
    const scaledCenter = scaleByInversePower10(interval.center, k);
    const fraction = bigintRatio(scaledCenter.numerator - result.s * scaledCenter.denominator, scaledCenter.denominator);
    const lower = coordinateAtScale(interval.lower, interval.center, k);
    const upper = coordinateAtScale(interval.upper, interval.center, k);
    const fine = result.fine.map((candidate) => ({ ...candidate, coordinate: coordinateAtScale(candidate.rational, interval.center, k), grid: "fine" }));
    const coarseItems = result.coarse?.map((candidate) => ({ ...candidate, coordinate: coordinateAtScale(candidate.rational, interval.center, k), grid: "coarse" })) || [];
    const baseCoarse = Number(result.s / 10n * 10n - result.s) - fraction;
    const important = [lower, upper, ...fine.map((item) => item.coordinate), ...coarseItems.map((item) => item.coordinate), baseCoarse, baseCoarse + 10];
    let domainMin = Math.min(...important) - 1.6;
    let domainMax = Math.max(...important) + 1.6;
    const span = domainMax - domainMin;
    if (span < 22) {
      domainMin -= (22 - span) / 2;
      domainMax += (22 - span) / 2;
    }
    const margin = width < 560 ? 28 : 58;
    const x = (coordinate) => margin + (coordinate - domainMin) / (domainMax - domainMin) * (width - 2 * margin);

    this.querySelector(".candidate-result").innerHTML = `<span>selected</span><strong>${result.text}</strong><small>${result.path === "coarse" ? "coarser grid wins" : "fine grid required"}</small>`;
    this.querySelector(".candidate-facts").innerHTML = `
      <p><span>Interval width selects</span><strong>k = ${k}</strong><small>fine spacing 10<sup>${k}</sup></small></p>
      <p><span>Adjacent coarse grid</span><strong>10<sup>${k + 1}</sup></strong><small>ten times wider</small></p>
      <p><span>Endpoints</span><strong>${interval.closed ? "included" : "excluded"}</strong><small>binary significand ends in ${interval.closed ? "0" : "1"}</small></p>`;

    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    const bandY = 56;
    const bandHeight = 102;
    append(this.svg, "text", { x: margin, y: 28, class: "lane-label" }, "PARSING INTERVAL FOR THE SELECTED BINARY64 VALUE");
    append(this.svg, "rect", { x: x(lower), y: bandY, width: x(upper) - x(lower), height: bandHeight, rx: 4, class: "interval-drawer" });
    append(this.svg, "line", { x1: x(0), x2: x(0), y1: 38, y2: height - 35, class: "value-line" });
    const valueMark = append(this.svg, "g", { class: "value-mark" });
    append(valueMark, "circle", { cx: x(0), cy: bandY + bandHeight / 2, r: 8 });
    append(valueMark, "text", { x: x(0), y: bandY + bandHeight / 2 - 18, "text-anchor": "middle" }, "stored value");
    activate(valueMark, {
      title: `Stored binary64 value ${this.value}`,
      heading: "The selected binary64 value",
      body: `The browser displays it compactly as ${this.value}, but its exact value is shown below. The diagram uses distances measured in units of 10^${k}.`,
      exact: exactRational(interval.center),
    }, this);

    for (const [kind, coordinate] of [["lower", lower], ["upper", upper]]) {
      const endpoint = append(this.svg, "g", { class: `boundary-mark ${interval.closed ? "included" : "excluded"}` });
      append(endpoint, "line", { x1: x(coordinate), x2: x(coordinate), y1: bandY - 9, y2: bandY + bandHeight + 9 });
      append(endpoint, "circle", { cx: x(coordinate), cy: bandY + bandHeight / 2, r: 6 });
      activate(endpoint, {
        title: `${kind} midpoint — ${interval.closed ? "included" : "excluded"}`,
        heading: `${kind[0].toUpperCase()}${kind.slice(1)} parsing boundary`,
        body: `This is the midpoint between the selected value and its ${kind === "lower" ? "predecessor" : "successor"}. It is ${interval.closed ? "included because the selected binary significand is even" : "excluded because the selected binary significand is odd"}.`,
        exact: exactRational(interval[kind]),
      }, this);
    }

    const lanes = [{ y: 275, label: `COARSE GRID · 10^${k + 1}`, kind: "coarse" }, { y: 400, label: `FINE GRID · 10^${k}`, kind: "fine" }];
    for (const lane of lanes) axis(this.svg, margin, width - margin, lane.y, lane.label);

    const fineStart = Math.floor(domainMin + fraction) - 1;
    const fineEnd = Math.ceil(domainMax + fraction) + 1;
    for (let n = fineStart; n <= fineEnd; n++) {
      const coordinate = n - fraction;
      if (coordinate < domainMin || coordinate > domainMax) continue;
      const activeCandidate = fine.find((item) => Math.abs(item.coordinate - coordinate) < 1e-8);
      const group = append(this.svg, "g", { class: `grid-tick fine ${activeCandidate ? "candidate" : "context"}` });
      append(group, "line", { x1: x(coordinate), x2: x(coordinate), y1: 382, y2: 423 });
      if (activeCandidate) this.drawCandidate(group, activeCandidate, x(coordinate), 400, result);
    }

    for (let coordinate = baseCoarse - 20; coordinate <= domainMax + 20; coordinate += 10) {
      if (coordinate < domainMin || coordinate > domainMax) continue;
      const activeCandidate = coarseItems.find((item) => Math.abs(item.coordinate - coordinate) < 1e-8);
      const group = append(this.svg, "g", { class: `grid-tick coarse ${activeCandidate ? "candidate" : "context"}` });
      append(group, "line", { x1: x(coordinate), x2: x(coordinate), y1: 244, y2: 306 });
      if (activeCandidate) this.drawCandidate(group, activeCandidate, x(coordinate), 275, result);
    }

    if (!result.coarse) {
      append(this.svg, "text", { x: width - margin, y: 250, "text-anchor": "end", class: "lane-note" }, "tiny-value form: coarse positive candidate omitted");
    }

    this.showDetail({
      heading: result.path === "coarse" ? "The coarser grid contains one admissible point" : "The coarser grid misses; the fine grid decides",
      body: result.path === "coarse"
        ? `${candidateDisplay(result.selected)} lies inside the parsing interval. Because the coarse grid is wider than the interval, a second coarse candidate cannot also fit.`
        : `No coarse candidate is admissible. At least one of the two fine neighbors must be inside; membership is tested before distance.`,
      exact: `output = ${result.text}`,
    });
  }

  drawCandidate(group, candidate, x, y, result) {
    const selected = isSelectedCandidate(candidate, result);
    group.classList.toggle("inside", candidate.inside);
    group.classList.toggle("outside", !candidate.inside);
    group.classList.toggle("selected", selected);
    append(group, "circle", { cx: x, cy: y, r: selected ? 10 : 7, class: "candidate-dot" });
    const display = candidateDisplay(candidate);
    if (candidate.grid === "coarse") {
      append(group, "text", { x, y: y - 45, "text-anchor": "middle", class: "candidate-label" }, compactInteger(display, 24));
    } else {
      const lower = candidate.coordinate < 0;
      append(group, "path", { d: `M ${x} ${y + 12} L ${x + (lower ? -10 : 10)} ${y + 35}`, class: "candidate-leader" });
      append(group, "text", { x: x + (lower ? -13 : 13), y: y + 52, "text-anchor": lower ? "end" : "start", class: "candidate-label" }, lower ? "lower fine" : "upper fine");
    }
    const membership = candidate.inside ? "inside" : "outside";
    activate(group, {
      title: `${display} — ${membership}${selected ? ", selected" : ""}`,
      heading: `${candidate.grid === "coarse" ? "Coarse" : "Fine"} candidate ${display}`,
      body: `${display} is ${membership} the parsing interval${selected ? " and is the selected result" : ""}. ${candidate.grid === "coarse" ? "A surviving coarse candidate wins before any fine-grid distance comparison because it has fewer significant digits." : "Fine candidates are considered only after the coarse grid is empty."}`,
      exact: `coefficient ${candidate.coefficient} × 10^${candidate.exponent}; distance numerator ${candidate.distance.numerator}/${candidate.distance.denominator}`,
    }, this);
  }
}

class RoundToOddLab extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab odd-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">Comparison-preserving projection</span><strong>Replace a fractional position by one odd bit of evidence</strong></div><div class="odd-readout"></div></div>
        <div class="lab-controls odd-controls">
          <label>Exact position <output data-output="position"></output><input data-control="position" type="range" min="0" max="64" value="37"></label>
          <label>Even threshold <select data-control="threshold"><option>2</option><option selected>4</option><option>6</option></select></label>
        </div>
        <svg class="algorithm-svg odd-svg" role="img" aria-label="An exact position and its round-to-odd representative compared with an even threshold"></svg>
        <div class="lab-inspector"><strong>The odd representative is not the final decimal rounding rule.</strong><span>It records whether a discarded fractional part existed while preserving comparisons with even thresholds.</span></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.position = this.querySelector('[data-control="position"]');
    this.threshold = this.querySelector('[data-control="threshold"]');
    this.position.addEventListener("input", () => this.render());
    this.threshold.addEventListener("change", () => this.render());
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.render();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  render() {
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const height = 285;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();
    const exact = Number(this.position.value) / 8;
    const threshold = Number(this.threshold.value);
    const representative = Number.isInteger(exact) && exact % 2 === 0 ? exact : Math.floor(exact / 2) * 2 + 1;
    const compare = (value) => value < threshold ? "below" : value > threshold ? "above" : "equal";
    const margin = width < 560 ? 30 : 60;
    const x = (value) => margin + value / 8 * (width - 2 * margin);
    this.querySelector('[data-output="position"]').textContent = exact.toFixed(3).replace(/\.000$/, "");
    this.querySelector(".odd-readout").innerHTML = `<span>ro(x) = <b>${representative}</b></span><span>both are <b>${compare(exact)}</b> ${threshold}</span>`;
    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    axis(this.svg, margin, width - margin, 105, "EXACT SCALED POSITION");
    axis(this.svg, margin, width - margin, 215, "RETAINED INTEGER REPRESENTATIVE");
    for (let tick = 0; tick <= 8; tick++) {
      const even = tick % 2 === 0;
      for (const y of [105, 215]) append(this.svg, "line", { x1: x(tick), x2: x(tick), y1: y - (even ? 25 : 15), y2: y + (even ? 25 : 15), class: even ? "odd-even-tick" : "odd-tick" });
      append(this.svg, "text", { x: x(tick), y: 255, "text-anchor": "middle", class: "tick-number" }, String(tick));
    }
    append(this.svg, "rect", { x: x(Math.floor(exact / 2) * 2), y: 66, width: x(Math.min(8, Math.floor(exact / 2) * 2 + 2)) - x(Math.floor(exact / 2) * 2), height: 78, class: "odd-cell" });
    append(this.svg, "line", { x1: x(threshold), x2: x(threshold), y1: 48, y2: 247, class: "odd-threshold" });
    append(this.svg, "text", { x: x(threshold), y: 30, "text-anchor": "middle", class: "width-label" }, `even threshold ${threshold}`);
    append(this.svg, "circle", { cx: x(exact), cy: 105, r: 9, class: "exact-dot" });
    append(this.svg, "path", { d: `M ${x(exact)} 125 C ${x(exact)} 165, ${x(representative)} 165, ${x(representative)} 195`, class: "projection-arrow" });
    append(this.svg, "circle", { cx: x(representative), cy: 215, r: 10, class: `representative-dot ${representative % 2 ? "odd" : "even"}` });
  }
}

if (!customElements.get("schubfach-lemma")) customElements.define("schubfach-lemma", SchubfachLemma);
if (!customElements.get("schubfach-candidates")) customElements.define("schubfach-candidates", SchubfachCandidates);
if (!customElements.get("round-to-odd-lab")) customElements.define("round-to-odd-lab", RoundToOddLab);
