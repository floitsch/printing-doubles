# Visual implementation architecture

## Decision

Continue to use native JavaScript modules and small Web Components. Do not add
Svelte, React, or another application framework at this stage.

This is not a commitment to implement every picture with the same rendering
technology:

- use semantic HTML for controls, explanations, tables, and persistent values;
- use SVG for sparse diagrams whose marks need focus, tap, hover, labels, and
  direct manipulation;
- use canvas for dense number lines with many ticks and continuous pan/zoom;
- use ordinary CSS for layout and visual state;
- keep exact arithmetic and algorithm state in framework-independent modules.

## Reasons

The site is a collection of static chapters served directly by GitHub Pages.
Each instrument has local state and a small number of controls. There is no
shared application store, client-side routing system, server state, or large
component tree. Native custom elements already provide lifecycle boundaries and
allow a chapter to declare an instrument in its HTML without bootstrapping a
site-wide application.

The difficult part of the project is mathematical scene design. A framework
would not simplify exact `BigInt` arithmetic, number-line coordinates, SVG
geometry, hit testing, or the choice of what an algorithm should show. It would
add a dependency and build step to a site that currently runs directly from its
source files.

SVG is a deliberate addition to the existing canvas approach. Schubfach has a
small number of meaningful interval endpoints, grid marks, and candidates. SVG
makes those marks native focus targets and gives them browser tooltips. Canvas
remains appropriate for the general binary/decimal explorer, where hundreds of
ticks may move continuously.

## Component boundary

An algorithm module computes exact semantic state. A visual component consumes
that state and decides how to present it. It must not reconstruct the algorithm
from display coordinates.

Hover may reveal exact values, requirements, or limitations, but no required
fact may exist only on hover. Every hover target must also be reachable by tap
or keyboard focus, and its information must appear in a persistent inspector or
an equivalent visible region.

Shared code should be limited to genuine primitives:

- rational-to-display coordinate conversion;
- accessible SVG mark creation;
- value-entry and preset controls;
- interval endpoint styles;
- product-window and integer-grid drawing primitives;
- compact and exact value formatting.

There will be no universal “algorithm player” component.

## Chapter-specific visual theses

Before implementing an algorithm chapter, reduce it to the pictures that would
still distinguish the algorithm if the surrounding prose were removed. These
are not decorative summaries; they determine the instruments and the order of
the explanation.

- **Schubfach:** a parsing interval is a drawer; two adjacent decimal grids
  place only a bounded set of points in it. The principal instrument therefore
  moves the drawer over coarse and fine grids, followed by an exact candidate
  laboratory.
- **Ryū:** decimal cells form ten-to-one groups. Coarsening the grid removes one
  digit at a time until the next group would be empty. Its main instrument is a
  resolution control, supported by separate guard-bit and product-window
  diagrams.
- **Dragonbox:** the candidate geometry is inherited. The new idea is the route
  by which one cached product supplies a coarse test and, after failure, a
  one-digit refinement. Its main diagram is a dependency graph whose active
  path changes with the input and policies.
- **Grisu:** approximate coordinates create uncertainty fringes. A decimal
  approaches from the upper side and may be returned only after it enters a
  smaller safe interval and remains closest throughout the center's uncertainty
  range. Its main instrument is a proof microscope; a separate workbench shows
  the 53-to-64-bit widening and retained product window.
- **Errol:** both high-precision endpoints repeatedly occupy decimal digit
  cells. A shared cell is translated to zero and enlarged tenfold; separation
  ends the common prefix. Its main instrument is this crop-and-zoom strip. A
  residual microscope separately shows `hi + lo` as a sub-ulp displacement
  that would disappear if the fields were immediately added as binary64.
- **Coonen:** a caller chooses the field width first. Decimal scaling maps both
  very small and very large inputs into the same N-digit integer window, after
  which one rounding produces the whole field. Its main instrument keeps the
  source, shift, target window, rounding, saved exponent, and possible single
  decade retry visible at the same time.
- **Dragon:** the emitted prefix persists while one current decimal cell is
  repeatedly enlarged. Inside that cell, the exact remainder locates the value
  and two independently carried margins define the admissible band. Its main
  instrument therefore combines a prefix history with a stable 0-to-1 cell,
  rather than moving through unrelated register snapshots.
- **Żmij:** the selection theorem is inherited, while the execution shape fuses
  one farther-scaled product with parallel derivation of the final digit and
  treats integer-to-character conversion as critical work. Its source-pinned
  x-ray forks retained product facts, then follows 10^8 groups through scalar
  or lane-parallel BCD-like conversion into bytes.
- **xjb:** one extra decimal shift turns selection into a local last-digit
  decision. Its microscope keeps the integer prefix fixed and overlays the
  exact parsing interval on positions 0 through 10. Interior points retain a
  digit; the endpoints visibly end in zero and normalize to a shorter record.
  A power-of-two preset makes the unequal margins visible in the same ruler.
- **Tejú Jaguá:** expensive generality moves into an offline generator. Its
  configurator passes format and target-integer facts through multiprecision
  validation into generated constants and a fixed-width C kernel. A separate
  runtime route view distinguishes small integers, centered intervals, and
  uncentered powers of two without pretending that build-time dependencies are
  part of the target program.
- **Fast unrounded scaling:** rounding is deferred into an integer field, a
  half bit, and a sticky bit. One instrument makes those fields and their later
  rounding choices tangible. A second is a literal 64-by-128 product x-ray:
  retained top bits, shifted top bits, middle word, omitted bottom word, the
  borrow test, and the fast path that skips the correction multiplication. The
  browser reconstructs the table and checks the optimized bits against an
  independent exact rational definition.
- **Gay and Burger–Dybvig:** a side-by-side execution x-ray retains Dragon's
  interval destination while making removed work visible. Decimal decades are
  crossed on the baseline lane and replaced by a one-sided estimate plus one
  exact check; common binary factors shrink in a width bar; the final quotient
  view switches between an exact-integer bypass, shift-and-mask denominator,
  and prepared small multiples. Hover, focus, and tap explain source-specific
  conditions, but the route, widths, estimate, repair, and answer remain
  persistent.

The same exercise must be completed before rebuilding each remaining chapter.
It is acceptable for an algorithm to have two complementary pictures when its
arithmetic representation and its selection theorem are genuinely different
ideas. Reusing the trace player is not an acceptable substitute for identifying
the visual thesis.

## When to reconsider a framework

Re-evaluate this decision if at least one of the following becomes true:

1. several instruments require a deeply nested component tree with shared
   reactive state;
2. the same interactive state must remain synchronized across chapter routes;
3. manual DOM updates become a recurring source of correctness bugs;
4. build-time generation is required for traces, source maps, or content;
5. contributors cannot safely extend the instruments without a stronger typed
   component model.

If that point is reached, Svelte is the preferred first evaluation because it
can compile small chapter-local components and emit a static GitHub Pages site.
The exact algorithm modules should remain unchanged during such a migration.
