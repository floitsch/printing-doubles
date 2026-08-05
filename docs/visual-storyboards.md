# Visual storyboards for the algorithm chapters

This document is an editorial design exercise. For each algorithm, it asks what
would remain if the explanatory prose disappeared. The resulting sequence is
not intended to replace the prose. It is a test of whether the chapter has found
the algorithm's essential object and operation, rather than merely divided the
source paper into smaller sections.

The current chapters do not yet pass that test. In particular, the shared trace
player has made several non-iterative algorithms look like variants of Dragon.
The redesign should retain shared data and exact implementations, but should not
retain a shared visual form.

## Editorial rules for the redesign

Each chapter should establish, in this order:

1. the difficulty that motivates the algorithm;
2. a visual object on which that difficulty can be seen;
3. the algorithm's characteristic operation on that object;
4. the condition that certifies the answer;
5. only then, the arithmetic used to implement the operation cheaply.

The first visual should be understandable before the chapter introduces its
notation. A formula may label a fact already visible in the figure, but it must
not be the sole source of the reader's intuition.

The visual design may reuse a small semantic vocabulary:

- blue marks denote binary floating-point values or exact binary-derived data;
- warm marks denote decimal candidates or decimal grids;
- green denotes a certified admissible or safe region;
- a translucent fringe denotes numerical uncertainty;
- open and closed boundary caps denote excluded and included endpoints;
- solid geometry is exact; hatched or blurred geometry is approximate.

This is a vocabulary, not a component requirement. A number line, a long-
division drum, a product window, and a routing diagram should not be forced into
one canvas merely because they use the same colors.

Animation is appropriate only when order is part of the idea. Dragon advances
one digit at a time, so `Next` is meaningful. Schubfach proves that a bounded set
of candidates suffices; playing five implementation steps does not illuminate
that theorem. Its central control should instead alter the interval and grid
spacing while the candidate set updates immediately.

## Concepts that require their own visual reminders

The papers assume several pieces of mathematical and machine-arithmetic
knowledge. They should be introduced once in short, reusable figures, then
linked from the chapters that need them.

### A decimal pair is a movable decimal point

Show `135 × 10^-5`, `1350 × 10^-6`, and `0.00135` aligned in columns. Sliding
the point does not change the value; removing or adding a trailing zero changes
the pair but not the represented real number. This figure precedes discussions
of decimal exponents, significands, and trailing-zero removal.

### Division is quotient plus remainder

Start with a row of, for example, 137 objects divided into ten boxes. Thirteen
complete groups and seven remaining objects become `137 = 13 × 10 + 7`. A
second frame moves the remainder's decimal point by multiplying it by ten. This
is the visual prerequisite for Dragon's digit generation and Dragonbox's
remainder reuse.

### A grid becomes coarser by grouping ten cells

Draw unit ticks, then braces collecting every ten adjacent intervals into one
larger interval. Repeating the grouping removes one decimal digit of resolution.
No floating-point notation is needed. This is the prerequisite for Ryū and the
two adjacent grids in Schubfach.

### Multiplication can replace division by a constant

Show an exact integer division and a fixed-point reciprocal as two routes to the
same quotient. The reciprocal route has a shaded uncertainty only at quotient
boundaries. Increasing the reciprocal's retained bits shrinks that uncertainty;
a final correction resolves the boundary case. This belongs in the primer, not
inside an algorithm whose paper happens to use the technique.

### A wide product can be viewed through a window

Arrange partial products in columns, as for multiplication on paper. A movable
window retains the high or middle columns needed by the algorithm. A small lamp
indicates whether any discarded column was nonzero. This gives concrete meaning
to “take the high half,” a sticky bit, cached-power multiplication, and round to
odd.

### Error is a region, not a warning label

Place a marker at an approximate result and draw the proved error bound as a
translucent interval around it. A comparison is certified when the entire band
lies on one side of a threshold. It is undecidable at this precision when the
band crosses the threshold. This is needed before Grisu, Errol, and bounded
cached-power arithmetic.

