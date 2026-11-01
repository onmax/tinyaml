// A one-pass JSON5 parser over character codes. In json5 mode it accepts and
// rejects the same inputs as json5 2.2.3, builds the same values, and reports
// errors at the same line and column with the same message. In the lean mode
// it follows the unreleased json5 3 instead: no warnings, a reviver that
// works as JSON.parse's does, line terminators as ECMAScript has them in
// error positions, and the `bigint` and `jsonc` options.
import { json5, lean, setMode, type Mode } from "./mode.ts";
import { formatChar, isIdContinue, isIdStart } from "./unicode.ts";

export type Reviver = (this: any, key: string, value: any) => any;

export interface ParseOptions {
  /** Return integers outside the safe range as BigInts. */
  bigint?: boolean;
  /** Accept only JSON with comments: no JSON5 syntax, trailing commas, or extra whitespace. */
  jsonc?: boolean;
}

let src = "";
let pos = 0;
let len = 0;
// The lean mode's options, for the call in progress.
let bigint: boolean | undefined = false;
let jsonc: boolean | undefined = false;

/** Parses `text` the way `mode` says. */
export function parse(
  text: string,
  reviver: Reviver | null | undefined,
  mode: Mode,
  options?: ParseOptions,
): unknown {
  const outerMode = setMode(mode);
  try {
    if (lean) {
      bigint = options?.bigint;
      jsonc = options?.jsonc;
    }
    src = String(text);
    pos = 0;
    len = src.length;
    let root: unknown;
    try {
      root = parseText();
    } finally {
      src = "";
    }
    if (typeof reviver === "function") return internalize({ "": root }, "", reviver);
    return root;
  } finally {
    if (outerMode) setMode(outerMode);
  }
}

function parseText(): unknown {
  // Open containers, innermost last. `parent` and `inArray` mirror its top.
  const stack: (Record<string, unknown> | unknown[])[] = [];
  let parent: Record<string, unknown> | unknown[] | undefined;
  let inArray = false;
  let key = "";
  let root: unknown;

  for (;;) {
    // A value is expected here.
    skip();
    const c = src.charCodeAt(pos);
    let value: unknown;
    if (c === 123 /* { */ || c === 91 /* [ */) {
      pos++;
      value = c === 123 ? {} : [];
    } else value = scalar(c);

    if (parent === undefined) root = value;
    else if (inArray) (parent as unknown[]).push(value);
    else setKey(parent as Record<string, unknown>, key, value);

    if (typeof value === "object" && value !== null) {
      if (parent !== undefined) stack.push(parent);
      parent = value as Record<string, unknown> | unknown[];
      inArray = c === 91;
      skip();
      const d = src.charCodeAt(pos);
      if (inArray) {
        if (d !== 93 /* ] */) continue;
      } else if (d !== 125 /* } */) {
        key = propertyName(d);
        continue;
      }
      pos++;
      // Closing an empty container falls through to the close loop below.
      parent = stack.pop();
      inArray = Array.isArray(parent);
    }

    // After a value: commas and closing brackets until the next value.
    for (;;) {
      skip();
      if (parent === undefined) {
        if (pos < len) fail(pos);
        return root;
      }
      const d = src.charCodeAt(pos);
      if (d === 44 /* , */) {
        pos++;
        skip();
        const e = src.charCodeAt(pos);
        if (inArray ? e !== 93 : e !== 125) {
          if (!inArray) key = propertyName(e);
          break;
        }
        if (lean && jsonc) fail(pos);
      } else if (d !== (inArray ? 93 : 125)) fail(pos);
      pos++;
      parent = stack.pop();
      inArray = Array.isArray(parent);
    }
  }
}

