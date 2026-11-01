// Differential fuzzing of tinyjson5's strip-json-comments entries against
// strip-json-comments 2, 3 and 5. Seeds are the json5-tests corpus, JSON
// with comments, and strip-json-comments' own test inputs; each input gets a
// few random edits with the pieces its state machine cares about, and goes
// through both with every option set. Outputs must be identical, or both must
// throw the same error. Non-string inputs are checked once at the end.
// Usage: node scripts/fuzz-strip.ts [iterations] [seed] [v2|v3|v5]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { attempt, corpus, seeded } from "./shared.ts";
import { generator } from "./values.ts";
import { numbers } from "./engines.ts";

type Strip = (text: unknown, options?: unknown) => string;
const require = createRequire(import.meta.url);
const VERSIONS: Record<
  string,
  { library: string; theirs: () => Promise<Strip>; ours: () => Promise<Strip>; options: unknown[] }
> = {
  v2: {
    library: "strip-json-comments 2.0.1",
    theirs: async () => require("strip-json-comments-v2"),
    ours: async () => (await import("../src/strip-json-comments-v2/index.ts")).default as Strip,
    options: [undefined, { whitespace: false }, { whitespace: 0 }, null],
  },
  v3: {
    library: "strip-json-comments 3.1.1",
    theirs: async () => require("strip-json-comments"),
    ours: async () => (await import("../src/strip-json-comments/index.ts")).default as Strip,
    options: [undefined, { whitespace: false }, { whitespace: 0 }],
  },
  v5: {
    library: "strip-json-comments 5.0.3",
    theirs: async () => (await import("strip-json-comments-v5")).default as Strip,
    ours: async () => (await import("../src/strip-json-comments-v5/index.ts")).default as Strip,
    options: [
      undefined,
      { whitespace: false },
      { trailingCommas: true },
      { whitespace: false, trailingCommas: true },
      { whitespace: null, trailingCommas: 1 },
    ],
  },
};

const version = process.argv.slice(2).find((a) => /^v\d$/.test(a)) ?? "v3";
const engine = VERSIONS[version]!;
const theirs = await engine.theirs();
const ours = await engine.ours();
const [iterations = 20000, seed = 1] = numbers();
const next = seeded(seed);
const pick = <T>(list: T[]) => list[Math.floor(next() * list.length)]!;

const seeds = [
  ...corpus().map(({ file }) => readFileSync(file, "utf8")),
  ...[2, 3, 5].flatMap((v) =>
    [
      ...readFileSync(
        `test/strip-json-comments${v === 3 ? "" : `-v${v}`}/test.js`,
        "utf8",
      ).matchAll(/stripJsonComments\('((?:[^'\\]|\\.)*)'|fn\('((?:[^'\\]|\\.)*)'/g),
    ].map((m) =>
      (m[1] ?? m[2])!.replace(/\\(.)/g, (_, c: string) => ({ n: "\n", r: "\r", t: "\t" })[c] ?? c),
    ),
  ),
];
const generate = generator(seeded(1));
while (seeds.length < 400) {
  const json = attempt(() => JSON.stringify(generate(0).value, null, pick([undefined, 2, "\t"])));
  if (json.ok && typeof json.value === "string")
    seeds.push(json.value.replaceAll(",\n", pick([", // c\n", ",\r\n", ", /* c */\n", ",\n"])));
}
const pieces = [
  '"',
  '\\"',
  "\\",
  "\\\\",
  "/",
  "*",
  "//",
  "/*",
  "*/",
  "\n",
  "\r",
  "\r\n",
  ",",
  "}",
  "]",
  "{",
  "[",
  " ",
  "\t",
  "a",
  "'",
  " ",
  "﻿",
  " ",
  "　",
  "😀",
  "\v",
  ",}",
  ", ]",
];

let calls = 0;
let differences = 0;
let throws = 0;
const examples: string[] = [];
const compare = (input: unknown, options: unknown) => {
  const args = options === undefined ? [input] : [input, options];
  const a = attempt(() => (theirs as (...x: unknown[]) => unknown)(...args));
  const b = attempt(() => (ours as (...x: unknown[]) => unknown)(...args));
  calls++;
  if (!a.ok) throws++;
  const same = a.ok && b.ok ? a.value === b.value : !a.ok && !b.ok && a.error === b.error;
  if (same) return;
  differences++;
  if (examples.length < Number(process.env.SHOW ?? 10))
    examples.push(
      `--- ${JSON.stringify(input).slice(0, 200)} ${JSON.stringify(options)}\n` +
        `  ${engine.library}: ${JSON.stringify(a.ok ? a.value : a.error).slice(0, 200)}\n` +
        `  tinyjson5: ${JSON.stringify(b.ok ? b.value : b.error).slice(0, 200)}`,
    );
};

for (let i = 0; i < seeds.length + iterations; i++) {
  let input = pick(seeds);
  if (i >= seeds.length)
    for (let edits = 1 + Math.floor(next() * 4); edits > 0; edits--) {
      const at = Math.floor(next() * (input.length + 1));
      const r = next();
      if (r < 0.5) input = input.slice(0, at) + pick(pieces) + input.slice(at);
      else if (r < 0.75) input = input.slice(0, at) + input.slice(at + 1 + Math.floor(next() * 3));
      else input = input.slice(0, at) + pick(pieces) + input.slice(at + 1);
    }
  else input = seeds[i]!;
  for (const options of engine.options) compare(input, options);
}
for (const input of [null, undefined, 5, {}, ["/", "/"], new String("//a\n1"), true])
  for (const options of engine.options) compare(input, options);

for (const example of examples) console.log(example);
console.log(
  `tinyjson5 against ${engine.library}: ${seeds.length + iterations} inputs ` +
    `(${seeds.length} seeds + ${iterations} mutated), ${calls} calls (${throws} throw in both): ` +
    `${differences} differ`,
);
