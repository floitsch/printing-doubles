import { nextUp } from "./float.js";
import { normalizeDecimal } from "./interval-core.js";
import { dragonboxExact } from "./dragonbox-reference.js";

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

class DragonboxRoute extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="algorithm-lab dragonbox-route-lab">
        <div class="algorithm-lab-head"><div><span class="lab-kicker">Arithmetic routing laboratory</span><strong>One product window; a coarse attempt; one-digit refinement when needed</strong></div><output class="candidate-result route-result"></output></div>
        <form class="candidate-input route-input"><label for="dragonbox-value">Binary64 value</label><div><input id="dragonbox-value" value="0.3" inputmode="decimal"><button type="submit">Route</button></div><p class="input-message"></p></form>
        <div class="lab-presets route-presets"><button type="button" data-value="0.3">large divisor · 0.3</button><button type="button" data-value="nextUp1">small divisor · nextUp(1)</button><button type="button" data-value="2">shorter interval · 2</button><button type="button" data-value="1000">trailing zeros · 1000</button></div>
        <div class="route-policies">
          <label>Cache<select data-policy="cache"><option value="full">full table</option><option value="compact">compact table</option></select></label>
          <label>Trailing zeros<select data-policy="trailingZero"><option value="remove">remove</option><option value="report">report only</option><option value="ignore">leave untouched</option></select></label>
          <label>Sign<select data-policy="sign"><option value="return">return sign</option><option value="ignore">ignore sign</option></select></label>
        </div>
        <div class="candidate-facts route-facts"></div>
        <svg class="algorithm-svg route-svg" role="img" aria-label="Dragonbox routing through interval classification, cached multiplication, large or small divisor, and output policies"></svg>
        <div class="lab-inspector" aria-live="polite"></div>
      </div>`;
    this.svg = this.querySelector("svg");
    this.inspector = this.querySelector(".lab-inspector");
    this.input = this.querySelector("input");
    this.message = this.querySelector(".input-message");
    this.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); this.selectValue(Number(this.input.value)); });
    for (const button of this.querySelectorAll(".route-presets button")) button.addEventListener("click", () => {
      const value = button.dataset.value === "nextUp1" ? nextUp(1) : Number(button.dataset.value);
      this.input.value = button.dataset.value === "nextUp1" ? "1.0000000000000002" : button.dataset.value;
      this.selectValue(value);
    });
    for (const select of this.querySelectorAll(".route-policies select")) select.addEventListener("change", () => this.compute());
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.svg);
    this.selectValue(.3);
  }

  disconnectedCallback() { this.resizeObserver?.disconnect(); }

  selectValue(value) {
    if (!Number.isFinite(value) || value === 0) { this.message.textContent = "Enter a finite, nonzero value."; return; }
    this.value = value;
    this.message.textContent = "";
    this.compute();
  }

  policies() {
    return Object.fromEntries([...this.querySelectorAll(".route-policies select")].map((select) => [select.dataset.policy, select.value]));
  }

  compute() {
    this.result = dragonboxExact(this.value, this.policies());
    this.render();
  }

  showDetail(detail) { this.inspector.innerHTML = `<strong>${detail.heading}</strong><span>${detail.body}</span>${detail.exact ? `<code>${detail.exact}</code>` : ""}`; }

  render() {
    if (!this.result) return;
    const result = this.result;
    const width = Math.max(320, Math.round(this.svg.clientWidth || 900));
    const height = width < 560 ? 690 : 530;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.replaceChildren();
    this.querySelector(".route-result").innerHTML = `<span>decimal pair</span><strong>${result.text}</strong><small>${result.coefficient} × 10^${result.exponent}</small>`;
    const selected = normalizeDecimal(result.schubfach.selected.coefficient, result.schubfach.selected.exponent);
    this.querySelector(".route-facts").innerHTML = `<p><span>Interval route</span><strong>${result.shorterInterval ? "shorter" : "regular"}</strong><small>${result.shorterInterval ? "power-of-two geometry" : "ordinary midpoint geometry"}</small></p><p><span>Candidate route</span><strong>${result.divisorPath === "big" ? "large divisor" : "small divisor"}</strong><small>${result.divisorPath === "big" ? "coarse candidate succeeds" : "remainder is refined"}</small></p><p><span>Selected value</span><strong>${selected.text}</strong><small>before output policies</small></p>`;
    append(this.svg, "rect", { x: 0, y: 0, width, height, class: "lab-svg-background" });

    const mobile = width < 560;
    const nodes = mobile ? {
      classify: [width / 2, 72], product: [width / 2, 205], large: [width / 2, 340], small: [width / 2, 485], output: [width / 2, 620],
    } : {
      classify: [130, 150], product: [355, 150], large: [590, 150], small: [590, 360], output: [850, 255],
    };
    const activeSmall = !result.shorterInterval && result.divisorPath === "small";
    const activeShort = result.shorterInterval;
    if (mobile) {
      this.edge(nodes.classify, nodes.product, !activeShort);
      this.edge(nodes.product, nodes.large, !activeShort);
      this.edge(nodes.large, nodes.small, activeSmall);
      this.edge(activeSmall ? nodes.small : activeShort ? nodes.classify : nodes.large, nodes.output, true);
    } else {
      this.edge(nodes.classify, nodes.product, !activeShort);
      this.edge(nodes.product, nodes.large, !activeShort);
      this.edge(nodes.large, nodes.small, activeSmall);
      this.edge(nodes.large, nodes.output, !activeSmall && !activeShort);
      this.edge(nodes.small, nodes.output, activeSmall);
      this.edge(nodes.classify, nodes.output, activeShort, true);
    }
    this.node(nodes.classify, "1", "classify interval", activeShort ? "shorter path" : "regular path", true, { title: "Classify the parsing interval", heading: activeShort ? "Shorter power-of-two interval" : "Regular interval", body: activeShort ? "A normal power of two has a closer predecessor. Dragonbox routes it through a dedicated endpoint calculation instead of burdening the common path." : "The predecessor and successor use ordinary spacing, so the shared multiplier-and-divisor path applies." });
    this.node(nodes.product, "2", "cached product", result.policies.cache === "full" ? "direct table entry" : "reconstructed entry", !activeShort, { title: "One cached multiplier window", heading: "Compute endpoint and width facts together", body: `${result.cacheAccess}. The product supplies the retained endpoint integer, scaled width, exactness, and parity facts used downstream.`, exact: `cache policy = ${result.policies.cache}` });
    this.node(nodes.large, "3", "large divisor", result.divisorPath === "big" ? "coarse candidate survives" : "coarse candidate fails", !activeShort, { title: "Try the large divisor", heading: result.divisorPath === "big" ? "The shorter candidate succeeds" : "Keep the remainder", body: result.divisorPath === "big" ? "The coarse Schubfach candidate lies inside the parsing interval, so it wins before any fine-grid distance comparison." : "The coarse candidate is outside. Dragonbox retains the quotient and remainder; it does not repeat the cached multiplication.", exact: `candidate grid = 10^${result.schubfach.k + 1}` });
    this.node(nodes.small, "4", "small divisor", activeSmall ? "reuse remainder; add one digit" : "not needed", activeSmall, { title: "Refine with the small divisor", heading: "Recover one additional decimal digit", body: "The retained remainder locates the center within the finer decimal cell. Exact divisibility and parity are consulted only at the halfway case.", exact: `candidate grid = 10^${result.schubfach.k}` });
    this.node(nodes.output, "5", "policy dock", `${result.policies.trailingZero} zeros · ${result.policies.sign} sign`, true, { title: "Return the decimal record", heading: "Selection and representation policy are separate", body: `The mathematical candidate is ${selected.text}. The current controls ${result.policies.trailingZero === "remove" ? `remove ${result.removedTrailingZeros} trailing zero${result.removedTrailingZeros === 1 ? "" : "s"}` : result.policies.trailingZero === "report" ? "report whether trailing zeros may exist" : "leave trailing zeros untouched"}; cache layout does not change the selected real value.`, exact: `returned (${result.coefficient}, ${result.exponent})` });
    this.showDetail({ heading: activeShort ? "The dedicated shorter-interval lane is active" : activeSmall ? "The large divisor fails; the remainder continues" : "The large divisor returns the shorter candidate", body: activeShort ? "This route is a control-flow specialization of the same parsing-interval contract." : activeSmall ? "Only the fine-grid refinement is highlighted. The product is not repeated." : "The small-divisor box remains inactive because a valid coarse candidate is already shorter.", exact: `output ${result.text}` });
  }

  edge(from, to, active, curved = false) {
    const [x1, y1] = from; const [x2, y2] = to;
    const d = curved ? `M ${x1} ${y1} C ${x1 + 180} ${y1 + 20}, ${x2 - 170} ${y2 - 40}, ${x2} ${y2}` : `M ${x1} ${y1} L ${x2} ${y2}`;
    append(this.svg, "path", { d, class: `route-edge ${active ? "active" : "inactive"}` });
  }

  node(position, index, title, subtitle, active, detail) {
    const [x, y] = position;
    const width = 180; const height = 82;
    const group = append(this.svg, "g", { class: `route-node ${active ? "active" : "inactive"}`, transform: `translate(${x - width / 2} ${y - height / 2})` });
    append(group, "rect", { width, height, rx: 4 });
    append(group, "text", { x: 14, y: 20, class: "route-index" }, index);
    append(group, "text", { x: 14, y: 43, class: "route-title" }, title);
    append(group, "text", { x: 14, y: 64, class: "route-subtitle" }, subtitle);
    activate(group, detail, this);
  }
}

if (!customElements.get("dragonbox-route")) customElements.define("dragonbox-route", DragonboxRoute);
