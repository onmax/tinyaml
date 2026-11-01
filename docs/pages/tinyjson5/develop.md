---
title: Run the checks yourself
label: Develop
description: The scripts that rerun the tests, the fuzzers, the size and the benchmarks.
---

Run these from `packages/tinyjson5` in the [repository](https://github.com/onmax/tiny). tinyjson5 uses pnpm 12, Node 26, and [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests, and the build. [tsrs](https://github.com/oxc-project/tsrs) does the typecheck.

```sh
pnpm install
pnpm ready                  # format, build, lint, typecheck, and test
pnpm corpus:fetch           # json5-tests, into .cache, so the conformance tests run
pnpm json5:fetch            # json5 2.2.3, into .cache, for the large benchmark input
pnpm json5-tests            # json5's own tests against json5 and tinyjson5
pnpm corpus                 # every json5-tests case against json5
pnpm fuzz 200000 3          # 200,000 mutated inputs with seed 3
pnpm fuzz:stringify 10000 1 # 10,000 random values through every option
pnpm unicode                # identifier characters that differ from json5's tables
pnpm size                   # bundle sizes next to json5
pnpm bench                  # speed next to json5
```
