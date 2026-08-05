import { fromBits } from "./float.js";
import { grisu3 } from "./grisu-reference.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MASK_64 = (1n << 64n) - 1n;

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
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show();
    }
  });
}

function hex64(value) {
  return `0x${value.toString(16).padStart(16, "0")}`;
}

function compactInteger(value) {
  const text = value.toString();
  return text.length <= 18 ? text : `${text.slice(0, 9)}…${text.slice(-5)} (${text.length} digits)`;
}

function ratioText(numerator, denominator) {
  if (denominator === 0n) return "0";
  const scaled = Number(numerator * 1000n / denominator) / 1000;
  return scaled >= 1000 ? scaled.toExponential(2) : String(scaled);
}

const EXAMPLES = [
  { label: "accepted · 0.3", input: "0.3", value: 0.3 },
  { label: "long approach · 1/3", input: "0.3333333333333333", value: 1 / 3 },
  { label: "fringe rejection · 1e23", input: "1e23", value: 1e23 },
  { label: "closest-choice rejection", input: "1983158328230103.2", value: fromBits(0x431c2eb01ec0035dn) },
];

class GrisuBase extends HTMLElement {
  bindValueControls() {
    this.input = this.querySelector("input");
    this.message = this.querySelector(".input-message");
    this.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.selectValue(Number(this.input.value));
    });
    this.querySelectorAll(".grisu-presets button").forEach((button, index) => button.addEventListener("click", () => {
      const example = EXAMPLES[index];
      this.input.value = example.input;
      this.selectValue(example.value);
    }));
  }

  selectValue(value) {
    if (!Number.isFinite(value) || value === 0) {
      this.message.textContent = "Enter a finite, nonzero binary64 value.";
      return;
    }
    this.message.textContent = "";
    this.value = value;
    this.result = grisu3(value);
    this.valueChanged();
  }

  showDetail(detail) {
    this.inspector.innerHTML = `<strong>${detail.heading}</strong><span>${detail.body}</span>${detail.exact ? `<code>${detail.exact}</code>` : ""}`;
  }
}

