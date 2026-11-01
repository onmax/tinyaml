// Writes the root README's drop-in table from fresh measurements: every drop-in
// next to the library it replaces, with both gzip sizes and how many times
// faster it parses each package's large benchmark file. The numbers come from
// each package's own scripts/size.ts and bench/index.ts, run with --json. The
// table goes between the drop-ins markers in README.md.
// Usage: node --no-warnings .github/scripts/drop-ins.ts
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

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

const kib = (bytes: number) => (bytes / 1024).toFixed(1);
const size = (sizes: Sizes, theirs: string, ours: string) =>
  `${kib(sizes[theirs]!.gzip)} → ${kib(sizes[ours]!.gzip)} KiB`;
const faster = (theirs: number, ours: number) => `${(theirs / ours).toFixed(1)}×`;
const yamlParse = (library: string) => {
  const r = yamlBench.find((r) => r.library === library && r.operation === "parse large")!;
  return faster(r.theirs, r.tinyaml!);
};
const parseLarge = (rows: Rows) => {
  const r = rows.find((r) => r.operation === "parse large")!;
  return faster(r.theirs, r.ours!);
};

// [you use, switch to, size, parsing]
const rows: [string, string, string, string][] = [
  ["js-yaml 4", "tinyaml/js-yaml", size(yamlSize, "js-yaml 4", "tinyaml/js-yaml"), yamlParse("js-yaml")],
  ["js-yaml 5", "tinyaml/js-yaml-v5", size(yamlSize, "js-yaml 5", "tinyaml/js-yaml-v5"), yamlParse("js-yaml 5")],
  ["yaml", "tinyaml/yaml", size(yamlSize, "yaml", "tinyaml/yaml"), yamlParse("yaml")],
  ["yamljs", "tinyaml/yamljs", size(yamlSize, "yamljs", "tinyaml/yamljs"), yamlParse("yamljs")],
  ["@std/yaml", "tinyaml/std", size(yamlSize, "@std/yaml", "tinyaml/std"), yamlParse("@std/yaml")],
  [
    "json5 2.2.3",
    "tinyjson5",
    size(json5Size, "json5 (parse + stringify)", "tinyjson5 (parse + stringify)"),
    parseLarge(json5Bench),
  ],
  ["ini 7.0.0", "tinyini", size(iniSize, "ini (whole module)", "tinyini (whole module)"), parseLarge(iniBench)],
];

const table = [
  "| You use | Switch to | Size, gzip | Parses |",
  "| --- | --- | --: | --: |",
  ...rows.map(([lib, pkg, gzip, parse]) => `| ${lib} | \`${pkg}\` | ${gzip} | ${parse} faster |`),
].join("\n");

const start = "<!-- drop-ins:start -->";
const end = "<!-- drop-ins:end -->";
const readme = readFileSync("README.md", "utf8");
const from = readme.indexOf(start);
const to = readme.indexOf(end);
if (from < 0 || to < from) throw new Error(`README.md needs ${start} and ${end}`);
writeFileSync("README.md", `${readme.slice(0, from + start.length)}\n${table}\n${readme.slice(to)}`);
console.log(table);
