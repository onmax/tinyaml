import * as jsYaml from "js-yaml";
import { describe, expect, it } from "vite-plus/test";
import yaml, {
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  dump,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  load,
  loadAll,
  safeLoad,
  Type,
  YAMLException,
} from "../../src/js-yaml/index.ts";

describe("load", () => {
  it("resolves scalars like js-yaml 4's default schema", () => {
    expect(
      load(
        "a: null\nb: ~\nc: true\nd: True\ne: 1\nf: 1.5\ng: 0x10\nh: 1e3\ni:\nj: .inf\nk: yes\nl: 0o17",
      ),
    ).toEqual({
      a: null,
      b: null,
      c: true,
      d: true,
      e: 1,
      f: 1.5,
      g: 16,
      h: 1000,
      i: null,
      j: Infinity,
      k: "yes",
      l: 15,
    });
    expect(load('a: !!int "3"\nb: !!str 3\nc: !!float .inf\nd: !!null')).toEqual({
      a: 3,
      b: "3",
      c: Infinity,
      d: null,
    });
  });

  it("loads timestamps, binary, sets, ordered maps and pairs", () => {
    expect(load("d: 2001-12-14\nt: 2001-12-14t21:59:43.10-05:00")).toEqual({
      d: new Date(Date.UTC(2001, 11, 14)),
      t: new Date(Date.UTC(2001, 11, 15, 2, 59, 43, 100)),
    });
    expect(load("b: !!binary aGVsbG8=")).toEqual({ b: new Uint8Array([104, 101, 108, 108, 111]) });
    expect(load("s: !!set {a, b}\no: !!omap [a: 1]\np: !!pairs [a: 1, a: 2]")).toEqual({
      s: { a: null, b: null },
      o: [{ a: 1 }],
      p: [
        ["a", 1],
        ["a", 2],
      ],
    });
  });

  it("merges mappings with <<", () => {
    expect(load("base: &b {x: 1, y: 2}\nm:\n  <<: *b\n  y: 3")).toEqual({
      base: { x: 1, y: 2 },
      m: { x: 1, y: 3 },
    });
    expect(load("a: &a {x: 1}\nb: &b {x: 2, z: 3}\nm:\n  <<: [*a, *b]")).toEqual({
      a: { x: 1 },
      b: { x: 2, z: 3 },
      m: { x: 1, z: 3 },
    });
  });

  it("takes the other schemas", () => {
    expect(load("a: 2001-12-14\nb: ~", { schema: CORE_SCHEMA })).toEqual({
      a: "2001-12-14",
      b: null,
    });
    expect(JSON_SCHEMA).toBe(CORE_SCHEMA);
    expect(load("a: 1\nb: true", { schema: FAILSAFE_SCHEMA })).toEqual({ a: "1", b: "true" });
  });

  it("reads frontmatter-shaped documents", () => {
    const text = `title: Hello
tags: [a, "b c"]
nested:
  list:
    - one
    - two: 2
      three: 3
body: |
  Line one
  Line two
folded: >
  joined
  together
`;
    expect(load(text)).toEqual({
      title: "Hello",
      tags: ["a", "b c"],
      nested: { list: ["one", { two: 2, three: 3 }] },
      body: "Line one\nLine two\n",
      folded: "joined together\n",
    });
  });

  it("resolves anchors, aliases and self references", () => {
    const doc = load("base: &b {x: 1}\ncopy: *b\n") as Record<string, unknown>;
    expect(doc.copy).toBe(doc.base);
    const self = load("&a\nself: *a\n") as Record<string, unknown>;
    expect(self.self).toBe(self);
  });

  it("splits documents and handles empty input", () => {
    expect(loadAll("a: 1\n---\nb: 2\n")).toEqual([{ a: 1 }, { b: 2 }]);
    const seen: unknown[] = [];
    loadAll("a\n---\nb", (doc) => seen.push(doc));
    expect(seen).toEqual(["a", "b"]);
    expect(loadAll("")).toEqual([]);
    expect(load("")).toBeUndefined();
    expect(load("# only a comment\n")).toBeNull();
    expect(() => load("a\n---\nb")).toThrow(YAMLException);
  });

  it("stringifies complex keys and honours json", () => {
    expect(load("? [a, b]\n: c\n{x: 1}: d")).toEqual({ "a,b": "c", "[object Object]": "d" });
    expect(() => load("a: 1\na: 2")).toThrow("duplicated mapping key");
    expect(load("a: 1\na: 2", { json: true })).toEqual({ a: 2 });
  });

  it.each([
    "a: 1\na: 2",
    "a: b: c",
    'key: "x',
    "[a, b",
    "- a\n b: c",
    "\ta: 1",
    "*missing",
    "[".repeat(1000),
  ])("throws a YAMLException with a mark for %j", (bad) => {
    let error: unknown;
    try {
      loadAll(bad, { filename: "in.yml" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(YAMLException);
    const { reason, mark, message } = error as YAMLException;
    expect(
      message.startsWith(`${reason} in "in.yml" (${mark!.line + 1}:${mark!.column + 1})`),
    ).toBe(true);
    expect(mark!.snippet).toContain("^");
  });

  it("supports custom types", () => {
    class Point {
      x: number;
      y: number;
      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
      }
    }
    const point = new Type("!point", {
      kind: "sequence",
      resolve: (data) => data !== null && data.length === 2,
      construct: ([x, y]) => new Point(x, y),
      instanceOf: Point,
      represent: (p) => [(p as Point).x, (p as Point).y],
    });
    const schema = DEFAULT_SCHEMA.extend([point]);
    const doc = load("at: !point [1, 2]", { schema }) as { at: Point };
    expect(doc.at).toEqual(new Point(1, 2));
    // js-yaml 4 leaves a space after a tag on its own line; so does tinyaml.
    expect(dump(doc, { schema })).toBe("at: !point \n  - 1\n  - 2\n");
    expect(() => load("at: !point [1]", { schema })).toThrow(/cannot resolve a node/);
  });

  it("keeps __proto__ as an own key", () => {
    const doc = load("__proto__: {polluted: true}") as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("copies js-yaml 4 where a node's properties and content are on separate lines", () => {
    // The plain scalar resolves before the tag above it.
    expect(load("!\nnull")).toBe(null);
    expect(load("a: !\n  0x10")).toEqual({ a: 16 });
    expect(load("!!str\nnull")).toBe("");
    expect(load("!!str\n1")).toBe(1);
    expect(() => load("!!int\n1")).toThrow(/cannot resolve/);
    expect(load("! null")).toBe("null");
    // Properties before a key on a value's line start a mapping there.
    expect(load("foo: !!seq\n  - !!str a\n  - !!map\n    key: !!str valu: e\n")).toEqual({
      foo: ["a", { key: { valu: "e" } }],
    });
    expect(load("a: &x b: c\n   d: 2\ne: *x")).toEqual({ a: { b: "c", d: 2 }, e: "b" });
    expect(() => load("a: b: c")).toThrow(/bad indentation/);
  });

  it("copies js-yaml 4's indentation quirks", () => {
    // A tab may indent the line after an explicit entry without a value.
    expect(load("? a\n\t? b\nc:\n")).toEqual({ a: null, b: null, c: null });
    expect(load("? a\n\tc: 1\nd: 2")).toEqual({ a: null, c: 1, d: 2 });
    expect(() => load("? a\n: x\n\t? b\n")).toThrow(/tab characters/);
    expect(() => load("?\tkey:\n")).toThrow(/bad indentation/);
    // A mapping reads on after a flow collection that ends on a line indented
    // like it.
    expect(load(" #---\nflow: [a,\nb,c]?\n")).toEqual({ flow: ["a", "b", "c"], null: null });
    expect(load("flow: [a,\nb] d: 1\ne: 2")).toEqual({ flow: ["a", "b"], d: 1, e: 2 });
    // After an empty entry, a `-` on a less indented line is the next one.
    expect(load("--- -\n- &\u{1F601} : unicode anchor\n")).toEqual([
      null,
      { null: "unicode anchor" },
    ]);
    expect(load("- - \n- b\n")).toEqual([[null, "b"]]);
    expect(load("a:\n  -\n- b\nc: 1")).toEqual({ a: [null, "b"], c: 1 });
    expect(() => load("a:\n  - x\n- b\n")).toThrow(YAMLException);
    expect(() => load("-\n\t- b\n")).toThrow(/tab characters/);
    // A tab before a comment ends a block scalar with no content yet.
    for (const input of [
      "foo: |\n\t #\nbar: 1\n",
      "- >\n\t# c\n- b\n",
      "a:\n  b: |\n\t #\n  c: 1\n",
    ])
      expect(load(input), input).toEqual(jsYaml.load(input));
  });

  it("reads a flow node's properties across lines, as js-yaml 4 does", () => {
    const outcome = (load: (input: string) => unknown, input: string) => {
      try {
        return { value: load(input) };
      } catch (e) {
        return { message: (e as Error).message };
      }
    };
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
      "- &a \n  &b c",
      "a: &a \n  &b k: v",
      "- &a \n  !!str \n  &b c",
    ])
      expect(outcome(loadAll, input), input).toEqual(outcome(jsYaml.loadAll, input));
  });

  it("reads flow keys and tags as js-yaml 4 does", () => {
    const outcome = (load: (input: string) => unknown, input: string) => {
      try {
        return { value: load(input) };
      } catch (e) {
        return { message: (e as Error).message };
      }
    };
    for (const input of [
      // An implicit key's `:` is on the line the key starts on.
      "k: {\nk\n:\n0v\n}\n",
      "k: {\nk\n:\nv\n}\n",
      '{"a"\n: b}\n',
      "{a: b,\n c\n : d}\n",
      "[{a: 1\n}: 2]\n",
      "{? a\n: b}\n",
      // A plain scalar doesn't go on to a line indented no deeper than its block.
      "- { y: x\nz }- invalid\n",
      // A tag runs to white space.
      "a: !!str,x\n",
      "[!!str,a]\n",
      "{a: !x, b: 1}\n",
      "[!<a,b> x]\n",
    ])
      expect(outcome(loadAll, input), input).toEqual(outcome(jsYaml.loadAll, input));
  });

  it("reads a node that ends on a later line as a value, not a key, as js-yaml 4 does", () => {
    const outcome = (load: (input: string) => unknown, input: string) => {
      try {
        return { value: load(input) };
      } catch (e) {
        return { message: (e as Error).message };
      }
    };
    for (const input of [
      "[23\n]: 42\n",
      "a\nb: c\n",
      '"a\nb": c\n',
      "a: [1\n]: 2\n",
      "a:\n  [1\n  ]: 2\n",
      // After an explicit key, the `:` may follow on the key's last line.
      "? [\n\n] : x\n",
      '? "a\nb" : c\n',
      "? [1,\n  2] : x\n",
      "? [1,\n2] : x\n: y\n",
      // A sequence entry ends on a line indented like the sequence, or less.
      '- - "bar\nbar": x\n',
      "- [1\n  ]: 2\n",
      "- [a,\nb] - c\n",
    ])
      expect(outcome(loadAll, input), input).toEqual(outcome(jsYaml.loadAll, input));
  });

  it("words and points at errors as js-yaml 4 does", () => {
    const message = (load: (input: string) => unknown, input: string) => {
      try {
        return load(input);
      } catch (e) {
        return (e as Error).message;
      }
    };
    for (const input of [
      // No node starts where the next key would, so the mapping ends there.
      "x: 1\n]\n",
      "x: 1\n- y\n",
      "a:\n  b: c\n  ]\n",
      // A key on its own line without a colon, and one that runs on.
      "a:\n  x: 1\n  c",
      'x: 1\n"q"',
      "x: 1\nfoo\n",
      "x: 1\nb",
      "x: 1\n&a\n\n#c\n",
      "&a a: b\n*a\n",
      "x: 1\n[a,\nb]: c\n",
      // Block scalars, flow collections and colons at the end of a line.
      "|x\n",
      "[a",
      ">\nab\n cd#\n \n ef\n\n\ngh\n",
      "foo: |\n\t  x\n   ",
      "- !!str*a |+\n   !!str ",
      "'a':1",
      "a: 'b':x\n",
      " !!sr a\n: x\n",
      "- [foo",
    ])
      expect(message(loadAll, input), JSON.stringify(input)).toBe(message(jsYaml.loadAll, input));
  });

  it("rejects a document marker in a quoted scalar after an escaped break", () => {
    expect(() => load('"a\\\n...\nb"')).toThrow(YAMLException);
  });

  it("points into the input as given, CRs and all, as js-yaml 4 does", () => {
    // The mark of each warning and of the error, without its name.
    const marks = (load: (input: string, options: object) => unknown, input: string) => {
      const found: unknown[] = [];
      const keep = (e: unknown) => {
        const { position, buffer, line, column, snippet } = (e as YAMLException).mark;
        found.push({ position, buffer, line, column, snippet });
      };
      try {
        load(input, { onWarning: keep });
      } catch (e) {
        keep(e);
      }
      return found;
    };
    const ours = (input: string, options: object) => loadAll(input, options);
    const theirs = (input: string, options: object) => jsYaml.loadAll(input, null, options);
    for (const input of [
      "a\r\nb: [\r\n",
      "\uFEFFa\r\nb: [\r\n",
      "a\rb: [\r",
      "a: 1\r\nb: 2\r\nb: 3\r\n",
      "%FOO\r\n---\r\na: 1\r\n",
      "\uFEFF%FOO\r\n---\r\na: ]\r\n",
      "a\r\n...\r\n\uFEFFb: ]\r\n",
    ])
      expect(marks(ours, input), JSON.stringify(input)).toEqual(marks(theirs, input));
    // At the end of input, past any line break js-yaml 4 adds. Before that,
    // js-yaml 4 warns once more, with or without CRs.
    for (const input of ["a: 'x\r\nb", "a: [1,\r"])
      expect(marks(ours, input).at(-1)).toEqual(marks(theirs, input).at(-1));
    expect(marks(ours, "a\r\nb: [\r\n")).toMatchObject([
      { position: 4, buffer: "a\r\nb: [\r\n", line: 1, column: 1 },
    ]);
  });

  it("has js-yaml's default export and 3.x names", () => {
    expect(yaml.load).toBe(load);
    expect(safeLoad).toBe(load);
  });
});
