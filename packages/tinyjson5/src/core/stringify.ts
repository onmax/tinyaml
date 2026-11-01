// JSON5 output. In json5 mode, byte for byte what json5 2.2.3 writes. In the
// lean mode, what the unreleased json5 3 writes: BigInts throw, `quote` must
// be a quote, lone surrogates are escaped, and replacer lists, arrays,
// toJSON5 and toJSON are read once, as JSON.stringify reads them.
import { json5, lean, setMode, v1, type Mode } from "./mode.ts";
import { ESCAPES, isIdContinue, isIdStart } from "./unicode.ts";

export type Replacer = (this: any, key: string, value: any) => any;

export interface StringifyOptions {
  /** A function that alters each value, or a list of the property names to keep. */
  replacer?: Replacer | (string | number)[] | null;
  /** Indentation: a number of spaces (at most 10) or a string (its first 10 characters). */
  space?: string | number | null;
  /** The quote character to use for strings. By default the one that needs fewer escapes. */
  quote?: string | null;
}

/** Writes `value` as JSON5 the way `mode` says. */
export function stringify(value: any, replacer: any, space: any, mode: Mode): string | undefined {
  const outerMode = setMode(mode);
  try {
    return write(value, replacer, space);
  } finally {
    if (outerMode) setMode(outerMode);
  }
}

function write(value: any, replacer: any, space: any): string | undefined {
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
    if (lean && quote != null && quote !== "'" && quote !== '"')
      throw new TypeError(`JSON5: quote must be "'" or '"'`);
  }

  if (typeof replacer === "function") {
    replacerFunc = replacer as Replacer;
  } else if (Array.isArray(replacer)) {
    propertyList = [];
    // JSON.stringify reads a replacer list by index, up to the length it had.
    const list: unknown[] = lean
      ? Array.from({ length: replacer.length }, (_, i) => replacer[i])
      : replacer;
    for (const v of list) {
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

  return serializeProperty("", { "": value });

  function serializeProperty(key: string | number, holder: any): string | undefined {
    let value = holder[key];
    if (value != null) {
      // json5 2.2.3 reads the method twice, to test it and to call it.
      let method = value.toJSON5;
      if (typeof method === "function")
        value = json5 ? value.toJSON5(String(key)) : Reflect.apply(method, value, [String(key)]);
      else if (typeof (method = value.toJSON) === "function")
        value = json5 ? value.toJSON(String(key)) : Reflect.apply(method, value, [String(key)]);
    }
    if (replacerFunc) value = replacerFunc.call(holder, String(key), value);
    if (value instanceof Number) value = Number(value);
    else if (value instanceof String) value = String(value);
    else if (value instanceof Boolean)
      value = json5 ? !!value.valueOf() : Boolean.prototype.valueOf.call(value);
    else if (lean && value instanceof BigInt) value = BigInt.prototype.valueOf.call(value);

    switch (typeof value) {
      case "string":
        return quoteString(value, quote);
      case "number":
        return String(value);
      case "boolean":
        return value ? "true" : "false";
      case "bigint":
        if (lean) throw new TypeError("Do not know how to serialize a BigInt");
        break;
      case "object":
        if (value === null) return "null";
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
    for (let i = 0, length = value.length; i < (lean ? length : value.length); i++) {
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
  // json5 2.2.3 steps through the rest one code unit at a time, so it tests
  // the second half of a surrogate pair on its own and quotes any such key.
  // The lean mode steps by code point.
  for (let i = first > 0xffff ? 2 : 1; i < key.length; i++) {
    const c = lean ? key.codePointAt(i)! : key.charCodeAt(i);
    if (lean ? !isIdContinue(c) : (c >= 0xd800 && c <= 0xdfff) || !isIdContinue(c))
      return quoteString(key, quote);
    if (c > 0xffff) i++;
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
  if (lean && !value.isWellFormed()) plain = false;
  const quoteChar = (quote || (single > double ? '"' : "'")) as string;
  // The lean mode only takes one of the two quotes.
  if (lean || quoteChar === "'" || quoteChar === '"') {
    if (plain && (quoteChar === "'" ? single : double) === 0) return quoteChar + value + quoteChar;
    return quoteChar + escape(value, quoteChar.charCodeAt(0)) + quoteChar;
  }
  // Any other quote goes through json5's own steps: a regular expression made
  // from the option, replaced by whatever the table holds for it.
  const product = escape(value, -1).replace(
    new RegExp(quoteChar, "g"),
    ESCAPES[quoteChar] as string,
  );
  return quoteChar + product + quoteChar;
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
    // A lone surrogate is escaped, as JSON.stringify escapes it: one that
    // doesn't start, or end, a code point above U+FFFF.
    else if (
      lean &&
      (c & 0xf800) === 0xd800 &&
      !(value.codePointAt(c < 0xdc00 ? i : i - 1)! > 0xffff)
    )
      replacement = "\\u" + c.toString(16);
    else if (c >= 32) continue;
    else if (c === 0) {
      // json5 1.0.2 writes "\0" even before a digit, which then reads back as an octal escape.
      const next = value.charCodeAt(i + 1);
      replacement = !v1 && next >= 48 && next <= 57 ? "\\x00" : "\\0";
    } else replacement = ESCAPES[value[i]!] ?? "\\x" + c.toString(16).padStart(2, "0");
    out += value.slice(start, i) + replacement;
    start = i + 1;
  }
  return out + value.slice(start);
}
