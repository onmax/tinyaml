import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import YAML, { load, parse, parseFile, ParseException } from "../../src/yamljs/index.ts";

const yamljs = createRequire(import.meta.url)("yamljs") as typeof YAML;

// Each input must give what yamljs 0.3.0 gives.
const same = (...inputs: string[]) => {
  for (const input of inputs) expect(parse(input), input).toEqual(yamljs.parse(input));
};

describe("parse", () => {
  it("resolves scalars as yamljs does", () => {
    expect(
      parse(
        "a: yes\nb: Off\nc: TRUE\nd: Null\ne: ~\nf: 010\ng: 08\nh: 0x1F\ni: 1,000\nj: 1e3\nk: .5\nl: -.inf\nm: .NaN\nn: +12\no: -012\np: 0o17\nq: 1_000\nr: Infinity",
      ),
    ).toEqual({
      a: "yes",
      b: "Off",
      c: true,
      d: null,
      e: null,
      f: 8,
      g: 0,
      h: 31,
      i: 1000,
      j: 1000,
      k: 0.5,
      l: Infinity,
      m: NaN,
      n: 12,
      o: -10,
      p: 0,
      q: "1_000",
      r: Infinity,
    });
  });

  it("reads dates as UTC Date objects", () => {
    expect(
      parse("a: 2002-12-14\nb: 2001-12-14t21:59:43.10-05:00\nc: 2001-12-14 21:59:43 +1"),
    ).toEqual({
      a: new Date("2002-12-14T00:00:00Z"),
      b: new Date("2001-12-15T02:59:43.100Z"),
      c: new Date("2001-12-14T20:59:43Z"),
    });
  });

  it("evaluates block keys before they become strings", () => {
    same("1: a\n0x10: b\n010: c\n1.0: d\n~: e\ntrue: f\n2001-01-01: g");
  });

  it("keeps the first of duplicate keys", () => {
    same("a: 1\na: 2", "a: ~\na: 2", "x:\n  a: 1\n  a:\n    - 2\n  b: 3", "- a: 1\n  a: 2\n  b: 3");
    same(
      "{port: 80, port: 443}\n",
      "a: {b: {c: 1, c: 2}, b: 3}\n",
      "- {x: 1, x: 2}\n- {y: 1, y: 2, y: 3}\n",
      "a: 1\nb: {x: 1, x: 2}\na: 3\n",
      "a: 1\na: {b: 1, b: 2}\n",
      "{a: 1, b: 2, a: 3, b: 4}\n",
    );
    // A key after a merge replaces what the merge copied.
    same("<<: {a: 1}\na: 2\n", "a: 2\n<<: {a: 1}\n");
  });

  it("keeps the last of duplicate keys in a block mapping after a merge", () => {
    same(
      "<<: {}\na: 1\na: 2",
      "a: 1\n<<: {}\na: 2",
      "a: 1\na: 2\n<<: {}\na: 3",
      "a: 1\na: 2\n<<: {}",
      "<<: {a: 1}\na: 2\na: 3",
      "a: 1\n<<: {}\nb: 1\nb: 2",
      "x: &x {a: 1}\ny:\n  a: 2\n  <<: *x\n  a: 3",
      "<<: [{a: 1}, {a: 2, b: 2}]\nb: 3\nb: 4",
      "- <<: {}\n  a: 1\n  a: 2",
      "- a: 1\n  <<: {}\n  a: 2\n- a: 1\n  a: 2",
    );
    expect(parse("<<: {}\na: 1\na: 2")).toEqual({ a: 2 });
    // Each block mapping on its own, and never a flow mapping.
    same(
      "<<: {}\nb:\n  a: 1\n  a: 2",
      "b:\n  <<: {}\n  a: 1\na: 1\na: 2",
      "<<: {}\nb: {a: 1, a: 2}",
    );
  });

  it("merges any number of mappings", () => {
    same(`a: &a {x: 1}\n<<: [${Array(101).fill("*a").join(",")}]\n`);
  });

  it("reads a block mapping that merges no keys as null", () => {
    same(
      "<<: [{}, {}]\n",
      "<<: {}\n",
      "<<: []\n",
      "- <<: {}\n",
      "x:\n  <<: {}\n",
      "x: &a\n  <<: {}\ny: *a\n",
      "a: 1\n<<: {}\n",
      "<<: [{a: 1}, {}]\n",
      "x: {}\n",
    );
  });

  it("merges documents and drops %YAML lines", () => {
    same("a: 1\n---\nb: 2", "---\na: 1\n...\n", "%YAML 1.2\na: 1", "--- %YAML:1.0\nfoo: 1");
  });

  it("gives null for empty documents", () => {
    expect(parse("")).toBeNull();
    expect(parse("# just a comment\n")).toBeNull();
    expect(parse("a:")).toEqual({ a: null });
  });

  it("takes lines yamljs reads but YAML doesn't", () => {
    same(
      "title: Episode 1: The Start",
      "name: @scope/pkg\nformat: %Y-%m-%d\ncmd: `ls`",
      'path: "C:\\Users\\me\\new"',
      "a: - b",
      "a:\n  b: 1\n  c: Foo: bar\nd: |x",
      "- title: A: B\n  tags: [x]",
      "items:\n  - |-\n     \n    text",
      "a: |\n  x\n# column 0 comment\n  y\n",
      "a:\n  b: |\n    x\n # less indented comment\n    y\n",
    );
  });

  it("reads tags", () => {
    same("a: !!str 12\nb: !!int 12.5\nc: !!float 1\nd: !!bool no\ne: !!timestamp 2001-01-01");
    expect(parse("a: !foo bar\nb: !!binary aGk=")).toEqual({ a: null, b: null });
    expect(parse("a: !foo bar", false, (tag, value) => [tag, value])).toEqual({
      a: ["!foo", "bar"],
    });
    expect(() => parse("a: !foo bar", true)).toThrow(ParseException);
  });

  it("keeps a key objectDecoder decodes to undefined, as yamljs does", () => {
    const decode = () => undefined;
    expect(parse("!u x: 1", false, decode)).toEqual({ undefined: 1 });
    expect(yamljs.parse("!u x: 1", false, decode)).toEqual({ undefined: 1 });
  });

  it("passes a tagged flow collection to objectDecoder as its text", () => {
    const decode = (tag: string, value: unknown) => ({ tag, value });
    for (const input of [
      "x: !foo [1, 2]",
      "x: !foo {a: 1}",
      "- !foo [1, [2, 3]]  # c",
      "x: !foo [1,\n      2]",
      "x: !foo &a [1]",
      "x: !!str [1, 2]",
      "x: !!bool [1]",
    ])
      expect(parse(input, false, decode), input).toEqual(yamljs.parse(input, false, decode));
  });

  it("supports anchors, aliases and merge keys", () => {
    same(
      "base: &b {x: 1, y: 2}\nm:\n  <<: *b\n  y: 3",
      "a: &x [1, 2]\nb: *x",
      "- &a 1\n- *a",
      "a: &a {x: 1}\nb: &b {y: 2}\nc:\n  <<: [*a, *b]",
    );
  });

  it("matches yamljs on common config shapes", () => {
    same(
      "name: app\nversion: 1.2.3\nport: 8080\ndebug: false\ntags: [web, api]\nenv:\n  NODE_ENV: production\n  KEY: 'x: y'\n",
      "- a: 1\n  b: [1, 2,\n    3]\n- c\n-\n  - nested\n",
      "a: |\n  line 1\n  line 2\n\nb: >-\n  folded\n  text\n",
      "a: 'it''s'\nb: \"\\x41\\t\"\nc: x #comment\nd: x#y\n",
      "  indented: 1\n  doc: 2\n",
    );
  });

  it("throws ParseException with yamljs's line and snippet", () => {
    const error = (text: string) => {
      try {
        parse(text);
      } catch (error) {
        return error as ParseException;
      }
    };
    const lf = error("a: 1\nb: [x\n");
    expect(lf).toBeInstanceOf(ParseException);
    expect(lf?.parsedLine).toBe(3);
    expect(String(lf)).toMatch(/^<ParseException> /);
    // yamljs reads CRLFs and lone CRs as \n.
    for (const text of ["a: 1\r\nb: [x\r\n", "a: 1\rb: [x\r"])
      expect(error(text)).toMatchObject({ parsedLine: 3, snippet: lf?.snippet });
  });
});

