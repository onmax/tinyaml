// @std/yaml's `stringify`, byte for byte. Its style rules are js-yaml 3's:
// `:` and `#` anywhere, or a flow indicator, rule out plain style, and
// tagged values are written as `!<tag> value`.
import { COMPAT, fold } from "../shared/fold.ts";
import { maybeTyped, schemaOf, Y, type StdType } from "./types.ts";
import type { SchemaType } from "./parse.ts";

export type StyleVariant =
  | "lowercase"
  | "uppercase"
  | "camelcase"
  | "decimal"
  | "binary"
  | "octal"
  | "hexadecimal";

export interface StringifyOptions {
  /** Spaces per indentation level. Default 2. */
  indent?: number;
  /** Indent sequences that are mapping values. Default true. */
  arrayIndent?: boolean;
  /** Skip values YAML can't represent instead of throwing. */
  skipInvalid?: boolean;
  /** Nesting level from which collections are written in flow style; -1 (default) never. */
  flowLevel?: number;
  /** Style per tag, e.g. `{ "!!int": "hexadecimal" }`. */
  styles?: Record<string, StyleVariant>;
  /** Default "default". */
  schema?: SchemaType;
  /** Sort mapping keys, with string comparison or the given function. */
  sortKeys?: boolean | ((a: string, b: string, depth: number) => number);
  /** Width to fold long strings at, -1 for none. Default 80. */
  lineWidth?: number;
  /** Write objects reached twice as `&ref_N` and `*ref_N`. Default true. */
  useAnchors?: boolean;
  /** Quote YAML 1.1 booleans such as `yes` and `off`. Default true. */
  compatMode?: boolean;
  /** No spaces after `,` and `:` in flow collections, and quoted flow keys. */
  condenseFlow?: boolean;
  /** Quote for strings that need one. Default `'`. */
  quoteStyle?: "'" | '"';
}

// Anything outside YAML's printable set (minus BOM and the Unicode line
// separators) forces double quotes and is escaped there, as are astral characters.
const UNPRINTABLE =
  /[^\x20-\x7E\xA1-\u2027\u202A-\uD7FF\uE000-\uFEFE\uFF00-\uFFFD\u{10000}-\u{10FFFF}]/u;
