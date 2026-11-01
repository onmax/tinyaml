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

  it("sorts a frozen CommentArray as comment-json does: quietly when small, throwing in a merge", () => {
    const theirs = require("comment-json");
    const outcome = (lib: any, length: number) => {
      const array = new lib.CommentArray(...Array.from({ length }, (_, i) => (i + 16) % length));
      try {
        return [...Object.freeze(array).sort((x: number, y: number) => x - y)];
      } catch (e) {
        return String(e);
      }
    };
    for (const length of [2, 3, 32, 64])
      expect(outcome(ours, length), String(length)).toEqual(outcome(theirs, length));
  });

  it("writes a comment a CommentArray inherits through a changed prototype chain", () => {
    const theirs = require("comment-json");
    const write = (lib: any) => {
      const array = new lib.CommentArray(1, 2);
      const proto = Object.getPrototypeOf(lib.CommentArray.prototype);
      const extra = Object.create(proto, {
        [Symbol.for("before-all")]: {
          value: [{ type: "BlockComment", value: "inherited", inline: true }],
        },
      });
      Object.setPrototypeOf(lib.CommentArray.prototype, extra);
      try {
        return lib.stringify(array, null, 2);
      } finally {
        Object.setPrototypeOf(lib.CommentArray.prototype, proto);
      }
    };
    expect(write(ours)).toBe(write(theirs));
  });
});
