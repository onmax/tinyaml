// Median time per call over seven rounds: each tinyaml entry against the
// library it replaces, both with default options, on a small frontmatter
// block and on a 268 KiB file (js-yaml's package-lock.json written as YAML).
// It measures the built dist/, what npm ships, building it first if it's
// stale, through scripts/dist-loader.ts; --source measures src/ instead.
// The two sides' rounds interleave, and which runs first alternates from
// round to round, so neither gains from going first.
// Usage: node bench/index.ts [--json] [--source]
import { readFileSync } from "node:fs";
import * as std from "@std/yaml";
import * as jsYaml from "js-yaml";
import * as jsYaml5 from "js-yaml5";
import * as yaml from "yaml";
import yamljs from "yamljs";
import { build } from "../scripts/dist.ts";

const source = process.argv.includes("--source");
if (!source) {
  build();
  // Imports of src/ below resolve to dist/ from here on.
  await import("../scripts/dist-loader.ts");
}
const tinyaml = await import("../src/index.ts");
const tinyJsYaml = await import("../src/js-yaml/index.ts");
const tinyJsYaml5 = await import("../src/js-yaml-v5/index.ts");
const tinyStd = await import("../src/std/index.ts");
const tinyYaml = await import("../src/yaml/index.ts");
const tinyYamljs = (await import("../src/yamljs/index.ts")).default;

const frontmatter = `title: Getting started
description: Install the SDK and send your first message
navigation: true
tags: [setup, guide]
links:
  - label: Docs
    to: /docs
`;
const large = jsYaml.dump(JSON.parse(readFileSync(".cache/js-yaml4/package-lock.json", "utf8")), {
  lineWidth: -1,
});
const inputs = { frontmatter, large };

type Codec = { parse: (text: string) => unknown; stringify: (value: unknown) => string };
// Called through the library object: yamljs's methods use `this`.
const codec = (lib: Codec): Codec => ({
  parse: (text) => lib.parse(text),
  stringify: (value) => lib.stringify(value),
});
const pairs: [string, Codec, Codec][] = [
  [
    "js-yaml",
    { parse: jsYaml.load, stringify: jsYaml.dump },
    { parse: tinyJsYaml.load, stringify: tinyJsYaml.dump },
  ],
  [
    "js-yaml 5",
    { parse: jsYaml5.load, stringify: jsYaml5.dump },
    { parse: tinyJsYaml5.load, stringify: tinyJsYaml5.dump },
  ],
  ["yaml", codec(yaml), codec(tinyYaml)],
  ["yamljs", codec(yamljs), codec(tinyYamljs)],
  ["@std/yaml", codec(std), codec(tinyStd)],
];
// tinyaml's own API, against the library closest to its rules.
pairs.push(["yaml (tinyaml root)", { parse: yaml.parse, stringify: yaml.stringify }, tinyaml]);

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
// is even, `tinyaml` first when it's odd. The medians.
function medians(theirs: () => unknown, tinyaml: () => unknown) {
  const times: { theirs: number[]; tinyaml: number[] } = { theirs: [], tinyaml: [] };
  for (let round = 0; round < 7; round++)
    for (const side of round % 2
      ? (["tinyaml", "theirs"] as const)
      : (["theirs", "tinyaml"] as const))
      times[side].push(time(side === "theirs" ? theirs : tinyaml));
  const median = (list: number[]) => list.sort((a, b) => a - b)[3]!;
  return { theirs: median(times.theirs), tinyaml: median(times.tinyaml) };
}

const format = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(1)} µs` : `${ms.toFixed(2)} ms`);

const rows: { library: string; operation: string; theirs: number; tinyaml: number }[] = [];
for (const [library, theirs, ours] of pairs)
  for (const [name, text] of Object.entries(inputs)) {
    const value = theirs.parse(text);
    rows.push({
      library,
      operation: `parse ${name}`,
      ...medians(
        () => theirs.parse(text),
        () => ours.parse(text),
      ),
    });
    rows.push({
      library,
      operation: `stringify ${name}`,
      ...medians(
        () => theirs.stringify(value),
        () => ours.stringify(value),
      ),
    });
  }

if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else {
  console.log(`tinyaml from ${source ? "src/" : "the built dist/"}\n`);
  console.log(
    "| Library | Operation | Library time | tinyaml | Speedup |\n| --- | --- | --: | --: | --: |",
  );
  for (const r of rows)
    console.log(
      `| ${r.library} | ${r.operation} | ${format(r.theirs)} | ${format(r.tinyaml)} | ${(r.theirs / r.tinyaml).toFixed(1)}x |`,
    );
}
