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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { MODES } from "../vite.config.ts";
import { build, ENTRIES } from "./dist.ts";

// Each entry, with its named exports and its default export, then the
// library it replaces, which it must not outgrow.
const entries: [string, string, string?][] = [
  ["tinyini", "index"],
  ["tinyini/ini", "ini", "ini 7.0.0"],
  ["  ini 7.0.0", "export { default } from 'ini'"],
  ["tinyini/ini-v2", "ini-v2", "ini 2.0.0"],
  ["  ini 2.0.0", "export { default } from 'ini-v2'"],
  ["tinyini/ini-v1", "ini-v1", "ini 1.3.8"],
  ["  ini 1.3.8", "export { default } from 'ini-v1'"],
  ["tinyini/one-ini", "one-ini", "@one-ini/wasm 0.2.1"],
  ["  @one-ini/wasm 0.2.1", "export * from '@one-ini/wasm'"],
  ["tinyini/one-ini-v0.1", "one-ini-v0.1", "@one-ini/wasm 0.1.1"],
  ["  @one-ini/wasm 0.1.1", "export * from 'one-ini-v0.1'"],
];

// @one-ini/wasm loads its .wasm file at run time, which a bundle can't
// inline, so its size is the bundled JavaScript plus the .wasm file, each
// gzipped.
const WASM: Record<string, string> = {
  "@one-ini/wasm 0.2.1": "@one-ini/wasm/one_ini_bg.wasm",
  "@one-ini/wasm 0.1.1": "one-ini-v0.1/one_ini_bg.wasm",
};
const require = createRequire(import.meta.url);

// Gzip bytes each entry may reach, about 30 over its size when last set:
// less than a mode's dead branches weigh, so losing the folding fails. Raise
// one on purpose, and say why in the commit.
const BUDGET: Record<string, number> = {
  tinyini: 1370,
  "tinyini/ini": 1590,
  "tinyini/ini-v2": 1420,
  "tinyini/ini-v1": 1430,
  "tinyini/one-ini": 1800,
  "tinyini/one-ini-v0.1": 1800,
};

// Code that some modes have, as it reads once minified, and the modes whose
// entries must hold it. Every other entry must not, and an entry that lacks
// its own mode's code fails too, so a marker that goes stale shows up. Each
// flag the core reads (legacy, plain, emptyValues) decides at least one
// marker, so an entry whose bundle stops folding any of them fails here.
type Mode = keyof typeof MODES;
const MARKERS: [string | RegExp, Mode[]][] = [
  // The root's error for an object in an array.
  ["inside an array", ["root"]],
  // ini 4.1's options, normalized onto the caller's object.
  ["bracketedArray", ["ini"]],
  // ini 1.x to 4.0's placeholders for escaped dots.
  ["LITERAL", ["v2", "v1"]],
  // ini 1.x's forEach, which skips holes in arrays.
  [".forEach(", ["v1"]],
  // The version each one-ini entry reports.
  ['"0.2.1"', ["one"]],
  ['"0.1.1"', ["one01"]],
];
// What each flag the core reads changes, run on the measured bundle itself,
// so that an entry behaving as another mode on either side of a flag fails
// even when no marker shows it: the modes a probe applies to, the modes it
// must hold for, and the probe.
const PROBES: [string, Mode[], Mode[], (lib: any) => boolean][] = [
  // ini 1.x to 4.0 read a line of whitespace as the key "".
  ["legacy", ["ini", "v2", "v1"], ["v2", "v1"], (lib) => "" in lib.decode(" ")],
  // ini 1.x returns plain objects.
  [
    "plain",
    ["ini", "v2", "v1"],
    ["v1"],
    (lib) => Object.getPrototypeOf(lib.decode("a=1")) === Object.prototype,
  ],
  // one-ini 0.2 reads `a=` as an empty value, where 0.1 stops parsing.
  ["emptyValues", ["one", "one01"], ["one"], (lib) => !!lib.parse_to_json("a=").body],
];

const modeOf = (entry: string) =>
  Object.keys(MODES).find((mode) => entry in MODES[mode as Mode]) as Mode | undefined;

build();

/** Every export of a built entry, its default export included when it has one. */
const whole = (file: string) =>
  `export * from ${JSON.stringify(file)};` +
  (/\bas default\b/.test(readFileSync(file, "utf8"))
    ? ` export { default } from ${JSON.stringify(file)};`
    : "");

// Imports of one function, and code that must then be left out: the
// stringifier, by an option only it reads, or the parser, by its line split.
const SHAKEN: [string, string, string][] = [
  ["index", "parse", "whitespace"],
  ["index", "stringify", "/[\\r\\n]+/"],
  ["ini", "parse", "whitespace"],
  ["ini", "stringify", "/[\\r\\n]+/"],
  ["ini", "safe", "/[\\r\\n]+/"],
  ["ini-v2", "parse", "whitespace"],
  ["ini-v1", "parse", "whitespace"],
  ["one-ini", "parse_to_uint32array", "Pair"],
];

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
        contents: built ? whole(built) : source,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      minify: true,
      format: "esm",
      platform: "neutral",
      mainFields: ["module", "main"],
      // The WASM glue reads its .wasm file with fs.
      external: ["fs", "path", "util"],
      logLevel: "silent",
      write: false,
    }).outputFiles[0]!.contents;
  } catch (error) {
    problems.push(`${name.trim()} does not build:\n${(error as Error).message}`);
    continue;
  }
  const size = { min: code.length, gzip: gzipSync(code, { level: 9 }).length };
  const wasm = WASM[name.trim()];
  if (wasm) {
    const bytes = readFileSync(require.resolve(wasm));
    size.min += bytes.length;
    size.gzip += gzipSync(bytes, { level: 9 }).length;
  }
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
  const file = resolve(`.cache/size/${source}.mjs`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  const lib = await import(`${pathToFileURL(file).href}?${Date.now()}`);
  for (const [flag, applies, holds, probe] of PROBES)
    if (own && applies.includes(own) && probe(lib) !== holds.includes(own))
      problems.push(`${name} behaves as if ${flag} were ${!holds.includes(own)}`);
  for (const [marker, modes] of MARKERS) {
    const found = typeof marker === "string" ? text.includes(marker) : marker.test(text);
    if (own && found !== modes.includes(own))
      problems.push(
        `${name} ${found ? "holds" : "lacks"} ${modes.join(" and ")} code: ${String(marker)}`,
      );
  }
}
for (const [entry, name, left] of SHAKEN) {
  const code = buildSync({
    stdin: {
      contents: `export { ${name} } from ${JSON.stringify(ENTRIES[entry])}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    write: false,
  }).outputFiles[0]!.text;
  if (code.includes(left))
    problems.push(
      `importing ${name} alone from ${entry} keeps ${left}: tree shaking stopped working`,
    );
}
for (const [name, original] of checks) {
  const [ours, theirs] = [json[name], json[original]];
  if (ours && theirs && ours.gzip > theirs.gzip)
    problems.push(`${name} is ${ours.gzip} B gzip, bigger than ${original} at ${theirs.gzip} B`);
}
// tinyini's own API leaves out everything kept for compatibility, so it must
// be the smallest entry.
for (const name of Object.keys(BUDGET))
  if (name !== "tinyini" && json[name] && json.tinyini && json[name].gzip <= json.tinyini.gzip)
    problems.push(
      `${name} is ${json[name].gzip} B gzip, no bigger than the root at ${json.tinyini.gzip} B`,
    );
if (process.argv.includes("--json")) console.log(JSON.stringify(json, null, 2));
for (const problem of problems) console.error(problem);
if (problems.length) process.exitCode = 1;
