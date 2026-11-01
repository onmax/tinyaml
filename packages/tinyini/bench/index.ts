// Median time per call over seven rounds: each tinyini entry against the
// library it replaces, and tinyini's own API against ini 7.0.0 and against
// the tinyini/ini* entries. The ini
// inputs are ini's foo.ini test fixture, the .gitconfig in test/samples,
// and about 100 KB of generated sections, comments, quoted values, escapes
// and arrays; stringify passes `whitespace: true`, as confbox does. The
// one-ini inputs are the .editorconfig in test/samples and about 100 KB of
// generated EditorConfig sections; "parse" is parse_to_uint32array on the
// file's bytes, which is what the editorconfig package calls, and
// "parse_to_json" the AST.
// It measures the built dist/, what npm ships, building it first if it's
// stale, through scripts/dist-loader.ts; --source measures src/ instead.
// The two sides' rounds interleave, and which runs first alternates from
// round to round, so neither gains from going first.
// Usage: node bench/index.ts [--json] [--source]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "../scripts/dist.ts";

const source = process.argv.includes("--source");
if (!source) {
  build();
  // Imports of src/ below resolve to dist/ from here on.
  await import("../scripts/dist-loader.ts");
}
const require = createRequire(import.meta.url);
const root = await import("../src/index.ts");
const ini = await import("../src/ini/index.ts");
const iniV2 = await import("../src/ini-v2/index.ts");
const iniV1 = await import("../src/ini-v1/index.ts");
const oneIni = await import("../src/one-ini/index.ts");
const oneIniV01 = await import("../src/one-ini-v0.1/index.ts");

let large = "; generated for the benchmark\nroot = true\n\n";
for (let i = 0; large.length < 100 * 1024; i++) {
  large += `[service.s${i}]\n; service ${i}\n`;
  large += `name = service-${i}\nport = ${3000 + i}\nenabled = ${i % 2 === 0}\n`;
  large += `description = "A service; with \\"quotes\\""\npath = /srv/app/${i} # where it lives\n`;
  large += `tags[] = web\ntags[] = v${i}\nescaped = a;b\\#c\n\n`;
}
let editorconfig = "# generated for the benchmark\nroot = true\n\n";
for (let i = 0; editorconfig.length < 100 * 1024; i++) {
  editorconfig += `[packages/p${i}/**.{js,ts,json}]\n# package ${i}\n`;
  editorconfig += `indent_style = ${i % 2 ? "tab" : "space"}\nindent_size = ${2 + (i % 3)}\n`;
  editorconfig += `end_of_line = lf\ncharset = utf-8\ntrim_trailing_whitespace = true\n\n`;
}
const iniInputs = {
  "foo.ini": readFileSync("test/suites/ini-7.0.0/fixtures/foo.ini", "utf8"),
  ".gitconfig": readFileSync("test/samples/gitconfig", "utf8"),
  large,
};
const editorconfigInputs = {
  ".editorconfig": readFileSync("test/samples/editorconfig", "utf8"),
  large: editorconfig,
};

type Ops = Record<string, (text: string, value: unknown) => unknown>;
const codec = (lib: {
  parse: (text: string) => unknown;
  stringify: (value: any, options: object) => string;
}): Ops => ({
  parse: (text) => lib.parse(text),
  stringify: (_, value) => lib.stringify(value, { whitespace: true }),
});
const wasm = (lib: {
  parse_to_uint32array: (bytes: Uint8Array) => unknown;
  parse_to_json: (text: string) => unknown;
}): Ops => ({
  parse: (text) => lib.parse_to_uint32array(Buffer.from(text)),
  parse_to_json: (text) => lib.parse_to_json(text),
});
const pairs: [string, Record<string, string>, Ops, Ops][] = [
  ["ini 7.0.0", iniInputs, codec(require("ini")), codec(ini)],
  ["ini 2.0.0", iniInputs, codec(require("ini-v2")), codec(iniV2)],
  ["ini 1.3.8", iniInputs, codec(require("ini-v1")), codec(iniV1)],
  // tinyini's own API, against the ini it takes its rules from.
  ["ini 7.0.0 (tinyini root)", iniInputs, codec(require("ini")), codec(root as never)],
  // The root against the compatibility entries, which carry ini's legacy.
  ["tinyini/ini (tinyini root)", iniInputs, codec(ini), codec(root as never)],
  ["tinyini/ini-v2 (tinyini root)", iniInputs, codec(iniV2), codec(root as never)],
  ["tinyini/ini-v1 (tinyini root)", iniInputs, codec(iniV1), codec(root as never)],
  ["@one-ini/wasm 0.2.1", editorconfigInputs, wasm(require("@one-ini/wasm")), wasm(oneIni)],
  ["@one-ini/wasm 0.1.1", editorconfigInputs, wasm(require("one-ini-v0.1")), wasm(oneIniV01)],
];

function time(fn: () => unknown): number {
  let iterations = 1;
  for (;;) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const elapsed = performance.now() - start;
    if (elapsed > 50) return elapsed / iterations;
    iterations *= 2;
  }
}

// Seven rounds of each, interleaved: round r times `theirs` first when r
// is even, `ours` first when it's odd. The medians.
function medians(theirs: () => unknown, ours: () => unknown) {
  const times: { theirs: number[]; ours: number[] } = { theirs: [], ours: [] };
  for (let round = 0; round < 7; round++)
    for (const side of round % 2 ? (["ours", "theirs"] as const) : (["theirs", "ours"] as const))
      times[side].push(time(side === "theirs" ? theirs : ours));
  const median = (list: number[]) => list.sort((a, b) => a - b)[3]!;
  return { theirs: median(times.theirs), ours: median(times.ours) };
}

const format = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(1)} µs` : `${ms.toFixed(2)} ms`);

const rows: { library: string; operation: string; theirs: number; ours: number }[] = [];
for (const [library, inputs, theirs, ours] of pairs)
  for (const op of Object.keys(theirs))
    for (const [name, text] of Object.entries(inputs)) {
      // The value to stringify is what ini 7 reads from the input.
      const value = op === "stringify" ? require("ini").parse(text) : undefined;
      rows.push({
        library,
        operation: `${op} ${name}`,
        ...medians(
          () => theirs[op]!(text, value),
          () => ours[op]!(text, value),
        ),
      });
    }

if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else {
  console.log(`tinyini from ${source ? "src/" : "the built dist/"}\n`);
  console.log(
    "| Library | Operation | Library time | tinyini | Speedup |\n| --- | --- | --: | --: | --: |",
  );
  for (const r of rows)
    console.log(
      `| ${r.library} | ${r.operation} | ${format(r.theirs)} | ${format(r.ours)} | ${(r.theirs / r.ours).toFixed(1)}x |`,
    );
}
