// Differential parse fuzzing of one entry against the library it replaces
// (scripts/engines.ts): take the json5-tests corpus, json5's own test inputs,
// and generated documents, apply a few random edits with JSON5-significant
// pieces, and check that both parsers return the same value or both throw.
// For inputs both reject it also compares the error message, lineNumber, and
// columnNumber, and it compares the console.warn calls.
// Usage: node scripts/fuzz.ts [iterations] [seed] [engine]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { generator } from "./values.ts";
import { engineFromArgs, numbers } from "./engines.ts";
import { attempt, corpus, same, seeded, testInputs, type Outcome } from "./shared.ts";

// The seeds are json5 2.2.3's output whatever the engine, so every engine
// sees the same inputs.
const json5 = createRequire(import.meta.url)("json5") as typeof import("../src/json5/index.ts");
const engine = await engineFromArgs();
const [iterations = 20000, seed = 1] = numbers();
const next = seeded(seed);
const pick = <T>(list: T[]) => list[Math.floor(next() * list.length)]!;

// Seeds: the corpus, json5's test inputs, and 200 documents json5 writes for
// random values, with every indent and quote style and a few comments.
const seeds = [...corpus().map(({ file }) => readFileSync(file, "utf8")), ...testInputs()];
const generate = generator(seeded(1));
while (seeds.length < 400) {
  const text = json5.stringify(generate(0).value, {
    space: pick([undefined, 2, "\t", " \u3000"]),
    quote: pick([undefined, "'", '"']),
  });
  if (text !== undefined && text.length > 2)
    seeds.push(
      next() < 0.5 ? text : `// ${text.length}\n/* doc */ ${text.replaceAll(",", ", /*c*/")}\n`,
    );
}

const pieces = [
  "{",
  "}",
  "[",
  "]",
  ",",
  ":",
  '"',
  "'",
  "\\",
  "/",
  "*",
  "\n",
  "\r",
  "\r\n",
  " ",
  "\t",
  "\v",
  "\f",
  "a",
  "Z",
  "0",
  "1",
  "9",
  ".",
  "e",
  "E",
  "+",
  "-",
  "x",
  "X",
  "u",
  "I",
  "N",
  "$",
  "_",
  "f",
  "n",
  "t",
  "\u2028",
  "\u2029",
  "\u00e9",
  "\ufeff",
  "\u00a0",
  "\u3000",
  "\u1680",
  "\u200c",
  "\u200d",
  "\u0000",
  "\u0001",
  "\u001f",
  "\ud835\udc4e",
  "\ud83d\ude00",
  "\ud800",
  "\udc00",
  "null",
  "true",
  "false",
  "Infinity",
  "NaN",
  "0x",
  "0x1F",
  ".5",
  "1e",
  "//",
  "/*",
  "*/",
  "\\u0041",
  "\\u0030",
  "\\u002",
  "\\u200C",
  "\\x4",
  "\\x41",
  "\\0",
  "\\01",
  "\\1",
  "\\a",
  "\\\n",
  "\\\u2028",
  "__proto__",
  "a:1",
  "'a'",
  "[]",
  "{}",
];

// Runs one parser and also records what it passed to console.warn.
function run(fn: (text: string) => unknown, text: string): Outcome & { warnings: string } {
  const warn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(" "));
  try {
    return { ...attempt(() => fn(text)), warnings: warnings.join("|") };
  } finally {
    console.warn = warn;
  }
}

let bothThrow = 0;
let sameError = 0;
let warnDiffs = 0;
const valueDiffs = new Map<string, string>();
const errorDiffs = new Map<string, string>();
const inputs = [...seeds];
for (let i = 0; i < iterations; i++) {
  let input = pick(seeds);
  for (let edits = 1 + Math.floor(next() * 3); edits > 0; edits--) {
    const at = Math.floor(next() * (input.length + 1));
    const r = next();
    if (r < 0.4) input = input.slice(0, at) + pick(pieces) + input.slice(at);
    else if (r < 0.7) input = input.slice(0, at) + input.slice(at + 1 + Math.floor(next() * 3));
    else input = input.slice(0, at) + pick(pieces) + input.slice(at + 1);
  }
  inputs.push(input);
}

const show = (r: Outcome) =>
  r.ok ? `value ${String(JSON.stringify(r.value)).slice(0, 120)}` : r.error;
for (const input of inputs) {
  const expected = run(engine.t.parse, input);
  const actual = run(engine.o.parse, input);
  if (expected.warnings !== actual.warnings) warnDiffs++;
  if (
    expected.ok !== actual.ok ||
    (expected.ok && actual.ok && !same(expected.value, actual.value))
  ) {
    valueDiffs.set(
      input,
      `${engine.library}: ${show(expected)}\n  ${engine.entry}: ${show(actual)}`,
    );
  } else if (!expected.ok && !actual.ok) {
    bothThrow++;
    if (expected.error === actual.error) sameError++;
    else
      errorDiffs.set(
        input,
        `${engine.library}: ${expected.error}\n  ${engine.entry}: ${actual.error}`,
      );
  }
}

const limit = Number(process.env.SHOW ?? 10);
for (const [label, diffs] of [
  ["value or accept/reject", valueDiffs],
  ["error", errorDiffs],
] as const)
  for (const [input, diff] of [...diffs].sort((a, b) => a[0].length - b[0].length).slice(0, limit))
    console.log(`--- ${label}: ${JSON.stringify(input).slice(0, 200)}\n  ${diff}`);
const rate = bothThrow ? ((100 * sameError) / bothThrow).toFixed(3) : "100";
console.log(
  `${engine.entry} against ${engine.library}: ${inputs.length} inputs (${seeds.length} seeds + ${iterations} mutated): ` +
    `${valueDiffs.size} value or accept/reject differences, ` +
    `${sameError}/${bothThrow} errors identical (${rate}%), ${warnDiffs} warning differences`,
);
