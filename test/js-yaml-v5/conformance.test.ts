// Whatever js-yaml 5 loads from a yaml-test-suite case, tinyaml/js-yaml-v5
// must load to the same value, and dump must match byte for byte. Each
// script checks its own list of known differences and exits non-zero on
// anything else. Run `pnpm fixtures` first.
import { describe, expect, it } from "vite-plus/test";
import { missing, run } from "../fixtures.ts";

describe.skipIf(missing(".cache/yaml-test-suite"))("yaml-test-suite", () => {
  it("loads every case js-yaml 5 loads to the same value", () => {
    expect(run("scripts/js-yaml-v5-suite.ts")).toMatch(
      /402\/402 cases match js-yaml 5, 0 load where js-yaml 5 throws, 0 differ/,
    );
  });
  // The first 3,000 of the 5,000 inputs scripts/baselines/js-yaml-v5-fuzz.json
  // records.
  it("loads mutated inputs like js-yaml 5, apart from the recorded differences", () => {
    expect(run("scripts/js-yaml-v5-fuzz.ts", "3000", "1")).toMatch(/ 0 new, 0 changed, 0 gone$/m);
  });
});

describe("dump", () => {
  it("matches js-yaml 5 on random values and options", () => {
    expect(run("scripts/js-yaml-v5-dump-fuzz.ts", "3000", "7")).toMatch(/: 0 disagreements,/m);
  });
});
