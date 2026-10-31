import { describe, expect, it } from "vite-plus/test";
import { load, loadAll, YAMLException } from "../src/index.ts";

describe("load", () => {
  it("resolves scalars with js-yaml's JSON_SCHEMA", () => {
    expect(load("a: null\nb: ~\nc: true\nd: True\ne: 1\nf: 1.5\ng: 0x10\nh: 1e3\ni:\n")).toEqual({
      a: null,
      b: "~",
      c: true,
      d: "True",
      e: 1,
      f: 1.5,
      g: "0x10",
      h: 1000,
      i: "",
    });
    expect(load('a: !!int "3"\nb: !!str 3\nc: !!float .inf\nd: !!null')).toEqual({
      a: 3,
      b: "3",
      c: Infinity,
      d: null,
    });
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
    expect(loadAll("")).toEqual([]);
    expect(load("")).toBeUndefined();
    expect(() => load("a\n---\nb")).toThrow(YAMLException);
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
  ])("throws a YAMLException with a position for %j", (bad) => {
    expect(() => loadAll(bad)).toThrow(YAMLException);
    expect(() => loadAll(bad)).toThrow(/\(\d+:\d+\)$/);
  });

  it("keeps __proto__ as an own key", () => {
    const doc = load("__proto__: {polluted: true}") as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
