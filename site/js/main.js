import "./bit-fields.js";
import { NumberLineExplorer } from "./explorer.js";
import { problemTrace } from "./problem-trace.js";

const canvas = document.querySelector("#number-line");
const input = document.querySelector("#number-input");
const form = document.querySelector("#number-form");
const zoomRange = document.querySelector("#zoom-range");

const explorer = new NumberLineExplorer(canvas, {
  printed: document.querySelector("#printed-value"),
  bits: document.querySelector("#bit-value"),
  exact: document.querySelector("#exact-value"),
  inspector: document.querySelector("#tick-inspector"),
  bitFields: document.querySelector("#explorer-bit-fields"),
  zoomRange,
});

const sharedValue = new URLSearchParams(window.location.search).get("value");
if (sharedValue !== null) {
  const value = Number(sharedValue);
  if (Number.isFinite(value) && value !== 0) {
    input.value = sharedValue;
    explorer.inspect(value);
  }
}

function inspectInput() {
  const value = Number(input.value);
  const valid = Number.isFinite(value) && value !== 0;
  input.setAttribute("aria-invalid", String(!valid));
  if (valid) {
    explorer.inspect(value);
    const url = new URL(window.location.href);
    url.searchParams.set("value", input.value);
    window.history.replaceState(null, "", url);
  }
}

form.addEventListener("submit", (event) => { event.preventDefault(); inspectInput(); });
for (const example of document.querySelectorAll("[data-example]")) {
  example.addEventListener("click", () => { input.value = example.dataset.example; inspectInput(); });
}
zoomRange.addEventListener("input", () => explorer.setZoom(Number(zoomRange.value)));
document.querySelector("#zoom-in").addEventListener("click", () => explorer.setZoom(explorer.zoom + 5));
document.querySelector("#zoom-out").addEventListener("click", () => explorer.setZoom(explorer.zoom - 5));
document.querySelector("#reset-view").addEventListener("click", () => explorer.resetView());

document.querySelector("#problem-trace-data").textContent = JSON.stringify(problemTrace(0.3));
await import("./trace-player.js");
