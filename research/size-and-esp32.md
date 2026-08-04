# Independent size and ESP32 study

This work is intentionally separate from the explanatory web page. Its purpose
is to determine which correctly implemented binary64 printers are attractive on
memory-constrained systems. No result from this file should enter the page merely
because it was reported by a paper or observed in one unpinned build.

## Questions

- What flash is retained when one conversion entry point is linked into an
  otherwise minimal program?
- How much of that flash is executable code, read-only tables, writable data,
  and formatting support shared with the C library?
- What is the maximum stack use for difficult inputs?
- Which cache policies reconstruct table entries at runtime, and what code and
  stack do those policies add?
- Does a method require a fallback implementation, and what is the combined
  retained cost?
- What latency and energy distributions result on representative ESP32 Xtensa
  and RISC-V targets?

## Measurement rules

1. First pass the algorithm's independent correctness corpus. Size or speed of
   an implementation that has not passed is not a usable result.
2. Pin source revisions, compiler versions, target, ABI, optimization flags,
   link-time-optimization setting, and C/C++ library.
3. Expose one uniform no-inline wrapper and retain exactly one public conversion
   entry point. Measure a matching empty wrapper to identify harness overhead.
4. Record linker-map contributions for `.text`, read-only data, writable data,
   zero-initialized data, and static lookup tables. Record both isolated object
   sections and final retained firmware; neither substitutes for the other.
5. Measure stack with a repeatable high-water method on the target. Include the
   output buffer separately rather than silently treating it as either caller or
   callee storage.
6. Use the same difficult and representative distributions for every method.
   Report medians and tails, not only the fastest observation.
7. Keep digit-to-character formatting separate when the algorithm exposes only
   a decimal coefficient and exponent; also report an end-to-end result because
   users ultimately need characters.

## Candidate implementations

- Dragon/Dragon4 and its required big-integer support;
- Grisu3 together with its fallback, plus cache variants;
- Errol3 and its exceptional-case data;
- Ryū full-table and size-oriented variants;
- Schubfach;
- Dragonbox full and compact cache policies;
- Żmij size-oriented and default configurations;
- unrounded scaling after its native implementation and wrapper are pinned.

The Coonen reconstruction is historical and is not an ESP32 benchmark target.
Large differences intrinsic to an algorithm—for example, requiring arbitrary
precision or offering a compact cached-power policy—may be mentioned in the
site. Numerical firmware comparisons remain here until reproduced.
