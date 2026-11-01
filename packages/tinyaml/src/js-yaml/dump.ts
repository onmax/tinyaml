// js-yaml 4's `dump`, byte for byte: same options, same style choices, same
// errors. Scalar style rules that js-yaml checks per character are regexes here.
import { findRefs } from "../core/refs.ts";
import { YAMLException } from "./error.ts";
import type { Schema, Type } from "./schema.ts";
import { builtin, DEFAULT_SCHEMA, kindOf, maybeTyped, Y } from "./types.ts";

export interface DumpOptions {
  /** Spaces per indentation level. Default 2. */
  indent?: number | undefined;
  /** Don't indent sequences that are mapping values. */
  noArrayIndent?: boolean | undefined;
  /** Skip functions and other values YAML can't represent instead of throwing. */
  skipInvalid?: boolean | undefined;
  /** Nesting level from which collections are written in flow style; -1 (default) never. */
  flowLevel?: number | undefined;
  /** Style per tag, e.g. `{ "!!null": "canonical", "!!int": "hex" }`. */
  styles?: Record<string, unknown> | undefined;
  /** Types that represent values. Default DEFAULT_SCHEMA. */
  schema?: Schema | undefined;
  /** Sort mapping keys, with string comparison or the given function. */
  sortKeys?: boolean | ((a: string, b: string) => number) | undefined;
  /** Width to fold long strings at, -1 for none. Default 80. */
  lineWidth?: number | undefined;
  /** Repeat shared objects instead of writing `&ref_N` anchors and aliases. */
  noRefs?: boolean | undefined;
  /** Don't quote YAML 1.1 booleans (`yes`, `off`, ...) and base 60 numbers. */
  noCompatMode?: boolean | undefined;
  /** No spaces after `,` and `:` in flow collections, and quoted flow keys. */
  condenseFlow?: boolean | undefined;
  /** Quote for strings that need one. Default `'`. */
  quotingType?: "'" | '"' | undefined;
  /** Quote every string that isn't a mapping key. */
  forceQuotes?: boolean | undefined;
  /** Called like JSON.stringify's replacer, with the parent as `this`. */
  replacer?: ((this: any, key: string, value: any) => any) | undefined;
}

const fail = (message: string): never => {
  throw new YAMLException(message);
};
// The first type that claims to represent `value`.
function find(types: Type[], value: any): Type | undefined {
  for (const type of types)
    if (
      (type.instanceOf || type.predicate) &&
      (!type.instanceOf || (typeof value === "object" && value instanceof type.instanceOf)) &&
      (!type.predicate || type.predicate(value))
    )
      return type;
}
// Anything outside YAML's printable set (minus BOM, NEL, NBSP and the Unicode
// line separators) forces double quotes and is escaped there.
const UNPRINTABLE =
  /[^\x20-\x7E\xA1-\u2027\u202A-\uD7FF\uE000-\uFEFE\uFF00-\uFFFD\u{10000}-\u{10FFFF}]/gu;
