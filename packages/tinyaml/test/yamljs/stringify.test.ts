import { createRequire } from "node:module";
import { describe, expect, it } from "vite-plus/test";
import YAML, { dump, DumpException, stringify } from "../../src/yamljs/index.ts";

const yamljs = createRequire(import.meta.url)("yamljs") as {
  stringify(...args: unknown[]): string;
};

class Point {
  x = 1;
  y = 2;
}

const value = {
  name: "app",
  version: "1.2.3",
  port: 8080,
  ratio: -0.5,
  big: 1e21,
  inf: Infinity,
  nan: NaN,
  on: true,
  none: null,
  missing: undefined,
  when: new Date(Date.UTC(2001, 0, 2)),
  strings: ["", "0", "007", "1e3", "yes", "Null", "~", "2001-12-14", "a: b", "- x", "it's", "@x"],
  escapes: ["tab\there", "line\nbreak", "\0\x07\x1b\x1f", "\x85 \xa0 \u2028", '\\ "', "\xc2\x85"],
  nested: { list: [[1, [2]], {}, [], { a: { b: { c: 1 } } }], empty: {} },
  point: new Point(),
};

describe("stringify", () => {
  it("matches yamljs byte for byte at every inline level and indent", () => {
    for (const inline of [undefined, null, -1, 0, 1, 2, 3, 4, 10, 1.5])
      for (const indent of [undefined, null, 0, 1, 2, 4, 2.5])
        expect(stringify(value, inline, indent), `${inline} ${indent}`).toBe(
          yamljs.stringify(value, inline, indent),
        );
  });

  it("writes block YAML with four spaces by default", () => {
    expect(stringify({ a: [1, "two", { b: null }], c: {} })).toBe(
      "a:\n    - 1\n    - two\n    - {b: null}\nc: {}\n",
    );
  });

  it("passes inline objects to an objectEncoder", () => {
    const encoder = (v: object) => (v instanceof Point ? `!point ${v.x},${v.y}` : null);
    for (const inline of [0, 1, 2])
      expect(stringify({ p: new Point(), q: [new Point()] }, inline, 2, false, encoder)).toBe(
        yamljs.stringify({ p: new Point(), q: [new Point()] }, inline, 2, false, encoder),
      );
  });

  it("walks arrays with holes and inherited keys as yamljs does", () => {
    const child = Object.assign(Object.create({ inherited: 1 }) as object, { own: 2 });
    const holes = [1, , 3]; // oxlint-disable-line no-sparse-arrays
    for (const input of [child, holes, { child, holes }, Object.create({ only: 1 }) as object])
      expect(stringify(input, 3, 2)).toBe(yamljs.stringify(input, 3, 2));
  });

  it("reads an array's length once, as yamljs does", () => {
    // Its first item's getter pushes a second item, which yamljs never reads.
    const array = () => {
      const v: unknown[] = [];
      Object.defineProperty(v, 0, {
        enumerable: true,
        get: () => (v.length === 1 && v.push("later"), "first"),
      });
      return v;
    };
    for (const inline of [undefined, 0])
      expect(stringify(array(), inline)).toBe(yamljs.stringify(array(), inline));
    expect(stringify(array())).toBe("- first\n");
    expect(stringify(array(), 0)).toBe("[first]");
  });

  it("has dump and the default export as aliases", () => {
    expect(dump).toBe(stringify);
    expect(YAML.stringify).toBe(stringify);
    expect(YAML.dump({ a: 1 })).toBe("a: 1\n");
    expect(String(new DumpException("x"))).toBe("<DumpException> x");
  });
});
