import { describe, expect, it, vi } from "vite-plus/test";
import { createRequire } from "node:module";
import JSON5, { parse } from "../src/json5/index.ts";

describe("parse", () => {
  it("reads JSON5", () => {
    expect(
      parse(`// config
{
  name: 'tinyjson5', /* inline */
  "quoted": "yes",
  list: [1, +2, -0x10, .5, 5., 1e3, Infinity, -Infinity,],
  nested: {a: null, b: true, c: false,},
  multi: 'one \\
two',
}`),
    ).toEqual({
      name: "tinyjson5",
      quoted: "yes",
      list: [1, 2, -16, 0.5, 5, 1000, Infinity, -Infinity],
      nested: { a: null, b: true, c: false },
      multi: "one two",
    });
    expect(Object.is(parse("-0"), -0)).toBe(true);
    expect(parse("NaN")).toBeNaN();
    expect(JSON5.parse("[]")).toEqual([]);
  });

  it("keeps __proto__ as an own property", () => {
    const value = parse<Record<string, unknown>>('{"__proto__": {"polluted": true}}');
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("defines keys instead of assigning them, as json5 does", () => {
    let called = false;
    Object.defineProperty(Object.prototype, "hook", {
      set() {
        called = true;
      },
      configurable: true,
    });
    try {
      const value = parse<Record<string, unknown>>("{hook: 1, a: 1, a: 2}");
      expect(Object.hasOwn(value, "hook")).toBe(true);
      expect(value).toEqual({ hook: 1, a: 2 });
      expect(called).toBe(false);
    } finally {
      delete (Object.prototype as Record<string, unknown>).hook;
    }
  });

  it("throws json5's SyntaxError with line and column", () => {
    const at = (text: string) => {
      try {
        parse(text);
      } catch (error) {
        const { message, lineNumber, columnNumber } = error as SyntaxError & Record<string, number>;
        return [error instanceof SyntaxError, message, lineNumber, columnNumber];
      }
      throw new Error("did not throw");
    };
    expect(at("")).toEqual([true, "JSON5: invalid end of input at 1:1", 1, 1]);
    expect(at("{a:1,\n  b:@}")).toEqual([true, "JSON5: invalid character '@' at 2:5", 2, 5]);
    expect(at("'a\nb'")).toEqual([true, "JSON5: invalid character '\\n' at 2:0", 2, 0]);
    expect(at("{\\u0030:1}")).toEqual([true, "JSON5: invalid identifier character at 1:2", 1, 2]);
    expect(at("[1,\u{1F600}]")).toEqual([
      true,
      "JSON5: invalid character '\u{1F600}' at 1:5",
      1,
      5,
    ]);
  });

  it("warns about unescaped line and paragraph separators", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parse("'\u2028'")).toBe("\u2028");
    expect(warn).toHaveBeenCalledWith(
      "JSON5: '\\u2028' in strings is not valid ECMAScript; consider escaping",
    );
    warn.mockRestore();
  });

  it("calls the reviver bottom-up with the holder as this", () => {
    const seen: string[] = [];
    const value = parse("{a:[1,2],b:{c:3}}", function (this: unknown, key, value) {
      seen.push(key);
      return typeof value === "number" ? value * 10 : value;
    });
    expect(value).toEqual({ a: [10, 20], b: { c: 30 } });
    expect(seen).toEqual(["0", "1", "a", "c", "b", ""]);
  });

  it("keeps a property the reviver can't delete, as json5 does", () => {
    const json5 = createRequire(import.meta.url)("json5") as { parse: typeof parse };
    function seal(this: object, key: string, value: unknown) {
      if (key === "") return value;
      Object.seal(this);
      return undefined;
    }
    for (const text of ["{a:1}", "[1]"]) {
      expect(parse(text, seal)).toEqual(json5.parse(text, seal));
    }
  });

  it("parses deep nesting without recursion", () => {
    const depth = 100_000;
    expect(() => parse("[".repeat(depth) + "]".repeat(depth))).not.toThrow();
  });

  it("accepts identifiers from Unicode versions newer than json5's tables", () => {
    // U+0560 ARMENIAN SMALL LETTER TURNED AYB is from Unicode 11; json5 2.2.3 rejects it.
    expect(parse("{\u0560: 1}")).toEqual({ "\u0560": 1 });
  });
});
