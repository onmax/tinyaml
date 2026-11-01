// Runs every yaml-test-suite case through js-yaml 4 and through tinyaml, both
// with their default schema. js-yaml is the reference, not the suite's
// expected JSON, since tinyaml is meant as a drop-in. Whatever js-yaml loads,
// tinyaml must load to the same value, and whatever it rejects, tinyaml must
// reject with a YAMLException with the same name, reason, mark and full
// message. Cases where tinyaml loads valid YAML that js-yaml rejects are
// counted on their own; they can't break a user switching from js-yaml. Both
// lists below are exact: a new case, or a known one that's gone, fails the
// run. Each side's outcome on them, and both errors where they differ, are
// recorded in scripts/baselines/js-yaml-suite.json (see baseline.ts), and
// one that's new or changes fails the run too.
// Usage: node scripts/suite.ts [-v] [--update]
import * as yaml from "js-yaml";
import { loadAll, YAMLException } from "../src/js-yaml/index.ts";
import { Baseline, describe, describeError } from "./baseline.ts";
import {
  equal,
  errorDifference,
  expectList,
  onPurpose,
  suiteCases,
  YAML_EXCEPTION_GROUPS,
  yamlException,
} from "./support.ts";

// Two js-yaml 4 bugs tinyaml doesn't copy: js-yaml drops a tag written on its
// own line above a less indented block scalar (M5C3), and reads properties at
// column 0 under a key as that key's value (H7J7, invalid YAML).
const DIFFER = ["H7J7", "M5C3"];
// Cases js-yaml 4 rejects and tinyaml loads, valid YAML.
const LENIENT = ["9KAX"];

type Outcome =
  | { ok: true; value: unknown }
  | { ok: false; error: string; message: string; crash: boolean; fields: Record<string, unknown> };
function run(fn: () => unknown, type: typeof YAMLException | typeof yaml.YAMLException): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    const crash = !onPurpose(error, [type]);
    const { reason, message } = error as { reason?: string; message?: string };
    return {
      ok: false,
      error: reason ?? String(error),
      message: message ?? String(error),
      crash,
      fields: crash ? {} : yamlException(error),
    };
  }
}
const outcome = (o: Outcome) => (o.ok ? describe(o.value) : describeError(o.message));

const verbose = process.argv.includes("-v");
const cases = suiteCases();
let same = 0;
// Cases both reject, by how their errors differ.
const errors = new Map<string, number>();
const lenient: string[] = [];
const diffs: string[] = [];
const shown: string[] = [];
const baseline = new Baseline("js-yaml-suite", "suite", cases.length);
const show = (o: Outcome) =>
  o.ok ? JSON.stringify(o.value) : `${o.crash ? "CRASH" : "ERROR"} ${o.error}`;
for (const [i, { id, input }] of cases.entries()) {
  const expected = run(() => yaml.loadAll(input), yaml.YAMLException);
  const actual = run(() => loadAll(input), YAMLException);
  if (!actual.ok && actual.crash) diffs.push(id);
  else if (!expected.ok && actual.ok) lenient.push(id);
  else if (expected.ok && actual.ok ? equal(expected.value, actual.value) : !expected.ok) {
    same++;
    const differs =
      !expected.ok && !actual.ok
        ? errorDifference(YAML_EXCEPTION_GROUPS, expected.fields, actual.fields)
        : undefined;
    if (differs) {
      errors.set(differs.kind, (errors.get(differs.kind) ?? 0) + 1);
      baseline.add(i, `${id} ${differs.kind}`, input, undefined, {
        "js-yaml": describe(differs.sides[0]),
        tinyaml: describe(differs.sides[1]),
      });
    }
    continue;
  } else diffs.push(id);
  baseline.add(i, `${id} ${lenient.at(-1) === id ? "lenient" : "differ"}`, input, undefined, {
    "js-yaml": outcome(expected),
    tinyaml: outcome(actual),
  });
  if (diffs.at(-1) === id)
    shown.push(`${id}\n  js-yaml: ${show(expected)}\n  tinyaml: ${show(actual)}`);
}
if (verbose) console.log(shown.join("\n"));
console.log(
  `${same}/${cases.length} cases match js-yaml 4, ${lenient.length} load where js-yaml throws, ${diffs.length} differ`,
);
console.log(
  `errors: ${[...errors].map(([kind, n]) => `${n} with another ${kind}`).join(", ") || "all alike"}`,
);
expectList("cases that differ from js-yaml 4", diffs, DIFFER);
expectList("cases only tinyaml loads", lenient, LENIENT);
baseline.finish();