const ESCAPE = /["\\]|[^\x20-\x7E\xA1-\u2027\u202A-\uD7FF\uE000-\uFEFE\uFF00-\uFFFD]/gu;
const ESCAPED = '\0\x07\b\t\n\v\f\r\x1B"\\\x85\xA0\u2028\u2029';
const isObject = (value: unknown): value is any => value !== null && typeof value === "object";

const double = (s: string) =>
  `"${s.replace(ESCAPE, (c) => {
    const i = ESCAPED.indexOf(c);
    const n = c.codePointAt(0)!;
    const size = n < 256 ? 2 : n < 65536 ? 4 : 8;
    return `\\${i < 0 ? "_xu_U"[size >> 1] + n.toString(16).toUpperCase().padStart(size, "0") : '0abtnvfre"\\N_LP'[i]}`;
  })}"`;

// std visits breadth first and numbers objects in the order it sees them twice.
function duplicates(root: unknown): unknown[] {
  const seen = new Set();
  const twice = new Set();
  const queue = [root];
  for (const value of queue)
    if (isObject(value))
      if (seen.has(value)) twice.add(value);
      else {
        seen.add(value);
        queue.push(...(Array.isArray(value) ? value : Object.values(value)));
      }
  return [...twice];
}

export function stringify(data: unknown, options: StringifyOptions = {}): string {
  let {
    indent = 2,
    arrayIndent = true,
    skipInvalid = false,
    flowLevel = -1,
    styles,
    sortKeys = false,
    lineWidth = 80,
    useAnchors = true,
    compatMode = true,
    condenseFlow = false,
    quoteStyle = "'",
  } = options;
  indent = Math.max(1, indent);
  const { implicit, types } = schemaOf(options.schema);
  const styleMap = new Map<string, string>();
  for (const [tag, style] of Object.entries(styles ?? {}))
    styleMap.set(tag.replace(/^!!/, Y), String(style));
  // Anchor number by object; std numbers them in the order duplicates() finds.
  const refs = new Map((useAnchors ? duplicates(data) : []).map((ref, i) => [ref, i]));
  const used = new Set();
  const pad = (level: number) => `\n${" ".repeat(indent * level)}`;

  const represent = (type: StdType, value: unknown) => {
    const { represent } = type;
    if (!represent) return value;
    const style = styleMap.get(type.tag) ?? type.defaultStyle ?? "lowercase";
    if (typeof represent === "function") return represent(value, style);
    const fn = represent[style!];
    if (!fn) throw new TypeError(`!<${type.tag}> tag resolver accepts not "${style}" style`);
    return (fn as (data: unknown, style?: string) => unknown)(value, style);
  };

  const scalar = (s: string, level: number, isKey: boolean) => {
    if (!s) return "''";
    if (compatMode && COMPAT.test(s)) return `'${s}'`;
    const indented = indent * Math.max(1, level);
    // Deeper scalars get less width, down to min(lineWidth, 40).
    const width = lineWidth === -1 ? -1 : Math.max(Math.min(lineWidth, 40), lineWidth - indented);
    const single = isKey || (flowLevel > -1 && level >= flowLevel);
    const flat = single ? s : s.replace(/\n/g, " ");
    // Printable ASCII needs no escapes; the full check is slower.
    if (/[^\x20-\x7E]/.test(flat) && UNPRINTABLE.test(flat)) return double(s);
    const folded =
      !single &&
      width !== -1 &&
      s.length > width &&
      s.split("\n").some((line) => line.length > width && line[0] !== " ");
    if (single || (!s.includes("\n") && !folded))
      return /^[ \-?&*!|>'"%@`]|[,[\]{}:#]|[ \t]$/.test(s) ||
        (maybeTyped(s) && implicit.some((type) => type.resolve(s)))
        ? quoteStyle === "'"
          ? `'${s.replace(/'/g, "''")}'`
          : double(s)
        : s;
    const lead = /^\n* /.test(s);
    if (indent > 9 && lead) return double(s);
    const chomp = s.endsWith("\n") ? (s.endsWith("\n\n") || s === "\n" ? "+" : "") : "-";
    const body = (folded ? fold(s, width) : s).replace(/^(?!$)/gm, " ".repeat(indented));
    return `${folded ? ">" : "|"}${lead ? indent : ""}${chomp}\n${body.replace(/\n$/, "")}`;
  };

  // A collection's items, each as its style writes it.
  const sequence = (array: unknown[], level: number, block: boolean) => {
    const items: string[] = [];
    for (const value of array) {
      const out = node(value, block ? level + 1 : level, block, block, false);
      if (out !== null) items.push(block ? (out[0] === "\n" ? "-" : "- ") + out : out);
    }
    return items;
  };

  const mapping = (object: any, level: number, block: boolean) => {
    const keys = block ? Object.keys(object) : null;
    if (keys)
      if (sortKeys === true) keys.sort();
      else if (typeof sortKeys === "function") keys.sort((a, b) => sortKeys(a, b, level));
      else if (sortKeys)
        throw new TypeError(
          `"sortKeys" must be a boolean or a function: received ${typeof sortKeys}`,
        );
    const items: string[] = [];
    // std reads a flow mapping's values all at once, with Object.entries.
    for (const entry of keys ?? Object.entries(object)) {
      const key = keys ? (entry as string) : entry[0]!;
      const value = keys ? object[key] : entry[1];
      const k = node(key, block ? level + 1 : level, block, block, block);
      if (k === null) continue;
      const explicit = k.length > 1024;
      const v = node(value, block ? level + 1 : level, block, explicit, false);
      if (v === null) continue;
      items.push(
        block
          ? `${explicit ? (k[0] === "\n" ? "?" : "? ") : ""}${k}${explicit ? pad(level) : ""}${v[0] === "\n" ? ":" : ": "}${v}`
          : condenseFlow
            ? `"${explicit ? "? " : ""}${k}":${v}`
            : `${explicit ? "? " : ""}${k}: ${v}`,
      );
    }
    return items;
  };

  const node = (
    value: any,
    level: number,
    block: boolean,
    compact: boolean,
    isKey: boolean,
  ): string | null => {
    // "?" for an implicit type, whose text then reads back as it.
    let tag: string | null = null;
    // No built-in type represents a plain string.
    if (typeof value !== "string")
      for (let i = 0; i < types.length; i++)
        if (types[i]!.predicate?.(value)) {
          value = represent(types[i]!, value);
          tag = i < implicit.length ? "?" : types[i]!.tag;
          break;
        }
    if (block) block = flowLevel < 0 || flowLevel > level;
    if (typeof value === "string" || value instanceof String) {
      value = value.valueOf();
      return tag === "?" ? value : `${tag ? `!<${tag}> ` : ""}${scalar(value, level, isKey)}`;
    }
    if (!isObject(value)) {
      if (skipInvalid) return null;
      throw new TypeError(`Cannot stringify ${typeof value}`);
    }
    const ref = refs.get(value) ?? -1;
    if (ref >= 0) {
      if (used.has(value)) return `*ref_${ref}`;
      used.add(value);
    }
    if (ref >= 0 || (indent !== 2 && level > 0)) compact = false;
    const isArray = Array.isArray(value);
    if (isArray && !arrayIndent && level > 0) level--;
    block &&= (isArray ? value : Object.keys(value)).length !== 0;
    const items = (isArray ? sequence : mapping)(value, level, block);
    const brackets = isArray ? "[]" : "{}";
    const out = !block
      ? brackets[0] + items.join(isArray && condenseFlow ? "," : ", ") + brackets[1]
      : items.length
        ? (compact ? "" : pad(level)) + items.join(pad(level))
        : brackets;
    return ref < 0 ? out : `&ref_${ref}${block ? "" : " "}${out}`;
  };

  const out = node(data, 0, true, true, false);
  return out === null ? "" : `${out}\n`;
}
