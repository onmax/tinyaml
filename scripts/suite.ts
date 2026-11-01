// Runs every yaml-test-suite case through js-yaml 4 and through tinyaml, both
// with their default schema. js-yaml is the reference, not the suite's
// expected JSON, since tinyaml is meant as a drop-in. Whatever js-yaml loads,
// tinyaml must load to the same value, and whatever it rejects, tinyaml must
// reject with a YAMLException. Cases where tinyaml loads valid YAML that
// js-yaml rejects are counted on their own; they can't break a user
// switching from js-yaml. Both lists below are exact: a new case, or a known
// one that's gone, fails the run.
// Usage: node scripts/suite.ts [-v]
import * as yaml from "js-yaml";
import { loadAll, YAMLException } from "../src/js-yaml/index.ts";
import { equal, expectList, onPurpose, suiteCases } from "./support.ts";

// Two js-yaml 4 bugs tinyaml doesn't copy: js-yaml drops a tag written on its
// own line above a less indented block scalar (M5C3), and reads properties at
// column 0 under a key as that key's value (H7J7, invalid YAML).
const DIFFER = ["H7J7", "M5C3"];
// Cases js-yaml 4 rejects and tinyaml loads. All are valid YAML except C2SP
// and VJP3/00, which tinyaml's own parser rejects but the js-yaml entry reads.
const LENIENT = [
  "4MUZ/00",
  "4MUZ/01",
  "4MUZ/02",
  "5MUD",
  "9KAX",
  "9SA2",
  "C2SP",
  "K3WX",
  "NJ66",
  "UT92",
  "VJP3/00",
  "VJP3/01",
  "WZ62",
];

type Outcome = { ok: true; value: unknown } | { ok: false; error: string; crash: boolean };
function run(fn: () => unknown, type: typeof YAMLException | typeof yaml.YAMLException): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    const crash = !onPurpose(error, [type]);
    return { ok: false, error: (error as { reason?: string }).reason ?? String(error), crash };
  }
}

const verbose = process.argv.includes("-v");
const cases = suiteCases();
let same = 0;
const lenient: string[] = [];
const diffs: string[] = [];
const shown: string[] = [];
const show = (o: Outcome) =>
  o.ok ? JSON.stringify(o.value) : `${o.crash ? "CRASH" : "ERROR"} ${o.error}`;
for (const { id, input } of cases) {
  const expected = run(() => yaml.loadAll(input), yaml.YAMLException);
  const actual = run(() => loadAll(input), YAMLException);
  if (!actual.ok && actual.crash) diffs.push(id);
  else if (!expected.ok && actual.ok) lenient.push(id);
  else if (expected.ok && actual.ok ? equal(expected.value, actual.value) : !expected.ok) same++;
  else diffs.push(id);
  if (diffs.at(-1) === id)
    shown.push(`${id}\n  js-yaml: ${show(expected)}\n  tinyaml: ${show(actual)}`);
}
if (verbose) console.log(shown.join("\n"));
console.log(
  `${same}/${cases.length} cases match js-yaml 4, ${lenient.length} load where js-yaml throws, ${diffs.length} differ`,
);
expectList("cases that differ from js-yaml 4", diffs, DIFFER);
expectList("cases only tinyaml loads", lenient, LENIENT);
