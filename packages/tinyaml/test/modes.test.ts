// Each built entry has its mode's constants (src/core/mode/*.ts) folded into
// the parser, where on src the parser takes them from the engine. These pin
// what each constant does, at its boundary, so `pnpm test:dist` fails when a
// mode file sets one wrongly. A drop-in must do as its original does; the
// root, as its docs say. A constant no entry of its mode can observe has no
// test: `warns` where the API takes no warnings, `deep` where the engine's
// maxDepth is Infinity anyway, and the merge settings js-yaml 5's own
// merging overrides.
import * as std from "@std/yaml";
import * as jsYaml from "js-yaml";
import * as jsYaml5 from "js-yaml5";
import { createRequire } from "node:module";
import * as yaml from "yaml";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parse } from "../src/index.ts";
import * as tinyJsYaml from "../src/js-yaml/index.ts";
import * as tinyJsYaml5 from "../src/js-yaml-v5/index.ts";
import * as tinyStd from "../src/std/index.ts";
import * as tinyYaml from "../src/yaml/index.ts";
import tinyYamljs from "../src/yamljs/index.ts";

const yamljs = createRequire(import.meta.url)("yamljs") as typeof tinyYamljs;

afterEach(() => {
  vi.restoreAllMocks();
});

const keys = (n: number) => Array.from({ length: n }, (_, i) => `k${i}: 0`).join(", ");
/** A `<<` that copies `n` keys. */
const mergeKeys = (n: number) => `a: &a {${keys(n)}}\nb:\n  <<: *a\n`;
/** A `<<` of `n` mappings. */
const mergeSources = (n: number) => {
  const names = Array.from({ length: n }, (_, i) => `a${i}`);
  const anchors = names.map((name) => `${name}: &${name} {${name}: 0}`).join("\n");
  return `${anchors}\nm:\n  <<: [${names.map((name) => `*${name}`).join(", ")}]\n`;
};
/** `n` flow sequences, one in another. */
const nested = (n: number) => "[".repeat(n) + "]".repeat(n);
/** `n` aliases of a sequence. */
const aliases = (n: number) => `a: &a [1]\nb: [${Array(n).fill("*a").join(", ")}]\n`;

type Read = (text: string, warn: (warning: Error) => void, options?: object) => unknown;
/** An input, or an input and the options to read it with. */
type Case = string | [string, object];

// What reading `text` gives, or the first line of what it throws, and the
// first line of each warning, without positions, which other tests check.
function outcome(read: Read, [text, options]: [string, object?]): object {
  const warnings: string[] = [];
  const line = (error: unknown) =>
    String((error as Error).message)
      .split("\n")[0]!
      .replace(/ \(\d+:\d+\)$| at line \d+, column \d+:$/, "");
  try {
    return { value: read(text, (warning) => warnings.push(line(warning)), options), warnings };
  } catch (error) {
    return { error: line(error), warnings };
  }
}

// yaml's warnings go to process.emitWarning.
const yamlRead =
  (parse: (text: string, options?: { merge?: boolean }) => unknown): Read =>
  (text, warn, options) => {
    vi.spyOn(process, "emitWarning").mockImplementation((warning) => warn(warning as Error));
    return parse(text, options);
  };