### Two floating-point words can form one more precise number

Use a coarse ruler for the high word. Beneath it, a magnified local ruler shows
the low word as an offset smaller than one high-word tick. Moving the high word
translates the local ruler; moving the low word adjusts position within one
coarse tick. This is the visual prerequisite for Errol's double-double values.

### Candidate membership and candidate choice are separate questions

First color all decimal marks inside the parsing interval. Only after that,
measure the distance from the binary value to the surviving marks. A mark may
be close and still inadmissible. This distinction should precede Schubfach and
Dragonbox and should be reiterated wherever ties are considered.

## 1. The exact expansion and the independent oracle

### What must be visible without prose

The exact value of a double can have a long decimal expansion, while a much
shorter decimal inside its parsing interval recovers the same double.

### Silent storyboard

1. A 64-bit record opens into an integer significand and a binary exponent.
2. The exponent moves factors of two between numerator and denominator.
3. Factors of five enter until the denominator is a power of ten.
4. A long exact digit tape unrolls across the screen.
5. The view pulls back to the parsing interval around the original double.
6. Decimal grids enter from coarse to fine; the first grid with an admissible
   mark stops the search.
7. That short mark remains while the long exact tape fades into the background.

### Appropriate instrument

A linked bit-field, factorization strip, digit tape, and number line. The user
may select a value and scrub the decimal-grid precision. This is a reference
instrument, not a timed animation.

### Prose that the visual motivates

The chapter can now distinguish exactness of the represented real number from
information preservation. The independent oracle is simply the deliberately
slow procedure shown in frames 5–7. Later chapters can compare themselves with
this oracle without presenting it as a competitive algorithm.

## 2. Coonen's requested-digit conversion

Algorithms B, L, S, P, and Q should not be presented as five equally important
recipes. Algorithm B supplies the main conversion; the others make its scale
selection and recovery implementable and reliable.

### What must be visible without prose

Coonen is given a requested number of significant digits. It moves a binary
value into a decimal-sized window, carries a bounded scaling error, rounds once,
and restores the decimal point. It is not searching for the shortest decimal.

### Silent storyboard for Algorithm B

1. Four empty digit cells establish the request: exactly four significant
   digits are wanted.
2. A decimal window labelled only by its end ticks slides along the real line.
   A small value such as `0.00135` lies far to its left.
3. The window moves six decimal places. The value appears as `1350` inside the
   four-digit integer range.
4. The same transformation is shown for a value that initially lies to the
   right of the range, so the window moves in the opposite direction.
5. The exact decimal motion is replaced by a binary scaling mechanism. The
   scaled marker acquires a narrow translucent error band.
6. A rounding gate maps the entire band to the requested integer. If the band
   straddles a gate boundary, more information is required.
7. The saved scale returns the decimal point to its output position.

### Appropriate instrument

An `N digits` selector and a draggable input marker. The principal view is the
moving decimal window, not a five-step code trace. A secondary toggle reveals
the binary implementation and decomposes the error band into cached-power error
and multiplication-rounding error.

### Where L, S, P, and Q belong

- Algorithm L belongs beside the control that initially positions the decimal
  window. A deliberately off-by-one estimate visibly lands in an adjacent
  window and is corrected.
- Algorithm S belongs in the product-window reminder. Discarded nonzero bits
  illuminate the sticky lamp rather than vanishing.
- Algorithms P and Q belong in a cache cabinet: one view stores every useful
  scale, while another reconstructs scales from fewer entries and extra
  multiplications. This is where the memory/arithmetic tradeoff is visible.

### Prose that the visual motivates

Only after the window is understood should the chapter derive the scale. The
reader first learns why scaling is trivial in decimal and then why an efficient
binary implementation needs an approximation to a decimal power and an error
bound. The formulas explain the mechanism behind frame 5; they do not introduce
the goal.

## 3. Dragon

