// A drop-in for jju 1.4.0 (MIT, Copyright (c) 2013 Alex Kocharin): its
// parse, stringify, tokenize, analyze and update, on its own code. Not its
// Node-only utils (a require hook, a JSON.parse patch and a middleware).
import { analyze as analyzeJSON } from "./analyze.js";
import { update as updateJSON } from "./document.js";
import { parse as parseJSON, tokenize as tokenizeJSON } from "./parse.js";
import { stringify as stringifyJSON } from "./stringify.js";

export interface ParseOptions {
  /** What to do with "__proto__" and other keys of Object.prototype: "ignore", "throw" or "replace". */
  reserved_keys?: "ignore" | "throw" | "replace";
  /** What to do with duplicate keys: "ignore", "throw" or "replace". */
  duplicate_keys?: "ignore" | "throw" | "replace";
  /** Make objects with a null prototype. */
  null_prototype?: boolean;
  reviver?: (this: any, key: string, value: any) => any;
  /** "json5" (default), "json" or "cjson". */
  mode?: "json5" | "json" | "cjson";
  /** Keep the parse result's raw tokens, for tokenize. */
  legacy?: boolean;
}

export interface StringifyOptions {
  /** Indentation: a number of spaces or a string. */
  indent?: string | number;
  /** The quote to use for strings. */
  quote?: string;
  /** Quote keys: true, false, or by default only where needed. */
  quote_keys?: boolean;
  /** Escape non-ASCII characters. */
  ascii?: boolean;
  /** "json5" (default), "json" or "cjson". */
  mode?: "json5" | "json" | "cjson";
  /** Don't add a trailing comma. */
  no_trailing_comma?: boolean;
  replacer?: ((this: any, key: string, value: any) => any) | null;
  /** Sort keys: true, or a compare function. */
  sort_keys?: boolean | ((a: string, b: string) => number);
}

export interface Token {
  raw: string;
  type: "whitespace" | "comment" | "key" | "literal" | "separator" | "newline";
  value?: any;
  stack: (string | number)[];
}

export const parse: (
  text: string,
  options?: ParseOptions | ((key: string, value: any) => any),
) => any = parseJSON;
export const stringify: (
  value: any,
  options?: StringifyOptions | ((key: string, value: any) => any) | null,
  indent?: string | number,
) => string = stringifyJSON;
export const tokenize: (text: string, options?: ParseOptions) => Token[] & { data: any } =
  tokenizeJSON;
export const analyze: (
  text: string,
  options?: ParseOptions,
) => {
  has_whitespace: boolean;
  has_comments: boolean;
  has_newlines: boolean;
  has_trailing_comma: boolean;
  indent: string;
  newline: string;
  quote: string;
  quote_keys: boolean;
} = analyzeJSON;
export const update: (
  text: string,
  value: any,
  options?: ParseOptions & StringifyOptions,
) => string = updateJSON;
