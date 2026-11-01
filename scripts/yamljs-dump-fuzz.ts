// Differential fuzzing of tinyaml/yamljs's `stringify` against yamljs 0.3.0:
// random values, odd ones included (control and Unicode characters, numbers
// of every kind, dates, holes, inherited keys, custom objects), with random
// `inline`, `indent` and objectEncoder. The output must match byte for byte,
// or both must throw the same error. Any mismatch fails the run.
// Usage: node scripts/yamljs-dump-fuzz.ts [cases] [seed]
import { createRequire } from "node:module";
import { stringify } from "../src/yamljs/index.ts";
import {
  CR_VALUES,
  expectCount,
  expectWritten,
  iterationsArg,
  mulberry32,
  seedArg,
} from "./support.ts";

const yamljs = createRequire(import.meta.url)("yamljs") as {
  stringify(...args: unknown[]): string;
};

const cases = iterationsArg(process.argv[2], 50000);
const rand = mulberry32(seedArg(process.argv[3]));
const int = (n: number) => Math.floor(rand() * n);
const pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
const chance = (p: number) => rand() < p;

const PIECES = [
  "a",
  "foo",
  "bar baz",
  " ",
  "\t",
  "\n",
  "\r",
  "\r\n",
  "\0",
  "\x07",
  "\x1b",
  "\x1f",
  "\x7f",
  "\x85",
  "\xa0",
  " ",
  " ",
  "\xc2\x85",
  "\xc2\xa0",
  "\xe2\x80\xa8",
  "\xe2\x80\xa9",
  "﻿",
  "'",
  '"',
  "\\",
  ":",
  ": ",
  "#",
  " #",
  "-",
  "- ",
  "?",
  "|",
  ">",
  "<",
  "=",
  "!",
  "%",
  "@",
  "`",
  "&",
  "*",
  "{",
  "}",
  "[",
  "]",
  ",",
  "0",
  "1",
  "123",
  "007",
  "0x1F",
  "1e3",
  "-1",
  "+1",
  ".5",
  "1.",
  "Infinity",
  "NaN",
  "null",
  "Null",
  "~",
  "true",
  "FALSE",
  "yes",
  "2001-12-14",
  "2001-12-14t21:59:43.10-05:00",
  "2001-1-1 1:00:00",
  "é",
  "😀",
  "\ud800",
];

function string(): string {
  if (chance(0.3)) return pick(PIECES);
  let out = "";
  for (let n = 1 + int(4); n > 0; n--) out += pick(PIECES);
  return out;
}

const NUMBERS = [
  0,
  -0,
  1,
  -1,
  7,
  42,
  1.5,
  -2.25,
  0.1,
  1e21,
  1e-7,
  123456789012345680000,
  2 ** 53,
  NaN,
  Infinity,
  -Infinity,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
];

class Point {
  x = 1;
  y = 2;
}
const proto = { inherited: "yes" };

function scalar(): unknown {
  switch (int(chance(0.01) ? 13 : 12)) {
    case 0:
    case 1:
      return pick(NUMBERS);
    case 2:
      return int(100000) * (chance(0.5) ? 1 : -1);
    case 3:
      return chance(0.5);
    case 4:
      return chance(0.5) ? null : undefined;
    case 5:
      return new Date(Date.UTC(1990 + int(40), int(12), 1 + int(28), int(24), int(60)));
    case 12:
      // Values yamljs can't write, or writes oddly.
      return pick([Symbol("s"), () => 1, new Date(NaN), 10n, -5n, 10n ** 30n]);
    default:
      return string();
  }
}

function value(depth: number): unknown {
  if (depth > 4 || chance(0.4)) return scalar();
  const n = int(4);
  switch (int(6)) {
    case 0:
    case 1: {
      const list: unknown[] = [];
      for (let i = 0; i < n; i++) list.push(value(depth + 1));
      // A hole.
      if (chance(0.05)) list.length += 1;
      return list;
    }
    case 2:
      return chance(0.5) ? new Point() : Object.assign(Object.create(proto) as object, { own: 1 });
    default: {
      const object: Record<string, unknown> = {};
      for (let i = 0; i < n; i++)
        object[chance(0.7) ? string() : String(int(10))] = value(depth + 1);
      return object;
    }
  }
}

const encoders = [
  undefined,
  null,
  (v: object) => (v instanceof Point ? `!point ${(v as Point).x}` : undefined),
  (v: object) => (Array.isArray(v) ? v.length : null),
  () => "custom",
];

// The error's type and message, so a crash only matches the same crash.
function attempt(fn: () => string): string {
  try {
    return fn();
  } catch (error) {
    return `THROW ${(error as Error)?.constructor?.name}: ${(error as Error)?.message}`;
  }
}

for (const inline of [undefined, 0, 1, 10])
  expectWritten(CR_VALUES, (value) => [
    attempt(() => yamljs.stringify(value, inline)),
    attempt(() => stringify(value, inline)),
  ]);

let mismatches = 0;
let thrown = 0;
for (let n = 0; n < cases; n++) {
  const input = value(0);
  const args: unknown[] = [input];
  if (chance(0.9)) args.push(pick([undefined, null, -1, 0, 1, 2, 3, 4, 5, 10, 1.5]));
  if (args.length > 1 && chance(0.9)) args.push(pick([undefined, null, 0, 1, 2, 3, 4, 8, 2.5]));
  if (args.length > 2 && chance(0.3)) args.push(chance(0.5), pick(encoders));
  const theirs = attempt(() => yamljs.stringify(...args));
  const ours = attempt(() => (stringify as (...args: unknown[]) => string)(...args));
  if (theirs === ours && theirs.startsWith("THROW")) thrown++;
  if (theirs !== ours && ++mismatches <= 5)
    console.log(
      `mismatch, args ${JSON.stringify(args.slice(1))}:\n${JSON.stringify(theirs)}\n${JSON.stringify(ours)}`,
    );
}
console.log(
  `${cases} cases (seed ${process.argv[3] ?? 1}): ${mismatches} mismatches, ${thrown} where both throw`,
);
expectCount("mismatches", mismatches, 0);
