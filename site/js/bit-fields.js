import { bitsOf } from "./float.js";

export class Binary64Fields extends HTMLElement {
  connectedCallback() {
    if (!this._listening) {
      this.addEventListener("submit", (event) => {
        if (!event.target.matches(".bit-fields-form")) return;
        event.preventDefault();
        this.readInput();
      });
      this.addEventListener("input", (event) => {
        if (!event.target.matches(".bit-fields-input")) return;
        event.target.removeAttribute("aria-invalid");
        const message = this.querySelector(".bit-fields-message");
        if (message) message.textContent = "";
      });
      this._listening = true;
    }
    this.setValue(Number(this.dataset.value ?? "0.3"), this.dataset.value ?? "0.3");
  }

  readInput() {
    const input = this.querySelector(".bit-fields-input");
    const text = input.value.trim();
    const value = Number(text);
    const valid = text !== "" && (!Number.isNaN(value) || /^[+-]?nan$/i.test(text));
    if (!valid) {
      input.setAttribute("aria-invalid", "true");
      this.querySelector(".bit-fields-message").textContent = "Enter a decimal number, Infinity, or NaN.";
      return;
    }
    this.setValue(value, text);
  }

  setValue(value, inputText = displayNumber(value)) {
    if (typeof value !== "number") return;
    const bits = bitsOf(value).toString(2).padStart(64, "0");
    const sign = bits.slice(0, 1);
    const exponent = bits.slice(1, 12);
    const fraction = bits.slice(12);
    const storedExponent = Number.parseInt(exponent, 2);
    const exponentMeaning = storedExponent === 0
      ? "zero or subnormal"
      : storedExponent === 0x7ff
        ? "infinity or NaN"
        : `stored ${storedExponent}; unbiased ${storedExponent - 1023}`;
    const hex = bitsOf(value).toString(16).padStart(16, "0");

    const fractionMeaning = storedExponent === 0
      ? "no implicit leading 1"
      : storedExponent === 0x7ff
        ? "payload or special-value marker"
        : "the decoded significand begins with the implicit 1";
    const controls = this.hasAttribute("data-editable") ? `
      <form class="bit-fields-form">
        <label for="${this.inputId}">Choose a number to represent</label>
        <div><input class="bit-fields-input" id="${this.inputId}" inputmode="decimal" spellcheck="false"><button type="submit">Show its fields</button></div>
        <small class="bit-fields-message" aria-live="polite"></small>
      </form>` : "";

    this.innerHTML = `${controls}
      <div class="bit-fields" role="img" aria-label="Binary64 fields: sign ${sign}; exponent ${exponent}; fraction ${fraction}">
        <div class="bit-field bit-field-sign"><span>Sign · 1 bit</span><code>${sign}</code><small>${sign === "1" ? "negative" : "positive"}</small></div>
        <div class="bit-field bit-field-exponent"><span>Exponent · 11 bits</span><code>${groupBits(exponent)}</code><small>${exponentMeaning}</small></div>
        <div class="bit-field bit-field-fraction"><span>Fraction · 52 stored bits</span><code class="bit-lines"><i>${groupBits(fraction.slice(0, 26))}</i><i>${groupBits(fraction.slice(26))}</i></code><small>${fractionMeaning}</small></div>
      </div>
      <p class="bit-fields-hex"><span>Hexadecimal</span><code>${hex.slice(0, 3)} | ${hex.slice(3)}</code><small>The exponent/fraction boundary aligns after three hex digits; the sign/exponent boundary lies inside the first digit.</small></p>`;
    const input = this.querySelector(".bit-fields-input");
    if (input) input.value = inputText;
  }

  get inputId() {
    if (!this._inputId) this._inputId = `binary64-value-${Binary64Fields.nextId++}`;
    return this._inputId;
  }
}

Binary64Fields.nextId = 1;

function groupBits(bits) {
  return bits.replace(/(.{4})(?=.)/g, "$1 ");
}

function displayNumber(value) {
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

if (!customElements.get("binary64-fields")) customElements.define("binary64-fields", Binary64Fields);
