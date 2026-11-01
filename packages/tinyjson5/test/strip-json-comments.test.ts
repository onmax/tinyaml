// Where the three strip-json-comments majors differ, each subpath does what
// its own does.
import { createRequire } from "node:module";
import { describe, expect, it } from "vite-plus/test";
import v3 from "../src/strip-json-comments/index.ts";
import v2 from "../src/strip-json-comments-v2/index.ts";
import v5 from "../src/strip-json-comments-v5/index.ts";

describe("strip-json-comments", () => {
  it("sees a quote after three backslashes as unescaped only in v2", () => {
    // v2 looks back two characters, so the string ends at that quote and the comment is stripped.
    const text = '["a\\\\\\"/*x*/]';
    expect(v2(text)).toBe('["a\\\\\\"     ]');
    expect(v3(text)).toBe(text);
    expect(v5(text)).toBe(text);
  });

  it("keeps a block comment that never ends only in v5", () => {
    expect(v3("1 /* x")).toBe("1     ");
    expect(v5("1 /* x")).toBe("1 /* x");
  });

  it("blanks non-ASCII whitespace in a comment only in v5", () => {
    expect(v3("/* */1")).toBe("     1");
    expect(v5("/* */1")).toBe("     1");
  });

  it("strips trailing commas in v5, past comments but not past a second comma", () => {
    expect(v5('{"a":1, /* c */ }', { trailingCommas: true })).toBe('{"a":1          }');
    expect(v5("[1,,]", { trailingCommas: true })).toBe("[1,,]");
    expect(v5("[1,]", { trailingCommas: true, whitespace: false })).toBe("[1]");
  });

  it("reads `whitespace` as v5 and v3 each do", () => {
    expect(v3("/**/", { whitespace: 0 as never })).toBe("    ");
    expect(v5("/**/", { whitespace: 0 as never })).toBe("");
  });

  it("throws each version's error for a non-string", () => {
    expect(() => v3(5 as never)).toThrow(
      "Expected argument `jsonString` to be a `string`, got `number`",
    );
    expect(() => v2(5 as never)).toThrow("str.substr is not a function");
    expect(() => v2(null as never)).toThrow("Cannot read properties of null (reading 'length')");
    expect(v2(new String("//a\n1") as never)).toBe("   \n1");
  });

  it("reads opts.whitespace before the input in v2, as v2 does", () => {
    const original = createRequire(import.meta.url)("strip-json-comments-v2");
    const order = (fn: (str: unknown, opts: unknown) => unknown) => {
      const reads: string[] = [];
      const opts = {
        get whitespace() {
          return (reads.push("whitespace"), true);
        },
      };
      const str = {
        get length() {
          return (reads.push("length"), 0);
        },
      };
      try {
        fn(str, opts);
      } catch {}
      return reads;
    };
    expect(order(v2 as never)).toEqual(order(original));
  });
});
