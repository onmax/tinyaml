// Mutation fuzzing against js-yaml: take every yaml-test-suite input, apply a
// few random edits with YAML-significant characters, and check that tinyaml
// and js-yaml (JSON_SCHEMA) agree on both the value and whether it throws.
// Usage: node scripts/fuzz.ts [iterations] [seed]
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import * as jsYaml from "js-yaml";
import { loadAll } from "../src/index.ts";

const root = ".cache/yaml-test-suite";
const corpus: string[] = [];
for (const name of readdirSync(root)) {
  const dir = join(root, name);
  if (!statSync(dir).isDirectory() || name === "name" || name === "tags") continue;
  const dirs = existsSync(join(dir, "in.yaml"))
    ? [dir]
    : readdirSync(dir).map((sub) => join(dir, sub));
  for (const d of dirs)
    if (existsSync(join(d, "in.yaml"))) corpus.push(readFileSync(join(d, "in.yaml"), "utf8"));
}

const iterations = Number(process.argv[2] ?? 20000);
let seed = Number(process.argv[3] ?? 1);
const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pieces = [
  " ",
  "  ",
  "\t",
  "\n",
  ":",
  ": ",
  "-",
  "- ",
  "#",
  " #",
  "'",
  '"',
  "[",
  "]",
  "{",
  "}",
  ",",
  "&a ",
  "*a",
  "!!str ",
  "|",
  ">",
  "?",
  "---\n",
  "...\n",
  "\\",
  "x",
  "0",
  "null",
  "%YAML 1.2\n",
];

function attempt(fn: () => unknown): { ok: boolean; value?: unknown; error?: string } {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "YAMLException")
      return { ok: false, error: `CRASH ${String(error)}` };
    return { ok: false, error: error.message.split("\n")[0] };
  }
}

// Structural equality that tolerates shared references and cycles.
function same(a: unknown, b: unknown, seen = new Map<object, object>()): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) => Object.hasOwn(b, key) && same((a as never)[key], (b as never)[key], seen),
  );
}

const failures = new Map<string, string>();
for (let i = 0; i < iterations; i++) {
  let input = corpus[Math.floor(next() * corpus.length)]!;
  for (let edits = 1 + Math.floor(next() * 3); edits > 0; edits--) {
    const at = Math.floor(next() * (input.length + 1));
    if (next() < 0.25) input = input.slice(0, at) + input.slice(at + 1);
    else input = input.slice(0, at) + pieces[Math.floor(next() * pieces.length)] + input.slice(at);
  }
  const expected = attempt(() => jsYaml.loadAll(input, { schema: jsYaml.JSON_SCHEMA }));
  const actual = attempt(() => loadAll(input));
  if (
    actual.error?.startsWith("CRASH") ||
    expected.ok !== actual.ok ||
    (expected.ok && !same(expected.value, actual.value))
  ) {
    if (failures.has(input)) continue;
    const show = (r: typeof expected) =>
      r.ok ? JSON.stringify(r.value)?.slice(0, 200) : `ERROR ${r.error}`;
    failures.set(input, `js-yaml:   ${show(expected)}\n  tinyaml: ${show(actual)}`);
  }
}
const shown = [...failures]
  .sort((a, b) => a[0].length - b[0].length)
  .slice(0, Number(process.env.SHOW ?? 15));
for (const [input, diff] of shown) console.log(`--- ${JSON.stringify(input)}\n  ${diff}`);
console.log(`${iterations} mutated inputs, ${failures.size} disagree with js-yaml`);
