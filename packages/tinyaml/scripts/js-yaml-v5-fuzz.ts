// Mutation fuzzing against js-yaml 5.5.0: take every yaml-test-suite input,
// apply a few random edits with YAML-significant characters, and check that
// whatever js-yaml 5 loads, tinyaml/js-yaml-v5 loads to the same value, and
// whatever it rejects, tinyaml rejects with a YAMLException. When both
// reject, the reason, mark (position, line and column), snippet and buffer
// are compared too. Each input where they differ, another value, an error
// from one side only (with whether yaml finds the input valid), or an error
// that differs (the kind names the fields), is recorded with its options and
// both outcomes in
// scripts/baselines/js-yaml-v5-fuzz.json (see baseline.ts). An unrecorded
// difference, a recorded one that's gone, or a crash fails the run.
// Usage: node scripts/js-yaml-v5-fuzz.ts [iterations] [seed] [mode] [--update]
// mode: default (no options), schemas (a random schema and options per
// case), depth (a small maxDepth). Each seed and mode has its own records;
// only seed 1's default mode, the one compare.sh runs, is committed. Record
// another before changing tinyaml with `node scripts/js-yaml-v5-fuzz.ts 5000
// 1 <mode> --update`, and rerun without --update after.
// After a deliberate change, `node scripts/js-yaml-v5-fuzz.ts 5000 1
// --update`, or `UPDATE=1 pnpm compare`, rewrites the records; review the diff.
import { inspect } from "node:util";
import * as real from "js-yaml5";
import { parseAllDocuments } from "yaml";
import * as tiny from "../src/js-yaml-v5/index.ts";
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
  suiteCases,
  withBreaks,
} from "./support.ts";

const corpus = suiteCases().map(({ input }) => input);
// Inputs that reach the YAML 1.1 types, merges and sets.
corpus.push(
  "a: &a {x: 1, 2: y}\nb:\n  <<: *a\n  x: 3\nc: [*a, *a]\n",
  "!!set {a, 1, null, ~}\n",
  "- !!omap [a: 1, b: 2]\n- !!pairs [a: 1, a: 2]\n- !!binary aGVsbG8=\n",
  "t: 2001-12-14t21:59:43.10-05:00\nd: 2002-12-14\nn: [0x1F, 0o17, 0b101, 017, 1_000, 1:30, 1.5e3, .inf, -.Inf, .NaN]\n",
  "b: [yes, No, on, OFF, y, n, true, False]\nnull: ~\nempty:\n",
  "? [a, b]\n: c\n? {d: e}\n: f\n",
  "x: !!str 1\ny: !!int '2'\nz: !!float 3\nw: !!null ''\nv: !!bool true\n",
);

const iterations = iterationsArg(positional[0], 20000);
const seed = seedArg(positional[1]);
const mode = positional[2] ?? "default";
const next = mulberry32(seed);
const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
const pieces = [
  " ",
  "  ",
  "\t",
  "\n",
  "\r\n",
  ":",
  ": ",
  "-",
  "- ",
  "#",
  " #",
  "'",
  '"',
  "[",
  "]",
  "{",
  "}",
  ",",
  "&a ",
  "*a",
  "!!str ",
  "!",
  "! ",
  "!!int ",
  "!!map ",
  "!!seq ",
  "!!set ",
  "!!binary ",
  "!x ",
  "<< ",
  "<<: ",
  "|",
  ">",
  "?",
  "? ",
  "---\n",
  "...\n",
  "\\",
  "x",
  "0",
  "1",
  "null",
  "~",
  "yes",
  "2001-01-01",
  "%YAML 1.2\n",
  "\uFEFF",
];

// The same options for each library; schemas come from each one.
function options(lib: typeof real | typeof tiny, choice: number[]): Record<string, unknown> {
  if (mode === "default") return {};
  const [s, json, merge, aliases, depth] = choice as [number, number, number, number, number];
  const schemas = [
    lib.CORE_SCHEMA,
    lib.JSON_SCHEMA,
    lib.FAILSAFE_SCHEMA,
    lib.YAML11_SCHEMA,
    lib.CORE_SCHEMA.withTags(lib.mergeTag as never),
    lib.CORE_SCHEMA.withTags(lib.realMapTag as never),
    lib.CORE_SCHEMA.withTags(lib.mergeTag as never, lib.realMapTag as never),
    lib.YAML11_SCHEMA.withTags(lib.legacyMapTag as never),
    lib.DUMP_SCHEMA,
  ];
  const o: Record<string, unknown> = { schema: schemas[s % schemas.length] };
  if (json) o.json = true;
  if (merge) o.maxTotalMergeKeys = merge - 2;
  if (aliases) o.maxAliases = aliases - 1;
  if (depth) o.maxDepth = depth * 2;
  if (mode === "depth") o.maxDepth = 1 + (s % 8);
  return o;
}

// What a YAMLException says.
function fields(error: unknown): Record<string, unknown> {
  const { reason, mark } = error as Partial<tiny.YAMLException>;
  const { position, line, column, snippet, buffer } = mark ?? {};
  return { reason, position, line, column, snippet, buffer };
}
const GROUPS = {
  message: ["reason"],
  position: ["position", "line", "column"],
  snippet: ["snippet"],
  buffer: ["buffer"],
};

type Outcome =
  | { ok: true; value: unknown }
  | {
      ok: false;
      error: string;
      message?: string;
      at?: number;
      fields?: Record<string, unknown>;
      crash?: boolean;
    };
