// Differential fuzzing of `dump` against js-yaml 4.3.2: random values and
// random option sets, compared on output text or on the thrown message.
// Usage: node scripts/dump-fuzz.ts [cases] [seed]
import { createRequire } from "node:module";
import * as tiny from "../src/js-yaml/index.ts";
import {
  CR_VALUES,
  expectCount,
  expectWritten,
  iterationsArg,
  mulberry32,
  seedArg,
} from "./support.ts";

const require = createRequire(import.meta.url);
const js = require("../.cache/js-yaml4/index.js");
const { TEST_SCHEMA } = require("../.cache/js-yaml4/test/core/support/schema.js");

const cases = iterationsArg(process.argv[2], 50000);
const rand = mulberry32(seedArg(process.argv[3]));
const int = (n: number) => Math.floor(rand() * n);
const pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
const chance = (p: number) => rand() < p;

class Point {
  constructor(x: number, y: number) {
    Object.assign(this, { x, y });
  }
}
class Multi {
  constructor(kind: string, v: unknown) {
    Object.assign(this, { kind, v });
  }
}
class Flag {
  constructor(on: boolean) {
    Object.assign(this, { on });
  }
}
class Plain {
  a = 1;
}

// The same custom types built with each library's Type class.
function custom(lib: { Type: any; DEFAULT_SCHEMA: any }) {
  return lib.DEFAULT_SCHEMA.extend({
    implicit: [
      new lib.Type("!raw", {
        kind: "scalar",
        predicate: (s: unknown) => typeof s === "string" && s.startsWith("RAW"),
        represent: (s: string) => (s.length > 5 ? s.slice(3) : ""),
      }),
    ],
    explicit: [
      new lib.Type("!point", {
        kind: "mapping",
        instanceOf: Point,
        represent: (p: any) => (p.x > 5 ? [p.x, p.y] : { x: p.x, y: p.y }),
      }),
      new lib.Type("!m", {
        kind: "scalar",
        multi: true,
        predicate: (m: unknown) => m instanceof Multi,
        representName: (m: any) => `!m/${m.kind}`,
        represent: (m: any) =>
          m.kind === "seq" ? [m.v, m.v] : m.kind === "map" ? { v: m.v } : String(m.v),
      }),
      new lib.Type("!flag ü!x", {
        kind: "scalar",
        instanceOf: Flag,
        predicate: (f: any) => f.on !== undefined,
        represent: { a: (f: any) => (f.on ? "yes" : "A b"), b: () => "B\nb" },
        defaultStyle: "a",
        styleAliases: { b: ["bee", 2] },
      }),
      new lib.Type("tag:example.com,2000:plain", {
        kind: "mapping",
        instanceOf: Plain,
      }),
      new lib.Type("tag:yaml.org,2002:upper", {
        kind: "scalar",
        predicate: (s: unknown) => typeof s === "string" && s.startsWith("UP"),
        represent: (s: string) => s.toUpperCase(),
      }),
    ],
  });
}
const schemas: [unknown, unknown][] = [
  [undefined, undefined],
  [tiny.DEFAULT_SCHEMA, js.DEFAULT_SCHEMA],
  [tiny.JSON_SCHEMA, js.JSON_SCHEMA],
  [tiny.CORE_SCHEMA, js.CORE_SCHEMA],
  [tiny.FAILSAFE_SCHEMA, js.FAILSAFE_SCHEMA],
  [TEST_SCHEMA, TEST_SCHEMA],
  [custom(tiny), custom(js)],
];