### What must be visible without prose

Dragon performs long division on the value and its two remaining margins at the
same time. Each multiplication by ten exposes one decimal digit and also tells
the algorithm whether the unfinished tail can still cross either parsing
boundary.

### Silent storyboard

1. A real-line interval contains the selected binary value and has explicit
   open or closed ends.
2. The interval is transformed, without changing its shape, into an integer
   numerator over a common denominator. Distances to the two ends become two
   margin bars.
3. The view splits into a quotient drum and a local number line for the
   remainder.
4. Division by the denominator drops the first digit into a persistent digit
   tape. The remainder stays on the local line.
5. Multiplying the remainder and both margins by ten magnifies that local line.
   Earlier digits remain fixed above it.
6. Frames 4–5 repeat. The lower stop indicator and upper stop indicator remain
   separate.
7. When one indicator lights, only one last digit is admissible. When both
   light, the center and tie rule choose between the two last digits.
8. A carry propagates through a visible run of nines when the upper last digit
   is selected.

### Appropriate instrument

Dragon is the chapter where a `Next digit` control is natural. It should retain
all emitted digits and animate the remainder line expanding under them. A scrub
control may jump between digit positions, but autoplay adds little.

The current trace should be rebuilt around the three linked objects—real
interval, `R/S` remainder, and digit tape. The pseudocode highlight is
secondary and collapsible.

### Prose that the visual motivates

Introduce ordinary long division before naming `R`, `S`, `M-`, or `M+`. Then
name the objects already visible. Explain scaling to integers only after the
reader has watched the real interval advance. Structural IEEE cases belong in
the common foundations chapter unless they cause a distinct Dragon operation.

## 4. Gay's dtoa and Burger–Dybvig

These works preserve Dragon's fundamental geometry. A second number-line
explanation would wrongly suggest a different selection principle.

### What must be visible without prose

The same answer and proof can be reached while avoiding large amounts of
arbitrary-precision setup and arithmetic.

### Silent storyboard

1. A complete Dragon pipeline is drawn as blocks: decode, estimate scale, build
   large integers, scale, generate digits, test margins, format.
2. A small exact integer input enters and bypasses most blocks.
3. For a general input, a scale estimator replaces a long ladder of repeated
   scaling operations. Its estimate lands either in the correct slot or one
   adjacent slot; one test repairs the latter.
4. Common factors are cancelled before the large integers grow.
5. The optimized path and baseline path finish with identical interval and
   digit-tape states.
6. Several output modes branch only after the shared arithmetic facts have been
   established.

### Appropriate instrument

A side-by-side execution x-ray. Blocks fade when avoided; BigInt word counts
grow and shrink visibly. An input selector should include a small integer, a
typical fraction, and a difficult magnitude. The purpose is comparative, so a
single-algorithm step player is the wrong instrument.

### Prose that the visual motivates

The text should identify each optimization by the work it removes and then show
why it preserves Dragon's invariant. Historical implementation modes can be
described after the common path. Gay's `dtoa` and Burger–Dybvig may warrant
separate subchapters, but their shared visual premise remains “same geometry,
less work.”

## 5. The Grisu family

### What must be visible without prose

Grisu maps the exact interval into fast fixed-width coordinates. Because that
mapping is approximate, a candidate is usable only when its entire uncertainty
fits safely inside the true interval. Grisu3 rejects the cases for which it
cannot make that proof.

### Silent storyboard

1. Dragon's exact interval is shown as a solid bar.
2. A cached decimal scale carries the interval into a fixed-width workspace.
   The mapped endpoints acquire narrow uncertainty bands.
3. The inward edges of those bands form a green safe interval. Their outward
   edges form the largest interval that might still be valid.
4. Digit generation places a decimal candidate with its own possible motion.
5. In an ordinary case, the candidate and any final rounding motion fit wholly
   inside the green interval; a seal appears.
