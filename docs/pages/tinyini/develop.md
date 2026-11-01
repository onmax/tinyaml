---
title: Run the checks yourself
label: Develop
description: The scripts that rerun the tests, the fuzzers, the size and the benchmarks.
---

Run these from `packages/tinyini` in the [repository](https://github.com/onmax/tiny). tinyini uses pnpm 12, Node 26, and [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests, and the build. [tsrs](https://github.com/oxc-project/tsrs) does the typecheck.

```sh
pnpm install
pnpm ready                   # format, build, lint, typecheck, and test
pnpm ini-tests               # ini's own tests against ini and tinyini
pnpm fuzz 1000000 1          # 1,000,000 mutated inputs with seed 1
pnpm fuzz:stringify 10000 1  # 10,000 random values through every option
pnpm size                    # bundle sizes next to ini
pnpm bench                   # speed next to ini
```
