// Each original's own tests and snapshots, unchanged, with its tinyini entry
// in place of it. See scripts/tap.ts for the stand-ins.
import { describe, expect, it } from "vite-plus/test";
import { engine, ENGINES } from "../scripts/shared.ts";
import { files, runTapFile } from "../scripts/tap.ts";

for (const name of ENGINES) {
  const { label, ours, tests } = await engine(name);
  describe(`${label} test suite`, () => {
    for (const file of files(tests))
      it(file, () => {
        const results = runTapFile(file, ours.default, tests);
        expect(results.length).toBeGreaterThan(3);
        expect(results.filter((r) => !r.ok)).toEqual([]);
      });
  });
}
