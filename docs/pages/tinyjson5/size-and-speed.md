---
title: Size and speed
description: Bundle size and parse and stringify timings next to json5.
---

Bundled with esbuild, minified ESM, then gzip level 9:

|                                              | Minified | Gzip   |
| -------------------------------------------- | -------- | ------ |
| tinyjson5, `parse` and `stringify`           | 7.6 KB   | 3.0 KB |
| tinyjson5, `parse` only                      | 4.9 KB   | 2.0 KB |
| json5, `parse` and `stringify`               | 26.4 KB  | 7.5 KB |
| json5, `lib/parse.js` and `lib/stringify.js` | 27.2 KB  | 7.9 KB |
| json5, `lib/parse.js` only                   | 24.5 KB  | 6.9 KB |

json5's Unicode tables alone are 15.9 KB minified and 4.1 KB gzipped.

Median time per call on an Apple M4 with Node 26.13. The tsconfig is a 15-line file with comments and trailing commas, `test.json5` is json5's own `{a: 1, b: 2}`, and the large file is json5's `package-lock.json` as 215 KB of JSON5. Stringify uses a 2-space indent.

| Operation               | json5   | tinyjson5 | Speedup |
| ----------------------- | ------- | --------- | ------- |
| Parse tsconfig          | 13.0 µs | 1.5 µs    | 8.6x    |
| Parse `test.json5`      | 1.1 µs  | 125 ns    | 9.1x    |
| Parse a 215 KB file     | 7.37 ms | 0.92 ms   | 8.1x    |
| Stringify tsconfig      | 2.8 µs  | 899 ns    | 3.1x    |
| Stringify `test.json5`  | 161 ns  | 129 ns    | 1.3x    |
| Stringify a 215 KB file | 2.22 ms | 0.47 ms   | 4.8x    |

The parser reads character codes in one pass with an explicit stack and builds values directly, where json5 runs a lexer state machine that copies each character into a string. The stringifier only escapes strings that need it.
