---
title: Size and speed
description: Bundle size and timings of each entry next to the library it replaces.
---

Bundled with esbuild, minified ESM, every export kept, then gzip -9 (`pnpm size`):

| Entry                              | Minified |     Gzip | Original                  |  Minified |     Gzip |
| ---------------------------------- | -------: | -------: | ------------------------- | --------: | -------: |
| `tinyjson5`                        |  8.5 KiB |  3.4 KiB | json5 2.2.3               |  26.5 KiB |  7.6 KiB |
| `tinyjson5/json5`                  |  7.8 KiB |  3.2 KiB | json5 2.2.3               |  26.5 KiB |  7.6 KiB |
| `tinyjson5/json5-v1`               |  8.0 KiB |  3.3 KiB | json5 1.0.2               |  29.2 KiB |  8.4 KiB |
| `tinyjson5/strip-json-comments`    |  0.9 KiB |  0.5 KiB | strip-json-comments 3.1.1 |   1.3 KiB |  0.8 KiB |
| `tinyjson5/strip-json-comments-v2` |  0.9 KiB |  0.5 KiB | strip-json-comments 2.0.1 |   1.2 KiB |  0.7 KiB |
| `tinyjson5/strip-json-comments-v5` |  1.1 KiB |  0.6 KiB | strip-json-comments 5.0.3 |   1.1 KiB |  0.6 KiB |
| `tinyjson5/jsonc-parser`           | 16.7 KiB |  5.7 KiB | jsonc-parser 3.3.1        |  19.7 KiB |  6.6 KiB |
| `tinyjson5/comment-json`           | 59.8 KiB | 18.4 KiB | comment-json 4.6.2        | 151.8 KiB | 35.7 KiB |
| `tinyjson5/jju`                    | 28.0 KiB |  9.7 KiB | jju 1.4.0                 |  28.4 KiB |  9.8 KiB |

jju needs Node's `fs` and `assert`, so it's measured for Node, without them. Each entry is built on its own, so it carries no code of another; the root carries json5 3's additions and the `jsonc` mode, which put it above `tinyjson5/json5`.

## Speed

Every entry is faster than its original at every operation benchmarked, from 1.04× (jsonc-parser's `format` of the tsconfig) to 11.4×. `pnpm bench` times each entry against its original, on the built `dist/`, with a 14-line tsconfig, json5's own `test.json5`, and json5 2.2.3's package-lock.json as 220 KB of JSON5 and 229 KB of JSON with comments. Each time is the median of 7 runs, measured on AMD Ryzen 7 255 w/ Radeon 780M Graphics, Node 24.21.0:

| Original                      | Operation            | Original | tinyjson5 | Speedup |
| ----------------------------- | -------------------- | -------: | --------: | ------: |
| json5 2.2.3                   | parse tsconfig       |  27.9 µs |    3.2 µs |   8.86× |
| json5 2.2.3                   | stringify tsconfig   |   5.0 µs |    1.5 µs |   3.28× |
| json5 2.2.3                   | parse test.json5     |   2.4 µs |    297 ns |   8.13× |
| json5 2.2.3                   | stringify test.json5 |   297 ns |    194 ns |   1.53× |
| json5 2.2.3                   | parse large          | 16.23 ms |   2.01 ms |   8.06× |
| json5 2.2.3                   | stringify large      |  5.17 ms |  925.3 µs |   5.59× |
| json5 1.0.2                   | parse tsconfig       |  37.8 µs |    3.3 µs |  11.39× |
| json5 1.0.2                   | stringify tsconfig   |   5.2 µs |    1.4 µs |   3.72× |
| json5 1.0.2                   | parse test.json5     |   2.4 µs |    264 ns |   9.20× |
| json5 1.0.2                   | stringify test.json5 |   299 ns |    211 ns |   1.42× |
| json5 1.0.2                   | parse large          | 16.28 ms |   1.93 ms |   8.42× |
| json5 1.0.2                   | stringify large      |  4.24 ms |  693.7 µs |   6.12× |
| strip-json-comments 3         | strip tsconfig       |   5.5 µs |    1.1 µs |   4.83× |
| strip-json-comments 3         | strip large          |  3.74 ms |  965.8 µs |   3.87× |
| strip-json-comments 2         | strip tsconfig       |   6.3 µs |    1.1 µs |   5.55× |
| strip-json-comments 2         | strip large          |  4.68 ms |   1.15 ms |   4.06× |
| strip-json-comments 5         | strip tsconfig       |   5.6 µs |    1.2 µs |   4.70× |
| strip-json-comments 5         | strip large          |  3.81 ms |  970.6 µs |   3.93× |
| jsonc-parser 3.3.1            | parse tsconfig       |   5.0 µs |    4.4 µs |   1.14× |
| jsonc-parser 3.3.1            | parseTree tsconfig   |   5.4 µs |    4.7 µs |   1.14× |
| jsonc-parser 3.3.1            | visit tsconfig       |   3.5 µs |    3.2 µs |   1.11× |
| jsonc-parser 3.3.1            | format tsconfig      |   3.3 µs |    3.1 µs |   1.04× |
| jsonc-parser 3.3.1            | parse large          |  2.14 ms |   1.84 ms |   1.17× |
| jsonc-parser 3.3.1            | parseTree large      |  2.06 ms |   1.69 ms |   1.22× |
| jsonc-parser 3.3.1            | visit large          |  1.63 ms |   1.40 ms |   1.17× |
| jsonc-parser 3.3.1            | format large         |  1.73 ms |   1.50 ms |   1.16× |
| comment-json 4.6.2            | parse tsconfig       |  18.2 µs |   14.2 µs |   1.28× |
| comment-json 4.6.2            | stringify tsconfig   |  13.1 µs |    9.3 µs |   1.40× |
| comment-json 4.6.2            | parse large          | 15.47 ms |   9.83 ms |   1.57× |
| comment-json 4.6.2            | stringify large      |  7.62 ms |   4.56 ms |   1.67× |
| jju 1.4.0                     | parse tsconfig       |   7.2 µs |    5.8 µs |   1.22× |
| jju 1.4.0                     | stringify tsconfig   |   6.5 µs |    4.1 µs |   1.61× |
| jju 1.4.0                     | parse test.json5     |   1.1 µs |    755 ns |   1.47× |
| jju 1.4.0                     | stringify test.json5 |   989 ns |    722 ns |   1.37× |
| jju 1.4.0                     | parse large          |  3.24 ms |   2.65 ms |   1.22× |
| jju 1.4.0                     | stringify large      |  3.19 ms |   1.99 ms |   1.61× |
| json5 2.2.3, against the root | parse tsconfig       |  26.8 µs |    3.1 µs |   8.72× |
| json5 2.2.3, against the root | stringify tsconfig   |   4.9 µs |    1.4 µs |   3.50× |
| json5 2.2.3, against the root | parse test.json5     |   2.4 µs |    251 ns |   9.40× |
| json5 2.2.3, against the root | stringify test.json5 |   286 ns |    205 ns |   1.39× |
| json5 2.2.3, against the root | parse large          | 14.36 ms |   1.73 ms |   8.30× |
| json5 2.2.3, against the root | stringify large      |  3.76 ms |  735.4 µs |   5.12× |
