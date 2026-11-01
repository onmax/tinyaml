// Each entry in package.json's exports loads and exports the names its
// original does, and its default export holds the same functions. Under
// test:dist, these are the built files npm ships.
import { describe, expect, it } from "vite-plus/test";

const INI = ["decode", "default", "encode", "parse", "safe", "stringify", "unsafe"];
const ONE_INI = ["TokenTypes", "default", "parse_to_json", "parse_to_uint32array", "version"];
const entries: [string, () => Promise<Record<string, any>>, string[]][] = [
  ["tinyini", () => import("../src/index.ts"), ["parse", "stringify"]],
  ["tinyini/ini", () => import("../src/ini/index.ts"), INI],
  ["tinyini/ini-v2", () => import("../src/ini-v2/index.ts"), INI],
  ["tinyini/ini-v1", () => import("../src/ini-v1/index.ts"), INI],
  ["tinyini/one-ini", () => import("../src/one-ini/index.ts"), ONE_INI],
  ["tinyini/one-ini-v0.1", () => import("../src/one-ini-v0.1/index.ts"), ONE_INI],
];

describe("exports", () => {
  for (const [name, load, names] of entries)
    it(name, async () => {
      const mod = await load();
      expect(Object.keys(mod).sort()).toEqual(names);
      for (const [key, value] of Object.entries(mod.default ?? {})) expect(value).toBe(mod[key]);
    });
});
