---
title: Size and speed
description: Bundle size and parse and stringify timings next to ini.
---

Bundled with esbuild, minified ESM, then gzip level 9:

|                                                       | Minified | Gzip    |
| ----------------------------------------------------- | -------- | ------- |
| tinyini, the whole module                             | 3.55 KB  | 1.63 KB |
| tinyini, `parse` and `stringify`                      | 3.46 KB  | 1.58 KB |
| tinyini, `parse` only                                 | 2.08 KB  | 1.03 KB |
| ini, the whole module                                 | 3.46 KB  | 1.64 KB |
| ini, `parse` and `stringify`, as confbox imports them | 3.51 KB  | 1.66 KB |

ini is one CommonJS module, so a bundler keeps all of it and adds its CommonJS wrapper; its source alone minifies to 2.9 KB, 1.4 KB gzipped. tinyini's character loops take more code than ini's regular expressions, so the whole module is 0.1 KB larger minified. `parse` alone tree-shakes to 1.0 KB.

Median time per call on an Apple M4 with Node 26.13. `foo.ini` is ini's test fixture, `.gitconfig` is the one in `test/samples`, and the large file is 100 KB of generated sections with comments, quoted values, escapes, and arrays. Stringify uses `whitespace: true`, as confbox does.

| Operation               | ini           | tinyini      | Speedup |
| ----------------------- | ------------- | ------------ | ------- |
| Parse `foo.ini`         | 22.3 &micro;s | 8.4 &micro;s | 2.7x    |
| Parse `.gitconfig`      | 19.2 &micro;s | 7.2 &micro;s | 2.7x    |
| Parse a 100 KB file     | 1.41 ms       | 0.70 ms      | 2.0x    |
| Stringify `foo.ini`     | 10.3 &micro;s | 4.0 &micro;s | 2.6x    |
| Stringify `.gitconfig`  | 15.5 &micro;s | 7.5 &micro;s | 2.1x    |
| Stringify a 100 KB file | 1.27 ms       | 0.44 ms      | 2.9x    |

ini matches each line against three regular expressions and walks every value a character at a time to find comments. tinyini looks at character codes once per line, builds a value character by character only when it has a backslash, and only calls `JSON.parse` on a single-quoted value that could be JSON, since a throw costs more than the parse. On the large file, about a third of tinyini's time goes to splitting the lines and building the null-prototype objects, which both do.
