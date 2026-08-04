# Editorial and implementation blueprint

This project is an interactive technical book, backed by executable
implementations. The landing page is only the table of contents.

## Audience and promise

The primary reader is a working developer who understands integers and ordinary
floating-point use, but has not studied conversion algorithms. Each chapter must
let that reader answer four questions:

1. What output contract does this algorithm solve?
2. What mathematical object does it carry while it runs?
3. Why can it stop, and why is the result correct?
4. What does it cost in arithmetic, tables, and exceptional paths? Large,
   algorithmically important storage differences may be described qualitatively;
   device-specific size measurements are maintained as a separate study.

The text introduces notation only when a visual or execution immediately uses
it. Formal details remain available rather than being replaced by metaphors.

## Prose and notation

The chapters use the voice of an expository paper, not a sequence of blog-post
summaries. In particular:

- state the problem, assumptions, and output contract before presenting an
  implementation;
- define notation once and use it consistently across chapters;
- distinguish a theorem or proved bound from an empirical observation, an
  implementation claim, and an inference made by this project;
- give derivations and correctness arguments enough space to be followed;
- use complete transitions between the mathematical description, pseudocode,
  execution trace, and engineering consequences;
- keep historical claims tied to primary sources;
- avoid unexplained slogans such as “multiply and shift” when the choice of
  multiplier, shift, or rounding direction is the substance of the algorithm;
- let visuals restate an argument spatially, but never use a picture as the sole
  statement of a required invariant.

The intended tone is closer to a clear survey or textbook chapter than to a
paper abstract: less compressed than the original research, but no less exact.

## Shared narrative spine

1. **Two grids.** Binary64 and decimal numbers are discrete meshes on the same
   real line.
2. **The naive answer.** Decode `f × 2^e`, expand it exactly, and see why exact
   is usually the wrong presentation.
3. **Choose the contract.** Fixed digits, correctly rounded fixed format,
   recovery, shortest round trip, and closest-shortest are related but distinct.
4. **The rounding interval.** Replace a point with the interval of reals that a
   parser maps back to it. Explain asymmetric boundaries and ties-to-even.
5. **Baseline exact printer.** Build a simple BigInt interval printer. It is the
   test oracle and the conceptual bridge to Dragon.
6. **Algorithm chapters.** Follow the changing representation of that interval,
   rather than presenting a chronological list of slogans.
7. **The modern convergence.** Ryū, Schubfach, Dragonbox, Żmij, and unrounded
   scaling all make fixed-width integer scaling sufficient, but remove different
   work from the critical path.
8. **Choosing an implementation.** Correctness evidence, formatter contract,
   CPU, table policy, and license. The independent embedded-size study supplies
   code/flash/stack results after its toolchains and measurement method stabilize.

## Three implementation layers

Every algorithm has up to three implementations. They share test vectors but
serve different purposes.

### 1. Native/reference layer

- Use the original author's implementation when available, pinned to a commit.
- Wrap it behind one uniform result type: sign, decimal integer, decimal
  exponent, emitted text, status/fallback, and table-policy identifier.
- Preserve upstream license and attribution. Do not copy code whose license is
  unclear.
- Desktop wrappers belong to the correctness and trace work. Cross-compilation,
  object-size accounting, table-policy comparisons, stack measurements, and
  device timing belong to `research/size-and-esp32.md`, not to the page build.

### 2. Executable specification layer

- Small JavaScript modules favoring mathematical transparency over speed.
- BigInt is allowed to state exact invariants, even for algorithms whose native
  implementation avoids bignums.
- An algorithm-specific fixed-width module then replaces exact operations one by
  one. Differential tests must keep both implementations result-identical.
- This is the browser's trustworthy fallback and the easiest code for a reader
  to inspect.

### 3. Instrumented teaching layer

- Runs the same algorithm, not a hand-authored animation.
- Emits semantic events rather than pixels: `decode`, `make-boundaries`,
  `choose-decimal-exponent`, `load-cached-power`, `scale-interval`,
  `emit-digit`, `remove-digit`, `test-candidate`, `round`, `fallback`, and
  `format`.
- Each event includes exact before/after values, the pseudocode line, a short
  invariant, and visualization hints.
- The chapter renderer maps these events onto a number line, integer lattice,
  digit tape, cache view, or branch/candidate view as appropriate.

## Testing strategy

The test oracle is an independent exact rational implementation based on the
decoded binary64 value and exact midpoint boundaries. It must not share the
candidate-selection logic of the optimized implementations.

Test groups:

- published examples and every example used in prose;
- `+0`, `-0`, infinities, NaNs, smallest/largest subnormal and normal values;
- powers of two, powers of ten, and values adjacent to both;
- even/odd significands and both symmetric and asymmetric boundary cases;
- halfway decimal cases and carry chains (`9…9`);
- all binary32 values where practical;
- stratified and randomized binary64 bit patterns;
- upstream hard-case corpora and all algorithm-specific fallback or correction
  cases;
- an independent parse/format check for every advertised recovery contract;
- known hard-case corpora from upstream projects;
- cross-algorithm agreement on the selected contract;
- parse-back verification using more than one independent parser.

