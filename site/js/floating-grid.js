import { binaryCoordinate, decodeDouble, nextDown, nextUp, unitExponent } from "./float.js";
import { NumberLineView } from "./number-line-view.js";

const one = 1;
const center = decodeDouble(one);
const unit = unitExponent(one);
const values = [];
let cursor = one;
for (let index = 0; index < 4; index++) {
  values.push({ value: cursor, side: "upper" });
  cursor = nextUp(cursor);
}
cursor = nextDown(one);
for (let index = 0; index < 6; index++) {
  values.push({ value: cursor, side: "lower" });
  cursor = nextDown(cursor);
}
const coordinates = values.map(({ value, side }) => ({
  x: binaryCoordinate(decodeDouble(value), center, unit),
  side,
  selected: value === one,
}));

new NumberLineView(document.querySelector("#binade-canvas")).setScene({
  domain: [-2.7, 3.35],
  background: "#192632",
  bands: [
    { from: -2.7, to: 0, top: .12, bottom: .86, color: "rgba(142,179,255,.08)", label: "PRECEDING BINADE · TWICE THE POINT DENSITY", textColor: "#8eb3ff" },
    { from: 0, to: 3.35, top: .12, bottom: .86, color: "rgba(223,255,82,.07)", label: "BINADE [1, 2)", textColor: "#dfff52" },
  ],
  lanes: [{ y: .57, color: "#8eb3ff", label: "BINARY64 VALUES AROUND 1", ticks: coordinates.map((point) => ({
    x: point.x,
    color: point.selected ? "#dfff52" : "#8eb3ff",
    width: point.selected ? 3 : 1,
    height: point.selected ? 58 : 27,
    dot: point.selected ? 5 : undefined,
    topLabel: point.selected ? "1 · exponent changes" : undefined,
  })) }],
  brackets: [
    { from: -.5, to: 0, y: .77, color: "#ff9b8e", label: "2^−53" },
    { from: 0, to: 1, y: .77, color: "#ff9b8e", label: "2^−52" },
  ],
  footer: "THE TICKS BELOW 1 ARE HALF AS FAR APART",
});

new NumberLineView(document.querySelector("#subnormal-canvas")).setScene({
  domain: [-.45, 6.45],
  background: "#192632",
  lanes: [{ y: .55, color: "#8eb3ff", label: "THE BEGINNING OF THE POSITIVE BINARY64 GRID", ticks: Array.from({ length: 7 }, (_, index) => ({
    x: index,
    color: index === 0 ? "#dfff52" : "#8eb3ff",
    width: index === 0 ? 3 : 1,
    height: index === 0 ? 48 : 25,
    dot: index === 0 ? 4 : undefined,
    topLabel: index === 0 ? "+0" : index === 1 ? "smallest subnormal" : `${index} × 2^−1074`,
  })) }],
  brackets: [{ from: 1, to: 2, y: .76, color: "#ff9b8e", label: "constant spacing = 2^−1074" }],
  footer: "THE SPACING REMAINS CONSTANT THROUGH THE SMALLEST NORMAL VALUE",
});
