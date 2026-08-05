# Gay dtoa and Burger–Dybvig audit

Checked 2026-08-05. This note separates historical claims, the browser
specification, and execution of a current production source.

## Primary material

- David M. Gay, *Correctly Rounded Binary-Decimal and Decimal-Binary
  Conversions*, 1990: <https://ampl.com/REFS/rounding.pdf>
  - downloaded SHA-256:
    `4e59cf44ffc13f3a94064c926ca58c5d2207ca9d7bbebe73531d215106ec03ca`
- David M. Gay, Netlib `dtoa.c`: <https://www.netlib.org/fp/dtoa.c>
  - downloaded SHA-256:
    `1cea6e7a91e826bbecd663341771159e97a876ad44c64fa2f84bbb76b3441e16`
  - Netlib `00lastchange` was dated 2024-07-18 and described a correction to
    the BF96 fast path for `6.9999999999999996e-161`.
- Robert G. Burger and R. Kent Dybvig, *Printing Floating-Point Numbers
  Quickly and Accurately*, corrected PDF:
  <https://www.burgerrg.com/FP-Printing-PLDI96.pdf>
  - downloaded SHA-256:
    `b5f1172ef6be71f23a2479f377ea452937adb6b4bd2c4d04a4846f0d3ec6f049`
- Burger's sample Scheme and C sources: <https://www.burgerrg.com/fp.html>

The paper's historical timings are not reproduced and are not used to rank
current implementations.

## Claims traced to Gay

The modification list immediately before `dtoa_r` in the inspected source is
the basis for the chapter's implementation claims:

1. a numeric overestimate replaces iterative scale discovery and powers are
   constructed in logarithmically many multiplications;
2. non-left-to-right digit generation applies to selected fixed-precision
   modes, not the general shortest path;
3. mode 0 relaxes endpoint equality under round-to-nearest (the `1e23`
   example), while mode 1 retains the Steele–White stopping rule;
4. common powers of two are removed;
5. sufficiently small exact floating-point integers use native arithmetic;
6. requests below fifteen digits first attempt bounded-error native arithmetic
   and fall back when the result is ambiguous.

The chapter intentionally does not describe item 6 as the shortest-mode path.
In the inspected non-BF96 branch, the quick calculation requires nonnegative
`ilim`, whereas modes 0 and 1 initialize `ilim` to -1. Mode 0 can still take
the exact-small-integer route before the bignum setup.

## Burger–Dybvig browser specification

`site/js/dragon-descendants-reference.js` follows the authors' binary64
free-format setup:

- exact `r`, `s`, `m+`, and `m-` initialization for positive finite binary64;
- unequal margins for a normalized power of two;
- endpoint ownership from an even significand;
- the sample C exponent-only estimator;
- direct power-of-ten scaling and one exact fixup;
- quotient/remainder digit generation with two independent stopping tests;
- nearest final candidate with an even decimal last digit for an exact tie.

The last rule is an allowed policy specialization. The paper permits a chosen
tie rule; its short Scheme listing chooses the upper candidate on an exact
decimal tie.

The test suite compares 1,800 deterministic finite patterns and named
transition, subnormal, endpoint, and range cases with the independent exact
decimal-grid oracle. It separately checks that the estimator is correct or one
low before fixup.

## Native Gay verification

The repository stores a small ABI wrapper in
`research/native/gay-dtoa-probe.c`. The audited source was compiled and checked
with:

```sh
cc -O2 -DIEEE_8087 -o /tmp/gay-dtoa-probe \
  /tmp/gay-dtoa.c research/native/gay-dtoa-probe.c -lm
node scripts/verify-gay-dtoa.mjs /tmp/gay-dtoa-probe
```

Compiler: GCC 16.1.1. The verifier sent binary64 bit patterns to mode 0,
reconstructed the decimal coefficient and exponent from Gay's returned digit
string and decimal-point position, and compared the result with the independent
exact grid oracle. All 810 named and deterministic finite nonzero cases agreed.

This is strong differential evidence, not an exhaustive binary64 proof.

## Memory boundary

Burger's 1996 `free.c` declares `five[MAX_FIVE]` with `MAX_FIVE = 325`; every
entry contains 24 64-bit digits. The digit arrays alone therefore occupy
`325 * 24 * 8 = 62,400` bytes. Length fields, alignment, working bignums, and
prepared denominator multiples are additional. This is a statement about the
sample layout, not a lower bound for the algorithm and not a measurement of
Netlib dtoa.

The difference is large enough to mention for microcontroller readers, but
the broader code/stack/table comparison remains in the separate embedded-size
research track.
