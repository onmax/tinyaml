// Each original's own tests, copied unchanged into test/<suite>, with the
// tinyjson5 entry in its place. See scripts/own-tests.ts.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const failures = (suite: string) => {
  let out: string;
  try {
    out = execFileSync(process.execPath, ["scripts/own-tests.ts", suite], { encoding: "utf8" });
  } catch (error) {
    out = (error as { stdout: string }).stdout;
  }
  // The first target is the original; only the tinyjson5 entry's failures count.
  const ours = out.slice(out.search(/^tinyjson5/m));
  return [...ours.matchAll(/^ {2}FAIL (.*)$/gm)].map((m) => m[1]);
};

describe("own test suites", () => {
  it.skipIf(!existsSync(".cache/json5-main"))(
    "json5 main: all but the Unicode the engine doesn't know yet",
    () => {
      const unicode = Number(process.versions.unicode!.split(".")[0]) >= 18;
      expect(failures("json5-main")).toEqual(
        unicode ? [] : ["parse: parses property names with characters added in Unicode 18"],
      );
    },
  );

  for (const suite of [
    "json5-v1",
    "strip-json-comments",
    "strip-json-comments-v2",
    "strip-json-comments-v5",
    "jsonc-parser",
  ])
    it(`${suite}: all`, () => {
      expect(failures(suite)).toEqual([]);
    });
});
