// tinyaml must agree with js-yaml (JSON_SCHEMA) on every yaml-test-suite case,
// valid and invalid, and on mutated copies of them. Run `pnpm suite:fetch` first.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const run = (script: string, ...args: string[]) =>
  execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });

describe.skipIf(!existsSync(".cache/yaml-test-suite"))("yaml-test-suite", () => {
  it("matches js-yaml on every case", () => {
    expect(run("scripts/suite.ts", "-v")).toMatch(/ 0 differ$/m);
  });

  it("matches js-yaml on mutated inputs", () => {
    expect(run("scripts/fuzz.ts", "5000", "1")).toMatch(/ 0 disagree with js-yaml$/m);
  });
});
