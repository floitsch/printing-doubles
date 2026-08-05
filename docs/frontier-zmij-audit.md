# Żmij pinned-source implementation notes

Source inspected: `vitaut/zmij` at
`8289609d8f9e6beea1f20d1a56d9f25e1d441359` (2026-08-03).

These notes distinguish observed code structure from claims made by the
upstream README.

## Candidate pipeline

- `to_decimal_double` in `zmij.c` selects `10**(-dec_exp-1)` and forms the
  retained 128 bits of a 192-bit product with `umul192_hi128`.
- On the regular path, `integral` is taken from the retained high word. The
  fractional portion is multiplied by ten to derive the extra digit in
  parallel with interval rounding. The source comment explicitly attributes
  this scheduling to Xiang JunBo and says it removes `div10` from the critical
  path.
- The irregular path is separate and uses unequal lower and upper tests.
- The browser model does not claim to reproduce these fixed-width inequalities.
  It uses the independent exact oracle for the selected decimal, then exposes
  the pinned implementation's ordinary normal-value record layout.

## Digit production

- The scalar `to_bcd8` path performs three simultaneous quotient/remainder
  splits: base 10000, base 100, then base 10. Constant division is implemented
  by multiply and shift.
- Double output splits a value into two groups below 100000000. SSE and NEON
  paths perform analogous lane-parallel conversion and byte shuffling.
- `do_write` starts integer-to-digit conversion before choosing fixed or
  scientific layout, allowing that work to overlap the layout branch.

## Native probe

A temporary wrapper was compiled with `c++ -std=c++17 -O2` against the pinned
`zmij.cc`. Observed public `to_decimal` records included:

| input | significand | exponent | output |
| --- | ---: | ---: | --- |
| `0.3` | `30000000000000000` | `-17` | `0.3` |
| binary64 `1/3` | `33333333333333330` | `-17` | `0.3333333333333333` |
| `1e23` | `10000000000000000` | `7` | `1e+23` |
| `1.0000000000000002` | `10000000000000002` | `-16` | `1.0000000000000002` |

Subnormal record normalization follows a different path and is not modeled by
the current browser x-ray.
