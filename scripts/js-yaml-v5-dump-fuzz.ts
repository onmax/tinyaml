// Differential fuzzing of `dump` against js-yaml 5.5.0: random values and
// random option sets, compared on output text or on the thrown message.
// Usage: node scripts/js-yaml-v5-dump-fuzz.ts [cases] [seed]
import * as real from "js-yaml5";
import * as tiny from "../src/js-yaml-v5/index.ts";
import {
  CR_VALUES,
  expectCount,
  expectWritten,
  iterationsArg,
  mulberry32,
  seedArg,
} from "./support.ts";

const cases = iterationsArg(process.argv[2], 50000);
const rand = mulberry32(seedArg(process.argv[3]));
const int = (n: number) => Math.floor(rand() * n);
const pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
const chance = (p: number) => rand() < p;

class Point {
  declare x: number;
  declare y: number;
  constructor(x: number, y: number) {
    Object.assign(this, { x, y });
  }
}
class Tagged {
  declare kind: string;
  constructor(kind: string) {
    this.kind = kind;
  }
}

type Lib = typeof real | typeof tiny;

// The same custom tags and schemas, built with each library's factories.
function schemas(lib: Lib): unknown[] {
  const any = lib as any;
  const point = any.defineMappingTag("!point", {
    create: () => ({}),
    addPair: () => "",
    has: () => false,
    keys: () => [],
    get: () => null,
    identify: (p: unknown) => p instanceof Point,
    represent: (p: Point) =>
      new Map<unknown, unknown>([
        ["x", p.x],
        [p.y, [p.x]],
      ]),
  });
  const pair = any.defineSequenceTag("tag:example.com,2000:pair", {
    create: () => [],
    addItem: () => {},
    identify: (p: unknown) => p instanceof Point && p.x > 5,
    represent: (p: Point) => [p.x, p.y],
  });
  const prefixed = any.defineScalarTag("!t/", {
    matchByTagPrefix: true,
    resolve: (s: string) => s,
    identify: (t: unknown) => t instanceof Tagged,
    represent: (t: Tagged) => (t.kind === "empty" ? "" : `${t.kind} value`),
    representTagName: (t: Tagged) => `!t/${t.kind} \u00FC,[]`,
  });
  const word = any.defineScalarTag("tag:yaml.org,2002:word", {
    implicit: true,
    implicitFirstChars: ["w"],
    resolve: (s: string) => (s === "word" ? "WORD" : lib.NOT_RESOLVED),
    identify: (s: unknown) => s === "WORD",
    represent: () => "word",
  });
  return [
    undefined,
    lib.DUMP_SCHEMA,
    lib.CORE_SCHEMA,
    lib.JSON_SCHEMA,
    lib.FAILSAFE_SCHEMA,
    lib.YAML11_SCHEMA,
    lib.CORE_SCHEMA.withTags(lib.realMapTag as never),
    lib.DUMP_SCHEMA.withTags(lib.legacyMapTag as never),
    lib.DUMP_SCHEMA.withTags(point, pair, prefixed, word),
  ];
}
const schemaSets = [schemas(tiny), schemas(real)];

const pieces = [
  ..."abcxyzABZ019_.-+:#?,[]{}&*!|>'\"%@`=~<\\/ \t\n\r\0\x07\x1B\x7F\x85\xA0\u2028\u2029\uFEFF\uFFFE\uFFFF".split(
    "",
  ),
  "\uD800",
  "\uDC00",
  "\u00E9",
  "\u65E5\u672C",
  "\u{1F600}",
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
  "=",
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
  "word",
  "=",
];

// Words, runs of spaces and line breaks, for folding.
function prose(): string {
  let s = chance(0.2) ? pick([" ", "\n", "  "]) : "";
  for (let n = int(80); n--;) {
    s += "abcdefghijklmnopqrstuvwxyz".slice(0, 1 + int(14));
    s += chance(0.85) ? " " : pick(["  ", "\n", "\n\n", "\n  ", " \n", "\n\n\n", "", "\t"]);
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
      return chance(0.7) ? new Date(int(2 ** 40)) : new Date(-8.64e15);
    case 8:
      return new Uint8Array(Array.from({ length: int(70) }, () => int(256)));
    case 9:
      if (chance(0.5)) return str();
      return pick([
        new String(str()),
        new Number(pick(numbers)),
        new Boolean(chance(0.5)),
        10n,
        /re/,
      ]);
    case 10:
      return pick([new Point(int(10), 2), new Tagged(pick(["a", "empty", "x y"])), "WORD"]);
    default:
      return str();
  }
}

function value(depth: number, pool: object[]): unknown {
  if (depth > 3 || chance(0.35)) return scalar();
  if (pool.length && chance(0.08)) return pick(pool);
  const r = rand();
  if (r < 0.45) {
    const list: unknown[] = [];
    for (let n = int(5); n--;) list.push(value(depth + 1, pool));
    if (chance(0.05)) list.length += 2;
    pool.push(list);
    return list;
  }
  if (r < 0.55) {
    const map = new Map<unknown, unknown>();
    for (let n = int(4); n--;)
      map.set(chance(0.5) ? str() : value(depth + 1, pool), value(depth + 1, pool));
    pool.push(map);
    return map;
  }
  if (r < 0.62) {
    const set = new Set<unknown>();
    for (let n = int(4); n--;) set.add(chance(0.7) ? str() : value(depth + 1, pool));
    pool.push(set);
    return set;
  }
  const object: Record<string, unknown> = chance(0.05) ? Object.create(null) : {};
  for (let n = int(5); n--;)
    object[chance(0.02) ? "k".repeat(1030) : str()] = value(depth + 1, pool);
  pool.push(object);
  return object;
}