function attempt(fn: () => unknown, type: typeof tiny.YAMLException | typeof real.YAMLException) {
  try {
    return { ok: true, value: fn() } as Outcome;
  } catch (error) {
    const e = error as { reason: string; message: string; mark?: { position: number } };
    if (!onPurpose(error, [type]))
      return { ok: false, error: String(error), crash: true } as Outcome;
    return {
      ok: false,
      error: e.reason,
      message: e.message,
      at: e.mark?.position,
      fields: fields(error),
    } as Outcome;
  }
}

const baseline = new Baseline("js-yaml-v5-fuzz", `seed ${seed}, ${mode}`, iterations);
const failures = new Map<string, string>();
const tried = new Set<string>();
// Per iteration; `distinct` counts the input and option pairs.
const counts = { value: 0, stricter: 0, lenient: 0, invalidLenient: 0, crash: 0 };
const distinct = new Map<string, Set<string>>();
let rejected = 0;
let messages = 0;
let fullMessages = 0;
let positions = 0;
const show = (r: Outcome) =>
  r.ok
    ? inspect(r.value, { depth: 6, breakLength: Infinity }).slice(0, 200)
    : `ERROR ${r.error} @${r.at}`;
const outcome = (r: Outcome) =>
  r.ok ? describe(r.value) : describeError(`${r.error} @${r.at ?? ""}`);
expectAliases(
  ALIASED,
  (text) => real.loadAll(text),
  (text) => tiny.loadAll(text),
);
for (let i = 0; i < iterations; i++) {
  let input = pick(corpus);
  for (let edits = 1 + Math.floor(next() * 3); edits > 0; edits--) {
    const at = Math.floor(next() * (input.length + 1));
    if (next() < 0.25) input = input.slice(0, at) + input.slice(at + 1);
    else input = input.slice(0, at) + pick(pieces) + input.slice(at);
  }
  input = withBreaks(input, next);
  const choice = [
    Math.floor(next() * 9),
    next() < 0.2 ? 1 : 0,
    next() < 0.1 ? Math.floor(next() * 6) : 0,
    next() < 0.2 ? Math.floor(next() * 4) : 0,
    next() < 0.1 ? 1 + Math.floor(next() * 3) : 0,
  ];
  const expected = attempt(() => real.loadAll(input, options(real, choice)), real.YAMLException);
  const actual = attempt(
    () => tiny.loadAll(input, options(tiny, choice) as tiny.LoadOptions),
    tiny.YAMLException,
  );
  tried.add(input);
  // In the default mode every input gets no options, whatever was drawn.
  const drawn = mode === "default" ? undefined : choice;
  const key = `${input}\0${JSON.stringify(drawn)}`;
  const count = (kind: keyof typeof counts) => {
    counts[kind]++;
    if (!distinct.has(kind)) distinct.set(kind, new Set());
    distinct.get(kind)!.add(key);
  };
  const record = (kind: string, show = outcome) =>
    baseline.add(i, kind, input, drawn, { "js-yaml 5": show(expected), tinyaml: show(actual) });
  if (!actual.ok && actual.crash) {
    count("crash");
    failures.set(
      input,
      `js-yaml 5: ${show(expected)}\n  tinyaml:   ${show(actual)}  ${JSON.stringify(choice)}`,
    );
  } else if (!expected.ok && actual.ok) {
    count("lenient");
    // Independent validation separates permissive parsing from valid YAML.
    const documents = parseAllDocuments(input, { prettyErrors: false });
    const valid = documents.every((document) => document.errors.length === 0);
    if (!valid) count("invalidLenient");
    record(valid ? "lenient" : "lenient, invalid YAML");
  } else if (!expected.ok && !actual.ok) {
    rejected++;
    if (expected.message === actual.message) fullMessages++;
    if (expected.error === actual.error) messages++;
    if (expected.error === actual.error && expected.at === actual.at) positions++;
    const differs = errorDifference(GROUPS, expected.fields!, actual.fields!);
    if (differs) {
      const [theirs, ours] = differs.sides.map((side) => describe(side));
      baseline.add(i, differs.kind, input, drawn, { "js-yaml 5": theirs!, tinyaml: ours! });
    }
  } else if (
    expected.ok !== actual.ok ||
    (expected.ok && actual.ok && !equal(expected.value, actual.value))
  ) {
    const kind = actual.ok ? "value" : "stricter";
    count(kind);
    record(kind);
  }
}
// The crashes, shortest first.
const shown = [...failures]
  .sort((a, b) => a[0].length - b[0].length)
  .slice(0, Number(process.env.SHOW ?? 15));
for (const [input, diff] of shown) console.log(`--- ${JSON.stringify(input)}\n  ${diff}`);
const both = (kind: keyof typeof counts) =>
  `${counts[kind]} (${distinct.get(kind)?.size ?? 0} distinct)`;
console.log(
  `${iterations} mutated inputs (${mode}, seed ${seed}), ${tried.size} distinct: ${both("value")} load to another value, ${both("stricter")} thrown only by tinyaml, ${both("lenient")} accepted where js-yaml 5 throws, ${both("invalidLenient")} of them invalid YAML, ${both("crash")} crash`,
);
console.log(
  `errors: ${rejected} rejected by both, ${messages} same message, ${positions} same message and position, ${fullMessages} identical full Error.message`,
);
expectCount("crashes", counts.crash, 0);
baseline.finish();
