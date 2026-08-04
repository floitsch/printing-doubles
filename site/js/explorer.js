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
import { exactDecimal, exactDecimalOfRational, intervalOf } from "./oracle.js";

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
    this.pointers = new Map();
    this.pinch = null;
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
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.wasDragged = false;
      if (this.pointers.size === 1) {
        this.drag = { x: event.clientX, pan: this.pan };
      } else if (this.pointers.size === 2) {
        this.pinch = { distance: pointerDistance(this.pointers), zoom: this.zoom };
        this.drag = null;
      }
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2 && this.pinch) {
        const distance = pointerDistance(this.pointers);
        if (distance > 0 && this.pinch.distance > 0) this.setZoom(this.pinch.zoom + 24 * Math.log2(distance / this.pinch.distance));
        return;
      }
      if (!this.drag) {
        if (event.pointerType === "mouse") this.showHit(this.numberLine.hitTest(event.clientX, event.clientY));
        return;
      }
      if (Math.abs(event.clientX - this.drag.x) > 4) this.wasDragged = true;
      const span = this.span();
      this.pan = this.drag.pan - (event.clientX - this.drag.x) / this.canvas.clientWidth * span * 2;
      this.draw();
    });
    const endPointer = (event) => {
      this.pointers.delete(event.pointerId);
      this.pinch = null;
      const remaining = this.pointers.values().next().value;
      this.drag = remaining ? { x: remaining.x, pan: this.pan } : null;
    };
    this.canvas.addEventListener("pointerup", endPointer);
    this.canvas.addEventListener("pointercancel", endPointer);
    this.canvas.addEventListener("click", (event) => {
      if (!this.wasDragged) this.activateHit(this.numberLine.hitTest(event.clientX, event.clientY));
    });
    this.canvas.addEventListener("dblclick", () => this.resetView());
    this.canvas.addEventListener("keydown", (event) => {
      if (["+", "="].includes(event.key)) this.setZoom(this.zoom + 5);
      else if (event.key === "-") this.setZoom(this.zoom - 5);
      else if (event.key === "ArrowLeft") { this.pan -= this.span() * 0.12; this.draw(); }
      else if (event.key === "ArrowRight") { this.pan += this.span() * 0.12; this.draw(); }
      else if (event.key.toLowerCase() === "p") this.inspect(nextDown(this.value));
      else if (event.key.toLowerCase() === "n") this.inspect(nextUp(this.value));
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
    this.interval = intervalOf(value);
    this.lowerBoundary = midpointCoordinate(this.previous, this.center, this.center, this.unitExp);
    this.upperBoundary = midpointCoordinate(this.center, this.following, this.center, this.unitExp);
    this.pan = 0;
    this.elements.printed.textContent = value.toString();
    this.elements.bits.textContent = bitHex(this.center);
    this.elements.exact.textContent = exactForm(this.center);
    if (this.elements.inspector) this.elements.inspector.textContent = `Selected double ${value.toString()} · bits ${bitHex(this.center)}. Hover or tap a tick or midpoint; press P or N to select a neighbor.`;
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
        { x: this.lowerBoundary, from: .12, to: .89, color: "#dfff52", dash: [3, 5], inspect: { kind: "boundary", role: "lower midpoint", value: exactDecimalOfRational(this.interval.lower), included: this.interval.closed } },
        { x: this.upperBoundary, from: .12, to: .89, color: "#dfff52", dash: [3, 5], inspect: { kind: "boundary", role: "upper midpoint", value: exactDecimalOfRational(this.interval.upper), included: this.interval.closed } },
        { x: 0, from: .08, to: .92, color: "rgba(255,255,255,.35)", dash: [2, 7] },
      ],
      lanes: [
        { y: .35, color: "#8eb3ff", label: `BINARY64 · REFERENCE UNIT = 2^${this.unitExp}`, labelOffset: 78, ticks: this.binaryTicks(left, right) },
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
      const points = [{ decoded: this.center, coordinate: 0, index: 0, value: this.value }];
      for (const { value, index: i } of neighboringDoubles(this.value, "up")) {
        const coordinate = binaryCoordinate(decodeDouble(value), this.center, this.unitExp);
        if (coordinate > right + 2) break;
        points.push({ decoded: decodeDouble(value), coordinate, index: i, value });
      }
      for (const { value, index: i } of neighboringDoubles(this.value, "down")) {
        const coordinate = binaryCoordinate(decodeDouble(value), this.center, this.unitExp);
        if (coordinate < left - 2) break;
        points.push({ decoded: decodeDouble(value), coordinate, index: -i, value });
      }
      for (const point of points) {
        const major = point.index === 0;
        const zero = point.value === 0 || Object.is(point.value, -0);
        ticks.push({
          x: point.coordinate,
          active: major,
          color: major ? "#1565ff" : "#8eb3ff",
          height: major ? 42 : 20,
          below: major ? 43 : 20,
          label: zero ? "0" : undefined,
          topLabel: major ? "selected double" : undefined,
          textColor: major ? "#f4f0e8" : "#8eb3ff",
          inspect: { kind: "double", role: major ? "selected double" : point.index < 0 ? "previous double" : "next double", value: point.value, selected: major },
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

  showHit(hit) {
    if (!this.elements.inspector) return;
    this.canvas.style.cursor = hit ? "pointer" : "grab";
    if (!hit) return;
    const item = hit.inspect;
    if (item.kind === "boundary") {
      this.elements.inspector.textContent = `${item.role} · ${item.value} · endpoint ${item.included ? "included (selected significand is even)" : "excluded (selected significand is odd)"}`;
    } else if (item.kind === "double") {
      const decoded = decodeDouble(item.value);
      this.elements.inspector.textContent = `${item.role} · ${exactDecimal(item.value)} · bits ${bitHex(decoded)}${item.selected || item.value === 0 ? "" : " · tap or click to select"}`;
    }
  }

  activateHit(hit) {
    if (!hit) return;
    this.showHit(hit);
    const item = hit.inspect;
    if (item.kind === "double" && !item.selected && item.value !== 0 && Number.isFinite(item.value)) this.inspect(item.value);
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

function pointerDistance(pointers) {
  const [first, second] = [...pointers.values()];
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function neighboringDoubles(value, direction, limit = 109) {
  const result = [];
  const advance = direction === "up" ? nextUp : nextDown;
  let cursor = value;
  for (let index = 1; index <= limit; index++) {
    cursor = advance(cursor);
    if (!Number.isFinite(cursor)) break;
    result.push({ value: cursor, index });
    if (cursor === 0 || Object.is(cursor, -0)) break;
  }
  return result;
}
