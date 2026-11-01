import { parse as parseWith, type Reviver } from "./core/parse.ts";
import {
  stringify as stringifyWith,
  type Replacer,
  type StringifyOptions,
} from "./core/stringify.ts";

export type { Reviver, Replacer, StringifyOptions };

const MODE = {};

export function parse<T = any>(text: string, reviver?: Reviver | null): T {
  return parseWith(text, reviver, MODE) as T;
}

export function stringify(value: any, replacer?: any, space?: any): string {
  return stringifyWith(value, replacer, space, MODE) as string;
}

const JSON5: { parse: typeof parse; stringify: typeof stringify } = { parse, stringify };
export default JSON5;
