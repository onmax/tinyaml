// Median time per call over several rounds, tinyini against ini 7.0.0. The
// small inputs are ini's foo.ini test fixture and the .gitconfig in
// test/samples; the large one is about 100 KB of generated sections, comments,
// quoted values, and arrays. Stringify passes `whitespace: true`, as confbox does.
import { readFileSync } from "node:fs";
import * as tinyini from "../src/ini/index.ts";
import { ini } from "../scripts/shared.ts";

const foo = readFileSync("test/suites/ini/fixtures/foo.ini", "utf8");
const gitconfig = readFileSync("test/samples/gitconfig", "utf8");
let large = "; generated for the benchmark\nroot = true\n\n";
for (let i = 0; large.length < 100 * 1024; i++) {
  large += `[service.s${i}]\n; service ${i}\n`;
  large += `name = service-${i}\nport = ${3000 + i}\nenabled = ${i % 2 === 0}\n`;
  large += `description = "A service; with \\"quotes\\""\npath = /srv/app/${i} # where it lives\n`;
  large += `tags[] = web\ntags[] = v${i}\nescaped = a\\;b\\#c\n\n`;
}

const inputs = { "foo.ini": foo, ".gitconfig": gitconfig, large };
const values = Object.fromEntries(
  Object.entries(inputs).map(([name, text]) => [name, ini.parse(text) as unknown]),
);

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

function median(fn: () => unknown): number {
  const rounds = Array.from({ length: 7 }, () => time(fn)).sort((a, b) => a - b);
  return rounds[3]!;
}

function format(ms: number): string {
  if (ms < 0.001) return `${(ms * 1e6).toFixed(0)} ns`;
  return ms < 1 ? `${(ms * 1000).toFixed(1)} \u00b5s` : `${ms.toFixed(2)} ms`;
}

// --json prints [{ operation, theirs, ours }] in ms instead, for the root charts.
const asJson = process.argv.includes("--json");
const rows: { operation: string; theirs: number; ours: number }[] = [];
const log = (line: string) => asJson || console.log(line);
log(`large input: ${(large.length / 1024).toFixed(0)} KB`);
log("| Operation | ini | tinyini | Speedup |\n| --- | --- | --- | --- |");
for (const [name, text] of Object.entries(inputs)) {
  const a = median(() => ini.parse(text));
  const b = median(() => tinyini.parse(text));
  rows.push({ operation: `parse ${name}`, theirs: a, ours: b });
  log(`| parse ${name} | ${format(a)} | ${format(b)} | ${(a / b).toFixed(1)}x |`);
}
for (const [name, value] of Object.entries(values)) {
  const a = median(() => ini.stringify(value, { whitespace: true }));
  const b = median(() => tinyini.stringify(value, { whitespace: true }));
  rows.push({ operation: `stringify ${name}`, theirs: a, ours: b });
  log(`| stringify ${name} | ${format(a)} | ${format(b)} | ${(a / b).toFixed(1)}x |`);
}
if (asJson) console.log(JSON.stringify(rows, null, 2));
