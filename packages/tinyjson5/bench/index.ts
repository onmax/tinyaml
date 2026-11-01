// Median time per call over several rounds, tinyjson5 against json5 2.2.3.
// The large input is json5 2.2.3's package-lock.json written as JSON5 with a
// 4-space indent; `pnpm json5:fetch` puts json5 2.2.3 in .cache.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as tinyjson5 from "../src/index.ts";

const json5 = createRequire(import.meta.url)("json5") as typeof tinyjson5;

const tsconfig = `{
  // Shared settings for every package.
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["node"], /* no DOM */
    "paths": { "~/*": ["./src/*"], },
  },
  "include": ["src", "test",],
}
`;
const testJson5 = readFileSync("test/json5/test.json5", "utf8");
const large = json5.stringify(
  JSON.parse(readFileSync(".cache/json5-2.2.3/package-lock.json", "utf8")),
  null,
  4,
);

const inputs = { tsconfig, "test.json5": testJson5, large };
const values = Object.fromEntries(
  Object.entries(inputs).map(([name, text]) => [name, json5.parse(text) as unknown]),
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
log(`large input: ${(large.length / 1024).toFixed(0)} KB of JSON5`);
log("| Operation | json5 | tinyjson5 | Speedup |\n| --- | --- | --- | --- |");
for (const [name, text] of Object.entries(inputs)) {
  const a = median(() => json5.parse(text));
  const b = median(() => tinyjson5.parse(text));
  rows.push({ operation: `parse ${name}`, theirs: a, ours: b });
  log(`| parse ${name} | ${format(a)} | ${format(b)} | ${(a / b).toFixed(1)}x |`);
}
for (const [name, value] of Object.entries(values)) {
  const a = median(() => json5.stringify(value, null, 2));
  const b = median(() => tinyjson5.stringify(value, null, 2));
  rows.push({ operation: `stringify ${name}`, theirs: a, ours: b });
  log(`| stringify ${name} | ${format(a)} | ${format(b)} | ${(a / b).toFixed(1)}x |`);
}
if (asJson) console.log(JSON.stringify(rows, null, 2));
