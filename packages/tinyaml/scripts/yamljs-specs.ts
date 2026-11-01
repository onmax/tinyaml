// Runs yamljs 0.3.0's own Jasmine specs against tinyaml/yamljs, and against
// yamljs itself as a check on this harness. Both must pass every spec. Run
// `pnpm fixtures` first.
// Usage: node scripts/yamljs-specs.ts [-v]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "../src/yamljs/index.ts";
import { equal as strictEqual, fail } from "./support.ts";

const dir = resolve(".cache/yamljs-src/test/spec");
const source = readFileSync(`${dir}/YamlSpec.js`, "utf8");
const verbose = process.argv.includes("-v");

// Jasmine's toEqual, as far as the specs need it: NaN equals NaN, and an
// object's prototype and key order don't matter.
function equal(a: unknown, b: unknown): boolean {
  if (strictEqual(a, b, { keyOrder: false, identity: false })) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (a instanceof Date || b instanceof Date || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && a.length !== (b as unknown[]).length) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every(
      (k) =>
        Object.hasOwn(b, k) &&
        equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}

async function run(name: string, yaml: unknown): Promise<void> {
  const tests: { title: string; fn: (done?: () => void) => unknown }[] = [];
  let suite = "";
  const describe = (title: string, body: () => void) => {
    suite = title;
    body();
  };
  const it = (title: string, fn: (done?: () => void) => unknown) =>
    tests.push({ title: `${suite} ${title}`, fn });
  let failures: string[] = [];
  const expect = (actual: unknown) => ({
    toEqual(expected: unknown) {
      if (!equal(actual, expected))
        failures.push(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
  });
  // oxlint-disable-next-line no-implied-eval
  new Function("YAML", "describe", "it", "expect", "__dirname", "document", source)(
    yaml,
    describe,
    it,
    expect,
    dir,
    undefined,
  );
  let passed = 0;
  for (const test of tests) {
    failures = [];
    try {
      if (test.fn.length) await new Promise<void>((done) => test.fn(done));
      else test.fn();
    } catch (error) {
      failures.push(`threw ${String(error)}`);
    }
    if (failures.length) {
      if (verbose) console.log(`  FAIL ${test.title}\n    ${failures.join("\n    ")}`);
    } else passed++;
  }
  console.log(`${name}: ${passed}/${tests.length} specs pass`);
  // yamljs passing its own specs checks this harness; tinyaml must pass all.
  if (passed !== tests.length || tests.length !== 103)
    fail(`${name}: expected all 103 specs to pass`);
}

await run("yamljs 0.3.0", createRequire(import.meta.url)("yamljs"));
await run("tinyaml/yamljs", YAML);
