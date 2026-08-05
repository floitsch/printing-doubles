# Toothless continued-fraction draft: correctness audit

Audit date: 2026-08-05

Materials inspected:

- `/home/flo/papers/double-conversion_continued_fractions/gemini.tex` (216 lines; untracked in its source repository)
- `/home/flo/papers/double-conversion_continued_fractions/pldi/double_conversion.tex` (older and substantially more complete draft; locally modified by the user)
- `bench/continued.c`, its generated fraction table, generator tools, and the existing comparison harness

No benchmark number from either manuscript was used.

## Result

The C implementation has substantial positive test evidence, but neither manuscript currently proves that it is correct for every binary64 input. The short `gemini.tex` proof is not repairable by local wording changes: it omits the continued-fraction separation proposition on which the boundary adjustments depend, assumes the central shortestness claim, and contains a dimensionally incorrect rewriting in the closest-candidate proof. The older PLDI draft contains the missing central idea and much more of the required argument, but it also contains explicit proof TODOs and duplicated, unfinished shortestness lemmas.

Accordingly, Toothless should not yet be presented as a proved algorithm chapter. It is appropriate to retain it as an audit note and possible follow-up.

## Positive evidence

The original C implementation was built from a copy in `/tmp`, without modifying the paper repository.

Its bundled harness reported:

```text
Ran 2100100 tests. 1200 disagreements
Continued    : 2100100/2100100 (0 skipped). 0 errors.
```

The figure requires interpretation. The first 100,100 cases come from `tests.txt` and have expected digit strings. For the two million generated cases, `ensureAgreement` runs Toothless first and uses its output as the reference for the other algorithms; it checks only that Toothless parses back to the input. Therefore the zero-error line does not independently prove shortestness or closestness for those generated values. The 1,200 disagreements are differences somewhere among the algorithms and are not classified by the harness.

I added a temporary native wrapper and compared 9,996 deterministic finite positive binary64 bit patterns directly with this site's exact rational interval oracle. There were zero disagreements. Named and transition values in the existing 100,100-case file also passed. This is good regression evidence, not an exhaustive proof.

The public chapter now includes an independent exact-arithmetic reconstruction of the continued-fraction ladder. Browser and Node tests check that its convergents reconstruct the selected rational targets, that every displayed numerator and denominator respects the chosen word ceiling, and that increasing the ceiling never worsens the selected approximation for the study targets. This validates the instrument's arithmetic; it does not certify the unpublished cache or close any of the proof obligations below.

The decision-threshold microscope deliberately places a synthetic threshold inside the magnified gap between the chosen ratio and the exact target. It is not a discovered binary64 counterexample. Its purpose is to make the required separation theorem visible: correctness needs a proof that no rational comparison arising from the conversion can occupy that gap.

## Blocking proof issues

### 1. The short draft drops the theorem that makes approximation safe

The algorithm does not merely need `num/den` to be close to a power of ten. It needs to know that multiplying a binary significand by the approximation cannot put a candidate on the wrong side of the exact power. The older draft supplies the intended idea: choose a best rational approximation whose denominator exceeds every possible relevant binary significand denominator. Then no rational `x/f` with the bounded `f` can lie strictly between the cached fraction and the exact scale.

That separation proposition is the distinctive continued-fraction argument. It is absent from `gemini.tex`. The table of `+1` and `-1` endpoint adjustments is unjustified without it.

The final proof must state and verify, for every cache entry:

- the exact target rational;
- whether the cached fraction is below, equal to, or above it;
- the precise best-approximation definition being used;
- the numerator and denominator bounds of every rational arising from a binary64 boundary comparison;
- that the chosen convergent or semiconvergent has a sufficiently large denominator;
- that inversion of a cached fraction preserves the required separation statement with the correct inequality direction.

The sentence in `gemini.tex` saying that convergents provide the best ratio fitting the two 64-bit limits is too strong. The older draft correctly notes that some best approximations are semiconvergents. A bound on both numerator and denominator is not the same optimization problem as the usual denominator-only definition.

