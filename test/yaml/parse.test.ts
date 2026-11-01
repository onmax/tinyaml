import * as yaml from "yaml";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import YAML, { parse, YAMLError, YAMLParseError, YAMLWarning } from "../../src/yaml/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

// Warnings go to process.emitWarning, as in yaml.
function warnings(): () => unknown[] {
  const spy = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
  return () => spy.mock.calls.map((call) => call[0]);
}

describe("parse", () => {
  it("resolves YAML 1.2 core schema values", () => {
    expect(
      parse(
        "a: ~\nb: True\nc: 0o17\nd: 0x1F\ne: 1.5e3\nf: .inf\ng: yes\nh: 2001-12-14\ni:\nj: 1_000",
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
      j: "1_000",
    });
  });

  it("returns null for empty input and throws for several documents", () => {
    expect(parse("")).toBe(null);
    expect(parse("# just a comment\n")).toBe(null);
    expect(parse("--- a\n...\n")).toBe("a");
    const error = (() => {
      try {
        parse("a\n---\nb");
      } catch (e) {
        return e;
      }
    })() as YAMLParseError;
    expect(error).toBeInstanceOf(YAMLParseError);
    expect(error).toBeInstanceOf(YAMLError);
    expect(error.code).toBe("MULTIPLE_DOCS");
    expect(error.message).toBe(
      "Source contains multiple documents; please use YAML.parseAllDocuments() at line 2, column 1:\n\na\n---\n^\n",
    );
    // yaml counts a `...` with no document before it as an empty one.
    expect(() => parse("...\nfoo")).toThrow(/multiple documents/);
  });

  it("throws YAMLParseErrors with yaml's codes, positions and excerpts", () => {
    const error = (() => {
      try {
        parse("a: 1\na: 2");
      } catch (e) {
        return e;
      }
    })() as YAMLParseError;
    expect(error).toMatchObject({
      name: "YAMLParseError",
      code: "DUPLICATE_KEY",
      pos: [5, 6],
      linePos: [
        { line: 2, col: 1 },
        { line: 2, col: 2 },
      ],
      message: "Map keys must be unique at line 2, column 1:\n\na: 1\na: 2\n^\n",
    });
    expect(() => parse('key: "open')).toThrow(YAMLParseError);
    expect(() => parse("a: 1\na: 2", { prettyErrors: false })).toThrow(/^Map keys must be unique$/);
    expect(() => parse("*nope")).toThrow(ReferenceError);
  });

  it("takes a reviver, and options in either position", () => {
    const reviver = (key: unknown, value: unknown) =>
      typeof value === "number" ? value * 2 : value;
    expect(parse("a: 1\nb: [2]", reviver)).toEqual({ a: 2, b: [4] });
    expect(parse("a: 1", { schema: "failsafe" })).toEqual({ a: "1" });
    expect(parse("a: 1", reviver, { schema: "failsafe" })).toEqual({ a: "1" });
  });

  it("supports the json, failsafe and yaml-1.1 schemas", () => {
    expect(parse('{"a": [1, true, null]}', { schema: "json" })).toEqual({ a: [1, true, null] });
    expect(() => parse("a: 1", { schema: "json" })).toThrow(/Unresolved plain scalar "a"/);
    expect(parse("a: 1\nb:", { schema: "failsafe" })).toEqual({ a: "1", b: "" });
    expect(parse("y: n\no: 0777\nt: 1:30\n<<: {m: 1}", { schema: "yaml-1.1" })).toEqual({
      true: false,
      o: 511,
      t: 90,
      m: 1,
    });
    expect(parse("%YAML 1.1\n---\nyes")).toBe(true);
    expect(parse("d: 2001-12-14", { version: "1.1" })).toEqual({
      d: new Date(Date.UTC(2001, 11, 14)),
    });
  });

  it("merges << keys when asked to", () => {
    const src = "base: &b {x: 1, y: 2}\nm:\n  <<: *b\n  y: 3";
    expect(parse(src)).toEqual({ base: { x: 1, y: 2 }, m: { "<<": { x: 1, y: 2 }, y: 3 } });
    expect(parse(src, { merge: true })).toEqual({ base: { x: 1, y: 2 }, m: { x: 1, y: 3 } });
    expect(() => parse("<<: 1", { merge: true })).toThrow(
      "Merge sources must be maps or map aliases",
    );
  });

  it("allows duplicate keys with uniqueKeys: false", () => {
    expect(parse("a: 1\na: 2", { uniqueKeys: false })).toEqual({ a: 2 });
  });

  it("reads integers as BigInt with intAsBigInt", () => {
    expect(parse("- 12345678901234567890\n- 0x10\n- 1.5", { intAsBigInt: true })).toEqual([
      12345678901234567890n,
      16n,
      1.5,
    ]);
  });

  it("resolves explicit tags, and keeps unknown ones with a warning", () => {
    const warned = warnings();
    expect(
      parse('- !!int "12"\n- !!str 1\n- !!float 1\n- !foo 123\n- !foo [1]\n- !!binary aGk='),
    ).toEqual([12, "1", "1", "123", [1], Buffer.from("hi")]);
    expect(warned()).toHaveLength(3);
    expect(warned()[0]).toBeInstanceOf(YAMLWarning);
    expect(warned()[0]).toMatchObject({ code: "TAG_RESOLVE_FAILED" });
    expect((warned()[1] as Error).message).toMatch(/^Unresolved tag: !foo at line 4/);
    expect(parse("!!set {a, b}")).toEqual(new Set(["a", "b"]));
    expect(parse("!!omap [1: a, b: 2]")).toEqual(
      new Map<unknown, unknown>([
        [1, "a"],
        ["b", 2],
      ]),
    );
    expect(() => parse("!!set {a: 1}")).toThrow(/Set items must all have null values/);
  });

  it("doesn't warn with logLevel error or silent", () => {
    const warned = warnings();
    parse("!foo x", { logLevel: "error" });
    parse("!foo x", { logLevel: "silent" });
    expect(warned()).toHaveLength(0);
  });

  it("writes collection keys as flow YAML, with a warning", () => {
    const warned = warnings();
    expect(parse("[a, b]: 1\n{c: d}: 2")).toEqual({ "[ a, b ]": 1, "{ c: d }": 2 });
    expect(warned()).toHaveLength(1);
    expect(warned()[0]).toMatch(/^Keys with collection values will be stringified/);
  });

  it("tells scalar keys apart by their values before they become strings", () => {
    warnings();
    for (const input of [
      ": !x a\n!!str : b\n",
      ': a\n"": b\n',
      '1: a\n"1": b\n',
      '1: a\n"1": b\n1: c\n',
      'true: a\n"true": b\n',
      ".nan: a\n.nan: b\n",
      "1: a\n0x1: b\n",
      '{1: a, "1": b, 1: c}',
    ])
      for (const options of [{}, { uniqueKeys: false }]) {
        const outcome = (fn: (input: string, options: { uniqueKeys?: boolean }) => unknown) => {
          try {
            return { value: fn(input, options) };
          } catch (e) {
            return { message: (e as Error).message };
          }
        };
        expect(outcome(parse), input).toEqual(outcome(yaml.parse));
      }
  });

  it("compares keys with a uniqueKeys function, as yaml does", () => {
    // yaml passes its nodes, tinyaml { value }.
    const value = (node: object) => ("value" in node ? node.value : undefined);
    const same = {
      never: () => false,
      always: () => true,
      value: (a: object, b: object) => value(a) === value(b),
      lower: (a: object, b: object) =>
        String(value(a)).toLowerCase() === String(value(b)).toLowerCase(),
    };
    type Equal = (a: object, b: object) => boolean;
    for (const input of [
      "a: 1\na: 2",
      "a: 1\nb: 2",
      'a: 1\n"1": b\n1: c',
      "A: 1\na: 2",
      "{a: 1, A: 2}",
      "[a: 1, a: 2]",
    ])
      for (const [name, equal] of Object.entries(same)) {
        const outcome = (fn: (input: string, options: { uniqueKeys: Equal }) => unknown) => {
          let calls = 0;
          try {
            const result = fn(input, { uniqueKeys: (a, b) => (calls++, equal(a, b)) });
            return { value: result, calls };
          } catch (e) {
            // yaml reads on after the first error, tinyaml doesn't.
            return { message: (e as Error).message };
          }
        };
        expect(outcome(parse), `${input} ${name}`).toEqual(outcome(yaml.parse));
      }
  });

  it("limits alias expansion with maxAliasCount", () => {
    const laughs = ["a: &a [x, x]"];
    for (let i = 1; i < 8; i++) {
      const prev = String.fromCharCode(96 + i);
      laughs.push(
        `${String.fromCharCode(97 + i)}: &${String.fromCharCode(97 + i)} [*${prev}, *${prev}, *${prev}]`,
      );
    }
    const src = laughs.join("\n");
    expect(() => parse(src)).toThrow(
      "Excessive alias count indicates a resource exhaustion attack",
    );
    expect(Object.keys(parse(src, { maxAliasCount: -1 }))).toHaveLength(8);
    expect(() => parse("a: &a [1]\nb: *a", { maxAliasCount: 0 })).toThrow(
      "Alias resolution is disabled",
    );
  });

  it("weighs each alias by its anchor's node, as yaml does", () => {
    const repeat = (n: number, line: (i: number) => string) =>
      Array.from({ length: n }, (_, i) => line(i)).join("\n");
    const agree = (text: string, options?: { maxAliasCount: number }) => {
      let expected: unknown;
      try {
        yaml.parse(text, options);
        expected = "ok";
      } catch (e) {
        expected = (e as Error).message;
      }
      let actual: unknown;
      try {
        parse(text, options);
        actual = "ok";
      } catch (e) {
        actual = (e as Error).message;
      }
      expect(actual, text.slice(0, 80)).toBe(expected);
    };
    let nested = "[0]";
    for (let i = 0; i < 12; i++) nested = `[&a${i} ${nested}, *a${i}]`;
    agree(nested);
    // Scalars count too, an alias in an anchor weighs as many as its count
    // when that anchor is first aliased, and empty collections nothing.
    agree(`a: &x 1\n${repeat(99, (i) => `b${i}: *x`)}`);
    agree(`a: &x 1\n${repeat(100, (i) => `b${i}: *x`)}`);
    agree(`a: &x 1\nb: &y [${Array(50).fill("*x").join(", ")}]\nc: *y\n`);
    agree(`a: &x 1\nb: &y [*x]\n${repeat(40, (i) => `x${i}: *x`)}\nc: *y\nd: *y\n`);
    agree(`a: &x 1\nb: &y [*x]\n${repeat(40, (i) => `x${i}: *x`)}\nc: *y\n`);
    agree(`a: &e []\n${repeat(150, (i) => `b${i}: *e`)}`);
    agree(`a: &e [[]]\n${repeat(150, (i) => `b${i}: *e`)}`);
    agree(`a: &e [1]\n${repeat(150, (i) => `b${i}: *e`)}`);
    agree(`a: &a [*a, 1]\n${repeat(60, (i) => `b${i}: *a`)}`);
    agree("a: &x 1\nb: *x\nc: *x\n", { maxAliasCount: 2 });
    agree("a: &x 1\nb: *x\nc: *x\n", { maxAliasCount: 3 });
    // An anchor's weight counts what's in its node after the alias too, and
    // in its nested anchored collections, whether or not they're done.
    agree("&a [&b [0],*a,*b]", { maxAliasCount: 3 });
    agree(`&a [&b [0],*a,${Array(50).fill("*b").join(",")}]`);
    agree("&a [&b [*a,0]]", { maxAliasCount: 1 });
    agree(`&a [&b [*a,0],${Array(101).fill("*a").join(",")}]`);
    agree("&a1 [&a3 [null,*a1,*a3],0]", { maxAliasCount: 3 });
    agree("&a0 [*a0,&a0 {k0: *a0}]", { maxAliasCount: 2 });
    agree("&a0 {k0: &a3 [*a3,*a0]}", { maxAliasCount: 2 });
    const cyclic = parse("&a [&b [0],*a,*b]", { maxAliasCount: 3 }) as unknown[];
    expect(cyclic[1]).toBe(cyclic);
    expect(cyclic[2]).toBe(cyclic[0]);
    // yaml reports what it finds reading the document first.
    agree(`a: &x 1\n${repeat(100, (i) => `b${i}: *x`)}\na: 2\n`);
    agree(`a: &x 1\n${repeat(100, (i) => `b${i}: *x`)}\n---\nb: 1\n`);
  });

  it("stops counting aliases at once on an expanding graph", () => {
    let nested = "[0]";
    for (let i = 0; i < 64; i++) nested = `[&a${i} ${nested}, *a${i}]`;
    let start = performance.now();
    expect(() => parse(nested)).toThrow("Excessive alias count");
    // 28 levels used to take seconds.
    expect(performance.now() - start).toBeLessThan(100);
    // An alias costs a step per anchored collection it's in, while it's under
    // the limit.
    const spread = `- &s x\n${Array.from({ length: 20_000 }, (_, i) => `- &r${i} [*s]`).join("\n")}`;
    start = performance.now();
    expect(() => parse(spread, { maxAliasCount: 1000 })).toThrow("Excessive alias count");
    expect(parse(spread, { maxAliasCount: -1 })).toHaveLength(20_001);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("disables every alias with maxAliasCount: 0", () => {
    for (const value of ["text", "1", "null", "", "[1]"])
      expect(() => parse(`a: &a ${value}\nb: *a`, { maxAliasCount: 0 })).toThrow(
        new ReferenceError("Alias resolution is disabled"),
      );
    expect(parse("a: &a 1", { maxAliasCount: 0 })).toEqual({ a: 1 });
  });

  it("points into the source through CRLFs and byte order marks", () => {
    warnings();
    const at = (text: string) => {
      try {
        parse(text);
      } catch (e) {
        return (e as YAMLParseError).pos;
      }
    };
    for (const text of ["\uFEFFa: 1\na: 2", "\uFEFFa: 1\r\na: 2", "%FOO\r\n---\r\na: 1\r\na: 2"])
      expect(at(text), JSON.stringify(text)).toEqual(yaml.parseDocument(text).errors[0]?.pos);
    expect(at("\uFEFFa: [1")).toEqual([6, 7]);
    // yaml points at the key's start and spans to the `:`, with \n too.
    expect(at("a\r\nb: [\r\n")).toEqual([4, 5]);
    // At the `]`, past the byte order mark that starts the second document.
    expect(at("a\r\n...\r\n\uFEFFb: ]\r\n")).toEqual([12, 13]);
  });

  it("supports custom scalar tags", () => {
    const regexp = {
      tag: "!re",
      resolve: (str: string) => new RegExp(str),
    };
    expect(parse("!re ^a+$", { customTags: [regexp] })).toEqual(/^a+$/);
    expect(parse("- !!timestamp 2001-12-14", { customTags: ["timestamp"] })).toEqual([
      new Date(Date.UTC(2001, 11, 14)),
    ]);
  });

  it("has a default export like yaml's namespace", () => {
    expect(YAML.parse("a: 1")).toEqual({ a: 1 });
    expect(typeof YAML.stringify).toBe("function");
  });

  it("reads a flow node's properties across lines, as yaml does", () => {
    // tinyaml's carets mark one character, not the whole property.
    const outcome = (parse: (text: string) => unknown, text: string) => {
      try {
        return { value: parse(text) };
      } catch (e) {
        return { code: (e as YAMLParseError).code, message: (e as Error).message.split("\n")[0] };
      }
    };
    for (const text of [
      "[!!str \n &c c]",
      "[&a \n &b c]",
      "[!!str \n !!str c]",
      "[&a \n !!str c]",
      "[&a\n &b c]",
      "{a: &a \n &b c}",
      "[!!str # c\n &c c]",
      "[!!str \n &c \n c]",
      "[&a \n !!str \n &b c]",
      "{&a \n !!str k: v}",
      "{? &a \n &b k: v}",
      "[&a \n !!str ]",
      "[&a &b c]",
      "- !!str \n  &c c",
      "a: !!str \n  &c c",
      "- &a \n  &b c",
      "a: &a \n  &b c",
      "? &a \n  &b c",
      "- &a \n  !!str &b c",
      "- &a # c\n  &b |\n  x",
      "- &a \n  &b - x",
      "- &a \n  !!str \n  &b c",
      "a: &a \n  &b k: v",
      "&a \n&b c",
    ])
      expect(outcome(parse, text), text).toEqual(outcome(yaml.parse, text));
  });

  it("agrees with yaml on assorted documents", () => {
    vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    const docs = [
      "a:\n  - b\n  - c: d\n    e: |\n      text\n      more\n",
      "- >-\n  folded\n  text\n\n  para\n- 'single ''quoted'''\n- \"esc\\t\\u263A\"",
      "anchors:\n  - &x {k: v}\n  - *x\nflow: {a: [1, 2], b: {c: null}}",
      "? complex\n: value\n? [a]\n: b",
      "%TAG !e! tag:example.com,2000:\n---\n- !e!foo bar",
      "key: value # comment\n# another\nother: 'x'",
    ];
    for (const doc of docs) expect(parse(doc)).toEqual(yaml.parse(doc));
  });
});
