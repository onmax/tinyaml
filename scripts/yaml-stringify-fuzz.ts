// Differential fuzzing of `stringify` against the `yaml` package: random
// values and random option sets, compared on output text or on the thrown
// error's type and message. Any difference fails the run.
// Usage: node --no-warnings scripts/yaml-stringify-fuzz.ts [cases] [seed]
import * as yaml from "yaml";
import { stringify } from "../src/yaml/index.ts";
import {
  CR_VALUES,
  expectCount,
  expectWritten,
  iterationsArg,
  mulberry32,
  seedArg,
} from "./support.ts";

const cases = iterationsArg(process.argv[2], 20000);
const rand = mulberry32(seedArg(process.argv[3]));
const int = (n: number) => Math.floor(rand() * n);
const pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
const chance = (p: number) => rand() < p;

const words = [
  "",
  " ",
  "a",
  "foo",
  "foo bar",
  "true",
  "False",
  "null",
  "~",
  "yes",
  "no",
  "on",
  "12",
  "-0",
  "0x1F",
  "0o17",
  "1e3",
  ".5",
  "1.0",
  ".inf",
  ".NaN",
  "<<",
  "2001-12-14",
  "1:30",
  "0777",
  "-",
  "?",
  ":",
  "- a",
  "? a",
  "a: b",
  "a:b",
  "a #b",
  "#c",
  "&a",
  "*a",
  "!t",
  "|",
  ">",
  "'",
  '"',
  "%",
  "@",
  "`",
  "---",
  "...",
  "--- x",
  "[a]",
  "{a}",
  "a,b",
  "x\ty",
  "\t",
  "é",
  "日本",
  "😀",
  "\u0085",
  " ",
  "\x00",
  "\x07",
  "\x1b",
  "\x7f",
  "\ud800",
  "\\",
  "a\\nb",
  "\r",
  "\r\n",
  "a\rb",
  "a\r\nb",
  "\\r",
  "a\\r\rb",
];
const pieces = [
  " ",
  "  ",
  "\n",
  "\n\n",
  " \n",
  "\n ",
  "\r",
  "\r\n",
  " \r\n",
  "\t",
  "-",
  ":",
  "#",
  "'",
  '"',
  ",",
];

function randomString(): string {
  if (chance(0.5)) return pick(words);
  if (chance(0.1)) {
    // Paragraphs, indented lines and runs of line breaks, for block scalars.
    const lines = Array.from({ length: 1 + int(5) }, () =>
      pick(["", " ", "  indented", "\ttab", "text", "word ".repeat(int(20)), "#", "- item"]),
    );
    return (
      lines.join(pick(["\n", "\n\n", "\n \n", "\r\n", "\r"])) +
      pick(["", "\n", "\n\n", " ", "\r\n"])
    );
  }
  let s = "";
  for (let n = int(8); n >= 0; n--) {
    s += chance(0.6) ? pick(words) : pick(pieces);
    if (chance(0.3)) s += "x".repeat(int(30));
    if (chance(0.15)) s += " word".repeat(int(25));
  }
  return s;
}

function randomScalar(): unknown {
  switch (int(12)) {
    case 0:
      return null;
    case 1:
      return chance(0.5);
    case 2:
      return int(2000) - 1000;
    case 3:
      return pick([0.5, -0, 1e21, 1e-7, 3.14159, NaN, Infinity, -Infinity, 2 ** 53, 123.456e10]);
    case 4:
      return BigInt(int(1e6)) * 1000000007n;
    case 5:
      return undefined;
    case 6:
      return new Date(Date.UTC(2000 + int(30), int(12), 1 + int(28), int(24), int(60)));
    case 7:
      return chance(0.5) ? new String("boxed") : new Number(int(10));
    default:
      return randomString();
  }
}

// yaml writes Sets, Maps and Uint8Arrays with YAML 1.1 tags under that
// schema, which tinyaml doesn't; leave them out there.
let v11 = false;

function randomValue(depth: number, shared: object[]): unknown {
  if (shared.length && chance(0.05)) return pick(shared);
  if (depth > 3 || chance(0.4)) return randomScalar();
  let value: object;
  const kind = int(10);
  if (kind < 4) {
    value = Array.from({ length: int(5) }, () => randomValue(depth + 1, shared));
  } else if (kind === 4 && !v11) {
    value = new Map(
      Array.from({ length: int(4) }, () => [
        chance(0.7) ? randomString() : randomValue(depth + 1, shared),
        randomValue(depth + 1, shared),
      ]),
    );
  } else if (kind === 5 && !v11) {
    value = new Set(Array.from({ length: int(4) }, () => randomValue(depth + 1, shared)));
  } else {
    const obj: Record<string, unknown> = {};
    for (let n = int(6); n > 0; n--) obj[randomString()] = randomValue(depth + 1, shared);
    value = obj;
  }
  shared.push(value);
  return value;
}

