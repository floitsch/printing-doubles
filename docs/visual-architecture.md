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
