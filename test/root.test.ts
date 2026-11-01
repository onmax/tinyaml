import { describe, expect, it } from "vite-plus/test";
import { parse, parseAll, stringify, YAMLError } from "../src/index.ts";

describe("parse", () => {
  it("resolves YAML 1.2 core values", () => {
    expect(
      parse(
        "a: ~\nb: True\nc: 0o17\nd: 0x1F\ne: 1.5e3\nf: .inf\ng: yes\nh: 2001-12-14\ni:\nj: 0b11",
      ),
    ).toEqual({
      a: null,
      b: true,
      c: 15,
      d: 31,
      e: 1500,
      f: Infinity,
      g: "yes",
      h: "2001-12-14",
      i: null,
      j: "0b11",
    });
  });

  it("merges << keys unless turned off", () => {
    const text = "base: &b {x: 1, y: 2}\nm:\n  <<: *b\n  y: 3";
    expect(parse(text)).toEqual({ base: { x: 1, y: 2 }, m: { x: 1, y: 3 } });
    expect(parse("<<: {a: 1}", { merge: false })).toEqual({ "<<": { a: 1 } });
  });

  it("resolves custom tags and keeps unknown ones as their value", () => {
    const tags = { "!upper": (value: unknown) => String(value).toUpperCase() };
    expect(parse("a: !upper hi\nb: !Ref thing", { tags })).toEqual({ a: "HI", b: "thing" });
    expect(() => parse("a: !!int nope")).toThrow(/cannot resolve/);
  });

  it("rejects duplicate keys unless allowed", () => {
    expect(() => parse("a: 1\na: 2")).toThrow(YAMLError);
    expect(parse("a: 1\na: 2", { duplicateKeys: true })).toEqual({ a: 2 });
  });

  it("reports line and column", () => {
    try {
      parse("a: 1\nb: [1, 2");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(YAMLError);
      expect((error as YAMLError).line).toBe(2);
      expect((error as YAMLError).message).toMatch(/\(2:\d+\)$/);
    }
    // A CRLF is one line break, and so is a lone CR.
    for (const text of [
      "a: 1\r\nb: 2\r\nb: 3\r\n",
      "a: 1\rb: 2\rb: 3\r",
      "\uFEFFa: 1\r\nb: 2\r\nb: 3",
    ])
      expect(() => parse(text), JSON.stringify(text)).toThrow(
        expect.objectContaining({ line: 3, column: 1 }),
      );
  });

  it("splits documents", () => {
    expect(parseAll("a\n---\nb")).toEqual(["a", "b"]);
    expect(parse("")).toBeUndefined();
    expect(() => parse("a\n---\nb")).toThrow(YAMLError);
  });

  it("starts every call afresh", () => {
    expect(() => parse("&a !<")).toThrow(YAMLError);
    expect(() => parse("[*a]")).toThrow(/unknown alias/);
  });

  it("reads floats that start with a dot", () => {
    expect(parseAll(".5\n---\n-.5\n---\n+.5\n---\n!!float .5\n---\n-.inf\n---\n.NaN")).toEqual([
      0.5,
      -0.5,
      0.5,
      0.5,
      -Infinity,
      NaN,
    ]);
  });

  it("counts a top-level block scalar's indentation indicator from column 0", () => {
    expect(parse("|2\n  a\n")).toBe("a\n");
    expect(parse(">1\n  a\n")).toBe(" a\n");
    expect(parse("--- |2\n   a\n")).toBe(" a\n");
    expect(() => parse("|2\n a\n")).toThrow(YAMLError);
  });

  it("drops a byte order mark only where a document starts", () => {
    expect(parse('"a\n\uFEFFb"')).toBe("a \uFEFFb");
    expect(parseAll("\uFEFFa\n...\n\uFEFF# c\nb\n")).toEqual(["a", "b"]);
    expect(parseAll("a\n---\n\uFEFFb")).toEqual(["a", "\uFEFFb"]);
    expect(parseAll("a\n...\n\uFEFF...\n\uFEFFb")).toEqual(["a", "b"]);
    expect(parseAll("a\n...\n\uFEFF\n\uFEFFb")).toEqual(["a", "\uFEFFb"]);
    expect(parse("--- |\n \uFEFF...\n")).toBe("\uFEFF...\n");
  });

  it("drops document-start byte order marks in linear time", () => {
    const text = "\uFEFF--- 1\n...\n".repeat(100_000);
    const start = performance.now();
    expect(parseAll(text)).toHaveLength(100_000);
    // Each one used to copy the rest of the input: seconds, not milliseconds.
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("rejects a document marker in a quoted scalar, even after an escaped break", () => {
    expect(() => parse('"a\\\n...\nb"')).toThrow(/document ends inside/);
    expect(() => parse('"a\\\n--- b"')).toThrow(/document ends inside/);
    expect(parse('"a\\\n  ...\n  b"')).toBe("a... b");
  });

  it("rejects non-printable characters wherever they're written", () => {
    for (const text of [
      '"\x7F"',
      "'\uFFFE'",
      '"\x85\x80"',
      '"\uD800"',
      "#\x01\na: 1",
      "a: 1 # \x7F",
      "[&a\x01 1, *a\x01]",
      "!<foo\x01bar> x",
      "!x\x7F x",
      "%TAG !e! tag:\x01\n--- !e!x 1",
      "a\x7Fb",
      "|\n  \x7F\n",
    ])
      expect(() => parse(text), JSON.stringify(text)).toThrow(/non-printable|control/);
    // Escapes write them, and printable ones pass.
    expect(parse('"\\x01\\x7F\\uFFFE"')).toBe("\x01\x7F\uFFFE");
    expect(parse("'\x85\u{1F600}' # \u00E9\uFEFF")).toBe("\x85\u{1F600}");
    expect(() => parse('a: "\x7F"\nb: c')).toThrow(expect.objectContaining({ line: 1, column: 5 }));
  });

  it("takes a tab after `:` or `-` before a flow collection", () => {
    expect(parse("a:\t[]\nb:\t{c: 1}\nd:\n-\t[1]")).toEqual({ a: [], b: { c: 1 }, d: [[1]] });
    expect(() => parse("a:\n\t[]")).toThrow(YAMLError);
  });

  it("merges explicit << keys", () => {
    expect(parse("? !!merge <<\n: {a: 1}")).toEqual({ a: 1 });
    expect(parse("? <<\n: {a: 1}\nb: 2")).toEqual({ a: 1, b: 2 });
    expect(parse("? <<\n: {a: 1}", { merge: false })).toEqual({ "<<": { a: 1 } });
  });

  it("rejects escapes past U+10FFFF with a position", () => {
    for (const text of ['"\\U00110000"', '"\\UFFFFFFFF"'])
      expect(() => parse(text)).toThrow(expect.objectContaining({ name: "YAMLError", line: 1 }));
    expect(parse('"\\U0010FFFF"')).toBe("\u{10FFFF}");
  });

  it("counts an implicit key's characters as code points", () => {
    const fits = "\u{1F600}".repeat(1024);
    expect(parse(`${fits}: 1`)).toEqual({ [fits]: 1 });
    expect(() => parse(`${fits}a: 1`)).toThrow(/1024/);
    for (const n of [513, 1024, 1025]) {
      const value = { ["\u{1F600}".repeat(n)]: 1, ["a\u{1F600}".repeat(n)]: { b: 2 } };
      expect(parse(stringify(value))).toEqual(value);
    }
  });

  it("caps implicit keys at 1024 characters", () => {
    const key = "a".repeat(1024);
    expect(parse(`${key}: 1`)).toEqual({ [key]: 1 });
    expect(() => parse(`${key}a: 1`)).toThrow(/1024/);
    expect(() => parse(`b: 1\n${key}a: 1`)).toThrow(/1024/);
    expect(() => parse(`[${key}a: 1]`)).toThrow(/1024/);
    expect(parse(`? ${key}a\n: 1`)).toEqual({ [`${key}a`]: 1 });
    expect(parse(`{${key}a: 1}`)).toEqual({ [`${key}a`]: 1 });
  });

  it("rejects core tags on the wrong kind of node", () => {
    for (const text of ["!!map x", "!!seq x", "!!map [a]", "!!seq {a: 1}", "!!str [a]", "!!int {}"])
      expect(() => parse(text), text).toThrow(/cannot resolve/);
    expect(parse("!!map")).toEqual({});
    expect(parse("!!seq")).toEqual([]);
  });

  it("reads a flow node's properties across lines, each kind once", () => {
    expect(parse("[!!str \n &c 1, *c]")).toEqual(["1", "1"]);
    expect(parse("[&a # c\n !!str \n 1]")).toEqual(["1"]);
    expect(parse("{? &a \n !!str k}")).toEqual({ k: null });
    for (const [text, reason] of [
      ["[&a \n &b c]", "repeated anchor (2:2)"],
      ["[!!str \n !!str c]", "repeated tag (2:2)"],
      ["{a: &a \n &b c}", "repeated anchor (2:2)"],
      ["[&a &b c]", "repeated anchor (1:5)"],
    ] as const)
      expect(() => parse(text), text).toThrow(reason);
  });

  it("reads a block node's properties across lines, each kind once", () => {
    expect(parse("- !!str \n  &c 1\n- *c")).toEqual(["1", "1"]);
    expect(parse("a: &a \n  &b k: v\nb: *b")).toEqual({ a: { k: "v" }, b: "k" });
    for (const [text, reason] of [
      ["- &a \n  &b c", "repeated anchor (2:3)"],
      ["a: !!str \n  !!int c", "repeated tag (2:3)"],
      ["- &a \n  !!str &b c", "repeated anchor (2:9)"],
      ["- &a # c\n  &b - x", "repeated anchor (2:3)"],
      ["&a \n&b c", "repeated anchor (2:1)"],
    ] as const)
      expect(() => parse(text), text).toThrow(reason);
  });
});

describe("stringify", () => {
  it("writes block YAML and quotes ambiguous strings", () => {
    expect(stringify({ a: 1, b: "yes", c: [1, { d: null }], e: "two\nlines\n" })).toBe(
      "a: 1\nb: 'yes'\nc:\n  - 1\n  - d: null\ne: |\n  two\n  lines\n",
    );
  });

  it("follows JSON.stringify for values YAML can't hold", () => {
    expect(stringify({ f: () => 1, u: undefined, a: [undefined, Symbol()], d: new Date(0) })).toBe(
      "a:\n  - null\n  - null\nd: '1970-01-01T00:00:00.000Z'\n",
    );
  });

  it("follows JSON.stringify for holes and toJSON results it leaves out", () => {
    const gone = { toJSON: () => undefined };
    // Index 1 is a hole, as in `[gone, , 1]`.
    const holey: unknown[] = [gone];
    holey[2] = 1;
    expect(stringify(holey)).toBe("- null\n- null\n- 1\n");
    expect(stringify({ a: gone, b: 1 })).toBe("b: 1\n");
    expect(stringify({ a: gone })).toBe("{}\n");
    // The last value written decides whether the document needs a `...`.
    expect(stringify({ a: "x\n\n", b: gone })).toBe("a: |+\n  x\n\n...\n");
  });

  it("rounds a fractional indent up, as js-yaml does", () => {
    for (const value of [" a\n", { a: { b: [1, " c\n"] } }]) {
      expect(stringify(value, { indent: 1.5 })).toBe(stringify(value, { indent: 2 }));
      expect(stringify(value, { indent: 2.1 })).toBe(stringify(value, { indent: 3 }));
      expect(parse(stringify(value, { indent: 0.5 }))).toEqual(value);
    }
  });

  it("takes indent 0 as the default, as js-yaml does", () => {
    expect(stringify({ a: { b: 1 } }, { indent: 0 })).toBe("a:\n  b: 1\n");
    expect(stringify({ a: { b: 1 } }, { indent: Number.NaN })).toBe("a:\n  b: 1\n");
    expect(stringify({ a: { b: 1 } }, { indent: -1 })).toBe("a:\n b: 1\n");
  });

  it("quotes what would read back as something else", () => {
    expect(stringify("1e999")).toBe("'1e999'\n");
    expect(stringify({ ["9".repeat(400)]: 1 })).toBe(`'${"9".repeat(400)}': 1\n`);
    expect(stringify({ "--- a": 1, "... b": 2 })).toBe("'--- a': 1\n'... b': 2\n");
  });

  it("writes indentation indicators from the parent's column", () => {
    expect(stringify(" a\n")).toBe("|2\n   a\n");
    expect(stringify({ k: " a\n" }, { indent: 3 })).toBe("k: |3\n    a\n");
    for (const value of [" a\n", { k: [" a\n", { j: "\n b" }] }])
      for (const indent of [1, 2, 4, 9]) expect(parse(stringify(value, { indent }))).toEqual(value);
  });

  it("round-trips through parse", () => {
    const value = { s: "yes", n: "123", t: "true", e: "", m: { list: [1, "a: b", "#x"] } };
    expect(parse(stringify(value))).toEqual(value);
  });
});
