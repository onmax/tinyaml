// Differential fuzzing of tinyjson5/jju against jju 1.4.0. Seeds are the
// json5-tests corpus, jju's portable tests and update fixtures, and
// generated documents; each input gets a few random edits. For each input it
// compares: parse in a random mode with random options (reserved and duplicate
// keys, null prototypes, legacy, a reviver), as a dump of the value with its
// prototypes; tokenize; analyze; stringify of the value with random options;
// update of the input with a changed value; and each error, with its row
// and column.
// Usage: node scripts/fuzz-jju.ts [iterations] [seed]
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as ours from "../src/jju/index.ts";
import { numbers } from "./engines.ts";
import { corpus, seeded } from "./shared.ts";
import { generator } from "./values.ts";

type Api = typeof ours;
const require = createRequire(import.meta.url);
const theirs = require("jju") as Api;
const yaml = require("js-yaml-v3");
const [iterations = 2000, seed = 1] = numbers();
const next = seeded(seed);
const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
const int = (n: number) => Math.floor(next() * n);

// The schema jju's portable tests load their file with.
const schema = yaml.Schema.create([
  new yaml.Type("!error", { kind: "scalar", resolve: () => true }),
]);
const portable = Object.values(
  yaml.safeLoad(readFileSync("test/jju/portable-json5-tests.yaml", "utf8"), { schema }) as Record<
    string,
    { input?: string }
  >,
)
  .map((t) => t.input)
  .filter((t): t is string => typeof t === "string");
const updates = readdirSync("test/jju/update").flatMap((f) => {
  const test = yaml.load(readFileSync(`test/jju/update/${f}`, "utf8"));
  return [test.input, test.output].filter((t: unknown): t is string => typeof t === "string");
});
const seeds = [...corpus().map(({ file }) => readFileSync(file, "utf8")), ...portable, ...updates];
const generate = generator(seeded(1));
const json5 = require("json5");
while (seeds.length < portable.length + updates.length + 500) {
  const value = generate(0).value;
  try {
    const text =
      next() < 0.5
        ? JSON.stringify(value, null, pick([2, "\t"]))
        : json5.stringify(value, null, pick([2, 4]));
    if (typeof text === "string" && text.length > 2)
      seeds.push(text.replaceAll(",\n", () => pick([", // c\n", ",\n", ", /* c */\n"])));
  } catch {}
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
  "//",
  "/*",
  "*/",
  "\n",
  "\r",
  "\r\n",
  " ",
  "\t",
  "\v",
  " ",
  " ",
  "0",
  "1",
  "-",
  "+",
  ".",
  "e",
  "0x",
  "0o",
  "07",
  "Infinity",
  "NaN",
  "true",
  "null",
  "undefined",
  "x",
  "$",
  "é",
  "\\x41",
  "\\u0041",
  "\\0",
  "\\07",
  "__proto__",
  "hasOwnProperty",
  "a:1,a:2",
];

function dump(value: any, seen = new Set<object>()): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number")
      return Object.is(value, -0) ? "-0" : Number.isFinite(value) ? value : String(value);
    return value === undefined ? "<undefined>" : value;
  }
  if (seen.has(value)) return "<cycle>";
  seen.add(value);
  const proto = Object.getPrototypeOf(value);
  const kind =
    proto === null
      ? "null"
      : proto === Object.prototype
        ? "object"
        : proto === Array.prototype
          ? "array"
          : "other";
  return [kind, Object.getOwnPropertyNames(value).map((k) => [k, dump(value[k], seen)])];
}

