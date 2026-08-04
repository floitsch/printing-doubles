import { bitsOf } from "./float.js";

export class Binary64Fields extends HTMLElement {
  connectedCallback() {
    this.setValue(Number(this.dataset.value ?? "0.3"));
  }

  setValue(value) {
    if (!Number.isFinite(value) && !Number.isNaN(value)) return;
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

    this.innerHTML = `
      <div class="bit-fields" role="img" aria-label="Binary64 fields: sign ${sign}; exponent ${exponent}; fraction ${fraction}">
        <div class="bit-field bit-field-sign"><span>Sign · 1 bit</span><code>${sign}</code><small>${sign === "1" ? "negative" : "positive"}</small></div>
        <div class="bit-field bit-field-exponent"><span>Exponent · 11 bits</span><code>${groupBits(exponent)}</code><small>${exponentMeaning}</small></div>
        <div class="bit-field bit-field-fraction"><span>Fraction · 52 bits</span><code>${groupBits(fraction)}</code><small>${storedExponent === 0 ? "no implicit leading 1" : "normal value: significand begins 1."}</small></div>
      </div>
      <p class="bit-fields-hex"><span>Hexadecimal</span><code>${hex.slice(0, 3)} | ${hex.slice(3)}</code><small>The exponent/fraction boundary aligns after three hex digits; the sign/exponent boundary lies inside the first digit.</small></p>`;
  }
}

function groupBits(bits) {
  return bits.replace(/(.{4})(?=.)/g, "$1 ");
}

if (!customElements.get("binary64-fields")) customElements.define("binary64-fields", Binary64Fields);
