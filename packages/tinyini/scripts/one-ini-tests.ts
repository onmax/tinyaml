// Runs one-ini's own Rust tests, copied unchanged into test/suites/one-ini
// (the same in 0.1.3 and 0.2.1), against @one-ini/wasm 0.2.1 and 0.1.1
// themselves and against tinyini/one-ini and tinyini/one-ini-v0.1.
// The tests call `compare(contents, expected)`, which prints the parsed AST
// as one-ini's Display impl does, and `compare_vec(contents, tokens)`, which
// checks the tokens of parse_to_vec by the text they cover; a test marked
// #[should_panic] must fail. Each Rust test body becomes JavaScript: its string
// literals and vec! tuples are valid JS once rewritten, and the one test that
// builds a BOM with format! gets the same string as a literal. node.rs's
// parse_to_uint32array test runs as it is written.
// Usage: node scripts/one-ini-tests.ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dir = "test/suites/one-ini";
const engines: [string, any][] = [
  ["@one-ini/wasm 0.2.1", require("@one-ini/wasm")],
  ["tinyini/one-ini", await import("../src/one-ini/index.ts")],
  ["@one-ini/wasm 0.1.1", require("one-ini-v0.1")],
  ["tinyini/one-ini-v0.1", await import("../src/one-ini-v0.1/index.ts")],
];

interface Item {
  type: string;
  name?: string;
  key?: string;
  value?: string;
  indicator?: string;
  body?: Item[];
}

// one-ini's Display impls: a pair as `key=value`, a comment as its indicator
// and text, a section as `[name]` and its body, each on its own line, with a
// blank line before every section after the first item.
const display = (ast: { body?: Item[] }) => {
  let out = "";
  let wrote = false;
  const item = (i: Item): string =>
    i.type === "Pair"
      ? `${i.key}=${i.value}\n`
      : i.type === "Comment"
        ? `${i.indicator}${i.value}\n`
        : `[${i.name}]\n${(i.body ?? []).map(item).join("")}`;
  for (const i of ast.body ?? []) {
    if (i.type === "Section" && wrote) out += "\n";
    out += item(i);
    wrote = true;
  }
  return out;
};

/** The Rust tests in a file as JavaScript: name, body, and whether it must panic. */
function tests(file: string): { name: string; body: string; panics: boolean }[] {
  const source = readFileSync(`${dir}/${file}`, "utf8");
  const found = [];
  const re = /#\[(?:wasm_bindgen_)?test\]\s*(#\[should_panic\]\s*)?fn (\w+)\(\) \{\n([^]*?)\n\}/g;
  for (const [, panics, name, rust] of source.matchAll(re)) {
    let body = rust!
      .replace(
        /let utf8_bom[^]*?let contents = format!\("\{\}a=b", str::from_utf8\(&utf8_bom\)\.unwrap\(\)\);/,
        'let contents = "\\u{feff}a=b";',
      )
      .replace(/&vec!\[/g, "[")
      .replace(/vec!\[/g, "[")
      .replace(/\(TokenTypes::(\w+), ("(?:[^"\\]|\\.)*")\)/g, "[TokenTypes.$1, $2]")
      .replace(/let expected: Vec<u32> =/g, "const expected =")
      .replace(/String::from\(("(?:[^"\\]|\\.)*")\)\.as_bytes\(\)/g, "bytes($1)")
      .replace(
        /match parse_to_uint32array\(([^{]*)\) \{[^]*\}/,
        "same([...lib.parse_to_uint32array($1)], expected);",
      )
      .replace(/\blet\b/g, "const");
    found.push({ name: name!, body, panics: !!panics });
  }
  return found;
}

const cases = [...tests("integration_test.rs"), ...tests("node.rs")];
let failed = 0;
for (const [label, lib] of engines) {
  const encoder = new TextEncoder();
  const bytes = (s: string) => encoder.encode(s);
  const same = (a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  };
  const compare = (contents: string, expected: string) =>
    same(display(lib.parse_to_json(contents)), expected);
  const compare_vec = (contents: string, expected: [number, string][]) => {
    const buf = bytes(contents);
    const tokens = [...lib.parse_to_uint32array(buf)];
    const got = [];
    for (let i = 0; i < tokens.length; i += 3)
      got.push([tokens[i], new TextDecoder().decode(buf.subarray(tokens[i + 1], tokens[i + 2]))]);
    same(got, expected);
  };
  let passed = 0;
  for (const { name, body, panics } of cases) {
    let error: unknown;
    try {
      // eslint-disable-next-line typescript/no-implied-eval
      new Function("compare", "compare_vec", "TokenTypes", "bytes", "same", "lib", body)(
        compare,
        compare_vec,
        lib.TokenTypes,
        bytes,
        same,
        lib,
      );
    } catch (e) {
      error = e;
    }
    if (!error === !panics) passed++;
    else {
      failed++;
      console.log(`  FAIL ${label} ${name}: ${error ? String(error as Error) : "didn't panic"}`);
    }
  }
  console.log(`${label.padEnd(22)} ${passed}/${cases.length} pass`);
}
// The WASM modules must pass too, or the harness is wrong.
console.log(`${failed} failing tests`);
