import * as yaml from "yaml";
import { describe, expect, it } from "vite-plus/test";
import { stringify, type StringifyOptions } from "../../src/yaml/index.ts";

describe("stringify", () => {
  it("keeps spaces and final newlines in double-quoted runs", () => {
    const options = {
      defaultStringType: "QUOTE_DOUBLE" as const,
      doubleQuotedMinMultiLineLength: 0,
    };
    for (const value of [
      "a \n\nb",
      "a\n\n",
      "a \n",
      "a\n b",
      "a\\n\nb",
      "a\0\x07\x0b\x1b\x01\nend",
      "a\n\n\n b",
    ]) {
      for (const doubleQuotedMinMultiLineLength of [0, 40]) {
        const opt = { ...options, doubleQuotedMinMultiLineLength };
        expect(stringify({ [value]: value }, opt)).toBe(yaml.stringify({ [value]: value }, opt));
      }
    }
  });

  it("writes yaml's default style", () => {
    expect(
      stringify({
        a: 1,
        b: [1, "two", { c: true }],
        d: null,
        e: "true",
        f: "",
        g: "multi\nline\n",
        h: [],
        i: {},
        j: "x: y",
      }),
    ).toBe(
      'a: 1\nb:\n  - 1\n  - two\n  - c: true\nd: null\ne: "true"\nf: ""\ng: |\n  multi\n  line\nh: []\ni: {}\nj: "x: y"\n',
    );
    expect(stringify("x")).toBe("x\n");
    expect(stringify(undefined)).toBe(undefined);
    expect(stringify(undefined, { keepUndefined: true })).toBe("null\n");
    expect(stringify({ a: undefined, b: null })).toBe("b: null\n");
    expect(() => stringify({ f: () => {} })).toThrow("Tag not resolved for Function value");
  });

  it("anchors repeated objects as a1, a2...", () => {
    const shared = { x: 1 };
    expect(stringify({ a: shared, b: shared, c: [shared] })).toBe(
      "a: &a1\n  x: 1\nb: *a1\nc:\n  - *a1\n",
    );
    expect(stringify({ a: shared, b: shared }, { aliasDuplicateObjects: false })).toBe(
      "a:\n  x: 1\nb:\n  x: 1\n",
    );
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(stringify(cycle)).toBe("&a1\n- *a1\n");
  });

  it("folds long lines at lineWidth", () => {
    const text = `${"word ".repeat(30)}end`;
    expect(stringify({ text })).toBe(
      `text: ${"word ".repeat(14)}word\n  ${"word ".repeat(15)}end\n`,
    );
    expect(stringify({ text }, { lineWidth: 0 })).toBe(`text: ${text}\n`);
  });

  it("takes an indent as a number or string", () => {
    expect(stringify({ a: { b: 1 } }, null, 4)).toBe("a:\n    b: 1\n");
    expect(stringify({ a: { b: 1 } }, null, "   ")).toBe("a:\n   b: 1\n");
    expect(() => stringify({}, { indent: 0 })).toThrow(/must be a positive integer/);
  });

  it("applies a replacer function or key list", () => {
    expect(stringify({ a: 1, b: 2 }, (_key, value) => (value === 2 ? undefined : value))).toBe(
      "a: 1\n",
    );
    expect(stringify({ a: 1, b: 2, 3: 3 }, ["a", 3])).toBe('"3": 3\na: 1\n');
  });

  it("supports the string and collection style options", () => {
    const value = { k: "v", list: ["a", "b"], n: null, t: true };
    const cases: [StringifyOptions, string][] = [
      [
        { defaultStringType: "QUOTE_DOUBLE" },
        '"k": "v"\n"list":\n  - "a"\n  - "b"\n"n": null\n"t": true\n',
      ],
      [
        { defaultStringType: "QUOTE_SINGLE", defaultKeyType: "PLAIN" },
        "k: 'v'\nlist:\n  - 'a'\n  - 'b'\nn: null\nt: true\n",
      ],
      [{ nullStr: "~", trueStr: "True" }, "k: v\nlist:\n  - a\n  - b\nn: ~\nt: True\n"],
      [{ indentSeq: false }, "k: v\nlist:\n- a\n- b\nn: null\nt: true\n"],
      [{ collectionStyle: "flow" }, "{ k: v, list: [ a, b ], n: null, t: true }\n"],
      [
        { collectionStyle: "flow", flowCollectionPadding: false },
        "{k: v, list: [a, b], n: null, t: true}\n",
      ],
      [{ directives: true }, "---\nk: v\nlist:\n  - a\n  - b\nn: null\nt: true\n"],
    ];
    for (const [options, expected] of cases) expect(stringify(value, options)).toBe(expected);
    expect(stringify({ b: 1, a: 2 }, { sortMapEntries: true })).toBe("a: 2\nb: 1\n");
    expect(stringify({ s: "it's" }, { singleQuote: true })).toBe("s: it's\n");
    expect(stringify({ s: "a\nb" }, { blockQuote: false })).toBe('s: "a\\nb"\n');
    expect(stringify({ s: "é\u0007" }, { doubleQuotedAsJSON: true })).toBe('s: "é\\u0007"\n');
  });

  it("enforces simpleKeys", () => {
    expect(() => stringify(new Map([[[1], 2]]), { simpleKeys: true })).toThrow(
      "With simple keys, collection cannot be used as a key value",
    );
    expect(stringify(new Map([[[1], 2]]))).toBe("? - 1\n: 2\n");
  });

  it("quotes strings other schemas would misread", () => {
    expect(stringify(["yes", "1.0", "<<"])).toBe('- yes\n- "1.0"\n- <<\n');
    expect(stringify(["yes", "<<"], { schema: "yaml-1.1" })).toBe('- "yes"\n- <<\n');
    expect(stringify({ a: 1 }, { schema: "json" })).toBe('"a": 1\n');
  });

  it("agrees with yaml on assorted values", () => {
    const long = "lorem ipsum dolor sit amet ".repeat(8);
    const values: unknown[] = [
      { nested: { deeply: [{ list: [1, 2.5, -0, NaN, Infinity] }] } },
      { text: `${long}\n\n  indented\n${long}`, quote: `"${long}'`, control: "\x00\x1b" },
      ["- dash", "? q", "#hash", "a #b", ": colon", "---", "...", "%", "@at", "`tick"],
      new Map<unknown, unknown>([
        [1, "one"],
        [null, "nil"],
        [{ k: 1 }, "object key"],
      ]),
      new Set(["a", "b"]),
      { date: new Date(Date.UTC(2020, 0, 2)), big: 12345678901234567890n },
    ];
    const options: StringifyOptions[] = [
      {},
      { indent: 4, lineWidth: 40 },
      { minContentWidth: 0, lineWidth: 30 },
    ];
    for (const value of values)
      for (const opts of options)
        expect(stringify(value, opts)).toBe(yaml.stringify(value, opts as yaml.ToStringOptions));
  });
});
