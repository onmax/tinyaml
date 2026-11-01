// jju's quirks, which tinyjson5/jju keeps.
import { createRequire } from "node:module";
import { describe, expect, it } from "vite-plus/test";
import * as ours from "../src/jju/index.ts";

const theirs = createRequire(import.meta.url)("jju") as typeof ours;

describe("jju", () => {
  it("exports jju's functions but its Node-only utils", () => {
    expect(Object.keys(ours).sort()).toEqual(
      Object.keys(theirs)
        .filter((k) => k !== "utils")
        .sort(),
    );
  });

  it("reads JSON5 into null-prototype objects, and keeps formatting on update", () => {
    const text = "{a: 1, // one\n  'b c': [2, 0x10,],}";
    expect(ours.parse(text)).toEqual(theirs.parse(text));
    expect(Object.getPrototypeOf(ours.parse("{}"))).toBe(Object.getPrototypeOf(theirs.parse("{}")));
    expect(ours.update(text, { a: 3, "b c": [2, 16] })).toBe(
      theirs.update(text, { a: 3, "b c": [2, 16] }),
    );
  });

  it("throws jju's errors, with row and column", () => {
    const error = (api: typeof ours) => {
      try {
        api.parse("{a: 1,\n  b: @}");
      } catch (e) {
        return [String(e), (e as any).row, (e as any).column];
      }
    };
    expect(error(ours)).toEqual(error(theirs));
  });

  it("writes strings and keys as jju does, escapes included", () => {
    const value = { a: "plain", "</": "</script>", é: " \u0001'\"", 1: [true, null] };
    for (const options of [
      {},
      { indent: 2 },
      { quote: '"', quote_keys: true },
      { ascii: true, mode: "json" },
    ] as const)
      expect(ours.stringify(value, options)).toBe(theirs.stringify(value, options));
  });
});
