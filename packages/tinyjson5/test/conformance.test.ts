// tinyjson5 must agree with json5 2.2.3 on the json5-tests corpus, on mutated
// inputs, and on random values. Run `pnpm corpus:fetch` first.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const run = (script: string, ...args: string[]) =>
  execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });

describe.skipIf(!existsSync(".cache/json5-tests"))("json5-tests corpus", () => {
  it("gets every case right and matches json5", () => {
    expect(run("scripts/corpus.ts")).toMatch(/^114 files, 114 correct, 114 match json5 2\.2\.3$/m);
  });

  it("matches json5 on mutated inputs, errors included", () => {
    expect(run("scripts/fuzz.ts", "10000", "1")).toMatch(
      / 0 value or accept\/reject differences, (\d+)\/\1 errors identical \(100\.000%\), 0 warning differences$/m,
    );
  });
});

describe("stringify", () => {
  it("matches json5 byte for byte on random values and round-trips them", () => {
    expect(run("scripts/fuzz-stringify.ts", "500", "1")).toMatch(
      /: 0 differ from json5 2\.2\.3; \d+ round trips, 0 fail$/m,
    );
  });
});
