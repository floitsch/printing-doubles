# A first reading built around a worked example

The first route through the site is now `site/chapters/one-number.html`.
The existing binary64 chapters remain the detailed derivations and reference
instruments. Six of them also begin with the corresponding small example.

The missing teaching step was a concrete decision the reader could reproduce.
An algorithm-specific widget and a spatial metaphor did not, by themselves,
explain why the algorithm's operation was useful. This route holds the example
fixed, shows the decision, and introduces implementation notation afterward.

## Example and scope

Use an eight-significant-bit binary format, locally spaced by 1/32. The input
201/32 is exactly 6.28125. Its parsing boundaries are 401/64 and 403/64,
excluded because 201 is odd. Tenths miss; hundredths 6.27, 6.28, and 6.29
fit; the closest is 6.28. The page explicitly distinguishes this answer from
binary64's shortest output for the same exact value.

This miniature is an exact worked illustration of the selection geometry,
not a trace of a native binary64 implementation. The new model uses exact small
integers for candidate membership and choice. Slider inputs stay within the
same local binade. The uncertainty and decimal compensation diagrams are
explicit analogies, not measurements of Grisu's or Errol's actual error.

## Visual decisions

- Dragon: a growing prefix branches into “stop” and “round up”; long division
  and the allowed margins explain why both initially fail.
- Ryū: an entire integer range loses decimal places. Highlight the multiples
  of ten that survive, and show the first empty range. Never imply arbitrary
  truncation of a single guessed string.
- Schubfach: move a fixed-width neighborhood across two combs. Let coarse
  membership change while fine existence remains visible.
- Dragonbox: show a backward walk from the right endpoint. Compare its length
  with the interval width; connect the walk to the division remainder.
- Grisu: enlarge explicit boundary uncertainty until membership becomes
  unresolved. Explain separately that full acceptance also needs shortestness
  and closest-choice certification.
- Errol: toggle a saved small correction. The decimal measurement analogy
  explains an unevaluated sum before introducing binary double-double.
- Coonen: choose the requested number of digit places, scale, round, restore.
  Distinguish ideal rounding from Algorithm B's additional-error contract.

The powers-of-five detail works through 201 × 1000 / 32 = 201 × 125 / 4,
including the two low product bits. It provides a bridge from choosing the
answer to computing the required facts in integer arithmetic.

## Keeping this route honest

- `one-number-model.js` supplies the exact miniature decisions; independent
  enumeration tests cover all slider values, endpoint parity, the decimal tie,
  both remainder paths, and Dragon's stopping arithmetic.
- `one-number.js` renders each operation with its own layout and controls.
  Shared helpers draw SVG primitives; they do not prescribe a shared trace.
- Static HTML retains the explanation without JavaScript. Native buttons,
  selects, sliders, and details provide keyboard operation; live text restates
  each visual decision. No animation is required.
- Worked sections are also present as static HTML in the six chapter openings.
  When editing one, keep its prose synchronized with the guide. Their lesson
  rendering and arithmetic already share one implementation.
- The frontier links explain which remaining problem to study next. Their
  detailed chapters and existing evidence qualifications have not been rewritten.

Validation for this change included the existing algorithm suites, the new
miniature arithmetic tests, local links, every new interaction branch, desktop
and 390-pixel layouts, no-JavaScript fallback, and screenshot inspection.

## Second editorial pass

Reader feedback confirmed that the common example explained the algorithms,
but asked for easier reading and removal of the delivery-service analogy.
An independent agent review also identified the abrupt introduction of scaled
integer units as a source of confusion.

The opening now defines rounding directly and uses “rounding interval”
consistently. Endpoint parity is optional detail. Dragon first reports actual
decimal errors, with its integer calculation expandable; Dragonbox keeps axis
positions and distances in the same decimal units. Its larger integer scale is
introduced only in the derivation. Ryū explicitly connects trailing zeros to
the decimal values that survive a change of precision.

The guide and six worked chapter openings use 18-pixel system-font body text,
1.75 line spacing, a 64-character prose measure, and smaller section headings.
Captions, controls, and result text are larger. Browser checks also cover a
320-pixel viewport with all details open and persistence of Dragon's expanded
calculation while advancing digits.
