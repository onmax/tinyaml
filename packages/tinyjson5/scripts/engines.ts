// Each tinyjson5 entry the differential scripts test, next to the library it
// must match. Scripts take the entry's name as an argument, `json5` by default.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export interface JSON5Like {
  parse: (text: string, reviver?: any) => unknown;
  stringify: (value: unknown, replacer?: any, space?: any) => string | undefined;
}

export interface Engine {
  /** The entry, as users import it. */
  entry: string;
  /** The library it replaces, with its version. */
  library: string;
  ours: () => Promise<JSON5Like>;
  theirs: () => Promise<JSON5Like>;
  /** False when only values and accept/reject are comparable, not error messages. */
  errors?: boolean;
  /** The library's identifier tests, which the random values' characters must agree with. */
  util?: () => Promise<Record<"isIdStartChar" | "isIdContinueChar", (c: string) => boolean>>;
}

const require = createRequire(import.meta.url);
const cache = (path: string) =>
  pathToFileURL(new URL(`../.cache/${path}`, import.meta.url).pathname).href;

export const ENGINES: Record<string, Engine> = {
  // json5 1.0.2 tests the end of input as the string "undefined", so a hex
  // number that ends the input makes it append "undefined" until the string
  // is too long, which takes seconds. The stand-in throws that RangeError as
  // soon as isHexDigit sees the end five times in a row: escapes ask at most
  // four times, and only that loop asks more.
  "json5-v1": {
    entry: "tinyjson5/json5-v1",
    library: "json5 1.0.2",
    ours: () => import("../src/json5-v1/index.ts"),
    theirs: async () => {
      const util = require("json5-v1/lib/util.js");
      const isHexDigit = util.isHexDigit;
      let ends = 0;
      util.isHexDigit = (c: string | undefined) => {
        ends = c === undefined ? ends + 1 : 0;
        if (ends > 4) {
          ends = 0;
          throw new RangeError("Invalid string length");
        }
        return isHexDigit(c);
      };
      const json5 = require("json5-v1");
      return {
        parse: (text: string, reviver?: any) => ((ends = 0), json5.parse(text, reviver)),
        stringify: json5.stringify,
      };
    },
    util: async () => require("json5-v1/lib/util.js"),
  },
  // The root follows json5's unreleased main branch, which `pnpm json5:main:fetch` puts in .cache.
  root: {
    entry: "tinyjson5",
    library: "json5 main (6d21f2f)",
    ours: () => import("../src/index.ts"),
    theirs: () => import(cache("json5-main/lib/index.js")),
    util: () =>
      import(cache("json5-main/lib/util.js")).then((util) => ({
        isIdStartChar: (c: string) => util.isIdStartChar(c, c.codePointAt(0)),
        isIdContinueChar: (c: string) => util.isIdContinueChar(c, c.codePointAt(0)),
      })),
  },
  // The root's `bigint` option, against json5 main's, with a reviver that
  // records every call, so both walk the result the same way.
  "root-bigint": {
    entry: "tinyjson5 { bigint: true } with a reviver",
    library: "json5 main (6d21f2f)",
    ours: () => import("../src/index.ts").then(withOptions),
    theirs: () => import(cache("json5-main/lib/index.js")).then(withOptions),
  },
  // The root's `jsonc` option against jsonc-parser: input parses when
  // jsonc-parser reports no error with trailing commas off, to what JSON.parse
  // makes of it without the comments.
  jsonc: {
    entry: "tinyjson5 { jsonc: true }",
    library: "jsonc-parser 3.3.1 strict",
    errors: false,
    ours: async () => {
      const { parse, stringify } = await import("../src/index.ts");
      return { parse: (text: string) => parse(text, { jsonc: true }), stringify };
    },
    theirs: async () => {
      const jsonc = require("jsonc-parser") as typeof import("jsonc-parser");
      return {
        parse(text: string) {
          const errors: import("jsonc-parser").ParseError[] = [];
          jsonc.parse(text, errors, { allowTrailingComma: false, allowEmptyContent: false });
          if (errors.length) throw new SyntaxError(jsonc.printParseErrorCode(errors[0]!.error));
          return JSON.parse(jsonc.stripComments(text));
        },
        stringify: JSON.stringify,
      };
    },
  },
  json5: {
    entry: "tinyjson5/json5",
    library: "json5 2.2.3",
    ours: () => import("../src/json5/index.ts"),
    theirs: async () => require("json5"),
    util: async () => require("json5/lib/util.js"),
  },
};

// parse(text) as parse(text, reviver, { bigint: true }) with a reviver that
// deletes some keys, replaces others, and returns its log with the value.
function withOptions(lib: JSON5Like): JSON5Like {
  return {
    parse(text: string) {
      const log: string[] = [];
      const value = (lib.parse as (t: string, r: unknown, o: unknown) => unknown)(
        text,
        function (this: unknown, key: string, value: unknown) {
          log.push(`${key}:${typeof value}`);
          if (key === "a") return undefined;
          if (typeof value === "bigint") return `${value}n`;
          return value;
        },
        { bigint: true },
      );
      return { value, log };
    },
    stringify: lib.stringify,
  };
}

/** The engine named by the first argument that isn't a number or a flag. */
export async function engineFromArgs(): Promise<
  Engine & { name: string; o: JSON5Like; t: JSON5Like }
> {
  const name = process.argv.slice(2).find((a) => !/^(-|\d)/.test(a)) ?? "json5";
  const engine = ENGINES[name];
  if (!engine) throw new Error(`unknown engine ${name}; one of ${Object.keys(ENGINES).join(", ")}`);
  return { ...engine, name, o: await engine.ours(), t: await engine.theirs() };
}

/** Numeric arguments, in order. */
export const numbers = (): number[] =>
  process.argv
    .slice(2)
    .filter((a) => /^\d/.test(a))
    .map(Number);

export { cache };
