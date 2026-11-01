import { describe, expect, it } from "vite-plus/test";
import { stringify } from "../src/index.ts";

describe("stringify", () => {
  it("writes identifier keys bare and picks the quote that needs fewer escapes", () => {
    expect(stringify({ a: 1, "a-b": "it's", c: `say "hi"`, d: `'"'` })).toBe(
      `{a:1,'a-b':"it's",c:'say "hi"',d:"'\\"'"}`,
    );
    expect(stringify("x", { quote: '"' })).toBe('"x"');
  });

  it("indents with trailing commas", () => {
    expect(stringify({ a: [1, { b: null }], c: {} }, null, 2)).toBe(
      "{\n  a: [\n    1,\n    {\n      b: null,\n    },\n  ],\n  c: {},\n}",
    );
    expect(stringify([1], null, "abcdefghijklmnop")).toBe("[\nabcdefghij1,\n]");
    expect(stringify([1], null, 20)).toBe(`[\n${" ".repeat(10)}1,\n]`);
  });

  it("writes special numbers, escapes, and boxed values", () => {
    expect(stringify([NaN, Infinity, -Infinity, -0])).toBe("[NaN,Infinity,-Infinity,0]");
    expect(stringify("\0\x001\x01\u2028\\")).toBe("'\\0\\x001\\x01\\u2028\\\\'");
    expect(stringify([new Number(1), new String("s"), new Boolean(false)])).toBe("[1,'s',false]");
  });

  it("drops what JSON5 can't hold", () => {
    expect(stringify({ a: undefined, b: () => 1, c: Symbol("c") })).toBe("{}");
    expect(stringify([undefined, () => 1])).toBe("[null,null]");
    expect(stringify(undefined)).toBeUndefined();
  });

  it("prefers toJSON5 over toJSON and applies replacers", () => {
    expect(stringify({ toJSON5: () => "five", toJSON: () => "json" })).toBe("'five'");
    expect(stringify(new Date(0))).toBe("'1970-01-01T00:00:00.000Z'");
    expect(stringify({ a: 1, b: 2, c: 3 }, ["c", "a"])).toBe("{c:3,a:1}");
    expect(stringify({ a: 1, b: 2 }, (key, value) => (key === "a" ? undefined : value))).toBe(
      "{b:2}",
    );
  });

  it("throws on cycles", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => stringify(value)).toThrow(new TypeError("Converting circular structure to JSON5"));
  });
});
