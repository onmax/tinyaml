import { describe, expect, it } from "vite-plus/test";
import ini, { decode, parse } from "../src/index.ts";
import { gitToIni } from "../scripts/shared.ts";

describe("parse", () => {
  it("reads sections, comments, arrays, quotes, and escapes", () => {
    const value = parse(`; comment
# also a comment
name = app
debug = true
level = null
tags[] = a
tags[] = b
quoted = "  padded  "
escaped = a\\;b # comment
[server.http]
port = 8080
[x\\.y]
k = v
`);
    expect(value).toEqual({
      name: "app",
      debug: true,
      level: null,
      tags: ["a", "b"],
      quoted: "  padded  ",
      escaped: "a;b",
      server: { http: { port: "8080" } },
      "x.y": { k: "v" },
    });
    expect(Object.getPrototypeOf(value)).toBe(null);
    expect(Object.getPrototypeOf(value.server.http)).toBe(null);
    expect(ini.decode).toBe(decode);
  });

  it("reads single-quoted values as JSON, as ini does", () => {
    expect(parse("a = '1'\nb = 'x'\nc = '[1, 2]'")).toEqual({ a: 1, b: "x", c: [1, 2] });
  });

  it("reads repeated keys as arrays with bracketedArray: false", () => {
    expect(parse("a=1\na=2\nb=3", { bracketedArray: false })).toEqual({ a: ["1", "2"], b: "3" });
  });

  it("does not attach __proto__", () => {
    const value = parse("__proto__ = x\n[__proto__]\npolluted = yes\n[a]\n__proto__[] = y");
    expect(Object.keys(value)).toEqual(["a"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("reads a .gitconfig the way pkg-types does", () => {
    const text =
      '[user]\n\tname = Ada\n[remote "origin"]\n\turl = git@github.com:a/b.git\n[branch "v1.2"]\n\tremote = origin\n';
    expect(parse(gitToIni(text))).toEqual({
      user: { name: "Ada" },
      remote: { origin: { url: "git@github.com:a/b.git" } },
      branch: { "v1.2": { remote: "origin" } },
    });
  });

  it("throws where ini throws", () => {
    expect(() => parse("'null' = x")).toThrow(TypeError);
    expect(() => parse("a = null\n[a.b.c]\nx = 1")).toThrow(
      "Cannot convert undefined or null to object",
    );
  });
});
