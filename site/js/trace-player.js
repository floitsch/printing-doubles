import { NumberLineView } from "./number-line-view.js";

class TracePlayer extends HTMLElement {
  connectedCallback() {
    const data = this.querySelector('script[type="application/json"]');
    if (!data) return;
    this.steps = JSON.parse(data.textContent);
    this.index = 0;
    this.playing = false;
    this.innerHTML = `
      <div class="trace-head"><strong>${this.dataset.title || "Execution microscope"}</strong><span class="trace-progress"></span></div>
      <div class="trace-stage">
        <div class="trace-visual"><canvas class="trace-canvas" width="760" height="390" aria-label="Synchronized number-line view"></canvas></div>
        <div class="trace-explanation" aria-live="polite"><p class="eyebrow"></p><h3></h3><p class="trace-why"></p><table class="trace-registers"><tbody></tbody></table></div>
      </div>
      <div class="trace-controls">
        <button type="button" data-action="previous">← Previous</button>
        <button type="button" data-action="play">Play</button>
        <input type="range" min="0" max="${this.steps.length - 1}" value="0" aria-label="Trace step">
        <button type="button" data-action="next">Next →</button>
      </div>`;
    this.canvas = this.querySelector("canvas");
    this.numberLine = new NumberLineView(this.canvas);
    this.querySelector('[data-action="previous"]').onclick = () => this.show(this.index - 1);
    this.querySelector('[data-action="next"]').onclick = () => this.show(this.index + 1);
    this.querySelector('[data-action="play"]').onclick = () => this.togglePlay();
    this.querySelector('input[type="range"]').oninput = (event) => this.show(Number(event.target.value));
    this.show(0);
  }

  show(index) {
    this.index = Math.max(0, Math.min(this.steps.length - 1, index));
    const step = this.steps[this.index];
    this.querySelector(".trace-progress").textContent = `${String(this.index + 1).padStart(2, "0")} / ${String(this.steps.length).padStart(2, "0")}`;
    this.querySelector(".trace-explanation .eyebrow").textContent = step.label || `Step ${this.index + 1}`;
    this.querySelector(".trace-explanation h3").textContent = step.title;
    this.querySelector(".trace-why").textContent = step.why;
    this.querySelector(".trace-registers tbody").innerHTML = Object.entries(step.registers || {}).map(([name, value]) => `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(String(value))}</td></tr>`).join("");
    this.querySelector('input[type="range"]').value = String(this.index);
    this.querySelector('[data-action="previous"]').disabled = this.index === 0;
    this.querySelector('[data-action="next"]').disabled = this.index === this.steps.length - 1;
    const selector = this.dataset.code;
    if (selector) {
      for (const line of document.querySelectorAll(`${selector} [data-line]`)) line.classList.toggle("active", Number(line.dataset.line) === step.line);
    }
    this.renderVisual();
  }

  togglePlay() {
    this.playing = !this.playing;
    const button = this.querySelector('[data-action="play"]');
    button.textContent = this.playing ? "Pause" : "Play";
    clearInterval(this.timer);
    if (!this.playing) return;
    if (this.index === this.steps.length - 1) this.show(0);
    this.timer = setInterval(() => {
      if (this.index === this.steps.length - 1) this.togglePlay();
      else this.show(this.index + 1);
    }, 1800);
  }

  renderVisual() {
    if (!this.numberLine || !this.steps) return;
    const visual = this.steps[this.index].visual || {};
    const binaryTicks = (visual.binary || [-1, 0, 1]).map((x) => ({ x, active: x === 0, topLabel: x === 0 ? "v" : undefined }));
    const decimalTicks = (visual.candidates || []).map((candidate) => ({
      x: candidate.x,
      active: candidate.active,
      color: candidate.active ? "#ef4b35" : "#ff9b8e",
      label: candidate.label,
      height: candidate.active ? 80 : 48,
    }));
    this.numberLine.setScene({
      domain: visual.domain || [-1.4, 1.4],
      margin: 45,
      bands: visual.interval ? [{ from: visual.interval[0], to: visual.interval[1], top: .15, bottom: .7, color: "rgba(223,255,82,.15)" }] : [],
      markers: visual.interval ? visual.interval.map((x) => ({ x, from: .12, to: .72, color: "#dfff52", dash: [3, 5] })) : [],
      lanes: [
        { y: .58, color: "#8eb3ff", label: "BINARY64", ticks: binaryTicks },
        { y: .78, color: "#ff9b8e", label: "DECIMAL CANDIDATES", labelOffset: 20, ticks: decimalTicks },
      ],
      brackets: visual.window ? [{ from: visual.window[0], to: visual.window[1], y: .24, color: "#ef4b35", label: visual.windowLabel || "computed window" }] : [],
      captions: [{ text: visual.caption || "binary value and its rounding interval", x: -1.4, y: .07 }],
    });
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

customElements.define("trace-player", TracePlayer);
