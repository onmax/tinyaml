// Values whose methods, getters or proxies run during a call: each entry
// must make the same reads, in the same order, as its original. The fuzzers
// don't generate these.
import { createRequire } from "node:module";
import { describe, expect, it } from "vite-plus/test";
import * as root from "../src/index.ts";
import * as json5 from "../src/json5/index.ts";
import * as json5V1 from "../src/json5-v1/index.ts";

const require = createRequire(import.meta.url);
const main = await import("../.cache/json5-main/lib/index.js").catch(() => undefined);
type Lib = { parse: (...args: any[]) => unknown; stringify: (...args: any[]) => unknown };
const pairs: [string, Lib, Lib][] = [
  ["json5 2.2.3", json5, require("json5")],
  ["json5 1.0.2", json5V1, require("json5-v1")],
  ...(main ? [["json5 main", root, main] as [string, Lib, Lib]] : []),
];

const outcome = (fn: () => unknown) => {
  try {
    return fn();
  } catch (e) {
    return `${(e as Error).name}: ${(e as Error).message}`;
  }
};

describe.each(pairs)("against %s", (_, ours, theirs) => {
  it("writes what a Boolean wrapper's own valueOf returns", () => {
    const make = () => Object.assign(new Boolean(false), { valueOf: () => 42 });
    expect(ours.stringify(make())).toBe(theirs.stringify(make()));
  });

  it("reads an array's length as the original does", () => {
    const make = () => {
      let reads = 0;
      return new Proxy([1], {
        get: (t, k) => (k === "length" ? (reads++ ? 1 : 0) : Reflect.get(t, k)),
      });
    };
    expect(ours.stringify(make())).toBe(theirs.stringify(make()));
  });

  it("converts each replacer list item before reading the next", () => {
    const make = () => {
      const list: unknown[] = [];
      list.push(Object.assign(new String("a"), { toString: () => ((list[1] = "c"), "a") }), "b");
      return list;
    };
    const value = { a: 1, b: 2, c: 3 };
    expect(ours.stringify(value, make() as never)).toBe(theirs.stringify(value, make()));
  });
});

describe.skipIf(!main)("root options", () => {
  it("reads `bigint` as json5 main reads it", () => {
    const make = () => {
      let reads = 0;
      return {
        get bigint() {
          return reads++ ? true : undefined;
        },
      };
    };
    expect(outcome(() => root.parse("9007199254740993", make()))).toEqual(
      outcome(() => main!.parse("9007199254740993", make())),
    );
  });
});