6. In a difficult case, the candidate touches the uncertain fringe. Nothing is
   colored red or called wrong; the seal simply cannot be applied.
7. Grisu3 sends that input along a clearly drawn fallback path to an exact
   algorithm.
8. A comparison frame changes only the acceptance rule to distinguish Grisu,
   Grisu2, and Grisu3.

### Appropriate instrument

A nested-interval laboratory. The user chooses or types an input and may
temporarily exaggerate the proved error bound to see its structure. A switch
selects Grisu, Grisu2, or Grisu3 and changes the promised contract. A paired
ordinary/hard-case view is more informative than two nearly identical traces.

### Prose that the visual motivates

First ask: “Can we keep Dragon's interval but stop carrying arbitrarily large
integers?” Then introduce `DiyFp` as the coordinate system that makes frame 2
cheap. Cached powers, normalization, and `RoundWeed` are explanations of how
the transformation and seal are implemented. The fallback is not an error path;
it is how Grisu3 preserves its contract.

## 6. Errol

### What must be visible without prose

Errol spends more precision than Grisu by representing a value as a double plus
a small correction. That precision makes nearly all candidate decisions clear;
the remaining finite exceptional set is handled explicitly.

### Silent storyboard

1. A candidate threshold lies between two possible decisions. An ordinary
   double's uncertainty overlaps it.
2. A two-level ruler appears: the high word selects a coarse tick and the low
   word places a marker on a magnified ruler below that tick.
3. The combined uncertainty shrinks enough to lie on one side of the threshold.
4. Both parsing endpoints are carried through a decimal scale using these
   paired values.
5. Shared leading digits peel away from the two endpoint tapes; the first
   differing digit exposes the short decimal choice.
6. A map of the input space appears almost empty. A few isolated marked cells
   route to a correction table.
7. Selecting one such cell shows the ordinary path's ambiguous result beside
   the table's certified result.

### Appropriate instrument

A precision lens, not a conventional trace. The user can toggle ordinary
double, `DiyFp`, and double-double precision over the same threshold. A second
view shows ordinary and exceptional inputs. Individual arithmetic operations
can be expanded into a trace only after the high-plus-low representation is
understood.

### Prose that the visual motivates

Begin with the information lost by one rounded floating-point operation. Then
show how the low component recovers it. Only after that should `TwoSum`,
`FastTwoSum`, or paired multiplication appear. The exceptional table must be
presented as part of the proved algorithm/artifact, not as evidence inferred
from random testing.

## 7. Ryū

### What must be visible without prose

Ryū projects the complete parsing interval onto a sufficiently fine integer
lattice using bounded fixed-width products. It then repeatedly groups ten
lattice cells. A digit may be removed exactly while at least one admissible
integer cell survives the grouping.

### Silent storyboard

1. The binary parsing interval is shown with guarded integer endpoints, all on
   one binary-derived scale.
2. A cached power and shift project the three important positions onto a dense
   integer lattice. The wide product window shows that only bounded integer
   words are needed.
3. Integer marks inside the projected interval illuminate.
4. Every ten adjacent lattice cells are enclosed by one larger brace. The
   illuminated set is mapped into these coarser cells.
5. Grouping repeats; one decimal digit falls from the right side of the
   significand on each repetition.
6. The next grouping would make the endpoint information insufficient or leave
   no admissible choice. It is shown as a ghost transformation and then
   rejected.
7. The last removed digit and the knowledge of whether earlier removals were
   all zero determine which surviving integer to select.

### Appropriate instrument

A decimal-resolution scrubber. Moving it left or right groups or ungroups cells
continuously and updates the surviving integer range. The user should be able to
stop at each resolution, but `Play algorithm` is not the primary interaction.
A small side panel shows the digits being removed and the trailing-zero fact.

### Prose that the visual motivates

The need for guard bits should be introduced by trying to put midpoint
boundaries on an integer lattice and discovering half cells. Powers of five and
split multiplication explain how frame 2 is implemented. The paper's loop then
has an intuitive reading: it changes decimal resolution, rather than merely
executing repeated integer divisions.

