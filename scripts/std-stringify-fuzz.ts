// Differential fuzzing of tinyaml/std's `stringify` against @std/yaml 1.3.0:
// random values and random option sets, compared on output text or on the
// thrown error's type and message. Any difference fails the run.
// Usage: node scripts/std-stringify-fuzz.ts [cases] [seed]
import * as std from "@std/yaml";
import { stringify } from "../src/std/index.ts";
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

const PIECES = [
  "a",
  "b",
  "key",
  "word",
  " ",
  "  ",
  "\n",
  "\n\n",
  "\t",
  ":",
  ": ",
  "#",
  " #",
  "-",
  "- ",
  "?",
  "!",
  "&",
  "*",
  "|",
  ">",
  "'",
  '"',
  "%",
  "@",
  "`",
  ",",
  "[",
  "]",
  "{",
  "}",
  "\\",
  "yes",
  "No",
  "on",
  "y",
  "~",
  "null",
  "True",
  "1",
  "0",
  "-1",
  "1_000",
  "0x1F",
  "0o7",
  "017",
  "1:30",
  "1.5",
  ".5",
  "1e5",
  ".inf",
  ".NaN",
  "2001-01-01",
  "2001-12-14t21:59:43.10-05:00",
  "<<",
  "=",
  "é",
  "😀",
  "\u0085",
  "\xA0",
  "\u2028",
  "\uFEFF",
  "\x00",
  "\x03",
  "\x07",
  "\x1B",
  "\x7F",
  "\x9F",
  "\uFFFE",
  "\uD800",
  "\uDC00",
  "\r",
  "\r\n",
  "/re/g",
  "lorem ipsum dolor sit amet",
  "x".repeat(50),
];
function text(): string {
  let s = "";
  for (let n = int(chance(0.1) ? 40 : 6); n >= 0; n--) s += pick(PIECES);
  return chance(0.1) ? "" : s;
}
const leaves: (() => unknown)[] = [
  text,
  text,
  text,
  () => int(2000) - 1000,
  () => pick([0, -0, 1.5, -2.25, NaN, Infinity, -Infinity, 1e21, 5e-324, 2 ** 53, -(2 ** 31)]),
  () => chance(0.5),
  () => null,
  () => undefined,
  () => new Date(int(2) ? 0 : 1e12 + int(1e9)),
  () => new Uint8Array(Array.from({ length: int(70) }, () => int(256))),
  () => /ab+c/gi,
  () => () => 1,
  () => Symbol("s"),
  () => BigInt(5),
  () => new String(text()),
  () => new Number(int(10)),
  () => new Boolean(chance(0.5)),
];

function value(depth: number, shared: object[]): unknown {
  if (shared.length && chance(0.05)) return pick(shared);
  if (depth > 3 || chance(0.4)) return pick(leaves)();
  let result: any;
  if (chance(0.5)) {
    result = [];
    for (let n = int(4); n > 0; n--) result.push(value(depth + 1, shared));
  } else {
    result = {};
    for (let n = int(4); n > 0; n--)
      result[chance(0.05) ? "k".repeat(1030) : text()] = value(depth + 1, shared);
  }
  shared.push(result);
  if (chance(0.02)) result[Array.isArray(result) ? result.length : "self"] = result;
  return result;
}

const STYLES = [
  "lowercase",
  "uppercase",
  "camelcase",
  "decimal",
  "binary",
  "octal",
  "hexadecimal",
  "bogus",
];
function options(): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (chance(0.3)) o.indent = pick([0, 1, 2, 3, 4, 8, 10, 12, 2.5]);
  if (chance(0.3)) o.arrayIndent = chance(0.5);
  if (chance(0.3)) o.skipInvalid = chance(0.5);
  if (chance(0.3)) o.flowLevel = pick([-1, 0, 1, 2, 3]);
  if (chance(0.2)) {
    const styles: Record<string, string> = {};
    for (const tag of ["!!int", "!!float", "!!bool", "!!null", "tag:yaml.org,2002:int"])
      if (chance(0.4)) styles[tag] = pick(STYLES);
    o.styles = styles;
  }
  if (chance(0.3)) o.schema = pick(["failsafe", "json", "core", "default", "extended"]);
  if (chance(0.2))
    o.sortKeys = pick([true, false, (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0), "yes"]);
  if (chance(0.4)) o.lineWidth = pick([-1, 0, 10, 20, 40, 60, 80, 200]);
  if (chance(0.2)) o.useAnchors = chance(0.5);
  if (chance(0.2)) o.compatMode = chance(0.5);
  if (chance(0.2)) o.condenseFlow = chance(0.5);
  if (chance(0.2)) o.quoteStyle = pick(["'", '"']);
  return o;
}

function attempt(fn: () => string): string {
  try {
    return fn();
  } catch (error) {
    return `THROW ${(error as Error)?.constructor?.name}: ${(error as Error)?.message}`;
  }
}

for (const o of [{}, { quoteStyle: '"' }, { lineWidth: -1 }, { flowLevel: 0 }] as const)
  expectWritten(CR_VALUES, (value) => [
    attempt(() => std.stringify(value, o)),
    attempt(() => stringify(value, o)),
  ]);

let differ = 0;
let thrown = 0;
const shown: string[] = [];
for (let i = 0; i < cases; i++) {
  const input = value(0, []);
  const o = options();
  const expected = attempt(() => std.stringify(input, o));
  const actual = attempt(() => stringify(input, o));
  // Both overflowing the stack on a cycle is agreement.
  if (
    expected === actual ||
    (expected.startsWith("THROW RangeError") && actual.startsWith("THROW RangeError"))
  ) {
    if (expected.startsWith("THROW")) thrown++;
    continue;
  }
  differ++;
  if (shown.length < Number(process.env.SHOW ?? 10))
    shown.push(
      `--- ${JSON.stringify(o)} ${String(JSON.stringify(input, (_, v) => (typeof v === "bigint" ? `${v}n` : v)))?.slice(0, 300)}\n  std:     ${JSON.stringify(expected).slice(0, 600)}\n  tinyaml: ${JSON.stringify(actual).slice(0, 600)}`,
    );
}
console.log(shown.join("\n"));
console.log(
  `${cases} values: ${cases - differ - thrown} same output, ${thrown} same error, ${differ} differ from @std/yaml`,
);
expectCount("values that differ", differ, 0);
