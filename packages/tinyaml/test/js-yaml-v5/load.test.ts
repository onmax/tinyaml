import * as real from "js-yaml5";
import { describe, expect, it } from "vite-plus/test";
import {
  CORE_SCHEMA,
  defineMappingTag,
  defineScalarTag,
  defineSequenceTag,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  load,
  loadAll,
  mergeTag,
  NOT_RESOLVED,
  realMapTag,
  Schema,
  strTag,
  YAML11_SCHEMA,
  YAMLException,
} from "../../src/js-yaml-v5/index.ts";

const error = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as YAMLException;
  }
  throw new Error("expected a YAMLException");
};

describe("load", () => {
  it("resolves scalars with the core schema by default", () => {
    expect(load("a: 1\nb: [true, null, ~, 0x1F, 0o17, 1.5, .inf, yes]\nc:")).toEqual({
      a: 1,
      b: [true, null, null, 31, 15, 1.5, Infinity, "yes"],
      c: null,
    });
    expect(load('a: !!int "3"\nb: !!str 3\nc: !!float 1\nd: !!null')).toEqual({
      a: 3,
      b: "3",
      c: 1,
      d: null,
    });
  });

  it("follows the other schemas", () => {
    expect(load("a:\nb: 1\nc: True", { schema: JSON_SCHEMA })).toEqual({ a: "", b: 1, c: "True" });
    expect(load("v: 1", { schema: FAILSAFE_SCHEMA })).toEqual({ v: "1" });
    expect(
      load(
        "a: yes\nb: 0777\nc: 1:30\nd: 2001-12-14\ne: !!binary aGk=\ng: !!omap [a: 1]\nh: !!pairs [a: 1, a: 2]",
        {
          schema: YAML11_SCHEMA,
        },
      ),
    ).toEqual({
      a: true,
      b: 511,
      c: 90,
      d: new Date("2001-12-14"),
      e: new Uint8Array([104, 105]),
      g: [{ a: 1 }],
      h: [
        ["a", 1],
        ["a", 2],
      ],
    });
  });

  it("loads !!set as a Set with typed members", () => {
    expect(load("!!set {a, 1, null}", { schema: YAML11_SCHEMA })).toEqual(new Set(["a", 1, null]));
  });

  it("merges only when mergeTag is in the schema", () => {
    const input = "a: &a {x: 1}\nb:\n  <<: *a\n  y: 2";
    expect(load(input)).toEqual({ a: { x: 1 }, b: { "<<": { x: 1 }, y: 2 } });
    expect(load(input, { schema: CORE_SCHEMA.withTags(mergeTag) })).toEqual({
      a: { x: 1 },
      b: { x: 1, y: 2 },
    });
  });

  it("keeps keys typed with realMapTag", () => {
    const value = load("1: a\n[x]: b\nc: d", { schema: CORE_SCHEMA.withTags(realMapTag) });
    expect(value).toEqual(
      new Map<unknown, unknown>([
        [1, "a"],
        [["x"], "b"],
        ["c", "d"],
      ]),
    );
  });

  it("throws js-yaml 5's errors", () => {
    expect(error(() => load("")).message).toBe("expected a document, but the input is empty");
    expect(error(() => load("a\n---\nb")).message).toBe(
      "expected a single document in the stream, but found more",
    );
    expect(error(() => load("a: 1\na: 2")).reason).toBe("duplicated mapping key");
    expect(error(() => load("[a]: 1")).reason).toBe(
      "object-based map does not support complex keys",
    );
    expect(error(() => load("!foo x")).message).toMatch(/^unknown scalar tag !<!foo> \(1:1\)\n/);
    expect(error(() => load("a: [", { filename: "f.yml" })).message).toMatch(
      /^unexpected end of the stream within a flow collection in "f.yml" \(1:5\)/,
    );
    expect(error(() => load("a: &x 1\nb: [*x, *x]", { maxAliases: 1 })).reason).toBe(
      "aliases exceeded maxAliases (1)",
    );
    expect(error(() => load("[[[a]]]", { maxDepth: 2 })).reason).toBe(
      "nesting exceeded maxDepth (2)",
    );
  });

  it("words and points at errors as js-yaml 5 does", () => {
    const message = (load: (input: string) => unknown, input: string) => {
      try {
        return load(input);
      } catch (e) {
        return (e as Error).message;
      }
    };
    for (const input of [
      // A key that ends on a later line is a value, and no node ends a mapping.
      "a\nb: c",
      "[23\n]: 42",
      'k:\n  "a\n  b": c\n',
      "x: 1\n]\n",
      "x: 1\n- y\n",
      // A key without a colon, on its line or past it.
      "x: 1\nfoo",
      "x: 1\nfoo\n",
      "x: 1\n&a\n",
      "---\nseq:\n&anchor\n- a\n- b\n",
      "foo: |\n\t\nbr: \n",
      "'a':1",
      "a: 'b':x\n",
      "- [a,\n",
    ])
      expect(message(loadAll, input), JSON.stringify(input)).toBe(message(real.loadAll, input));
  });

  it("rejects tabs in indentation, verbatim tags and nesting as js-yaml 5 does", () => {
    const message = (input: string, options?: object) => {
      try {
        return loadAll(input, options);
      } catch (e) {
        return (e as Error).message;
      }
    };
    const theirs = (input: string, options?: object) => {
      try {
        return real.loadAll(input, options);
      } catch (e) {
        return (e as Error).message;
      }
    };
    for (const input of [
      "a:\n\tb",
      "a:\n\t- b",
      "? a\n:\n\tb",
      "x:\n a:\n \tb",
      "a: 1\n\tb: 2",
      "a: !t\n\tb",
      "?\t,key:\n",
      "!<> x",
      "!<> [a]",
      "- !<>\n- x",
      "!<a x",
      "!<bad|tag> x",
      "!<%zz> x",
      "!<,x> x",
      "!a|b x",
    ])
      expect(message(input), JSON.stringify(input)).toEqual(theirs(input));
    for (const [input, maxDepth] of [
      ["1", 1],
      ["- 1", 2],
      ["- &a 1\n- - *a", 3],
      ["[&a 1,[*a]]", 3],
      ["{a: &a 1, b: [*a]}", 3],
      ["a: &a 1\nb:\n  c: *a", 3],
      ["a: [1]", 2],
      ["--- &a x", 1],
      ["-", 1],
    ] as const)
      expect(message(input, { maxDepth }), input).toEqual(theirs(input, { maxDepth }));
  });

  it("gives its errors the same own keys as js-yaml 5", () => {
    for (const input of ["a: [b", "a: 1\na: 2"])
      expect(Object.keys(error(() => load(input)))).toEqual(
        Object.keys(error(() => real.load(input))),
      );
    expect(Object.keys(new YAMLException("x"))).toEqual(Object.keys(new real.YAMLException("x")));
  });

  it("reports a syntax error before a value error, as js-yaml 5 parses first", () => {
    expect(error(() => load("a: 1\nb: !!int x\nc: [")).reason).toBe(
      "unexpected end of the stream within a flow collection",
    );
  });

  it("starts a mapping at a second anchor or tag on a value's own line", () => {
    expect(load("top4:\n  &node4  &k4 key4: four\n")).toEqual({ top4: { key4: "four" } });
    expect(load("t:\n  &a &b k: v\nu: *a\nv: *b\n")).toEqual({
      t: { k: "v" },
      u: { k: "v" },
      v: "k",
    });
    // The mapping starts at the second anchor, so the next line is too shallow.
    expect(error(() => load("t:\n  &a &b k: v\n  x: 1\n")).message).toMatch(
      /^bad indentation of a mapping entry \(3:3\)/,
    );
    expect(error(() => load("t:\n  &a &b k\n")).message).toMatch(
      /^duplication of an anchor property \(2:6\)/,
    );
    expect(error(() => load("&a &b k: v\n")).message).toMatch(/^duplication of an anchor/);
  });

  it("lets a tab indent only the line after an explicit entry without a value", () => {
    expect(load("? a\n\tc: 1\n")).toEqual({ a: null, c: 1 });
    expect(() => load("? a\n: x\n\t? b\n")).toThrow(YAMLException);
    expect(() => load("? a\n:\n\tc: 1\n")).toThrow(YAMLException);
  });

  it("maps error positions back through CRLF line breaks", () => {
    const e = error(() => load("a: 1\r\nb: 2\r\nb: 3\r\n"));
    expect([e.mark?.line, e.mark?.column, e.mark?.position]).toEqual([2, 0, 12]);
    // And through lone CRs and the byte order marks the parser drops.
    for (const input of [
      "a: 1\rb: 2\rb: 3\r",
      "\uFEFFa: 1\r\nb: 2\r\nb: 3",
      "a: 1\r\n\uFEFF---\r\nb: 1\r\nb: 2\r\n",
      "a: 1\r\n...\r\n\uFEFFb: 1\r\nb: 2",
    ]) {
      const ours = error(() => loadAll(input));
      const theirs = error(() => real.loadAll(input));
      expect([ours.message, ours.mark?.position], JSON.stringify(input)).toEqual([
        theirs.message,
        theirs.mark?.position,
      ]);
    }
  });

  it("allows duplicate keys with json", () => {
    expect(load("a: 1\na: 2", { json: true })).toEqual({ a: 2 });
  });

  it("gives a mapping tag every pair with json, repeats and merged keys too", () => {
    // Adds up the values of each key; a mapping counts 100.
    const sum = (define: typeof defineMappingTag, name: string) =>
      define(name, {
        create: () => new Map<unknown, number>(),
        has: (carrier, key) => carrier.has(key),
        addPair: (carrier, key, value) => {
          carrier.set(key, (carrier.get(key) ?? 0) + (typeof value === "number" ? value : 100));
          return "";
        },
        keys: (carrier) => carrier.keys(),
        get: (carrier, key) => carrier.get(key),
        identify: () => false,
      });
    const ours = (input: string, name: string) =>
      load(input, {
        schema: CORE_SCHEMA.withTags(sum(defineMappingTag, name), mergeTag),
        json: true,
      });
    const theirs = (input: string, name: string) =>
      real.load(input, {
        schema: real.CORE_SCHEMA.withTags(
          sum(real.defineMappingTag as never, name) as never,
          real.mergeTag,
        ),
        json: true,
      });
    for (const [input, name] of [
      ["a: 1\na: 2\n", "tag:yaml.org,2002:map"],
      ["a: 1\nb: 2\na: 3\n", "tag:yaml.org,2002:map"],
      ["{a: 1, a: 2, 1: 3, '1': 4, 1: 5}\n", "tag:yaml.org,2002:map"],
      ["x: !sum {a: 1, a: 2}\n", "!sum"],
      ["x: &m !sum {a: 1, b: 3}\ny: !sum\n  a: 5\n  <<: *m\n  a: 2\n  b: 4\n", "!sum"],
      ["x: &m {a: 1, b: 3}\ny: !sum\n  <<: *m\n  b: 4\n  <<: *m\n", "!sum"],
      ["x: &m {a: 1}\ny: !sum\n  <<: [*m, *m]\n", "!sum"],
    ] as const)
      expect(ours(input, name), input).toEqual(theirs(input, name));
    expect(ours("a: 1\na: 2\n", "tag:yaml.org,2002:map")).toEqual(new Map([["a", 3]]));
  });

  it("takes null for options, as js-yaml 5 does", () => {
    expect(load("a: 1\n", null as never)).toEqual({ a: 1 });
    expect(loadAll("a: 1\n---\nb\n", null, null as never)).toEqual([{ a: 1 }, "b"]);
    const docs: unknown[] = [];
    loadAll("a\n---\nb", (doc) => docs.push(doc), null as never);
    expect(docs).toEqual(["a", "b"]);
    expect(() => load("a: [\n", null as never)).toThrow(YAMLException);
  });

  it("rejects what a merge can't take at the `<<`, as js-yaml 5 does", () => {
    const sources = Array(101).fill("{}").join(",");
    for (const input of [
      `x: 1\n<<: [${sources}]\n`,
      `{x: 1, <<: [${sources}]}\n`,
      "x: 1\n<<: 1\n",
      "a: &a {b: 1}\nx:\n  <<: [*a, 2]\n",
    ]) {
      const theirs = error(() =>
        real.load(input, { schema: real.CORE_SCHEMA.withTags(real.mergeTag) }),
      );
      const ours = error(() => load(input, { schema: CORE_SCHEMA.withTags(mergeTag) }));
      expect([ours.reason, ours.mark?.position]).toEqual([theirs.reason, theirs.mark?.position]);
    }
    // Without mergeTag, `<<` is a key like any other.
    expect(load(`<<: [${sources}]\n`)).toMatchObject({ "<<": expect.any(Array) });
  });

  it("rejects a tab before a comment under a block scalar, as js-yaml 5 does", () => {
    const input = "foo: |\n\t #\nbar: 1\n";
    expect(() => real.load(input)).toThrow(/tab characters/);
    expect(() => load(input)).toThrow(/tab characters/);
  });

  it("measures the line after a directive with a comment, as js-yaml 5 does", () => {
    const outcome = (fn: (input: string) => unknown, input: string) => {
      try {
        return { value: fn(input) };
      } catch (e) {
        return { message: (e as Error).message };
      }
    };
    for (const eol of ["\n", "\r\n"])
      for (const input of [
        "%z #\n ---",
        "%z\t#\n ---",
        "%z\n ---",
        "%z  \n ---",
        "%YAML 1.2 # c\n ---\na",
        "%z #\n---\na",
        '%FOO  bar baz # Should be ign!x ored\n              ---\n# with a warning.\n---\n"foo"\n',
      ].map((text) => text.replaceAll("\n", eol)))
        expect(outcome(loadAll, input), input).toEqual(outcome(real.loadAll, input));
  });

  it("returns every document from loadAll", () => {
    expect(loadAll("a\n---\nb")).toEqual(["a", "b"]);
    const docs: unknown[] = [];
    loadAll("a\n---\nb", (doc) => docs.push(doc));
    expect(docs).toEqual(["a", "b"]);
    expect(loadAll("")).toEqual([]);
  });

  it("runs custom tags", () => {
    const upper = defineScalarTag("!upper", {
      resolve: (source) => (source ? source.toUpperCase() : NOT_RESOLVED),
      identify: () => false,
    });
    const pair = defineSequenceTag("!pair", {
      create: () => [] as unknown[],
      addItem: (carrier, item) => (carrier.length < 2 ? void carrier.push(item) : "too many items"),
      finalize: (carrier) => ({ left: carrier[0], right: carrier[1] }),
      identify: () => false,
    });
    const keys = defineMappingTag("!keys", {
      create: () => [] as unknown[],
      addPair: (carrier, key) => (carrier.push(key), ""),
      has: (carrier, key) => carrier.includes(key),
      keys: () => [],
      get: () => null,
      identify: () => false,
    });
    const schema = CORE_SCHEMA.withTags(upper, pair, keys);
    expect(load("a: !upper hi\nb: !pair [1, 2]\nc: !keys {1: , x: }", { schema })).toEqual({
      a: "HI",
      b: { left: 1, right: 2 },
      c: [1, "x"],
    });
    expect(error(() => load("!upper ''", { schema })).reason).toBe(
      "cannot resolve a node with !<!upper> explicit tag",
    );
    expect(error(() => load("!pair [1, 2, 3]", { schema })).reason).toBe("too many items");
  });

  it("builds schemas like js-yaml 5", () => {
    expect(() => new Schema([])).toThrow(/default scalar tag/);
    const schema = FAILSAFE_SCHEMA.withTags([{ ...strTag, resolve: (s: string) => `<${s}>` }]);
    expect(schema.tags).toHaveLength(3);
    expect(load("- a", { schema })).toEqual(["<a>"]);
  });
});