## 8. Schubfach

### What must be visible without prose

Choose a decimal grid whose spacing is no larger than the parsing interval. It
cannot miss the interval. The grid ten times coarser cannot place two marks
inside it. Therefore the shortest answer is among the immediate neighbors on
only these two grids.

### Silent storyboard

1. An admissible interval appears as a horizontal slot.
2. A decimal comb with teeth farther apart than the slot slides across it. At
   most one tooth can occupy the slot.
3. A second comb with teeth ten times closer replaces it. Whatever its phase,
   at least one tooth occupies the slot.
4. Both combs are shown together. All teeth except the two bracketing the value
   on each comb fade away.
5. Coarse teeth inside the slot are tested first and glow green. If one exists,
   the fine comb becomes irrelevant because the coarse decimal is shorter.
6. If the coarse slot is empty, the admissible fine neighbors remain.
7. Only now does a distance line from the binary value choose between two
   admissible neighbors; a symmetric tie marker invokes decimal parity.

### Appropriate instrument

A pigeonhole cabinet without a literal pigeon. The parsing interval is one
drawer and decimal marks are pegs that may enter it. The user drags the interval
or changes its width; the two linked combs slide and the four local candidates
update immediately. Presets should include a coarse hit, a coarse miss, an
included endpoint, an excluded endpoint, and an asymmetric binary interval.

There is no `Next` button in the main instrument. The theorem is understood by
manipulating spacing and phase. A later, collapsible arithmetic view may show
how fixed-width products reproduce the four geometric tests.

### Prose that the visual motivates

Begin with the two comb experiments before defining `k`. The inequalities
between grid spacing and interval width then name what the reader has already
seen. Candidate membership precedes distance. `rop`, round to odd, logarithm
approximations, and cached powers belong under a later heading: “How to answer
the four geometric questions with machine integers.”

## 9. Dragonbox

### What must be visible without prose

Dragonbox inherits Schubfach's candidate theorem. Its novelty is how the needed
facts are scheduled: one product window feeds a coarse-divisor attempt; if that
fails, the same remainder feeds a fine-divisor path. Separate policies decide
what information is returned and how caches are supplied.

### Silent storyboard

1. The four-candidate Schubfach cabinet appears briefly and collapses into two
   labelled destinations: coarse candidate and fine candidate.
2. A single cached-power product enters a retained product window. The window
   emits an endpoint integer, a scaled width, an exactness light, and a parity
   light.
3. These facts enter a large sieve marked by groups of 1000. A remainder bead
   lands relative to a width bar.
4. In the common path the coarse gate opens and the result exits immediately.
5. In the alternate path the gate remains shut, but the remainder bead is not
   discarded. The apparatus narrows from groups of 1000 to groups of 100.
6. One additional digit is recovered from the reused remainder; a parity check
   appears only at the exact halfway position.
7. A zero-fraction-field input is routed through a visibly asymmetric shorter-
   interval lane.
8. At the exit, policy switches independently add a sign, remove/report
   trailing zeros, or exchange full and compact cache drawers. The selected
   real number does not move.

### Appropriate instrument

A routing laboratory with live tokens, not three step players. Selecting
`0.3`, `nextUp(1)`, or `2` should illuminate the large-divisor, small-divisor,
or shorter-interval lane on the same diagram. A cache-policy toggle changes the
source of the multiplier and displays table/reconstruction work; it must not
pretend to change the candidate geometry.

### Prose that the visual motivates

The reader should first revisit the Schubfach result in one paragraph: only a
coarse candidate or a fine neighbor can win. Then ask how to learn which one
with one cached product and minimal division. Quotient/remainder and the wide-
product reminder precede the `1000` and `100` details. Templates and policies
belong after the arithmetic route is clear.

## 10. Żmij

Żmij is presently an implementation frontier rather than a separately
published candidate theorem. Its visual should therefore compare execution
shape and digit production, not invent a new geometry.

