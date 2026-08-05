# Fast unrounded scaling source, proof, and browser-port audit

## Pinned materials

- Explanatory paper/post: Russ Cox, *Floating-Point Printing and Parsing Can Be Simple And Fast*, 2026-01-19, `https://research.swtch.com/fp`
- Companion proof: Russ Cox, *Fast Unrounded Scaling: Proof by Ivy*, 2026-01-19, `https://research.swtch.com/fp-proof`
- Repository: `rsc/fpfmt`
- Revision: `ec108cbb39e2cae8e1961d79ba34bd9cc8249f80`
- Revision date: 2026-02-27
- Optimized source: `fpfmt.go`
- Straightforward source: `unopt/fpfmt.go`
- Table generator and output: `pow10gen.go`, `pow10tab.go`

## Representation and contract

For a nonnegative real value `y`, the unrounded form retains:

1. `floor(y)`;
2. the half bit, which says whether the fractional part is at least `1/2`;
3. a sticky bit, which says whether any fraction remains after the half bit.

The source packs those fields as `floor(4y) | (4y != floor(4y))`. The scaling contract is the exact unrounded form of `x × 2^e × 10^p`, not a nearby floating-point value.

## Cached-power reconstruction

The browser port reconstructs the generated table entry rather than copying the 696 checked-in literals. For each `p` from -348 through 347 it:

1. computes exact rational `10^p`;
2. normalizes it into `[2^127, 2^128)` using the same binary exponent derived from the source log approximation;
3. takes the ceiling;
4. rewrites that integer as `hi × 2^64 - lo`, matching the optimized table representation.

Pinned entries at `p = -348, -292, 0, 17, 347` are fixed in the tests. Both 64-bit words and the normalization exponent match `pow10tab.go` exactly.

The raw table payload is 696 × 16 = 11,136 bytes. The checked-in Go source is 43,373 bytes, but source size is not a linked binary or microcontroller flash measurement.

## Exact optimized port

The browser follows the optimized `uscale` operations:

- multiply `x` by `pm.hi`, yielding `hi` and `mid`;
- inspect the low `s` bits of `hi`;
- when they are nonzero, return from the one-multiplication path with sticky set;
- otherwise compute only the high half of `x × pm.lo`, derive the borrow and sticky state, and correct `hi`;
- shift and append sticky.

For explanation, the browser also computes the ignored low half and the full 192-bit product. These values are not used by the algorithm. An independent exact rational calculation produces the specification's unrounded bit pattern for every displayed product and test case.

## Shortest-printer port

The browser also ports the source's `Short` structure:

- left-justify the binary64 significand;
- construct centered or skewed power-of-two boundary numerators;
- choose `p` with the pinned fixed log approximations;
- scale lower and upper boundaries and nudge endpoint inclusion according to significand parity;
- try the coarser `dmax/10` candidate first;
- scale and round the center only when the fine interval contains multiple candidates;
- remove trailing decimal zeros.

The resulting pair is compared with the site's independent exact interval oracle for difficult fixed values and 300 deterministic finite positive bit patterns. Every optimized boundary and center product is also compared with the exact unrounded rational.

## Native upstream tests

With `GOCACHE` redirected to a writable temporary directory, the root `go test` suite at the pinned revision passed locally. That suite includes fixed-width, shortest, and parsing comparison tests across multiple implementations. Benchmark outputs are not copied into the site and no platform-independent ranking is inferred.

## Proof boundary

The companion Ivy proof is primary evidence for the scaling primitive. Its stated theorem covers `p` in `[-400, 400]` for the bit-width/precision pairs used by printing and parsing. The site does not claim to re-prove Ivy itself. The exact browser port guards against source-transcription and visualization errors; it is not a substitute for the proof.
