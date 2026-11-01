// Differential fuzzing of tinyjson5/comment-json against comment-json
// 4.6.2. Seeds are the json5-tests corpus, comment-json's own test inputs
// and fixtures, and JSON with every kind of comment; each input gets a few
// random edits. For each input it compares: parse with and without
// removing comments and with a reviver, as a dump of every value with its
// prototype, keys and comment symbols (each comment's own keys in order);
// tokenize; stringify of the result with a random space and replacer, after
// assign, moveComments and removeComments on a copy; and each error.
// Usage: node scripts/fuzz-comment-json.ts [iterations] [seed]
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as ours from "../src/comment-json/index.ts";
import { numbers } from "./engines.ts";
import { attempt, corpus, seeded } from "./shared.ts";
import { generator } from "./values.ts";

type Api = typeof import("comment-json");
const theirs = createRequire(import.meta.url)("comment-json") as Api;
const [iterations = 2000, seed = 1] = numbers();
const next = seeded(seed);
const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
const int = (n: number) => Math.floor(next() * n);

const strings = readdirSync("test/comment-json")
  .filter((f) => f.endsWith(".js"))
  .flatMap((f) =>
    [...readFileSync(`test/comment-json/${f}`, "utf8").matchAll(/`([^`$\\]*)`/g)].map((m) => m[1]!),
  );
const fixtures = readdirSync("test/comment-json/fixtures").map((f) =>
  readFileSync(`test/comment-json/fixtures/${f}`, "utf8"),
);
const seeds = [...corpus().map(({ file }) => readFileSync(file, "utf8")), ...strings, ...fixtures];
const generate = generator(seeded(1));
while (seeds.length < strings.length + fixtures.length + 400) {
  const json = attempt(() => JSON.stringify(generate(0).value, null, pick([2, "\t", 4])));
  if (json.ok && typeof json.value === "string")
    seeds.push(
      `${pick(["", "// top\n", "/* top */\n\n"])}${json.value.replaceAll(",\n", () =>
        pick([", // c\n", ",\n\n", ", /* c */\n", ",\n  // own line\n", ",\n"]),
      )}${pick(["", "\n// end", " /* end */\n"])}`,
    );
}
const pieces = [
  "--",
  "-=",
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
  "\r\n",
  " ",
  "\t",
  "\n\n",
  "0",
  "1",
  "-",
  ".",
  "e",
  "true",
  "null",
  "x",
  "é",
  " ",
  "01",
  "// c\n",
  "/* c */",
];

const KINDS = [
  "before",
  "after-prop",
  "after-colon",
  "after-value",
  "after",
  "before-all",
  "after-all",
];
// A value with its prototype, own keys, and comments, which are its
// registered-symbol properties, each comment with its own keys in order.
function dump(value: any, seen = new Set<object>()): unknown {
  if (value === null || typeof value !== "object")
    return typeof value === "number" && !Number.isFinite(value) ? String(value) : value;
  if (seen.has(value)) return "<cycle>";
  seen.add(value);
  const proto = Object.getPrototypeOf(value);
  const kind =
    proto === Object.prototype
      ? "object"
      : proto === Array.prototype
        ? "array"
        : (proto?.constructor?.name ?? String(proto));
  const comments = Object.getOwnPropertySymbols(value)
    .map(
      (symbol) =>
        [
          Symbol.keyFor(symbol) ?? String(symbol),
          Object.getOwnPropertyDescriptor(value, symbol)!.value,
        ] as const,
    )
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => [
      key,
      Array.isArray(list) ? list.map((c: any) => Object.entries(c)) : list,
    ]);
  return [kind, Object.keys(value).map((k) => [k, dump(value[k], seen)]), comments];
}

function reviver(key: string, value: unknown) {
  if (key === "a") return undefined;
  return typeof value === "number" ? value * 2 : value;
}

function checks(text: string): [string, (api: Api) => unknown][] {
  const space = pick([2, 4, "\t", "  ", 0, undefined, "abcdefghijkl"]);
  const replacer = pick([
    null,
    undefined,
    ["a", "b", "0"],
    (k: string, v: unknown) => (k === "b" ? undefined : v),
  ]);
  const prop = pick(["a", "b", 0, 1, "x"]);
  const target = pick(["a", "b", 0, 1]);
  const kind = pick(KINDS);
  const kind2 = pick(KINDS);
  const removing = pick([true, false, undefined]);
  const keys = next() < 0.5 ? undefined : [prop];
  const remove = next() < 0.5;
  return [
    ["parse", (api) => dump(api.parse(text))],
    [`parse remove ${removing}`, (api) => dump(api.parse(text, null, removing))],
    ["parse reviver", (api) => dump(api.parse(text, reviver as never))],
    ["tokenize", (api) => api.tokenize(text)],
    [
      `stringify ${JSON.stringify(space)} ${String(replacer)}`,
      (api) => api.stringify(api.parse(text), replacer as never, space),
    ],
    [
      `assign ${String(prop)}`,
      (api) => {
        const value = api.parse(text) as any;
        if (!value || typeof value !== "object") return "-";
        const copy = api.assign(Array.isArray(value) ? new api.CommentArray() : {}, value, keys);
        return [dump(copy), api.stringify(copy, null, 2)];
      },
    ],
    [
      `moveComments ${String(prop)} ${kind} -> ${String(target)} ${kind2}`,
      (api) => {
        const value = api.parse(text) as any;
        if (!value || typeof value !== "object") return "-";
        api.moveComments(
          value,
          value,
          { where: kind, key: prop } as never,
          { where: kind2, key: target } as never,
          remove,
        );
        return [dump(value), api.stringify(value, null, 2)];
      },
    ],
    [
      `removeComments ${String(prop)} ${kind}`,
      (api) => {
        const value = api.parse(text) as any;
        if (!value || typeof value !== "object") return "-";
        api.removeComments(value, { where: kind, key: prop } as never);
        return [dump(value), api.stringify(value, null, 2)];
      },
    ],
  ];
}

// The error's type, message and own fields: comment-json's line and column, esprima's index and description.
const outcome = (fn: () => string) => {
  try {
    return { ok: true as const, value: fn() };
  } catch (error) {
    const e = error as Error;
    return { ok: false as const, error: `${e?.name}: ${e?.message} ${show(Object.assign({}, e))}` };
  }
};
const show = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    v === undefined ? "<undefined>" : typeof v === "bigint" ? `${v}n` : v,
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
  for (const [name, check] of checks(text)) {
    calls++;
    const a = outcome(() => show(check(theirs)));
    const b = outcome(() => show(check(ours as unknown as Api)));
    const same = a.ok && b.ok ? a.value === b.value : !a.ok && !b.ok && a.error === b.error;
    if (same) continue;
    differences++;
    if (examples.length < Number(process.env.SHOW ?? 5))
      examples.push(
        `--- ${name} on ${JSON.stringify(text).slice(0, 160)}\n` +
          `  comment-json: ${String(a.ok ? a.value : a.error).slice(0, 300)}\n` +
          `  tinyjson5:    ${String(b.ok ? b.value : b.error).slice(0, 300)}`,
      );
  }
}

for (const example of examples) console.log(example);
console.log(
  `tinyjson5/comment-json against comment-json 4.6.2: ${inputs} inputs ` +
    `(${seeds.length} seeds + ${iterations} mutated), ${calls} calls: ${differences} differ`,
);
