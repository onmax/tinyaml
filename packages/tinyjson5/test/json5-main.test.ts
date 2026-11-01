// The tests on json5's unreleased main branch, unchanged, with the root in
// place of json5. See scripts/json5-main-tests.ts.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

describe.skipIf(!existsSync(".cache/json5-main"))("json5 main test suite", () => {
  it("passes but for the Unicode the engine doesn't know yet", () => {
    const out = execFileSync(process.execPath, ["scripts/json5-main-tests.ts"], {
      encoding: "utf8",
    });
    const failures = [...out.matchAll(/^ {2}FAIL (.*)$/gm)].map((m) => m[1]);
    const unicode = Number(process.versions.unicode!.split(".")[0]) >= 18;
    expect(failures).toEqual(
      unicode ? [] : ["parse: parses property names with characters added in Unicode 18"],
    );
  });
});
