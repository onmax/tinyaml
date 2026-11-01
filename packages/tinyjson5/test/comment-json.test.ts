// tinyjson5/comment-json reads JSON with comments without esprima where it
// can, and must build exactly esprima's tokens there.
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import * as ours from "../src/comment-json/index.ts";

const require = createRequire(import.meta.url);
const esprima = require(
  require.resolve("esprima", { paths: [dirname(require.resolve("comment-json"))] }),
);
const tokens = (text: string) => esprima.tokenize(text, { comment: true, loc: true });

describe("comment-json", () => {
  it("tokenizes JSON with comments as esprima does", () => {
    for (const text of [
      '{\r\n  "a": [1, -2.5e+3, true, null, false], // c\n  /* x\r\n y */ "b": {}\n}',
      "// only\n0",
      '"a"/**/:1',
    ])
      expect(ours.tokenize(text)).toEqual(tokens(text));
  });

  it("leaves the rest to esprima, errors included", () => {
    for (const text of ["'a'", "x--", "1 -= 2", "01", "1.", "/a/g", " 1", '"\\n"', " "]) {
      let error: unknown;
      try {
        tokens(text);
      } catch (e) {
        error = e;
      }
      if (error) expect(() => ours.tokenize(text)).toThrow((error as Error).message);
      else expect(ours.tokenize(text)).toEqual(tokens(text));
    }
  });

  it("keeps comments through parse and stringify", () => {
    const text = '// top\n{\n  "a": 1, // one\n  "b": [2] /* two */\n}';
    expect(ours.stringify(ours.parse(text), null, 2)).toBe(
      require("comment-json").stringify(require("comment-json").parse(text), null, 2),
    );
  });

  it("ignores writes and deletes it can't make on frozen objects, as comment-json's sloppy-mode code does", () => {
    const theirs = require("comment-json");
    for (const api of [ours, theirs]) {
      expect(JSON.stringify(api.assign(Object.freeze({ a: 0 }), { a: 1 }))).toBe('{"a":0}');
      const value = Object.freeze(api.parse('// c\n{"a": 1}'));
      expect(() => api.removeComments(value, { where: "before-all" })).not.toThrow();
    }
  });
});