const DROP_INS: [string, Read, Read, Record<string, Case[]>][] = [
  [
    "tinyaml/js-yaml",
    (text, onWarning, options) => tinyJsYaml.loadAll(text, null, { onWarning, ...options }),
    (text, onWarning, options) => jsYaml.loadAll(text, null, { onWarning, ...options }),
    {
      "maxDepth 100 by default": [nested(99), nested(100)],
      "fewer than 10000 merged keys by default": [mergeKeys(9999), mergeKeys(10000)],
      "fewer merged keys than maxTotalMergeKeys": [
        [mergeKeys(2), { maxTotalMergeKeys: 3 }],
        [mergeKeys(3), { maxTotalMergeKeys: 3 }],
      ],
      "no more than 100 mappings in a <<": [mergeSources(100), mergeSources(101)],
      "no limit on aliases": [aliases(1000)],
      "warnings (warns)": ["a: 'b\nc'", "%YAML 1.3\n--- a"],
      "keys and flow scalars that end by lines (lines)": ["{a\n: b}", "a: [b\nc]"],
      "a repeated property on a later line ending the properties (repeats)": [
        "- !!str\n-\n  !!null : a\n  b: !!str\n- !!str : !!null\n",
      ],
      "no duplicate keys (first)": ["a: 1\na: 2"],
    },
  ],
  [
    "tinyaml/js-yaml-v5",
    (text, _, options) => tinyJsYaml5.loadAll(text, options),
    (text, _, options) => jsYaml5.loadAll(text, options),
    {
      "maxDepth 100 by default": [nested(99), nested(100)],
      "no cap on merged keys by default": [mergeKeys(10001)],
      "no limit on aliases by default": [aliases(1000)],
      "at most maxAliases aliases": [
        [aliases(2), { maxAliases: 2 }],
        [aliases(3), { maxAliases: 2 }],
      ],
      "keys that may end on a later line (lines)": ["{a\n: b}"],
      "decoded tags (repeats)": ["%TAG !e! tag:e,2000:\n--- !e!a%21 x"],
      "no duplicate keys (first)": ["a: 1\na: 2"],
    },
  ],
  [
    "tinyaml/yaml",
    yamlRead(tinyYaml.parse),
    yamlRead(yaml.parse),
    {
      // yaml overflows the call stack further in.
      "no depth limit": [nested(200)],
      "no cap on merged keys": [[mergeKeys(10001), { merge: true }]],
      "any number of mappings in a <<": [[mergeSources(101), { merge: true }]],
      "maxAliasCount 100 by default": [aliases(99), aliases(100)],
      "warnings (warns)": ["%FOO\n--- a"],
      "keys that may end on a later line (lines)": ["{a\n: b}"],
      "no duplicate keys (first)": ["a: 1\na: 2"],
    },
  ],
  [
    "tinyaml/yamljs",
    (text) => tinyYamljs.parse(text),
    (text) => yamljs.parse(text),
    {
      "no depth limit": [nested(1000)],
      "no cap on merged keys": [mergeKeys(10001)],
      "any number of mappings in a <<": [mergeSources(101)],
      "keys that read on past lines (lines)": ["{a\n: b}"],
      "a repeated key's first value (first)": ["a: 1\na: 2", "{a: 1, a: 2}"],
    },
  ],
  [
    "tinyaml/std",
    (text, onWarning) => tinyStd.parseAll(text, { onWarning }),
    (text, onWarning) => std.parseAll(text, { onWarning }),
    {
      "no depth limit": [nested(1000)],
      "no cap on merged keys": [mergeKeys(10001)],
      "any number of mappings in a <<": [mergeSources(101)],
      "no limit on aliases": [aliases(1000)],
      "warnings (warns)": ["a: 'b\nc'"],
      "keys and flow scalars that end by lines (lines)": ["{a\n: b}", "a: [b\nc]"],
      "tags as written (repeats)": ["!a%21 x"],
      "no duplicate keys (first)": ["a: 1\na: 2"],
    },
  ],
];

describe.each(DROP_INS)("%s", (_, tiny, original, cases) => {
  it.each(Object.entries(cases))("has %s, as the original", (_, inputs) => {
    for (const input of inputs) {
      const read: [string, object?] = typeof input === "string" ? [input] : input;
      expect(outcome(tiny, read), read[0].slice(0, 40)).toEqual(outcome(original, read));
    }
  });
});

describe("tinyaml", () => {
  it("has maxDepth 100 by default", () => {
    expect(() => parse(nested(99))).not.toThrow();
    expect(() => parse(nested(100))).toThrow("nesting exceeds maxDepth (100)");
  });

  it("copies at most 10000 merged keys", () => {
    expect(Object.keys((parse(mergeKeys(9999)) as { b: object }).b)).toHaveLength(9999);
    expect(() => parse(mergeKeys(10000))).toThrow("too many merged keys (10000)");
  });

  it("takes any number of mappings in a <<, and aliases", () => {
    expect((parse(mergeSources(101)) as { m: object }).m).toHaveProperty("a100", 0);
    expect((parse(aliases(1000)) as { b: unknown[] }).b).toHaveLength(1000);
  });

  it("takes a key that ends on a later line in a flow mapping (lines)", () => {
    expect(parse("{a\n: b}")).toEqual({ a: "b" });
  });

  it("decodes a tag's suffix (repeats)", () => {
    expect(parse("!a%21 x", { tags: { "!a!": () => 1 } })).toBe(1);
  });

  it("keeps a repeated key's last value where duplicates are allowed (first)", () => {
    expect(parse("a: 1\na: 2", { duplicateKeys: true })).toEqual({ a: 2 });
  });
});

// yamljs fails here too, in other words.
describe("tinyaml/yamljs", () => {
  it("ends a flow node's properties at a repeat on a later line (repeats)", () => {
    expect(() => tinyYamljs.parse("[!!str \n !!str c]")).toThrow("missing comma");
    expect(() => yamljs.parse("[!!str \n !!str c]")).toThrow();
  });
});
