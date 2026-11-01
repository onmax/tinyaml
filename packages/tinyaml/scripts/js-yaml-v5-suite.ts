// Runs every yaml-test-suite case through js-yaml 5.5.0 and through
// tinyaml/js-yaml-v5, both with default options. js-yaml 5 is the reference,
// not the suite's expected JSON: whatever it loads, tinyaml must load to the
// same value, and whatever it rejects, tinyaml must reject with a
// YAMLException. Accepting YAML js-yaml 5 rejects fails the run too. Errors
// are compared on every case both reject, name, reason, mark and full
// message; the cases where they differ are listed below, exactly, and both
// errors on them are recorded in scripts/baselines/js-yaml-v5-suite.json
// (see baseline.ts): one that changes fails the run too.
// Usage: node scripts/js-yaml-v5-suite.ts [-v] [--update]
import * as yaml from "js-yaml5";
import { loadAll, YAMLException } from "../src/js-yaml-v5/index.ts";
import { Baseline, describe } from "./baseline.ts";
import {
  equal,
  errorDifference,
  expectList,
  onPurpose,
  suiteCases,
  YAML_EXCEPTION_GROUPS,
  yamlException,
} from "./support.ts";

// Both reject, with another message.
const MESSAGES = [
  "3HFZ",
  "9JBA",
  "9KBC",
  "C4HZ",
  "CVW2",
  "CXX2",
  "LHL4",
  "N782",
  "SU5Z",
  "SY6V",
  "U99R",
  "Y79Y/004",
  "Y79Y/005",
  "Y79Y/006",
  "Y79Y/007",
  "Y79Y/008",
  "Y79Y/009",
];
// The same message, at another position or with another mark or full message.
const POSITIONS = ["2JQS", "5TYM", "CC74", "P76L", "Z9M4"];

type Outcome =
  | { ok: true; value: unknown }
  | { ok: false; error: string; at: string; crash: boolean; fields: Record<string, unknown> };
function run(fn: () => unknown, type: typeof YAMLException | typeof yaml.YAMLException): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    const e = error as { reason?: string; mark?: { position: number } };
    const crash = !onPurpose(error, [type]);
    return {
      ok: false,
      error: e.reason ?? String(error),
      at: String(e.mark?.position),
      crash,
      fields: crash ? {} : yamlException(error),
    };
  }
}

const verbose = process.argv.includes("-v");
const cases = suiteCases();
let same = 0;
const lenient: string[] = [];
const messages: string[] = [];
const positions: string[] = [];
let rejected = 0;
const diffs: string[] = [];
const baseline = new Baseline("js-yaml-v5-suite", "suite", cases.length);
const show = (o: Outcome) =>
  o.ok ? JSON.stringify(o.value) : `${o.crash ? "CRASH" : "ERROR"} ${o.error} @${o.at}`;
for (const [i, { id, input }] of cases.entries()) {
  const expected = run(() => yaml.loadAll(input), yaml.YAMLException);
  const actual = run(() => loadAll(input), YAMLException);
  if (!actual.ok && actual.crash) diffs.push(id);
  else if (!expected.ok && actual.ok) lenient.push(id);
  else if (expected.ok && actual.ok ? equal(expected.value, actual.value) : !expected.ok) {
    same++;
    if (!expected.ok && !actual.ok) {
      rejected++;
      const differs = errorDifference(YAML_EXCEPTION_GROUPS, expected.fields, actual.fields);
      if (!differs) continue;
      (expected.error !== actual.error ? messages : positions).push(id);
      baseline.add(i, `${id} ${differs.kind}`, input, undefined, {
        "js-yaml 5": describe(differs.sides[0]),
        tinyaml: describe(differs.sides[1]),
      });
      if (verbose) console.log(`${id}: ${show(expected)} | ${show(actual)}`);
    }
    continue;
  } else diffs.push(id);
  if (verbose) console.log(`${id}\n  js-yaml 5: ${show(expected)}\n  tinyaml:   ${show(actual)}`);
}
console.log(
  `${same}/${cases.length} cases match js-yaml 5, ${lenient.length} load where js-yaml 5 throws, ${diffs.length} differ`,
);
console.log(
  `errors: ${rejected} rejected by both, ${rejected - messages.length} same message, ${rejected - messages.length - positions.length} the same error`,
);
expectList("cases that differ from js-yaml 5", diffs, []);
expectList("cases only tinyaml loads", lenient, []);
expectList("errors with another message", messages, MESSAGES);
expectList("errors with the same message, but another position or mark", positions, POSITIONS);
baseline.finish();
