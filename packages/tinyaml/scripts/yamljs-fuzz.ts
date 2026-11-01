// Differential fuzzing of tinyaml/yamljs's `parse` against yamljs 0.3.0 on
// config-like YAML: random JSON-like values written by yamljs's own
// stringify and by js-yaml's dump, then mutated the way hand-edited files
// drift (comments, blank lines, quotes removed, indentation, CRLF or lone
// CR line breaks, `---`).
//
// Each case is sorted as: same; lenient (only yamljs throws); stricter (only
// tinyaml throws); differ; crash (tinyaml throws something other than a
// ParseException); and where both throw, the fields of the errors that
// differ, message, position (parsedLine) or snippet, if any. Differences
// of a known kind are named by kind, see LEAF
// and DOCUMENT; anything else is printed, and a stricter, differing or
// crashing case fails the run. Each lenient case, each of a known kind and
// each pair of differing errors is recorded, with both outcomes, in scripts/baselines/yamljs-fuzz.json (see
// baseline.ts), and an unrecorded one, or a recorded one that's gone, fails
// the run too.
// Usage: node scripts/yamljs-fuzz.ts [cases] [seed] [-v] [--update]
// After a deliberate change, `node scripts/yamljs-fuzz.ts 5000 1 --update`,
// or `UPDATE=1 pnpm compare`, rewrites the records; review the diff.
import { createRequire } from "node:module";
import * as jsyaml from "js-yaml";
import { parse, ParseException } from "../src/yamljs/index.ts";
import { Baseline, describe, describeError, positional } from "./baseline.ts";
import {
  ALIASED,
  equal,
  errorDifference,
  expectAliases,
  expectCount,
  iterationsArg,
  mulberry32,
  onPurpose,
  seedArg,
  withBreaks,
} from "./support.ts";

const yamljs = createRequire(import.meta.url)("yamljs") as {
  parse(input: string): unknown;
  stringify(value: unknown, inline?: number, indent?: number): string;
};

const args = positional.filter((a) => a !== "-v");
const verbose = process.argv.includes("-v");
const cases = iterationsArg(args[0], 20000);
const seed = seedArg(args[1]);
const rand = mulberry32(seed);
const int = (n: number) => Math.floor(rand() * n);
const pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
const chance = (p: number) => rand() < p;

const WORDS = [
  "name",
  "version",
  "port",
  "host",
  "enabled",
  "debug",
  "path",
  "url",
  "title",
  "description",
  "tags",
  "author",
  "items",
  "env",
  "build",
  "deps",
  "id",
  "key with spaces",
  "a-b",
  "a_b",
  "x.y",
  "1",
  "007",
  "true",
  "null",
];
const SCALARS = [
  "hello",
  "hello world",
  "Hello, World!",
  "Foo: Bar",
  "@scope/pkg",
  "%Y-%m-%d",
  "`cmd`",
  "C:\\Users\\me",
  "http://example.com:8080/a?b=c#d",
  "user@example.com",
  "yes",
  "no",
  "on",
  "off",
  "Yes",
  "~",
  "null",
  "NULL",
  "true",
  "False",
  "0",
  "00",
  "08",
  "012",
  "0x1F",
  "0o17",
  "0b101",
  "1,000",
  "1_000",
  "1e3",
  "1.5",
  "-1.5",
  "+3",
  "-012",
  ".5",
  "1.",
  ".inf",
  "-.inf",
  ".NaN",
  "Infinity",
  "2001-12-14",
  "2001-12-14t21:59:43.10-05:00",
  "2001-12-14 21:59:43.10 -5",
  "12:30:45",
  "1.2.3",
  "^1.2.3",
  "~1.2",
  ">=2",
  "a # not comment",
  "a#b",
  "x: y: z",
  "- item",
  "? q",
  "*star",
  "&amp",
  "!bang",
  "[x]",
  "{x}",
  "it's",
  'say "hi"',
  "tab\there",
  "line\nbreak",
  "two\n\nbreaks",
  "trailing ",
  " leading",
  "",
  "ünïcödé ☺",
  "\u00e9t\u00e9",
  "emoji 😀",
  "very long text that goes on and on and on so that js-yaml has to fold it across more than one line when dumping",
];

function scalar(): unknown {
  switch (int(8)) {
    case 0:
      return int(1000);
    case 1:
      return pick([0, -1, 1.5, -0.25, 1e21, 3.14159, 100000, 0.1]);
    case 2:
      return chance(0.5);
    case 3:
      return null;
    default:
      return pick(SCALARS);
  }
}

