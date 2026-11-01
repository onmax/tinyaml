// Each entry must agree with the library it replaces on mutated inputs and
// on random values.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";
import { ENGINES } from "../scripts/shared.ts";

const run = (script: string, ...args: string[]) =>
  execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });

describe.each(ENGINES)("tinyini/%s against its original", (name) => {
  it("parses mutated inputs as the original does, throws included", () => {
    expect(run("scripts/fuzz.ts", "10000", "1", name)).toMatch(
      / calls \(\d+ throw in .+\): 0 differences$/m,
    );
  });

  it("stringifies random values byte for byte as the original does, and round-trips them", () => {
    expect(run("scripts/fuzz-stringify.ts", "100", "1", name)).toMatch(
      /: 0 differ from .+; \d+ round trips, 0 differ$/m,
    );
  });
});
