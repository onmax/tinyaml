// Runs a library's own tests, copied unchanged into test/<dir>, against the
// library itself, to check the copy, and against the tinyjson5 entry that
// replaces it, through scripts/redirect.ts. Prints the counts and each
// failing test, and exits non-zero when tinyjson5 fails one.
// Usage: node scripts/own-tests.ts <suite>
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SUITES: Record<string, { files: string[]; targets: [string, string][] }> = {
  "json5-main": {
    files: ["parse.test.js", "stringify.test.js", "errors.test.js"],
    targets: [
      ["json5 main", ".cache/json5-main/lib/index.js"],
      ["tinyjson5", "src/index.ts"],
    ],
  },
  "json5-v1": {
    files: ["parse.js", "stringify.js", "errors.js"],
    targets: [
      ["json5 1.0.2", "node_modules/json5-v1/lib/index.js"],
      ["tinyjson5/json5-v1", "src/json5-v1/index.ts"],
    ],
  },
};

const name = process.argv[2]!;
const suite = SUITES[name];
if (!suite) throw new Error(`unknown suite ${name}; one of ${Object.keys(SUITES).join(", ")}`);
let failed = 0;
for (const [label, path] of suite.targets) {
  for (const file of suite.files) {
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        "./scripts/redirect.ts",
        "--test",
        "--test-reporter=tap",
        `test/${name}/${file}`,
      ],
      { encoding: "utf8", env: { ...process.env, REDIRECT_TARGET: pathToFileURL(path).href } },
    );
    const count = (key: string) =>
      Number(run.stdout.match(new RegExp(`^# ${key} (\\d+)$`, "m"))?.[1]);
    // A failing suite reports failureType 'subtestsFailed'; only its tests count.
    const fails = [
      ...run.stdout.matchAll(
        /^ *not ok \d+ - (.*)\n(?:(?! *not ok| *ok ).*\n)*? *failureType: '(\w+)'/gm,
      ),
    ]
      .filter((m) => m[2] !== "subtestsFailed")
      .map((m) => m[1]);
    const [pass, fail] = [count("pass"), count("fail")];
    if (label !== suite.targets[0]![0]) failed += fail || (pass ? 0 : 1);
    console.log(`${label.padEnd(20)} ${file.padEnd(18)} ${pass}/${pass + fail} pass`);
    for (const test of fails) console.log(`  FAIL ${test}`);
    if (!pass && !fail) console.log(run.stderr.slice(0, 2000));
  }
}
console.log(`${suite.targets[1]![0]}: ${failed} failing tests`);
process.exitCode = failed ? 1 : 0;
