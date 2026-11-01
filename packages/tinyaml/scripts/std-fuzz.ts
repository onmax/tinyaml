// Mutation fuzzing against @std/yaml 1.3.0: take every yaml-test-suite input,
// apply a few random edits with YAML-significant characters, and check that
// whatever std parses, tinyaml/std parses to the same value, and that it
// throws a YamlSyntaxError where std throws, with the same name, message,
// offset, line, column, snippet and full message, and passes the same
// warnings to `onWarning`.
// std's parser is js-yaml 3's, and tinyaml/std doesn't copy all
// of its bugs, so some inputs differ: each is recorded, with its options and
// both outcomes, in scripts/baselines/std-fuzz.json (see baseline.ts).
// Warnings are compared on every input: where something else differs too,
// the record's kind says so and it holds both sides' warnings. Any other
// difference, a recorded one that's gone, or a crash fails the run.
// Usage: node scripts/std-fuzz.ts [iterations] [seed] [--update]
// After a deliberate change, `node scripts/std-fuzz.ts 5000 1 --update`, or
// `UPDATE=1 pnpm compare`, rewrites the records; review the diff.
import * as std from "@std/yaml";
import { Baseline, describe, describeError, positional } from "./baseline.ts";
import {
  ALIASED,
  equal,
  errorDifference,
  type ErrorClass,
  expectAliases,
  expectCount,
  iterationsArg,
  mulberry32,
  onPurpose,
  seedArg,
  suiteCases,
  template,
  withBreaks,
} from "./support.ts";

const { parseAll, YamlSyntaxError } = await import("../src/std/index.ts");

const corpus = suiteCases().map(({ input }) => input);
const iterations = iterationsArg(positional[0], 20000);
const seed = seedArg(positional[1]);
const next = mulberry32(seed);
const pieces = [
  " ",
  "  ",
  "\t",
  "\n",
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
  "!!int ",
  "!!binary ",
  "|",
  ">",
  "?",
  "---\n",
  "...\n",
  "\\",
  "x",
  "0",
  "null",
  "<<: ",
  "1_0",
  "0x1",
  "%YAML 1.2\n",
  "\r\n",
  "\uFEFF",
  "|-\n",
  ">+\n",
  "\n\n",
  "--- >\n",
  "\t- ",
];
const schemas = ["default", "failsafe", "json", "core", "extended"] as const;

const strip = (e?: string) => e?.replace(/ at line [^]*/, "");
// What a YamlSyntaxError, thrown or passed to onWarning, says, and the
// template of its full message (see support.ts).
function fields(error: unknown): Record<string, unknown> {
  const { name, message, offset, line, column, snippet } = error as InstanceType<
    typeof YamlSyntaxError
  >;
  const text = template(message, [strip(message), ` at line ${line}, column ${column}`, snippet]);
  return { message: strip(message), offset, line, column, snippet, name, text };
}
const GROUPS = {
  message: ["message"],
  position: ["offset", "line", "column"],
  snippet: ["snippet"],
  "full message": ["name", "text"],
};

type Outcome =
  | { ok: true; value: unknown; warnings: unknown[] }
  | { ok: false; error: string; fields?: Record<string, unknown>; warnings: unknown[] };
function attempt(
  parse: typeof parseAll | typeof std.parseAll,
  input: string,
  options: object,
  type: ErrorClass,
): Outcome {
  const warnings: unknown[] = [];
  const onWarning = (warning: unknown) => void warnings.push(fields(warning));
  try {
    return { ok: true, value: parse(input, { ...options, onWarning }), warnings };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    if (!onPurpose(error, [type])) return { ok: false, error: `CRASH ${message}`, warnings };
    return { ok: false, error: message, fields: fields(error), warnings };
  }
}

