// Each original's own tests and snapshots, unchanged, with its tinyini entry
// in place of it. See scripts/tap.ts for the stand-ins.
import { describe, expect, it } from "vite-plus/test";
import { engine, ENGINES } from "../scripts/shared.ts";
import { files, runTapFile } from "../scripts/tap.ts";

for (const name of ENGINES) {
  const { label, theirs, ours, tests, fresh } = await engine(name);
  describe(`${label} test suite`, () => {
    for (const dir of tests)
      for (const file of files(dir))
        it(`${dir.slice("test/suites/".length)}/${file}`, () => {
          // The original passes too, or the stand-ins are wrong.
          for (const results of [
            runTapFile(file, theirs, dir, fresh),
            runTapFile(file, ours.default, dir),
          ]) {
            expect(results.length).toBeGreaterThan(3);
            expect(results.filter((r) => !r.ok)).toEqual([]);
          }
        });
  });
}