const pieces = [
  ..."abcxyzABZ019_.-+:#?,[]{}&*!|>'\"%@`=~<\\/ \t\n\r\0\x07\x1B\x7F\x85\xA0\u2028\u2029\uFEFF\uFFFE\uFFFF".split(
    "",
  ),
  "\uD800",
  "\uDC00",
  "\uDBFF",
  "é",
  "日本",
  "😀",
  "\u{10FFFF}",
  "\uE000",
  "\uFEFE",
  "\uFFFD",
  "\x9F",
  "\xA1",
  ": ",
  " #",
  "- ",
  "? ",
  "  ",
  "\n\n",
  " \n",
  "\r\n",
  "\r\n\r\n",
  "\n ",
  "---",
  "...",
  "<<",
  "''",
  "true",
  "False",
  "NULL",
  "~",
  "null",
  "yes",
  "No",
  "on",
  "OFF",
  "y",
  "N",
  "1:20",
  "1_0:2",
  "+1",
  "-0",
  "08",
  "0x1F",
  "0o17",
  "0b101",
  "1e5",
  "1.5",
  ".5",
  "-.inf",
  ".NaN",
  "2001-12-14",
  "2001-1-1 1:02:03",
  "12_3",
  "RAW",
  "RAWfoo bar",
  "UPx y",
  "word",
  "longerword",
  "supercalifragilistic",
];
const atoms = [
  "",
  " ",
  "a",
  "yes",
  "1:30",
  "-",
  "?",
  ":",
  "#",
  "true",
  "0.5",
  "2020-01-01",
  "RAWxyz!!",
  "UPz",
];

// Words, runs of spaces and line breaks, for folding.
function prose(): string {
  let s = chance(0.2) ? pick([" ", "\n", "  "]) : "";
  for (let n = int(80); n--;) {
    s += "abcdefghijklmnopqrstuvwxyz".slice(0, 1 + int(14));
    s += chance(0.85) ? " " : pick(["  ", "\n", "\n\n", "\n  ", " \n", "\n\n\n", ""]);
  }
  return s + (chance(0.3) ? pick(["\n", "\n\n", " "]) : "");
}

function str(): string {
  if (chance(0.15)) return pick(atoms);
  if (chance(0.15)) return prose();
  let s = "";
  const n = chance(0.1) ? 20 + int(120) : int(8);
  for (let i = 0; i < n; i++) s += chance(0.3) ? " " + pick(pieces) : pick(pieces);
  if (chance(0.03)) s = s.repeat(1 + int(60));
  return s;
}

const numbers = [
  0,
  -0,
  1,
  -1,
  42,
  1.5,
  -2.25,
  1e21,
  1e-7,
  5e-324,
  2 ** 53,
  -(2 ** 31),
  NaN,
  Infinity,
  -Infinity,
  0.1 + 0.2,
];

function scalar(): unknown {
  switch (int(22)) {
    case 0:
    case 1:
      return pick(numbers);
    case 2:
      return int(2000) - 1000;
    case 3:
      return chance(0.5);
    case 4:
      return null;
    case 5:
      return undefined;
    case 6:
      return chance(0.3) ? (chance(0.5) ? () => 1 : Symbol("s")) : str();
    case 7:
      return chance(0.7)
        ? new Date(int(2 ** 40))
        : chance(0.5)
          ? new Date(NaN)
          : new Date(-8.64e15);
    case 8:
      return new Uint8Array(Array.from({ length: int(70) }, () => int(256)));
    case 9:
      if (chance(0.5)) return str();
      if (chance(0.3))
        return new String(chance(0.3) ? pick(["\n", "a\n\n", "\n\n", "yes", "null"]) : str());
      return pick([
        new String(str()),
        new Number(pick(numbers)),
        new Boolean(chance(0.5)),
        10n,
        /re/,
        new Map(),
      ]);
    case 10:
      return pick([
        new Point(int(10), 2),
        new Multi(pick(["s", "seq", "map", "a b"]), int(3)),
        new Flag(chance(0.5)),
        new Plain(),
      ]);
    default:
      return str();
  }
}

function value(depth: number, pool: object[]): unknown {
  if (depth > 3 || chance(0.35)) return scalar();
  if (pool.length && chance(0.08)) return pick(pool);
  if (chance(0.5)) {
    const list: unknown[] = [];
    const n = int(5);
    for (let i = 0; i < n; i++) list.push(value(depth + 1, pool));
    if (chance(0.05)) list.length += 2;
    pool.push(list);
    return list;
  }
  const object: Record<string, unknown> = {};
  const n = int(5);
  for (let i = 0; i < n; i++)
    object[chance(0.02) ? "k".repeat(1030) : str()] = value(depth + 1, pool);
  pool.push(object);
  return object;
}