Native performance claims are never reused as correctness evidence. Draft
Toothless benchmark values are excluded entirely.

## Shared trace player

The execution microscope has five synchronized regions:

1. highlighted pseudocode;
2. explanation of *why* the step exists;
3. live values/registers, with exact and compact forms;
4. an algorithm-specific visual canvas;
5. previous/next/play/scrub controls and example selection.

Trace data is deterministic and serializable. A failing test can be exported as
the same trace the browser displays.

Interaction requirements and remaining work:

- retain named presets for an ordinary value, the smallest subnormal, and a
  binade transition such as `1`, where predecessor and successor spacing differ;
- stop the representable-value walk at zero: the smallest positive subnormal
  has the single predecessor `0`, never a continuation into negative values;
- make ticks and boundaries inspectable by keyboard focus and tap as well as
  hover; neighbor selection is implemented, but individual canvas targets still
  need a DOM-backed focus model;
- expose exact boundary values and whether ties-to-even includes each endpoint;
- test two-finger canvas zoom and the visible zoom buttons on actual mobile
  browsers, not only desktop touch emulation;
- allow algorithm figures to use lane-local domains for scaling transformations
  while preserving a shared domain for genuine overlays.

## Chapter-specific plans

### Foundations and the naive exact printer

**Question:** What are we actually asking a formatter to do?

**Implementation:** decode binary64 into `f × 2^e`; exact decimal expansion by
multiplying by powers of 5; independent shortest oracle by searching decimal
grids from coarse to fine.

**Visual:** the overlaid grids, then a zoom into one rounding interval. A digit
tape contrasts full expansion, 17-digit recovery output, and shortest output.

**Trace:** decoding bits → exact rational → neighboring doubles → midpoints →
first decimal grid with a valid point → closest candidate.

### Coonen (Algorithms B, L, S, P, Q)

**Contract:** requested significant digits with bounded extra error and recovery;
not shortest output.

**Implementation:** first reproduce Algorithm B using a controlled extended
format and exact simulation of rounding modes. Implement L's lower logarithm
estimate, S's sticky-bit scaling, and the single/double power-table strategies.
Cross-check every intermediate against an exact rational model.

**Visual:** a scale that slides the binary value until an `N`-digit integer lies
under it. A separate error-budget strip shows the cached-power error and final
rounding error. The trace must make the sticky bit visible.

**Trace:** decode → estimate `LOGX` → choose `SCALE` → construct cached power →
scale toward zero → fold inexact bits into sticky bit → round → repair rare
digit-count pathology → emit exponent.

### Dragon4

**Contract:** shortest, correctly rounded, round-tripping text; configurable
fixed formats in practical implementations.

**Implementation status:** the readable binary64/base-10 BigInt specialization
now uses the classic `R/S` remainder and `M−/M+` margins, with setup, scaling,
digit generation, and termination kept separate. It is compared with the
independent grid-search oracle on named difficult cases and deterministic bit
patterns. Remaining work includes exhaustive binary32, upstream hard cases, and
a pinned native Dragon4/dtoa wrapper.

**Visual:** three linked views: real interval, normalized fraction `R/S`, and a
decimal digit drum. Multiplication by ten zooms the interval and exposes one
digit at a time. The lower/upper stopping tests light independently.

**Trace:** establish margins → estimate decimal exponent → scale `R,S,M±` →
divide for a digit → test low/high → multiply remainder and margins by ten →
round final digit/carry.

### Gay dtoa and Burger–Dybvig

**Contract:** Dragon-quality output with practical fast paths and modes.

**Implementation:** do not pretend these are new interval geometries. Build the
Burger–Dybvig algorithm as a distinct executable spec and wrap Gay's reference
`dtoa` for native comparison. Tests must show result equivalence while traces
show avoided work.

**Visual:** a split execution: the baseline Dragon operation count remains on
one side while optimized setup, exact-small-integer cases, and power-of-ten
scaling eliminate blocks on the other.

**Trace:** fast integer check → exponent estimator → one-time scaling → shared
digit loop; annotate precisely where it differs from Dragon4.

### Grisu2 and Grisu3

**Contract:** Grisu2 always round trips but is not always shortest; Grisu3 emits
shortest output or rejects, requiring a fallback.

**Implementation:** `DiyFp`, normalization, cached-power selection, boundary
construction, `DigitGen`, and `RoundWeed`. Implement Grisu2 and Grisu3 from the
same primitives so the difference is executable. Differential-test the browser
port against Google's `double-conversion`.

**Visual:** true rounding interval, inward safe interval, and outward unsafe
interval. Show the decimal candidate moving as digits are generated. On a known
hard input, animate the proof failing and the fallback handoff.

**Trace:** decode → normalized DiyFp → normalized boundaries → cached power →
scaled interval → integral/fractional digit generation → weed/round test →
success or fallback.

### Errol3

**Contract:** always-correct shortest conversion using double-double arithmetic
plus a finite exceptional set.

**Implementation:** use the POPL artifact/reference source as the native truth.
Build explicit double-double operations and an educational interval/candidate
implementation. Verify the exceptional-input table and do not infer it from a
benchmark corpus.

