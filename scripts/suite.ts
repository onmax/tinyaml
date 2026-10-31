// Runs every yaml-test-suite case through js-yaml (JSON_SCHEMA) and through
// tinyaml, and reports where they disagree. js-yaml is the reference, not
// the suite's expected JSON: Comark depends on js-yaml's behaviour.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import * as yaml from "js-yaml";
import { loadAll } from "../src/index.ts";

const root = ".cache/yaml-test-suite";
const cases: string[] = [];
for (const name of readdirSync(root)) {
  const dir = join(root, name);
  if (!statSync(dir).isDirectory()) continue;
  if (existsSync(join(dir, "in.yaml"))) cases.push(dir);
  else
    for (const sub of readdirSync(dir))
      if (existsSync(join(dir, sub, "in.yaml"))) cases.push(join(dir, sub));
}

type Outcome = { ok: true; value: unknown } | { ok: false; error: string };
function run(fn: () => unknown): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: (error as Error).message.split("\n")[0]! };
  }
}

const verbose = process.argv.includes("-v");
let same = 0;
const diffs: string[] = [];
for (const dir of cases) {
  const input = readFileSync(join(dir, "in.yaml"), "utf8");
  const expected = run(() => yaml.loadAll(input, { schema: yaml.JSON_SCHEMA }));
  const actual = run(() => loadAll(input));
  const match =
    expected.ok === actual.ok &&
    (!expected.ok || isDeepStrictEqual(expected.value, (actual as { value: unknown }).value));
  if (match) {
    same++;
    continue;
  }
  const show = (o: Outcome) => (o.ok ? JSON.stringify(o.value) : `ERROR ${o.error}`);
  diffs.push(`${dir}\n  js-yaml:   ${show(expected)}\n  tinyaml: ${show(actual)}`);
}
if (verbose) console.log(diffs.join("\n"));
console.log(`${same}/${cases.length} cases match js-yaml, ${diffs.length} differ`);
