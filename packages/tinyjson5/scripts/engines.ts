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
  /** The library's identifier tests, which the random values' characters must agree with. */
  util?: () => Promise<Record<"isIdStartChar" | "isIdContinueChar", (c: string) => boolean>>;
}

const require = createRequire(import.meta.url);
const cache = (path: string) =>
  pathToFileURL(new URL(`../.cache/${path}`, import.meta.url).pathname).href;

export const ENGINES: Record<string, Engine> = {
  json5: {
    entry: "tinyjson5/json5",
    library: "json5 2.2.3",
    ours: () => import("../src/json5/index.ts"),
    theirs: async () => require("json5"),
    util: async () => require("json5/lib/util.js"),
  },
};

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