describe("parse, where yamljs is wrong", () => {
  it("folds multi-line scalars as YAML does", () => {
    expect(parse("a: foo\n  bar")).toEqual({ a: "foo bar" });
    expect(yamljs.parse("a: foo\n  bar")).toEqual({ a: "foo\nbar" });
  });

  it("reads nested compact sequences", () => {
    expect(parse("- - a\n  - b")).toEqual([["a", "b"]]);
    expect(yamljs.parse("- - a\n  - b")).toEqual(["- a\n- b"]);
  });

  it("reads a node's properties across lines", () => {
    expect(parse("[!!str \n &c 1, *c]")).toEqual(["1", "1"]);
    expect(() => yamljs.parse("[!!str \n &c 1, *c]")).toThrow(/Malformed inline YAML/);
    expect(() => parse("[&a \n &b c]")).toThrow(ParseException);
    expect(parse("- !!str \n  &c c\n- *c")).toEqual(["c", "c"]);
    expect(yamljs.parse("- !!str \n  &c c")).toEqual([null]);
  });

  it("decodes Unicode escapes", () => {
    expect(parse('a: "\\u00e9"')).toEqual({ a: "é" });
  });

  it("keeps keys named like members of Object.prototype", () => {
    expect(parse("constructor: 1\n")).toEqual({ constructor: 1 });
    expect(yamljs.parse("constructor: 1\n")).toBeNull();
    expect(parse("{constructor: 1}\n")).toEqual({ constructor: 1 });
    expect(yamljs.parse("{constructor: 1}\n")).toEqual({});
    expect(parse("a:\n  toString: 1\n  b: 2\n")).toEqual({ a: { toString: 1, b: 2 } });
    expect(yamljs.parse("a:\n  toString: 1\n  b: 2\n")).toEqual({ a: { b: 2 } });
  });

  it("reads an alias in a flow collection", () => {
    expect(parse("a: &x 1\nb: {c: *x}\n")).toEqual({ a: 1, b: { c: 1 } });
    expect(yamljs.parse("a: &x 1\nb: {c: *x}\n")).toEqual({ a: 1, b: { c: "*x" } });
    expect(parse("a: &x 1\nb: [*x]\n")).toEqual({ a: 1, b: [1] });
    expect(yamljs.parse("a: &x 1\nb: [*x]\n")).toEqual({ a: 1, b: ["*x"] });
  });
});

describe("load and parseFile", () => {
  const dir = mkdtempSync(join(tmpdir(), "tinyaml-yamljs-"));
  const file = join(dir, "config.yml");
  writeFileSync(file, "this: is\na: [YAML, example]\n");
  afterAll(() => rmSync(dir, { recursive: true }));

  it("reads synchronously", () => {
    expect(load(file)).toEqual({ this: "is", a: ["YAML", "example"] });
    expect(parseFile(file)).toEqual(YAML.load(file));
    expect(() => load(join(dir, "missing.yml"))).toThrow();
  });

  it("reads asynchronously, with null for a missing file", async () => {
    expect(await new Promise((done) => load(file, done))).toEqual({
      this: "is",
      a: ["YAML", "example"],
    });
    expect(await new Promise((done) => load(join(dir, "missing.yml"), done))).toBeNull();
  });
});
