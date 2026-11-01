// Runs ini 7.0.0's own tests against ini itself (to check the stand-ins) and
// against tinyini, and prints the counts.
// Usage: node scripts/ini-tests.ts
import { createRequire } from "node:module";
import * as tinyini from "../src/index.ts";
import { files, runTapFile } from "./tap.ts";

const ini = createRequire(import.meta.url)("ini") as typeof tinyini;
let failed = 0;
for (const [name, lib] of [
  ["ini 7.0.0", ini],
  ["tinyini", tinyini.default],
] as const) {
  let total = 0;
  let passed = 0;
  for (const file of files) {
    const results = runTapFile(file, lib);
    const bad = results.filter((r) => !r.ok);
    if (name === "tinyini") failed += bad.length;
    total += results.length;
    passed += results.length - bad.length;
    console.log(
      `${name.padEnd(10)} ${file.padEnd(25)} ${results.length - bad.length}/${results.length} pass`,
    );
    for (const r of bad) console.log(`  FAIL ${r.name}: ${r.error}`);
  }
  console.log(`${name.padEnd(10)} ${"all".padEnd(25)} ${passed}/${total} pass`);
}
console.log(`tinyini: ${failed} failing assertions`);
