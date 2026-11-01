// Bundles each entry the way a consumer's build would, with esbuild
// (minified ESM), and prints minified and gzip -9 sizes in KiB (1,024
// bytes), tinyini's next to the library it replaces. tinyini's entries are
// the built dist/ that npm ships, built first when src/ is newer. --json
// prints bytes.
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

// Each entry, then the library it replaces, which it must not outgrow.
const entries: [string, string, string?][] = [
  ["tinyini", "index"],
  ["tinyini/ini", "ini", "ini 7.0.0"],
  ["  ini 7.0.0", "export { default } from 'ini'"],
  ["tinyini/ini-v2", "ini-v2", "ini 2.0.0"],
  ["  ini 2.0.0", "export { default } from 'ini-v2'"],
  ["tinyini/ini-v1", "ini-v1", "ini 1.3.8"],
  ["  ini 1.3.8", "export { default } from 'ini-v1'"],
];

// Gzip bytes each entry may reach, about 30 over its size when last set:
// less than a mode's dead branches weigh, so losing the folding fails. Raise
// one on purpose, and say why in the commit.
const BUDGET: Record<string, number> = {
  tinyini: 1700,
  "tinyini/ini": 1700,
  "tinyini/ini-v2": 1460,
  "tinyini/ini-v1": 1480,
};

// Code that only one mode has, as it reads once minified. Each must show up
// in its own mode's entries, so a marker that goes stale fails too, and in no
// other.
const MARKERS: Record<keyof typeof MODES, (string | RegExp)[]> = {
  // The root's error for an object in an array.
  root: ["inside an array"],
  // ini 4.1's options, normalized onto the caller's object.
  ini: ["bracketedArray"],
  // ini 1.x to 4.0's placeholders for escaped dots, and ini 2.0.0's
  // null-prototype objects.
  v2: ["LITERAL", "Object.create(null)"],
  // ini 1.x's placeholders, and its forEach that skips holes in arrays.
  v1: ["LITERAL", ".forEach("],
};
const modeOf = (entry: string) =>
  Object.keys(MODES).find((mode) => entry in MODES[mode as keyof typeof MODES]) as
    | keyof typeof MODES
    | undefined;

build();

const json: Record<string, { min: number; gzip: number }> = {};
const kib = (bytes: number) => `${(bytes / 1024).toFixed(2)} KiB`;
const problems: string[] = [];
const checks: [string, string][] = [];
for (const [name, source, original] of entries) {
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
      `${name.padEnd(22)} ${kib(size.min).padStart(10)} min ${kib(size.gzip).padStart(10)} gzip`,
    );
  if (original) checks.push([name, original]);
  if (!built) continue;
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
for (const [name, original] of checks) {
  const [ours, theirs] = [json[name], json[original]];
  if (ours && theirs && ours.gzip > theirs.gzip)
    problems.push(`${name} is ${ours.gzip} B gzip, bigger than ${original} at ${theirs.gzip} B`);
}
if (process.argv.includes("--json")) console.log(JSON.stringify(json, null, 2));
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
