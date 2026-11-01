// Runs five of yaml 2.9.1's own test files (see vite.config.ts) with `yaml`
// resolved to shim.ts, which swaps in tinyaml's parse and stringify, and
// reports how many of the tests that called tinyaml pass. The other tests
// exercise yaml's own Document API and only check the harness. Each run's
// failures must be exactly the ones listed below, each failing with the
// message scripts/baselines/yaml-upstream.json records. Each run writes Vitest's
// reports to a directory of its own, so runs at once don't read each
// other's. Run `pnpm fixtures` first.
// Usage: node scripts/yaml-upstream/run.ts [-v] [--update]
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { basename } from "node:path";
import { Baseline, shorten } from "../baseline.ts";
import { expectCount, expectList } from "../support.ts";

// yaml's logLevel tests spy on process.emitWarning in a way Vitest doesn't
// support, so they fail against yaml itself too.
const HARNESS = [
  "errors.ts > logLevel by default, warn for tag fallback",
  "errors.ts > logLevel silence warnings with logLevel: 'error'",
  "errors.ts > logLevel silence warnings with logLevel: 'silent'",
  "errors.ts > logLevel silence errors with logLevel: 'silent'",
];
// Tests that call tinyaml and fail on a known difference.
const FAILING = [
  ...HARNESS,
  // mapAsMap isn't supported: the results are objects, not Maps.
  "anchors.ts > merge << merge multiple times multiple merge keys, masAsMap: true",
  "anchors.ts > merge << merge multiple times sequence of anchors, masAsMap: true",
  // Another error message.
  "anchors.ts > merge << parse errors missing whitespace",
  // A carriage return in a double-quoted scalar is read as a line break.
  "parse.ts > scalars carriage returns in double-quotes",
  // A collection key becomes a string written from its value, not its source.
  "parse.ts > Resource exhaustion attacks Excessive entity expansion attacks Work sensibly even with disabled limits js-yaml case 2",
  // Comments on yaml's own nodes and documents aren't written.
  "stringify.ts > YAML node inside object (#128)",
  "stringify.ts > custom indent indent: 1",
  "stringify.ts > custom indent indent: 4",
  "stringify.ts > indentSeq: false indent: 1",
  "stringify.ts > indentSeq: false indent: 2",
  "stringify.ts > indentSeq: false indent: 4",
  "stringify.ts > YAML.stringify on ast Document Document with comments",
  // Maps and Sets aren't written as !!omap and !!set.
  "types.ts > YAML 1.1 schema !!omap stringify Map",
  "types.ts > YAML 1.1 schema !!set stringify",
  "types.ts > YAML 1.1 schema !!set stringify in collection (#78)",
  // Custom tags' stringify isn't used for RegExps, Symbols and objects.
  "types.ts > custom tags RegExp stringify as plain scalar",
  "types.ts > custom tags RegExp stringify as quoted scalar",
  "types.ts > custom tags Symbol stringify as plain scalar",
  "types.ts > custom tags Symbol stringify as block scalar",
  "types.ts > custom tags null prototyped object",
  "types.ts > custom tags array within customTags",
];

interface Test {
  name: string;
  passed: boolean;
  tinyaml: boolean;
  message: string;
  /** The whole failure message, without the stack and this checkout's path. */
  detail: string;
}

const out = mkdtempSync(".cache/yaml-upstream-");
process.on("exit", () => rmSync(out, { recursive: true, force: true }));

function run(baseline: boolean): Test[] {
  const report = `${out}/${baseline ? "baseline" : "tinyaml"}.json`;
  // Vitest exits 1 on the expected failures; the report says which failed.
  const result = spawnSync(
    "node_modules/.bin/vp",
    [
      "test",
      "--config",
      "scripts/yaml-upstream/vite.config.ts",
      "--reporter=json",
      `--outputFile=${report}`,
    ],
    { encoding: "utf8", env: { ...process.env, UPSTREAM_BASELINE: baseline ? "1" : "" } },
  );
  let json: {
    testResults: {
      name: string;
      assertionResults: {
        fullName: string;
        status: string;
        meta?: { tinyaml?: boolean };
        failureMessages: string[];
      }[];
    }[];
  };
  try {
    json = JSON.parse(readFileSync(report, "utf8"));
  } catch {
    console.log(result.stdout, result.stderr);
    throw new Error(`vp test wrote no report (exit ${result.status})`);
  }
  return json.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      name: `${basename(file.name)} > ${test.fullName}`,
      passed: test.status === "passed",
      tinyaml: !!test.meta?.tinyaml,
      message: test.failureMessages[0]?.split("\n")[0] ?? "",
      detail: (test.failureMessages[0] ?? "")
        .replace(/^ +at .*\n?/gm, "")
        .replaceAll(process.cwd(), "."),
    })),
  );
}

const verbose = process.argv.includes("-v");
const tests = run(false);
const calls = tests.filter((test) => test.tinyaml);
const failed = (list: Test[]) => list.filter((test) => !test.passed);
console.log(
  `yaml's tests on tinyaml: ${calls.length - failed(calls).length}/${calls.length} of the tests that call parse or stringify pass (${tests.length - failed(tests).length}/${tests.length} in all)`,
);
for (const test of failed(tests).sort((a, b) => (a.name < b.name ? -1 : 1)))
  if (verbose || !FAILING.includes(test.name)) console.log(`  ${test.name}: ${test.message}`);
expectCount("tests", tests.length, 531);
expectList(
  "failing tests that call tinyaml",
  failed(calls).map((test) => test.name),
  FAILING,
);
// Each failing test's whole message is a record in
// scripts/baselines/yaml-upstream.json, so a known failure that fails
// another way fails the run.
const records = new Baseline("yaml-upstream", "tinyaml", tests.length);
for (const test of failed(tests).sort((a, b) => (a.name < b.name ? -1 : 1)))
  records.add(0, "fail", test.name, undefined, { tinyaml: shorten(test.detail) });
records.finish();
expectList(
  "failing tests that don't call tinyaml",
  failed(tests.filter((test) => !test.tinyaml)).map((test) => test.name),
  [],
);
// The same files against yaml itself check the harness.
const baseline = run(true);
console.log(
  `yaml's tests on yaml: ${baseline.length - failed(baseline).length}/${baseline.length} pass`,
);
expectList(
  "failing tests against yaml itself",
  failed(baseline).map((test) => test.name),
  HARNESS,
);
