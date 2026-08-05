import { zmijSemantic } from "./zmij-reference.js";

const PRESETS = [0.3, 1 / 3, 1e23, 1.0000000000000002, 1.2345];

class ZmijPipeline extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="algorithm-lab zmij-lab"><div class="algorithm-lab-head"><div><span class="lab-kicker">Pinned implementation x-ray</span><strong>One scale product feeds selection while digit bytes are prepared in groups</strong></div><output class="candidate-result zmij-result"></output></div><form class="candidate-input"><label for="zmij-value">Normal binary64 value</label><div><input id="zmij-value" value="0.3" inputmode="decimal"><button type="submit">Inspect</button></div><p class="input-message"></p></form><div class="lab-presets zmij-presets">${PRESETS.map(v => `<button type="button">${v === 1 / 3 ? "1/3" : v}</button>`).join("")}</div><div class="zmij-platform"><label>Digit path<select><option value="scalar">scalar</option><option value="sse">SSE</option><option value="neon">NEON</option></select></label><p>Candidate selection is unchanged; only integer-to-byte realization changes.</p></div><div class="candidate-facts zmij-facts"></div><div class="zmij-pipeline"><article data-node="scale"><span>1</span><strong>Scale one place farther</strong><small>cached 10^(−k−1)</small></article><i>→</i><article data-node="window"><span>2</span><strong>One retained product window</strong><small>integral and fractional facts</small></article><i>↗</i><article data-node="integer"><span>3a</span><strong>Integral field</strong><small></small></article><i>↓</i><article data-node="last"><span>3b</span><strong>Fraction × 10</strong><small></small></article><i>↘</i><article data-node="join"><span>4</span><strong>Shortest decimal record</strong><small></small></article></div><div class="zmij-bcd"><div class="zmij-bcd-head"><span>Integer-to-character pipeline</span><strong></strong></div><div class="zmij-groups source"></div><div class="zmij-split-label">split 10⁸ groups → split 10⁴ groups → split 10² pairs → decimal bytes</div><div class="zmij-groups digits"></div><p class="zmij-emission-note"></p></div><div class="lab-inspector"><strong>What this x-ray claims</strong><span>The decimal result is supplied by the site’s exact oracle. The operation graph and byte-grouping stages are traced from the pinned Żmij source; this is not a line-by-line JavaScript port of its wide-product inequalities.</span><code>vitaut/zmij @ 8289609</code></div></div>`;
    this.input = this.querySelector("input"); this.message = this.querySelector(".input-message");
    this.querySelector("form").addEventListener("submit", e => { e.preventDefault(); this.select(Number(this.input.value)); });
    this.querySelectorAll(".zmij-presets button").forEach((b, i) => b.addEventListener("click", () => { this.input.value = String(PRESETS[i]); this.select(PRESETS[i]); }));
    this.querySelector("select").addEventListener("change", () => this.render()); this.select(.3);
  }
  select(value) {
    try { const result = zmijSemantic(value); if (!result.normal) throw new Error("The current x-ray models Żmij’s ordinary normal path; use a normal value."); this.result = result; this.message.textContent = ""; this.render(); }
    catch (error) { this.message.textContent = error.message; }
  }
  render() {
    const r = this.result; const platform = this.querySelector("select").value; const chars = r.recordDigits.padStart(17, "0").split("");
    this.querySelector(".zmij-result").innerHTML = `<span>formatted output</span><strong>${r.shortest.text}</strong><small>record ${r.recordCoefficient} × 10^${r.recordExponent}</small>`;
    this.querySelector(".zmij-facts").innerHTML = `<p><span>Integral field</span><strong>${r.integral}</strong><small>all but the extra fractional digit</small></p><p><span>Extra digit</span><strong>${r.lastDigit}</strong><small>${r.hasLastDigit ? "retained in the shortest record" : "zero; omitted from output"}</small></p><p><span>Byte path</span><strong>${platform.toUpperCase()}</strong><small>${platform === "scalar" ? "multiply-and-shift group splits" : "lane-parallel BCD and byte shuffle"}</small></p>`;
    this.querySelector('[data-node="integer"] small').textContent = String(r.integral);
    this.querySelector('[data-node="last"] small').textContent = `last digit ${r.lastDigit}`;
    this.querySelector('[data-node="join"] small').textContent = `${r.recordCoefficient} × 10^${r.recordExponent}`;
    this.querySelector(".zmij-bcd-head strong").textContent = `${r.integral} → ${r.shortest.text}`;
    const integralDigits = chars.slice(0, 16);
    this.querySelector(".zmij-groups.source").innerHTML = `<span>${integralDigits.slice(0, 8).join("")}</span><span>${integralDigits.slice(8).join("")}</span><b class="last">${chars[16]}</b>`;
    this.querySelector(".zmij-groups.digits").innerHTML = chars.map((digit, i) => `<b class="${i === 16 ? "last" : ""} ${digit === "0" ? "zero" : ""}">${digit}</b>`).join("");
    this.querySelector(".zmij-emission-note").textContent = platform === "scalar" ? "Scalar source: simultaneous quotient/remainder splits by 10000, then 100, then 10; constant divisions become multiply-and-shift operations." : `${platform.toUpperCase()} source: grouped integers are converted in lanes, translated to character bytes, and shuffled into output order.`;
  }
}
if (!customElements.get("zmij-pipeline")) customElements.define("zmij-pipeline", ZmijPipeline);
