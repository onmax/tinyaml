// tinyaml/std against @std/yaml 1.3.0 on the yaml-test-suite, on mutated
// copies of its cases, on random values, and on std's own tests. Each script
// checks its own list of known differences, std bugs tinyaml/std doesn't
// copy, and exits non-zero on anything else. Run `pnpm fixtures` first for
// the suite.
import { describe, expect, it } from "vite-plus/test";
import { missing, run } from "../fixtures.ts";

describe.skipIf(missing(".cache/yaml-test-suite"))("yaml-test-suite", () => {
  it("parses every case std parses right to the same value", () => {
    expect(run("scripts/std-suite.ts")).toMatch(/ 24 parse where std throws, 31 differ$/m);
  });

  // The first 3,000 of the 5,000 inputs whose differences
  // scripts/baselines/std-fuzz.json records.
  it("matches std on mutated inputs, apart from the recorded differences", () => {
    expect(run("scripts/std-fuzz.ts", "3000", "1")).toMatch(/ 0 new, 0 changed, 0 gone$/m);
  });
});

describe("stringify", () => {
  it("matches std on random values and options", () => {
    expect(run("scripts/std-stringify-fuzz.ts", "3000", "2")).toMatch(
      / 0 differ from @std\/yaml$/m,
    );
  });
});

describe("@std/yaml's own tests", () => {
  it("pass, but the three out of scope", () => {
    const out = run("scripts/std-tests.ts", "-v");
    expect(out).toMatch(/^92\/95 of @std\/yaml's tests pass, 3 fail$/m);
    // Two test unstable_parse and unstable_stringify, which tinyaml/std
    // doesn't include; one runs Deno in a subprocess.
    const failed = [...out.matchAll(/^(\S+_test\.ts > .*)$/gm)].map((match) => match[1]);
    expect(failed).toEqual([
      "parse_test.ts > parse() handles __proto__",
      "parse_test.ts > unstableParse() handles custom types",
      "stringify_test.ts > unstableStringify() handles custom types",
    ]);
  });
});
