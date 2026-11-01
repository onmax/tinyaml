---
title: Speed
description: Parse and stringify timings of each tinyaml entry against the library it replaces.
---

![Times faster than the original, 268 KiB file](/charts/speed.svg)

Median time per call over 7 rounds, from [`bench/index.ts`](https://github.com/onmax/tinyaml/blob/main/bench/index.ts), on an Apple M4 with Node 26.13. Each library and the tinyaml entry that replaces it run with default options. The inputs are a 7-line frontmatter block and js-yaml's `package-lock.json` written as YAML, 268 KiB. The last four rows compare tinyaml's root API with yaml, the library closest to its rules.

## All timings

| Library    | Operation             |  Library | tinyaml | Speedup |
| ---------- | --------------------- | -------: | ------: | ------: |
| js-yaml 4  | parse frontmatter     |   2.7 µs |  1.7 µs |    1.6x |
| js-yaml 4  | stringify frontmatter |   3.7 µs |  2.5 µs |    1.5x |
| js-yaml 4  | parse 268 KiB         |  3.00 ms | 2.00 ms |    1.5x |
| js-yaml 4  | stringify 268 KiB     |  4.51 ms | 2.77 ms |    1.6x |
| js-yaml 5  | parse frontmatter     |   3.1 µs |  1.7 µs |    1.8x |
| js-yaml 5  | stringify frontmatter |   5.3 µs |  2.7 µs |    2.0x |
| js-yaml 5  | parse 268 KiB         |  3.07 ms | 2.00 ms |    1.5x |
| js-yaml 5  | stringify 268 KiB     |  5.22 ms | 2.90 ms |    1.8x |
| yaml       | parse frontmatter     |  29.6 µs |  2.8 µs |   10.6x |
| yaml       | stringify frontmatter |  13.7 µs |  4.2 µs |    3.3x |
| yaml       | parse 268 KiB         | 35.89 ms | 2.85 ms |   12.6x |
| yaml       | stringify 268 KiB     | 11.93 ms | 4.22 ms |    2.8x |
| yamljs     | parse frontmatter     |   7.1 µs |  2.0 µs |    3.5x |
| yamljs     | stringify frontmatter |   1.6 µs |  1.1 µs |    1.4x |
| yamljs     | parse 268 KiB         | 11.36 ms | 2.29 ms |    5.0x |
| yamljs     | stringify 268 KiB     |  1.46 ms | 1.28 ms |    1.1x |
| @std/yaml  | parse frontmatter     |   3.7 µs |  1.7 µs |    2.1x |
| @std/yaml  | stringify frontmatter |   3.8 µs |  2.3 µs |    1.7x |
| @std/yaml  | parse 268 KiB         |  4.03 ms | 2.03 ms |    2.0x |
| @std/yaml  | stringify 268 KiB     |  4.10 ms | 2.56 ms |    1.6x |
| yaml, root | parse frontmatter     |  30.4 µs |  1.6 µs |   19.4x |
| yaml, root | stringify frontmatter |  14.1 µs |  1.1 µs |   13.2x |
| yaml, root | parse 268 KiB         | 36.22 ms | 1.87 ms |   19.3x |
| yaml, root | stringify 268 KiB     | 12.65 ms | 1.01 ms |   12.5x |

tinyaml is faster on every row. The closest is tinyaml/yamljs's `stringify` on the 268 KiB file, 1.28 ms to yamljs's 1.46 ms. It has to write the same bytes as yamljs, so it follows yamljs's dumper closely.
