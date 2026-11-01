// Values whose methods, getters or proxies run during a call: each entry
// must make the same reads, in the same order, as its original. The fuzzers
// don't generate these.
import { createRequire } from "node:module";
import { describe, expect, it } from "vite-plus/test";
import * as root from "../src/index.ts";
import * as json5 from "../src/json5/index.ts";
import * as json5V1 from "../src/json5-v1/index.ts";

const require = createRequire(import.meta.url);
// json5's main branch, which `pnpm json5:main:fetch` puts in .cache; the
// path is built so the typecheck doesn't need it.
const mainPath = new URL("../.cache/json5-main/lib/index.js", import.meta.url).href;
const main: Lib | undefined = await import(mainPath).catch(() => undefined);
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

  it("deletes what the reviver drops as the original does, when it can't be deleted", () => {
    for (const text of ["[0]", "{a: 0}"]) {
      const lock = function (this: any, key: string, value: unknown) {
        if (key === "") return value;
        Object.defineProperty(this, key, { configurable: false });
        return undefined;
      };
      expect(
        outcome(() => ours.parse(text, lock)),
        text,
      ).toEqual(outcome(() => theirs.parse(text, lock)));
    }
  });

  it("parses text whose toString parses too, as the original does", () => {
    for (const inner of ['"\\xA', '"\\u12', "{\\u0", "0"])
      for (const outer of ["[", '"a', "{a:1}"]) {
        const text = (lib: Lib) => ({
          toString() {
            outcome(() => lib.parse(inner));
            return outer;
          },
        });
        expect(
          outcome(() => ours.parse(text(ours) as never)),
          `${inner} ${outer}`,
        ).toEqual(outcome(() => theirs.parse(text(theirs))));
      }
  });
});

describe("json5-v1 replacer lists", () => {
  it("iterates them as Babel's for...of does, looking up next on every step", () => {
    const make = () => {
      const list = ["a", "b"];
      const values = list.values();
      const iterator = {
        next() {
          iterator.next = () => ({ done: true, value: undefined });
          return values.next();
        },
      };
      return Object.assign(list, { [Symbol.iterator]: () => iterator });
    };
    const value = { a: 1, b: 2 };
    expect(json5V1.stringify(value, make())).toBe(require("json5-v1").stringify(value, make()));
  });
});

describe.skipIf(!main)("root options", () => {
  it("keeps a call's jsonc option when the text's toString parses without it", () => {
    const text = { toString: () => (root.parse("0"), "{a:1}") };
    expect(() => root.parse(text as never, { jsonc: true })).toThrow(SyntaxError);
  });

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
