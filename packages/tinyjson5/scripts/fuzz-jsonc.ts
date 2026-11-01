// Differential fuzzing of tinyjson5/jsonc-parser against jsonc-parser
// 3.3.1, over its whole API. Seeds are the json5-tests corpus, JSON with
// comments, and every string jsonc-parser's own tests pass to it; each input
// gets a few random edits with the pieces its scanner cares about. For each
// input it compares, as JSON: the token stream (both trivia modes, and after
// setPosition), parse and parseTree with each option set, the visitor calls
// (one visitor stops descending into some objects), getLocation at random
// offsets, findNodeAtOffset, findNodeAtLocation, getNodePath and
// getNodeValue on the tree, stripComments, format with random ranges and
// options, and modify with random paths, values and options, each through
// applyEdits. A call must give the same result, or throw the same error.
// Usage: node scripts/fuzz-jsonc.ts [iterations] [seed]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as ours from "../src/jsonc-parser/index.ts";
import { numbers } from "./engines.ts";
import { attempt, corpus, seeded } from "./shared.ts";
import { generator } from "./values.ts";

type Api = typeof import("jsonc-parser");
const theirs = createRequire(import.meta.url)("jsonc-parser") as Api;
const [iterations = 2000, seed = 1] = numbers();
const next = seeded(seed);
const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
const int = (n: number) => Math.floor(next() * n);

// Every string literal in jsonc-parser's tests, unescaped.
const testStrings = ["json", "format", "edit"].flatMap((name) =>
  [...readFileSync(`test/jsonc-parser/${name}.test.ts`, "utf8").matchAll(/'((?:[^'\\\n]|\\.)*)'/g)]
    .map((m) => attempt(() => JSON.parse(`"${m[1]!.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`)))
    .flatMap((r) =>
      r.ok && typeof r.value === "string" && /[{}[\]"\d]/.test(r.value) ? [r.value] : [],
    ),
);
const seeds = [...corpus().map(({ file }) => readFileSync(file, "utf8")), ...testStrings];
const generate = generator(seeded(1));
while (seeds.length < testStrings.length + 300) {
  const json = attempt(() =>
    JSON.stringify(generate(0).value, null, pick([undefined, 2, "\t", 4])),
  );
  if (json.ok && typeof json.value === "string")
    seeds.push(
      json.value.replaceAll(",\n", pick([", // c\n", ",\r\n", ", /* c */\n", ",\n", ",\n\n"])),
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
  "\\",
  "\\u",
  "\\u00e9",
  "\\x",
  "/",
  "//",
  "/*",
  "*/",
  "*",
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
  ".",
  "e",
  "E+",
  "1.",
  "-.",
  "01",
  "1e",
  "true",
  "false",
  "null",
  "nul",
  "truex",
  "a",
  '"a"',
  '"a":',
  "\u0001",
  "😀",
  ",}",
  ",]",
];

const keys = ["a", "b", "x", "$schema", "", "a b", "__proto__"];
const values = [1, "s", true, null, undefined, [1, 2], { c: 1 }, { d: [{ e: null }] }, "\n"];
const formatOptions = () => ({
  tabSize: pick([undefined, 0, 1, 2, 4, 8, 2.5, -1]),
  insertSpaces: pick([true, false, undefined]),
  eol: pick([undefined, "\n", "\r\n", "\r", "\n\n"]),
  insertFinalNewline: pick([undefined, true]),
  keepLines: pick([undefined, false, true]),
});
const parseOptions = [
  undefined,
  { allowTrailingComma: true },
  { disallowComments: true },
  { allowEmptyContent: true },
  { allowTrailingComma: true, disallowComments: true, allowEmptyContent: true },
];

// A node without its parent pointers, which would make it a cycle.
const plain = (node: any): unknown =>
  node && {
    type: node.type,
    value: node.value,
    offset: node.offset,
    length: node.length,
    colonOffset: node.colonOffset,
    children: node.children?.map(plain),
  };
const show = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    v === undefined ? "<undefined>" : typeof v === "number" && !Number.isFinite(v) ? String(v) : v,
  );