### What must be visible without prose

Several operations that are separate in a conventional Schubfach-family
formatter are fused, and the final integer-to-character conversion is treated
as part of the performance problem.

### Silent storyboard

1. A conventional Schubfach-family pipeline has three cached-power product
   tokens and a separate decimal-pair-to-digits stage.
2. The three product tokens merge into one product window. Derived endpoint and
   width facts fan out from its retained bits.
3. A scale marked one decimal place farther exposes the final digit without a
   new critical-path division.
4. Branch diamonds flatten into arithmetic lanes where the implementation does
   so.
5. The chosen decimal integer enters a digit-emission array. Two-digit or
   multi-digit groups become character pairs in parallel.
6. Scalar and SIMD exits are shown as alternative hardware realizations of the
   same bytes.

### Appropriate instrument

A comparative pipeline x-ray against the Schubfach or Dragonbox baseline. The
user may toggle the platform lane, but benchmark numbers do not belong in the
explanatory animation. Operation counts must come from an instrumented pinned
implementation, not hand-authored decorative tokens.

### Prose that the visual motivates

State explicitly which selection theorem is inherited. Then explain each fused
or rescheduled operation by its dependency edge. Character generation deserves
its own visual introduction because, at this point in the history, candidate
selection is no longer the whole cost of formatting.

## 11. Tejú Jaguá

The current public work describes a generated, format-parametric conversion
kernel and labels itself partial and work in progress. Until its promised proof
is available, the exposition must separate confirmed implementation structure
from inferred mathematical lineage.

### What must be visible without prose

One algorithm schema is specialized from a description of the floating-point
format and the target integer operations. The generated runtime kernel receives
a positive finite binary pair and returns a decimal pair; decoding and character
assembly remain outside it.

### Silent storyboard

1. Several format cards—binary16, binary32, binary64, and a wider format—show
   different exponent and significand widths.
2. A target card selects available word sizes and whether a native wide integer
   exists.
3. Both cards enter a generator. Constants, types, and small helper choices are
   stamped into a format-specific C kernel.
4. At runtime only the generated kernel remains; the generator and
   multiprecision tools fade away.
5. A full formatting pipeline brackets the kernel: decode on the left, decimal
   pair in the center, sign/notation/characters on the right. The latter stages
   are visibly outside the current kernel.
6. Choosing another format regenerates the center without changing its stated
   input/output role.

### Appropriate instrument

A format configurator and generated-artifact map, not an unverified candidate
animation. It may expose how table size and helper width change with the format.
The mathematical selection view should be added only after the implementation
has been traced against its source and its invariant stated with sufficient
confidence.

### Prose that the visual motivates

Introduce the distinction between an algorithm, a format specialization, and a
complete formatter. Explain which work is done offline. Evidence labels must be
part of this chapter: differential agreement is valuable, but it is not a
substitute for the forthcoming proof.

## 12. xjb

### What must be visible without prose

Scaling one extra decimal place exposes all but the last digit as an integer;
the remaining fractional position determines the last digit and also presents
the two possible shortenings locally.

### Silent storyboard

1. A Schubfach parsing interval and its two useful decimal resolutions are
   shown.
2. The complete local picture is shifted one extra decimal place to the left.
3. A vertical cut separates an integer prefix from one final fractional digit.
4. The fractional marker is magnified onto a ten-cell strip. Its nearest cell
   supplies the last digit.
5. Interval-width bars reach toward the neighboring `0` and `10` exits. If one
   is admissible, carrying or dropping that last digit yields a shorter neighbor.
6. Ordinary symmetric spacing uses one centered width bar; an exact power-of-
   two case replaces it with unequal left and right bars.
7. A wide digit integer flows into the BCD/character-emission stage.

### Appropriate instrument

