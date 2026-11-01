// Draws the root README's chart from fresh measurements: every drop-in next to
// the library it replaces, as times smaller (gzip) and times faster (parsing
// each package's large benchmark file). The numbers come from each package's
// own scripts/size.ts and bench/index.ts, run with --json. The chart is a
// Markdown table that comark-charts turns into an SVG, written to .github/assets/.
// Usage: node --no-warnings .github/scripts/charts.ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseMarkdown } from "comark";
import charts from "comark-charts";

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

const times = (theirs: number, ours: number) => (theirs / ours).toFixed(1);
const yamlParse = (library: string) => {
  const r = yamlBench.find((r) => r.library === library && r.operation === "parse large")!;
  return times(r.theirs, r.tinyaml!);
};
const parseLarge = (rows: Rows) => {
  const r = rows.find((r) => r.operation === "parse large")!;
  return times(r.theirs, r.ours!);
};

// [label, times smaller, times faster]
const rows: [string, string, string][] = [
  ["js-yaml 4", times(yamlSize["js-yaml 4"]!.gzip, yamlSize["tinyaml/js-yaml"]!.gzip), yamlParse("js-yaml")],
  ["js-yaml 5", times(yamlSize["js-yaml 5"]!.gzip, yamlSize["tinyaml/js-yaml-v5"]!.gzip), yamlParse("js-yaml 5")],
  ["yaml", times(yamlSize["yaml"]!.gzip, yamlSize["tinyaml/yaml"]!.gzip), yamlParse("yaml")],
  ["yamljs", times(yamlSize["yamljs"]!.gzip, yamlSize["tinyaml/yamljs"]!.gzip), yamlParse("yamljs")],
  ["@std/yaml", times(yamlSize["@std/yaml"]!.gzip, yamlSize["tinyaml/std"]!.gzip), yamlParse("@std/yaml")],
  [
    "json5",
    times(json5Size["json5 (parse + stringify)"]!.gzip, json5Size["tinyjson5 (parse + stringify)"]!.gzip),
    parseLarge(json5Bench),
  ],
  ["ini", times(iniSize["ini (whole module)"]!.gzip, iniSize["tinyini (whole module)"]!.gzip), parseLarge(iniBench)],
];

const table = [
  "| replaces | times smaller, gzip | times faster, parsing |",
  "| --- | --: | --: |",
  ...rows.map((r) => `| ${r.join(" | ")} |`),
];
const { nodes, meta } = await parseMarkdown(
  `::chart{horizontal labels title="Each drop-in next to the library it replaces"}\n${table.join("\n")}\n::\n`,
  { plugins: [charts()] },
);
if (meta.issues.length) throw new Error(meta.issues.join("\n"));
const json = JSON.stringify(nodes);
const svg = JSON.parse(`"${json.slice(json.indexOf("<svg"), json.indexOf("</svg>") + 6)}"`);
writeFileSync(".github/assets/drop-ins.svg", `${svg}\n`);
console.log(table.join("\n"));
console.log(".github/assets/drop-ins.svg");
