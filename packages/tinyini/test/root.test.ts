import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";
import { parse, stringify } from "../src/index.ts";

describe("parse", () => {
  it("reads sections, comments, arrays, quotes and escapes", () => {
    const value = parse(`; comment
# also a comment
name = app
debug = true
level = null
flag
tags[] = a
tags[] = b
quoted = "  padded; \\"in\\" quotes  "
single = 'a "b" ; c'
escaped = a\\;b\\#c\\\\d # comment
[server.http]
port = 8080
[x\\.y]
k = v
`);
    expect(value).toEqual({
      name: "app",
      debug: true,
      level: null,
      flag: true,
      tags: ["a", "b"],
      quoted: '  padded; "in" quotes  ',
      single: 'a "b" ; c',
      escaped: "a;b#c\\d",
      server: { http: { port: "8080" } },
      "x.y": { k: "v" },
    });
    expect(Object.getPrototypeOf(value)).toBe(null);
    expect(Object.getPrototypeOf(value.server.http)).toBe(null);
  });

  it("keeps values in quotes as strings", () => {
    expect(parse(`a = "true"\nb = '1'\nc = 'null'\nd = "x`)).toEqual({
      a: "true",
      b: "1",
      c: "null",
      d: '"x',
    });
  });

  it("takes keys as written, or as JSON strings in double quotes", () => {
    expect(parse(`a;b = 1\n"x = y" = 2\n"k" [] = 3\n'q' = 4`)).toEqual({
      "a;b": "1",
      "x = y": "2",
      k: ["3"],
      "'q'": "4",
    });
  });

  it("nests sections as it reads them, and a section replaces a value", () => {
    const value = parse("[b.c]\nx = 1\n[a]\ny = 2\n[b]\nz = 3\nq = 1\n[b.q]\nw = 4\n[n]\n[n.m]");
    expect(Object.keys(value)).toEqual(["b", "a", "n"]);
    expect(value).toEqual({
      b: { c: { x: "1" }, z: "3", q: { w: "4" } },
      a: { y: "2" },
      n: { m: {} },
    });
    expect(parse("[a\\\\.b]\n[c\\d]")).toEqual({ "a\\": { b: {} }, "c\\d": {} });
  });

  it("collects key[] lines, keeping a value set before them, and lets a plain key replace them", () => {
    expect(parse("a = 1\na[] = 2\na[] = 3\nb[] = 1\nb = 2\nc = 1\nc = 2")).toEqual({
      a: ["1", "2", "3"],
      b: "2",
      c: "2",
    });
  });

  it("drops __proto__ keys and sections", () => {
    const value = parse(
      "__proto__ = x\n[__proto__]\npolluted = yes\n[a.__proto__.b]\nc = 1\n[d]\n__proto__[] = y",
    );
    expect(value).toEqual({ d: {} });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("stringify", () => {
  it("writes values, arrays and sections in ini's layout", () => {
    expect(
      stringify(
        { name: "app", tags: ["a", "b"], server: { http: { port: 8080 } }, "x.y": { k: "v" } },
        { whitespace: true },
      ),
    ).toBe("name = app\ntags[] = a\ntags[] = b\n\n[server.http]\nport = 8080\n\n[x\\.y]\nk = v\n");
  });

  it("quotes what parse would read differently", () => {
    const value = {
      semi: "a;b",
      bool: "true",
      pad: " x ",
      line: "a\nb",
      quote: "'x'",
      slash: "a\\b",
      "k=v": 1,
      "[k]": 2,
      "k[]": 3,
      "": 4,
    };
    const text = stringify(value);
    expect(text).toBe(
      `semi="a;b"\nbool="true"\npad=" x "\nline="a\\nb"\nquote="'x'"\nslash="a\\\\b"\n"k=v"=1\n"[k]"=2\n"k[]"=3\n""=4\n`,
    );
    expect(parse(text)).toEqual({ ...value, "k=v": "1", "[k]": "2", "k[]": "3", "": "4" });
  });

  it("takes align, sort, newline and eol", () => {
    expect(
      stringify(
        { b: 1, aaa: [1], s: { k: "v" } },
        { align: true, sort: true, newline: true, eol: "\r\n" },
      ),
    ).toBe("aaa[] = 1\r\nb     = 1\r\n\r\n[s]\r\n\r\nk = v\r\n");
  });

  it("skips what JSON skips, calls toJSON, writes empty sections and throws on objects in arrays", () => {
    expect(
      stringify({
        u: undefined,
        f: () => 1,
        d: new Date(0),
        list: [undefined, 1],
        empty: {},
        n: { m: {} },
      }),
    ).toBe("d=1970-01-01T00:00:00.000Z\nlist[]=null\nlist[]=1\n\n[empty]\n\n[n.m]\n");
    expect(() => stringify({ a: [{}] })).toThrow(TypeError);
    // With the key JSON.stringify gives it.
    const key = { toJSON: (k: string) => `<${k}>` };
    expect(stringify({ a: key, list: [key], f: Object.assign(() => 1, key) })).toBe(
      "a=<a>\nlist[]=<0>\nf=<f>\n",
    );
    expect(JSON.stringify({ a: key, list: [key], f: Object.assign(() => 1, key) })).toBe(
      '{"a":"<a>","list":["<0>"],"f":"<f>"}',
    );
    // A toJSON getter is read once, as JSON.stringify reads it.
    let reads = 0;
    const once = {
      get toJSON() {
        return reads++ ? undefined : () => "ok";
      },
    };
    expect(stringify({ x: once })).toBe("x=ok\n");
    expect(reads).toBe(1);
  });

  it("leaves the options object alone", () => {
    const options = Object.freeze({ align: true });
    expect(stringify({ a: 1 }, options)).toBe("a = 1\n");
    expect(options).toEqual({ align: true });
  });
});

describe("against scripts/root-spec.ts", () => {
  it("parses and stringifies as the spec says, and round-trips", () => {
    const out = execFileSync(process.execPath, ["scripts/root-fuzz.ts", "20000", "200", "1"], {
      encoding: "utf8",
    });
    expect(out).toMatch(/ round trips: 0 differences$/m);
  });
});
