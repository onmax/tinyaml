// Runs every yaml-test-suite case through yamljs 0.3.0 and tinyaml/yamljs.
// yamljs is the reference, but it isn't a YAML parser in the spec's sense,
// so each difference is sorted by which side agrees with the suite's own
// expected JSON (in.json, first document; yamljs merges documents):
//
//   same          both load the same value, or both throw
//   lenient       tinyaml loads what yamljs rejects
//   yamljs bug    the values differ and only tinyaml matches the suite
//   tinyaml bug   the values differ and only yamljs matches the suite, or
//                 tinyaml throws on input yamljs loads correctly
//   neither       the values differ and neither matches the suite, or the
//                 case has no expected JSON (invalid YAML)
//   tinyaml crash tinyaml throws something other than a ParseException
//
// A tinyaml bug or crash fails the run, and so does a case that moves into
// or out of NEITHER. Each side's outcome on every case that isn't the same
// is recorded in scripts/baselines/yamljs-suite.json (see baseline.ts), with
// its kind, and a case that changes, turns up or goes fails the run too.
// Usage: node scripts/yamljs-suite.ts [-v] [--update]
import { createRequire } from "node:module";
import { parse, ParseException } from "../src/yamljs/index.ts";
import { Baseline, describe, describeError } from "./baseline.ts";
import {
  equal,
  expectCount,
  expectList,
  onPurpose,
  suiteCases,
  type SuiteCase,
} from "./support.ts";

const yamljs = createRequire(import.meta.url)("yamljs") as { parse(input: string): unknown };

// Cases where the two differ and neither matches the suite. All but 7FWL
// have no expected JSON; 25 are invalid YAML both load.
const NEITHER = [
  "4ABK",
  "4JVG",
  "5U3A",
  "7FWL",
  "8XDJ",
  "9MAG",
  "B63P",
  "BF9H",
  "CFD4",
  "CTN5",
  "DK95/01",
  "EW3V",
  "FRK4",
  "G5U8",
  "LHL4",
  "M2N8/01",
  "QB6E",
  "S4GJ",
  "S98Z",
  "SBG9",
  "SR86",
  "SU74",
  "SY6V",
  "U99R",
  "V9D5",
  "X38W",
  "X4QW",
  "Y79Y/004",
  "Y79Y/005",
  "Y79Y/008",
  "Y79Y/009",
  "YJV2",
  "ZVH3",
];

type Outcome = { ok: true; value: unknown } | { ok: false; error: string; crash: boolean };
// yamljs throws whatever it throws; tinyaml/yamljs must throw a ParseException.
function run(fn: () => unknown, type?: typeof ParseException): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    const crash = !!type && !onPurpose(error, [type]);
    return { ok: false, error: String((error as Error)?.message ?? error), crash };
  }
}

// JSON's view of a value: dates become strings, NaN and Infinity null.
const json = (value: unknown) => JSON.parse(JSON.stringify(value) ?? "null") as unknown;

// The first expected document; yamljs reads only one.
function expected({ invalid, expected }: SuiteCase): { known: boolean; value?: unknown } {
  if (invalid || !expected) return { known: false };
  return { known: true, value: expected.length ? expected[0] : null };
}

const verbose = process.argv.includes("-v");
const counts: Record<string, number> = {
  same: 0,
  lenient: 0,
  "yamljs bug": 0,
  "tinyaml bug": 0,
  neither: 0,
  "tinyaml crash": 0,
};
const report: Record<string, string[]> = {
  "tinyaml crash": [],
  "tinyaml bug": [],
  neither: [],
  "yamljs bug": [],
};
const neither: string[] = [];
const show = (o: Outcome) =>
  o.ok ? JSON.stringify(json(o.value)) : `${o.crash ? "CRASH" : "ERROR"} ${o.error}`;
const cases = suiteCases();
const baseline = new Baseline("yamljs-suite", "suite", cases.length);
const record = (o: Outcome) => (o.ok ? describe(o.value) : describeError(o.error));
for (const [i, c] of cases.entries()) {
  const theirs = run(() => yamljs.parse(c.input));
  const ours = run(() => parse(c.input), ParseException);
  let kind: string;
  if (!ours.ok && ours.crash) kind = "tinyaml crash";
  else if (theirs.ok && ours.ok ? equal(theirs.value, ours.value) : !theirs.ok && !ours.ok)
    kind = "same";
  else if (!theirs.ok) kind = "lenient";
  else {
    const spec = expected(c);
    const right = (o: Outcome) =>
      spec.known && o.ok && equal(json(o.value), spec.value, { keyOrder: false, identity: false });
    kind = right(theirs) ? "tinyaml bug" : right(ours) ? "yamljs bug" : "neither";
  }
  counts[kind]!++;
  if (kind !== "same")
    baseline.add(i, `${c.id} ${kind}`, c.input, undefined, {
      yamljs: record(theirs),
      tinyaml: record(ours),
    });
  if (kind === "neither") neither.push(c.id);
  report[kind]?.push(`${c.id}\n  yamljs:  ${show(theirs)}\n  tinyaml: ${show(ours)}`);
}
if (verbose)
  for (const [kind, list] of Object.entries(report))
    if (list.length) console.log(`\n== ${kind} ==\n${list.join("\n")}`);
console.log(
  `${cases.length} cases: ${Object.entries(counts)
    .map(([kind, n]) => `${n} ${kind}`)
    .join(", ")}`,
);
expectCount("tinyaml bugs", counts["tinyaml bug"]!, 0);
expectCount("tinyaml crashes", counts["tinyaml crash"]!, 0);
expectList("cases neither reads right", neither, NEITHER);
baseline.finish();
