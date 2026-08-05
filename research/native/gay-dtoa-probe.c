// Copyright (C) 2026 Toit contributors.
// SPDX-License-Identifier: MIT

#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char *dtoa(double value, int mode, int ndigits, int *decpt, int *sign,
           char **end);
void freedtoa(char *text);

int main(int argc, char **argv) {
  for (int i = 1; i < argc; i++) {
    char *end = NULL;
    uint64_t bits = strtoull(argv[i], &end, 16);
    if (end == argv[i] || *end != '\0') {
      fprintf(stderr, "invalid binary64 bits: %s\n", argv[i]);
      return 2;
    }

    double value;
    memcpy(&value, &bits, sizeof value);
    int decimal_point;
    int sign;
    char *last;
    char *digits = dtoa(value, 0, 0, &decimal_point, &sign, &last);
    if (!digits) {
      fputs("dtoa allocation failed\n", stderr);
      return 3;
    }
    printf("%016" PRIx64 " %d %d %s\n", bits, sign, decimal_point,
           digits);
    freedtoa(digits);
  }
  return 0;
}