A prefix-and-last-digit microscope. The user drags the fractional marker within
the ten-cell strip and sees the rounded last digit, lower shortening, and upper
shortening respond. This should be checked against the current implementation,
because the repository warns that published pseudocode contains an error.

### Prose that the visual motivates

Start with the extra decimal shift as a way to make the final decision local.
Only then introduce the particular exponent choice and fixed-width products.
Keep the source correction prominent: the maintained implementation, not the
known-bad pseudocode, is the object being explained.

## 13. Fast unrounded scaling

### What must be visible without prose

Many conversion decisions need the retained high bits of a scaled product and
only one fact about everything below them: whether the discarded part is
exactly zero. Computing and rounding the entire product is unnecessary.

### Silent storyboard

1. A 64-bit value and a 128-bit cached scale form a paper-style partial-product
   array.
2. A result window selects the high retained columns. All lower columns darken.
3. The dark columns feed one sticky lamp: off means every discarded bit was
   zero; on means at least one was nonzero.
4. The lowest full product word disappears entirely. Two partial products still
   determine the retained window and sticky lamp.
5. A threshold comparison receives the retained bits plus the lamp and reaches
   the same decision as the complete exact product.
6. The same scaling box is plugged into three sockets labelled only by icons:
   shortest printing, fixed printing, and parsing.
7. For shortest printing, center and interval information pass through the box,
   then a zero-trimming strip removes decimal places while the sticky state
   preserves exactness.

### Appropriate instrument

An interactive product window. Users may turn discarded low bits on and off and
observe when the sticky lamp is sufficient. A proof-mode overlay identifies the
dangerous carry pattern and shows which table facts exclude it. This is a bit-
level instrument, not a number-line trace.

### Prose that the visual motivates

Introduce sticky information using ordinary integer bits before discussing
floating-point pipelines. Then explain why an upward-rounded cached scale cannot
silently carry into the retained window. The Ivy checks belong next to the
specific dangerous pattern they discharge.

## 14. The continued-fraction experiment (Toothless)

This chapter audits unfinished research. Its visual must not imply a theorem
that the paper has not established.

### What must be visible without prose

Continued fractions produce increasingly accurate rational approximations under
a bounded numerator/denominator budget, but closeness alone does not prove that
the approximation preserves every decimal-candidate and endpoint decision.

### Silent storyboard

1. A real scale ratio is approached by a sequence of rational rungs. Each rung
   has a visibly larger numerator or denominator and a smaller error bar.
2. A machine-word ceiling stops the ladder; the best admissible rung is chosen.
3. The chosen approximation scales a parsing interval and candidate grid.
4. Most candidate marks remain on the same side of their thresholds.
5. One deliberately magnified threshold shows a tiny ratio error moving a mark
   across an open or closed endpoint.
6. A proof bridge is drawn between the ratio error bound and all decision
   thresholds, but one span is missing.
7. Known paper defects attach to the corresponding spans rather than appearing
   as a disconnected list of editorial corrections.

### Appropriate instrument

A rational-approximation ladder linked to a decision-threshold microscope. It
may demonstrate successful test cases, but must label them as tests. The missing
proof obligation remains visibly open. No “algorithm completed” animation and
no benchmark chart should appear.

### Prose that the visual motivates

Separate three claims: the approximation is close, the implementation
round-trips tested values, and the candidate choice is shortest and correct for
all values. The audit's task is to construct the missing implication or provide
a counterexample. The current prose should retain the research without
promoting it into the main historical line.

## Instrument matrix

