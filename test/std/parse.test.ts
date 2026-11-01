import * as std from "@std/yaml";
import { describe, expect, it } from "vite-plus/test";
import { parse, parseAll, YamlSyntaxError } from "../../src/std/index.ts";

// Same value as @std/yaml, or the same error type and message.
function same(input: string, options?: Parameters<typeof parse>[1]) {
  const run = (fn: typeof parse) => {
    try {
      return { value: fn(input, options) };
    } catch (error) {
      return { error: `${(error as Error).name}: ${(error as Error).message}` };
    }
  };
  expect(run(parse)).toEqual(run(std.parse));
}

describe("parse", () => {
  it("resolves std's YAML 1.1 style numbers", () => {
    expect(
      parse(
        "a: 1_000\nb: 0x1F\nc: 017\nd: 0o17\ne: 1:30\nf: 0b1_0\ng: .5\nh: 1e3\ni: -.inf\nj: 08\nk: -00",
      ),
    ).toEqual({
      a: 1000,
      b: 31,
      c: 15,
      d: "0o17",
      e: "1:30",
      f: 2,
      g: 0.5,
      h: 1000,
      i: -Infinity,
      j: "08",
      k: -0,
    });
  });

  it("resolves booleans, nulls and timestamps like std", () => {
    expect(parse("[yes, True, ~, Null, '', 2001-12-14, 2001-12-14t21:59:43.10-05:00]")).toEqual([
      "yes",
      true,
      null,
      null,
      "",
      new Date("2001-12-14T00:00:00Z"),
      new Date("2001-12-15T02:59:43.100Z"),
    ]);
  });

  it("follows each schema", () => {
    for (const schema of ["failsafe", "json", "core", "default", "extended"] as const)
      for (const input of [
        "[1, true, null, 2001-01-01]\n",
        "- <<\n- a",
        "a: !!binary aGk=\nb: !!set {x}\nc: !!omap [{a: 1}]\nd: !!pairs [{a: 1}]",
        "a: !!js/regexp /ab+c/gi\nb: !!js/undefined\nc: !!int 0x1",
        "<<: {a: 1}\nb: 2",
      ])
        same(input, { schema });
  });

  it("throws what std throws for explicit tags", () => {
    for (const input of [
      "!!int",
      "!!null",
      "a: !!int 1",
      "!!float x",
      "!!str [a]",
      "!!omap",
      "!!foo x",
    ])
      same(input);
  });

  it("returns null for no document and throws for more than one", () => {
    expect(parse("")).toBe(null);
    expect(parse("# just a comment")).toBe(null);
    expect(parseAll("")).toEqual([]);
    expect(parseAll("\n")).toEqual([null]);
    same("hello: world\n---\nfoo: bar");
    same("a\n...\n# c\n---\nb");
  });

  it("allows duplicate keys on request", () => {
    same("a: 1\na: 2");
    expect(parse("a: 1\na: 2", { allowDuplicateKeys: true })).toEqual({ a: 2 });
  });

  it("merges << keys and stores keys like std", () => {
    same("base: &b {x: 1, y: 2}\nm:\n  <<: *b\n  y: 3");
    same("? [a, {b: 1}]\n: c");
    same("? [[a]]\n: c");
    same("__proto__: 1");
  });

  it("throws YamlSyntaxError with std's message, position and snippet", () => {
    let error: unknown;
    try {
      parse("a: 1\na: 2");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(YamlSyntaxError);
    expect(error).toBeInstanceOf(SyntaxError);
    expect(error).toMatchObject({
      name: "YamlSyntaxError",
      line: 2,
      column: 1,
      offset: 5,
      message: "Cannot store mapping pair: duplicated key at line 2, column 1:\n    a: 2\n    ^",
    });
    for (const input of ['"\\xyz"', "{a: 1", "a: *x", "'abc", "%TAG !a\n---", "- a\n b"])
      same(input);
  });

  it("reads a flow node's properties across lines, as std does", () => {
    for (const input of [
      "[!!str \n &c c]",
      "[&a \n &b c]",
      "[!!str \n !!int c]",
      "[&a \n !!str c]",
      "[&a\n &b c]",
      "{a: &a \n &b c}",
      "[!!str # c\n &c c]",
      "[!!str \n &c \n c]",
      "[&a \n !!str \n &b c]",
      "{? &a \n &b k: v}",
      "[&a \n !!str [x]]",
      "[&a \n k: v]",
      "[&a &b c]",
      "- !!str \n  &c c",
      "a: !!str \n  &c c",
      "- &a \n  !!str c",
    ])
      same(input);
  });

  it("points into the content as given, CRs and all, as std does", () => {
    // The position of each warning and of the error.
    const where = (
      fn: (input: string, options: { onWarning(e: Error): void }) => unknown,
      input: string,
    ) => {
      const found: unknown[] = [];
      const keep = (e: unknown) => {
        const { line, column, offset, snippet } = e as YamlSyntaxError;
        found.push({ line, column, offset, snippet });
      };
      try {
        fn(input, { onWarning: keep });
      } catch (e) {
        keep(e);
      }
      return found;
    };
    for (const input of [
      "a\r\nb: [\r\n",
      "\uFEFFa\r\nb: [\r\n",
      "a\rb: [\r",
      "a: 1\r\nb: 2\r\nb: 3\r\n",
      'a: "\\x4"\r\n',
      "%FOO\r\n---\r\na: ]\r\n",
      "%TAG ! \r\n---\r\na",
      "%YAML 1.1\r\n---\r\na: b\u2028c\r\n",
      "%YAML 1.1\r\n---\r\na: b\u2028c",
      "\uFEFF%YAML 1.1\n---\na: b\u2028c\n",
      "a\r\n...\r\n#c\r\nb",
      "\uFEFFa\r\n---\r\nb",
      "\uFEFFa\n---\nb",
    ])
      for (const [ours, theirs] of [
        [parse, std.parse],
        [parseAll, std.parseAll],
      ] as const)
        expect(where(ours, input), JSON.stringify(input)).toEqual(where(theirs, input));
    expect(where(parse, "a\r\nb: [\r\n")).toMatchObject([{ offset: 4, line: 2, column: 2 }]);
    expect(where(parse, "a\r\n...\r\n#c\r\nb")).toMatchObject([{ offset: 12, line: 4 }]);
  });

  it("reports warnings as YamlSyntaxError", () => {
    const warnings: YamlSyntaxError[] = [];
    parse("%YAML 1.3\n---\na: 1", { onWarning: (w) => warnings.push(w) });
    expect(warnings.map((w) => w.message)).toEqual([
      "Cannot handle YAML directive: unsupported YAML version at line 2, column 1:\n    ---\n    ^",
    ]);
  });
});

// std's parser is js-yaml 3's, and tinyaml/std doesn't copy these of its
// bugs. Each test pins what std does and what tinyaml/std does instead.
describe("where std's parser, js-yaml 3's, misreads", () => {
  it("rejects tabs in indentation, which std reads as white space", () => {
    expect(std.parse("key:\n\t- a")).toEqual({ key: ["a"] });
    expect(() => parse("key:\n\t- a")).toThrow("tab characters must not be used in indentation");
    expect(std.parse("foo:\n  a: 1\n  \tb: 2")).toEqual({ foo: { a: 1, b: 2 } });
    expect(() => parse("foo:\n  a: 1\n  \tb: 2")).toThrow(
      "tab characters must not be used in indentation",
    );
    // Both reject this one, std for the merge and tinyaml/std for the tab.
    expect(() => std.parse("-\t<<: -1")).toThrow("Cannot merge mappings");
    expect(() => parse("-\t<<: -1")).toThrow("bad indentation of a sequence entry");
  });

  it("drops white space before line breaks in quoted scalars, which std keeps", () => {
    expect(std.parse('"a \t\n  b"')).toBe("a \t b");
    expect(parse('"a \t\n  b"')).toBe("a b");
    const input = "' 1st non-empty\n\n 2nd non-empty \n\t3rd non-empty '";
    expect(std.parse(input)).toBe(" 1st non-empty\n2nd non-empty  3rd non-empty ");
    expect(parse(input)).toBe(" 1st non-empty\n2nd non-empty 3rd non-empty ");
  });

  it("rejects empty flow entries, which std reads as null", () => {
    expect(std.parse("[a,,b]")).toEqual(["a", null, "b"]);
    expect(() => parse("[a,,b]")).toThrow("expected the node content, but found ','");
    expect(std.parse("{a: 1, , b: 2}")).toEqual({ a: 1, null: null, b: 2 });
    expect(() => parse("{a: 1, , b: 2}")).toThrow("expected the node content, but found ','");
  });

  it("rejects a top-level block scalar at column 0, which std reads wrong", () => {
    // std reads past the next `---`, and keeps a trailing space; yaml reads
    // "foo\n" and "line1 line2\n". tinyaml/std rejects both, as js-yaml 4 does.
    expect(std.parse("--- |\nfoo\n---\nbar\n")).toBe("foo\n---\nbar\n");
    expect(() => parse("--- |\nfoo\n---\nbar\n")).toThrow("missing indentation for block scalar");
    expect(std.parse("--- >\nline1\nline2\n")).toBe("line1 line2 ");
    expect(() => parse("--- >\nline1\nline2\n")).toThrow("missing indentation for block scalar");
  });

  it("rejects a mapping entry after a quoted value on the same line", () => {
    expect(std.parse("a: 'x' b: 1")).toEqual({ a: "x", b: 1 });
    expect(() => parse("a: 'x' b: 1")).toThrow("bad indentation of a mapping entry");
    same("- 'a' - b");
  });

  it("keeps << as a string in a flow sequence, as std does", () => {
    same("[<<, a]");
  });

  it("reads an alias of an empty anchored node as null, where std gives []", () => {
    expect(std.parse("a: &x\nb: *x\n")).toEqual({ a: null, b: [] });
    expect(parse("a: &x\nb: *x\n")).toEqual({ a: null, b: null });
  });

  it("rejects properties on the line below a key, which std reads as its value", () => {
    expect(std.parse("key: &x\n!!map\n  a: b\n")).toEqual({ key: { a: "b" } });
    expect(() => parse("key: &x\n!!map\n  a: b\n")).toThrow(
      "a multiline key may not be an implicit key",
    );
  });

  it("rejects a key with properties mid-line, where js-yaml 4 starts a mapping", () => {
    const options = { schema: "extended", allowDuplicateKeys: false } as const;
    for (const input of [
      "key1: &alias value1&a &b *alias : value2\n",
      "a: &x b: c\n",
      "a: !!str b: c",
    ]) {
      expect(() => std.parseAll(input, options)).toThrow();
      expect(() => parseAll(input, options)).toThrow(YamlSyntaxError);
    }
  });

  it("reads flow keys and tags as std does", () => {
    for (const input of [
      "k: {\nk\n:\nv\n}\n",
      "{a\n b: c}\n",
      "- { y: x\nz }- invalid\n",
      "{a: !x, b: 1}\n",
      "[!!str,a]\n",
    ])
      same(input);
  });

  it("reads a node that ends on a later line, or an empty key, as a value", () => {
    for (const input of ["? [\n\n] : x\n", "[23\n]: 42\n", '- - "bar\nbar": x\n', "- &a : a\n"])
      same(input);
  });

  it("ends a block scalar at a tab before a comment", () => {
    same("foo: |\n\t #\nbar: 1\n");
  });
});
