import { bitsOf, decodeDouble, formatDecimal } from "./float.js";
import { intervalOf } from "./oracle.js";
import { decimalDecade, normalizeDecimal, projectInterval } from "./interval-core.js";

function floorLog10Pow2(exponent) {
  return Math.floor(exponent * Math.LOG10E * Math.LN2);
}

function floorLog10Pow5(exponent) {
  return Math.floor(exponent * Math.LOG10E * Math.log(5));
}

export function ryuExact(value) {
  if (!Number.isFinite(value)) return { special: true, text: String(value), states: [] };
  if (value === 0) return { special: true, text: Object.is(value, -0) ? "−0" : "0", states: [] };

  const negative = value < 0;
  const magnitude = Math.abs(value);
  const decoded = decodeDouble(magnitude);
  const interval = intervalOf(magnitude);
  const m2 = decoded.significand;
  const e2 = decoded.exponent - 2;
  const mv = 4n * m2;
  const mp = mv + 2n;
  const mmShift = decoded.fraction !== 0n || decoded.exponentBits <= 1 ? 1n : 0n;
  const mm = mv - 1n - mmShift;
  const q = e2 >= 0
    ? floorLog10Pow2(e2) - (e2 > 3 ? 1 : 0)
    : floorLog10Pow5(-e2) - (-e2 > 1 ? 1 : 0);
  const initialExponent = e2 >= 0 ? q : q + e2;

  const states = [];
  let projection = projectInterval(interval, initialExponent);
  if (!projection.valid) {
    throw new Error(`Ryū's initial decimal projection is empty for 0x${bitsOf(magnitude).toString(16)}`);
  }
  states.push(projection);
  for (;;) {
    const next = projectInterval(interval, projection.exponent + 1);
    if (!next.valid) break;
    projection = next;
    states.push(projection);
  }

  const normalized = normalizeDecimal(projection.candidate, projection.exponent);
  const coefficient = negative ? -normalized.coefficient : normalized.coefficient;
  return {
    coefficient,
    exponent: normalized.exponent,
    text: formatDecimal(coefficient, normalized.exponent),
    decoded,
    interval,
    m2,
    e2,
    mv,
    mp,
    mm,
    mmShift,
    q,
    initialExponent,
    states,
    removed: states.length - 1,
    decade: decimalDecade(magnitude, interval.center),
  };
}

function compact(value) {
  const text = value.toString();
  return text.length <= 20 ? text : `${text.slice(0, 11)}…${text.slice(-6)}`;
}

function removalScene(state, active) {
  const width = state.last - state.first;
  const position = width === 0n ? .5 : Number((state.candidate - state.first) * 1000n / width) / 1000;
  return {
    domain: [-.12, 1.12],
    background: "#192632",
    bands: [{ from: .08, to: .92, top: .18, bottom: .82, color: "rgba(223,255,82,.13)", border: "#dfff52", label: "INTEGERS WHOSE DECIMALS RECOVER THE INPUT" }],
    lanes: [{ y: .58, color: "#ff9b8e", label: `DECIMAL GRID · STEP 10^${state.exponent}`, ticks: [
      { x: .08, color: "#dfff52", height: 45, topLabel: compact(state.first) },
      { x: .08 + .84 * position, color: active ? "#ef4b35" : "#ff9b8e", width: 3, height: 70, dot: 5, topLabel: compact(state.candidate) },
      { x: .92, color: "#dfff52", height: 45, topLabel: compact(state.last) },
    ] }],
    footer: active ? "THE NEXT COARSER GRID IS EMPTY · STOP" : "DIVIDE THE THREE PROJECTED INTEGERS BY TEN AND TRY AGAIN",
  };
}

export function ryuTrace(value) {
  const result = ryuExact(value);
  const first = result.states[0];
  const last = result.states.at(-1);
  const steps = [
    {
      line: 1,
      label: "Decode",
      title: "Give the interval two guard bits",
      why: "Ryū multiplies the binary significand by four and lowers the binary exponent by two. This does not change the value. It lets the center and both midpoint boundaries be written as nearby integers with one common power of two.",
      registers: { m2: result.m2.toString(), e2: result.e2, lower_integer: result.mm.toString(), center_integer: result.mv.toString(), upper_integer: result.mp.toString() },
      visual: { interval: [-.5, .5], binary: [-1, 0, 1], caption: "one exponent; three integer numerators" },
    },
    {
      line: 2,
      label: "Choose scale",
      title: "Select one decimal projection",
      why: "The binary exponent determines a power of ten that leaves roughly seventeen or eighteen integer digits. The optimized algorithm obtains this projection with a cached split power of five and one wide integer product.",
      registers: { q: result.q, decimal_step: `10^${result.initialExponent}`, first: compact(first.first), center: compact(first.candidate), last: compact(first.last) },
      visual: { scene: removalScene(first, result.states.length === 1) },
    },
  ];
  for (let index = 1; index < result.states.length; index++) {
    const state = result.states[index];
    steps.push({
      line: 3,
      label: `Remove digit ${index}`,
      title: "The interval still contains an integer after division by ten",
      why: "Moving to the next coarser decimal grid removes one trailing digit from all three projected quantities. It is safe only while the lower and upper projections still leave at least one admissible integer.",
      registers: { decimal_step: `10^${state.exponent}`, first: compact(state.first), nearest_center: compact(state.nearest), last: compact(state.last) },
      visual: { scene: removalScene(state, index === result.states.length - 1) },
    });
  }
  steps.push({
    line: 4,
    label: "Choose",
    title: "Round to the closest remaining integer",
    why: "At the last nonempty grid, Ryū chooses the integer nearest to the exact binary value, clamps it to the admissible interval when necessary, and resolves an exact halfway case toward an even integer.",
    registers: { coefficient: result.coefficient.toString(), exponent: result.exponent, output: result.text, digits_removed: result.removed },
    visual: { scene: removalScene(last, true) },
  });
  return steps;
}
