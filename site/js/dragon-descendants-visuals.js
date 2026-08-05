import { descendantWork } from "./dragon-descendants-reference.js";

const PRESETS = [
  { label: "42 · integer bypass", value: 42 },
  { label: "0.3 · one digit", value: 0.3 },
  { label: "1/3 · long prefix", value: 1 / 3 },
  { label: "1e23 · B–D repair", value: 1e23 },
  { label: "Gay repair", value: 9.819491617465572e139 },
  { label: "smallest subnormal", value: Number.MIN_VALUE },
  { label: "largest finite", value: Number.MAX_VALUE },
];

function compact(value) {
  const text = value.toString();
  return text.length <= 24 ? text : `${text.slice(0, 11)}…${text.slice(-10)}`;
}

function pipelineBlock(label, value, detail, className = "") {
  return `<button type="button" class="work-block ${className}" title="${detail}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></button>`;
}

export class DragonDescendantsLab extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="algorithm-lab descendants-lab">
      <div class="algorithm-lab-head"><div><span class="lab-kicker">Comparative execution x-ray</span><strong>The interval and answer stay fixed; expensive preparation disappears</strong></div><output class="candidate-result descendants-result"></output></div>
      <div class="descendant-switch" role="group" aria-label="Optimized descendant"><button type="button" data-kind="gay" class="active">Gay dtoa</button><button type="button" data-kind="burger">Burger–Dybvig</button></div>
      <form class="candidate-input"><label for="descendant-value">Finite nonzero binary64</label><div><input id="descendant-value" value="42" inputmode="decimal"><button type="submit">Inspect</button></div><p class="input-message"></p></form>
      <div class="lab-presets descendant-presets">${PRESETS.map(preset => `<button type="button">${preset.label}</button>`).join("")}</div>
      <div class="descendant-invariant"><span>shared destination</span><strong></strong><small>same exact remainder, denominator, and two margins at the digit loop</small></div>
      <div class="work-comparison"><section><header><span>Dragon baseline</span><strong>walk to the scale, then divide</strong></header><div class="work-pipeline baseline-pipeline"></div></section><section><header><span class="optimized-name"></span><strong>estimate, repair once, remove needless width</strong></header><div class="work-pipeline optimized-pipeline"></div></section></div>
      <div class="estimate-ruler"><header><span>Decimal-decade estimator</span><strong></strong></header><div class="estimate-cells"></div><p></p></div>
      <div class="factor-xray"><header><span>Exact state width</span><strong>cancel a shared power of two before the digit loop</strong></header><div class="factor-bars"><p class="before"><span>before</span><i></i><strong></strong></p><p class="after"><span>after</span><i></i><strong></strong></p></div><div class="factor-equation"></div></div>
      <div class="quotient-xray"><span>Next digit</span><strong></strong><div></div><p></p></div>
      <div class="candidate-facts descendant-facts"></div>
      <div class="lab-inspector"><strong>Select a block</strong><span>Every persistent label states the essential fact. Hover, tap, or focus a block for its implementation limitation or justification.</span><code></code></div>
    </div>`;
    this.kind = "gay";
    this.input = this.querySelector("input");
    this.message = this.querySelector(".input-message");
    this.querySelector("form").addEventListener("submit", event => { event.preventDefault(); this.select(this.input.value); });
    this.querySelectorAll(".descendant-switch button").forEach(button => button.addEventListener("click", () => {
      this.kind = button.dataset.kind;
      this.querySelectorAll(".descendant-switch button").forEach(item => item.classList.toggle("active", item === button));
      this.select(this.input.value);
    }));
    this.querySelectorAll(".descendant-presets button").forEach((button, index) => button.addEventListener("click", () => {
      this.input.value = String(PRESETS[index].value);
      this.select(PRESETS[index].value);
    }));
    this.select(42);
  }

  select(raw) {
    const value = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value) || value === 0) {
      this.message.textContent = "Enter a finite nonzero number.";
      return;
    }
    this.message.textContent = "";
    this.render(descendantWork(value, this.kind));
  }

  render(work) {
    const name = work.implementation === "gay" ? "Gay dtoa" : "Burger–Dybvig";
    this.querySelector(".optimized-name").textContent = name;
    const resultLabel = work.implementation === "gay" ? "shared exact result · native Gay checked" : "browser Burger–Dybvig result";
    this.querySelector(".descendants-result").innerHTML = `<span>${resultLabel}</span><strong>${work.output}</strong><small>${work.sameOutput ? "same shortest result as the exact Dragon path" : "output policy differs"}</small>`;
    this.querySelector(".descendant-invariant strong").textContent = work.output;
    const scaleDetail = `${work.scaleWalk} decimal decade${work.scaleWalk === 1 ? "" : "s"} separate the input magnitude from the digit window. This is a scale-distance visualization, not a timing measurement.`;
    this.querySelector(".baseline-pipeline").innerHTML = [
      pipelineBlock("decode", "f × 2ᵉ", "Recover the exact binary integer and exponent."),
      pipelineBlock("iterative scale", `${work.scaleWalk} decades`, scaleDetail, work.scaleWalk > 20 ? "heavy" : ""),
      pipelineBlock("exact state", `${work.bitsBeforeCancellation} bits`, "Construct a common denominator and both exact margins."),
      pipelineBlock("digit loop", `${work.dragonDigits} digit${work.dragonDigits === 1 ? "" : "s"}`, "Generate left to right and test both margins after each digit."),
    ].join("");
    const routeDetail = work.implementation === "gay"
      ? (work.gaySmallInteger ? "The stripped binary exponent is nonnegative and the decimal decade is within Gay's historical Int_max bound, so mode 0 can use exact native-double integer arithmetic." : "Shortest mode needs the exact left-to-right interval path for this input; the bounded-error fixed-precision shortcut is a different dtoa mode.")
      : "The authors' free-format path starts from four exact integers and keeps the Dragon stopping invariant.";
    this.querySelector(".optimized-pipeline").innerHTML = [
      pipelineBlock("estimate", `k ≈ ${work.estimate}`, work.implementation === "gay" ? "A linear approximation to log10 uses the binary exponent and normalized significand." : "A multiplication of the binary exponent by log10(2) deliberately lands at the target or one decade below."),
      pipelineBlock("one repair", work.correctionNeeded ? "used" : "not needed", "One exact comparison repairs the deliberately one-sided estimate. There is no exponent-sized bignum walk.", work.correctionNeeded ? "repair" : ""),
      pipelineBlock("route", work.gaySmallInteger ? "integer bypass" : "exact interval", routeDetail, work.gaySmallInteger ? "bypass" : ""),
      pipelineBlock("cancel 2ᵗ", work.commonTwos ? `t = ${work.commonTwos}` : "none here", "Powers of two are shifts. Remove any factor shared by numerator, denominator, and margins before carrying bignums."),
      pipelineBlock("digit loop", `${work.digitCount} digit${work.digitCount === 1 ? "" : "s"}`, work.denominatorIsPowerOfTwo ? "The denominator is a power of two, so quotient extraction can be a shift and mask." : "The Burger sample compares with precomputed 1S through 9S; Gay's quorem computes one decimal digit without a general division."),
    ].join("");
    this.bindInspectors();
    this.renderEstimate(work);
    this.renderFactors(work);
    this.renderQuotient(work);
    this.querySelector(".descendant-facts").innerHTML = `<p><span>Scale work removed</span><strong>${work.scaleWalk} crossed decades → one estimate/check</strong><small>algorithmic structure, not elapsed time</small></p><p><span>Endpoint shape</span><strong>${work.unequal ? "unequal margins" : "equal margins"}</strong><small>${work.unequal ? "normal power-of-two transition" : "ordinary binary64 neighborhood"}</small></p><p><span>Answer agreement</span><strong>${work.sameOutput ? "exactly equal" : "different policy"}</strong><small>optimized ${work.output}; baseline ${work.dragonOutput}</small></p>`;
  }

  renderEstimate(work) {
    const target = work.correctedK;
    const estimate = work.estimate;
    const values = [...new Set([Math.min(estimate, target) - 1, estimate, target, Math.max(estimate, target) + 1])].sort((a, b) => a - b);
    this.querySelector(".estimate-ruler strong").textContent = work.implementation === "gay" ? "one-sided high estimate; decrement if required" : "one-sided low estimate; increment if required";
    this.querySelector(".estimate-cells").innerHTML = values.map(value => `<div class="${value === target ? "target" : ""} ${value === estimate ? "estimated" : ""}"><span>10<sup>${value}</sup></span>${value === estimate ? "<b>estimate</b>" : ""}${value === target ? "<em>correct</em>" : ""}</div>`).join("");
    this.querySelector(".estimate-ruler p").textContent = estimate === target
      ? `The estimate ${estimate} is already the required decade; the exact check leaves it unchanged.`
      : `The estimate ${estimate} is adjacent to the required decade ${target}. One exact comparison moves the state across that single boundary.`;
  }

  renderFactors(work) {
    const before = work.bitsBeforeCancellation;
    const after = work.bitsAfterCancellation;
    const maximum = Math.max(before, 1);
    const beforeBar = this.querySelector(".factor-bars .before");
    const afterBar = this.querySelector(".factor-bars .after");
    beforeBar.querySelector("i").style.width = "100%";
    afterBar.querySelector("i").style.width = `${Math.max(4, after / maximum * 100)}%`;
    beforeBar.querySelector("strong").textContent = `${before} bits`;
    afterBar.querySelector("strong").textContent = `${after} bits`;
    this.querySelector(".factor-equation").innerHTML = work.commonTwos
      ? `<code>(R, S, M−, M+) ÷ 2<sup>${work.commonTwos}</sup></code><span>The ratios do not change; ${work.commonTwos} shared low zero bits need not occupy the bignums.</span>`
      : `<code>no common 2ᵗ in this scaled state</code><span>The cancellation is input-dependent. Direct power construction and the one-check estimator still avoid the iterative scaling walk.</span>`;
  }

  renderQuotient(work) {
    const state = work.burger.states[0];
    const quotient = this.querySelector(".quotient-xray");
    quotient.querySelector("strong").textContent = `first digit ${state.digit}`;
    if (work.implementation === "gay" && work.gaySmallInteger) {
      quotient.querySelector("div").innerHTML = `<i class="native">exact binary integer</i><b>÷ exact 10ᵏ</b><i class="chosen">${state.digit}</i>`;
      quotient.querySelector("p").textContent = "Both operands and the subtraction remain exactly representable in binary64, so no bignum is allocated for this route.";
      return;
    }
    if (work.denominatorIsPowerOfTwo) {
      quotient.querySelector("div").innerHTML = `<i class="native">R</i><b>shift by log₂S</b><i class="chosen">${state.digit}</i><b>mask</b><i>remainder</i>`;
      quotient.querySelector("p").textContent = "The denominator is exactly a power of two. The digit and remainder come from word extraction instead of a general high-precision division.";
    } else {
      quotient.querySelector("div").innerHTML = Array.from({ length: 10 }, (_, digit) => `<i class="${digit === Number(state.digit) ? "chosen" : ""}">${digit}S</i>`).join("");
      quotient.querySelector("p").textContent = `Locate R between adjacent multiples of S, select ${state.digit}S, and subtract once. The authors' C sample prepares these small multiples outside the digit loop.`;
    }
  }

  bindInspectors() {
    const inspector = this.querySelector(".lab-inspector");
    this.querySelectorAll(".work-block").forEach(block => {
      const inspect = () => {
        inspector.querySelector("strong").textContent = block.querySelector("span").textContent;
        inspector.querySelector("span").textContent = block.querySelector("small").textContent;
        inspector.querySelector("code").textContent = block.querySelector("strong").textContent;
      };
      block.addEventListener("click", inspect);
      block.addEventListener("focus", inspect);
      block.addEventListener("mouseenter", inspect);
    });
  }
}

customElements.define("dragon-descendants-lab", DragonDescendantsLab);
