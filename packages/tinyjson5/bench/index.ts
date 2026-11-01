// Median time per call over seven rounds: each tinyjson5 entry against the
// library it replaces. The tsconfig is a 15-line file with comments and
// trailing commas, `test.json5` is json5's own `{a: 1, b: 2}`, and the large
// file is json5 2.2.3's package-lock.json: 215 KB of JSON5 with a 4-space
// indent for the JSON5 parsers, and as 2-space JSON with a comment on every
// line ending in a comma for the comment strippers. Stringify uses a 2-space
// indent. `pnpm json5:fetch` puts json5 2.2.3 in .cache.
// It measures the built dist/, what npm ships, building it first if it's
// stale, through scripts/dist-loader.ts; --source measures src/ instead.
// The two sides' rounds interleave, and which runs first alternates from
// round to round, so neither gains from going first.
// Usage: node bench/index.ts [--json] [--source] [library...]
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
const json5 = require("json5");
const lock = JSON.parse(readFileSync(".cache/json5-2.2.3/package-lock.json", "utf8"));
const json5Inputs = {
  tsconfig,
  "test.json5": readFileSync("test/json5/test.json5", "utf8"),
  large: json5.stringify(lock, null, 4) as string,
};
const jsoncInputs = {
  tsconfig,
  large: JSON.stringify(lock, null, 2).replaceAll(",\n", ", // a comment\n"),
};

type Codec = { parse: (text: string) => unknown; stringify?: (value: unknown) => unknown };
const json5Codec = (lib: any): Codec => ({
  parse: (text) => lib.parse(text),
  stringify: (value) => lib.stringify(value, null, 2),
});
const strip = (fn: (text: string) => string): Codec => ({ parse: fn });
const ours = async (path: string) => (await import(path)).default;
const pairs: [string, Codec, Codec, Record<string, string>][] = [
  ["json5 2.2.3", json5Codec(json5), json5Codec(await ours("../src/json5/index.ts")), json5Inputs],
  [
    "json5 1.0.2",
    json5Codec(require("json5-v1")),
    json5Codec(await ours("../src/json5-v1/index.ts")),
    json5Inputs,
  ],
  [
    "strip-json-comments 3",
    strip(require("strip-json-comments")),
    strip(await ours("../src/strip-json-comments/index.ts")),
    jsoncInputs,
  ],
  [
    "strip-json-comments 2",
    strip(require("strip-json-comments-v2")),
    strip(await ours("../src/strip-json-comments-v2/index.ts")),
    jsoncInputs,
  ],
  [
    "strip-json-comments 5",
    strip((await import("strip-json-comments-v5")).default),
    strip(await ours("../src/strip-json-comments-v5/index.ts")),
    jsoncInputs,
  ],
  // tinyjson5's own API, against the json5 users switch from.
  [
    "json5 2.2.3 (tinyjson5 root)",
    json5Codec(json5),
    json5Codec(await ours("../src/index.ts")),
    json5Inputs,
  ],
];
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

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
// is even, ours first when it's odd. The medians.
function medians(theirs: () => unknown, ours: () => unknown) {
  const times: { theirs: number[]; ours: number[] } = { theirs: [], ours: [] };
  for (let round = 0; round < 7; round++)
    for (const side of round % 2 ? (["ours", "theirs"] as const) : (["theirs", "ours"] as const))
      times[side].push(time(side === "theirs" ? theirs : ours));
  const median = (list: number[]) => list.sort((a, b) => a - b)[3]!;
  return { theirs: median(times.theirs), ours: median(times.ours) };
}

const format = (ms: number) =>
  ms < 0.001
    ? `${(ms * 1e6).toFixed(0)} ns`
    : ms < 1
      ? `${(ms * 1000).toFixed(1)} µs`
      : `${ms.toFixed(2)} ms`;

// --json prints [{ library, operation, theirs, ours }] in ms instead, for .github/scripts/drop-ins.ts.
const asJson = process.argv.includes("--json");
const rows: { library: string; operation: string; theirs: number; ours: number }[] = [];
if (!asJson)
  console.log(
    "| Library | Operation | Theirs | tinyjson5 | Speedup |\n| --- | --- | --- | --- | --- |",
  );
for (const [library, theirs, tiny, inputs] of pairs) {
  if (only.length && !only.some((name) => library.startsWith(name))) continue;
  const operations: [string, () => unknown, () => unknown][] = [];
  for (const [name, text] of Object.entries(inputs)) {
    operations.push([`parse ${name}`, () => theirs.parse(text), () => tiny.parse(text)]);
    const value = theirs.parse(text);
    if (theirs.stringify && tiny.stringify)
      operations.push([
        `stringify ${name}`,
        () => theirs.stringify!(value),
        () => tiny.stringify!(value),
      ]);
  }
  for (const [operation, a, b] of operations) {
    const row = { library, operation, ...medians(a, b) };
    rows.push(row);
    if (!asJson)
      console.log(
        `| ${library} | ${operation} | ${format(row.theirs)} | ${format(row.ours)} | ${(row.theirs / row.ours).toFixed(1)}x |`,
      );
  }
}
if (asJson) console.log(JSON.stringify(rows, null, 2));
