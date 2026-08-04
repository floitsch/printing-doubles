import { decodeDouble, formatDecimal } from "./float.js";
import { intervalOf } from "./oracle.js";
import {
  compareRational,
  decimalRational,
  distanceRational,
  floorDiv,
  floorLog10Rational,
  isInsideInterval,
  normalizeDecimal,
  scaleByInversePower10,
  subtractRational,
} from "./interval-core.js";

function floorScaled(rational, exponent) {
  const scaled = scaleByInversePower10(rational, exponent);
  return floorDiv(scaled.numerator, scaled.denominator);
}

function candidate(interval, coefficient, exponent) {
  const rational = decimalRational(coefficient, exponent);
  return {
    coefficient,
    exponent,
    rational,
    text: formatDecimal(coefficient, exponent),
    inside: isInsideInterval(interval, rational),
    distance: distanceRational(rational, interval.center),
  };
}

function chooseClosest(left, right) {
  if (left.inside && !right.inside) return left;
  if (!left.inside && right.inside) return right;
  if (!left.inside && !right.inside) throw new Error("Schubfach's fine candidate pair missed the interval");
  const order = compareRational(left.distance, right.distance);
  if (order < 0) return left;
  if (order > 0) return right;
  return (left.coefficient & 1n) === 0n ? left : right;
}

export function schubfachExact(value) {
  if (!Number.isFinite(value)) return { special: true, text: String(value) };
  if (value === 0) return { special: true, text: Object.is(value, -0) ? "−0" : "0" };
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const decoded = decodeDouble(magnitude);
  const interval = intervalOf(magnitude);
  const width = subtractRational(interval.upper, interval.lower);
  const k = floorLog10Rational(width);
  const s = floorScaled(interval.center, k);
  const fine = [candidate(interval, s, k), candidate(interval, s + 1n, k)];

  let coarse = null;
  let selected;
  let path;
  if (s >= 10n) {
    const coarseExponent = k + 1;
    const coarseLower = floorScaled(interval.center, coarseExponent);
    coarse = [candidate(interval, coarseLower, coarseExponent), candidate(interval, coarseLower + 1n, coarseExponent)];
    const admissible = coarse.filter((item) => item.inside);
    if (admissible.length > 1) throw new Error("Schubfach's coarse grid contains more than one candidate");
    if (admissible.length === 1) {
      selected = admissible[0];
      path = "coarse";
    }
  }
  if (!selected) {
    selected = chooseClosest(fine[0], fine[1]);
    path = "fine";
  }

  const normalized = normalizeDecimal(selected.coefficient, selected.exponent);
  const coefficient = negative ? -normalized.coefficient : normalized.coefficient;
  return {
    coefficient,
    exponent: normalized.exponent,
    text: formatDecimal(coefficient, normalized.exponent),
    decoded,
    interval,
    width,
    k,
    s,
    fine,
    coarse,
    selected,
    path,
  };
}

function compact(value) {
  const text = value.toString();
  return text.length <= 19 ? text : `${text.slice(0, 10)}…${text.slice(-6)}`;
}

function candidatesScene(items, selected, footer) {
  return {
    domain: [-.15, 1.15],
    background: "#192632",
    bands: [{ from: .12, to: .88, top: .16, bottom: .84, color: "rgba(223,255,82,.13)", border: "#dfff52", label: "PARSING INTERVAL" }],
    lanes: [{ y: .58, color: "#ff9b8e", label: `ONLY THE TWO DECIMALS BRACKETING THE VALUE`, ticks: items.map((item, index) => ({
      x: index === 0 ? .31 : .69,
      color: item === selected ? "#ef4b35" : item.inside ? "#dfff52" : "#ff9b8e",
      width: item === selected ? 3 : 1.5,
      height: item === selected ? 72 : 50,
      dot: item.inside ? 5 : 0,
      topLabel: compact(item.coefficient),
    })) }],
    footer,
  };
}

export function schubfachTrace(value) {
  const result = schubfachExact(value);
  const coarse = result.coarse;
  return [
    {
      line: 1,
      label: "Measure",
      title: "Use the interval width to choose one decimal scale",
      why: "Schubfach chooses k so that a step of 10^k is no wider than the parsing interval, while a step of 10^(k+1) is wider. The pigeonhole argument then constrains which grids can contain a shortest decimal.",
      registers: { binary_exponent: result.decoded.exponent, k: result.k, fine_step: `10^${result.k}`, coarse_step: `10^${result.k + 1}` },
      visual: { interval: [-.5, .5], binary: [-1, 0, 1], caption: "the interval width selects two adjacent decimal grids" },
    },
    {
      line: 2,
      label: "Bracket",
      title: "Compute the two fine-grid neighbors",
      why: "On the 10^k grid, the floor of the scaled value and its successor are the only candidates that can be closest. At least one lies inside the parsing interval.",
      registers: { s: result.s.toString(), lower_decimal: result.fine[0].text, lower_inside: result.fine[0].inside, upper_decimal: result.fine[1].text, upper_inside: result.fine[1].inside },
      visual: { scene: candidatesScene(result.fine, result.path === "fine" ? result.selected : null, "THE FINE GRID CANNOT MISS THE INTERVAL") },
    },
    ...(coarse ? [{
      line: 3,
      label: "Try shorter",
      title: coarse.some((item) => item.inside) ? "The coarser grid contains one admissible candidate" : "The coarser grid misses the interval",
      why: coarse.some((item) => item.inside)
        ? "Because the wider grid contains a point in the parsing interval, that point is shorter than either fine-grid neighbor and must be selected. The width theorem says there cannot be two such points."
        : "Neither decimal bracketing the value on the wider grid lies inside the parsing interval. No still wider grid can introduce a shorter candidate that was not already represented here, so selection returns to the fine pair.",
      registers: { lower_decimal: coarse[0].text, lower_inside: coarse[0].inside, upper_decimal: coarse[1].text, upper_inside: coarse[1].inside },
      visual: { scene: candidatesScene(coarse, result.path === "coarse" ? result.selected : null, result.path === "coarse" ? "ONE COARSE CANDIDATE SURVIVES" : "NO COARSE CANDIDATE SURVIVES") },
    }] : []),
    {
      line: 4,
      label: "Select",
      title: "Return the admissible candidate closest to the stored value",
      why: result.path === "coarse" ? "The unique coarse candidate is shorter, so distance comparisons on the fine grid are irrelevant." : "When both fine candidates are admissible, compare their exact distances to the center. An exact decimal tie is resolved toward the candidate with an even significand.",
      registers: { path: result.path, coefficient: result.coefficient.toString(), exponent: result.exponent, output: result.text },
      visual: { scene: candidatesScene(result.path === "coarse" ? coarse : result.fine, result.selected, "SELECTED SHORTEST, CLOSEST RECOVERING DECIMAL") },
    },
  ];
}
