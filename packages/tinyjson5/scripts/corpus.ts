// Runs every json5-tests case through tinyjson5 and json5 2.2.3. Files ending
// in .json or .json5 must parse, .js and .txt must throw; tinyjson5 must also
// return json5's value, or throw json5's error, for every file.
// Usage: node scripts/corpus.ts   (after `pnpm corpus:fetch`)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { parse } from "../src/index.ts";
import { attempt, corpus, same } from "./shared.ts";

const json5 = createRequire(import.meta.url)("json5") as { parse: typeof parse };
let correct = 0;
let matches = 0;
const files = corpus();
for (const { file, valid } of files) {
  const text = readFileSync(file, "utf8");
  const ours = attempt(() => parse(text));
  const theirs = attempt(() => json5.parse(text));
  const rightKind = ours.ok === valid;
  const sameResult =
    ours.ok && theirs.ok
      ? same(ours.value, theirs.value)
      : !ours.ok && !theirs.ok && ours.error === theirs.error;
  // A few .json cases hold comments, which JSON.parse rejects; compare the rest.
  const native = attempt(() => JSON.parse(text));
  if (file.endsWith(".json") && ours.ok && native.ok && !same(ours.value, native.value))
    console.log(`differs from JSON.parse: ${file}`);
  if (rightKind) correct++;
  else console.log(`wrong outcome: ${file} (${ours.ok ? "parsed" : ours.error})`);
  if (sameResult) matches++;
  else console.log(`differs from json5: ${file}`);
}
console.log(`${files.length} files, ${correct} correct, ${matches} match json5 2.2.3`);
