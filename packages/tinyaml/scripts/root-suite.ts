// Checks tinyaml's own parser against the yaml-test-suite's expected results:
// every valid case must load to the value in its in.json, and every case
// marked invalid must throw a YAMLError. Merge keys are turned off, since the
// suite reads `<<` as a plain key. A crash, an error other than a YAMLError,
// fails the run on any case, scored or not. The 29 valid cases without an
// in.json (mostly collection keys, which tinyaml rejects on purpose) can't be
// scored; every other case is, with none left out, and the run checks how
// many: the pinned suite has 279 valid cases with expected JSON and 94
// invalid ones. Any wrong case fails the run.
// Usage: node scripts/root-suite.ts [-v]
import { parseAll, YAMLError } from "../src/index.ts";
import { equal, expectCount, onPurpose, suiteCases } from "./support.ts";

const verbose = process.argv.includes("-v");
const count = { valid: 0, invalid: 0, right: 0, wrong: 0, crashes: 0, noJson: 0 };
const wrong: string[] = [];
for (const { id, input, invalid, expected } of suiteCases()) {
  let actual: unknown;
  let error = "";
  let crash = false;
  try {
    actual = parseAll(input, { merge: false });
  } catch (caught) {
    crash = !onPurpose(caught, [YAMLError]);
    error = crash ? String((caught as Error)?.stack ?? caught) : (caught as Error).message;
  }
  // A crash is a failure on any case, scored or not.
  if (crash) {
    count.crashes++;
    console.log(`${id}\n  tinyaml crashed: ${error}`);
  }
  if (!invalid && !expected) {
    count.noJson++;
    continue;
  }
  count[invalid ? "invalid" : "valid"]++;
  const right =
    !crash &&
    (invalid ? !!error : !error && equal(actual, expected, { keyOrder: false, identity: false }));
  count[right ? "right" : "wrong"]++;
  if (!right) wrong.push(id);
  if (!right && verbose)
    console.log(
      `${id}${invalid ? " (invalid)" : ""}\n  expected: ${invalid ? "an error" : JSON.stringify(expected)}\n  tinyaml:  ${error ? `ERROR ${error}` : JSON.stringify(actual)}`,
    );
}
console.log(
  `${count.right} right, ${count.wrong} wrong of ${count.valid} valid and ${count.invalid} invalid cases, ${count.crashes} crashes; ${count.noJson} valid cases without expected JSON not scored`,
);
if (wrong.length) console.log(`  wrong: ${wrong.join(", ")}`);
expectCount("crashes", count.crashes, 0);
expectCount("wrong cases", count.wrong, 0);
expectCount("valid cases scored", count.valid, 279);
expectCount("invalid cases scored", count.invalid, 94);
