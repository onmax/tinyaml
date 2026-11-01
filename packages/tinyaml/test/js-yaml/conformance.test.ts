// Whatever js-yaml 4 loads from a yaml-test-suite case, or from a mutated
// copy of one, tinyaml must load to the same value. Each script checks its
// own list of known differences and exits non-zero on anything else, and on
// a known one that's gone. Run
// `pnpm fixtures` first.
import { describe, expect, it } from "vite-plus/test";
import { missing, run } from "../fixtures.ts";

describe.skipIf(missing(".cache/yaml-test-suite"))("yaml-test-suite", () => {
  it("loads every case js-yaml 4 loads to the same value, but H7J7 and M5C3", () => {
    const out = run("scripts/suite.ts", "-v");
    expect(out).toMatch(/ 2 differ$/m);
    expect(out).toMatch(/^H7J7$/m);
    expect(out).toMatch(/^M5C3$/m);
  });

  // The first 3,000 of the 5,000 inputs whose differences
  // scripts/baselines/fuzz.json records.
  it("matches js-yaml 4 on mutated inputs, but the recorded differences", () => {
    expect(run("scripts/fuzz.ts", "3000", "1")).toMatch(/ 0 new, 0 changed, 0 gone$/m);
  });
});
