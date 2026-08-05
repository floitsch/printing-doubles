import { tejuConfiguration, tejuFormats, tejuRuntime } from "./teju-reference.js";

const RUNTIME_PRESETS = [
  { label: "0.3 · centered", value: 0.3 },
  { label: "1e10 · small integer", value: 1e10 },
  { label: "0.5 · power of two", value: 0.5 },
  { label: "minimum subnormal", value: Number.MIN_VALUE },
];

const OPERATION_LABELS = {
  built_in_1: "ordinary one-limb operations",
  synthetic_1: "synthesized two-limb product",
  built_in_2: "native two-limb product",
  built_in_4: "native four-limb product",
};

function numberWithCommas(value) { return Number(value).toLocaleString("en-US"); }

class TejuConfigurator extends HTMLElement {
  connectedCallback() {
    const options = tejuFormats().map(format => `<option value="${format.id}" ${format.id === "binary64" ? "selected" : ""}>${format.label}</option>`).join("");
    this.innerHTML = `<div class="algorithm-lab teju-lab"><div class="algorithm-lab-head"><div><span class="lab-kicker">Generator-to-kernel configurator</span><strong>Choose the format and the integer machinery before runtime</strong></div><output class="candidate-result teju-result"><span>generated function</span><strong></strong><small></small></output></div><div class="teju-controls"><label>Floating-point format<select class="teju-format">${options}</select></label><label>Target integer capability<select class="teju-capability"><option value="portable">without native 128-bit integer</option><option value="uint128">with native 128-bit integer</option></select></label></div><div class="teju-build"><article class="teju-config-card"><span>1 · JSON description</span><strong></strong><code></code></article><i>→</i><article class="teju-generator-card"><span>2 · Offline C++ generator</span><strong>Multiprecision is allowed here</strong><ul><li>derive decimal exponent range</li><li>prove fixed-width calculations cannot overflow</li><li>construct cached multipliers and modular inverses</li></ul></article><i>→</i><article class="teju-output-card"><span>3 · Generated C</span><strong></strong><code></code></article><i>→</i><article class="teju-runtime-card"><span>4 · Runtime kernel</span><strong>Fixed-width operations only</strong><small></small></article></div><div class="teju-separation"><p><strong>Build machine</strong><span>JSON parser · Boost multiprecision · overflow searches · source emission</span></p><b>does not cross into</b><p><strong>Target program</strong><span>generated constants · limb operations · decimal pair</span></p></div><div class="lab-inspector"><strong>What changes with the selection</strong><span></span><code></code></div></div>`;
    this.format = this.querySelector(".teju-format");
    this.capability = this.querySelector(".teju-capability");
    this.format.addEventListener("change", () => this.render());
    this.capability.addEventListener("change", () => this.render());
    this.render();
  }

  render() {
    const config = tejuConfiguration(this.format.value, this.capability.value);
    const [portableOption, uint128Option] = this.capability.options;
    this.capability.disabled = !config.configurableCapability;
    portableOption.textContent = config.configurableCapability ? "without native 128-bit integer" : "fixed by checked-in configuration";
    uint128Option.hidden = !config.configurableCapability;
    if (!config.configurableCapability) this.capability.value = "portable";
    this.querySelector(".teju-result strong").textContent = config.functionName;
    this.querySelector(".teju-result small").textContent = `${numberWithCommas(config.multiplierRows)} cached multiplier rows`;
    this.querySelector(".teju-config-card strong").textContent = config.label;
    this.querySelector(".teju-config-card code").textContent = `exponent: ${config.exponentMin} … ${config.exponentMax}\nmantissa: ${config.mantissaWidth} bits\ncarrier: ${config.carrierWidth} bits\nstorage split: ${config.storageSplit}`;
    this.querySelector(".teju-output-card strong").textContent = `${config.id}.c + .h`;
    this.querySelector(".teju-output-card code").textContent = `#define teju_width ${config.carrierWidth}u\n#define teju_mantissa_width ${config.mantissaWidth}u\n#define teju_calculation_div10 teju_${config.div10}\n#define teju_calculation_mshift teju_${config.mshift}`;
    this.querySelector(".teju-runtime-card small").textContent = `${OPERATION_LABELS[config.mshift]}; multiply-and-shift discards ${config.runtimeShift} low product bits.`;
    const inspector = this.querySelector(".lab-inspector");
    inspector.querySelector("span").textContent = `${config.label} uses a ${config.carrierWidth}-bit limb, ${numberWithCommas(config.multiplierRows)} checked-in multiplier rows, ${OPERATION_LABELS[config.div10]} for division by ten, and ${OPERATION_LABELS[config.mshift]} for the cached multiply-and-shift.`;
    inspector.querySelector("code").textContent = `checked-in generated source: ${numberWithCommas(config.generatedBytes)} bytes; source size is not linked binary size`;
  }
}

