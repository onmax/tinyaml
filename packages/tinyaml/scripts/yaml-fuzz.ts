// Mutation fuzzing of `parse` against the `yaml` package: take every
// yaml-test-suite input, apply a few random edits with YAML-significant
// characters, parse with a random option set, and check that both accept
// with the same value or both throw. Thrown errors are also compared by
// class, code, position and message, and an error yaml wouldn't throw on
// purpose is a crash; so are the warnings each side emits during its call.
// Each input where they differ, another value, an error from one side only,
// an error that differs (the kind names the fields), or other warnings, is
// recorded with its options and both outcomes in
// scripts/baselines/yaml-fuzz.json (see baseline.ts). An unrecorded
// difference, a recorded one that's gone, or a crash fails the run.
// Usage: node --no-warnings scripts/yaml-fuzz.ts [iterations] [seed] [--update]
// After a deliberate change, `node --no-warnings scripts/yaml-fuzz.ts 5000 1
// --update`, or `UPDATE=1 pnpm compare`, rewrites the records; review the diff.
import * as yaml from "yaml";
import { parse, YAMLError, type ParseOptions } from "../src/yaml/index.ts";
import { Baseline, describe, positional } from "./baseline.ts";
import {
  ALIASED,
  equal,
  errorDifference,
  expectAliases,
  expectCount,
  fail,
  iterationsArg,
  mulberry32,
  seedArg,
  suiteCases,
  withBreaks,
  yamlOnPurpose,
} from "./support.ts";

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
  "!x ",
  "|",
  ">",
  "?",
  "? ",
  "---\n",
  "...\n",
  "\\",
  "x",
  "0",
  "1.5",
  "null",
  "true",
  "<<: ",
  "%YAML 1.2\n",
];
const optionSets: ParseOptions[] = [
  {},
  {},
  {},
  { merge: true },
  { uniqueKeys: false },
  { intAsBigInt: true },
  { schema: "yaml-1.1" },
  { schema: "failsafe" },
  { schema: "json" },
  { prettyErrors: false },
];

// What a YAMLError, thrown or emitted as a warning, says. yaml warns with a
// string when it turns a collection key into a string; tinyaml can only
// approximate the key in it, since it never sees the key's source, so only
// the text before the key counts.
function fields(error: unknown): Record<string, unknown> {
  if (typeof error === "string") return { warning: error.split(":")[0] };
  const { name, code, pos, linePos, message } = error as YAMLError;
  return { name, code, pos, linePos, message };
}
const GROUPS = { code: ["name", "code"], position: ["pos", "linePos"], message: ["message"] };

type Result = {
  ok: boolean;
  value?: unknown;
  error?: string;
  fields?: Record<string, unknown>;
  crash?: boolean;
  warnings: Record<string, unknown>[];
};
// Each side's warnings are the ones it emits during its own call.
function attempt(
  parse: (input: string, options: never) => unknown,
  input: string,
  options: ParseOptions,
  type: typeof YAMLError | typeof yaml.YAMLError,
): Result {
  const warnings: Record<string, unknown>[] = [];
  const emit = Object.getOwnPropertyDescriptor(process, "emitWarning")!;
  process.emitWarning = ((warning: unknown) => void warnings.push(fields(warning))) as never;
  try {
    return { ok: true, value: parse(input, options as never), warnings };
  } catch (error) {
    const { name, code } = error as { name?: string; code?: string };
    const crash = !yamlOnPurpose(error, type);
    return { ok: false, error: `${name} ${code ?? ""}`, fields: fields(error), crash, warnings };
  } finally {
    Object.defineProperty(process, "emitWarning", emit);
  }
}