### 2. The shortestness lemma assumes its conclusion

The short draft states that a generated prefix is “the largest decimal number of length i” below the upper boundary. That is the fact that must be proved. A prefix integer has an associated decimal grid spacing; its significant length also changes when trailing zeros are factored into the exponent. The proof currently mixes the digit-place exponent `k_i`, the cached scale exponent, and the exponent of the represented decimal.

A repair should define a fixed decimal lattice for each significant length and prove both:

1. the generated prefix is the greatest lattice point not above the exact upper boundary; and
2. the next lattice point is above that boundary.

The failure of the lower-bound stopping test on the previous lattice then proves that the complete interval contains no point on that coarser grid. This is close to a Dragon or Schubfach grid lemma, but it must be written with consistent units.

The older draft recognizes this gap: one duplicated proof contains `TODO: this proof feels overly complex`, unresolved variables, and an unfinished digit argument.

### 3. The closest-candidate algebra in `gemini.tex` is dimensionally wrong

The code compares

```text
2 * R * denominator
    with
2 * exactSignificand * numerator + decimalDigit * denominator.
```

After division by the denominator this compares the integer-grid candidate `R` with the scaled center plus half one decimal grid step. The short paper instead rewrites the left side as `R' * num/den`, multiplying the candidate by the cached fraction a second time. That equation does not follow from the program.

The proof also needs to state which of the current and next-lower candidates is selected when equality holds, and why the `fractionIsHigher` and exact-even branches implement the desired decimal tie rule.

### 4. Cache and width invariants are asserted but not proved

The C code shifts guarded significands by `exponentDiff`, multiplies them by a cached numerator in 128 bits, and later doubles products in the closest comparison. A complete proof needs explicit maximum bit lengths for every intermediate and the legal range of every shift. The older draft proves termination partly by an empirical property of the generated cache; that property should become a generated assertion or a checked certificate committed with the table.

The manuscript's approximate cache-size statement also omits exponent/tag storage and alignment. It should not be used as a memory result.

### 5. One binary64 boundary case is modeled too narrowly

`boundaries` treats every normal value with zero fraction bits as having a closer predecessor. The smallest normal binary64 value is the exception: its predecessor is subnormal but has the same spacing as its successor. The current code therefore constructs a lower midpoint that is too close for `0x0010000000000000`.

The produced string for that particular value still matches the exact oracle, and the sampled corpus found no consequence. Nevertheless, the interval construction is not the specified binary64 parsing interval and invalidates a universal proof unless it is special-cased or shown result-equivalent for every affected decision (there is only this one positive magnitude, plus its sign).

## Manuscript-specific findings

- The benchmark section in `gemini.tex` appears generated and must be removed or replaced with new reproducible measurements, as requested.
- The abstract and conclusion claim completeness before the proof obligations above are discharged.
- “128-bit approximations (stored as two 64-bit integers)” is ambiguous: the representation is a ratio of two tagged 63-bit magnitudes, while products use a compiler 128-bit integer.
- Step numbering in the correctness section refers to steps 4 and 5 although the displayed algorithm combines concepts differently.
- The manuscript should use one representation convention for `(digits, point)` versus `coefficient × 10^exponent`; several displayed equations currently mix them.

## Recommended repair sequence

1. Fix the smallest-normal boundary construction and add exact transition tests.
2. Turn the cache generator's mathematical assumptions into machine-checked certificates: target, side, gcd, convergent/semiconvergent status, separation denominator, and intermediate width bounds.
3. Write an exact specification using integer/rational arithmetic and compare every optimized intermediate inequality against it.
4. Replace the digit proof with a decimal-grid lemma independent of the cache representation.
5. Prove closest selection from the exact code inequality, including all equality branches.
6. Run exhaustive binary32 and large structured binary64 corpora against at least two independent exact oracles.
7. Only then restore the universal claims and write new benchmarks.

Until these steps are complete, the continued-fraction construction remains interesting but obsolete research, not a verified member of the main algorithm sequence.
