import {
  binaryCoordinate,
  bitHex,
  decodeDouble,
  decimalCoordinate,
  exactForm,
  floorAtDecimalScale,
  isEvenSignificand,
  midpointCoordinate,
  nextDown,
  nextUp,
  parseDecimal,
  unitExponent,
} from "./float.js";
import { NumberLineView } from "./number-line-view.js";

const LOG10_2 = Math.LOG10E * Math.LN2;

export class NumberLineExplorer {
  constructor(canvas, elements) {
    this.canvas = canvas;
    this.numberLine = new NumberLineView(canvas);
    this.elements = elements;
    this.value = 0.3;
    this.zoom = 72;
    this.pan = 0;
    this.drag = null;
    this.bindEvents();
    this.inspect(this.value);
  }

  bindEvents() {
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.setZoom(this.zoom + (event.deltaY < 0 ? 5 : -5));
    }, { passive: false });
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { x: event.clientX, pan: this.pan };
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.drag) return;
      const span = this.span();
      this.pan = this.drag.pan - (event.clientX - this.drag.x) / this.canvas.clientWidth * span * 2;
      this.draw();
    });
    this.canvas.addEventListener("pointerup", () => { this.drag = null; });
    this.canvas.addEventListener("pointercancel", () => { this.drag = null; });
    this.canvas.addEventListener("dblclick", () => this.resetView());
    this.canvas.addEventListener("keydown", (event) => {
      if (["+", "="].includes(event.key)) this.setZoom(this.zoom + 5);
      else if (event.key === "-") this.setZoom(this.zoom - 5);
      else if (event.key === "ArrowLeft") { this.pan -= this.span() * 0.12; this.draw(); }
      else if (event.key === "ArrowRight") { this.pan += this.span() * 0.12; this.draw(); }
      else if (event.key === "Home") this.resetView();
      else return;
      event.preventDefault();
    });
  }

  span() {
    return 2 ** ((72 - this.zoom) / 6 + 3);
  }

  setZoom(zoom) {
    this.zoom = Math.max(0, Math.min(100, zoom));
    if (this.elements.zoomRange) this.elements.zoomRange.value = String(this.zoom);
    this.draw();
  }

  resetView() {
    this.pan = 0;
    this.setZoom(72);
  }

  inspect(value) {
    if (!Number.isFinite(value) || value === 0) return false;
    this.value = value;
    this.center = decodeDouble(value);
    this.unitExp = unitExponent(value);
    this.previous = decodeDouble(nextDown(value));
    this.following = decodeDouble(nextUp(value));
    this.lowerBoundary = midpointCoordinate(this.previous, this.center, this.center, this.unitExp);
    this.upperBoundary = midpointCoordinate(this.center, this.following, this.center, this.unitExp);
    this.pan = 0;
    this.elements.printed.textContent = value.toString();
    this.elements.bits.textContent = bitHex(this.center);
    this.elements.exact.textContent = exactForm(this.center);
    this.draw();
    return true;
  }

  draw() {
    if (!this.center) return;
    const width = Math.max(320, this.canvas.clientWidth);
    const span = this.span();
    const left = this.pan - span;
    const right = this.pan + span;
    const intervalPixels = (this.upperBoundary - this.lowerBoundary) / (right - left) * width;
    const lowerSpacing = Math.abs(binaryCoordinate(this.previous, this.center, this.unitExp));
    const upperSpacing = Math.abs(binaryCoordinate(this.following, this.center, this.unitExp));
    const spacingChanges = Math.abs(lowerSpacing - upperSpacing) > Number.EPSILON;
    const brackets = spacingChanges ? [
      { from: -lowerSpacing, to: 0, y: .51, color: "#8eb3ff", label: `spacing = 2^${this.unitExp + Math.round(Math.log2(lowerSpacing))}` },
      { from: 0, to: upperSpacing, y: .51, color: "#8eb3ff", label: `spacing = 2^${this.unitExp + Math.round(Math.log2(upperSpacing))}` },
    ] : [];
    this.numberLine.setScene({
      domain: [left, right],
      bands: [{ from: this.lowerBoundary, to: this.upperBoundary, top: .125, bottom: .88, color: "rgba(223,255,82,.13)", label: intervalPixels > 140 ? "ROUND-TRIP INTERVAL" : undefined }],
      markers: [
        { x: this.lowerBoundary, from: .12, to: .89, color: "#dfff52", dash: [3, 5] },
        { x: this.upperBoundary, from: .12, to: .89, color: "#dfff52", dash: [3, 5] },
        { x: 0, from: .08, to: .92, color: "rgba(255,255,255,.35)", dash: [2, 7] },
      ],
      lanes: [
        { y: .35, color: "#8eb3ff", label: `BINARY64 · REFERENCE UNIT = 2^${this.unitExp}`, ticks: this.binaryTicks(left, right) },
        { y: .72, color: "#ff9b8e", label: this.decimalLabel(span), ticks: this.decimalTicks(left, right, span, width) },
      ],
      brackets,
      captions: spacingChanges ? [{ x: 0, y: .09, align: "center", color: "#dfff52", text: "EXPONENT TRANSITION · BINARY SPACING DOUBLES" }] : [],
      footer: isEvenSignificand(this.center) ? "EVEN SIGNIFICAND · BOUNDARIES INCLUDED" : "ODD SIGNIFICAND · BOUNDARIES EXCLUDED",
    });
  }

  binaryTicks(left, right) {
    const ticks = [];
    if (right - left <= 180) {
      const points = [{ decoded: this.center, coordinate: 0, index: 0 }];
      let value = this.value;
      for (let i = 1; i < 110; i++) {
        value = nextUp(value);
        if (!Number.isFinite(value)) break;
        const coordinate = binaryCoordinate(decodeDouble(value), this.center, this.unitExp);
        if (coordinate > right + 2) break;
        points.push({ decoded: decodeDouble(value), coordinate, index: i });
      }
      value = this.value;
      for (let i = 1; i < 110; i++) {
        value = nextDown(value);
        if (!Number.isFinite(value)) break;
        const coordinate = binaryCoordinate(decodeDouble(value), this.center, this.unitExp);
        if (coordinate < left - 2) break;
        points.push({ decoded: decodeDouble(value), coordinate, index: -i });
      }
      for (const point of points) {
        const major = point.index === 0;
        ticks.push({
          x: point.coordinate,
          active: major,
          color: major ? "#1565ff" : "#8eb3ff",
          height: major ? 42 : 20,
          below: major ? 43 : 20,
          topLabel: major ? "selected double" : (Math.abs(point.index) <= 2 && right - left < 20) ? point.index < 0 ? "previous" : "next" : undefined,
          textColor: major ? "#f4f0e8" : "#8eb3ff",
        });
      }
    } else {
      const spacing = 2 ** Math.ceil(Math.log2((right - left) / 70));
      const first = Math.floor(left / spacing) * spacing;
      for (let coordinate = first; coordinate <= right; coordinate += spacing) {
        const rank = coordinate === 0 ? 4 : Math.min(3, countFactorsOfTwo(Math.round(Math.abs(coordinate / spacing))));
        ticks.push({ x: coordinate, active: coordinate === 0, color: coordinate === 0 ? "#1565ff" : "#8eb3ff", height: 10 + rank * 6 });
      }
    }
    return ticks;
  }

  decimalExponent(span) {
    return Math.max(-340, Math.min(325, Math.floor(this.unitExp * LOG10_2 + Math.log10(span / 7))));
  }

  decimalLabel(span) {
    return `DECIMAL CANDIDATES · STEP = 10^${this.decimalExponent(span)} · LABELS SHOW CHANGING SUFFIX`;
  }

  decimalTicks(left, right, span, width) {
    const ticks = [];
    const exponent = this.decimalExponent(span);
    const centerIndex = floorAtDecimalScale(this.center, exponent);
    const start = centerIndex - 80n;

    for (let offset = 0n; offset <= 160n; offset++) {
      const coefficient = start + offset;
      const coordinate = decimalCoordinate(coefficient, exponent, this.center, this.unitExp);
      if (coordinate < left - span * .1 || coordinate > right + span * .1) continue;
      const major = coefficient % 10n === 0n;
      const medium = coefficient % 5n === 0n;
      const decimalRank = Math.min(3, countFactorsOfTen(coefficient));
      const inInterval = coordinate >= this.lowerBoundary && coordinate <= this.upperBoundary;
      const heightTick = 15 + (medium ? 9 : 0) + (major ? 10 : 0) + decimalRank * 5;
      const labelSpacing = width / (right - left) * Math.abs(decimalCoordinate(coefficient + 10n, exponent, this.center, this.unitExp) - coordinate);
      const showLabel = major && labelSpacing > 62;
      ticks.push({
        x: coordinate,
        active: inInterval,
        color: inInterval ? "#ef4b35" : "#ff9b8e",
        width: inInterval ? 2.5 : 1,
        height: heightTick,
        dot: inInterval ? 3 : undefined,
        label: showLabel ? changingSuffix(coefficient) : undefined,
      });
    }

    const printed = parseDecimal(this.value.toString());
    if (printed) {
      const coordinate = decimalCoordinate(printed.coefficient, printed.exponent, this.center, this.unitExp);
      ticks.push({ x: coordinate, active: true, color: "#ef4b35", width: 3, height: 60, dot: 5, topLabel: `short output: ${this.value.toString()}` });
    }
    return ticks;
  }
}

function countFactorsOfTwo(value) {
  if (!value) return 4;
  let count = 0;
  while (value % 2 === 0) { value /= 2; count++; }
  return count;
}

function countFactorsOfTen(value) {
  if (value === 0n) return 3;
  let count = 0;
  while (value % 10n === 0n) { value /= 10n; count++; }
  return count;
}

function changingSuffix(coefficient) {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString();
  const suffix = digits.slice(-3).padStart(3, "0");
  return `${negative ? "−" : ""}${digits.length > 3 ? "…" : ""}${suffix}`;
}
