// Each original's own tests, copied unchanged into test/<suite>, with the
// tinyjson5 entry in its place (scripts/own-tests.ts). The entry must fail
// exactly the tests the original fails here, which for jju are two that
// compare it with eval() and fail under today's Node.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

// The failing tests of the original and of the tinyjson5 entry, in order.
const failures = (suite: string) => {
  let out: string;
  try {
    out = execFileSync(process.execPath, ["scripts/own-tests.ts", suite], {
      encoding: "utf8",
      maxBuffer: 64 << 20,
    });
  } catch (error) {
    out = (error as { stdout: string }).stdout;
  }
  const at = out.search(/^tinyjson5/m);
  const list = (text: string) => [...text.matchAll(/^ {2}FAIL (.*)$/gm)].map((m) => m[1]);
  return { theirs: list(out.slice(0, at)), ours: list(out.slice(at)) };
};

describe("own test suites", () => {
  it.skipIf(!existsSync(".cache/json5-main"))(
    "json5 main: all but the Unicode the engine doesn't know yet",
    () => {
      const unicode = Number(process.versions.unicode!.split(".")[0]) >= 18;
      const { theirs, ours } = failures("json5-main");
      expect(theirs).toEqual([]);
      expect(ours).toEqual(
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
    "comment-json",
    "jju",
  ])
    it(`${suite}: what the original passes`, () => {
      const { theirs, ours } = failures(suite);
      expect(ours).toEqual(theirs);
      expect(theirs.length).toBe(suite === "jju" ? 2 : 0);
    });
});
