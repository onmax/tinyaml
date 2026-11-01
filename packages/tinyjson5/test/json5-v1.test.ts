// json5 1.0.2's quirks, which tinyjson5/json5-v1 keeps.
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vite-plus/test";
import JSON5 from "../src/json5-v1/index.ts";

const outcome = (fn: () => unknown) => {
  try {
    return fn();
  } catch (e) {
    const { name, message, lineNumber, columnNumber } = e as Error & Record<string, number>;
    return [name, message, lineNumber, columnNumber];
  }
};

describe("json5-v1", () => {
  it("throws json5 1.0.2's RangeError for a hex number that ends the input", () => {
    // json5 1.0.2 takes seconds to get there: it appends "undefined" until the string is too long.
    for (const text of ["0x", "0x1F", "-0x1", "[0xA"])
      expect(outcome(() => JSON5.parse(text))).toEqual([
        "RangeError",
        "Invalid string length",
        undefined,
        undefined,
      ]);
    expect(JSON5.parse("0x1F ")).toBe(31);
  });

  it("reads the end of input as hex digits in an escape, as json5 1.0.2 does", () => {
    const json5 = createRequire(import.meta.url)("json5-v1") as typeof JSON5;
    for (const text of ['"\\x', '"\\xA', '"\\u', '"\\u12', "{\\u", "{\\u0", "{a\\u006", "{\\u61"])
      expect(
        outcome(() => JSON5.parse(text)),
        text,
      ).toEqual(outcome(() => json5.parse(text)));
    expect(outcome(() => JSON5.parse('"\\u1'))).toEqual([
      "SyntaxError",
      "JSON5: invalid end of input at 1:8",
      1,
      8,
    ]);
  });

  it("warns with the separator itself", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    JSON5.parse("' '");
    expect(warn).toHaveBeenCalledWith("JSON5: ' ' is not valid ECMAScript; consider escaping");
    warn.mockRestore();
  });

  it('writes "\\0" before a digit, as json5 1.0.2 does', () => {
    expect(JSON5.stringify("\x001")).toBe("'\\01'");
  });
});
