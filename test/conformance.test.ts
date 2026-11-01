// tinyaml's root parser against the yaml-test-suite's own answers: every
// case scored, none left out, and the scores the correctness chart shows.
// Each script checks its totals and exits non-zero on a wrong case or a
// crash. Run `pnpm fixtures` first.
import { describe, expect, it } from "vite-plus/test";
import { missing, run } from "./fixtures.ts";

describe.skipIf(missing(".cache/yaml-test-suite"))("yaml-test-suite", () => {
  it("reads every valid case right and rejects every invalid one", () => {
    expect(run("scripts/root-suite.ts")).toMatch(
      /^373 right, 0 wrong of 279 valid and 94 invalid cases, 0 crashes;/m,
    );
  });

  it("scores 279/279 valid and 94/94 invalid in the correctness chart", () => {
    expect(run("scripts/correctness.ts")).toMatch(
      /^tinyaml +valid 279\/279 100\.0% +invalid 94\/94 100\.0%$/m,
    );
  });
});
