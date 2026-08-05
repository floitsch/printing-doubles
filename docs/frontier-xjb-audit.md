# xjb source and visualization audit

## Pinned material

- Repository: `xjb714/xjb`
- Revision: `2e68f5cd81e8cd265339bd81c460fa6e3d1c2cfb`
- Inspected implementation: `bench/xjb/float_to_decimal/xjb64_i.cpp`, function `xjb64_v2_f64_to_dec`
- Repository date on the latest binary64 function: 2026-02-14
- Repository snapshot checked out locally: 2026-07-29

The repository states that Algorithm 1 on page 10 of the article contains a mistake and directs readers to the implementation reproduced in the README. The chapter therefore treats the current source as the operational authority. It does not silently repair or teach the mistaken paper pseudocode.

## Source-to-picture correspondence

For a normal positive binary64 value `v = c × 2^q`, the current implementation computes an integer approximation to

`k = floor(q × log10(2))`

and loads a cached approximation of `10^(-k-1)`. This is the extra decimal shift. In exact arithmetic write

`v × 10^(-k-1) = m + n`, with integer `m` and `0 ≤ n < 1`.

The source's `ten` corresponds to `10m`. Its retained fractional word `dot_one` corresponds to the position `n`. The provisional `one` is the nearest integer to `10n`, with a special equality correction. The two `select_if_less_xjb64` calls replace that digit with `0` or `10` when the lower or upper endpoint is within the scaled parsing interval. The browser microscope reconstructs these same positions exactly with `BigInt` rational arithmetic.

The browser does **not** reproduce the source's cached 128-bit table, retained-product error bounds, architecture-specific conditional selection, or compact-power reconstruction. Its independent exact candidate comes from `oracle.js`. This evidence separation prevents agreement with the native output from being mistaken for a line-by-line port proof.

## Native probe records

The pinned source was included directly into a temporary C++ probe and compiled with `c++ -std=c++17 -O2` on x86-64. The public decimal records observed were:

| binary64 input | coefficient | exponent |
| --- | ---: | ---: |
| `0.3` | `30000000000000000` | `-17` |
| `1/3` rounded to binary64 | `33333333333333330` | `-17` |
| `1` | `10000000000000000` | `-16` |
| `2` | `20000000000000000` | `-16` |
| `1.0000000000000002` | `10000000000000002` | `-16` |
| binary64 `1e23` | `10000000000000000` | `7` |
| binary64 `1.2345` | `12345000000000000` | `-16` |
| maximum finite binary64 | `17976931348623157` | `292` |
| minimum subnormal | `5` | `-324` |

The normal records above are fixed as repository tests. The minimum-subnormal observation documents the native path but is not modeled in the chapter applet.

## Memory claims

The repository README gives table-data sizes of 15,336 bytes for full binary64 and 368 bytes for compact binary64. The chapter labels these as upstream lookup-data figures. They are neither total executable size nor working-memory measurements, and no ESP32 claim is made.

## Known limitations retained in the chapter

- The article is a preprint and the repository documents a pseudocode error.
- The project roadmap lists big-endian completion as outstanding.
- Upstream benchmark numbers are not converted into a general speed ranking.
- Upstream exhaustive checks are claims, not substituted for this site's independent corpus tests.
