// Runs @std/yaml 1.3.0's own tests (shipped in its package) against
// tinyaml/std under Node, with small stand-ins for @std/assert, the spy from
// @std/testing and Deno.test. Every test must pass but the three in OUT_OF_SCOPE,
// which must fail as listed.
// The rewritten test files go to a directory of each run's own.
// Usage: node scripts/std-tests.ts [-v]
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { equal, expectList } from "./support.ts";

// Two test `unstable_parse` and `unstable_stringify`, which tinyaml/std
// doesn't include; one runs Deno itself in a subprocess.
// Each fails before it calls tinyaml, with the message after the colon.
const OUT_OF_SCOPE = [
  "parse_test.ts > parse() handles __proto__: Deno.execPath is not a function",
  "parse_test.ts > unstableParse() handles custom types: unstable is out of scope",
  "stringify_test.ts > unstableStringify() handles custom types: unstable is out of scope",
];

const tests: { name: string; fn: () => unknown; file: string }[] = [];
let file = "";
const ns = globalThis as any;
ns.Deno = {
  test(a: any, b?: any) {
    tests.push(typeof a === "string" ? { name: a, fn: b, file } : { ...a, file });
  },
};

class AssertionError extends Error {}
const show = (v: unknown) => JSON.stringify(v, (_, x) => (x === undefined ? "<undefined>" : x));
ns.__assert = {
  assert(value: unknown, msg?: string) {
    if (!value) throw new AssertionError(msg ?? "expected truthy value");
  },
  assertEquals(actual: unknown, expected: unknown) {
    if (!equal(actual, expected, { keyOrder: false, identity: false }))
      throw new AssertionError(`expected ${show(expected)}\n  actual   ${show(actual)}`);
  },
  assertInstanceOf(value: unknown, type: any) {
    if (!(value instanceof type)) throw new AssertionError(`expected instance of ${type.name}`);
  },
  assertThrows(fn: () => unknown, type?: any, includes?: string) {
    try {
      fn();
    } catch (error: any) {
      if (type && !(error instanceof type))
        throw new AssertionError(`expected ${type.name}, got ${error?.name}: ${error?.message}`);
      if (includes !== undefined && !String(error?.message).includes(includes))
        throw new AssertionError(
          `expected message ${show(includes)}\n  actual   ${show(error?.message)}`,
        );
      return error;
    }
    throw new AssertionError("expected a throw");
  },
  spy() {
    const calls: { args: unknown[] }[] = [];
    return Object.assign((...args: unknown[]) => void calls.push({ args }), { calls });
  },
  // Enough of @std/semver for one sortKeys test.
  parse: (version: string) => version.split("-"),
  compare([a, pre]: string[], [b, preB]: string[]) {
    const x = a!.split(".").map(Number);
    const y = b!.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
    return pre === preB ? 0 : pre === undefined ? 1 : preB === undefined ? -1 : pre < preB ? -1 : 1;
  },
  assertSpyCall(spy: any, index: number) {
    if (!spy.calls[index]) throw new AssertionError(`expected call ${index}`);
  },
};

const root = "node_modules/@std/yaml";
const out = mkdtempSync(".cache/std-tests-");
process.on("exit", () => rmSync(out, { recursive: true, force: true }));
const std = pathToFileURL("src/std/index.ts").href;
for (const name of ["parse_test.ts", "stringify_test.ts", "types_test.ts"]) {
  const code = readFileSync(`${root}/${name}`, "utf8")
    .replace(/from "\.\/(?:parse|stringify|types)\.ts"/g, `from "${std}"`)
    .replace(
      /from "\.\/unstable_(?:parse|stringify)\.ts"/,
      `from "data:text/javascript,export function parse() { throw new Error('unstable is out of scope') } export const stringify = parse"`,
    )
    .replace(
      /import \{([^}]*)\} from "jsr:@std\/(?:assert|testing|semver)[^"]*";/g,
      "const {$1} = (globalThis as any).__assert;",
    )
    .replace(/type ImplicitType,/g, "")
    .replace(/import \{ type ImplicitType, /, "import { ")
    .replace(/: ImplicitType/g, ": any");
  writeFileSync(`${out}/${name}`, code);
  file = name;
  await import(pathToFileURL(`${out}/${name}`).href);
}

let passed = 0;
const failed: string[] = [];
const verbose = process.argv.includes("-v");
for (const test of tests) {
  try {
    await test.fn();
    passed++;
  } catch (error: any) {
    const name = `${test.file} > ${test.name}`;
    failed.push(`${name}: ${String(error?.message ?? error)}`);
    if (verbose || !OUT_OF_SCOPE.includes(failed.at(-1)!))
      console.log(
        `${name}\n  ${String(error?.message ?? error)
          .split("\n")
          .slice(0, 6)
          .join("\n  ")}`,
      );
  }
}
console.log(`${passed}/${tests.length} of @std/yaml's tests pass, ${failed.length} fail`);
expectList("failing tests", failed, OUT_OF_SCOPE);