// Each check gets one api and returns something comparable as JSON.
function checks(text: string): [string, (api: Api) => unknown][] {
  const list: [string, (api: Api) => unknown][] = [];
  for (const trivia of [false, true])
    list.push([
      `scan ${trivia}`,
      (api) => {
        const scanner = api.createScanner(text, trivia);
        const tokens: unknown[] = [];
        for (let k = 0; k < 10_000; k++) {
          const kind = scanner.scan();
          tokens.push([
            kind,
            scanner.getToken(),
            scanner.getTokenValue(),
            scanner.getTokenOffset(),
            scanner.getTokenLength(),
            scanner.getTokenStartLine(),
            scanner.getTokenStartCharacter(),
            scanner.getTokenError(),
            scanner.getPosition(),
          ]);
          if (kind === 17) break;
        }
        return tokens;
      },
    ]);
  const restart = int(text.length + 1);
  list.push([
    `scan from ${restart}`,
    (api) => {
      const scanner = api.createScanner(text);
      scanner.scan();
      scanner.setPosition(restart);
      const tokens: unknown[] = [
        [scanner.getToken(), scanner.getTokenValue(), scanner.getTokenOffset()],
      ];
      for (let k = 0; k < 50; k++) {
        const kind = scanner.scan();
        tokens.push([
          kind,
          scanner.getTokenValue(),
          scanner.getTokenOffset(),
          scanner.getTokenStartLine(),
          scanner.getTokenStartCharacter(),
        ]);
        if (kind === 17) break;
      }
      return tokens;
    },
  ]);
  for (const options of parseOptions) {
    list.push([
      `parse ${show(options)}`,
      (api) => {
        const errors: unknown[] = [];
        const value = api.parse(text, errors as never, options);
        // The prototype too: jsonc-parser assigns "__proto__".
        const protos: unknown[] = [];
        JSON.stringify(value, (_, v) => {
          if (v && typeof v === "object" && !Array.isArray(v))
            protos.push(show(Object.getPrototypeOf(v)));
          return v;
        });
        return [value, errors, protos];
      },
    ]);
    list.push([
      `parseTree ${show(options)}`,
      (api) => {
        const errors: unknown[] = [];
        return [plain(api.parseTree(text, errors as never, options)), errors];
      },
    ]);
  }
  const stopAt = int(4);
  const visitOptions = pick(parseOptions);
  list.push([
    "visit",
    (api) => {
      const calls: unknown[] = [];
      const record =
        (name: string) =>
        (...args: unknown[]) => {
          calls.push([name, ...args.map((a) => (typeof a === "function" ? a() : a))]);
          if (name === "onObjectBegin" && calls.length % 4 === stopAt) return false;
        };
      api.visit(
        text,
        {
          onObjectBegin: record("onObjectBegin"),
          onObjectProperty: record("onObjectProperty"),
          onObjectEnd: record("onObjectEnd"),
          onArrayBegin: record("onArrayBegin"),
          onArrayEnd: record("onArrayEnd"),
          onLiteralValue: record("onLiteralValue"),
          onSeparator: record("onSeparator"),
          onComment: record("onComment"),
          onError: record("onError"),
        } as never,
        visitOptions,
      );
      return calls;
    },
  ]);
  for (let k = 0; k < 3; k++) {
    const position = int(text.length + 2);
    const pattern = Array.from({ length: int(4) }, () => pick(["*", "**", "a", 0, 1, "b"]));
    list.push([
      `getLocation ${position}`,
      (api) => {
        const location = api.getLocation(text, position);
        return [
          location.path,
          plain(location.previousNode),
          location.isAtPropertyKey,
          location.matches(pattern),
        ];
      },
    ]);
  }
  const offset = int(text.length + 2);
  const right = next() < 0.5;
  list.push([
    `tree ${offset}`,
    (api) => {
      const root = api.parseTree(text);
      if (!root) return null;
      const node = api.findNodeAtOffset(root, offset, right);
      const path = node && api.getNodePath(node);
      const found = path && api.findNodeAtLocation(root, path);
      const value = attempt(() => api.getNodeValue(root));
      return [plain(node), path, plain(found), value.ok ? show(value.value) : value.error];
    },
  ]);
  for (const replace of [undefined, " ", "*"])
    list.push([`stripComments ${replace}`, (api) => api.stripComments(text, replace)]);
  const start = int(text.length + 1);
  const range = next() < 0.5 ? undefined : { offset: start, length: int(text.length - start + 1) };
  const fmt = formatOptions();
  list.push([
    `format ${show(range)} ${show(fmt)}`,
    (api) => {
      const edits = api.format(text, range, fmt as never);
      return [edits, attempt(() => api.applyEdits(text, edits))];
    },
  ]);
  const path = Array.from({ length: 1 + int(3) }, () =>
    next() < 0.5 ? pick(keys) : pick([0, 1, 2, -1]),
  );
  const value = pick(values);
  const modifyOptions = {
    formattingOptions: next() < 0.8 ? formatOptions() : undefined,
    isArrayInsertion: pick([undefined, true, false]),
    getInsertionIndex:
      next() < 0.3 ? (properties: string[]) => int(properties.length + 1) : undefined,
  };
  const insertion = modifyOptions.getInsertionIndex ? int(10) : 0;
  if (modifyOptions.getInsertionIndex)
    modifyOptions.getInsertionIndex = (p) => insertion % (p.length + 1);
  list.push([
    `modify ${show(path)} ${show(value)} ${show(modifyOptions)}`,
    (api) => {
      const edits = api.modify(text, path, value, modifyOptions as never);
      return [edits, attempt(() => api.applyEdits(text, edits))];
    },
  ]);
  return list;
}

