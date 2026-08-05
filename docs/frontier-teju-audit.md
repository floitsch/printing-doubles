# Tejú Jaguá source and visualization audit

## Pinned material

- Repository: `cassioneri/teju_jagua`
- Revision: `4403283bda3e7145d643496231f3c4b5509dd379`
- Snapshot date: 2025-11-16
- Generator: `cpp/generator/generator.cpp`
- Shared runtime: `teju/src/teju.h`, `div10.h`, and `mshift.h`
- Binary64 probe target: `teju/src/generated/ieee64_with_uint128.c`

The README describes the project as partial and work in progress. It says an academic proof will be written. This audit therefore treats generator and runtime behavior as implementation evidence, not as a published proof.

## Generator facts traced

The JSON configuration fixes:

- identifier and emitted symbol name;
- limb width;
- minimum and maximum binary exponents;
- significand width;
- splitting and ordering of cached multiplier literals;
- division-by-ten and multiply-and-shift implementations.

Before emission, the generator checks that centered and uncentered calculations cannot overflow. A further refined uncentered check is required only when the generated `sorted` fact is false. It chooses a runtime shift of twice the limb width, emits two-limb cached multipliers, generates modular inverses and bounds for possible powers-of-five divisibility tests, and includes the shared C kernel after defining format-specific macros.

The generated multiplier row counts were counted directly inside the checked-in `multipliers[]` arrays:

| generated format | multiplier rows | checked-in `.c` bytes |
| --- | ---: | ---: |
| binary16 | 10 | 1,832 or 1,836 |
| binary32 | 77 | 4,453 or 4,457 |
| bfloat16 | 78 | 3,564 |
| binary64 | 617 | 35,366 or 35,368 |
| x86 extended | 9,865 | 1,231,000 |
| binary128 | 9,865 | 1,233,568 |

The byte column is source-file size, not table bytes, linked flash, runtime RAM, or a microcontroller measurement. The chapter uses it only to prevent the generated artifact from being confused with a universal tiny header.

## Runtime facts traced

`teju_to_decimal` receives a positive finite binary pair and selects:

1. a small-integer path when the power of two can be removed by shifting;
2. a centered path for ordinary equal-margin values and the minimum exponent;
3. an uncentered path for normal powers of two.

The centered path maps `(2m-1)<<r` and `(2m+1)<<r` through the cached multiplier. It tries the coarser `q = div10(b)` candidate first by comparing `10q` with the scaled boundary images. If that fails, it maps `4m<<r`, selects between adjacent fine-grid candidates, and applies exact tie tests.

The uncentered path uses different lower and upper constructions because the lower margin is half the upper margin. Depending on the generated `sorted` fact, a refined branch may remain. The small-integer path removes decimal trailing zeros using rotating multiplication by the inverse of five.

## Native binary64 probe

The checked-in native-128 binary64 source was compiled with `c++ -std=c++17 -O2 -Dteju_has_uint128`. Observed pairs were:

| input | binary pair | decimal pair |
| --- | --- | --- |
| `0.3` | `5404319552844595 × 2^-54` | `3 × 10^-1` |
| binary64 `1/3` | `6004799503160661 × 2^-54` | `3333333333333333 × 10^-16` |
| `1` | `4503599627370496 × 2^-52` | `1 × 10^0` |
| `2` | `4503599627370496 × 2^-51` | `2 × 10^0` |
| `1.0000000000000002` | `4503599627370497 × 2^-52` | `10000000000000002 × 10^-16` |
| binary64 `1e23` | `5960464477539062 × 2^24` | `1 × 10^23` |
| binary64 `1.2345` | `5559693739988877 × 2^-52` | `12345 × 10^-4` |
| minimum subnormal | `1 × 2^-1074` | `5 × 10^-324` |
| maximum finite | `9007199254740991 × 2^971` | `17976931348623157 × 10^292` |

The site model uses the independent exact oracle for decimal selection and reproduces these pairs. It does not port the generated cached multiplier arithmetic.

## Scope retained visibly

- Core input is finite and strictly positive.
- Bit decoding is provided for common formats but is conceptually outside the core.
- Sign, special-value spelling, layout, and character production are outside the core.
- The generator and test infrastructure use multiprecision; the emitted runtime kernel does not.
- Differential tests against Dragonbox and Ryū are upstream evidence.
