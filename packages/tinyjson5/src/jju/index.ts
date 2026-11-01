// A drop-in for jju 1.4.0 (MIT, Copyright (c) 2013 Alex Kocharin): its
// parse, stringify, tokenize, analyze and update, on its own code. Not its
// Node-only utils (a require hook, a JSON.parse patch and a middleware).
import { analyze as analyzeJSON } from "./analyze.js";
import { update as updateJSON } from "./document.js";
import { parse as parseJSON, tokenize as tokenizeJSON } from "./parse.js";
import { stringify as stringifyJSON } from "./stringify.js";

export type Reviver = (this: any, key: string, value: any) => any;
export type Replacer = ((this: any, key: string, value: any) => any) | (string | number)[];

export interface ParseOptions {
  /** What to do with keys an empty object has, such as hasOwnProperty and __proto__. Default "ignore". */
  reserved_keys?: "ignore" | "throw" | "replace";
  /** Make objects with Object.create(null). Default true with reserved_keys "replace", else false. */
  null_prototype?: boolean;
  reviver?: Reviver;
  /** "json" to throw on anything but strict JSON; "cjson" for JSON with comments. */
  mode?: string;
  [option: string]: unknown;
}

export interface StringifyOptions {
  /** Output ASCII only. Default false. */
  ascii?: boolean;
  /** Indentation, as JSON.stringify takes it, or a boolean. Default "\t". */
  indent?: string | number | boolean;
  /** The quote: "'" (default) or '"'. */
  quote?: string;
  /** Quote every key. Default false. */
  quote_keys?: boolean;
  /** Sort object keys, alphabetically or with a compare function. Default false. */
  sort_keys?: boolean | ((a: string, b: string) => number);
  replacer?: Replacer | null;
  /** Never write a trailing comma. Default false. */
  no_trailing_comma?: boolean;
  /** "json" for strict JSON output. */
  mode?: string;
  [option: string]: unknown;
}

export interface Token {
  raw: string;
  type: "whitespace" | "comment" | "key" | "literal" | "separator" | "newline";
  value?: any;
  stack: (string | number)[];
}

export interface Analysis {
  has_whitespace: boolean;
  has_comments: boolean;
  has_newlines: boolean;
  has_trailing_comma: boolean;
  indent: string;
  newline: string;
  quote: string;
  quote_keys: boolean;
}

/** Parses JSON5, or with `mode` JSON or CJSON. */
export const parse: (text: string, options?: ParseOptions | Reviver | null) => any = parseJSON;
/** Writes JSON5, or with `mode` JSON; undefined for what JSON can't hold, as JSON.stringify does. */
export const stringify: {
  (value: any, options?: StringifyOptions | null): string | undefined;
  (value: any, replacer?: Replacer | null, indent?: string | number | boolean): string | undefined;
} = stringifyJSON;
/** The tokens of a text, with its value as `data`. */
export const tokenize: (text: string, options?: ParseOptions) => Token[] & { data: any } =
  tokenizeJSON;
/** How a text, or its tokens, is written: indent, quotes, comments and so on. */
export const analyze: (text: string | Token[], options?: ParseOptions) => Analysis = analyzeJSON;
/** The text with its value changed to `value`, keeping its formatting and comments. */
export const update: (
  text: string,
  value: any,
  options?: ParseOptions & StringifyOptions,
) => string = updateJSON;
