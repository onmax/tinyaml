// The root's own rules, where they differ from json5 2.2.3: json5 3's, and
// the `jsonc` option.
import { describe, expect, it, vi } from "vite-plus/test";
import JSON5, { parse, stringify } from "../src/index.ts";

const error = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    const { name, message, lineNumber, columnNumber } = e as SyntaxError & Record<string, number>;
    return [name, message, lineNumber, columnNumber];
  }
  throw new Error("did not throw");
};

describe("parse", () => {
  it("reads JSON5 and has a default export", () => {
    expect(parse("{a: [1, 'b', 0x10, .5, +Infinity,], /* c */}")).toEqual({
      a: [1, "b", 16, 0.5, Infinity],
    });
    expect(JSON5.parse("[]")).toEqual([]);
  });

  it("doesn't warn about U+2028 and U+2029", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parse("'\u2028\u2029'")).toBe("\u2028\u2029");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reports an error on a line terminator on the line it ends", () => {
    expect(error(() => parse("'a\nb'"))).toEqual([
      "SyntaxError",
      "JSON5: invalid character '\\n' at 1:3",
      1,
      3,
    ]);
    expect(error(() => parse("[1,\r\n@]"))).toEqual([
      "SyntaxError",
      "JSON5: invalid character '@' at 2:1",
      2,
      1,
    ]);
    expect(error(() => parse("[1,\r@]"))[1]).toBe("JSON5: invalid character '@' at 2:1");
    expect(error(() => parse("[1,\u2028@]"))[1]).toBe("JSON5: invalid character '@' at 2:1");
    expect(error(() => parse("[1,\n"))[1]).toBe("JSON5: invalid end of input at 2:1");
  });

  it("returns integers outside the safe range as BigInts with `bigint`", () => {
    expect(parse("[9007199254740993, -0x20000000000001, 1, 1e20]", { bigint: true })).toEqual([
      9007199254740993n,
      -9007199254740993n,
      1,
      1e20,
    ]);
    expect(parse("9007199254740993", null, { bigint: true })).toBe(9007199254740993n);
    expect(() => parse("1", { bigint: "yes" as never })).toThrow(
      new TypeError("JSON5: bigint must be a boolean"),
    );
  });

  it("walks the result as JSON.parse does", () => {
    // Own keys only, and a property the reviver made read-only stays.
    const seen: string[] = [];
    const value = parse("{a: 1, b: {c: 2}}", function (this: any, key, value) {
      seen.push(key);
      if (key === "a") Object.defineProperty(this, "b", { configurable: false, writable: false });
      return key === "c" ? undefined : value;
    });
    expect(seen).toEqual(["a", "c", "b", ""]);
    expect(value).toEqual({ a: 1, b: {} });
  });
});

describe("parse with jsonc", () => {
  const jsonc = (text: string) => parse(text, { jsonc: true });

  it("reads JSON with comments", () => {
    expect(jsonc('// c\n{"a": [1, -2.5e3, true, null, "\\u00e9\\n"], /* c */ "b": {}}')).toEqual({
      a: [1, -2500, true, null, "é\n"],
      b: {},
    });
  });

  it("rejects everything else JSON5 adds", () => {
    for (const text of [
      "{a: 1}",
      "{'a': 1}",
      "['a']",
      "[1,]",
      '{"a": 1,}',
      "0x10",
      "+1",
      ".5",
      "5.",
      "Infinity",
      "-NaN",
      '"\\x41"',
      '"\\v"',
      '"\\\'"',
      '"a\\\nb"',
      '"\t"',
      "\ufeff1",
      "\u00a01",
      "\v1",
      "1\u2028",
      "1 /* a */ \u2028",
    ])
      expect(() => jsonc(text), text).toThrow(SyntaxError);
  });

  it("ends a line comment only at a line feed or carriage return, as JSON's whitespace", () => {
    expect(jsonc("1 // a\u2028b")).toBe(1);
  });

  it("points at the character that isn't JSON", () => {
    expect(error(() => jsonc('{"a": 1,}'))[1]).toBe("JSON5: invalid character '}' at 1:9");
    expect(error(() => jsonc("[0x1]"))[1]).toBe("JSON5: invalid character 'x' at 1:3");
  });
});

describe("stringify", () => {
  it("throws on a BigInt, boxed or not", () => {
    for (const value of [1n, Object(1n), { a: [2n] }])
      expect(() => stringify(value)).toThrow(
        new TypeError("Do not know how to serialize a BigInt"),
      );
  });

  it("takes only a single or double quote", () => {
    expect(stringify("it's", { quote: '"' })).toBe(`"it's"`);
    for (const quote of ["`", "x", ""])
      expect(() => stringify("a", { quote })).toThrow(
        new TypeError(`JSON5: quote must be "'" or '"'`),
      );
  });

  it("escapes lone surrogates and keeps pairs", () => {
    expect(stringify("\ud800 \udc00 😀")).toBe("'\\ud800 \\udc00 😀'");
  });

  it("writes a key with identifier characters above U+FFFF bare", () => {
    expect(stringify({ "a\u{10000}b": 1 })).toBe("{a\u{10000}b:1}");
  });

  it("reads arrays, replacer lists and hooks once", () => {
    let reads = 0;
    const list = new Proxy(["a", "b"], {
      get: (target, key) => (key === "length" && reads++, Reflect.get(target, key)),
    });
    expect(stringify({ a: 1, b: 2, c: 3 }, list)).toBe("{a:1,b:2}");
    expect(reads).toBe(1);
    const value = [1, 2];
    expect(
      stringify(value, (key, v) => {
        if (key === "0") value.push(3);
        return v;
      }),
    ).toBe("[1,2]");
    let hooks = 0;
    const hooked = {
      get toJSON() {
        hooks++;
        return () => "x";
      },
    };
    expect(stringify(hooked)).toBe("'x'");
    expect(hooks).toBe(1);
  });
});