class DiyFpWorkbench extends GrisuBase {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab diyfp-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">DiyFp workbench</span><strong>Widen, scale, and keep the useful half of one product</strong></div><output class="candidate-result diyfp-result"></output></div>
        <form class="candidate-input"><label for="diyfp-value">Binary64 value</label><div><input id="diyfp-value" value="0.3" inputmode="decimal"><button type="submit">Build</button></div><p class="input-message"></p></form>
        <div class="lab-presets grisu-presets">${EXAMPLES.slice(0, 3).map((example) => `<button type="button">${example.label}</button>`).join("")}</div>
        <div class="candidate-facts diyfp-facts"></div>
        <svg class="algorithm-svg diyfp-svg" role="img" aria-label="A binary64 significand widened to DiyFp, multiplied by a cached power, and split into retained and discarded halves"></svg>
        <div class="lab-inspector" aria-live="polite"></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.inspector = this.querySelector(".lab-inspector");
    this.bindValueControls();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.selectValue(0.3);
  }

  disconnectedCallback() { this.resizeObserver?.disconnect(); }
  valueChanged() { this.render(); }

  render() {
    if (!this.result) return;
    const { w, power, scaled } = this.result;
    const product = w.f * power.f;
    const discarded = product & MASK_64;
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const mobile = width < 560;
    const height = mobile ? 570 : 445;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();
    this.querySelector(".diyfp-result").innerHTML = `<span>scaled value</span><strong>≈ ${Number(Math.abs(this.value) * (10 ** power.decimalExponent)).toPrecision(7)}</strong><small>binary exponent ${scaled.w.e}</small>`;
    this.querySelector(".diyfp-facts").innerHTML = `<p><span>Normalized input</span><strong>${hex64(w.f)}</strong><small>${w.f} × 2^${w.e}</small></p><p><span>Cached scale</span><strong>10^${power.decimalExponent}</strong><small>${hex64(power.f)} × 2^${power.e}</small></p><p><span>Rounded high half</span><strong>${hex64(scaled.w.f)}</strong><small>low half ${hex64(discarded)}</small></p>`;
    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });

    const left = mobile ? 24 : 56;
    const right = width - (mobile ? 24 : 56);
    const bandWidth = right - left;
    const yInput = mobile ? 75 : 80;
    const yCache = mobile ? 205 : 185;
    const yProduct = mobile ? 350 : 315;
    const bandHeight = 46;

    append(this.svg, "text", { x: left, y: yInput - 24, class: "lane-label" }, "NORMALIZED INPUT · 64-BIT DIYFP SIGNIFICAND");
    const inputGroup = append(this.svg, "g", { class: "diyfp-band" });
    append(inputGroup, "rect", { x: left, y: yInput, width: bandWidth * 53 / 64, height: bandHeight, class: "diyfp-source" });
    append(inputGroup, "rect", { x: left + bandWidth * 53 / 64, y: yInput, width: bandWidth * 11 / 64, height: bandHeight, class: "diyfp-working" });
    append(inputGroup, "text", { x: left + 12, y: yInput + 28, class: "diyfp-band-label" }, mobile ? "53 input bits" : "53 meaningful binary64 bits");
    append(inputGroup, "text", { x: right - 9, y: yInput + 28, class: "diyfp-band-label end" }, mobile ? "+11" : "11 working bits");
    inspect(inputGroup, { title: "Normalized input significand", heading: "The input gains working room, not precision", body: "A normal binary64 contributes 53 meaningful bits. Left-shifting into a 64-bit word appends eleven zero positions while the exponent is reduced by eleven, so the represented real value is unchanged.", exact: `${hex64(w.f)} × 2^${w.e}` }, this);

    append(this.svg, "text", { x: left, y: yCache - 24, class: "lane-label" }, `CACHED APPROXIMATION OF 10^${power.decimalExponent}`);
    const cacheGroup = append(this.svg, "g", { class: "diyfp-band cache" });
    append(cacheGroup, "rect", { x: left, y: yCache, width: bandWidth, height: bandHeight, class: "diyfp-cache" });
    append(cacheGroup, "text", { x: left + 12, y: yCache + 28, class: "diyfp-band-label" }, hex64(power.f));
    inspect(cacheGroup, { title: `Cached approximation of 10^${power.decimalExponent}`, heading: "One sparse table entry chooses the arithmetic range", body: `This entry puts the scaled DiyFp exponent at ${scaled.w.e}, inside the target interval −60 through −32. Except for a few exact powers, the entry is itself rounded to 64 bits.`, exact: `${hex64(power.f)} × 2^${power.e}` }, this);

    const arrowX = width / 2;
    append(this.svg, "path", { d: `M ${arrowX} ${yCache + bandHeight + 10} v ${mobile ? 48 : 38}`, class: "diyfp-multiply-arrow" });
    append(this.svg, "text", { x: arrowX + 10, y: yCache + bandHeight + (mobile ? 38 : 32), class: "lane-note" }, "64 × 64 → 128");
    append(this.svg, "text", { x: left, y: yProduct - 24, class: "lane-label" }, "PRODUCT WINDOW");
    const retainedGroup = append(this.svg, "g", { class: "diyfp-band retained" });
    append(retainedGroup, "rect", { x: left, y: yProduct, width: bandWidth / 2, height: bandHeight, class: "diyfp-retained" });
    append(retainedGroup, "text", { x: left + 12, y: yProduct + 28, class: "diyfp-band-label dark" }, mobile ? "rounded high 64" : `keep high 64 · ${hex64(scaled.w.f)}`);
    inspect(retainedGroup, { title: "Rounded high half", heading: "These 64 bits continue into digit generation", body: "The high half is incremented when the discarded low half is at least one half. The new binary exponent accounts for the omitted 64 low positions.", exact: `${hex64(scaled.w.f)} × 2^${scaled.w.e}` }, this);
    const discardedGroup = append(this.svg, "g", { class: "diyfp-band discarded" });
    append(discardedGroup, "rect", { x: left + bandWidth / 2, y: yProduct, width: bandWidth / 2, height: bandHeight, class: "diyfp-discarded" });
    append(discardedGroup, "text", { x: right - 12, y: yProduct + 28, class: "diyfp-band-label end" }, mobile ? "discard low 64" : `discard low 64 · ${hex64(discarded)}`);
    inspect(discardedGroup, { title: "Discarded low half", heading: "The low half leaves one bounded rounding error", body: "These bits are not carried into digit generation. Their comparison with the halfway bit determines whether the retained half is rounded upward.", exact: `${hex64(discarded)}; halfway = 0x8000000000000000` }, this);
    append(this.svg, "path", { d: `M ${left + bandWidth * .76} ${yProduct + bandHeight + 8} C ${left + bandWidth * .72} ${yProduct + 100}, ${left + bandWidth * .38} ${yProduct + 100}, ${left + bandWidth * .33} ${yProduct + bandHeight + 8}`, class: "diyfp-rounding-arrow" });
    append(this.svg, "text", { x: width / 2, y: yProduct + (mobile ? 115 : 100), class: "diyfp-rounding-label", "text-anchor": "middle" }, "low half decides whether high half rounds upward");
    this.showDetail({ heading: "The arithmetic has a visible error budget", body: "Normalization is exact. The cached power may be rounded, and retaining the high half rounds once more. Grisu does not pretend those errors vanished; the proof gate makes room for them.", exact: `scaled DiyFp = ${hex64(scaled.w.f)} × 2^${scaled.w.e}` });
  }
}

