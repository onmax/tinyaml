// tinyjson5's own API: JSON5 as the unreleased json5 3 reads and writes it,
// with JSON.parse's and JSON.stringify's semantics where json5 2 differs,
// and a `jsonc` option for strict JSON with comments.
import { parse as parseWith, type ParseOptions, type Reviver } from "./core/parse.ts";
import {
  stringify as stringifyWith,
  type Replacer,
  type StringifyOptions,
} from "./core/stringify.ts";

export type { ParseOptions, Reviver, Replacer, StringifyOptions };

const MODE = {};

/**
 * Parses a JSON5 string, constructing the JavaScript value or object described
 * by the string. Invalid input throws a SyntaxError with `lineNumber` and
 * `columnNumber`.
 */
export function parse<T = any>(text: string, reviver?: Reviver | null, options?: ParseOptions): T;
export function parse<T = any>(text: string, options: ParseOptions): T;
export function parse<T = any>(text: string, reviver?: any, options?: ParseOptions): T {
  if (reviver != null && typeof reviver === "object" && !Array.isArray(reviver)) {
    options = reviver;
    reviver = undefined;
  }
  // Read as json5 3 reads it: tested, then checked, then taken.
  let bigint = false;
  if (options != null && options.bigint != null) {
    if (typeof options.bigint !== "boolean") throw new TypeError("JSON5: bigint must be a boolean");
    bigint = options.bigint;
  }
  return parseWith(text, reviver, MODE, { bigint, jsonc: options?.jsonc }) as T;
}

/** Converts a JavaScript value to a JSON5 string. */
export function stringify(
  value: any,
  replacer?: Replacer | null,
  space?: string | number | null,
): string;
export function stringify(
  value: any,
  replacer: (string | number)[],
  space?: string | number | null,
): string;
export function stringify(value: any, options: StringifyOptions): string;
export function stringify(value: any, replacer?: any, space?: any): string {
  return stringifyWith(value, replacer, space, MODE) as string;
}

const JSON5: { parse: typeof parse; stringify: typeof stringify } = { parse, stringify };
export default JSON5;