const options = () => {
  const o: Record<string, unknown> = {};
  if (next() < 0.6) o.mode = pick(["json5", "json", "cjson", "other"]);
  if (next() < 0.3) o.reserved_keys = pick(["ignore", "throw", "replace"]);
  if (next() < 0.3) o.duplicate_keys = pick(["ignore", "throw", "replace"]);
  if (next() < 0.2) o.null_prototype = pick([true, false]);
  if (next() < 0.2) o.legacy = pick([true, false]);
  if (next() < 0.15)
    o.reviver = (k: string, v: unknown) =>
      k === "a" ? undefined : typeof v === "number" ? v + 1 : v;
  return o;
};
const writeOptions = () => {
  const o: Record<string, unknown> = {};
  if (next() < 0.6) o.indent = pick([2, 4, "\t", "", 0, " x"]);
  if (next() < 0.4) o.quote = pick(['"', "'"]);
  if (next() < 0.3) o.quote_keys = pick([true, false]);
  if (next() < 0.2) o.ascii = true;
  if (next() < 0.4) o.mode = pick(["json5", "json", "cjson"]);
  if (next() < 0.2) o.no_trailing_comma = true;
  if (next() < 0.2) o.sort_keys = true;
  if (next() < 0.1) o.replacer = (k: string, v: unknown) => (k === "b" ? undefined : v);
  return o;
};

const outcome = (fn: () => unknown) => {
  try {
    return show(fn());
  } catch (error) {
    const e = error as Error & Record<string, unknown>;
    return `throw ${e?.name}: ${e?.message} ${show(Object.assign({}, e))}`;
  }
};
const show = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    v === undefined ? "<undefined>" : typeof v === "function" ? "<function>" : v,
  );

let inputs = 0;
let calls = 0;
let differences = 0;
const examples: string[] = [];
for (let i = 0; i < seeds.length + iterations; i++) {
  let text = i < seeds.length ? seeds[i]! : pick(seeds);
  if (i >= seeds.length)
    for (let edits = 1 + int(3); edits > 0; edits--) {
      const at = int(text.length + 1);
      const r = next();
      if (r < 0.45) text = text.slice(0, at) + pick(pieces) + text.slice(at);
      else if (r < 0.7) text = text.slice(0, at) + text.slice(at + 1 + int(3));
      else text = text.slice(0, at) + pick(pieces) + text.slice(at + 1);
    }
  inputs++;
  const parseOptions = options();
  const stringifyOptions = writeOptions();
  const changed = next();
  const list: [string, (api: Api) => unknown][] = [
    [`parse ${show(parseOptions)}`, (api) => dump(api.parse(text, { ...parseOptions }))],
    ["parse", (api) => dump(api.parse(text))],
    [`tokenize ${show(parseOptions)}`, (api) => api.tokenize(text, { ...parseOptions })],
    ["analyze", (api) => api.analyze(text)],
    [
      `stringify ${show(stringifyOptions)}`,
      (api) => api.stringify(api.parse(text, { mode: "json5" }), { ...stringifyOptions }),
    ],
    [
      `update ${changed.toFixed(2)}`,
      (api) => {
        const value = api.parse(text, { mode: "json5" });
        let edited: unknown = value;
        if (value && typeof value === "object") {
          const keys = Object.keys(value);
          const key = keys[Math.floor(changed * keys.length)];
          edited = Array.isArray(value) ? [...value] : { ...value };
          if (key !== undefined)
            (edited as any)[key] =
              changed < 0.3 ? undefined : changed < 0.6 ? [1, { x: "y" }] : "changed";
          else (edited as any)[Array.isArray(value) ? 0 : "added"] = 1;
        } else edited = changed < 0.5 ? { a: 1 } : 42;
        return api.update(text, edited, { mode: "json5", ...stringifyOptions });
      },
    ],
  ];
  for (const [name, check] of list) {
    calls++;
    const a = outcome(() => check(theirs));
    const b = outcome(() => check(ours));
    if (a === b) continue;
    differences++;
    if (examples.length < Number(process.env.SHOW ?? 5))
      examples.push(
        `--- ${name} on ${JSON.stringify(text).slice(0, 160)}\n  jju:       ${a.slice(0, 300)}\n  tinyjson5: ${b.slice(0, 300)}`,
      );
  }
}

for (const example of examples) console.log(example);
console.log(
  `tinyjson5/jju against jju 1.4.0: ${inputs} inputs (${seeds.length} seeds + ${iterations} mutated), ` +
    `${calls} calls: ${differences} differ`,
);