// Reads a property name and the colon after it. `c` is the code at `pos`.
function propertyName(c: number): string {
  let name: string;
  if (c === 34 || (c === 39 && !(lean && jsonc))) name = string(c);
  else if (lean && jsonc) fail(pos);
  else if (c === 92 /* \ */ || isIdStart(src.codePointAt(pos) ?? -1)) name = identifier();
  else fail(pos);
  skip();
  if (src.charCodeAt(pos) !== 58 /* : */) fail(pos);
  pos++;
  return name;
}

// json5 defines every property. Plain assignment is faster and the same for a
// new key, but a key the object already has or inherits (a duplicate,
// "__proto__", or anything added to Object.prototype) could hit a setter or a
// frozen prototype, so those are defined.
function setKey(object: Record<string, unknown>, key: string, value: unknown): void {
  if (key in object) Object.defineProperty(object, key, own(value));
  else object[key] = value;
}

// Whitespace and comments, as json5's default lexer state skips them.
function skip(): void {
  for (;;) {
    const c = src.charCodeAt(pos);
    if (c > 32 && c < 160 && c !== 47) return;
    if (
      lean && jsonc
        ? c === 32 || c === 10 || c === 13 || c === 9
        : c === 32 ||
          c === 10 ||
          c === 13 ||
          c === 9 ||
          c === 11 ||
          c === 12 ||
          c === 0xa0 ||
          c === 0xfeff ||
          c === 0x2028 ||
          c === 0x2029 ||
          c === 0x1680 ||
          (c >= 0x2000 && c <= 0x200a) ||
          c === 0x202f ||
          c === 0x205f ||
          c === 0x3000
    ) {
      pos++;
    } else if (c === 47 /* / */) {
      const next = src.charCodeAt(pos + 1);
      if (next === 42 /* * */) {
        const end = src.indexOf("*/", pos + 2);
        if (end < 0) fail(len);
        pos = end + 2;
      } else if (next === 47) {
        pos += 2;
        while (pos < len) {
          const d = src.charCodeAt(pos);
          if (d === 10 || d === 13 || (!(lean && jsonc) && (d === 0x2028 || d === 0x2029))) break;
          pos++;
        }
      } else fail(pos + 1);
    } else return;
  }
}

function scalar(c: number): unknown {
  if (lean && jsonc && "'+.IN".includes(src[pos]!)) fail(pos);
  switch (c) {
    case 34 /* " */:
    case 39 /* ' */:
      return string(c);
    case 110 /* n */:
      literal("null");
      return null;
    case 116 /* t */:
      literal("true");
      return true;
    case 102 /* f */:
      literal("false");
      return false;
  }
  let sign = 1;
  if (c === 45 /* - */ || c === 43 /* + */) {
    if (c === 45) sign = -1;
    c = src.charCodeAt(++pos);
    if (lean && jsonc ? !isDigit(c) : !(c === 46 || isDigit(c) || c === 73 || c === 78)) fail(pos);
  }
  if (c === 73 /* I */) {
    literal("Infinity");
    return sign * Infinity;
  }
  if (c === 78 /* N */) {
    literal("NaN");
    return NaN;
  }
  const start = pos;
  // Whether the literal is an integer that the `bigint` option applies to.
  let integer = false;
  if (c === 46 /* . */) {
    pos++;
    if (!isDigit(src.charCodeAt(pos))) fail(pos);
    digits();
  } else if (c === 48 /* 0 */) {
    pos++;
    const d = src.charCodeAt(pos);
    if (!(lean && jsonc) && (d === 120 || d === 88) /* x X */) {
      pos++;
      if (!isHex(src.charCodeAt(pos))) fail(pos);
      while (isHex(src.charCodeAt(pos))) pos++;
      return number(sign, start, true);
    }
    if (d === 46) fraction();
  } else if (c >= 49 && c <= 57) {
    digits();
    if (src.charCodeAt(pos) === 46) fraction();
    else integer = true;
  } else fail(pos);
  const e = src.charCodeAt(pos);
  if (e === 101 || e === 69 /* e E */) {
    integer = false;
    pos++;
    const s = src.charCodeAt(pos);
    if (s === 43 || s === 45) pos++;
    if (!isDigit(src.charCodeAt(pos))) fail(pos);
    digits();
  }
  return number(sign, start, integer);
}

