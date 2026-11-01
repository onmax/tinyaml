// tinyaml/yamljs against yamljs 0.3.0 on the yaml-test-suite, on fuzzed
// config-like YAML, on fuzzed values to stringify, and on yamljs's own specs.
// Each script checks what it expects and exits non-zero on anything else.
// Run `pnpm fixtures` first.
import { describe, expect, it } from "vite-plus/test";
import { missing, run } from "../fixtures.ts";

describe.skipIf(missing(".cache/yaml-test-suite"))("yaml-test-suite", () => {
  it("never loads a case worse than yamljs", () => {
    expect(run("scripts/yamljs-suite.ts")).toMatch(/ 0 tinyaml bug,/);
  });
});

describe("fuzzing", () => {
  // The first 3,000 of the 5,000 cases whose differences
  // scripts/baselines/yamljs-fuzz.json records.
  it("parses like yamljs, apart from the recorded yamljs bugs", () => {
    const out = run("scripts/yamljs-fuzz.ts", "3000", "1");
    expect(out).toMatch(/ 0 stricter, 0 differ, 0 crash,/);
    expect(out).toMatch(/ 0 new, 0 changed, 0 gone$/m);
  });

  it("stringifies byte for byte like yamljs", () => {
    expect(run("scripts/yamljs-dump-fuzz.ts", "20000", "7")).toMatch(/: 0 mismatches,/);
  });
});

describe.skipIf(missing(".cache/yamljs-src"))("yamljs's specs", () => {
  it("pass", () => {
    expect(run("scripts/yamljs-specs.ts")).toMatch(/^tinyaml\/yamljs: 103\/103 specs pass$/m);
  });
});
