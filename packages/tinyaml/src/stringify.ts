// Writes JS values straight to YAML text in one walk, choosing each
// string's style as it goes. The output is what js-yaml 5 writes with
// `lineWidth: -1`, and strings that YAML 1.1 readers would take for
// something else (`yes`, `0777`, `1:30`) are quoted too.
import { ESCAPED, ESCAPES } from "./core/parse.ts";

export interface StringifyOptions {
  /** Spaces per indentation level. Default 2. */
  indent?: number;
  /** Write objects reached twice as `&ref_N` anchors and `*ref_N` aliases. Default true. */
  refs?: boolean;
  /** Sort mapping keys, with string comparison or the given function. */
  sortKeys?: boolean | ((a: string, b: string) => number);
}

const NS = "[\\x21-\\x7E\\x85\\xA0-\\uD7FF\\uE000-\\uFEFE\\uFF00-\\uFFFD\\u{10000}-\\u{10FFFF}]";
const PLAIN_CHAR = `(?:(?![:#])${NS}|:(?=${NS}))#*`;
const PLAIN_LINE = `(?:(?![-?:,\\[\\]{}#&*!|>'"%@\`])${NS}|[?:-](?=${NS}))#*(?:[ \\t]*${PLAIN_CHAR})*`;
// Multi-line strings never reach the plain check, so one line is enough.
const PLAIN = new RegExp(`^${PLAIN_LINE}$`, "u");
const SINGLE = /^[\t\x20-\uD7FF\uE000-\uFFFF\u{10000}-\u{10FFFF}]*$/u;
const BLOCK = /^[\t\n\x20-\x7E\x85\xA0-\uD7FF\uE000-\uFEFE\uFF00-\uFFFD\u{10000}-\u{10FFFF}]*$/u;
const INVISIBLE = /[\t\x7F-\xA0\u2028\u2029\uFEFF\uFFFE\uFFFF]/;
const ESCAPE = /["\\\x00-\x1F\x7F-\xA0\u2028\u2029\uD800-\uDFFF\uFEFF\uFFFE\uFFFF]/gu;

// Plain strings that the core schema, js-yaml's default schema or yaml's YAML
// 1.1 one would read back as something other than a string, NaN and dates
// that don't exist included.
const NULL_OR_BOOL =
  /^(?:~|null|Null|NULL|[yYnN]|yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|<<)?$/;
const NUMBER =
  /^[-+]?(?:0b[01_]+|0o[0-7_]+|0x[\da-fA-F_]+|(?=[\d.eE])(?:\d[\d_]*)?(?:\.[\d_]*)?(?:[eE][-+]?\d+)?)$/;
const SEXAGESIMAL = /^[-+]?\d[\d_]*(?::[0-5]?\d)+(?:\.[\d_]*)?$/;
const SPECIAL_FLOAT = /^(?:[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
const DATE =
  /^\d{4}-\d\d?-\d\d?(?:(?:[Tt]|[ \t]+)\d\d?:\d\d?:\d\d?(?:\.\d*)?(?:[ \t]*(?:Z|[-+]\d\d?(?::\d\d)?))?)?$/;
// Printable ASCII from a letter to anything but `:` is plain, unless it reads
// as a null, a bool or, like `e5`, a float. Most keys and values are.
const WORD = /^(?![eE][-+]?\d+$)[a-z](?:[!-~]*[!-9;-~])?$/i;
const FORBIDDEN_START = /^(?:---|\.\.\.)(?=$|[ \t\n\r])/;

let indent = 2;
let sortKeys: StringifyOptions["sortKeys"] = false;
// Objects reached more than once, named `ref_N` in the order their second
// visit happens, as js-yaml numbers its anchors.
let refs: Map<object, string> | undefined;
// Each object reached, after `toJSON`, to what it holds, each read once: an
// array's items, or a mapping's keys and values in turn.
let held = new Map<object, unknown[]>();
let emitted = new Set<object>();
let openEnded = false;
// The text write returned last starts on a new line. Reading its first
// character instead would flatten the whole rope at every level.
let lead = false;

/**
 * YAML text for `value`. Like JSON.stringify, functions, symbols and
 * undefined are left out of objects and become null in arrays, and `toJSON`
 * is used where there is one, so Dates become ISO strings.
 */
export function stringify(value: unknown, options: StringifyOptions = {}): string {
  // Options first, so one that throws leaves an outer call's state alone. As
  // in js-yaml, 0 and NaN mean the default, and a fraction counts as the
  // next whole number.
  const width = Math.max(1, Math.ceil(options.indent || 2));
  const sort = options.sortKeys ?? false;
  const shared = options.refs !== false;
  // A `toJSON` may stringify something else in the middle of this.
  const outer = [indent, sortKeys, refs, held, emitted, openEnded] as const;
  try {
    indent = width;
    sortKeys = sort;
    emitted = new Set();
    openEnded = false;
    refs = shared ? new Map() : undefined;
    held = new Map();
    const body = write(read(value), 0, true, true);
    if (body === undefined) return "";
    return openEnded ? `${body}\n...\n` : `${body}\n`;
  } finally {
    [indent, sortKeys, refs, held, emitted, openEnded] = outer;
  }
}

// `value` after its `toJSON`, with what it holds read into `held`, depth
// first.
function read(value: unknown): unknown {
  const toJSON = (value as { toJSON?: unknown })?.toJSON;
  if (typeof toJSON === "function") value = toJSON.call(value);
  if (value === null || typeof value !== "object") return value;
  if (held.has(value)) {
    if (refs && !refs.has(value)) refs.set(value, `ref_${refs.size}`);
    return value;
  }
  const items: unknown[] = [];
  held.set(value, items);
  // By index up to the length it starts with, so holes become null too.
  if (Array.isArray(value))
    for (let i = 0, n = value.length; i < n; i++) items.push(read(value[i]));
  else
    for (const key of Object.keys(value))
      items.push(key, read((value as Record<string, unknown>)[key]));
  return value;
}

// A mapping's keys and values from `held`, by key.
function sorted(items: unknown[]): unknown[] {
  const pairs: [string, unknown][] = [];
  for (let i = 0; i < items.length; i += 2) pairs.push([items[i] as string, items[i + 1]]);
  return pairs
    .sort(([a], [b]) => (typeof sortKeys === "function" ? sortKeys(a, b) : a < b ? -1 : +(a > b)))
    .flat();
}

// What JSON.stringify leaves out: undefined, functions and symbols. BigInt
// throws there too.
function isValid(value: unknown): value is string | number | boolean | object | null {
  const type = typeof value;
  if (type === "bigint") throw new TypeError("Do not know how to serialize a BigInt");
  return value !== undefined && type !== "function" && type !== "symbol";
}

function write(
  value: unknown,
  level: number,
  block: boolean,
  compact: boolean,
): string | undefined {
  lead = false;
  if (!isValid(value)) return undefined;
  // Keys don't touch this, so a value that's left out leaves it as it was.
  openEnded = false;
  if (typeof value === "string") return writeString(value, level, false, !block);
  if (value === null) return "null";
  if (typeof value === "number") return writeNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";

  const anchor = refs?.get(value);
  if (anchor !== undefined) {
    if (emitted.has(value)) return `*${anchor}`;
    emitted.add(value);
    compact = false;
  }
  if (indent < 2 && level > 0) compact = false;
  let body = "";
  let flowBody = false;
  const newline = `\n${" ".repeat(indent * level)}`;
  let items = held.get(value)!;
  if (Array.isArray(value)) {
    flowBody = !block || !items.length;
    if (flowBody) body = "[]";
    else {
      for (const item of items) {
        const text = write(item, level + 1, true, true) ?? "null";
        if (!compact || body) body += newline;
        body += lead ? "-" : "- ";
        body += text;
      }
    }
  } else {
    if (sortKeys) items = sorted(items);
    if (block)
      for (let i = 0; i < items.length; i += 2) {
        const key = items[i] as string;
        const keyText = writeString(key, level + 1, true, false);
        const explicit =
          key.includes("\n") || (keyText.length > 1024 && /^[\s\S]{1025}/u.test(keyText));
        // Left out, as is a `toJSON` that returns undefined.
        const text = write(items[i + 1], level + 1, true, explicit);
        if (text === undefined) continue;
        if (!compact || body) body += newline;
        body += explicit ? `? ${keyText}${newline}` : keyText;
        body += lead ? ":" : ": ";
        body += text;
      }
    flowBody = !body;
    if (flowBody) body = "{}";
  }
  if (flowBody) openEnded = false;
  else if (compact && level > 0 && indent > 2) body = " ".repeat(indent - 2) + body;
  lead = !flowBody && !compact && anchor === undefined;
  if (anchor === undefined) return body;
  return `&${anchor}${flowBody ? " " : ""}${body}`;
}

function writeNumber(value: number): string {
  const text = String(value);
  if (Object.is(value, -0)) return "-0.0";
  if (Number.isInteger(value) && !text.includes("e")) return text;
  if (value !== value) return ".nan";
  if (!isFinite(value)) return value > 0 ? ".inf" : "-.inf";
  return /^-?\d+e/.test(text) ? text.replace("e", ".e") : text;
}

function isAmbiguous(text: string): boolean {
  if (NULL_OR_BOOL.test(text)) return true;
  const ch = text.charCodeAt(0);
  if (ch !== 43 && ch !== 45 && ch !== 46 && (ch < 48 || ch > 57) && (ch | 32) !== 101)
    return false;
  return NUMBER.test(text) || SPECIAL_FLOAT.test(text) || SEXAGESIMAL.test(text) || DATE.test(text);
}

function writeString(text: string, level: number, isKey: boolean, flow: boolean): string {
  // No word past five letters reads as a null or a bool.
  if (WORD.test(text) && (text.length > 5 || !NULL_OR_BOOL.test(text))) return text;
  if (INVISIBLE.test(text) || /^\s+$/.test(text)) return writeDouble(text);
  const shift = indent * Math.max(1, level);
  if (!isKey && text.includes("\n")) {
    // The indentation indicator is one digit, counted from the parent's column.
    const leading = /^\n* /.test(text);
    if (flow || !BLOCK.test(text) || (leading && indent > 9)) return writeDouble(text);
    const header = leading ? String(indent) : "";
    const keep = text.endsWith("\n\n") || text === "\n";
    const chomp = text.endsWith("\n") ? (keep ? "+" : "") : "-";
    openEnded = keep;
    const pad = " ".repeat(shift);
    const body = text.replace(/^(?=.)/gm, pad);
    return `|${header}${chomp}\n${body.endsWith("\n") ? body.slice(0, -1) : body}`;
  }
  if (
    text !== "" &&
    text !== "=" &&
    PLAIN.test(text) &&
    // A top-level string, or a key that may start a line, can't look like `---`.
    !((level === 0 || isKey) && FORBIDDEN_START.test(text)) &&
    !isAmbiguous(text)
  ) {
    return text;
  }
  if (SINGLE.test(text) && !/[ \t]\n|\n[ \t]/.test(text)) return `'${text.replace(/'/g, "''")}'`;
  return writeDouble(text);
}

function writeDouble(text: string): string {
  return `"${text.replace(ESCAPE, (ch) => {
    const short = ESCAPED.indexOf(ch);
    if (short >= 0) return `\\${ESCAPES[short]}`;
    const code = ch.charCodeAt(0);
    const hex = code.toString(16).toUpperCase();
    return code <= 255 ? `\\x${hex.padStart(2, "0")}` : `\\u${hex.padStart(4, "0")}`;
  })}"`;
}
