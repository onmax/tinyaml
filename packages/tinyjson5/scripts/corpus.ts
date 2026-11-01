// Runs every json5-tests case through one entry and the library it replaces
// (scripts/engines.ts). Files ending in .json or .json5 must parse, .js and
// .txt must throw; the entry must also return the library's value, or throw
// its error, for every file.
// Usage: node scripts/corpus.ts [engine]   (after `pnpm corpus:fetch`)
import { readFileSync } from "node:fs";
import { engineFromArgs } from "./engines.ts";
import { attempt, corpus, same } from "./shared.ts";

const engine = await engineFromArgs();
const parse = engine.o.parse;
const json5 = engine.t;
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
  else console.log(`differs from ${engine.library}: ${file}`);
}
console.log(`${files.length} files, ${correct} correct, ${matches} match ${engine.library}`);