let inputs = 0;
let calls = 0;
let differences = 0;
const examples: string[] = [];
for (let i = 0; i < seeds.length + iterations; i++) {
  let text = i < seeds.length ? seeds[i]! : pick(seeds);
  if (i >= seeds.length)
    for (let edits = 1 + int(4); edits > 0; edits--) {
      const at = int(text.length + 1);
      const r = next();
      if (r < 0.45) text = text.slice(0, at) + pick(pieces) + text.slice(at);
      else if (r < 0.7) text = text.slice(0, at) + text.slice(at + 1 + int(3));
      else text = text.slice(0, at) + pick(pieces) + text.slice(at + 1);
    }
  inputs++;
  for (const [name, check] of checks(text)) {
    calls++;
    const a = attempt(() => show(check(theirs)));
    const b = attempt(() => show(check(ours as unknown as Api)));
    const same = a.ok && b.ok ? a.value === b.value : !a.ok && !b.ok && a.error === b.error;
    if (same) continue;
    differences++;
    if (examples.length < Number(process.env.SHOW ?? 5))
      examples.push(
        `--- ${name} on ${JSON.stringify(text).slice(0, 160)}\n` +
          `  jsonc-parser: ${String(a.ok ? a.value : a.error).slice(0, 300)}\n` +
          `  tinyjson5:    ${String(b.ok ? b.value : b.error).slice(0, 300)}`,
      );
  }
}
for (let code = -1; code <= 18; code++) {
  calls++;
  if (theirs.printParseErrorCode(code) !== ours.printParseErrorCode(code as never)) differences++;
}

for (const example of examples) console.log(example);
console.log(
  `tinyjson5/jsonc-parser against jsonc-parser 3.3.1: ${inputs} inputs ` +
    `(${seeds.length} seeds + ${iterations} mutated), ${calls} calls: ${differences} differ`,
);
