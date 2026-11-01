// Runs an original's own tests against the original itself (to check the
// stand-ins) and against the tinyini entry that replaces it, and prints the
// counts. With no engine, runs every engine's.
// Usage: node scripts/ini-tests.ts [engine]
import { engine, ENGINES } from "./shared.ts";
import { files, runTapFile } from "./tap.ts";

let failed = 0;
for (const name of process.argv[2] ? [process.argv[2]] : ENGINES) {
  const { label, theirs, ours, tests } = await engine(name);
  for (const [who, lib] of [
    [label, theirs],
    [`tinyini/${name}`, ours.default],
  ] as const) {
    let total = 0;
    let passed = 0;
    for (const file of files(tests)) {
      const results = runTapFile(file, lib, tests);
      const bad = results.filter((r) => !r.ok);
      if (lib !== theirs) failed += bad.length;
      total += results.length;
      passed += results.length - bad.length;
      console.log(
        `${who.padEnd(16)} ${file.padEnd(25)} ${results.length - bad.length}/${results.length} pass`,
      );
      for (const r of bad) console.log(`  FAIL ${r.name}: ${r.error}`);
    }
    console.log(`${who.padEnd(16)} ${"all".padEnd(25)} ${passed}/${total} pass`);
  }
}
console.log(`tinyini: ${failed} failing assertions`);