const replacers = [
  function (this: any, key: string, v: unknown) {
    return typeof v === "number" ? v * 2 : v;
  },
  function (this: any, key: string, v: unknown) {
    return key === "a" || key === "1" ? undefined : v;
  },
  function (this: any, key: string, v: unknown) {
    return typeof v === "string" && v.length > 3
      ? { [key]: v.slice(0, 3) }
      : Array.isArray(this)
        ? `${key}:${typeof v}`
        : v;
  },
];
const sorters = [true, false, (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0), 1];
const styleNames = [
  "lowercase",
  "uppercase",
  "camelcase",
  "canonical",
  "empty",
  "decimal",
  "binary",
  "octal",
  "hexadecimal",
  "bin",
  "hex",
  16,
  "a",
  "b",
  "bee",
  "dec",
  "nope",
];
const styleTags = [
  "!!null",
  "!!bool",
  "!!int",
  "!!float",
  "tag:yaml.org,2002:int",
  "!flag ü!x",
  "!!str",
  "!m",
];

function options(): [Record<string, unknown>, Record<string, unknown>] {
  const o: Record<string, unknown> = {};
  const set = (key: string, p: number, gen: () => unknown) => chance(p) && (o[key] = gen());
  set("indent", 0.4, () => pick([1, 2, 3, 4, 8, 10, 12, 0, 2.5, -3]));
  set("noArrayIndent", 0.3, () => chance(0.8));
  set("skipInvalid", 0.4, () => chance(0.8));
  set("flowLevel", 0.3, () => pick([-1, 0, 1, 2, 3, null]));
  set("styles", 0.25, () => {
    const s: Record<string, unknown> = {};
    for (let i = int(3) + 1; i--;) s[pick(styleTags)] = pick(styleNames);
    return s;
  });
  set("sortKeys", 0.3, () => pick(sorters));
  set("lineWidth", 0.5, () => pick([-1, 0, 10, 20, 40, 60, 80, 120, -5, 1]));
  set("noRefs", 0.3, () => chance(0.8));
  set("noCompatMode", 0.3, () => chance(0.8));
  set("condenseFlow", 0.3, () => chance(0.8));
  set("quotingType", 0.4, () => pick(['"', "'", "x"]));
  set("forceQuotes", 0.3, () => chance(0.8));
  set("replacer", 0.2, () => pick(replacers));
  const [mine, theirs] = pick(schemas);
  if (mine)
    return [
      { ...o, schema: mine },
      { ...o, schema: theirs },
    ];
  return [o, o];
}

function run(f: () => string): string {
  try {
    return f();
  } catch (error: any) {
    return `ERROR ${error?.name} ${error?.message}`;
  }
}

for (const options of [
  {},
  { quotingType: '"' },
  { forceQuotes: true },
  { lineWidth: -1 },
  { flowLevel: 0 },
] as const)
  expectWritten(CR_VALUES, (value) => [
    run(() => js.dump(value, options)),
    run(() => tiny.dump(value, options)),
  ]);

let failures = 0;
let thrown = 0;
for (let i = 0; i < cases; i++) {
  const [mine, theirs] = options();
  const pool: object[] = [];
  const input = value(0, pool);
  // Cycles without anchors overflow the stack, which is slow; keep a few.
  if (chance(mine.noRefs ? 0.002 : 0.05) && pool.length) (pick(pool) as any)[0] = pick(pool);
  const got = run(() => tiny.dump(input, mine as any));
  const want = run(() => js.dump(input, theirs));
  if (got === want && want.startsWith("ERROR")) thrown++;
  if (got !== want) {
    if (++failures <= 5)
      console.log(
        `case ${i}\noptions ${JSON.stringify(mine, (k, v) => (typeof v === "function" ? String(v) : k === "schema" ? "[schema]" : v))}\n--- tinyaml\n${got}\n--- js-yaml\n${want}\n`,
      );
  }
}
console.log(
  `${cases} cases, seed ${process.argv[3] ?? 1}: ${failures} disagreements, ${thrown} where both throw the same error`,
);
expectCount("disagreements", failures, 0);
