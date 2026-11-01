// Runs the tests on json5's main branch (copied unchanged into
// test/json5-main) against json5 main itself, to check the copy, and against
// tinyjson5's root, and prints the counts. `pnpm json5:main:fetch` first.
// Usage: node scripts/json5-main-tests.ts
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const targets: [string, string][] = [
  ["json5 main", ".cache/json5-main/lib/index.js"],
  ["tinyjson5", "src/index.ts"],
];
let failed = 0;
for (const [name, path] of targets) {
  for (const file of ["parse", "stringify", "errors"]) {
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        "./scripts/redirect.ts",
        "--test",
        "--test-reporter=tap",
        `test/json5-main/${file}.test.js`,
      ],
      { encoding: "utf8", env: { ...process.env, REDIRECT_TARGET: pathToFileURL(path).href } },
    );
    const count = (key: string) =>
      Number(run.stdout.match(new RegExp(`^# ${key} (\\d+)$`, "m"))?.[1]);
    const [pass, fail] = [count("pass"), count("fail")];
    if (name === "tinyjson5") failed += fail || (pass ? 0 : 1);
    console.log(`${name.padEnd(12)} ${file.padEnd(10)} ${pass}/${pass + fail} pass`);
    for (const m of run.stdout.matchAll(/^not ok \d+ - (.*)$/gm)) console.log(`  FAIL ${m[1]}`);
  }
}
console.log(`tinyjson5: ${failed} failing tests`);
