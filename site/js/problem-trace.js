import { binaryCoordinate, decodeDouble, decimalCoordinate, midpointCoordinate, nextDown, nextUp, parseDecimal, unitExponent } from "./float.js";

export function problemTrace(value) {
  const center = decodeDouble(value);
  const previous = decodeDouble(nextDown(value));
  const following = decodeDouble(nextUp(value));
  const unit = unitExponent(value);
  const previousX = binaryCoordinate(previous, center, unit);
  const nextX = binaryCoordinate(following, center, unit);
  const lowerX = midpointCoordinate(previous, center, center, unit);
  const upperX = midpointCoordinate(center, following, center, unit);
  const domain = [previousX - .18, nextX + .18];
  const binaryTicks = [
    { x: previousX, color: "#8eb3ff", height: 30, topLabel: "previous double" },
    { x: 0, color: "#1565ff", width: 3, height: 52, dot: 4, topLabel: "selected double" },
    { x: nextX, color: "#8eb3ff", height: 30, topLabel: "next double" },
  ];
  const boundaries = [
    { x: lowerX, from: .13, to: .86, color: "#dfff52", dash: [3, 5], label: "lower midpoint", labelY: .94 },
    { x: upperX, from: .13, to: .86, color: "#dfff52", dash: [3, 5], label: "upper midpoint", labelY: .94 },
  ];
  const band = { from: lowerX, to: upperX, top: .13, bottom: .88, color: "rgba(223,255,82,.14)", label: "ROUND-TRIP INTERVAL" };
  const decimalTick = (text, label, active = false) => {
    const decimal = parseDecimal(text);
    return {
      x: decimalCoordinate(decimal.coefficient, decimal.exponent, center, unit),
      color: active ? "#ef4b35" : "#ff9b8e",
      width: active ? 3 : 1.5,
      height: active ? 50 : 30,
      dot: active ? 4 : 2,
      topLabel: label,
    };
  };
  const scene = (options = {}) => ({
    domain,
    background: "#192632",
    bands: options.interval ? [band] : [],
    markers: options.interval ? boundaries : [],
    lanes: [
      { y: .39, color: "#ff9b8e", label: options.decimalLabel || "DECIMAL VALUES", ticks: options.decimals || [] },
      { y: .69, color: "#8eb3ff", label: "ADJACENT BINARY64 VALUES", ticks: binaryTicks },
    ],
    footer: options.footer || "POSITIONS ARE COMPUTED FROM THE EXACT BINARY64 VALUE",
  });

  return [
    {
      label: "The binary neighborhood",
      title: "Begin with three adjacent doubles",
      why: "The selected bits have an immediate predecessor and successor. Their positions, including unequal spacing at a binade transition, are computed from the bit patterns.",
      registers: { previous: "nextDown(value)", selected: value.toString(), next: "nextUp(value)" },
      visual: { scene: scene() },
    },
    {
      label: "Parsing boundaries",
      title: "Insert the exact arithmetic midpoints",
      why: "Round-to-nearest parsing changes result at the midpoint to each neighbor. These computed boundaries—not a symmetric decorative box—define the selected value's preimage.",
      registers: { lower: "(previous + selected) / 2", upper: "(selected + next) / 2", tie_rule: "to even" },
      visual: { scene: scene({ interval: true }) },
    },
    {
      label: "An exact decimal",
      title: "Equality is sufficient, but unnecessarily strict",
      why: "The full decimal expansion denotes the selected double exactly and therefore lies at the selected point. Default output need only lie inside the interval.",
      registers: { digits: 55, status: "exact and round-tripping" },
      visual: { scene: scene({ interval: true, decimals: [decimalTick("0.299999999999999988897769753748434595763683319091796875", "exact stored value")] }) },
    },
    {
      label: "A coarser decimal grid",
      title: "The short decimal 0.3 also lies inside",
      why: "The decimal 0.3 is not equal to the stored rational, but parsing it returns the selected bits. The conversion problem permits this weaker and more useful relation.",
      registers: { candidate: "0.3", exact_equal: "no", parses_to_selected: "yes" },
      visual: { scene: scene({ interval: true, decimalLabel: "COARSER DECIMAL GRID", decimals: [decimalTick("0.2", "0.2"), decimalTick("0.3", "0.3", true), decimalTick("0.4", "0.4")] }) },
    },
    {
      label: "The output contract",
      title: "Select the first admissible decimal grid",
      why: "For shortest output, move from coarse decimal grids toward finer ones until a candidate enters the interval; then choose the nearest candidate on that first admissible grid.",
      registers: { output: "0.3", significant_digits: 1, proof: "no coarser admissible grid" },
      visual: { scene: scene({ interval: true, decimalLabel: "FIRST ADMISSIBLE DECIMAL GRID", decimals: [decimalTick("0.2", "0.2"), decimalTick("0.3", "selected: 0.3", true), decimalTick("0.4", "0.4")], footer: "ROUND TRIP · FEWEST DIGITS · NEAREST AMONG EQUALLY SHORT CANDIDATES" }) },
    },
  ];
}
