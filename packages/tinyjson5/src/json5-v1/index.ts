// A drop-in for json5 1.0.2: the same calls, options, output and errors.
import { parse as parseWith, type Reviver } from "../core/parse.ts";
import {
  stringify as stringifyWith,
  type Replacer,
  type StringifyOptions,
} from "../core/stringify.ts";

export type { Reviver, Replacer, StringifyOptions };

const MODE = { v1: true };

/**
 * Parses a JSON5 string, constructing the JavaScript value or object described
 * by the string.
 */
export function parse<T = any>(text: string, reviver?: Reviver | null): T {
  return parseWith(text, reviver, MODE) as T;
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