**Visual:** compare the width of ordinary double, DiyFp, and double-double error
boxes. A “precision lens” shows why nearly every interval becomes decisive;
exceptional values switch to the table path.

**Trace:** construct high/low approximation → compute decimal exponent → scale
with error bound → identify digits → refine rounding → exceptional lookup.

### Ryū

**Contract:** shortest and correctly rounded using only fixed-size integers and
no fallback.

**Implementation:** begin with the paper's basic interval algorithm, then add the
precomputed powers of five, split multiplications, divisibility tests, and digit
removal. Keep the simple and optimized functions side by side. Differential-test
against Ulf Adams's C implementation.

**Visual:** the binary interval is projected onto a large integer lattice in one
fixed-width multiplication. Removing a decimal digit coarsens the lattice; stop
when another removal would merge the admissible endpoints.

**Trace:** integer bounds `mv, mp, mm` → choose `q/k` → table multiply/shift →
scaled integer interval → trailing-zero knowledge → remove digits → tie handling
→ format.

### Schubfach

**Contract:** shortest, closest decimal with a non-iterative candidate argument.

**Implementation:** executable exact specification of `rop`, followed by the
limited-precision version from Giulietti's paper. The proof-critical inequalities
are named and asserted in debug builds.

**Visual:** instead of a digit-removal tape, use a decimal lattice at the chosen
exponent. The admissible interval can contain only the central candidate or an
adjacent one. The viewer sees each candidate test and why no others matter.

**Trace:** choose decimal exponent → compute scaled center/bounds with `rop` →
central candidate → test inside interval → test shorter candidate/correction →
choose closest/tie-even.

### Dragonbox

**Contract:** Schubfach-family binary-to-decimal conversion with configurable
policies; digit-to-character formatting is a separate concern.

**Implementation:** wrap the reference C++ `to_decimal`, then make a teaching
port that exposes the shorter-interval and nearest-rounding cases. Run full and
compact cache policies through the same corpus.

**Visual:** a decision tree beside the candidate lattice. Cache-policy toggles
change memory and table reconstruction work without changing the output.

**Trace:** classify interval → select cache entry/policy → multiply → shorter-
interval or normal case → tie/endpoint policy → remove trailing zeros → return
decimal significand and exponent.

### 2025–26 frontier

This is split into separate chapters once correctness and source stability have
been assessed.

- **Żmij:** show which Schubfach operations, branches, divisions, and formatter
  steps are removed or fused. Test scalar, size-optimized, and SIMD paths.
- **Unrounded scaling:** make carry and sticky bits the central visual; connect
  the Ivy proof obligation to the trace. Cover both fixed- and shortest-width
  printing, keeping parsing out of the main path.
- **Tejú Jaguá:** label the reference repository's stated limitations and
  forthcoming proof. Do not upgrade its evidence tier based on benchmarks.
- **xjb:** treat as experimental while the 2026 preprint and implementation are
  reviewed. Claims remain attributed.

### Toothless (continued fractions)

This chapter is conditional on the audit. The current generated draft is not a
proof. The original implementation, cache generator, boundary adjustments, and
continued-fraction error bound must agree. Any benchmark table in the draft is
ignored.

If correct, the visual is a rational-approximation ladder: continued-fraction
convergents approach a power-of-ten ratio under a 63-bit numerator/denominator
budget, followed by the ordinary decimal-candidate interval. If the proof has a
gap, publish an audit note rather than presenting the method as correct.

## Definition of done for an algorithm chapter

- The output contract is explicit.
- The readable executable specification and the optimized/reference
  implementation both agree with an independent exact oracle on the full test
  corpus. Agreement only between two implementations with shared arithmetic is
  insufficient.
- The corpus includes special values, exponent transitions, values adjacent to
  powers of two and ten, subnormal boundaries, midpoint/tie cases, carry chains,
  upstream hard cases, and a large deterministic sample spanning every binary64
  exponent field. Exhaustive binary32 testing is used where the contract can be
  instantiated for binary32.
- A chapter calls an implementation correct only after the contract-specific
  corpus passes. Earlier executable controls are labeled as controls or partial
  implementations, not as correctness evidence for the completed algorithm.
- Every displayed trace comes from the instrumented implementation.
- Pseudocode line highlighting is synchronized with semantic events.
- At least one ordinary input, one boundary/tie case, and one algorithm-specific
  hard path are available in the player.
- Algorithmically material table or fallback differences may be stated with a
  source. Device code size, stack, and timing remain in the independent embedded
  study until measured reproducibly.
- Correctness and performance evidence are cited separately.
- The chapter works with keyboard controls, narrow screens, reduced motion, and
  without loading third-party scripts.

## Delivery order

1. exact oracle + foundations;
2. Coonen preservation and implementation;
3. Dragon4 baseline;
4. Grisu2/3;
5. Ryū;
6. Schubfach and Dragonbox;
7. Burger–Dybvig/Gay and Errol;
8. modern frontier;
9. Toothless only after its audit;
10. comparable microcontroller builds and final editorial integration.
