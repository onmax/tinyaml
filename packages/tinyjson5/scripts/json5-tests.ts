// Runs json5 2.2.3's parse, stringify, and errors tests against json5 itself
// (to check the stand-ins) and against tinyjson5, and prints the counts.
// Usage: node scripts/json5-tests.ts [-v]
import { createRequire } from "node:module";
import * as tinyjson5 from "../src/index.ts";
import { runTapFile } from "./tap.ts";

const json5 = createRequire(import.meta.url)("json5") as typeof tinyjson5;
const files = ["parse.js", "stringify.js", "errors.js"];
let failed = 0;
for (const [name, lib] of [
  ["json5 2.2.3", json5],
  ["tinyjson5", tinyjson5],
] as const) {
  for (const file of files) {
    const results = runTapFile(`test/json5/${file}`, lib);
    const bad = results.filter((r) => !r.ok);
    if (name === "tinyjson5") failed += bad.length;
    console.log(
      `${name.padEnd(12)} ${file.padEnd(13)} ${results.length - bad.length}/${results.length} pass`,
    );
    for (const r of bad) console.log(`  FAIL ${r.name}: ${r.error}`);
  }
}
console.log(`tinyjson5: ${failed} failing assertions`);
