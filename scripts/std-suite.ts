// Runs every yaml-test-suite case through @std/yaml 1.3.0 and through
// tinyaml/std. std is the reference, not the suite's expected JSON, since
// tinyaml/std is meant as a drop-in: whatever std parses, tinyaml/std should
// parse to the same value, and whatever std rejects it should reject with a
// YamlSyntaxError. The cases where they differ are listed below, exactly; a
// new one, or a listed one that's gone, fails the run.
// Usage: node scripts/std-suite.ts [-v]
import * as std from "@std/yaml";
import { equal, type ErrorClass, expectList, onPurpose, suiteCases } from "./support.ts";

const { parseAll, YamlSyntaxError } = await import("../src/std/index.ts");

// std's parser is js-yaml 3's, and tinyaml doesn't copy its bugs. On each of
// these std's value or error is wrong by the suite, and tinyaml/std is right.
const DIFFER = [
  "4EJS",
  "62EZ",
  "6KGN",
  "6WPF",
  "7A4E",
  "9MAG",
  "9TFX",
  "CTN5",
  "DE56/01",
  "DE56/03",
  "DE56/04",
  "DE56/05",
  "DK3J",
  "DK95/06",
  "FP8R",
  "H7J7",
  "JY7Z",
  "M7A3",
  "NAT4",
  "NP9H",
  "PRH3",
  "Q8AD",
  "T4YY",
  "TL85",
  "W4TN",
  "Y79Y/004",
  "Y79Y/005",
  "Y79Y/006",
  "Y79Y/007",
  "Y79Y/008",
  "Y79Y/009",
];
// Cases std rejects and tinyaml/std reads. All are valid YAML except 4JVG,
// C2SP, CXX2 and VJP3/00.
const LENIENT = [
  "26DV",
  "2SXE",
  "4JVG",
  "4MUZ/00",
  "4MUZ/01",
  "4MUZ/02",
  "5MUD",
  "6BFJ",
  "7BMT",
  "9KAX",
  "9SA2",
  "C2SP",
  "CXX2",
  "E76Z",
  "HMQ5",
  "K3WX",
  "NJ66",
  "PW8X",
  "U3XV",
  "UT92",
  "VJP3/00",
  "VJP3/01",
  "WZ62",
  "ZH7C",
];

type Outcome = { ok: true; value: unknown } | { ok: false; error: string; crash: boolean };
function run(fn: () => unknown, type: ErrorClass): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    const crash = !onPurpose(error, [type]);
    return { ok: false, error: String((error as Error).message).split("\n")[0]!, crash };
  }
}

const verbose = process.argv.includes("-v");
const cases = suiteCases();
let same = 0;
let messages = 0;
const lenient: string[] = [];
const diffs: string[] = [];
const show = (o: Outcome) =>
  o.ok ? JSON.stringify(o.value) : `${o.crash ? "CRASH" : "ERROR"} ${o.error}`;
for (const { id, input } of cases) {
  const expected = run(() => std.parseAll(input), SyntaxError);
  const actual = run(() => parseAll(input), YamlSyntaxError);
  if (!actual.ok && actual.crash) diffs.push(id);
  else if (!expected.ok && actual.ok) lenient.push(id);
  else if (expected.ok && actual.ok ? equal(expected.value, actual.value) : !expected.ok) {
    same++;
    if (!expected.ok && !actual.ok && expected.error === actual.error) messages++;
    continue;
  } else diffs.push(id);
  if (verbose) console.log(`${id}\n  std:     ${show(expected)}\n  tinyaml: ${show(actual)}`);
}
console.log(
  `${same}/${cases.length} cases match @std/yaml (${messages} with the same error message), ${lenient.length} parse where std throws, ${diffs.length} differ`,
);
expectList("cases that differ from std", diffs, DIFFER);
expectList("cases only tinyaml/std parses", lenient, LENIENT);
