import { smallestNormalBoundaryModel, toothlessStudy, TOOTHLESS_OBLIGATIONS } from "./toothless-reference.js";

const EXPONENTS = [
  { value: 3, label: "10³ · exact quickly" },
  { value: 16, label: "10¹⁶ · exact at 39 bits" },
  { value: 32, label: "10³² · bounded ratio" },
  { value: 100, label: "10¹⁰⁰ · semiconvergent" },
  { value: 308, label: "10³⁰⁸ · range edge" },
];

function compact(value, width = 11) {
  const text = value.toString();
  return text.length <= width * 2 + 1 ? text : `${text.slice(0, width)}…${text.slice(-width)}`;
}

function errorLabel(error) {
  if (error.numerator === 0n) return "exact";
  return `≈ 10^${error.log10.toFixed(2)}`;
}

function sideLabel(side) {
  return side < 0 ? "below target" : side > 0 ? "above target" : "exact";
}

export class ToothlessLadder extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="algorithm-lab toothless-lab">
      <div class="algorithm-lab-head"><div><span class="lab-kicker">Executable mathematical reconstruction</span><strong>Climb toward an exact decimal scale, then stop at the word ceiling</strong></div><output class="candidate-result toothless-result"></output></div>
      <div class="toothless-controls"><label>Exact target<select>${EXPONENTS.map(item => `<option value="${item.value}" ${item.value === 100 ? "selected" : ""}>${item.label}</option>`).join("")}</select></label><label>Magnitude budget<strong><output>63 bits</output></strong><input type="range" min="8" max="63" step="1" value="63"></label></div>
      <div class="toothless-target"><span>normalized target</span><code></code><small></small></div>
      <div class="rung-scroll"><div class="cf-rungs"></div></div>
      <div class="threshold-lens"><header><span>Decision-threshold microscope</span><strong></strong></header><div class="lens-track"><i class="cached"><b>cached ratio</b></i><i class="threshold"><b>synthetic threshold</b></i><i class="exact"><b>exact scale</b></i></div><div class="lens-facts"></div></div>
      <div class="proof-bridge"><header><span>Proof bridge</span><strong>Passing examples do not fill the missing spans</strong></header><div>${TOOTHLESS_OBLIGATIONS.map(item => `<button type="button" class="${item.status}" title="${item.detail}"><span>${item.status}</span><strong>${item.label}</strong><small>${item.detail}</small></button>`).join("")}</div></div>
      <div class="lab-inspector"><strong>Select a rung or obligation</strong><span>The selected cache ratio is computed here from the exact continued fraction. It is a mathematical reconstruction, not a claim that the unpublished table has been certified.</span><code></code></div>
    </div>`;
    this.exponent = this.querySelector("select");
    this.budget = this.querySelector('input[type="range"]');
    this.exponent.addEventListener("change", () => this.render());
    this.budget.addEventListener("input", () => this.render());
    this.querySelectorAll(".proof-bridge button").forEach(button => this.bindInspector(button, button.querySelector("strong").textContent, button.querySelector("small").textContent, button.querySelector("span").textContent));
    this.render();
  }

  bindInspector(element, title, detail, code) {
    const inspector = this.querySelector(".lab-inspector");
    const inspect = () => {
      inspector.querySelector("strong").textContent = title;
      inspector.querySelector("span").textContent = detail;
      inspector.querySelector("code").textContent = code;
    };
    element.addEventListener("click", inspect);
    element.addEventListener("focus", inspect);
    element.addEventListener("mouseenter", inspect);
  }

  render() {
    const result = toothlessStudy(Number(this.exponent.value), Number(this.budget.value));
    const selected = result.selected;
    this.querySelector(".toothless-controls output").textContent = `${result.magnitudeBits} bits`;
    this.querySelector(".toothless-result").innerHTML = `<span>${selected.kind} · ${sideLabel(selected.side)}</span><strong>${compact(selected.numerator)} / ${compact(selected.denominator)}</strong><small>${errorLabel(selected.error)}</small>`;
    this.querySelector(".toothless-target code").textContent = `${compact(result.target.numerator, 14)} / ${compact(result.target.denominator, 14)}`;
    this.querySelector(".toothless-target small").textContent = `2^${result.target.binaryExponent} / 10^${result.target.decimalExponent}, reduced to ${result.targetNumeratorBits} numerator bits and ${result.targetDenominatorBits} denominator bits`;
    const rungs = this.querySelector(".cf-rungs");
    rungs.innerHTML = result.rungs.map((rung, index) => `<button type="button" class="cf-rung ${index === result.rungs.length - 1 ? "selected" : ""}" title="${rung.numerator}/${rung.denominator}; ${errorLabel(rung.error)}"><span>${rung.kind === "convergent" ? `C${rung.index}` : `S${rung.index}`}</span><strong>${compact(rung.numerator, 7)}<i>/</i>${compact(rung.denominator, 7)}</strong><small>${sideLabel(rung.side)} · ${errorLabel(rung.error)}</small></button>`).join("") + `<div class="word-wall"><span>${result.magnitudeBits}-bit ceiling</span><strong>larger next rung</strong></div>`;
    rungs.querySelectorAll(".cf-rung").forEach((rungElement, index) => {
      const rung = result.rungs[index];
      const detail = `${rung.kind === "convergent" ? "Full convergent" : `Semiconvergent with multiplier ${rung.multiplier}`} ${rung.numerator}/${rung.denominator}; ${sideLabel(rung.side)}; absolute error ${errorLabel(rung.error)}.`;
      this.bindInspector(rungElement, `${rung.kind} ${rung.index}`, detail, `${rung.numerator}/${rung.denominator}`);
    });
    const scroll = this.querySelector(".rung-scroll");
    scroll.scrollLeft = scroll.scrollWidth;
    this.renderLens(result);
  }

  renderLens(result) {
    const selected = result.selected;
    const cached = this.querySelector(".lens-track .cached");
    const exact = this.querySelector(".lens-track .exact");
    cached.style.left = selected.side <= 0 ? "16%" : "84%";
    exact.style.left = selected.side <= 0 ? "84%" : "16%";
    this.querySelector(".threshold-lens header strong").textContent = selected.error.numerator === 0n ? "the cache entry is exact" : "the entire microscopic cache error is magnified to this width";
    const thresholdBits = result.midpoint.denominator.toString(2).length;
    const amplified = result.amplifiedError === 0 ? "0" : result.amplifiedError >= 1e4 || result.amplifiedError < 1e-3 ? result.amplifiedError.toExponential(2) : result.amplifiedError.toPrecision(3);
    this.querySelector(".lens-facts").innerHTML = `<p><span>cache gap</span><strong>${errorLabel(selected.error)}</strong><small>absolute scale error</small></p><p><span>after × 2⁵³</span><strong>${amplified}</strong><small>illustrative maximum-significand amplification</small></p><p><span>mid-gap threshold</span><strong>${thresholdBits} denominator bits</strong><small>synthetic witness; not a source counterexample</small></p>`;
  }
}

export class ToothlessBoundaryLab extends HTMLElement {
  connectedCallback() {
    const model = smallestNormalBoundaryModel();
    const x = value => 450 + value * 82;
    const lane = (y, data, label, lowerLabel) => `<text x="55" y="${y - 40}" class="lane-label">${label}</text><line x1="${x(model.previous)}" y1="${y}" x2="${x(model.next)}" y2="${y}" class="axis"/><rect x="${x(data.lower)}" y="${y - 26}" width="${x(data.upper) - x(data.lower)}" height="52" class="interval"/><line x1="${x(data.lower)}" y1="${y - 37}" x2="${x(data.lower)}" y2="${y + 39}" class="boundary ${label === "SOURCE MODEL" ? "wrong" : ""}"/><line x1="${x(data.upper)}" y1="${y - 37}" x2="${x(data.upper)}" y2="${y + 39}" class="boundary"/><circle cx="${x(data.center)}" cy="${y}" r="7" class="center"/><text x="${x(data.lower)}" y="${y + 61}" class="mark" text-anchor="middle">${lowerLabel}</text><text x="${x(data.center)}" y="${y - 15}" class="mark" text-anchor="middle">smallest normal</text><text x="${x(data.upper)}" y="${y + 61}" class="mark" text-anchor="middle">upper midpoint</text>`;
    this.innerHTML = `<div class="algorithm-lab toothless-boundary-lab"><div class="algorithm-lab-head"><div><span class="lab-kicker">Exact transition microscope</span><strong>The subnormal predecessor is not closer at the smallest normal value</strong></div><output class="candidate-result"><span>binary64 bits</span><strong>${model.bits}</strong><small>one affected positive magnitude</small></output></div><svg viewBox="0 0 900 355" role="img" aria-label="Correct and source-modeled parsing intervals around the smallest normal binary64 value.">${lane(105, model.correct, "IEEE BINARY64", "correct lower midpoint")}${lane(255, model.implementation, "SOURCE MODEL", "modeled lower midpoint")}<path d="M${x(-2)} 165 V205 H${x(-1)}" class="defect-arrow"/><text x="${x(-1.5)}" y="192" text-anchor="middle" class="defect-label">one unit inward</text></svg><div class="boundary-units"><span>diagram unit</span><strong>${model.unit}</strong><small>The correct lower midpoint is two units below the value; the implementation places it one unit below.</small></div></div>`;
  }
}

customElements.define("toothless-ladder", ToothlessLadder);
customElements.define("toothless-boundary-lab", ToothlessBoundaryLab);
