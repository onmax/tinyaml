// Each entry must agree with the library it replaces on the json5-tests
// corpus, on mutated inputs, and on random values (scripts/engines.ts). Run
// `pnpm corpus:fetch`, and for the root `pnpm json5:main:fetch`, first.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const run = (script: string, ...args: string[]) =>
  execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });
const corpus = existsSync(".cache/json5-tests");
const main = existsSync(".cache/json5-main");

const ENGINES: { name: string; library: string; ready: boolean; stringify: boolean }[] = [
  { name: "json5", library: "json5 2.2.3", ready: corpus, stringify: true },
  { name: "json5-v1", library: "json5 1.0.2", ready: corpus, stringify: true },
  { name: "root", library: "json5 main", ready: corpus && main, stringify: true },
  { name: "root-bigint", library: "json5 main", ready: corpus && main, stringify: false },
  { name: "jsonc", library: "jsonc-parser", ready: corpus, stringify: false },
];

for (const { name, library, ready, stringify } of ENGINES)
  describe.skipIf(!ready)(`${name} against ${library}`, () => {
    if (!name.startsWith("root-") && name !== "jsonc")
      it("gets every corpus case right and matches", () => {
        expect(run("scripts/corpus.ts", name)).toMatch(/^114 files, 114 correct, 114 match /m);
      });

    it("matches on mutated inputs, errors included", () => {
      expect(run("scripts/fuzz.ts", "10000", "1", name)).toMatch(
        / 0 value or accept\/reject differences, (\d+)\/\1 errors identical \(100\.000%\), 0 warning differences/m,
      );
    });

    if (stringify)
      it("stringifies random values byte for byte and round-trips them", () => {
        expect(run("scripts/fuzz-stringify.ts", "500", "1", name)).toMatch(
          /: 0 differ from .*; \d+ round trips, 0 fail$/m,
        );
      });
  });

describe("strip-json-comments", () => {
  for (const version of ["v2", "v3", "v5"])
    it(`${version} matches on mutated inputs with every option`, () => {
      expect(run("scripts/fuzz-strip.ts", "5000", "1", version)).toMatch(/: 0 differ$/m);
    });
});
