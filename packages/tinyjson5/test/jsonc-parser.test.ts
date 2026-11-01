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
});