| Chapter | Mathematical object carried | Characteristic motion | Main instrument | Generic trace disposition |
| --- | --- | --- | --- | --- |
| Exact/oracle | exact rational and parsing interval | decimal grid refinement | linked tape and grid scrubber | secondary diagnostic only |
| Coonen | requested-digit scaled value plus error | move value into an `N`-digit window | scaling-window laboratory | replace |
| Dragon | remainder, denominator, two margins | multiply all by ten; emit one digit | persistent digit drum and expanding remainder line | retain step control, redesign canvas |
| Gay/Burger–Dybvig | Dragon state plus avoided work | bypass, cancel, estimate | side-by-side execution x-ray | replace |
| Grisu | approximate interval plus proved uncertainty | transform; accept or reject | nested-interval laboratory | replace paired traces |
| Errol | high word plus low correction | shrink decision uncertainty | precision lens and exception map | replace |
| Ryū | projected integer interval | group lattice cells by ten | decimal-resolution scrubber | replace |
| Schubfach | interval and two adjacent decimal grids | change spacing and phase | pigeonhole cabinet | remove from main explanation |
| Dragonbox | endpoint window, width, remainder, policies | route through coarse/fine lanes | routing laboratory | replace three traces |
| Żmij | fused selection/output pipeline | merge dependencies; emit digit groups | comparative pipeline x-ray | do not add generic trace |
| Tejú Jaguá | format description and generated kernel | specialize offline | format configurator | do not add until invariant is pinned |
| xjb | integer prefix plus final fractional digit | inspect one extra decimal place | last-digit microscope | do not add generic trace |
| Unrounded scaling | retained product window plus sticky bit | discard full words without losing decisions | partial-product window | do not add generic trace |
| Toothless | bounded rational approximation and proof gap | refine approximation under word ceiling | convergent ladder and threshold lens | tests only, not algorithm playback |

## Rewrite order

The order should be determined by conceptual damage, not chronology.

1. **Schubfach.** Its current trace most strongly contradicts the algorithm's
   non-iterative idea. Build the two-comb/pigeonhole instrument first.
2. **Ryū.** Replace procedural digit-removal slides with the lattice-resolution
   scrubber. This also creates the reusable grid-coarsening reminder.
3. **Dragonbox.** Reuse Schubfach's candidate data but present Dragonbox as one
   product and a coarse/fine routing decision.
4. **Grisu.** Build the exact/safe/uncertain interval laboratory and show
   success and fallback in one instrument.
5. **Errol.** Add the high-plus-low ruler before showing any double-double
   formulas.
6. **Coonen.** Replace the number-line trace with the requested-digit scaling
   window and explicit error bands.
7. **Dragon.** Keep digit stepping, but make persistent digits, expanding
   remainder, and independent stopping tests the primary visual.
8. **Gay/Burger–Dybvig.** Add the comparative avoided-work view after Dragon's
   new instrument exists.
9. **Frontier algorithms.** Build image essays from pinned implementations.
   They should not receive executable-looking candidate animations before their
   exact invariants and evidence levels are established.
10. **Toothless.** Retain it as an audit with a visible proof gap.

## Implementation boundary

The exact JavaScript implementations remain useful. They should emit semantic
state, not prescribe a screen:

- Dragon emits `digit`, `remainder`, `lower-margin`, `upper-margin`, and
  `stop-test` events.
- Ryū emits the projected integer interval at every decimal resolution.
- Schubfach emits the two grid spacings and at most four local candidates in one
  state object.
- Dragonbox emits product-window facts and a selected route.
- Grisu emits true, safe, and possible intervals plus the candidate's movement
  range.
- Errol emits high/low components and the resulting error region.

A testing trace may still serialize every internal step. The visible chapter
instrument consumes only the states that express the mathematical idea. This
keeps the implementation honest without making the debugger UI the exposition.

## Acceptance test for each rewritten chapter

Before a chapter is considered complete, test it with the prose and formulas
temporarily hidden. A developer familiar with ordinary floating-point use
should be able to identify:

1. what object the algorithm starts with;
2. what operation it repeats or what bounded choice it makes;
3. what fact allows it to stop or select a candidate;
4. what distinguishes it from the preceding algorithm.

Then restore the prose and verify the converse: every visual transition must be
explained precisely, including the arithmetic approximation and its error bound.
The goal is neither a wordless infographic nor a simplified paper. It is an
exposition in which the picture creates the question and the text supplies the
complete answer.
