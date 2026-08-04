import { NumberLineExplorer } from "./explorer.js";
import { binaryCoordinate, decodeDouble, decimalCoordinate, midpointCoordinate, nextDown, nextUp, parseDecimal, unitExponent } from "./float.js";
import { NumberLineView } from "./number-line-view.js";

const canvas = document.querySelector("#number-line");
const input = document.querySelector("#number-input");
const form = document.querySelector("#number-form");
const zoomRange = document.querySelector("#zoom-range");

const explorer = new NumberLineExplorer(canvas, {
  printed: document.querySelector("#printed-value"),
  bits: document.querySelector("#bit-value"),
  exact: document.querySelector("#exact-value"),
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

const intervalCanvas = document.querySelector("#interval-number-line");
if (intervalCanvas) {
  const value = 0.3;
  const center = decodeDouble(value);
  const previous = decodeDouble(nextDown(value));
  const following = decodeDouble(nextUp(value));
  const unit = unitExponent(value);
  const previousX = binaryCoordinate(previous, center, unit);
  const nextX = binaryCoordinate(following, center, unit);
  const lowerX = midpointCoordinate(previous, center, center, unit);
  const upperX = midpointCoordinate(center, following, center, unit);
  const decimalTicks = [
    ["exact stored value", "0.299999999999999988897769753748434595763683319091796875"],
    ["short output: 0.3", "0.3"],
  ].map(([label, text]) => {
    const decimal = parseDecimal(text);
    return { x: decimalCoordinate(decimal.coefficient, decimal.exponent, center, unit), color: "#ef4b35", width: label.startsWith("short") ? 3 : 1.5, height: label.startsWith("short") ? 48 : 30, dot: label.startsWith("short") ? 4 : 2, topLabel: label };
  });
  new NumberLineView(intervalCanvas).setScene({
    domain: [previousX - .18, nextX + .18],
    background: "#192632",
    bands: [{ from: lowerX, to: upperX, top: .13, bottom: .88, color: "rgba(223,255,82,.14)", label: "ROUND-TRIP INTERVAL" }],
    markers: [
      { x: lowerX, from: .13, to: .86, color: "#dfff52", dash: [3, 5], label: "lower midpoint", labelY: .94 },
      { x: upperX, from: .13, to: .86, color: "#dfff52", dash: [3, 5], label: "upper midpoint", labelY: .94 },
    ],
    lanes: [
      { y: .4, color: "#ff9b8e", label: "DECIMAL VALUES", ticks: decimalTicks },
      { y: .69, color: "#8eb3ff", label: "ADJACENT BINARY64 VALUES", ticks: [
        { x: previousX, color: "#8eb3ff", height: 30, topLabel: "previous double" },
        { x: 0, color: "#1565ff", width: 3, height: 52, dot: 4, topLabel: "selected double" },
        { x: nextX, color: "#8eb3ff", height: 30, topLabel: "next double" },
      ] },
    ],
    footer: "ALL POSITIONS ARE COMPUTED FROM THE EXACT BINARY64 VALUE OF 0.3",
  });
}

const binaryDots = document.querySelector(".binary-dots");
const decimalDots = document.querySelector(".decimal-dots");
for (let i = 0; i < 52; i++) {
  const angle = i / 52 * Math.PI * 2;
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("cx", String(320 + Math.cos(angle) * (260 + 16 * Math.sin(angle * 3))));
  dot.setAttribute("cy", String(210 + Math.sin(angle) * 155));
  dot.setAttribute("r", i % 13 === 0 ? "3.2" : "1.5");
  dot.setAttribute("fill", "#1565ff");
  binaryDots.append(dot);
}
for (let i = 0; i < 36; i++) {
  const angle = i / 36 * Math.PI * 2 + .22;
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("cx", String(320 + Math.cos(angle) * 234));
  dot.setAttribute("cy", String(210 + Math.sin(angle) * (174 + 14 * Math.cos(angle * 2))));
  dot.setAttribute("r", i % 9 === 0 ? "3.2" : "1.5");
  dot.setAttribute("fill", "#ef4b35");
  decimalDots.append(dot);
}
