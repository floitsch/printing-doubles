# Coonen transcription correction log

Status: constants and tables verified; prose verification still in progress.

## Method

Every hexadecimal constant and power-of-ten table entry in the transcription
was compared with the photographic scan (`coonen.pdf`, 27 pages) and with the
correctly rounded value of the power of ten, computed exactly with rational
arithmetic. A correction is recorded as an OCR error only when the scan shows
the corrected text.

## OCR errors (fixed in the transcription, 2026-09-25)

| Location | Transcription had | Scan shows | Exact check |
|---|---|---|---|
| §2.5, P27 | `(1+2^{-32})` | `(1+2^{-36})` | relative error of `0.CECB8F28 × 2^90` is +2^−36.12 |
| §2.5, P40 | `0.EB194FBE` | `0.EB194F8E` | 10^40 rounded to 32 bits is `EB194F8E × 2^101`, error −2^−35.13 |
| §2.5, pten 10^55 | `0.DOCF4B5OCFE20766` | `0.D0CF4B50CFE20766` | letter O read for digit 0 |
| §2.5, pten 10^55 | `(1+2^{-79})` | `(1+2^{-76})` | relative error is +2^−76.21 |
| §2.5, pten 3rd entry | `0.DA01EE641A70BDEA × 2^{366} ≈ 10^{110}` | `0.DA01EE641A708DEA × 2^{359} ≈ 10^{108}` | 10^108 rounded to 64 bits is `DA01EE641A708DEA`, error +2^−67.19 |
| §2.5, pten 4th entry | `× 2^{698} ≈ 10^{210}` | `× 2^{685} ≈ 10^{206}` | 10^206 rounded to 64 bits is `9F79A169BD203E41`, error −2^−67.41 |
| §3.5, extended table, 10^1648 | `0.B9C94B7FABD76515` | `0.B9C94B7FA8D76515` | 10^1648 rounded to 64 bits is `B9C94B7FA8D76515` |

The wrong exponents in the third and fourth pten entries matter: only
27 + 55 + 108 + 206 makes the chapter's claim "any power of ten through 10^340
with at most three multiplications, using at worst two rounded table values"
work (for example 10^340 = 10^206 · 10^108 · 10^26).

## Errors in the original (kept verbatim in the transcription)

- §3.5, extended table, 10^412: the scan prints `0.C6B0A096A95202BD × 2^1369 ≈
  10^412 × (1+2^{-65})`. Rounded to nearest, 10^412 is `…202BE` (error
  +2^−66.09). `…BD` lies below 10^412, which contradicts the printed sign
  `(1+…)`. The last hex digit in the dissertation is one unit too small.

## Checked and correct

- P13 = `0.9184E72A × 2^44` is exactly 10^13.
- pten(1) = `0.CECB8F27F4200F3A × 2^90` is exactly 10^27.
- The 10^824 and 10^3296 extended entries match the correctly rounded values.
- LOG2 = `0.4D104D42` is log10(2) truncated to 32 bits.
- §3.2, "10^303 × (1+2^{-62}) is representable in double": the smallest
  double above 10^303 is 10^303 × (1+2^−62.42), so the approximate claim holds.

## Open items

- The transcription begins with dissertation page 6.16, which is not part of
  Chapter 7.
- The epigraph spells “octonal”; the scan must decide whether this unusual word
  is intentional or an OCR error.
- The title uses inconsistent spacing around “Binary - Decimal”.
- Prose and non-constant mathematical displays still need line-by-line
  comparison with the scan.