const baseline = new Baseline("yaml-fuzz", `seed ${seed}`, iterations);
const failures = new Map<string, string>();
// Per iteration; `distinct` counts the input and option pairs.
const counts = {
  same: 0,
  sameError: 0,
  value: 0,
  yamlThrows: 0,
  tinyamlThrows: 0,
  warnings: 0,
  crash: 0,
};
const distinct = new Map<string, Set<string>>();
const labels: Record<keyof typeof counts, string> = {
  same: "same value",
  sameError: "same error",
  value: "another value",
  yamlThrows: "thrown only by yaml",
  tinyamlThrows: "thrown only by tinyaml",
  warnings: "other warnings",
  crash: "tinyaml crashes",
};
// Inputs both reject, by how the errors differ.
const errors = new Map<string, number>();
const tried = new Set<string>();
const show = (r: Result) => (r.ok ? describe(r.value) : `! ${r.crash ? "CRASH " : ""}${r.error}`);
expectAliases(
  ALIASED,
  (text) => yaml.parse(text),
  (text) => parse(text),
);
// Inputs that warn, at each logLevel: the same warnings, by code, or none
// where the level silences them.
for (const input of [
  "!unknown value\n",
  "%FOO bar\n---\na\n",
  "%YAML 1.3\n---\na\n",
  "? [a]\n: b\n",
])
  for (const options of [
    {},
    { logLevel: "warn" },
    { logLevel: "error" },
    { logLevel: "silent" },
  ] as const) {
    const codes = (r: Result) => r.warnings.map((w) => w.code ?? w.warning);
    const [theirs, ours] = [
      codes(attempt(yaml.parse, input, options, yaml.YAMLError)),
      codes(attempt(parse, input, options, YAMLError)),
    ];
    if (!equal(theirs, ours))
      fail(
        `warnings for ${JSON.stringify(input)} ${JSON.stringify(options)}: ${JSON.stringify(theirs)} and ${JSON.stringify(ours)}`,
      );
  }
for (let i = 0; i < iterations; i++) {
  let input = corpus[Math.floor(next() * corpus.length)]!;
  for (let edits = 1 + Math.floor(next() * 3); edits > 0; edits--) {
    const at = Math.floor(next() * (input.length + 1));
    if (next() < 0.25) input = input.slice(0, at) + input.slice(at + 1);
    else input = input.slice(0, at) + pieces[Math.floor(next() * pieces.length)] + input.slice(at);
  }
  input = withBreaks(input, next);
  const options = optionSets[Math.floor(next() * optionSets.length)]!;
  tried.add(input);
  const expected = attempt(yaml.parse, input, options, yaml.YAMLError);
  const actual = attempt(parse, input, options, YAMLError);
  // A difference where yaml stringified a collection key says so in its kind.
  const keyed = expected.warnings.some(
    (w) =>
      w.warning === "Keys with collection values will be stringified due to JS Object restrictions",
  );
  let kind: keyof typeof counts | undefined;
  let differs: ReturnType<typeof errorDifference>;
  if (actual.crash) kind = "crash";
  else if (expected.ok && actual.ok) kind = equal(expected.value, actual.value) ? "same" : "value";
  else if (!expected.ok && !actual.ok) {
    differs = errorDifference(GROUPS, expected.fields!, actual.fields!);
    if (!differs) kind = "sameError";
    else errors.set(differs.kind, (errors.get(differs.kind) ?? 0) + 1);
  } else kind = expected.ok ? "tinyamlThrows" : "yamlThrows";
  if ((kind === "same" || kind === "sameError") && !equal(expected.warnings, actual.warnings))
    kind = "warnings";
  const pair = `${input}\0${JSON.stringify(options)}`;
  if (kind) {
    counts[kind]++;
    if (!distinct.has(kind)) distinct.set(kind, new Set());
    distinct.get(kind)!.add(pair);
  }
  if (kind === "same" || kind === "sameError") continue;
  if (kind === "crash") {
    if (!failures.has(input))
      failures.set(
        input,
        `${JSON.stringify(options)}\n  yaml:    ${show(expected)}\n  tinyaml: ${show(actual)}`,
      );
    continue;
  }
  const label = differs ? differs.kind : labels[kind!];
  baseline.add(i, `${label}${keyed ? ", collection key" : ""}`, input, options, {
    yaml: differs
      ? describe(differs.sides[0])
      : kind === "warnings"
        ? describe(expected.warnings)
        : show(expected),
    tinyaml: differs
      ? describe(differs.sides[1])
      : kind === "warnings"
        ? describe(actual.warnings)
        : show(actual),
  });
}
// The crashes, shortest first.
const shown = [...failures]
  .sort((a, b) => a[0].length - b[0].length)
  .slice(0, Number(process.env.SHOW ?? 15));
for (const [input, diff] of shown) console.log(`--- ${JSON.stringify(input)} ${diff}`);
console.log(
  `${iterations} mutated inputs, seed ${seed}, ${tried.size} distinct: ${Object.entries(counts)
    .map(
      ([kind, n]) =>
        `${n} ${labels[kind as keyof typeof counts]} (${distinct.get(kind)?.size ?? 0} distinct)`,
    )
    .join(", ")}`,
);
console.log(
  `errors thrown by both that differ: ${[...errors].map(([kind, n]) => `${n} in ${kind}`).join(", ") || "none"}`,
);
expectCount("crashes", counts.crash, 0);
baseline.finish();
