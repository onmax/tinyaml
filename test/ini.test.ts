// ini 7.0.0's own tests and snapshots, unchanged, with tinyini in place of
// ini. See scripts/tap.ts for the stand-ins.
import { describe, expect, it } from "vite-plus/test";
import tinyini from "../src/index.ts";
import { files, runTapFile } from "../scripts/tap.ts";

describe("ini 7.0.0 test suite", () => {
  for (const file of files)
    it(file, () => {
      const results = runTapFile(file, tinyini);
      expect(results.length).toBeGreaterThan(3);
      expect(results.filter((r) => !r.ok)).toEqual([]);
    });
});