// The digits after a decimal point, which JSON requires one of.
function fraction(): void {
  pos++;
  if (lean && jsonc && !isDigit(src.charCodeAt(pos))) fail(pos);
  digits();
}

function number(sign: number, start: number, integer: boolean): number | bigint {
  const text = src.slice(start, pos);
  const value = Number(text);
  if (lean && bigint && integer && !Number.isSafeInteger(value))
    return sign < 0 ? -BigInt(text) : BigInt(text);
  return sign * value;
}

function digits(): void {
  while (isDigit(src.charCodeAt(pos))) pos++;
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

function isHex(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
}

function literal(word: string): void {
  for (let k = 1; k < word.length; k++)
    if (src.charCodeAt(pos + k) !== word.charCodeAt(k)) fail(pos + k);
  pos += word.length;
}

function string(quote: number): string {
  let out = "";
  let start = ++pos;
  for (;;) {
    const c = src.charCodeAt(pos);
    if (c === quote) {
      out += src.slice(start, pos++);
      return out;
    }
    if (c === 92 /* \ */) {
      out += src.slice(start, pos++);
      out += escape();
      start = pos;
      continue;
    }
    if (c === 10 || c === 13 || (lean && jsonc && c < 32)) fail(pos);
    if (json5 && (c === 0x2028 || c === 0x2029))
      console.warn(
        `JSON5: '${formatChar(String.fromCharCode(c))}' in strings is not valid ECMAScript; consider escaping`,
      );
    else if (c !== c) fail(len);
    pos++;
  }
}

function escape(): string {
  const c = src.charCodeAt(pos);
  // JSON's escapes. At the end of input `src[pos]` is undefined, which fails too.
  if (lean && jsonc && !'"\\/bfnrtu'.includes(src[pos]!)) fail(pos);
  switch (c) {
    case 98 /* b */:
      pos++;
      return "\b";
    case 102 /* f */:
      pos++;
      return "\f";
    case 110 /* n */:
      pos++;
      return "\n";
    case 114 /* r */:
      pos++;
      return "\r";
    case 116 /* t */:
      pos++;
      return "\t";
    case 118 /* v */:
      pos++;
      return "\v";
    case 48 /* 0 */:
      if (isDigit(src.charCodeAt(++pos))) fail(pos);
      return "\0";
    case 120 /* x */:
      pos++;
      return String.fromCharCode(hex(2));
    case 117 /* u */:
      pos++;
      return String.fromCharCode(hex(4));
    case 10:
    case 0x2028:
    case 0x2029:
      pos++;
      return "";
    case 13:
      if (src.charCodeAt(++pos) === 10) pos++;
      return "";
  }
  if ((c >= 49 && c <= 57) || c !== c) fail(pos);
  const cp = src.codePointAt(pos)!;
  pos += cp > 0xffff ? 2 : 1;
  return String.fromCodePoint(cp);
}

function hex(count: number): number {
  let value = 0;
  for (let k = 0; k < count; k++) {
    const c = src.charCodeAt(pos);
    if (!isHex(c)) fail(pos);
    value = value * 16 + (c <= 57 ? c - 48 : (c | 32) - 87);
    pos++;
  }
  return value;
}

function identifier(): string {
  let out = "";
  let start = pos;
  let first = true;
  for (;;) {
    const c = src.charCodeAt(pos);
    if (c === 92 /* \ */) {
      out += src.slice(start, pos++);
      if (src.charCodeAt(pos) !== 117 /* u */) fail(pos);
      pos++;
      const cp = hex(4);
      if (!(first ? isIdStart(cp) : isIdContinue(cp))) invalidIdentifier();
      out += String.fromCharCode(cp);
      start = pos;
    } else if (
      (c >= 97 && c <= 122) ||
      (c >= 65 && c <= 90) ||
      c === 36 ||
      c === 95 ||
      (!first && c >= 48 && c <= 57)
    ) {
      pos++;
    } else if (c >= 0x80) {
      const cp = src.codePointAt(pos)!;
      if (!(first ? isIdStart(cp) : isIdContinue(cp))) break;
      pos += cp > 0xffff ? 2 : 1;
    } else break;
    first = false;
  }
  return out + src.slice(start, pos);
}

// The line and column json5 reports for `width` code units read at `at`:
// columns count code units, and reading past the end counts as one. In json5
// 2.2.3 only "\n" starts a line, and a "\n" counts as the first character of
// the next. In the lean mode, as in json5 3, "\n", "\r", "\r\n", U+2028 and
// U+2029 each end a line, and count as its last character.
function position(at: number, width: number): [line: number, column: number] {
  let line = 1;
  let lineStart = 0;
  if (json5) {
    const end = at + width;
    for (let k = src.indexOf("\n"); k >= 0 && k < end; k = src.indexOf("\n", k + 1)) {
      line++;
      lineStart = k + 1;
    }
  } else
    for (let k = 0; k < at; k++) {
      const c = src.charCodeAt(k);
      if (c === 10 || c === 0x2028 || c === 0x2029 || (c === 13 && src.charCodeAt(k + 1) !== 10)) {
        line++;
        lineStart = k + 1;
      }
    }
  return [line, at + width - lineStart];
}

function fail(at: number): never {
  const cp = src.codePointAt(at);
  if (cp === undefined) {
    const [line, column] = position(len, 1);
    throw syntaxError("invalid end of input", line, column);
  }
  const [line, column] = position(at, cp > 0xffff ? 2 : 1);
  throw syntaxError(`invalid character '${formatChar(String.fromCodePoint(cp))}'`, line, column);
}

function invalidIdentifier(): never {
  const [line, column] = position(pos, 0);
  throw syntaxError("invalid identifier character", line, column - 5);
}

function syntaxError(message: string, line: number, column: number): SyntaxError {
  const error = new SyntaxError(`JSON5: ${message} at ${line}:${column}`) as SyntaxError & {
    lineNumber: number;
    columnNumber: number;
  };
  error.lineNumber = line;
  error.columnNumber = column;
  return error;
}

// json5's reviver walk: arrays by index, objects with for...in in json5 2.2.3
// and by their own keys, as JSON.parse walks them, in the lean mode. The
// loop bodies stay inline so deep input recurses no deeper than json5 does.
function internalize(holder: any, name: string, reviver: Reviver): unknown {
  const value = holder[name];
  if (value != null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const key = String(i);
        const replacement = internalize(value, key, reviver);
        // Deleting leaves a hole, as json5 does. json5 runs in sloppy mode, where
        // deleting a non-configurable property fails silently; Reflect does too.
        if (replacement === undefined) Reflect.deleteProperty(value, key);
        else define(value, key, replacement);
      }
    } else if (lean) {
      for (const key of Object.keys(value)) {
        const replacement = internalize(value, key, reviver);
        if (replacement === undefined) Reflect.deleteProperty(value, key);
        else define(value, key, replacement);
      }
    } else {
      for (const key in value) {
        const replacement = internalize(value, key, reviver);
        if (replacement === undefined) Reflect.deleteProperty(value, key);
        else define(value, key, replacement);
      }
    }
  }
  return reviver.call(holder, name, value);
}

// json5 2.2.3 throws when the reviver made the property non-configurable;
// JSON.parse, and the lean mode, ignore the failed update.
function define(object: object, key: string, value: unknown): void {
  if (lean) Reflect.defineProperty(object, key, own(value));
  else Object.defineProperty(object, key, own(value));
}

function own(value: unknown): PropertyDescriptor {
  return { value, writable: true, enumerable: true, configurable: true };
}
