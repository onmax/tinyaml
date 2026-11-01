// json5 2.2.3's own parse, stringify, and errors tests, unchanged, with
// tinyjson5 in place of json5. See scripts/tap.ts for the stand-ins.
import { describe, expect, it } from "vite-plus/test";
import * as tinyjson5 from "../src/json5/index.ts";
import { runTapFile } from "../scripts/tap.ts";

describe("json5 2.2.3 test suite", () => {
  for (const file of ["parse.js", "stringify.js", "errors.js"])
    it(file, () => {
      const results = runTapFile(`test/json5/${file}`, tinyjson5);
      expect(results.length).toBeGreaterThan(40);
      expect(results.filter((r) => !r.ok)).toEqual([]);
    });
});
