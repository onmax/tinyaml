import * as real from "js-yaml5";
import { describe, expect, it } from "vite-plus/test";
import * as lib from "../../src/js-yaml-v5/index.ts";
import {
  CORE_SCHEMA,
  defineMappingTag,
  defineScalarTag,
  defineSequenceTag,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  legacyMapTag,
  load,
  loadAll,
  mergeTag,
  NOT_RESOLVED,
  realMapTag,
  Schema,
  setTag,
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
      "a:\n  - b\n \t- c",
      "a:\n  ? b\n \t: c",
      "- - a\n \t- b",
      "  - b\n \t- c",
      'a: "x\\\ny"',
      '- "x\\\n\ny"',
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

  it("merges a mapping as it was built, the last of a repeated key with json", () => {
    // Any comment with a `!` reads mappings through YAML11_SCHEMA's mapping tags.
    const input = "base: &a {k: 1, k: 2}\ncopy: {<<: *a}\n# !\n";
    const expected = real.load(input, { schema: real.YAML11_SCHEMA, json: true });
    expect(expected).toEqual({ base: { k: 2 }, copy: { k: 2 } });
    expect(load(input, { schema: YAML11_SCHEMA, json: true })).toEqual(expected);
  });

  it("merges and aliases a mapping that hasn't ended as js-yaml 5 does", () => {
    class Items extends Array {}
    const schemas = (lib: typeof real) => [
      lib.CORE_SCHEMA.withTags(lib.mergeTag),
      lib.CORE_SCHEMA.withTags(lib.realMapTag, lib.mergeTag),
      lib.YAML11_SCHEMA,
      lib.CORE_SCHEMA.withTags(
        lib.mergeTag,
        lib.defineSequenceTag(`tag:yaml.org,2002:seq`, {
          create: () => new Items(),
          addItem: (items, item) => void items.push(item),
          identify: () => false,
        }),
      ),
    ];
    const ours = schemas(lib as never) as never[];
    schemas(real).forEach((schema, i) => {
      for (const input of [
        "&a {x: 1, child: {<<: *a}, y: 2}",
        "&a {x: 1, k: {m: [{<<: *a}]}, y: 2, d: *a}",
        "&a {x: [1], c: !!map {y: *a}, z: [2]}",
        "&a {x: 1, s: [!!seq [*a]], c: !!map {<<: *a}, d: {<<: [*a]}}",
        "&s [&a {x: *s, c: {<<: *a}}, 1]",
        "&a {x: 1, <<: *a, y: 2}",
        "a: &a {x: 1}\ns: !!seq [*a]\nc: {<<: *a}",
      ])
        for (const json of [false, true])
          expect(load(input, { schema: ours[i], json }), `${i} ${input}`).toStrictEqual(
            real.load(input, { schema, json }),
          );
    });
    const map = load("&a {x: 1, child: {<<: *a}, y: 2, d: *a}", { schema: ours[1] }) as Map<
      string,
      unknown
    >;
    expect([...map.keys()]).toEqual(["x", "child", "y", "d"]);
    expect(map.get("child")).toEqual(new Map([["x", 1]]));
    expect(map.get("d")).toBe(map);
  });

  // An ordered list of pairs, which logs every call a carrier gets.
  const pairs = (define: typeof defineMappingTag, log: string[]) => {
    const ids = new Map<unknown, number>();
    const id = (carrier: unknown) => ids.get(carrier) ?? ids.set(carrier, ids.size).get(carrier);
    return define("!p", {
      create: () => {
        const carrier: [unknown, unknown][] = [];
        log.push(`create ${id(carrier)}`);
        return carrier;
      },
      has: (carrier, key) => {
        log.push(`has ${id(carrier)} ${String(key)}`);
        return carrier.some((pair) => pair[0] === key);
      },
      addPair: (carrier, key, value) => {
        log.push(`add ${id(carrier)} ${String(key)} ${JSON.stringify(value)}`);
        carrier.push([key, value]);
        return "";
      },
      keys: (carrier) => carrier.map((pair) => pair[0]),
      get: (carrier, key) => {
        log.push(`get ${id(carrier)} ${String(key)}`);
        return carrier.find((pair) => pair[0] === key)?.[1];
      },
      identify: () => false,
    });
  };
  // What each library loads, and the calls each carrier got, in order.
  const withPairs = (input: string, json: boolean) => {
    const read = (lib: typeof real | typeof import("../../src/js-yaml-v5/index.ts")) => {
      const log: string[] = [];
      const schema = lib.CORE_SCHEMA.withTags(
        pairs(lib.defineMappingTag as never, log) as never,
        lib.mergeTag as never,
      );
      let value: unknown;
      try {
        value = lib.load(input, { schema, json } as never);
      } catch (e) {
        value = (e as YAMLException).message;
      }
      return { value, log };
    };
    return [read(real), read({ CORE_SCHEMA, defineMappingTag, mergeTag, load } as never)];
  };

  it("merges what a mapping tag built through its keys and get, even an array", () => {
    for (const input of [
      "base: &a !p {k: 1}\ncopy: {<<: *a}\n",
      "base: &a !p {k: 1}\ncopy: [*a, {<<: *a}]\n",
      "a: &a !p {k: 1}\nb: &b !p {k: 2, j: 3}\ncopy: {<<: [*a, *b], j: 7}\n",
      "base: &a {k: 1}\nmid: &m !p {<<: *a, j: 2}\ncopy: {<<: *m, k: 3}\n",
    ])
      for (const json of [false, true]) {
        const [theirs, ours] = withPairs(input, json);
        expect(ours!.value, input).toEqual(theirs!.value);
      }
    expect(withPairs("base: &a !p {k: 1}\ncopy: {<<: *a}\n", false)[1]!.value).toEqual({
      base: [["k", 1]],
      copy: { k: 1 },
    });
  });

  it("merges a mapping through the keys its tag built it with", () => {
    const lower = (lib: typeof real) => ({
      ...lib.realMapTag,
      addPair: (m: Map<unknown, unknown>, k: unknown, v: unknown) => {
        m.set(String(k).toLowerCase(), v);
        return "";
      },
    });
    for (const input of [
      "{<<: {A: 1}}",
      "a: &a {A: 1, B: 2}\nb: {<<: *a}",
      "a: &a {A: 1}\nb: {<<: [*a, {C: 3}], c: 9}",
      "{<<: [{A: 1}, {a: 2}]}",
      "{x: 1, <<: {X: 2}}",
    ]) {
      const theirs = real.load(input, {
        schema: real.CORE_SCHEMA.withTags(real.mergeTag, lower(real)),
      });
      const ours = load(input, { schema: CORE_SCHEMA.withTags(mergeTag, lower(real) as never) });
      expect(ours, input).toEqual(theirs);
    }
    expect(
      load("{<<: {A: 1}}", { schema: CORE_SCHEMA.withTags(mergeTag, lower(real) as never) }),
    ).toEqual(new Map([["a", 1]]));
  });

  it("tells symbol and function keys apart by identity, as js-yaml 5 does", () => {
    const keys = (lib: typeof real) => [
      lib.defineScalarTag("!sym", { resolve: (s) => Symbol(s), identify: () => false }),
      lib.defineScalarTag("!fn", { resolve: (s) => () => s, identify: () => false }),
    ];
    const outcome = (lib: typeof real, input: string, ...tags: unknown[]) => {
      try {
        const value = lib.load(input, {
          schema: lib.CORE_SCHEMA.withTags(...(tags as never[]), ...keys(lib)),
        });
        return value instanceof Map || value instanceof Set
          ? [...value].map((entry) => [entry].flat().map(String))
          : value;
      } catch (e) {
        return (e as YAMLException).message;
      }
    };
    for (const input of [
      "{!sym x: 1, !sym x: 2}",
      "{!fn x: 1, !fn x: 2}",
      "{!sym x: 1, ? !sym x}",
      "{[a]: 1, [a]: 2}",
      "{{a: 1}: 1, {a: 1}: 2}",
      "{? &s !sym x : 1, ? *s : 2}",
      "a: &a {!sym x: 1}\nb: {<<: *a, !sym x: 2}",
    ]) {
      expect(outcome(lib as never, input, realMapTag, mergeTag), input).toEqual(
        outcome(real, input, real.realMapTag, real.mergeTag),
      );
    }
    expect(outcome(lib as never, "!!set {!sym x, !sym x}", setTag)).toEqual(
      outcome(real, "!!set {!sym x, !sym x}", real.setTag),
    );
    expect(outcome(lib as never, "{!sym x: 1, !sym x: 2}", realMapTag)).toEqual([
      ["Symbol(x)", "1"],
      ["Symbol(x)", "2"],
    ]);
  });

  it("gives a mapping tag a merge's pairs, overrides and repeats as js-yaml 5 does", () => {
    for (const input of [
      "base: &a {k: 1}\ncopy: !p {<<: *a, k: 2}\n",
      "base: &a {k: 1}\ncopy: !p {k: 2, <<: *a}\n",
      "base: &a {k: 1}\ncopy: !p {<<: *a, k: 2, k: 3}\n",
      "copy: !p {a: 1, k: 2, k: 3}\n",
      "base: &a {k: 1}\ncopy: !p {<<: [*a, {k: 5, j: 6}], j: 7}\n",
      "a: &a !p {k: 1}\nb: &b !p {k: 2, j: 3}\ncopy: !p {<<: [*a, *b], j: 7}\n",
      "base: &a {k: 1}\ncopy: !p {x: !p {<<: *a, k: 2}, <<: *a}\n",
      "base: &a {k: 1}\nmid: &m !p {<<: *a, j: 2}\ncopy: !p {<<: *m, k: 3}\n",
      "base: &a {k: 1}\ncopy: !p\n  <<: *a\n  k: 2\n  <<: {k: 9, z: 1}\n  z: 2\n",
      "base: &a {k: 1}\ncopy: !p {<<: *a, <<: *a, k: 2}\n",
      "base: &a !p {k: 1, j: 3}\ncopy: !p {k: 2, <<: *a}\n",
    ])
      for (const json of [false, true]) {
        const [theirs, ours] = withPairs(input, json);
        expect(ours!.value, input).toEqual(theirs!.value);
        // Each carrier sees its pairs in js-yaml 5's order. Where tinyaml
        // differs, it's when carriers are made and where it finds a repeat.
        const calls = (log: string[]) => log.filter((call) => /^(?:has|add|get) 2 /.test(call));
        if (typeof theirs!.value !== "string" && !input.includes("x: !p"))
          expect(calls(ours!.log), input).toEqual(calls(theirs!.log));
      }
    const [theirs, ours] = withPairs("base: &a {k: 1}\ncopy: !p {<<: *a, k: 2}\n", false);
    expect(ours!.value).toEqual({
      base: { k: 1 },
      copy: [
        ["k", 1],
        ["k", 2],
      ],
    });
    expect(ours!.log).toEqual(theirs!.log);
  });

  it("lets only an equal key override a merged one, as js-yaml 5 does", () => {
    const schema = CORE_SCHEMA.withTags(mergeTag);
    for (const input of [
      "a: &a {1: x, b: z}\nb: {<<: *a, 1: w}\n",
      "a: &a {1: x, b: z}\nb: {<<: *a, '1': w}\n",
      "a: &a {true: x}\nb: {<<: *a, true: w}\n",
    ]) {
      let theirs: unknown, ours: unknown;
      try {
        theirs = real.load(input, { schema: real.CORE_SCHEMA.withTags(real.mergeTag) });
      } catch (e) {
        theirs = (e as YAMLException).message;
      }
      try {
        ours = load(input, { schema });
      } catch (e) {
        ours = (e as YAMLException).message;
      }
      expect(ours, input).toEqual(theirs);
    }
    expect(() => load("a: &a {1: x}\nb: {<<: *a, 1: w}\n", { schema })).toThrow(
      "duplicated mapping key (2:13)",
    );
  });

  it("points at a repeated alias key's name and a collection key at 0, as js-yaml 5 does", () => {
    const schema = YAML11_SCHEMA.withTags(legacyMapTag);
    for (const input of [
      "{&b b: 1, *b : 2}\n",
      "- &a [1]\n- {*a : 1, *a : 2}\n",
      "{? [1] : a, ? [1] : b}\n",
      "x: {? {a: 1} : a, ? {a: 1} : b}\n",
    ]) {
      const theirs = error(() =>
        real.load(input, { schema: real.YAML11_SCHEMA.withTags(real.legacyMapTag) }),
      );
      const ours = error(() => load(input, { schema }));
      expect([ours.reason, ours.mark?.position], input).toEqual([
        theirs.reason,
        theirs.mark?.position,
      ]);
    }
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

  it("keeps a key a custom tag resolves to undefined, as js-yaml 5 does", () => {
    const tag = { resolve: () => undefined, identify: () => false };
    const schema = CORE_SCHEMA.withTags(defineScalarTag("!u", tag));
    const theirs = real.CORE_SCHEMA.withTags(real.defineScalarTag("!u", tag));
    expect(load("!u x: 1", { schema })).toEqual({ undefined: 1 });
    expect(real.load("!u x: 1", { schema: theirs })).toEqual({ undefined: 1 });
  });

  it("builds schemas like js-yaml 5", () => {
    expect(() => new Schema([])).toThrow(/default scalar tag/);
    const schema = FAILSAFE_SCHEMA.withTags([{ ...strTag, resolve: (s: string) => `<${s}>` }]);
    expect(schema.tags).toHaveLength(3);
    expect(load("- a", { schema })).toEqual(["<a>"]);
  });
});