class TejuRuntimeRoute extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="algorithm-lab teju-route-lab"><div class="algorithm-lab-head"><div><span class="lab-kicker">Generated binary64 kernel</span><strong>Three routes share the same generated constants</strong></div><output class="candidate-result teju-runtime-result"></output></div><form class="candidate-input"><label for="teju-value">Finite positive binary64</label><div><input id="teju-value" value="0.3" inputmode="decimal"><button type="submit">Inspect</button></div><p class="input-message"></p></form><div class="lab-presets teju-presets">${RUNTIME_PRESETS.map(p => `<button type="button">${p.label}</button>`).join("")}</div><div class="teju-route"><article data-route="small"><span>A</span><strong>Small integer</strong><small>shift to an integer; remove decimal zeros</small></article><article data-route="centered"><span>B</span><strong>Centered interval</strong><small>equal binary margins; try the coarser decimal first</small></article><article data-route="uncentered"><span>C</span><strong>Uncentered interval</strong><small>power of two; narrower lower margin</small></article></div><div class="teju-runtime-flow"></div><div class="lab-inspector"><strong></strong><span></span><code></code></div></div>`;
    this.input = this.querySelector("input");
    this.message = this.querySelector(".input-message");
    this.querySelector("form").addEventListener("submit", event => { event.preventDefault(); this.select(Number(this.input.value)); });
    this.querySelectorAll(".teju-presets button").forEach((button, index) => button.addEventListener("click", () => {
      this.input.value = String(RUNTIME_PRESETS[index].value);
      this.select(RUNTIME_PRESETS[index].value);
    }));
    this.select(0.3);
  }

  select(value) {
    try { this.result = tejuRuntime(value); this.message.textContent = ""; this.render(); }
    catch (error) { this.message.textContent = error.message; }
  }

  render() {
    const r = this.result;
    this.querySelector(".teju-runtime-result").innerHTML = `<span>decimal pair</span><strong>${r.decimal.text}</strong><small>${r.decimalText}</small>`;
    this.querySelectorAll(".teju-route article").forEach(article => article.classList.toggle("active", article.dataset.route === r.route));
    const flows = {
      small: ["The binary value is already an integer", "shift m by −e", "remove trailing decimal zeros with modular-inverse tests", "return the shortened pair"],
      centered: ["Scale lower and upper midpoint integers with one cached multiplier", "divide the upper image by ten to try a coarser decimal", "if that candidate misses, scale the center and choose the nearer fine-grid integer", "apply exact tie tests and return"],
      uncentered: ["Recognize a power of two from the significand", "scale the closer lower boundary and farther upper boundary separately", "try the coarser decimal; refine only when required", "apply exact tie tests and return"],
    }[r.route];
    this.querySelector(".teju-runtime-flow").innerHTML = flows.map((text, index) => `<div><span>${index + 1}</span><strong>${text}</strong></div>${index < flows.length - 1 ? "<i>→</i>" : ""}`).join("");
    const names = { small: "Small-integer route", centered: "Centered-interval route", uncentered: "Uncentered power-of-two route" };
    const notes = {
      small: "No cached power is needed. Once the exact binary integer is exposed, rotating multiplication by the inverse of five tests and removes decimal factors of ten.",
      centered: "The two parser boundaries are equally far from the value. The source first asks whether the coarser candidate 10q lies between their scaled integer images; otherwise it computes the nearest fine-grid candidate.",
      uncentered: "The predecessor lies in the previous binade, so the lower midpoint is closer. The source uses different lower and upper constructions and includes a refined case when their integer images are not ordered.",
    };
    const inspector = this.querySelector(".lab-inspector");
    inspector.querySelector("strong").textContent = names[r.route];
    inspector.querySelector("span").textContent = notes[r.route];
    inspector.querySelector("code").textContent = `${r.binaryText}  →  ${r.decimalText}`;
  }
}

if (!customElements.get("teju-configurator")) customElements.define("teju-configurator", TejuConfigurator);
if (!customElements.get("teju-runtime-route")) customElements.define("teju-runtime-route", TejuRuntimeRoute);
