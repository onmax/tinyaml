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

// Each of our entries, by its name in dist/, with the npm module it
// replaces. Each is measured whole, every export kept, and must come out no
// bigger than its original. The root replaces nothing, so it's held to
// json5 2.2.3, the library its users switch from.
const entries: [string, string, string, string, ("node" | "neutral")?][] = [
  ["tinyjson5", "index", "json5 2.2.3", "json5"],
  ["tinyjson5/json5", "json5", "json5 2.2.3", "json5"],
  ["tinyjson5/json5-v1", "json5-v1", "json5 1.0.2", "json5-v1"],
  [
    "tinyjson5/strip-json-comments",
    "strip-json-comments",
    "strip-json-comments 3",
    "strip-json-comments",
  ],
  [
    "tinyjson5/strip-json-comments-v2",
    "strip-json-comments-v2",
    "strip-json-comments 2",
    "strip-json-comments-v2",
  ],
  [
    "tinyjson5/strip-json-comments-v5",
    "strip-json-comments-v5",
    "strip-json-comments 5",
    "strip-json-comments-v5",
  ],
  ["tinyjson5/jsonc-parser", "jsonc-parser", "jsonc-parser 3.3.1", "jsonc-parser"],
  ["tinyjson5/comment-json", "comment-json", "comment-json 4.6.2", "comment-json"],
  // jju needs Node's fs and assert, which stay out of its bundle.
  ["tinyjson5/jju", "jju", "jju 1.4.0", "jju", "node"],
];

// Gzip bytes each entry may reach, about 100 over its size when last set:
// less than a mode's dead branches weigh, so losing the folding fails. Raise
// one on purpose, and say why in the commit.
const BUDGET: Record<string, number> = {
  tinyjson5: 3570,
  "tinyjson5/json5": 3340,
  "tinyjson5/json5-v1": 3390,
  "tinyjson5/strip-json-comments": 570,
  "tinyjson5/strip-json-comments-v2": 560,
  "tinyjson5/strip-json-comments-v5": 680,
  "tinyjson5/jsonc-parser": 6140,
  "tinyjson5/comment-json": 17770,
  "tinyjson5/jju": 9740,
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
  // jsonc-parser's own scanner and messages.
  "jsonc-parser": ["<unknown ParseErrorCode>"],
  // comment-json's message for a comment position it doesn't know.
  "comment-json": ["Unsupported comment position"],
  // jju's check that its tokens don't overlap.
  jju: ["internal error, token overlap"],
};
const modeOf = (entry: string) =>
  Object.keys(MODES).find((mode) => entry in MODES[mode as keyof typeof MODES]) as
    | keyof typeof MODES
    | undefined;

build();

const json: Record<string, { min: number; gzip: number }> = {};
const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
const problems: string[] = [];

// Minified and gzipped bytes of a module, every export kept, or undefined
// when it doesn't build. Each size is printed and recorded once.
function measure(
  name: string,
  module: string,
  platform: "node" | "neutral" = "neutral",
): { min: number; gzip: number } | undefined {
  if (json[name]) return json[name];
  let code: Uint8Array;
  try {
    code = buildSync({
      stdin: {
        // The namespace keeps every export, the default one included.
        contents: `export * as entry from ${JSON.stringify(module)}`,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      minify: true,
      format: "esm",
      platform,
      mainFields: ["module", "main"],
      logLevel: "silent",
      write: false,
    }).outputFiles[0]!.contents;
  } catch (error) {
    problems.push(`${name} does not build:\n${(error as Error).message}`);
    return undefined;
  }
  texts[name] = new TextDecoder().decode(code);
  json[name] = { min: code.length, gzip: gzipSync(code, { level: 9 }).length };
  if (!process.argv.includes("--json"))
    console.log(
      `${name.padEnd(34)} ${kib(code.length).padStart(10)} min ${kib(json[name].gzip).padStart(9)} gzip`,
    );
  return json[name];
}
const texts: Record<string, string> = {};

for (const [name, entry, library, module, platform] of entries) {
  const size = measure(name, ENTRIES[entry]!);
  const original = measure(library, module, platform);
  if (!size) continue;
  if (original && size.gzip > original.gzip)
    problems.push(`${name} is ${size.gzip} B gzip, bigger than ${library}'s ${original.gzip} B`);
  if (size.gzip > BUDGET[name]!)
    problems.push(`${name} is ${size.gzip} B gzip, over its budget of ${BUDGET[name]} B`);
  const own = modeOf(entry);
  if (!own) problems.push(`${name} is in no mode's build in vite.config.ts`);
  for (const [mode, markers] of Object.entries(MARKERS))
    for (const marker of markers) {
      const text = texts[name]!;
      const found = typeof marker === "string" ? text.includes(marker) : marker.test(text);
      if (found !== (mode === own))
        problems.push(`${name} ${found ? "holds" : "lacks"} ${mode} code: ${String(marker)}`);
    }
}
if (process.argv.includes("--json")) console.log(JSON.stringify(json, null, 2));
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
