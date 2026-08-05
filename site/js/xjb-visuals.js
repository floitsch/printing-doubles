import { xjbMicroscope } from "./xjb-reference.js";

const PRESETS = [
  { label: "0.3 · carry 10", value: 0.3 },
  { label: "1/3 · choose 0", value: 1 / 3 },
  { label: "1.0000000000000002 · interior", value: 1.0000000000000002 },
  { label: "1 · unequal margins", value: 1 },
];

const escape = (text) => String(text).replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

class XjbMicroscope extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="algorithm-lab xjb-lab"><div class="algorithm-lab-head"><div><span class="lab-kicker">Prefix-and-last-digit microscope</span><strong>Scale one place farther, then make one local decision</strong></div><output class="candidate-result xjb-result"></output></div><form class="candidate-input"><label for="xjb-value">Normal binary64 value</label><div><input id="xjb-value" value="0.3" inputmode="decimal"><button type="submit">Inspect</button></div><p class="input-message"></p></form><div class="lab-presets xjb-presets">${PRESETS.map(p => `<button type="button">${p.label}</button>`).join("")}</div><div class="candidate-facts xjb-facts"></div><div class="xjb-scroll" aria-label="Pan horizontally on a narrow screen to inspect every last-digit position"><svg class="algorithm-svg xjb-svg" viewBox="0 0 1000 410" role="img" aria-label="The scaled binary value and its rounding interval over eleven possible last-digit positions"></svg></div><div class="xjb-decision"></div><div class="lab-inspector"><strong></strong><span></span><code></code></div></div>`;
    this.input = this.querySelector("input");
    this.message = this.querySelector(".input-message");
    this.querySelector("form").addEventListener("submit", event => { event.preventDefault(); this.select(Number(this.input.value)); });
    this.querySelectorAll(".xjb-presets button").forEach((button, index) => button.addEventListener("click", () => {
      this.input.value = String(PRESETS[index].value);
      this.select(PRESETS[index].value);
    }));
    this.select(0.3);
  }

  select(value) {
    try {
      this.result = xjbMicroscope(value);
      this.message.textContent = "";
      this.render();
    } catch (error) {
      this.message.textContent = error.message;
    }
  }

  x(position) {
    const left = -.2;
    const right = 1.2;
    return 100 + ((position - left) / (right - left)) * 800;
  }

  render() {
    const r = this.result;
    const decisionText = r.decision === "shorten-down"
      ? "The left endpoint is already admissible: choose last digit 0 and stop one digit earlier."
      : r.decision === "shorten-up"
        ? "The right endpoint is admissible: carry into the prefix and append 0, then stop one digit earlier."
        : `Neither endpoint recovers the input: retain the nearest interior digit ${r.chosenDigit}.`;
    this.querySelector(".xjb-result").innerHTML = `<span>shortest output</span><strong>${r.shortest.text}</strong><small>${r.coefficient} × 10^${r.exponent}</small>`;
    this.querySelector(".xjb-facts").innerHTML = `<p><span>Binary spacing exponent q</span><strong>${r.q}</strong><small>${r.irregular ? "power of two: lower margin is smaller" : "ordinary equal-margin neighborhood"}</small></p><p><span>Decimal scale</span><strong>10^${r.scalePower}</strong><small>one decimal place beyond exponent k = ${r.k}</small></p><p><span>Scaled value</span><strong>${r.prefix} + n</strong><small>n = ${r.fractionalText}</small></p>`;

    const lowerX = this.x(r.positions.lower);
    const upperX = this.x(r.positions.upper);
    const valueX = this.x(r.positions.value);
    const selectedX = this.x(Number(r.chosenDigit) / 10);
    const ticks = r.candidates.map(candidate => {
      const x = this.x(candidate.digit / 10);
      const classes = ["xjb-candidate", candidate.admissible ? "admissible" : "outside", candidate.selected ? "selected" : ""].join(" ");
      const title = `${candidate.digit === 10 ? "carry 10" : `last digit ${candidate.digit}`}: ${candidate.text}; ${candidate.admissible ? "inside" : "outside"} the parsing interval${candidate.endpoint ? `; ${candidate.endpoint}` : ""}`;
      return `<g class="${classes}" data-digit="${candidate.digit}" tabindex="0" role="button" aria-label="${escape(title)}"><title>${escape(title)}</title><line x1="${x}" y1="217" x2="${x}" y2="280"></line><circle cx="${x}" cy="217" r="${candidate.selected ? 8 : 5}"></circle><text x="${x}" y="301" text-anchor="middle">${candidate.digit}</text></g>`;
    }).join("");
    this.querySelector(".xjb-svg").innerHTML = `<rect class="lab-svg-background" width="1000" height="410"></rect><text class="lane-label" x="100" y="50">THE PREFIX IS FIXED</text><text class="xjb-prefix" x="100" y="88">${r.prefix}</text><text class="xjb-prefix-tail" x="900" y="88" text-anchor="end">+ one last digit</text><path class="xjb-guide" d="M100 113 H900"></path><text class="lane-label" x="100" y="154">LOCAL COORDINATE n: 0 … 1</text><rect class="xjb-interval" x="${Math.min(lowerX, upperX)}" y="178" width="${Math.max(2, Math.abs(upperX - lowerX))}" height="78" rx="4"></rect><line class="xjb-value" x1="${valueX}" y1="164" x2="${valueX}" y2="266"></line><circle class="xjb-value-dot" cx="${valueX}" cy="178" r="6"></circle><text class="xjb-value-label" x="${valueX}" y="155" text-anchor="middle">scaled binary value</text>${ticks}<path class="xjb-selection" d="M${selectedX} 315 V344 H500"></path><text class="xjb-selection-label" x="500" y="368" text-anchor="middle">${escape(decisionText)}</text><text class="xjb-end-label" x="${this.x(0)}" y="326" text-anchor="middle">shorter ↓</text><text class="xjb-end-label" x="${this.x(1)}" y="326" text-anchor="middle">shorter ↑</text>`;
    this.querySelector(".xjb-decision").innerHTML = `<div><span>Nearest tenth before interval tests</span><strong>${r.floorDigit} + δ, where δ = ${r.deltaText}</strong></div><i>→</i><div><span>Interval decision</span><strong>${decisionText}</strong></div><i>→</i><div><span>Decimal record</span><strong>${r.coefficient} × 10^${r.exponent}</strong></div>`;
    this.inspect(r.candidates.find(candidate => candidate.selected));
    this.querySelectorAll(".xjb-candidate").forEach(mark => {
      const show = () => this.inspect(r.candidates[Number(mark.dataset.digit)]);
      mark.addEventListener("mouseenter", show);
      mark.addEventListener("focus", show);
      mark.addEventListener("click", show);
    });
    requestAnimationFrame(() => {
      const scroller = this.querySelector(".xjb-scroll");
      if (scroller.scrollWidth > scroller.clientWidth) {
        const selectedPixel = (selectedX / 1000) * scroller.scrollWidth;
        scroller.scrollLeft = Math.max(0, selectedPixel - scroller.clientWidth / 2);
      }
    });
  }

  inspect(candidate) {
    const inspector = this.querySelector(".lab-inspector");
    inspector.querySelector("strong").textContent = candidate.selected ? "Selected decimal position" : `Possible last digit ${candidate.digit}`;
    inspector.querySelector("span").textContent = `${candidate.text} is ${candidate.admissible ? "inside" : "outside"} the exact parsing interval.${candidate.endpoint ? ` This is the ${candidate.endpoint}, so admission removes a significant digit.` : ""}`;
    inspector.querySelector("code").textContent = `${candidate.coefficient} × 10^${this.result.exponent}`;
  }
}

if (!customElements.get("xjb-microscope")) customElements.define("xjb-microscope", XjbMicroscope);
