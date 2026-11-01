// Runs editorconfig-core-test, the EditorConfig test suite copied into
// test/suites/editorconfig-core-test, through the `editorconfig` package's
// command line, with CMake and CTest as the suite expects: editorconfig 1
// (which uses @one-ini/wasm 0.1.1) and 3 (0.2.1), each with the WASM module
// and with the tinyini entry in its place. Prints the counts, and the names
// of the tests that fail with tinyini but not with the WASM module.
// Usage: node scripts/editorconfig-tests.ts [--dist]
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const dist = process.argv.includes("--dist");
const runs = [
  { name: "editorconfig 1.0.4", pkg: "editorconfig-v1", entry: "one-ini-v0.1" },
  { name: "editorconfig 3.0.2", pkg: "editorconfig", entry: "one-ini" },
];

/** The names of the tests that fail, out of how many ran. */
function ctest(dir: string, command: string[]): { failed: string[]; total: number } {
  mkdirSync(dir, { recursive: true });
  const script = resolve(dir, "editorconfig.sh");
  writeFileSync(script, `#!/bin/sh\nexec ${command.map((a) => `'${a}'`).join(" ")} "$@"\n`);
  chmodSync(script, 0o755);
  execFileSync(
    "cmake",
    ["-S", "test/suites/editorconfig-core-test", "-B", dir, `-DEDITORCONFIG_CMD=${script}`],
    {
      stdio: "ignore",
    },
  );
  let out: string;
  try {
    out = execFileSync("ctest", ["--test-dir", dir, "-j", "4"], { encoding: "utf8" });
  } catch (error) {
    out = (error as { stdout: string }).stdout;
  }
  const summary = /(\d+) tests failed out of (\d+)/.exec(out);
  const failed = [...out.matchAll(/^\s*\d+ - (\S+) \(Failed\)/gm)].map((m) => m[1]!);
  return { failed, total: Number(summary?.[2] ?? 0) };
}

let worse = 0;
for (const { name, pkg, entry } of runs) {
  const bin = resolve(dirname(require.resolve(`${pkg}/package.json`)), "bin/editorconfig");
  const file = resolve(dist ? `dist/${entry}.mjs` : `src/${entry}/index.ts`);
  const theirs = ctest(`.cache/ctest/${pkg}`, [process.execPath, bin]);
  const ours = ctest(`.cache/ctest/${pkg}-tinyini`, [
    "env",
    `ONE_INI=${file}`,
    process.execPath,
    "--import",
    resolve("scripts/one-ini-loader.ts"),
    bin,
  ]);
  const only = ours.failed.filter((t) => !theirs.failed.includes(t));
  // A run with no tests, or a different count, means the harness broke.
  worse += only.length + (theirs.total && ours.total === theirs.total ? 0 : 1);
  console.log(
    `${name} with @one-ini/wasm: ${theirs.total - theirs.failed.length}/${theirs.total} pass`,
  );
  console.log(
    `${name} with tinyini/${entry}: ${ours.total - ours.failed.length}/${ours.total} pass`,
  );
  for (const t of theirs.failed) console.log(`  fails with the WASM module too: ${t}`);
  for (const t of only) console.log(`  fails only with tinyini: ${t}`);
}
console.log(`tinyini: ${worse} tests fail only with tinyini`);
