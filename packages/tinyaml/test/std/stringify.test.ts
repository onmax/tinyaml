import * as std from "@std/yaml";
import { describe, expect, it } from "vite-plus/test";
import { stringify, type StringifyOptions } from "../../src/std/index.ts";

// Same text as @std/yaml, or the same error type and message.
function same(value: unknown, options?: StringifyOptions) {
  const run = (fn: typeof stringify) => {
    try {
      return fn(value, options);
    } catch (error) {
      return `${(error as Error).name}: ${(error as Error).message}`;
    }
  };
  expect(run(stringify)).toBe(run(std.stringify));
}

const tricky = [
  "",
  "yes",
  "No",
  "~",
  "1_000",
  "0x1F",
  "1:30",
  "2001-01-01",
  "<<",
  "a:b",
  "a#b",
  "-a",
  " lead",
  "trail ",
  "x\ny\n",
  "\n lead",
  "tab\there",
  "😀",
  "\x03\x7F\x85\xA0 ﻿",
  "it's",
  "lorem ipsum dolor sit amet ".repeat(5),
];

describe("stringify", () => {
  it("writes scalars as std does", () => {
    for (const s of tricky) {
      same(s);
      same({ [s]: s });
      same([s], { quoteStyle: '"', compatMode: false, lineWidth: 20 });
    }
    same([1, -1, 1.5, -0, NaN, Infinity, -Infinity, 1e21, true, null, new Date(0)]);
  });

  it("applies styles", () => {
    same([10, -10, 1.5, true, null, NaN], {
      styles: {
        "!!int": "hexadecimal",
        "!!bool": "uppercase",
        "!!null": "camelcase",
        "!!float": "uppercase",
      },
    });
    same(5, { styles: { "!!int": "camelcase" } });
  });

  it("writes tagged values as !<tag> value", () => {
    same({ bin: new Uint8Array([1, 2, 3]), empty: new Uint8Array(), long: new Uint8Array(90) });
    same({ re: /ab+c/gi, nothing: undefined }, { schema: "extended" });
  });

  it("writes shared objects with breadth-first anchors", () => {
    const shared = { a: 1 };
    const list = [shared];
    same({ x: list, y: { z: shared }, w: list });
    same({ x: shared, y: shared }, { useAnchors: false });
  });

  it("supports every layout option", () => {
    const value = { b: [1, [2, 3], { c: "d" }], a: { e: [], f: {} }, g: "long ".repeat(30) };
    for (const options of [
      { indent: 4 },
      { indent: 12 },
      { arrayIndent: false },
      { flowLevel: 0 },
      { flowLevel: 1, condenseFlow: true },
      { sortKeys: true },
      { sortKeys: (a: string, b: string) => b.localeCompare(a) },
      { lineWidth: -1 },
      { lineWidth: 20 },
    ] satisfies StringifyOptions[])
      same(value, options);
  });

  it("throws or skips what std can't write", () => {
    same({ f() {} });
    same({ f() {}, u: undefined, s: Symbol("s"), ok: 1 }, { skipInvalid: true });
    same([undefined]);
    same(null, { schema: "failsafe" });
    same({ a: 1 }, { sortKeys: "yes" as never });
    same(5, { styles: { "!!int": "bogus" as never } });
  });
});