const sorters = [true, false, (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0), 1];

// Transforms that only touch node fields, so each library's AST takes them.
const transforms = [
  (docs: any[]) => {
    for (const doc of docs) doc.explicitStart = true;
  },
  (docs: any[]) => {
    for (const doc of docs) {
      doc.explicitEnd = true;
      doc.directives = [{ kind: "yaml", version: "1.2" }];
    }
  },
  (docs: any[]) => {
    const walk = (node: any) => {
      if (!node) return;
      if (node.kind === "scalar" && node.value.length > 3) node.style = 1 + (node.value.length % 5);
      if (node.kind === "sequence" && node.items.length > 2) node.style = 2;
      for (const item of node.items ?? []) {
        if (!item.key) walk(item);
        else {
          walk(item.key);
          walk(item.value);
        }
      }
    };
    walk(docs[0].contents);
  },
  (docs: any[]) => {
    docs.push({
      contents: null,
      directives: [{ kind: "tag", handle: "!e!", prefix: "tag:example.com,2000:" }],
    });
    docs.push({ ...docs[0] });
  },
];

// Rules that wrap each library's own defaults, so they stay comparable.
function rules(lib: Lib, choice: number) {
  const defaults = Object.values((lib as any).DEFAULT_SCALAR_STYLE_RULES) as Array<
    (l: any) => void
  >;
  if (choice === 0) return [...defaults].reverse();
  if (choice === 1) return defaults.slice(0, 3);
  return [
    (layout: any) => {
      if (layout.node.value.includes("a") && layout.allowedStylesMask & (1 << 4)) layout.style = 4;
    },
    ...defaults,
  ];
}

function options(): [Record<string, unknown>, Record<string, unknown>] {
  const o: Record<string, unknown> = {};
  const set = (key: string, p: number, gen: () => unknown) => chance(p) && (o[key] = gen());
  set("indent", 0.4, () => pick([1, 2, 3, 4, 8, 10, 12, 2.5]));
  set("seqNoIndent", 0.3, () => chance(0.8));
  set("seqInlineFirst", 0.2, () => chance(0.3));
  set("lineWidth", 0.5, () => pick([-1, 0, 10, 20, 40, 60, 80, 120, 1]));
  set("flowBracketPadding", 0.2, () => chance(0.8));
  set("flowSkipCommaSpace", 0.2, () => chance(0.8));
  set("flowSkipColonSpace", 0.2, () => chance(0.8));
  set("quoteFlowKeys", 0.2, () => chance(0.8));
  set("quoteStyle", 0.4, () => pick(["single", "double"]));
  set("forceQuotes", 0.3, () => chance(0.8));
  set("tagBeforeAnchor", 0.2, () => chance(0.8));
  set("skipInvalid", 0.4, () => chance(0.8));
  set("noRefs", 0.3, () => chance(0.8));
  set("flowLevel", 0.3, () => pick([-1, 0, 1, 2, 3]));
  set("sortKeys", 0.3, () => pick(sorters));
  set("transform", 0.15, () => pick(transforms));
  const ruleChoice = chance(0.1) ? int(3) : -1;
  const s = int(schemaSets[0]!.length);
  const [mine, theirs] = [{ ...o }, { ...o }];
  if (s) {
    mine.schema = schemaSets[0]![s];
    theirs.schema = schemaSets[1]![s];
  }
  if (ruleChoice >= 0) {
    mine.scalarStyleRules = rules(tiny, ruleChoice);
    theirs.scalarStyleRules = rules(real, ruleChoice);
  }
  return [mine, theirs];
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
  { quoteStyle: "double" },
  { forceQuotes: true },
  { lineWidth: -1 },
  { flowLevel: 0 },
] as const)
  expectWritten(CR_VALUES, (value) => [
    run(() => real.dump(value, options)),
    run(() => tiny.dump(value, options)),
  ]);

let failures = 0;
let thrown = 0;
for (let i = 0; i < cases; i++) {
  const [mine, theirs] = options();
  const pool: object[] = [];
  const input = value(0, pool);
  // Cycles without anchors overflow the stack, which is slow; keep a few.
  if (chance(mine.noRefs ? 0.002 : 0.05) && pool.length) {
    const target = pick(pool) as any;
    if (Array.isArray(target)) target[0] = pick(pool);
  }
  const got = run(() => tiny.dump(input, mine as tiny.DumpOptions));
  const want = run(() => real.dump(input, theirs as real.DumpOptions));
  // Both overflowing the stack on a cycle is agreement.
  const agree =
    got === want || (got.startsWith("ERROR RangeError") && want.startsWith("ERROR RangeError"));
  if (agree && want.startsWith("ERROR")) thrown++;
  if (!agree) {
    if (++failures <= Number(process.env.SHOW ?? 5))
      console.log(
        `case ${i}\noptions ${JSON.stringify(mine, (k, v) => (typeof v === "function" ? String(v).slice(0, 60) : k === "schema" ? "[schema]" : v))}\n--- tinyaml\n${got}\n--- js-yaml 5\n${want}\n`,
      );
  }
}
console.log(
  `${cases} cases, seed ${process.argv[3] ?? 1}: ${failures} disagreements, ${thrown} where both throw the same error`,
);
expectCount("disagreements", failures, 0);
