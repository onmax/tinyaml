---
title: Run the checks yourself
label: Develop
description: The scripts that rerun the tests, the fuzzers, the size and the benchmarks.
---

Run these from `packages/tinyjson5` in the [repository](https://github.com/onmax/tiny).

tinyjson5 uses pnpm 12, Node 24 or later, and [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests and the build. [tsrs](https://github.com/oxc-project/tsrs) does the typecheck. Each entry is built on its own, with `src/core/mode/<mode>.ts` in place of `src/core/mode.ts`, so it carries no other entry's code; `pnpm size` fails if one does.

```sh
pnpm install
pnpm ready                       # format, build, lint, typecheck, and test
pnpm corpus:fetch                # json5-tests, into .cache
pnpm json5:fetch                 # json5 2.2.3, into .cache, for the large benchmark input
pnpm json5:main:fetch            # json5's main branch, into .cache, the root's reference
pnpm json5-tests                 # json5 2.2.3's own tests against tinyjson5/json5
pnpm own-tests <suite>           # an original's own tests: json5-main, json5-v1, strip-json-comments(-v2, -v5), jsonc-parser, comment-json, jju
pnpm corpus [engine]             # every json5-tests case
pnpm fuzz 200000 3 [engine]      # mutated inputs: json5, json5-v1, root, root-bigint, jsonc
pnpm fuzz:stringify 10000 1 [engine]
pnpm fuzz:strip 100000 1 v3      # strip-json-comments v2, v3 or v5
pnpm fuzz:jsonc 20000 1          # jsonc-parser's whole API
pnpm fuzz:comment-json 20000 1
pnpm fuzz:jju 20000 1
pnpm unicode                     # identifier characters that differ from json5's tables
pnpm size                        # bundle sizes next to each original
pnpm bench                       # speed next to each original
```
