// Bundles each entry the way a consumer's build would, with esbuild
// (minified ESM), and prints minified and gzip -9 sizes in KiB (1,024
// bytes), tinyaml's next to the library it replaces. Gzip sizes depend on
// the zlib Node is built with: the numbers in the README and the budgets come
// from the official Node builds, and a Node linked to another zlib, such as
// Homebrew's, prints about 1% less. tinyaml's entries are
// the built dist/ that npm ships, built first when src/ is newer. --json
// prints bytes.
//
// It fails the run when an entry doesn't build, outgrows its BUDGET, or
// still holds parser code of a mode other than its own (src/core/mode.ts):
// the sign that the bundler stopped folding the mode's constants.
// Usage: node scripts/size.ts [--json]
import { buildSync } from "esbuild";
import { gzipSync } from "node:zlib";
import { MODES } from "../vite.config.ts";
import { build, ENTRIES } from "./dist.ts";

const entries: [string, string][] = [
  ["tinyaml", "index"],
  ["tinyaml/js-yaml", "js-yaml"],
  ["  js-yaml 4", "export * from 'js-yaml'"],
  ["tinyaml/js-yaml-v5", "js-yaml-v5"],
  ["  js-yaml 5", "export { load, loadAll, dump, Schema, YAMLException } from 'js-yaml5'"],
  ["tinyaml/yaml", "yaml"],
  ["  yaml", "export { parse, stringify } from 'yaml'"],
  ["tinyaml/yamljs", "yamljs"],
  ["  yamljs", "export { default } from 'yamljs'"],
  ["tinyaml/std", "std"],
  ["  @std/yaml", "export { parse, parseAll, stringify } from '@std/yaml'"],
];

// Gzip bytes each entry may reach, about 100 over its size when last set:
// less than a mode's dead branches weigh, so losing the folding fails. Raise
// one on purpose, and say why in the commit.
const BUDGET: Record<string, number> = {
  tinyaml: 8415,
  "tinyaml/js-yaml": 12155,
  "tinyaml/js-yaml-v5": 16400,
  "tinyaml/yaml": 16830,
  "tinyaml/yamljs": 8815,
  "tinyaml/std": 11225,
};

// Code that only one mode's parser has, as it reads once minified. Each must
// show up in its own mode's entries, so a marker that goes stale fails
// too, and in no other.
const MARKERS: Record<keyof typeof MODES, (string | RegExp)[]> = {
  // yaml rejects a verbatim tag with a space in it.
  spec: [/\/\\s\/\.test\([\w$]+\.tag\)/],
  // js-yaml 4's checks for blank lines, after a tab and in a block scalar.
  lenient: ["/^[\\t ]*$/", "(?:\\n|$)/"],
  // js-yaml 5's engine hooks, which no other engine sets.
  js5: [".alias?.(", ".bom", ".allKeys"],
};
const modeOf = (entry: string) =>
  Object.keys(MODES).find((mode) => entry in MODES[mode as keyof typeof MODES]) as
    | keyof typeof MODES
    | undefined;

build();

const json: Record<string, { min: number; gzip: number }> = {};
const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
const problems: string[] = [];
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
      `${name.padEnd(20)} ${kib(size.min).padStart(10)} min ${kib(size.gzip).padStart(9)} gzip`,
    );
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
        problems.push(
          `${name} ${found ? "holds" : "lacks"} ${mode} parser code: ${String(marker)}`,
        );
    }
}
if (process.argv.includes("--json")) console.log(JSON.stringify(json, null, 2));
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
