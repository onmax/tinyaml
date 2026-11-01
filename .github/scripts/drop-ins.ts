// Measures every drop-in next to the library it replaces and writes
// .github/drop-ins.json: gzip bytes, and median ms to parse and stringify each
// package's large benchmark file. The numbers come from each package's own
// scripts/size.ts and bench/index.ts, run with --json. automd.config.ts turns
// the file into the tables in the READMEs.
// Usage: node --no-warnings .github/scripts/drop-ins.ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import type { Comparison, DropIns } from "../../automd.config.ts";

// A script may log a build first, so the JSON starts at the first line that is
// only "{" or "[".
const run = (pkg: string, script: string) => {
  const out = execFileSync(process.execPath, ["--no-warnings", script, "--json"], {
    cwd: `packages/${pkg}`,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(out.slice(out.search(/^[[{]$/m)));
};

type Sizes = Record<string, { gzip: number }>;
type Rows = { operation: string; theirs: number; ours?: number; tinyaml?: number; library?: string }[];

const yamlSize: Sizes = run("tinyaml", "scripts/size.ts");
const yamlBench: Rows = run("tinyaml", "bench/index.ts");
const json5Size: Sizes = run("tinyjson5", "scripts/size.ts");
const json5Bench: Rows = run("tinyjson5", "bench/index.ts");
const iniSize: Sizes = run("tinyini", "scripts/size.ts");
const iniBench: Rows = run("tinyini", "bench/index.ts");

const timing = (rows: Rows, operation: string, library?: string) => {
  const r = rows.find((r) => r.operation === operation && (!library || r.library === library));
  return r && { theirs: r.theirs, ours: r.ours ?? r.tinyaml! };
};
const compare = (
  pkg: string,
  library: string,
  entry: string,
  sizes: Sizes,
  [theirs, ours]: [string, string],
  rows: Rows,
  benchLibrary?: string,
): Comparison => ({
  package: pkg,
  library,
  entry,
  gzip: { theirs: sizes[theirs]!.gzip, ours: sizes[ours]!.gzip },
  parse: timing(rows, "parse large", benchLibrary)!,
  // A library that only parses, such as strip-json-comments, has no stringify row.
  stringify: timing(rows, "stringify large", benchLibrary),
});
const yaml = (library: string, entry: string, size: string, bench: string) =>
  compare("tinyaml", library, entry, yamlSize, [size, entry], yamlBench, bench);

const data: DropIns = {
  machine: `${cpus()[0]!.model.trim()}, Node ${process.versions.node}`,
  dropIns: [
    yaml("js-yaml 4", "tinyaml/js-yaml", "js-yaml 4", "js-yaml"),
    yaml("js-yaml 5", "tinyaml/js-yaml-v5", "js-yaml 5", "js-yaml 5"),
    yaml("yaml", "tinyaml/yaml", "yaml", "yaml"),
    yaml("yamljs", "tinyaml/yamljs", "yamljs", "yamljs"),
    yaml("@std/yaml", "tinyaml/std", "@std/yaml", "@std/yaml"),
    // Each tinyjson5 subpath, by the names its size.ts and bench/index.ts use.
    ...(
      [
        ["json5 2.2.3", "tinyjson5/json5"],
        ["json5 1.0.2", "tinyjson5/json5-v1"],
        ["strip-json-comments 3", "tinyjson5/strip-json-comments"],
        ["strip-json-comments 2", "tinyjson5/strip-json-comments-v2"],
        ["strip-json-comments 5", "tinyjson5/strip-json-comments-v5"],
        ["jsonc-parser 3.3.1", "tinyjson5/jsonc-parser"],
        ["comment-json 4.6.2", "tinyjson5/comment-json"],
        ["jju 1.4.0", "tinyjson5/jju"],
      ] as const
    ).map(([library, entry]) =>
      compare("tinyjson5", library, entry, json5Size, [library, entry], json5Bench, library),
    ),
    compare(
      "tinyini",
      "ini 7.0.0",
      "tinyini",
      iniSize,
      ["ini 7.0.0", "tinyini/ini"],
      iniBench,
    ),
  ],
  root: yaml("yaml", "tinyaml", "yaml", "yaml (tinyaml root)"),
  roots: [
    compare(
      "tinyjson5",
      "json5 2.2.3",
      "tinyjson5",
      json5Size,
      ["json5 2.2.3", "tinyjson5"],
      json5Bench,
      "json5 2.2.3 (tinyjson5 root)",
    ),
  ],
};

writeFileSync(".github/drop-ins.json", `${JSON.stringify(data, null, 2)}\n`);
console.log(".github/drop-ins.json");
