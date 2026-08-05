import { shortestDecimal } from "./oracle.js";
import { hex64, unroundedParts, unroundedScalingShort, uscaleProduct } from "./uscale-reference.js";

const UNROUNDED_PRESETS = [
  { label: "6 exactly", value: 6 },
  { label: "6.000001", value: 6.000001 },
  { label: "6.499999", value: 6.499999 },
  { label: "6.5 exactly", value: 6.5 },
  { label: "6.500001", value: 6.500001 },
  { label: "6.999999", value: 6.999999 },
];

const PRODUCT_PRESETS = [
  { label: "0.3 · fast lower", value: 0.3, lane: "lower" },
  { label: "1e23 · repair upper", value: 1e23, lane: "upper" },
  { label: "1.0000000000000002 · center", value: 1.0000000000000002, lane: "center" },
  { label: "minimum subnormal", value: Number.MIN_VALUE, lane: "center" },
];

function conceptualUnrounded(value) {
  const four = value * 4;
  const truncated = Math.floor(four);
  const encoded = BigInt(truncated | (four === truncated ? 0 : 1));
  return { value, encoded, ...unroundedParts(encoded), fraction: value - Math.floor(value) };
}

class UnroundedNumberLab extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="algorithm-lab unrounded-lab"><div class="algorithm-lab-head"><div><span class="lab-kicker">Two extra bits, several later choices</span><strong>Keep the half bit and one sticky fact; postpone rounding</strong></div><output class="candidate-result unrounded-result"></output></div><div class="lab-presets unrounded-presets">${UNROUNDED_PRESETS.map((p, i) => `<button type="button" class="${i === 0 ? "active" : ""}">${p.label}</button>`).join("")}</div><div class="unrounded-line"><div class="unrounded-axis"><span>6</span><i class="half"><b>6.5</b></i><span>7</span><em></em></div></div><div class="unrounded-bits"><article><span>retained integer</span><strong></strong><small>everything left of the binary point</small></article><article><span>½ bit</span><strong></strong><small>is the fraction at least one half?</small></article><article class="sticky-cell"><span>sticky bit</span><strong></strong><small>is anything after the half bit nonzero?</small></article></div><div class="unrounded-rounding"></div><div class="lab-inspector"><strong>Why the sticky bit is not a digit</strong><span>It does not say how large the remaining fraction is. It records only whether the discarded tail was exactly zero, which is the fact needed to distinguish an exact integer or half from a value just beyond it.</span><code></code></div></div>`;
    this.querySelectorAll("button").forEach((button, index) => button.addEventListener("click", () => {
      this.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
      this.render(UNROUNDED_PRESETS[index]);
    }));
    this.render(UNROUNDED_PRESETS[0]);
  }

  render(preset) {
    const r = conceptualUnrounded(preset.value);
    const percent = Math.max(0, Math.min(100, r.fraction * 100));
    this.querySelector(".unrounded-result").innerHTML = `<span>unrounded form</span><strong>⟨${r.integer}.${r.half ? 5 : 0}${r.sticky ? "+" : ""}⟩</strong><small>encoded integer ${r.encoded}</small>`;
    const marker = this.querySelector(".unrounded-axis em");
    marker.style.left = `${percent}%`;
    marker.title = `actual value ${preset.label}`;
    const cells = this.querySelectorAll(".unrounded-bits article strong");
    cells[0].textContent = String(r.integer);
    cells[1].textContent = String(r.half);
    cells[2].textContent = String(r.sticky);
    this.querySelector(".sticky-cell").classList.toggle("on", r.sticky === 1);
    this.querySelector(".unrounded-rounding").innerHTML = `<p><span>floor</span><strong>${r.floor}</strong></p><p><span>nearest, ties to even</span><strong>${r.nearestEven}</strong></p><p><span>ceiling</span><strong>${r.ceil}</strong></p>`;
    this.querySelector(".lab-inspector code").textContent = `integer || half || sticky = ${r.integer.toString(2)} || ${r.half} || ${r.sticky}`;
  }
}

class UscaleProductLab extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="algorithm-lab uscale-product-lab"><div class="algorithm-lab-head"><div><span class="lab-kicker">Exact optimized implementation x-ray</span><strong>The low word is omitted; a carry test and sticky bit preserve the answer</strong></div><output class="candidate-result uscale-result"></output></div><form class="candidate-input"><label for="uscale-value">Finite positive binary64</label><div><input id="uscale-value" value="0.3" inputmode="decimal"><button type="submit">Inspect</button></div><p class="input-message"></p></form><div class="lab-presets uscale-presets">${PRODUCT_PRESETS.map(p => `<button type="button">${p.label}</button>`).join("")}</div><div class="uscale-lane"><label>Scaled operand<select><option value="lower">lower parsing boundary</option><option value="upper">upper parsing boundary</option><option value="center">binary value</option></select></label><p></p></div><div class="candidate-facts uscale-facts"></div><div class="uscale-equation"><div><span>left-justified operand</span><code class="operand"></code></div><b>×</b><div><span>ceil-rounded cached power</span><code class="power"></code></div></div><div class="uscale-products"><article class="primary"><span>First 64×64 multiplication</span><strong>x × pm.hi</strong><div><code data-word="top"></code><code data-word="middle"></code></div><small></small></article><article class="correction"><span>Conditional correction multiplication</span><strong>x × pm.lo</strong><div><code data-word="middle2"></code><code data-word="bottom"></code></div><small></small></article></div><div class="uscale-window-scroll"><div class="uscale-window"><div class="uscale-retained"><span>retained unrounded bits</span></div><div class="uscale-shifted"><span></span></div><div class="uscale-middle"><span>middle word</span></div><div class="uscale-bottom"><span>lowest word never needed</span></div></div></div><div class="uscale-verdict"><p class="sticky-lamp"><span>sticky</span><strong></strong></p><p><span>optimized result</span><strong class="optimized"></strong></p><p><span>exact rational result</span><strong class="exact"></strong></p><p class="agreement"><span>comparison</span><strong></strong></p></div><div class="lab-inspector"><strong></strong><span></span><code></code></div></div>`;
    this.input = this.querySelector("input");
    this.message = this.querySelector(".input-message");
    this.lane = this.querySelector("select");
    this.querySelector("form").addEventListener("submit", event => { event.preventDefault(); this.select(Number(this.input.value)); });
    this.querySelectorAll(".uscale-presets button").forEach((button, index) => button.addEventListener("click", () => {
      const preset = PRODUCT_PRESETS[index];
      this.input.value = String(preset.value);
      this.lane.value = preset.lane;
      this.select(preset.value);
    }));
    this.lane.addEventListener("change", () => this.render());
    this.select(0.3);
  }

  select(value) {
    try {
      this.short = unroundedScalingShort(value);
      this.oracle = shortestDecimal(value);
      this.message.textContent = "";
      this.render();
    } catch (error) { this.message.textContent = error.message; }
  }

  currentProduct() {
    if (this.lane.value === "lower") return this.short.lowerScale;
    if (this.lane.value === "upper") return this.short.upperScale;
    return uscaleProduct(this.short.x, this.short.e, this.short.p);
  }

  render() {
    const s = this.short;
    const r = this.currentProduct();
    const parts = unroundedParts(r.optimized);
    const selectedName = { lower: "lower parsing boundary", upper: "upper parsing boundary", center: "binary value" }[this.lane.value];
    const centerNeeded = s.route === "nearest";
    this.querySelector(".uscale-result").innerHTML = `<span>shortest decimal</span><strong>${s.text}</strong><small>${s.coefficient} × 10^${s.exponent}</small>`;
    this.querySelector(".uscale-lane p").textContent = this.lane.value === "center" && !centerNeeded ? "The coarse candidate succeeds, so Short does not execute this center scale; it is shown only to inspect the shared primitive." : `This ${selectedName} scale is executed by Short for the selected input.`;
    this.querySelector(".uscale-facts").innerHTML = `<p><span>Operand</span><strong>${selectedName}</strong><small>x = ${hex64(r.x)}</small></p><p><span>Decimal scale p</span><strong>${r.p}</strong><small>cached 10^${r.p}; top-word shift s = ${r.shift}</small></p><p><span>Source path</span><strong>${r.fastPath ? "one multiply" : "correction required"}</strong><small>${r.fastPath ? "a shifted-out top bit blocks any borrow" : "shifted-out top bits are all zero"}</small></p>`;
    this.querySelector(".operand").textContent = hex64(r.x);
    this.querySelector(".power").textContent = `${hex64(r.power.hi)} · 2^64 − ${hex64(r.power.lo)}`;
    this.querySelector('[data-word="top"]').textContent = hex64(r.upperProduct.high);
    this.querySelector('[data-word="middle"]').textContent = hex64(r.upperProduct.low);
    this.querySelector('[data-word="middle2"]').textContent = hex64(r.correctionProduct.high);
    this.querySelector('[data-word="bottom"]').textContent = hex64(r.correctionProduct.low);
    this.querySelector(".primary small").textContent = "The top word contains the result and the s low bits that may become sticky.";
    const correction = this.querySelector(".correction");
    correction.classList.toggle("skipped", r.fastPath);
    correction.querySelector("small").textContent = r.fastPath ? "Skipped by the optimized source: the borrow cannot reach retained bits." : `Executed: ${r.borrow ? "a borrow subtracts one from the top word" : "no borrow reaches the top word"}.`;
    const retainedWidth = Math.max(12, 64 - r.shift);
    const shiftedWidth = Math.max(4, r.shift);
    const window = this.querySelector(".uscale-window");
    window.style.gridTemplateColumns = `${retainedWidth}fr ${shiftedWidth}fr 64fr 64fr`;
    this.querySelector(".uscale-shifted span").textContent = `${r.shift} shifted top bits`;
    const lamp = this.querySelector(".sticky-lamp");
    lamp.classList.toggle("on", r.sticky === 1n);
    lamp.querySelector("strong").textContent = String(r.sticky);
    this.querySelector(".optimized").textContent = `⟨${parts.integer}.${parts.half ? 5 : 0}${parts.sticky ? "+" : ""}⟩`;
    const exactParts = unroundedParts(r.exact);
    this.querySelector(".exact").textContent = `⟨${exactParts.integer}.${exactParts.half ? 5 : 0}${exactParts.sticky ? "+" : ""}⟩`;
    const agreement = this.querySelector(".agreement");
    agreement.classList.toggle("yes", r.agrees);
    agreement.querySelector("strong").textContent = r.agrees ? "bit-for-bit equal" : "mismatch";
    const inspector = this.querySelector(".lab-inspector");
    inspector.querySelector("strong").textContent = r.fastPath ? "Why the second multiplication is unnecessary" : "Why the correction path runs";
    inspector.querySelector("span").textContent = r.fastPath ? "At least one of the top word's discarded s bits is already one. A borrow from the uncomputed lower correction stops there: it cannot change a retained result bit, and the sticky result is certainly one." : "Every shifted-out bit of the approximate top word is zero, so a borrow from the correction could cross the cut. The high half of x·pm.lo determines that borrow and whether the discarded tail is nonzero; its low half is not needed.";
    inspector.querySelector("code").textContent = `optimized ${r.optimized} · exact ${r.exact} · oracle output ${this.oracle.text}`;
  }
}

if (!customElements.get("unrounded-number-lab")) customElements.define("unrounded-number-lab", UnroundedNumberLab);
if (!customElements.get("uscale-product-lab")) customElements.define("uscale-product-lab", UscaleProductLab);
