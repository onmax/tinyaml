// jsonc-parser's quirks, which tinyjson5/jsonc-parser keeps, and its enums.
import { createRequire } from "node:module";
import { describe, expect, it } from "vite-plus/test";
import * as ours from "../src/jsonc-parser/index.ts";

const theirs = createRequire(import.meta.url)("jsonc-parser") as typeof import("jsonc-parser");

describe("jsonc-parser", () => {
  it("exports the same names, and enums that map both ways", () => {
    expect(Object.keys(ours).sort()).toEqual(Object.keys(theirs).sort());
    for (const name of ["ScanError", "SyntaxKind", "ParseErrorCode"] as const)
      expect(JSON.stringify(ours[name])).toBe(JSON.stringify(theirs[name]));
  });

  it("starts a comment's value one character early", () => {
    const scanner = ours.createScanner("a //x");
    scanner.scan();
    scanner.scan();
    expect(scanner.scan()).toBe(12);
    expect(scanner.getTokenValue()).toBe(" //x");
    expect(ours.stripComments("1//x\n2", "*")).toBe(theirs.stripComments("1//x\n2", "*"));
  });

  it('assigns "__proto__", so it sets the prototype', () => {
    const value = ours.parse('{"__proto__": {"polluted": 1}}');
    expect(Object.hasOwn(value, "__proto__")).toBe(false);
    expect(value.polluted).toBe(1);
  });

  it("indents by 200 characters with undefined, as its table runs out at 199", () => {
    const text = "[".repeat(51) + "]".repeat(51);
    const options = { tabSize: 4, insertSpaces: true };
    expect(ours.format(text, undefined, options)).toEqual(theirs.format(text, undefined, options));
    expect(ours.format(text, undefined, options).some((edit) => edit.content === undefined)).toBe(
      true,
    );
  });

  it("reads tabSize as jsonc-parser does, twice when its table has no such indent", () => {
    const options = (reads: string[]) => ({
      insertSpaces: true,
      get tabSize() {
        reads.push("tabSize");
        return reads.length === 1 ? 24 : 2;
      },
    });
    const a: string[] = [];
    const b: string[] = [];
    expect(ours.format("[1]", undefined, options(a))).toEqual(
      theirs.format("[1]", undefined, options(b)),
    );
    expect(a).toEqual(b);
    for (const tabSize of ["length", 2.5, -1] as never[])
      expect(ours.format("[1]", undefined, { tabSize, insertSpaces: true })).toEqual(
        theirs.format("[1]", undefined, { tabSize, insertSpaces: true }),
      );
  });

  it("formats a range that starts before the text as jsonc-parser does", () => {
    const range = { offset: -5, length: 10 };
    expect(ours.format("\n [1]", range, {})).toEqual(theirs.format("\n [1]", range, {}));
  });

  it("names error codes without reading the exported enum", () => {
    const codes = ours.ParseErrorCode as Record<number, string>;
    const name = codes[1];
    codes[1] = "changed";
    try {
      expect(ours.printParseErrorCode(1 as never)).toBe("InvalidSymbol");
    } finally {
      codes[1] = name!;
    }
  });

  it("scans from NaN as jsonc-parser does", () => {
    const scanner = ours.createScanner("1");
    scanner.setPosition(NaN);
    expect(scanner.scan()).toBe(11);
  });
});
