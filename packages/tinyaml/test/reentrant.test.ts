// A custom tag may parse another document while the parser is in the middle
// of this one, as an `!include` does, and a `toJSON` may stringify another
// value. Every entry shares one parser, so each one is checked, and so are
// calls from one entry into another.
import { describe, expect, it } from "vite-plus/test";
import { parse, stringify } from "../src/index.ts";
import * as jsYaml from "../src/js-yaml/index.ts";
import * as jsYaml5 from "../src/js-yaml-v5/index.ts";
import * as yaml from "../src/yaml/index.ts";
import yamljs from "../src/yamljs/index.ts";

// Aliases, a duplicate key and lines after the tag all need the outer state.
const input = "base: &b {x: 1}\nconfig: !include inner\nafter: *b\nlast: kept\n";
const included = { base: { x: 1 }, config: { inside: "inner" }, after: { x: 1 }, last: "kept" };

describe("a tag that parses another document", () => {
  it("works in tinyaml", () => {
    const tags = { "!include": (value: unknown) => parse(`inside: ${value as string}`) };
    expect(parse(input, { tags })).toEqual(included);
  });

  it("works in tinyaml/js-yaml", () => {
    const include = new jsYaml.Type("!include", {
      kind: "scalar",
      construct: (value: string) => jsYaml.load(`inside: ${value}`),
    });
    const schema = jsYaml.DEFAULT_SCHEMA.extend(include);
    expect(jsYaml.load(input, { schema })).toEqual(included);
  });

  it("works in tinyaml/js-yaml-v5", () => {
    const include = jsYaml5.defineScalarTag("!include", {
      resolve: (value: string) => jsYaml5.load(`inside: ${value}`),
      identify: () => false,
    });
    const schema = jsYaml5.CORE_SCHEMA.withTags(include);
    expect(jsYaml5.load(input, { schema })).toEqual(included);
  });

  it("works in tinyaml/yaml", () => {
    const customTags = [
      { tag: "!include", resolve: (value: string) => yaml.parse(`inside: ${value}`) },
    ];
    expect(yaml.parse(input, { customTags, merge: true })).toEqual(included);
  });

  it("works in tinyaml/yamljs", () => {
    const decoder = (_: string, value: unknown) => yamljs.parse(`inside: ${value as string}`);
    expect(yamljs.parse(input, false, decoder)).toEqual(included);
  });

  it("works from one entry into another", () => {
    const tags = { "!include": (value: unknown) => jsYaml.load(`inside: ${value as string}`) };
    expect(parse(input, { tags })).toEqual(included);
  });

  it("survives a nested parse that throws", () => {
    const tags = {
      "!include": (value: unknown) => {
        expect(() => parse("&a [")).toThrow();
        return parse(`inside: ${value as string}`);
      },
    };
    expect(parse(input, { tags })).toEqual(included);
    // The anchor read by the failed call is gone.
    expect(() => parse("[*a]")).toThrow(/unknown alias/);
  });

  it("keeps the outer node's state, as a flow key's", () => {
    const tags = (inner: string) => ({ "!x": (value: unknown) => (parse(inner), value) });
    expect(parse('{!x "a":b}', { tags: tags("0") })).toEqual({ a: "b" });
    expect(() => parse("{!x a #\n:b}", { tags: tags('"q"') })).toThrow(/white space after ":"/);
  });

  it("keeps the outer error's position", () => {
    const tags = { "!include": (value: unknown) => parse(`inside: ${value as string}`) };
    expect(() => parse(`${input}bad: [`, { tags })).toThrow(/\(5:/);
    const customTags = [{ tag: "!include", resolve: (v: string) => yaml.parse(`inside: ${v}`) }];
    expect(() => yaml.parse(`${input}bad: [`, { customTags })).toThrow(/line 5/);
  });
});

describe("a toJSON that stringifies another value", () => {
  it("leaves the outer call alone when the inner one's options throw", () => {
    const value = {
      outer: {
        a: {
          toJSON() {
            try {
              stringify(1, {
                indent: 1,
                get sortKeys(): boolean {
                  throw new Error("nested");
                },
              });
            } catch {}
            return { b: 1 };
          },
        },
        c: { d: 2 },
      },
    };
    expect(stringify(value)).toBe("outer:\n  a:\n    b: 1\n  c:\n    d: 2\n");
  });

  it("leaves the outer options, anchors and aliases alone", () => {
    const shared = { y: 2 };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const value = {
      a: {
        toJSON() {
          return stringify({ inner: shared }, { indent: 4, refs: false });
        },
      },
      b: shared,
      c: shared,
      cyclic,
    };
    expect(stringify(value)).toBe(
      "a: |\n  inner:\n      'y': 2\nb: &ref_0\n  'y': 2\nc: *ref_0\ncyclic: &ref_1\n  self: *ref_1\n",
    );
  });
});
