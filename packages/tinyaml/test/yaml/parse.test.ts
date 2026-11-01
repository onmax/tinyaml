import * as yaml from "yaml";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import YAML, { parse, YAMLError, YAMLParseError, YAMLWarning } from "../../src/yaml/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

// yaml's parse or tinyaml's, with options either takes.
type Parse = (src: string, options: any) => any;

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

  it("merges any number of mappings", () => {
    const sources = Array(101).fill("{}").join(",");
    for (const input of [`{<<: [${sources}]}\n`, `<<: [${sources}]\n`]) {
      expect(parse(input, { merge: true })).toEqual(yaml.parse(input, { merge: true }));
      expect(parse(input, { version: "1.1" })).toEqual({});
    }
  });

  it("copies what a merge reads, but aliases, as yaml does", () => {
    const src = "a: &x {p: &r {k: 1}, q: [1], s: *b}\nb:\n  <<: *x\nc: *r\nd: *x\n";
    const v = parse(`z: &b [0]\n${src}`, { merge: true });
    expect(v.b).toEqual(v.a);
    expect(v.b.q).not.toBe(v.a.q);
    expect(v.b.p).not.toBe(v.a.p);
    // The anchor in the merged mapping names its copy from then on.
    expect(v.c).toBe(v.b.p);
    expect(v.d).toBe(v.a);
    expect(v.b.s).toBe(v.z);
    const old = parse("a: &x {p: [1]}\nb:\n  <<: *x\n", { version: "1.1" });
    expect(old.b.p).not.toBe(old.a.p);
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
    parse("!foo x", { logLevel: undefined });
    expect(warned()).toHaveLength(0);
  });

  it("warns where yaml does, in its order", () => {
    const warned = warnings();
    for (const input of [
      "!foo x",
      "- !foo [!bar a]\n- !!binary {a: 1}\n",
      "a: !<tag:x> b",
      "%FOO bar # c\n---\na",
      "%YAML 1.3\r\n---\r\na",
      "%YAML 1.01\n---\na",
      "\uFEFF%FOO\n---\na",
      "- &a: x\n- *a:\n",
    ]) {
      const read = (parse: (src: string) => unknown) => {
        parse(input);
        return warned().map((w) => {
          const { name, code, pos, linePos, message } = w as YAMLWarning;
          return { name, code, pos, linePos, message };
        });
      };
      const theirs = read(yaml.parse);
      vi.clearAllMocks();
      expect(read(parse), input).toEqual(theirs);
      expect(theirs.length, input).toBeGreaterThan(0);
      vi.clearAllMocks();
    }
  });

  it("reads an option set to undefined as yaml does, over the default", () => {
    warnings();
    expect(parse("a: 0o7\nb: 0b1", { version: "1.1", schema: undefined })).toEqual({
      a: 7,
      b: "0b1",
    });
    expect(parse("!!binary aGk=", { resolveKnownTags: undefined })).toBe("aGk=");
    expect(() => parse("a", { version: undefined })).toThrow(
      "Expected '1.1', '1.2' or null as first argument, but found: undefined",
    );
    expect(() => parse("a", { version: null as never })).toThrow(/null YAML version/);
    expect(parse("%YAML 1.2\n---\na", { version: undefined })).toBe("a");
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
    const start = performance.now();
    expect(() => parse(nested)).toThrow("Excessive alias count");
    // 28 levels used to take seconds.
    expect(performance.now() - start).toBeLessThan(1000);
    // An alias costs a step per anchored collection it's in, while it's under
    // the limit, so four times the input takes about four times as long, not
    // sixteen. Best of three runs, so a busy machine doesn't decide it.
    const spread = (n: number) =>
      `- &s x\n${Array.from({ length: n }, (_, i) => `- &r${i} [*s]`).join("\n")}`;
    const best = (text: string) => {
      let fastest = Infinity;
      for (let run = 0; run < 3; run++) {
        const begin = performance.now();
        expect(() => parse(text, { maxAliasCount: 1000 })).toThrow("Excessive alias count");
        parse(text, { maxAliasCount: -1 });
        fastest = Math.min(fastest, performance.now() - begin);
      }
      return fastest;
    };
    expect(parse(spread(20_000), { maxAliasCount: -1 })).toHaveLength(20_001);
    expect(best(spread(20_000)) / best(spread(5_000))).toBeLessThan(10);
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

  it("warns about scalars the compat schema reads as another type", () => {
    const warned = warnings();
    const read = (parse: Parse, input: string, options: yaml.ParseOptions) => {
      const value = parse(input, { prettyErrors: false, ...options });
      const out = warned().map((w) => {
        const { code, pos, message } = w as YAMLWarning;
        return { code, pos, message };
      });
      vi.clearAllMocks();
      return { value, out };
    };
    for (const [input, options] of [
      ["yes\n", { compat: "yaml-1.1" }],
      ["a: yes # yes\nyes : no\n0b11: [on, y, '1_000', 1_000]\n12:30: {2001-12-14: 010}\n", {}],
      ["? yes\n: no\n", {}],
      ["- !!str yes\n- 'no'\n- n\n", {}],
      ["<<: {a: 1}\nb: <<\n", { merge: true }],
      ["<<: {a: 1}\nb: <<\n", {}],
      ["a: yes\nb: 010\n", { version: "1.1", compat: "core" }],
      ["a: yes\nb: 010\n", { compat: ["bool"] }],
      ["a:\nb: c\n", { compat: "json" }],
      ["%TAG !e! tag:yaml.org,2002:\n---\na: yes\n", {}],
      ["a: x\n", { compat: [{ tag: "!x", default: true, test: /^x$/, resolve: () => 1 }] }],
    ] as [string, yaml.ParseOptions][]) {
      const opts = { compat: "yaml-1.1", ...options };
      const theirs = read(yaml.parse, input, opts);
      expect(read(parse, input, opts), input).toEqual(theirs);
      expect(theirs.out.length, input).toBeGreaterThan(0);
    }
    expect(() => parse("a", { compat: "nope" })).toThrow('Unknown schema "nope"');
  });

  it("reads keys only tags give their original values in !!set, !!omap and !!pairs", () => {
    for (const input of [
      '!!set {1: null, "1": null}\n',
      'a: {1: foo}\nb: !!set {"1": null}\n',
      '!!omap [{1: one}, {"1": two}]\n',
      "!!omap [~, {}]\n",
      "!!omap [a, {b: c}, [1], {[2]: 3}]\n",
      "!!pairs [null, ~, a, 1, {}, {b: c}, {2: d}]\n",
      "!!set {? [1, 2]}\n",
    ]) {
      const outcome = (parse: (input: string) => unknown) => {
        try {
          return { value: parse(input) };
        } catch (e) {
          return { message: (e as Error).message };
        }
      };
      warnings();
      expect(outcome(parse), input).toEqual(outcome(yaml.parse));
    }
  });

  it("resolves a custom tag with default: 'key' only for keys", () => {
    const special = {
      tag: "!special",
      default: "key" as const,
      test: /^special$/,
      resolve: () => 42,
    };
    for (const input of [
      "value: special\n",
      "special\n",
      "special: v\n",
      "? special\n: w\n",
      "{special: v, k: special}\n",
      "[special, special: v]\n",
      "a: &x special\n*x : 1\n",
      "a: special\n'special': 1\n",
      "a: special\n? []\n: 1\n",
    ]) {
      warnings();
      expect(parse(input, { customTags: [special] }), input).toEqual(
        yaml.parse(input, { customTags: [special] }),
      );
    }
    // An alias as a key isn't the merge key before it.
    const input = "x: &b k\ny: {<<: {a: 1}, *b : 2}\nz: <<\n? *b\n: 3\n";
    expect(parse(input, { merge: true })).toEqual(yaml.parse(input, { merge: true }));
  });

  it("passes collection tags yaml's nodes, in part", () => {
    warnings();
    const tag = (collection: "map" | "seq", resolve: (node: any) => unknown) => ({
      customTags: [{ tag: "!t", collection, resolve }],
    });
    const seq = "!t [a, 1, [x], {k: v}]";
    const map = "!t {a: 1, 2: b, c: [x], n: }";
    for (const [input, options] of [
      ["!t [a, b]", tag("seq", (node) => node.items.map((i: any) => i.value).join(","))],
      ["!t [a, b]", tag("seq", () => undefined)],
      [seq, tag("seq", (node) => node)],
      [seq, tag("seq", (node) => [0, "1", 4, -1].map((i) => [node.get(i), node.has(i)]))],
      [seq, tag("seq", (node) => [node.get(0, true).value, node.get(3).get("k"), node.toJSON()])],
      [seq, tag("seq", (node) => node.items.map(String))],
      [map, tag("map", (node) => [node.get("a"), node.get(2), node.get("2"), node.has("n")])],
      [map, tag("map", (node) => [node.get("n"), node.get("c").items[0].value, node.toJSON()])],
      ["!t {1: a, '1': b}", tag("map", (node) => node.items.map((p: any) => p.key.value))],
      ["!t {a: !t {b: 1}}", tag("map", (node) => ({ wrapped: node.toJSON() }))],
      [
        "a: !t [1]",
        tag("seq", () => {
          throw new Error("boom");
        }),
      ],
      ["!t a", { customTags: [{ tag: "!t", resolve: (...args: unknown[]) => args[2] }] }],
    ] as [string, yaml.ParseOptions][]) {
      const outcome = (parse: Parse) => {
        try {
          return { value: parse(input, options) };
        } catch (e) {
          const { message, code, pos } = e as YAMLParseError;
          return { message, code, pos };
        }
      };
      const theirs = outcome(yaml.parse);
      // yaml passes its internal _directives too.
      if (theirs.value?._directives) delete theirs.value._directives;
      expect(outcome(parse), input).toEqual(theirs);
    }
  });

  it("calls onAnchor with each anchored value and its count", () => {
    warnings();
    for (const [input, options] of [
      ["a: &a {x: 1}\nb: *a\n", {}],
      ["a: &a 1\nb: &b [2]\nc: *a\nd: *a\n", {}],
      ["a: &a 1\nb: *a\nc: &a 2\nd: *a\ne: *a\n", {}],
      ["a: &a\n  b: &b [1, &c 2]\nc: *b\nd: *c\n", {}],
      ["&r [1, *r]\n", {}],
      ["a: &a\nb: *a\nc: &s !!set {x: }\nd: *s\n", {}],
      ["a: &a 1\nb: *a\n", { maxAliasCount: -1 }],
      ["a: &a {x: &x [1]}\nc: *x\nb:\n  <<: *a\n  y: *x\nd: *x\n", { merge: true }],
      ["o: &o [1]\na: &a {x: *o, y: &y [2], z: *y}\nb: {<<: *a}\nc: *o\n", { merge: true }],
    ] as [string, yaml.ParseOptions][]) {
      const seen = (parse: Parse) => {
        const calls: [unknown, number][] = [];
        const value = parse(input, {
          ...options,
          onAnchor: (v: unknown, count: number) => calls.push([v, count]),
        });
        // Which part of the value each anchored one is.
        const where = (v: unknown, at: unknown = value, path = ""): string | undefined => {
          if (v === at) return path || "/";
          if (!at || typeof at !== "object" || typeof v !== "object") return undefined;
          for (const [k, x] of Object.entries(at)) {
            const found = x !== at && where(v, x, `${path}/${k}`);
            if (found) return found;
          }
        };
        return { value, calls: calls.map(([v, count]) => [v, count, where(v)]) };
      };
      expect(seen(parse), input).toEqual(seen(yaml.parse));
    }
  });

  it("revives only the entries an array had", () => {
    const reviver = function (this: any, key: unknown, value: unknown) {
      if (key === "0") this.push(10);
      return typeof value === "number" ? value + 1 : value;
    };
    expect(parse("[1, 2]\n", reviver)).toEqual(yaml.parse("[1, 2]\n", reviver));
    const remover = function (this: any, key: unknown, value: unknown) {
      if (key === "a") {
        delete this.b;
        this.c = 5;
      }
      return typeof value === "number" ? value + 1 : value;
    };
    expect(parse("a: 1\nb: 2\n", remover)).toEqual(yaml.parse("a: 1\nb: 2\n", remover));
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
