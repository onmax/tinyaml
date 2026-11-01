// tinyaml/yaml against the yaml package on mutated yaml-test-suite inputs.
// The script checks each difference against the ones
// scripts/baselines/yaml-fuzz.json records and exits non-zero on any other,
// on a recorded one that's gone, and on a crash. Run `pnpm fixtures` first.
import { describe, expect, it } from "vite-plus/test";
import { missing, run } from "../fixtures.ts";

describe.skipIf(missing(".cache/yaml-test-suite"))("yaml-test-suite", () => {
  // The first 3,000 of the 5,000 inputs the baseline records.
  it("parses mutated inputs like yaml, apart from the recorded differences", () => {
    expect(run("scripts/yaml-fuzz.ts", "3000", "1")).toMatch(/ 0 new, 0 changed, 0 gone$/m);
  });
});
