---
title: Run the comparisons yourself
label: Reproduce
description: Download the upstream suites and rerun every size, speed, correctness and parity check.
---

```sh
cd packages/tinyaml                              # from the repository root
pnpm fixtures                                    # download the upstream suites and fixtures
pnpm compare                                     # every parity check, one line each, then the size table
DIST=1 pnpm compare                              # the same against the built dist, after pnpm build
pnpm size                                        # bundle sizes
pnpm bench                                       # speed
node --no-warnings scripts/correctness.ts        # the correctness table; add --failures for the case IDs
node --no-warnings scripts/charts.ts             # redraw the three charts in .github
```

[`scripts/fixtures.sh`](https://github.com/onmax/tiny/blob/main/packages/tinyaml/scripts/fixtures.sh) clones the suite and the libraries at the versions listed in [Switching](/tinyaml/guide/switching/). [`scripts/compare.sh`](https://github.com/onmax/tiny/blob/main/packages/tinyaml/scripts/compare.sh) runs every check: the suite against each library, mutation fuzzing of parse and stringify, and each library's own tests. The suite runs record the outcome of each case that differs, on both sides, and the own-test runs list the differences they expect. The parse fuzzers record each difference they expect in [`scripts/baselines/`](https://github.com/onmax/tiny/blob/main/packages/tinyaml/scripts/baselines), including errors both sides throw that differ in message, position or snippet, and other warnings, and the stringify fuzzers expect none. `pnpm compare` fails on a difference that isn't expected, on an expected one that's gone, and on a crash. Fuzz runs use 5,000 cases with seed 1, and some inputs get CRLF or lone CR line breaks. Set `N` for another count. The records cover the first 5,000 cases of seed 1, so a smaller `N` checks part of them, and a larger one finds differences they don't have: `N=40000 UPDATE=1 pnpm compare` records those, and `git diff scripts/baselines` shows them. Each script takes a count and a seed, and the parse fuzzers also take `--update`, as in `node --no-warnings scripts/fuzz.ts 40000 3 --update`.

The own-test runs one by one:

```sh
node scripts/root-suite.ts                                                 # tinyaml's root against the suite
sh scripts/js-yaml-tests/run.sh                                            # js-yaml 4's tests
sh scripts/js-yaml-v5-tests/run.sh                                         # js-yaml 5's tests
node scripts/yaml-upstream/run.ts                                          # yaml's tests
node scripts/yamljs-specs.ts                                               # yamljs's specs
node scripts/std-tests.ts                                                  # @std/yaml's tests
```

## In CI

CI builds the package, runs the format, lint and typecheck job, the tests on Node 22, 24 and 26, and the full `pnpm compare`, which it writes to the job summary. A last job runs the tests and `pnpm compare` again against the built `dist/` that npm ships. Any unexpected difference fails its job.
