// JSON5 output, byte for byte what json5 2.2.3 writes.
import { isIdContinue, isIdStart } from "./unicode.ts";

export type Replacer = (this: any, key: string, value: any) => any;

export interface StringifyOptions {
  /** A function that alters each value, or a list of the property names to keep. */
  replacer?: Replacer | (string | number)[] | null;
  /** Indentation: a number of spaces (at most 10) or a string (its first 10 characters). */
  space?: string | number | null;
  /** The quote character to use for strings. By default the one that needs fewer escapes. */
  quote?: string | null;
}

// json5 builds this table as an object literal and indexes it with the quote
// option, so an unusual `quote` behaves exactly as it does there.
const REPLACEMENTS: Record<string, string> = {
  "'": "\\'",
  '"': '\\"',
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\v": "\\v",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

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
  const stack: object[] = [];
  let indent = "";
  let propertyList: string[] | undefined;
  let replacerFunc: Replacer | undefined;
  let gap = "";
  let quote: unknown;

  if (replacer != null && typeof replacer === "object" && !Array.isArray(replacer)) {
    space = replacer.space;
    quote = replacer.quote;
    replacer = replacer.replacer;
  }

  if (typeof replacer === "function") {
    replacerFunc = replacer as Replacer;
  } else if (Array.isArray(replacer)) {
    propertyList = [];
    for (const v of replacer as unknown[]) {
      let item: string | undefined;
      if (typeof v === "string") item = v;
      else if (typeof v === "number" || v instanceof String || v instanceof Number)
        item = String(v);
      if (item !== undefined && !propertyList.includes(item)) propertyList.push(item);
    }
  }

  if (space instanceof Number) space = Number(space);
  else if (space instanceof String) space = String(space);

  if (typeof space === "number") {
    if (space > 0) gap = " ".repeat(Math.min(10, Math.floor(space)));
  } else if (typeof space === "string") {
    gap = space.slice(0, 10);
  }

  return serializeProperty("", { "": value }) as string;

  function serializeProperty(key: string | number, holder: any): string | undefined {
    let value = holder[key];
    if (value != null) {
      if (typeof value.toJSON5 === "function") value = value.toJSON5(String(key));
      else if (typeof value.toJSON === "function") value = value.toJSON(String(key));
    }
    if (replacerFunc) value = replacerFunc.call(holder, String(key), value);

    switch (typeof value) {
      case "string":
        return quoteString(value, quote);
      case "number":
        return String(value);
      case "boolean":
        return value ? "true" : "false";
      case "object":
      case "function":
        if (value === null) return "null";
        if (value instanceof Number) return String(Number(value));
        if (value instanceof String) return quoteString(String(value), quote);
        if (value instanceof Boolean) return value.valueOf() ? "true" : "false";
        if (typeof value === "object")
          return Array.isArray(value) ? serializeArray(value) : serializeObject(value);
    }
    return undefined;
  }

  function serializeObject(value: Record<string, unknown>): string {
    if (stack.includes(value)) throw TypeError("Converting circular structure to JSON5");
    stack.push(value);
    const stepback = indent;
    indent += gap;
    let out = "";
    for (const key of propertyList ?? Object.keys(value)) {
      const property = serializeProperty(key, value);
      if (property === undefined) continue;
      const member = serializeKey(key, quote) + (gap === "" ? ":" : ": ") + property;
      if (gap === "") out += (out === "" ? "{" : ",") + member;
      else out += (out === "" ? "{\n" : ",\n") + indent + member;
    }
    stack.pop();
    indent = stepback;
    if (out === "") return "{}";
    return gap === "" ? out + "}" : out + ",\n" + stepback + "}";
  }

  function serializeArray(value: unknown[]): string {
    if (stack.includes(value)) throw TypeError("Converting circular structure to JSON5");
    stack.push(value);
    const stepback = indent;
    indent += gap;
    let out = "";
    for (let i = 0; i < value.length; i++) {
      const item = serializeProperty(i, value) ?? "null";
      if (gap === "") out += (i === 0 ? "[" : ",") + item;
      else out += (i === 0 ? "[\n" : ",\n") + indent + item;
    }
    stack.pop();
    indent = stepback;
    if (out === "") return "[]";
    return gap === "" ? out + "]" : out + ",\n" + stepback + "]";
  }
}

function serializeKey(key: string, quote: unknown): string {
  if (key.length === 0) return quoteString(key, quote);
  const first = key.codePointAt(0)!;
  if (!isIdStart(first)) return quoteString(key, quote);
  // json5 steps through the rest one code unit at a time, so it tests the
  // second half of a surrogate pair on its own and quotes any such key.
  for (let i = first > 0xffff ? 2 : 1; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if ((c >= 0xd800 && c <= 0xdfff) || !isIdContinue(c)) return quoteString(key, quote);
  }
  return key;
}

function quoteString(value: string, quote: unknown): string {
  let single = 0;
  let double = 0;
  let plain = true;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 39) single++;
    else if (c === 34) double++;
    else if (c < 32 || c === 92 || c === 0x2028 || c === 0x2029) plain = false;
  }
  const quoteChar = quote || (single > double ? '"' : "'");
  if (quoteChar === "'" || quoteChar === '"') {
    if (plain && (quoteChar === "'" ? single : double) === 0) return quoteChar + value + quoteChar;
    return quoteChar + escape(value, quoteChar.charCodeAt(0)) + quoteChar;
  }
  // Any other quote goes through json5's own steps: a regular expression made
  // from the option, replaced by whatever the table holds for it.
  const product = escape(value, -1).replace(
    new RegExp(quoteChar as string, "g"),
    REPLACEMENTS[quoteChar as string] as string,
  );
  return (quoteChar as string) + product + (quoteChar as string);
}

function escape(value: string, quote: number): string {
  let out = "";
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    let replacement: string;
    if (c === quote) replacement = quote === 39 ? "\\'" : '\\"';
    else if (c === 92) replacement = "\\\\";
    else if (c === 0x2028) replacement = "\\u2028";
    else if (c === 0x2029) replacement = "\\u2029";
    else if (c >= 32) continue;
    else if (c === 0) {
      const next = value.charCodeAt(i + 1);
      replacement = next >= 48 && next <= 57 ? "\\x00" : "\\0";
    } else replacement = REPLACEMENTS[value[i]!] ?? "\\x" + c.toString(16).padStart(2, "0");
    out += value.slice(start, i) + replacement;
    start = i + 1;
  }
  return out + value.slice(start);
}