const optionValues: Record<string, unknown[]> = {
  indent: [1, 2, 3, 4, 8],
  lineWidth: [0, 10, 20, 40, 80, 120, -1],
  minContentWidth: [0, 5, 20, 40],
  defaultStringType: ["PLAIN", "QUOTE_DOUBLE", "QUOTE_SINGLE", "BLOCK_LITERAL", "BLOCK_FOLDED"],
  defaultKeyType: [null, "PLAIN", "QUOTE_DOUBLE", "QUOTE_SINGLE"],
  nullStr: ["null", "~", "", "NULL"],
  trueStr: ["true", "True"],
  falseStr: ["false", "FALSE"],
  indentSeq: [true, false],
  flowCollectionPadding: [true, false],
  doubleQuotedAsJSON: [true, false],
  doubleQuotedMinMultiLineLength: [0, 10, 40],
  singleQuote: [null, true, false],
  blockQuote: [true, false, "folded", "literal"],
  sortMapEntries: [true, false],
  keepUndefined: [true, false],
  collectionStyle: ["any", "block", "flow"],
  simpleKeys: [true, false],
  aliasDuplicateObjects: [true, false],
  anchorPrefix: ["a", "ref", "x_"],
  directives: [true, false, null],
  trailingComma: [true, false],
  flow: [true, false],
  merge: [true, false],
  schema: ["core", "core", "json", "yaml-1.1", "failsafe"],
  version: ["1.1", "1.2"],
  verifyAliasOrder: [true, false],
};
const keys = Object.keys(optionValues);

function attempt(fn: () => unknown): string {
  try {
    const out = fn();
    return out === undefined ? "undefined" : JSON.stringify(out);
  } catch (error: any) {
    return `ERROR ${error?.name}: ${error?.message}`;
  }
}

const stringTypes = optionValues.defaultStringType!.map((type) => ({ defaultStringType: type }));
for (const options of [{}, ...stringTypes, { blockQuote: false }, { doubleQuotedAsJSON: true }])
  expectWritten(CR_VALUES, (value) => [
    attempt(() => yaml.stringify(value, options as yaml.ToStringOptions)),
    attempt(() => stringify(value, options as never)),
  ]);

const failures = new Map<string, string>();
let same = 0;
let sameError = 0;
for (let i = 0; i < cases; i++) {
  const options: Record<string, unknown> = {};
  for (let n = int(5); n > 0; n--) {
    const key = pick(keys);
    options[key] = pick(optionValues[key]!);
  }
  v11 = options.schema === "yaml-1.1" || options.version === "1.1";
  const shared: object[] = [];
  const value = randomValue(0, shared);
  const replacer = chance(0.05)
    ? (_: unknown, v: unknown) => (typeof v === "number" ? v * 2 : v)
    : chance(0.03)
      ? ["a", "foo", 12, "true"]
      : null;
  // Sometimes the indent alone, as a number or a string.
  const third = chance(0.03) ? pick([0, 1, 3, 9, 2.6, "", "  ", "\t\t\t"]) : options;
  const expected = attempt(() => yaml.stringify(value, replacer, third as never));
  const actual = attempt(() => stringify(value, replacer, third as never));
  if (expected === actual) {
    if (expected.startsWith("ERROR")) sameError++;
    else same++;
    continue;
  }
  const key = `${JSON.stringify(options)}`;
  if (!failures.has(key + expected))
    failures.set(
      key + expected,
      `${key}\n  value:   ${String(attempt(() => yaml.stringify(value, { lineWidth: 0 })))}\n  yaml:    ${expected}\n  tinyaml: ${actual}`,
    );
}
const shown = [...failures.values()]
  .sort((a, b) => a.length - b.length)
  .slice(0, Number(process.env.SHOW ?? 10));
for (const diff of shown) console.log(`--- ${diff}`);
console.log(
  `${cases} values, seed ${process.argv[3] ?? 1}: ${same} same output, ${sameError} same error, ${cases - same - sameError} differ`,
);
expectCount("values that differ", cases - same - sameError, 0);