const ESCAPED = "\0\x07\b\t\n\v\f\r\x1B\x85\xA0\u2028\u2029";
// YAML 1.1 readers take these as booleans and sexagesimal numbers.
const COMPAT = /^(?:[yYnN]|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/;
const BASE60 = /^[-+]?[\d_]+(?::[\d_]+)+(?:\.[\d_]*)?$/;

const double = (s: string) =>
  `"${s.replace(/["\\]/g, "\\$&").replace(UNPRINTABLE, (c) => {
    const i = ESCAPED.indexOf(c);
    const n = c.charCodeAt(0);
    return `\\${
      i < 0
        ? (n < 256 ? "x" : "u") +
          n
            .toString(16)
            .toUpperCase()
            .padStart(n < 256 ? 2 : 4, "0")
        : "0abtnvfreN_LP"[i]
    }`;
  })}"`;

// Greedy: the longest piece within width, else the shortest one over it.
// Breaks never leave a line starting with a space, which would read as more-indented.
function foldLine(line: string, width: number): string {
  if (!line || line[0] === " ") return line;
  let start = 0;
  let curr = 0;
  let result = "";
  for (const { index } of line.matchAll(/ [^ ]/g)) {
    if (index - start > width) {
      const end = curr > start ? curr : index;
      result += `${line.slice(start, end)}\n`;
      start = end + 1;
    }
    curr = index;
  }
  return (
    result +
    (line.length - start > width && curr > start
      ? `${line.slice(start, curr)}\n${line.slice(curr + 1)}`
      : line.slice(start))
  );
}

// In folded style k line breaks read back as k-1, except next to more-indented
// lines and at the start, so those get no extra break.
function fold(s: string, width: number): string {
  let prevMore = /^[\n ]/.test(s);
  return s.replace(/(\n+|^)([^\n]*)/g, (_, breaks: string, line: string) => {
    const more = line[0] === " ";
    const result =
      breaks + (breaks && !prevMore && !more && line ? "\n" : "") + foldLine(line, width);
    prevMore = more;
    return result;
  });
}

function tagName(tag: any): string {
  const local = tag[0] === "!";
  const s = encodeURI(local ? tag.slice(1) : tag).replace(/!/g, "%21");
  return local ? `!${s}` : s.startsWith(Y) ? `!!${s.slice(18)}` : `!<${s}>`;
}

export function dump(input: unknown, options?: DumpOptions | null): string {
  const o: DumpOptions = options || {};
  const schema = o.schema || DEFAULT_SCHEMA;
  const indent = Math.max(1, o.indent || 2);
  const flowLevel = o.flowLevel ?? -1;
  const lineWidth = o.lineWidth || 80;
  const { sortKeys, condenseFlow, forceQuotes } = o;
  const quote = o.quotingType === '"' ? '"' : "'";
  const replacer = typeof o.replacer === "function" ? o.replacer : null;
  const { compiledImplicit, compiledExplicit } = schema;
  // With only built-in types, no type represents a plain string and only
  // `maybeTyped` strings can read back as something else.
  const builtinImplicit = builtin(compiledImplicit);
  const plainStrings = builtinImplicit && builtin(compiledExplicit);
  // js-yaml repeats spaces in a loop, so fractional counts round up.
  const spaces = (n: number) => " ".repeat(Math.ceil(n));

  const styles: Record<string, any> = {};
  for (let [tag, style] of Object.entries(o.styles || {})) {
    tag = tag.replace(/^!!/, Y);
    const type = schema.compiledTypeMap.fallback[tag];
    style = String(style);
    styles[tag] =
      type && Object.hasOwn(type.styleAliases, style as string)
        ? type.styleAliases[style as string]
        : style;
  }

  const refs = o.noRefs ? new Map<object, string>() : findRefs(input);
  const used = new Set<string>();

  // `s` may be a boxed String, which js-yaml's strict comparisons don't match.
  const scalar = (s: any, level: number, key: any, inBlock: any): any => {
    if (
      !s.length ||
      (!o.noCompatMode && ((typeof s === "string" && COMPAT.test(s)) || BASE60.test(s)))
    )
      return quote + s + quote;
    const indented = indent * Math.max(1, level);
    // Deeper scalars get less width, down to min(lineWidth, 40).
    const width = lineWidth === -1 ? -1 : Math.max(Math.min(lineWidth, 40), lineWidth - indented);
    const forced = forceQuotes && !key;
    const oneLine = key || (flowLevel > -1 && level >= flowLevel) || forced;
    const flat = oneLine ? s : s.replace(/\n/g, " ");
    // Printable ASCII needs no escapes; the full check is slower.
    if (/[^\x20-\x7E]/.test(flat) && ~flat.search(UNPRINTABLE)) return double(s);
    const folded =
      !oneLine &&
      width !== -1 &&
      s.length > width &&
      s.split("\n").some((line: string) => line.length > width && line[0] !== " ");
    if (!s.includes("\n") && !folded)
      return !forced &&
        !/^[-?:,[\]{}#&*!|=>'"%@` ]|[ :]$| #|: /.test(s) &&
        (inBlock || !/(^|[^:])[,[\]{}]/.test(s)) &&
        !((!builtinImplicit || maybeTyped(s)) && compiledImplicit.some((type) => type.resolve(s)))
        ? s
        : quote === '"'
          ? double(s)
          : `'${s.replace(/'/g, "''")}'`;
    const lead = /^\n* /.test(s);
    // The indentation indicator is a single digit.
    if (indent > 9 && lead) return double(s);
    // The last line break is left to the caller's newline, so a trailing empty
    // line needs keep chomping (+). `===` like js-yaml: boxed "\n" clips.
    const chomp = s.endsWith("\n") ? (s.endsWith("\n\n") || s === "\n" ? "+" : "") : "-";
    const body = (folded ? fold(s, width) : s).replace(/^(?!$)/gm, spaces(indented));
    return `${folded ? ">" : "|"}${lead ? indent : ""}${chomp}\n${body.replace(/\n$/, "")}`;
  };

  // Writes a sequence or mapping, in block style or flow style.
  const collection = (
    level: number,
    object: any,
    isSeq: boolean,
    block?: any,
    compact?: any,
  ): string => {
    const keys = isSeq ? object : Object.keys(object);
    if (!isSeq && block && sortKeys)
      if (sortKeys === true) keys.sort();
      else if (typeof sortKeys === "function") keys.sort(sortKeys);
      else fail("sortKeys must be a boolean or a function");
    const next = block ? level + 1 : level;
    const pad = `\n${spaces(indent * level)}`;
    let result = "";
    for (let i = 0; i < keys.length; i++) {
      const key = isSeq ? `${i}` : keys[i];
      let value = object[key];
      let pair = "";
      let explicit = false;
      if (replacer) value = replacer.call(object, key, value);
      if (!isSeq) {
        const out = node(next, key, block, block, block);
        if (out === undefined) continue;
        // Tagged and very long keys need the explicit `? key` form.
        explicit = (block && tag !== null && tag !== "?") || out.length > 1024;
        pair =
          (block || !condenseFlow ? "" : '"') +
          (explicit ? (block && out[0] === "\n" ? "?" : "? ") : "") +
          out +
          (block ? (explicit ? pad : "") : condenseFlow ? '":' : ": ");
      }
      const write = (v: unknown) =>
        node(next, v, block, isSeq ? block : block && explicit, 0, isSeq && block);
      // Invalid items are dropped, except undefined in a sequence, which becomes null.
      const out = write(value) ?? (isSeq && value === undefined ? write(null) : undefined);
      if (out !== undefined)
        result +=
          (block
            ? (!compact || result ? pad : "") +
              pair +
              (isSeq ? "-" : ":") +
              (out[0] === "\n" ? "" : " ")
            : (result ? (condenseFlow && isSeq ? "," : ", ") : "") + pair) + out;
    }
    return block ? result || (isSeq ? "[]" : "{}") : isSeq ? `[${result}]` : `{${result}}`;
  };

  // The tag of the node written last, for `collection` to see the key's.
  let tag: any;
  const node = (
    level: number,
    value: any,
    block: any,
    compact: any,
    key?: any,
    inSeq?: any,
  ): any => {
    let t: any = null;
    let out = value;
    let type: any;
    if (typeof value !== "string" || !plainStrings) {
      type = find(compiledImplicit, value);
      if (type) t = "?";
      else if ((type = find(compiledExplicit, value)))
        t = type.multi && type.representName ? type.representName(value) : type.tag;
    }
    if (type?.represent) {
      const style = styles[type.tag] || type.defaultStyle;
      const represent: any = type.represent;
      out =
        kindOf(represent) === "Function"
          ? type.represent(value, style)
          : Object.hasOwn(represent, style)
            ? represent[style](value, style)
            : fail(`!<${type.tag}> tag resolver accepts not "${style}" style`);
    }

    const kind = typeof out === "string" ? "String" : kindOf(out);
    const isMap = kind === "Object";
    const isSeq = kind === "Array";
    const inBlock = block;
    if (block) block = flowLevel < 0 || flowLevel > level;
    const ref = isMap || isSeq ? refs.get(value) : undefined;
    const tagged = t !== null && t !== "?";
    if (tagged || ref || (indent !== 2 && level > 0)) compact = false;
    if (ref && used.has(ref)) out = `*${ref}`;
    else {
      const anchor = ref ? `&${ref}` : "";
      if (ref) used.add(ref);
      if (isMap || isSeq)
        out =
          block && (isMap ? Object.keys(out) : out).length !== 0
            ? anchor +
              collection(
                isSeq && o.noArrayIndent && !inSeq && level > 0 ? level - 1 : level,
                out,
                isSeq,
                true,
                compact,
              )
            : (anchor && `${anchor} `) + collection(level, out, isSeq);
      else if (kind === "String") {
        if (t !== "?") out = scalar(out, level, key, inBlock);
      } else if (kind === "Undefined" || o.skipInvalid) return;
      else fail(`unacceptable kind of an object to dump [object ${kind}]`);
      if (tagged) out = `${tagName(t)} ${out}`;
    }
    tag = t;
    return out;
  };

  const out = node(0, replacer ? replacer.call({ "": input }, "", input) : input, true, true);
  return out === undefined ? "" : `${out}\n`;
}
