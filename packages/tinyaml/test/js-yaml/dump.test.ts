import * as jsYaml from "js-yaml";
import { describe, expect, it } from "vite-plus/test";
import { mulberry32 } from "../../scripts/support.ts";
import { dump, load } from "../../src/js-yaml/index.ts";

const tricky = [
  "",
  " ",
  "yes",
  "No",
  "on",
  "~",
  "null",
  "true",
  "012",
  "0x1F",
  "1_000",
  "1:30",
  ".inf",
  ".NaN",
  "1e3",
  "-0",
  "2024-01-01",
  "2024-02-30",
  "2001-12-14t21:59:43.10-05:00",
  "<<",
  "=",
  "---",
  "...",
  "- a",
  "? a",
  ": a",
  "a: b",
  "a #b",
  "a#b",
  "#a",
  "@a",
  "`a",
  "%a",
  "!a",
  "&a",
  "*a",
  "|",
  ">",
  "'",
  '"',
  "a\nb",
  "a\n",
  "a\n\n",
  "\n",
  " a\nb",
  "tab\tx",
  " ",
  "\x7F",
  "\x00",
  "é",
  "😀",
  "key: value",
  "[a]",
  "{a}",
  "a,b",
  " lead",
  "trail ",
];

function value(next: () => number, depth: number): unknown {
  const r = next();
  if (depth > 3 || r < 0.45) {
    const pick = Math.floor(next() * 8);
    if (pick === 0) return null;
    if (pick === 1) return next() < 0.5;
    if (pick === 2) return Math.floor(next() * 2000) - 1000;
    if (pick === 3)
      return [0.5, -1.25, 1e21, 1e-7, NaN, Infinity, -Infinity, -0][Math.floor(next() * 8)];
    return tricky[Math.floor(next() * tricky.length)];
  }
  if (r < 0.7) return Array.from({ length: Math.floor(next() * 4) }, () => value(next, depth + 1));
  const object: Record<string, unknown> = {};
  for (let i = Math.floor(next() * 4); i > 0; i--) {
    object[tricky[Math.floor(next() * tricky.length)]!] = value(next, depth + 1);
  }
  return object;
}

describe("dump", () => {
  it("matches js-yaml 4 byte for byte on random values", () => {
    const next = mulberry32(42);
    for (let i = 0; i < 5000; i++) {
      const input = value(next, 0);
      for (const indent of [2, 4]) {
        expect(dump(input, { indent }), JSON.stringify(input)).toBe(jsYaml.dump(input, { indent }));
      }
    }
  });

  it("writes output that loads back to the same value", () => {
    const next = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const input = { root: value(next, 0) };
      expect(load(dump(input))).toEqual(jsYaml.load(jsYaml.dump(input)));
    }
  });

  it("turns shared references and cycles into anchors", () => {
    const shared = { a: 1 };
    const cyclic: Record<string, unknown> = { name: "x" };
    cyclic.self = cyclic;
    for (const input of [{ x: shared, y: shared }, cyclic, [shared, [shared]]]) {
      expect(dump(input)).toBe(jsYaml.dump(input));
    }
    const twice = { x: shared, y: shared };
    expect(dump(twice, { noRefs: true })).toBe(jsYaml.dump(twice, { noRefs: true }));
  });

  it("supports sortKeys and skipInvalid, and rejects invalid values", () => {
    const input = { b: 1, a: { d: () => 1, c: 2 }, u: undefined };
    expect(dump(input, { sortKeys: true, skipInvalid: true })).toBe(
      jsYaml.dump(input, { sortKeys: true, skipInvalid: true }),
    );
    expect(() => dump({ f: () => 1 })).toThrow(expect.objectContaining({ name: "YAMLException" }));
    expect(dump(undefined)).toBe("");
  });
});