class GrisuProofLab extends GrisuBase {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab grisu-proof-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">Grisu3 proof gate</span><strong>Watch a decimal approach the interval—and see whether uncertainty still matters</strong></div><output class="candidate-result proof-result"></output></div>
        <form class="candidate-input"><label for="grisu-proof-value">Binary64 value</label><div><input id="grisu-proof-value" value="0.3" inputmode="decimal"><button type="submit">Attempt</button></div><p class="input-message"></p></form>
        <div class="lab-presets grisu-presets">${EXAMPLES.map((example) => `<button type="button">${example.label}</button>`).join("")}</div>
        <div class="resolution-control proof-control"><label>Generated prefix <output></output><input type="range" min="0" max="0" value="0"><span class="resolution-ends"><span>first digit</span><span>proof gate</span></span></label></div>
        <div class="candidate-facts proof-facts"></div>
        <svg class="algorithm-svg grisu-proof-svg" role="img" aria-label="A decimal prefix approaching Grisu's outer interval, safe interval, and center uncertainty region"></svg>
        <div class="lab-inspector" aria-live="polite"></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.inspector = this.querySelector(".lab-inspector");
    this.slider = this.querySelector("input[type=range]");
    this.slider.addEventListener("input", () => this.render());
    this.bindValueControls();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.selectValue(0.3);
  }

  disconnectedCallback() { this.resizeObserver?.disconnect(); }

  valueChanged() {
    this.slider.max = String(this.result.generated.states.length - 1);
    this.slider.value = this.slider.max;
    this.render();
  }

  render() {
    if (!this.result) return;
    const states = this.result.generated.states;
    const index = Math.min(Number(this.slider.value), states.length - 1);
    const state = states[index];
    const final = index === states.length - 1;
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const mobile = width < 560;
    const height = mobile ? 520 : 430;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();
    this.querySelector(".proof-control output").textContent = `${index + 1} of ${states.length} · ${state.digits}`;
    const resultLabel = !final ? "continue" : this.result.success ? "certified" : "reject";
    this.querySelector(".proof-result").innerHTML = `<span>${resultLabel}</span><strong>${final && this.result.success ? this.result.text : final ? "no result" : state.digits}</strong><small>${final ? this.result.reason : "prefix has not reached the interval"}</small>`;
    const widthsAway = state.rest >= state.unsafeWidth ? ratioText(state.rest, state.unsafeWidth) : "inside outer interval";
    this.querySelector(".proof-facts").innerHTML = `<p><span>Generated prefix</span><strong>${state.digits}</strong><small>${state.phase} digit ${index + 1}</small></p><p><span>Distance from upper side</span><strong>${widthsAway}</strong><small>${state.canTry ? "a candidate may now be tested" : "outer-interval widths"}</small></p><p><span>Current decision</span><strong>${resultLabel}</strong><small>${state.weed || "generate another digit"}</small></p>`;
    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });

    const left = mobile ? 30 : 70;
    const right = width - (mobile ? 30 : 70);
    const span = right - left;
    append(this.svg, "text", { x: left, y: 40, class: "lane-label" }, mobile ? "DECIMAL APPROACH · DIGIT BY DIGIT" : "DECIMAL APPROACH · EACH DIGIT REFINES THE PREFIX");
    append(this.svg, "line", { x1: left, y1: 86, x2: right, y2: 86, class: "grisu-approach-line" });
    const progress = states.length === 1 ? 1 : index / (states.length - 1);
    const progressX = left + span * (.08 + .84 * progress);
    append(this.svg, "circle", { cx: progressX, cy: 86, r: 7, class: state.canTry ? "grisu-progress reached" : "grisu-progress" });
    append(this.svg, "text", { x: progressX, y: 68, class: "grisu-prefix-label", "text-anchor": "middle" }, state.digits.length > (mobile ? 18 : 30) ? `${state.digits.slice(0, mobile ? 15 : 27)}…` : state.digits);
    append(this.svg, "text", { x: right, y: 109, class: "lane-note", "text-anchor": "end" }, "parsing interval");

    const microscopeTop = mobile ? 175 : 165;
    const outerLeft = left;
    const outerRight = right;
    const outerSpan = outerRight - outerLeft;
    append(this.svg, "text", { x: left, y: microscopeTop - 24, class: "lane-label" }, mobile ? "PROOF MICROSCOPE · OUTER INTERVAL" : "PROOF MICROSCOPE · ONE OUTER-INTERVAL WIDTH");
    const outer = append(this.svg, "g", { class: "grisu-outer inspectable-mark" });
    append(outer, "rect", { x: outerLeft, y: microscopeTop, width: outerSpan, height: 160, class: "grisu-outer-band" });
    append(outer, "text", { x: outerLeft + 12, y: microscopeTop + 24, class: "grisu-band-label" }, "possibly valid");
    inspect(outer, { title: "Outer interval", heading: "The broad interval admits everything approximation might allow", body: "It is formed from the approximated boundaries, expanded by one DiyFp unit on either side. A decimal in an uncertainty fringe cannot yet be trusted.", exact: `width = ${state.unsafeWidth} current units` }, this);

    const exactSafeLeft = outerLeft + outerSpan * Number(4n * state.unit * 1_000_000n / state.unsafeWidth) / 1_000_000;
    const exactSafeRight = outerRight - outerSpan * Number(2n * state.unit * 1_000_000n / state.unsafeWidth) / 1_000_000;
    // The actual fringes are often sub-pixel at this scale. Preserve their order,
    // but give them a disclosed minimum display width so their role is visible.
    const safeLeft = Math.max(exactSafeLeft, outerLeft + (mobile ? 24 : 36));
    const safeRight = Math.min(exactSafeRight, outerRight - (mobile ? 16 : 24));
    const safe = append(this.svg, "g", { class: "grisu-safe inspectable-mark" });
    append(safe, "rect", { x: safeLeft, y: microscopeTop + 48, width: Math.max(1, safeRight - safeLeft), height: 68, class: "grisu-safe-band" });
    append(safe, "text", { x: (safeLeft + safeRight) / 2, y: microscopeTop + 88, class: "grisu-safe-label", "text-anchor": "middle" }, mobile ? "safe" : "provably inside the true interval");
    inspect(safe, { title: "Provably safe interval", heading: "Anything here certainly recovers the input", body: "The ends have been moved inward by the complete error allowance. This visible region is the reason Grisu3 may turn approximate arithmetic into an exact conclusion.", exact: `safe when 2·unit ≤ rest ≤ width − 4·unit; unit = ${state.unit}` }, this);

    const highDistance = (this.result.scaled.plus.f + 1n - this.result.scaled.w.f) * state.unit;
    const exactCenterLeft = outerRight - outerSpan * Number((highDistance + state.unit) * 1_000_000n / state.unsafeWidth) / 1_000_000;
    const exactCenterRight = outerRight - outerSpan * Number((highDistance - state.unit) * 1_000_000n / state.unsafeWidth) / 1_000_000;
    const centerMid = (exactCenterLeft + exactCenterRight) / 2;
    const centerWidth = Math.max(10, Math.abs(exactCenterRight - exactCenterLeft));
    const center = append(this.svg, "g", { class: "grisu-center inspectable-mark" });
    append(center, "rect", { x: centerMid - centerWidth / 2, y: microscopeTop + 122, width: centerWidth, height: 26, class: "grisu-center-band" });
    inspect(center, { title: "Scaled center uncertainty", heading: "Closestness must survive this whole center range", body: "The exact scaled input is not known as one coordinate after rounded multiplication. RoundWeed accepts a closest candidate only if moving the center anywhere in this small range cannot change the winner.", exact: `distance from upper side = ${highDistance} ± ${state.unit} current units` }, this);
    append(this.svg, "text", { x: outerLeft, y: microscopeTop + 146, class: "lane-note" }, "lower side");
    append(this.svg, "text", { x: outerRight, y: microscopeTop + 146, class: "lane-note", "text-anchor": "end" }, "upper side");
    append(this.svg, "text", { x: outerLeft, y: microscopeTop + 174, class: "grisu-scale-note" }, mobile ? "sub-pixel uncertainty is expanded" : "uncertainty fringes and center range are expanded when they would be smaller than a pixel");

    if (state.canTry) {
      const rawX = outerRight - outerSpan * Number(state.rest * 1_000_000n / state.unsafeWidth) / 1_000_000;
      const candidateX = Math.max(outerLeft, Math.min(outerRight, rawX));
      const accepted = final && this.result.success;
      const candidate = append(this.svg, "g", { class: `grisu-proof-candidate ${accepted ? "accepted" : final ? "rejected" : ""}` });
      append(candidate, "line", { x1: candidateX, y1: microscopeTop + 34, x2: candidateX, y2: microscopeTop + 154 });
      append(candidate, "circle", { cx: candidateX, cy: microscopeTop + 82, r: 7 });
      append(candidate, "text", { x: candidateX, y: microscopeTop + 18, "text-anchor": candidateX > right - 80 ? "end" : candidateX < left + 80 ? "start" : "middle" }, final ? this.result.attemptedText : state.digits);
      inspect(candidate, { title: "Current decimal candidate", heading: accepted ? "The candidate is certified" : final ? "The attempted digits are discarded" : "The prefix has reached the broad interval", body: accepted ? "The marker lies in the safe region and the closest-choice comparison is decisive." : final ? this.result.reason : "Digit generation may stop here, but RoundWeed still has to move toward the center if appropriate and discharge both proof obligations.", exact: `rest = ${state.rest}; candidate = upper side − rest` }, this);
    } else {
      append(this.svg, "path", { d: `M ${outerLeft - 2} ${microscopeTop + 82} h 30`, class: "grisu-offscreen-arrow" });
      append(this.svg, "text", { x: outerLeft + 36, y: microscopeTop + 86, class: "grisu-offscreen-label" }, `prefix remains ${ratioText(state.rest, state.unsafeWidth)} widths away`);
    }
    const footerY = microscopeTop + 205;
    append(this.svg, "text", { x: width / 2, y: footerY, class: `grisu-proof-conclusion ${final && this.result.success ? "accepted" : final ? "rejected" : ""}`, "text-anchor": "middle" }, !final ? "GENERATE ANOTHER DIGIT" : this.result.success ? "ACCEPT · RECOVERY AND CLOSESTNESS ARE PROVED" : "REJECT · DISCARD THE ATTEMPT AND USE AN EXACT FALLBACK");
    this.showDetail({ heading: !final ? `The prefix ${state.digits} has not finished the proof` : this.result.success ? `${this.result.text} is a certified fast-path result` : `${this.result.attemptedText} is not an output`, body: !final ? "Move the control toward the proof gate. Early prefixes are retained as arithmetic state, not shown to the caller." : this.result.success ? "Approximate coordinates were sufficient for this input; no fallback is needed." : "The attempted characters may happen to match an exact algorithm, but Grisu3 has not proved them and must return failure.", exact: `remainder ${compactInteger(state.rest)}; outer width ${compactInteger(state.unsafeWidth)}; unit ${compactInteger(state.unit)}` });
  }
}

if (!customElements.get("diyfp-workbench")) customElements.define("diyfp-workbench", DiyFpWorkbench);
if (!customElements.get("grisu-proof-lab")) customElements.define("grisu-proof-lab", GrisuProofLab);