function value(depth: number): unknown {
  if (depth > 3 || chance(0.35)) return scalar();
  if (chance(0.4)) return Array.from({ length: int(4) }, () => value(depth + 1));
  const object: Record<string, unknown> = {};
  for (let n = int(5); n > 0; n--) object[pick(WORDS)] = value(depth + 1);
  return object;
}

function write(data: unknown): string {
  if (chance(0.5)) return yamljs.stringify(data, int(6), 2 + int(3));
  return jsyaml.dump(data, {
    indent: 2 + int(3),
    flowLevel: chance(0.2) ? int(3) : -1,
    lineWidth: chance(0.3) ? -1 : 80,
    noArrayIndent: chance(0.3),
    quotingType: chance(0.5) ? '"' : "'",
    forceQuotes: chance(0.1),
  });
}

const MUTATIONS: ((lines: string[]) => void)[] = [
  // A comment line.
  (lines) =>
    lines.splice(int(lines.length + 1), 0, `${" ".repeat(int(4))}# note: ${pick(SCALARS)}`),
  // A trailing comment.
  (lines) => {
    const i = int(lines.length);
    if (lines[i] && !/[|>][-+]?\d*$/.test(lines[i]!)) lines[i] += ` # ${pick(WORDS)}`;
  },
  // A blank line.
  (lines) => lines.splice(int(lines.length + 1), 0, chance(0.5) ? "" : "   "),
  // Quotes removed.
  (lines) => {
    const i = int(lines.length);
    lines[i] = lines[i]?.replace(/(: |- )(['"])(.*)\2$/, "$1$3") ?? "";
  },
  // A value replaced by a raw scalar, as someone would type it.
  (lines) => {
    const i = int(lines.length);
    lines[i] =
      lines[i]?.replace(/^(\s*(?:- )*[^:#'"]+: ).+$/, `$1${pick(SCALARS).split("\n")[0]}`) ?? "";
  },
  // Trailing spaces.
  (lines) => {
    const i = int(lines.length);
    if (lines[i] !== undefined) lines[i] += " ".repeat(1 + int(3));
  },
  // Document markers.
  (lines) => (chance(0.5) ? lines.unshift("---") : lines.push("...")),
  // The whole document indented.
  (lines) => lines.forEach((line, i) => (lines[i] = line && `  ${line}`)),
  // A duplicate key.
  (lines) => {
    const i = int(lines.length);
    if (lines[i] && /^\s*[\w ]+: \S/.test(lines[i]!)) lines.splice(i + 1, 0, lines[i]!);
  },
];

function mutate(text: string): string {
  const lines = text.split("\n");
  for (let n = int(4); n > 0; n--) pick(MUTATIONS)(lines);
  return withBreaks(lines.join("\n"), rand);
}

type Outcome =
  | { ok: true; value: unknown }
  | { ok: false; error: string; fields: Record<string, unknown>; crash: boolean };
// yamljs throws whatever it throws; tinyaml/yamljs must throw a ParseException.
function run(fn: () => unknown, type?: typeof ParseException): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    const crash = !!type && !onPurpose(error, [type]);
    const message = String((error as Error)?.message ?? error);
    const { parsedLine, snippet } = error as Partial<ParseException>;
    return { ok: false, error: message, fields: { message, parsedLine, snippet }, crash };
  }
}
const GROUPS = { message: ["message"], position: ["parsedLine"], snippet: ["snippet"] };

// Known, deliberate differences: yamljs bugs tinyaml doesn't copy. A leaf
// test accepts a pair of differing values or keys anywhere in the result; a
// document test looks at the whole case.
const isString = (a: unknown): a is string => typeof a === "string";
const LEAF: Record<string, (a: unknown, b: unknown) => boolean> = {
  // yamljs keeps the line breaks of multi-line plain and quoted scalars, and
  // of folded block scalars with more-indented lines.
  "line folding": (a, b) =>
    isString(a) && isString(b) && a.replace(/\s+/g, " ") === b.replace(/\s+/g, " "),
  // yamljs trims trailing white space off the last line of a block scalar.
  "block scalar trailing spaces": (a, b) =>
    isString(a) && isString(b) && a.trimEnd() === b.trimEnd(),
  // yamljs reads `- - a` as the string "- a".
  "nested compact sequences": (a, b) => isString(a) && a.startsWith("- ") && Array.isArray(b),
  // yamljs reads `- ? a` as the string "? a".
  "explicit keys": (a, b) => isString(a) && a.startsWith("? ") && typeof b === "object",
  // yamljs writes \x, \u and \U escapes as UTF-8 bytes, one character each.
  "unicode escapes": (a, b) =>
    isString(a) && isString(b) && a === Buffer.from(b, "utf8").toString("latin1"),
};
const DOCUMENT: Record<string, (theirs: unknown, ours: unknown, text: string) => boolean> = {
  // yamljs reads a two-line document as its first line, even if that is
  // blank or a comment, and reads indented comments as content elsewhere.
  "comments read as content": (theirs, ours) =>
    /ote/.test(JSON.stringify(theirs)) && !/ote/.test(JSON.stringify(ours)),
  "two-line documents": (theirs) => theirs === "" || (isString(theirs) && theirs[0] === "#"),
  // In a one-line flow document, yamljs takes quoted strings starting with *
  // for aliases.
  "quoted aliases": (_, __, text) =>
    /^[^\n]*['"]\*[^\n]*$/.test(text.replace(/^---.*\n/gm, "").trim()),
  // yamljs splits a flow mapping key at its first space: `{a b: c}` is
  // {a: "b: c"}, and the rest of the mapping goes wrong with it.
  "flow keys with spaces": (_, __, text) => /[{,] *[^\s'"{}[\],:]+ [^'"{}[\],:]+:/.test(text),
};
const anyLeaf = (a: unknown, b: unknown) => Object.values(LEAF).some((test) => test(a, b));

function known(theirs: unknown, ours: unknown, text: string): string {
  for (const [kind, test] of Object.entries(DOCUMENT)) if (test(theirs, ours, text)) return kind;
  if (!similar(theirs, ours, anyLeaf)) return "differ";
  for (const [kind, test] of Object.entries(LEAF)) if (similar(theirs, ours, test)) return kind;
  return "several known";
}

// Equal, except where `same` accepts a pair of values or keys.
function similar(a: unknown, b: unknown, same: (a: unknown, b: unknown) => boolean): boolean {
  if (equal(a, b) || same(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b) || a instanceof Date || b instanceof Date) return false;
  if (Array.isArray(a) && a.length !== (b as unknown[]).length) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k, i) =>
      (k === kb[i] || same(k, kb[i])) &&
      similar((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[kb[i]!], same),
  );
}

const counts: Record<string, number> = {
  same: 0,
  lenient: 0,
  stricter: 0,
  differ: 0,
  crash: 0,
};
for (const kind of [...Object.keys(LEAF), ...Object.keys(DOCUMENT), "several known"])
  counts[kind] = 0;
const shown: string[] = [];
const baseline = new Baseline("yamljs-fuzz", `seed ${seed}`, cases);
const tried = new Set<string>();
const outcome = (o: Outcome) => (o.ok ? describe(o.value) : describeError(o.error));
expectAliases(
  ALIASED.slice(0, 3),
  (text) => yamljs.parse(text),
  (text) => parse(text),
);
for (let n = 0; n < cases; n++) {
  const original = write(value(0));
  const text = n % 4 === 0 ? original : mutate(original);
  const theirs = run(() => yamljs.parse(text));
  const ours = run(() => parse(text), ParseException);
  let kind = "same";
  let differs: ReturnType<typeof errorDifference>;
  if (!ours.ok && ours.crash) kind = "crash";
  else if (!theirs.ok && ours.ok) kind = "lenient";
  else if (!theirs.ok && !ours.ok) {
    differs = errorDifference(GROUPS, theirs.fields, ours.fields);
    if (differs) kind = `error ${differs.kind}`;
  } else if (!ours.ok) kind = "stricter";
  else if (theirs.ok && !equal(theirs.value, ours.value))
    kind = known(theirs.value, ours.value, text);
  counts[kind] = (counts[kind] ?? 0) + 1;
  tried.add(text);
  if (!/^(?:same|stricter|differ|crash)$/.test(kind))
    baseline.add(n, kind, text, undefined, {
      yamljs: differs ? describe(differs.sides[0]) : outcome(theirs),
      tinyaml: differs ? describe(differs.sides[1]) : outcome(ours),
    });
  if (/^(?:stricter|differ|crash)$/.test(kind) && (verbose || shown.length < 10)) {
    const show = (o: Outcome) =>
      o.ok ? JSON.stringify(o.value) : `${o.crash ? "CRASH" : "ERROR"} ${o.error}`;
    shown.push(
      `${kind}: ${JSON.stringify(text)}\n  yamljs:  ${show(theirs)}\n  tinyaml: ${show(ours)}`,
    );
  }
}
if (shown.length) console.log(shown.join("\n"));
console.log(
  `${cases} cases, seed ${seed}, ${tried.size} distinct: ${Object.entries(counts)
    .map(([kind, n]) => `${n} ${kind}`)
    .join(", ")}`,
);
for (const kind of ["stricter", "differ", "crash"]) expectCount(`${kind} cases`, counts[kind]!, 0);
baseline.finish();
