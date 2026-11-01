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

// Each of our entries, by its name in dist/, then the npm module it
// replaces, indented. Each is measured whole, every export kept.
const entries: [string, string][] = [
  ["tinyjson5", "index"],
  ["tinyjson5/json5", "json5"],
  ["  json5 2.2.3", "npm:json5"],
  ["tinyjson5/json5-v1", "json5-v1"],
  ["  json5 1.0.2", "npm:json5-v1"],
  ["tinyjson5/strip-json-comments", "strip-json-comments"],
  ["  strip-json-comments 3", "npm:strip-json-comments"],
  ["tinyjson5/strip-json-comments-v2", "strip-json-comments-v2"],
  ["  strip-json-comments 2", "npm:strip-json-comments-v2"],
  ["tinyjson5/strip-json-comments-v5", "strip-json-comments-v5"],
  ["  strip-json-comments 5", "npm:strip-json-comments-v5"],
];

// Gzip bytes each entry may reach, about 100 over its size when last set:
// less than a mode's dead branches weigh, so losing the folding fails. Raise
// one on purpose, and say why in the commit.
const BUDGET: Record<string, number> = {
  tinyjson5: 3470,
  "tinyjson5/json5": 3260,
  "tinyjson5/json5-v1": 3300,
  "tinyjson5/strip-json-comments": 800,
  "tinyjson5/strip-json-comments-v2": 800,
  "tinyjson5/strip-json-comments-v5": 800,
};

// Code that only one mode has, as it reads once minified. Each must show up
// in its own mode's entries, so a marker that goes stale fails too, and in
// no other.
const MARKERS: Record<keyof typeof MODES, (string | RegExp)[]> = {
  // json5 3's BigInt error, and the strict JSONC whitespace test.
  lean: ["serialize a BigInt"],
  // json5 2.2.3's warning about U+2028 and U+2029 in strings.
  json5: ["in strings is not valid ECMAScript"],
  // json5 1.0.2's loop on a hex number at the end of input.
  "json5-v1": ["Invalid string length"],
  // strip-json-comments 3 is what the other two differ from.
  "strip-json-comments": [],
  // strip-json-comments 2's one-backslash escape test.
  "strip-json-comments-v2": [/charCodeAt\([\w$]+-2\)/],
  // strip-json-comments 5's blanking, which keeps only ASCII whitespace.
  "strip-json-comments-v5": ["[^ \\t\\r\\n]"],
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
  const built = source.startsWith("npm:") ? undefined : ENTRIES[source];
  let code: Uint8Array;
  try {
    code = buildSync({
      stdin: {
        // The namespace keeps every export, the default one included.
        contents: `export * as entry from ${JSON.stringify(built ?? source.slice(4))}`,
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
