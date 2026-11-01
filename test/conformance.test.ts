// tinyini must agree with ini 7.0.0 on mutated inputs and on random values.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";

const run = (script: string, ...args: string[]) =>
  execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });

describe("differential", () => {
  it("parses mutated inputs as ini does, throws included", () => {
    expect(run("scripts/fuzz.ts", "10000", "1")).toMatch(
      / calls \(\d+ throw in ini\): 0 differences$/m,
    );
  });

  it("stringifies random values byte for byte as ini does, and round-trips them", () => {
    expect(run("scripts/fuzz-stringify.ts", "100", "1")).toMatch(
      /: 0 differ from ini 7\.0\.0; \d+ round trips, 0 differ$/m,
    );
  });
});