const baseline = new Baseline("std-fuzz", `seed ${seed}`, iterations);
const show = (r: Outcome) => (r.ok ? describe(r.value) : describeError(r.error));
// Per iteration, and the distinct input and option pairs behind them.
const counts = {
  value: 0,
  stricter: 0,
  lenient: 0,
  thrown: 0,
  messages: 0,
  texts: 0,
  warnings: 0,
};
// Inputs both reject, by how the errors differ.
const errors = new Map<string, number>();
const distinct = {
  value: new Set<string>(),
  stricter: new Set<string>(),
  lenient: new Set<string>(),
};
const tried = new Set<string>();
let crashes = 0;
// With MESSAGES set, the most common pairs of differing messages are listed.
const mismatched = new Map<string, number>();
expectAliases(
  ALIASED,
  (text) => std.parseAll(text),
  (text) => parseAll(text),
);
for (let i = 0; i < iterations; i++) {
  let input = corpus[Math.floor(next() * corpus.length)]!;
  for (let edits = 1 + Math.floor(next() * 3); edits > 0; edits--) {
    const at = Math.floor(next() * (input.length + 1));
    if (next() < 0.25) input = input.slice(0, at) + input.slice(at + 1);
    else input = input.slice(0, at) + pieces[Math.floor(next() * pieces.length)] + input.slice(at);
  }
  input = withBreaks(input, next);
  const options = {
    schema: next() < 0.6 ? undefined : schemas[Math.floor(next() * schemas.length)],
    allowDuplicateKeys: next() < 0.2,
  };
  const key = `${input}\0${JSON.stringify(options)}`;
  tried.add(input);
  const expected = attempt(std.parseAll, input, options, SyntaxError);
  const actual = attempt(parseAll, input, options, YamlSyntaxError);
  const sides = () => ({ std: show(expected), tinyaml: show(actual) });
  const warns = !equal(expected.warnings, actual.warnings);
  if (warns) counts.warnings++;
  const record = (kind: string, sides: Record<string, string>) =>
    baseline.add(
      i,
      warns ? `${kind}, other warnings` : kind,
      input,
      options,
      warns
        ? {
            ...sides,
            "std warnings": describe(expected.warnings),
            "tinyaml warnings": describe(actual.warnings),
          }
        : sides,
    );
  let kind: "value" | "stricter" | "lenient" | undefined;
  // std's `!!int` throws a TypeError on an empty node, and tinyaml/std's copies it.
  if (
    !actual.ok &&
    actual.error.startsWith("CRASH") &&
    (expected.ok || actual.error !== expected.error)
  ) {
    crashes++;
    const { std, tinyaml } = sides();
    console.log(
      `--- crash ${JSON.stringify(input)} ${JSON.stringify(options)}\n  std:     ${std}\n  tinyaml: ${tinyaml}`,
    );
    continue;
  }
  if (!expected.ok && actual.ok) kind = "lenient";
  else if (!expected.ok && !actual.ok) {
    counts.thrown++;
    if (expected.error === actual.error) counts.messages++;
    if (strip(expected.error) === strip(actual.error)) counts.texts++;
    else if (process.env.MESSAGES) {
      const pair = `${expected.error.split("\n")[0]}\n    ${actual.error.split("\n")[0]}`;
      mismatched.set(pair, (mismatched.get(pair) ?? 0) + 1);
    }
    // Where std crashes, only the messages compare; alike, they agree.
    const differs =
      expected.fields && actual.fields
        ? errorDifference(GROUPS, expected.fields, actual.fields)
        : expected.error === actual.error
          ? undefined
          : {
              kind: "message",
              sides: [{ message: strip(expected.error) }, { message: strip(actual.error) }],
            };
    if (differs) {
      errors.set(differs.kind, (errors.get(differs.kind) ?? 0) + 1);
      record(differs.kind, {
        std: describe(differs.sides[0]),
        tinyaml: describe(differs.sides[1]),
      });
      continue;
    }
  } else if (!actual.ok) kind = "stricter";
  else if (expected.ok && !equal(expected.value, actual.value)) kind = "value";
  if (!kind) {
    if (warns)
      baseline.add(i, "other warnings", input, options, {
        std: describe(expected.warnings),
        tinyaml: describe(actual.warnings),
      });
    continue;
  }
  counts[kind]++;
  distinct[kind].add(key);
  record(kind, sides());
}
for (const [pair, n] of [...mismatched].sort((a, b) => b[1] - a[1]).slice(0, 30))
  console.log(`${n}x ${pair}`);
const both = (kind: keyof typeof distinct) => `${counts[kind]} (${distinct[kind].size} distinct)`;
console.log(
  `${iterations} mutated inputs, seed ${seed}, ${tried.size} distinct: ${both("value")} parse to another value, ${both("stricter")} thrown only by tinyaml, ${both("lenient")} parsed where std throws; ${counts.thrown} thrown by both (${counts.messages} with the same message, ${counts.texts} the same apart from the position; ${[...errors].map(([kind, n]) => `${n} with another ${kind}`).join(", ") || "all alike"}), ${counts.warnings} with other warnings`,
);
const disagree = counts.value + counts.stricter + counts.lenient;
console.log(
  `values or acceptance differ in ${disagree} of ${iterations} iterations, ${((disagree / iterations) * 100).toFixed(1)}%`,
);
expectCount("crashes", crashes, 0);
baseline.finish();
