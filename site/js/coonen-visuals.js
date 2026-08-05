import { coonenBReference } from "./coonen-reference.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PRESETS = [
  { label: "small · 0.00135", value: 0.00135, digits: 4 },
  { label: "large · 135000", value: 135000, digits: 4 },
  { label: "carry correction · 9.999", value: 9.999, digits: 3 },
  { label: "fixed width · 1/3", value: 1 / 3, digits: 5 },
];

function element(name, attributes = {}, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}
function append(parent, name, attributes, text) { const node = element(name, attributes, text); parent.append(node); return node; }
function inspect(node, detail, owner) {
  node.setAttribute("tabindex", "0"); node.setAttribute("role", "button"); node.classList.add("inspectable-mark"); node.append(element("title", {}, detail.title));
  const show = () => owner.showDetail(detail);
  node.addEventListener("mouseenter", show); node.addEventListener("focus", show); node.addEventListener("click", show);
  node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(); } });
}

class CoonenScaleLab extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab coonen-scale-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">Fixed-precision scaling map</span><strong>Move the value into the requested integer window, then round once</strong></div><output class="candidate-result coonen-result"></output></div>
        <form class="coonen-controls">
          <label>Binary64 value<input name="value" value="0.00135" inputmode="decimal"></label>
          <label>Significant digits<input name="digits" type="number" min="1" max="17" value="4"></label>
          <label>Rounding<select name="mode"><option value="nearest">nearest, ties to even</option><option value="zero">toward zero</option><option value="up">toward +∞</option><option value="down">toward −∞</option></select></label>
          <button type="submit">Convert</button><p class="input-message"></p>
        </form>
        <div class="lab-presets coonen-presets">${PRESETS.map((preset) => `<button type="button">${preset.label}</button>`).join("")}</div>
        <div class="candidate-facts coonen-facts"></div>
        <div class="coonen-transform" aria-label="Coonen scaling transformation">
          <article class="coonen-stage source"><span>stored input</span><strong></strong><small></small></article>
          <div class="coonen-arrow"><span></span><b>→</b><small>decimal scale</small></div>
          <article class="coonen-stage scaled"><span>scaled exact control</span><strong></strong><small></small></article>
          <div class="coonen-arrow round"><span>round once</span><b>→</b><small></small></div>
          <article class="coonen-stage output"><span>N-digit coefficient</span><strong></strong><small></small></article>
        </div>
        <svg class="algorithm-svg coonen-window-svg" role="img" aria-label="The scaled value and rounded coefficient in the requested N-digit integer window"></svg>
        <div class="lab-inspector" aria-live="polite"></div>
      </div>`;
    this.svg = this.querySelector("svg"); this.inspector = this.querySelector(".lab-inspector");
    this.form = this.querySelector("form"); this.message = this.querySelector(".input-message");
    this.form.addEventListener("submit", (event) => { event.preventDefault(); this.compute(); });
    this.form.querySelectorAll("select,input[type=number]").forEach((control) => control.addEventListener("change", () => this.compute()));
    this.querySelectorAll(".coonen-presets button").forEach((button, index) => button.addEventListener("click", () => {
      const preset = PRESETS[index]; this.form.elements.value.value = String(preset.value); this.form.elements.digits.value = String(preset.digits); this.compute();
    }));
    this.resizeObserver = new ResizeObserver(() => this.render()); this.resizeObserver.observe(this.svg); this.compute();
  }
  disconnectedCallback() { this.resizeObserver?.disconnect(); }
  showDetail(detail) { this.inspector.innerHTML = `<strong>${detail.heading}</strong><span>${detail.body}</span>${detail.exact ? `<code>${detail.exact}</code>` : ""}`; }
  compute() {
    const value = Number(this.form.elements.value.value); const digits = Number(this.form.elements.digits.value); const mode = this.form.elements.mode.value;
    try { this.result = coonenBReference(value, digits, mode); this.value = value; this.message.textContent = ""; this.render(); }
    catch (error) { this.message.textContent = error.message; }
  }
  render() {
    if (!this.result) return;
    const r = this.result; const absCoefficient = r.coefficient < 0n ? -r.coefficient : r.coefficient;
    const exactScaled = `${r.scaled.numerator}/${r.scaled.denominator}`;
    const scaledNumber = Number(r.scaled.numerator) / Number(r.scaled.denominator);
    const lower = 10 ** (r.digits - 1); const upper = 10 ** r.digits;
    this.querySelector(".coonen-result").innerHTML = `<span>fixed-precision result</span><strong>${r.text}</strong><small>${r.coefficient} × 10^${r.decimalExponent}</small>`;
    const places = Math.abs(r.scale);
    this.querySelector(".coonen-facts").innerHTML = `<p><span>Decimal decade</span><strong>10^${r.scientificExponent}</strong><small>the leading digit has this weight</small></p><p><span>Scale into ${r.digits} digits</span><strong>× 10^${r.scale}</strong><small>${r.scale >= 0 ? "move right" : "move left"} ${places} ${places === 1 ? "place" : "places"}</small></p><p><span>Correction passes</span><strong>${r.passes}</strong><small>${r.passes === 2 ? "rounding carried into the next decade" : "no decade retry"}</small></p>`;
    const stages = this.querySelectorAll(".coonen-stage");
    stages[0].querySelector("strong").textContent = this.value.toPrecision(17); stages[0].querySelector("small").textContent = `binary64 called ${this.form.elements.value.value}`;
    stages[1].querySelector("strong").textContent = Number.isFinite(scaledNumber) ? scaledNumber.toPrecision(Math.min(17, r.digits + 5)) : "exact rational"; stages[1].querySelector("small").textContent = `[${lower}, ${upper}) before rounding`;
    stages[2].querySelector("strong").textContent = r.coefficient.toString(); stages[2].querySelector("small").textContent = `saved exponent ${r.decimalExponent}`;
    this.querySelector(".coonen-arrow:not(.round) span").textContent = `× 10^${r.scale}`;
    this.querySelector(".coonen-arrow.round small").textContent = this.form.elements.mode.options[this.form.elements.mode.selectedIndex].text;

    const width = Math.max(320, Math.round(this.svg.clientWidth || 900)); const mobile = width < 560; const height = mobile ? 330 : 280;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`); this.svg.replaceChildren(); append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });
    const left = mobile ? 30 : 65; const right = width - left; const span = right - left; const y = 135;
    append(this.svg, "text", { x: left, y: 40, class: "lane-label" }, `${r.digits}-DIGIT INTEGER WINDOW`);
    append(this.svg, "rect", { x: left, y: 76, width: span, height: 105, class: "coonen-target-window" });
    append(this.svg, "text", { x: left + 10, y: 98, class: "coonen-window-label" }, `${lower}`);
    append(this.svg, "text", { x: right - 10, y: 98, class: "coonen-window-label", "text-anchor": "end" }, `${upper} excluded`);
    const logarithmic = (number) => left + (Math.log10(Math.max(lower, Math.min(upper, number))) - (r.digits - 1)) * span;
    const scaledMagnitude = Math.abs(scaledNumber);
    const scaledX = scaledMagnitude < lower ? left - 14 : scaledMagnitude >= upper ? right + 14 : logarithmic(scaledMagnitude);
    const roundedX = logarithmic(Number(absCoefficient));
    const scaled = append(this.svg, "g", { class: "coonen-scaled-mark" }); append(scaled, "line", { x1: scaledX, y1: 108, x2: scaledX, y2: 170 }); append(scaled, "circle", { cx: scaledX, cy: 125, r: 6 }); append(scaled, "text", { x: scaledX, y: 203, "text-anchor": scaledX > right - 100 ? "end" : "middle" }, "scaled binary64 value");
    inspect(scaled, { title: "Exact scaled control", heading: "This is where a finite binary implementation accumulates error", body: "The displayed marker uses the exact-rational control. Coonen’s real extended implementation must bound errors from constructing the power of ten and multiplying by it.", exact: exactScaled }, this);
    const rounded = append(this.svg, "g", { class: "coonen-rounded-mark" }); append(rounded, "line", { x1: roundedX, y1: 112, x2: roundedX, y2: 178 }); append(rounded, "circle", { cx: roundedX, cy: 158, r: 7 }); append(rounded, "text", { x: roundedX, y: 230, "text-anchor": roundedX < left + 100 ? "start" : "middle" }, `integer ${r.coefficient}`);
    inspect(rounded, { title: "Rounded N-digit coefficient", heading: "One rounding operation produces the complete field", body: `The caller requested ${r.digits} significant digits. Algorithm B does not ask whether fewer would recover the input.`, exact: `${r.coefficient} × 10^${r.decimalExponent} = ${r.text}` }, this);
    if (r.passes === 2) append(this.svg, "text", { x: width / 2, y: mobile ? 285 : 260, class: "coonen-retry-note", "text-anchor": "middle" }, "FIRST ROUNDING REACHED 10^N · INCREMENT THE DECADE AND SCALE AGAIN ONCE");
    this.showDetail({ heading: r.passes === 2 ? "The one-retry correction is active" : "The requested field is produced by one scale and one rounding", body: r.passes === 2 ? "The first scaled value rounded to a coefficient with N+1 digits. Restoring the input and increasing LOGX moves it into the correct window." : "The exact control separates the algorithmic idea from the still-unimplemented extended-format error proof.", exact: `${r.text}; coefficient ${r.coefficient}; scientific decade ${r.scientificExponent}` });
  }
}
if (!customElements.get("coonen-scale-lab")) customElements.define("coonen-scale-lab", CoonenScaleLab);
