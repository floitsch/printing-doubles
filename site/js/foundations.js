import { exactDecimal, traceShortest } from "./oracle.js";
import { NumberLineExplorer } from "./explorer.js";

document.querySelector("#foundation-exact").textContent = exactDecimal(0.3);

const numberInput = document.querySelector("#foundation-number-input");
const zoomRange = document.querySelector("#foundation-zoom-range");
const explorer = new NumberLineExplorer(document.querySelector("#foundation-number-line"), {
  inspector: document.querySelector("#foundation-tick-inspector"),
  zoomRange,
});

function inspectInput() {
  const value = Number(numberInput.value);
  const valid = Number.isFinite(value) && value !== 0;
  numberInput.setAttribute("aria-invalid", String(!valid));
  if (valid) explorer.inspect(value);
}

document.querySelector("#foundation-number-form").addEventListener("submit", (event) => {
  event.preventDefault();
  inspectInput();
});
for (const example of document.querySelectorAll("[data-foundation-example]")) {
  example.addEventListener("click", () => {
    numberInput.value = example.dataset.foundationExample;
    inspectInput();
  });
}
zoomRange.addEventListener("input", () => explorer.setZoom(Number(zoomRange.value)));
document.querySelector("#foundation-zoom-in").addEventListener("click", () => explorer.setZoom(explorer.zoom + 5));
document.querySelector("#foundation-zoom-out").addEventListener("click", () => explorer.setZoom(explorer.zoom - 5));
document.querySelector("#foundation-reset-view").addEventListener("click", () => explorer.resetView());

document.querySelector("#oracle-trace-data").textContent = JSON.stringify(traceShortest(0.3));
await import("./trace-player.js");
