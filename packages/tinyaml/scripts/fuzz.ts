// Mutation fuzzing against js-yaml 4: take every yaml-test-suite input, apply
// a few random edits with YAML-significant characters, and check that
// whatever js-yaml loads, tinyaml loads to the same value, and whatever it
// rejects, tinyaml rejects with a YAMLException with the same reason, mark
// and snippet; the warnings each passes to `onWarning` are compared too.
// Each input where they differ, another value, an error only from tinyaml,
// a value only from tinyaml (with whether yaml finds the input valid), an
// error that differs (the kind names the fields), or other warnings, is
// recorded with both outcomes in scripts/baselines/fuzz.json (see
// baseline.ts). Warnings are compared on every input: where something else
// differs too, the record's kind says so and it holds both sides' warnings. An unrecorded difference, a recorded one that's gone, or a
// crash fails the run.
// Usage: node scripts/fuzz.ts [iterations] [seed] [--update]
// After a deliberate change, `node scripts/fuzz.ts 5000 1 --update`, or
// `UPDATE=1 pnpm compare`, rewrites the records; review the diff.
import * as jsYaml from "js-yaml";
import { parseAllDocuments } from "yaml";
import { loadAll, YAMLException } from "../src/js-yaml/index.ts";
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

// H7J7 and M5C3 hit js-yaml bugs tinyaml doesn't copy; see suite.ts.
const corpus = suiteCases()
  .filter(({ id }) => !/^(?:H7J7|M5C3)$/.test(id))
  .map(({ input }) => input);

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
  "|",
  ">",
  "?",
  "---\n",
  "...\n",
  "\\",
  "x",
  "0",
  "null",
  "%YAML 1.2\n",
];

// What a YAMLException, thrown or passed to onWarning, says.
function fields(error: unknown): Record<string, unknown> {
  const { reason, mark } = error as Partial<YAMLException>;
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
  | { ok: true; value: unknown; warnings: unknown[] }
  | { ok: false; error: string; fields?: Record<string, unknown>; warnings: unknown[] };
function attempt(
  load: typeof loadAll | typeof jsYaml.loadAll,
  input: string,
  type: typeof YAMLException | typeof jsYaml.YAMLException,
): Outcome {
  const warnings: unknown[] = [];
  const onWarning = (warning: unknown) => void warnings.push(fields(warning));
  try {
    return { ok: true, value: load(input, null, { onWarning }), warnings };
  } catch (error) {
    if (!onPurpose(error, [type])) return { ok: false, error: `CRASH ${String(error)}`, warnings };
    return { ok: false, error: (error as YAMLException).reason, fields: fields(error), warnings };
  }
}

const baseline = new Baseline("fuzz", `seed ${seed}`, iterations);
const failures = new Map<string, string>();
const tried = new Set<string>();
// Per iteration, and the distinct inputs behind them.
let lenient = 0;
let invalidLenient = 0;
let crashes = 0;
let thrown = 0;
// Inputs both reject, by how the errors differ, and with other warnings.
const errors = new Map<string, number>();
let warned = 0;
const counts = { value: 0, stricter: 0 };
const distinct = {
  lenient: new Set<string>(),
  invalid: new Set<string>(),
  value: new Set<string>(),
  stricter: new Set<string>(),
};
const show = (r: Outcome) => (r.ok ? JSON.stringify(r.value)?.slice(0, 200) : `ERROR ${r.error}`);
expectAliases(
  ALIASED,
  (text) => jsYaml.loadAll(text),
  (text) => loadAll(text),
);
for (let i = 0; i < iterations; i++) {
  let input = corpus[Math.floor(next() * corpus.length)]!;
  for (let edits = 1 + Math.floor(next() * 3); edits > 0; edits--) {
    const at = Math.floor(next() * (input.length + 1));
    if (next() < 0.25) input = input.slice(0, at) + input.slice(at + 1);
    else input = input.slice(0, at) + pieces[Math.floor(next() * pieces.length)] + input.slice(at);
  }
  input = withBreaks(input, next);
  tried.add(input);
  const expected = attempt(jsYaml.loadAll, input, jsYaml.YAMLException);
  const actual = attempt(loadAll, input, YAMLException);
  const warns = !equal(expected.warnings, actual.warnings);
  if (warns) warned++;
  const record = (kind: string, sides: Record<string, string>) =>
    baseline.add(
      i,
      warns ? `${kind}, other warnings` : kind,
      input,
      undefined,
      warns
        ? {
            ...sides,
            "js-yaml warnings": describe(expected.warnings),
            "tinyaml warnings": describe(actual.warnings),
          }
        : sides,
    );
  if (!expected.ok && actual.ok) {
    lenient++;
    distinct.lenient.add(input);
    // yaml, as an independent check, says whether the input is valid YAML.
    const invalid = parseAllDocuments(input, { prettyErrors: false }).some(
      (doc) => doc.errors.length,
    );
    if (invalid) {
      invalidLenient++;
      distinct.invalid.add(input);
    }
    record(invalid ? "lenient, invalid YAML" : "lenient", {
      "js-yaml": describeError(expected.error ?? ""),
      tinyaml: describe(actual.value),
    });
  } else if (!actual.ok && actual.error.startsWith("CRASH")) {
    crashes++;
    if (!failures.has(input)) failures.set(input, `${show(expected)}\n  tinyaml: ${show(actual)}`);
  } else if (
    expected.ok !== actual.ok ||
    (expected.ok && actual.ok && !equal(expected.value, actual.value))
  ) {
    const kind = actual.ok ? "value" : "stricter";
    counts[kind]++;
    distinct[kind].add(input);
    record(kind, {
      "js-yaml": expected.ok ? describe(expected.value) : describeError(expected.error ?? ""),
      tinyaml: actual.ok ? describe(actual.value) : describeError(actual.error ?? ""),
    });
  } else {
    const differs =
      !expected.ok && !actual.ok
        ? errorDifference(GROUPS, expected.fields!, actual.fields!)
        : undefined;
    if (!expected.ok) thrown++;
    if (differs) {
      errors.set(differs.kind, (errors.get(differs.kind) ?? 0) + 1);
      record(differs.kind, {
        "js-yaml": describe(differs.sides[0]),
        tinyaml: describe(differs.sides[1]),
      });
    } else if (warns)
      baseline.add(i, "other warnings", input, undefined, {
        "js-yaml": describe(expected.warnings),
        tinyaml: describe(actual.warnings),
      });
  }
}
// The crashes, shortest first.
const shown = [...failures]
  .sort((a, b) => a[0].length - b[0].length)
  .slice(0, Number(process.env.SHOW ?? 15));
for (const [input, diff] of shown) console.log(`--- ${JSON.stringify(input)}\n  js-yaml: ${diff}`);
console.log(
  `${iterations} mutated inputs, seed ${seed}, ${tried.size} distinct: ${counts.value} (${distinct.value.size} distinct) load to another value, ${counts.stricter} (${distinct.stricter.size} distinct) thrown only by tinyaml, ${lenient} (${distinct.lenient.size} distinct) accepted where js-yaml throws, ${invalidLenient} (${distinct.invalid.size} distinct) of them invalid YAML, ${warned} with other warnings`,
);
console.log(
  `errors: ${thrown} thrown by both, ${[...errors].map(([kind, n]) => `${n} with another ${kind}`).join(", ") || "all alike"}`,
);
expectCount("crashes", crashes, 0);
baseline.finish();
