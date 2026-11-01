// Bundles each entry the way a consumer's build would, with esbuild
// (minified ESM), and prints minified and gzip -9 sizes in KiB (1,024
// bytes), each tinyjson5 entry next to the library it replaces. Gzip sizes
// depend on the zlib Node is built with: the numbers in the README and the
// budgets come from the official Node builds. tinyjson5's entries are the
// built dist/ that npm ships, built first when src/ is newer. --json prints
// bytes.
//
// It fails the run when an entry doesn't build, outgrows its BUDGET, is
// bigger than the library it replaces, or still holds code of a mode other
// than its own (src/core/mode.ts): the sign that the bundler stopped folding
// the mode's constants.
// Usage: node scripts/size.ts [--json]
import { buildSync } from "esbuild";
import { gzipSync } from "node:zlib";
import { MODES } from "../vite.config.ts";
import { build, ENTRIES } from "./dist.ts";

// Each of our entries, then the library it replaces, indented. The root
// replaces nothing, so it's measured against json5 2.2.3.
const entries: [string, string][] = [
  ["tinyjson5", "index"],
  ["tinyjson5/json5", "json5"],
  ["  json5 2.2.3", "export { default } from 'json5'"],
];

// Gzip bytes each entry may reach, about 100 over its size when last set:
// less than a mode's dead branches weigh, so losing the folding fails. Raise
// one on purpose, and say why in the commit.
const BUDGET: Record<string, number> = {
  tinyjson5: 3470,
  "tinyjson5/json5": 3260,
};

// Code that only one mode has, as it reads once minified. Each must show up
// in its own mode's entries, so a marker that goes stale fails too, and in
// no other.
const MARKERS: Record<keyof typeof MODES, (string | RegExp)[]> = {
  // json5 3's BigInt error, and the strict JSONC whitespace test.
  lean: ["serialize a BigInt"],
  // json5 2.2.3's warning about U+2028 and U+2029 in strings.
  json5: ["in strings is not valid ECMAScript"],
};
const modeOf = (entry: string) =>
  Object.keys(MODES).find((mode) => entry in MODES[mode as keyof typeof MODES]) as
    | keyof typeof MODES
    | undefined;

build();

const json: Record<string, { min: number; gzip: number }> = {};
const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
const problems: string[] = [];
let ours: { name: string; gzip: number } | undefined;
for (const [name, source] of entries) {
  const built = ENTRIES[source];
  let code: Uint8Array;
  try {
    code = buildSync({
      stdin: {
        contents: built ? `export * from ${JSON.stringify(built)}` : source,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      minify: true,
      format: "esm",
      platform: "neutral",
      mainFields: ["module", "main"],
      logLevel: "silent",
      write: false,
    }).outputFiles[0]!.contents;
  } catch (error) {
    problems.push(`${name.trim()} does not build:\n${(error as Error).message}`);
    continue;
  }
  const size = { min: code.length, gzip: gzipSync(code, { level: 9 }).length };
  json[name.trim()] = size;
  if (!process.argv.includes("--json"))
    console.log(
      `${name.padEnd(32)} ${kib(size.min).padStart(10)} min ${kib(size.gzip).padStart(9)} gzip`,
    );
  if (!built) {
    if (ours && ours.gzip > size.gzip)
      problems.push(
        `${ours.name} is ${ours.gzip} B gzip, bigger than ${name.trim()}'s ${size.gzip} B`,
      );
    continue;
  }
  ours = { name, gzip: size.gzip };
  if (size.gzip > BUDGET[name]!)
    problems.push(`${name} is ${size.gzip} B gzip, over its budget of ${BUDGET[name]} B`);
  const own = modeOf(source);
  if (!own) problems.push(`${name} is in no mode's build in vite.config.ts`);
  const text = new TextDecoder().decode(code);
  for (const [mode, markers] of Object.entries(MARKERS))
    for (const marker of markers) {
      const found = typeof marker === "string" ? text.includes(marker) : marker.test(text);
      if (found !== (mode === own))
        problems.push(`${name} ${found ? "holds" : "lacks"} ${mode} code: ${String(marker)}`);
    }
}
if (process.argv.includes("--json")) console.log(JSON.stringify(json, null, 2));
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
