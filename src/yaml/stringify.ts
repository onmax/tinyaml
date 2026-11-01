// The `yaml` package's `stringify`, ported to plain functions. Values first
// become a small node tree, as in yaml, so repeated objects get their
// anchors in creation order; then the tree is written with yaml's rules for
// string styles, line folding, flow and block collections.
import { getTags, merge, timestamp, Y, type CustomTags, type Tag } from "./tags.ts";

type Replacer = ((this: unknown, key: any, value: any) => unknown) | (string | number)[];

export interface StringifyOptions {
  /** Repeated objects become anchors and aliases. Default true. */
  aliasDuplicateObjects?: boolean;
  /** Default "a", for anchors a1, a2... */
  anchorPrefix?: string;
  /** Write the top-level collection in flow style. */
  flow?: boolean;
  /** Keep object properties whose value is undefined, as null. */
  keepUndefined?: boolean | null;
  /** Sort map entries; `true` compares keys with `<`. */
  sortMapEntries?: boolean | ((a: Pair, b: Pair) => number);
  /** Schema whose plain scalars get quoted when they're strings. Default "core". */
  schema?: string;
  customTags?: CustomTags;
  merge?: boolean;
  version?: "1.1" | "1.2" | "next";
  blockQuote?: boolean | "folded" | "literal";
  collectionStyle?: "any" | "block" | "flow";
  defaultKeyType?: StringType | null;
  defaultStringType?: StringType;
  /** Start the document with `---`. */
  directives?: boolean | null;
  doubleQuotedAsJSON?: boolean;
  doubleQuotedMinMultiLineLength?: number;
  falseStr?: string;
  flowCollectionPadding?: boolean;
  indent?: number;
  indentSeq?: boolean;
  lineWidth?: number;
  minContentWidth?: number;
  nullStr?: string;
  simpleKeys?: boolean;
  singleQuote?: boolean | null;
  trailingComma?: boolean;
  trueStr?: string;
  verifyAliasOrder?: boolean;
  toStringDefaults?: StringifyOptions;
  [option: string]: unknown;
}

type StringType = "BLOCK_FOLDED" | "BLOCK_LITERAL" | "PLAIN" | "QUOTE_DOUBLE" | "QUOTE_SINGLE";

// A scalar has `value`, an alias `source`, a collection `seq` or `map`.
// Like yaml's nodes, it converts to a string for `a.key < b.key` comparisons.
class Node {
  declare source?: string;
  declare value?: unknown;
  declare seq?: Node[];
  declare map?: Pair[];
  declare anchor?: string | undefined;
  declare flow?: boolean;
  constructor(init: Partial<Node>) {
    Object.assign(this, init);
  }
  toString(): string {
    return keyText(this);
  }
}

/** What a `sortMapEntries` function compares. */
export interface Pair {
  key: Node;
  value: Node;
}

interface Context {
  anchors: Set<string>;
  indent: string;
  indentStep: string;
  inFlow: boolean | null;
  flowCollectionPadding: string;
  options: StringifyOptions & typeof DEFAULTS;
  tags: Tag[];
  implicitKey?: boolean;
  indentAtStart?: number;
}

const DEFAULTS = {
  blockQuote: true as StringifyOptions["blockQuote"],
  defaultKeyType: null as StringType | null,
  defaultStringType: "PLAIN" as StringType,
  directives: null as boolean | null,
  doubleQuotedAsJSON: false,
  doubleQuotedMinMultiLineLength: 40,
  falseStr: "false",
  flowCollectionPadding: true,
  indentSeq: true,
  lineWidth: 80,
  minContentWidth: 20,
  nullStr: "null",
  simpleKeys: false,
  singleQuote: null as boolean | null,
  trailingComma: false,
  trueStr: "true",
  verifyAliasOrder: true,
};

const isCollection = (node: Node) => !!(node.seq ?? node.map);

interface Builder {
  aliasDuplicateObjects: boolean;
  keepUndefined: boolean;
  replacer: Replacer | undefined;
  sort: ((a: Pair, b: Pair) => number) | null;
  prefix: string;
  /** The YAML 1.1 schema writes Dates as timestamps. */
  dates: boolean;
  /** undefined becomes null, unless the schema has no null. */
  nulls: boolean;
  sources: Map<object, Node>;
  aliases: number;
}

function createNode(value: any, b: Builder): Node {
  if (
    value instanceof String ||
    value instanceof Number ||
    value instanceof Boolean ||
    value instanceof BigInt
  )
    value = value.valueOf();
  const node = new Node({});
  if (b.aliasDuplicateObjects && value && typeof value === "object") {
    const previous = b.sources.get(value);
    if (previous) {
      previous.anchor ||= `${b.prefix}${++b.aliases}`;
      node.source = previous.anchor;
      return node;
    }
    b.sources.set(value, node);
  }
  const scalar =
    value == null ||
    ["string", "number", "bigint", "boolean"].includes(typeof value) ||
    (b.dates && value instanceof Date);
  if (scalar) node.value = value === undefined && b.nulls ? null : value;
  else {
    if (typeof value.toJSON === "function") value = value.toJSON();
    if (!value || typeof value !== "object") node.value = value;
    else if (!(value instanceof Map) && Symbol.iterator in value) {
      node.seq = [];
      let i = 0;
      for (let item of value) {
        if (typeof b.replacer === "function")
          item = b.replacer.call(value, value instanceof Set ? item : String(i++), item);
        node.seq.push(createNode(item, b));
      }
    } else {
      node.map = [];
      for (const key of value instanceof Map ? value.keys() : Object.keys(value)) {
        const entry = value instanceof Map ? value.get(key) : value[key];
        const item = typeof b.replacer === "function" ? b.replacer.call(value, key, entry) : entry;
        if (Array.isArray(b.replacer) && !b.replacer.includes(key as string)) continue;
        if (item !== undefined || b.keepUndefined)
          node.map.push({ key: createNode(key, b), value: createNode(item, b) });
      }
      if (b.sort) node.map.sort(b.sort);
    }
  }
  return node;
}

// What yaml's `a.key < b.key` compares: a node's string form.
function keyText(node: Node): string {
  const plain = (n: Node): unknown =>
    n.source !== undefined
      ? { source: n.source }
      : n.seq
        ? n.seq.map(plain)
        : n.map
          ? Object.fromEntries(n.map.map((p) => [keyText(p.key), plain(p.value)]))
          : typeof n.value === "bigint"
            ? Number(n.value)
            : n.value;
  return node.source !== undefined
    ? `*${node.source}`
    : "value" in node
      ? String(node.value)
      : JSON.stringify(plain(node));
}

function builder(options: StringifyOptions, tags: Tag[], replacer?: Replacer): Builder {
  const sort = options.sortMapEntries;
  return {
    aliasDuplicateObjects: options.aliasDuplicateObjects ?? true,
    keepUndefined: options.keepUndefined ?? false,
    replacer,
    sort:
      typeof sort === "function"
        ? sort
        : sort === true
          ? (a, b) => {
              const x = keyText(a.key);
              const y = keyText(b.key);
              return x < y ? -1 : x > y ? 1 : 0;
            }
          : null,
    prefix: options.anchorPrefix || "a",
    dates: tags.includes(timestamp),
    nulls: tags.some((t) => t.tag === `${Y}null`),
    sources: new Map(),
    aliases: 0,
  };
}

function context(options: StringifyOptions, tags: Tag[]): Context {
  const opt: Context["options"] = { ...DEFAULTS, ...options.toStringDefaults, ...options } as never;
  const style = opt.collectionStyle;
  return {
    anchors: new Set(),
    indent: "",
    indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
    inFlow: style === "block" ? false : style === "flow" ? true : null,
    flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
    options: opt,
    tags,
  };
}

function checkAnchor(anchor: string): void {
  if (/[\x00-\x19\s,[\]{}]/.test(anchor))
    throw new Error(
      `Anchor must not contain whitespace or control characters: ${JSON.stringify(anchor)}`,
    );
}

function write(node: Node, ctx: Context): string {
  if (node.source !== undefined) {
    const src = `*${node.source}`;
    checkAnchor(node.source);
    if (ctx.options.verifyAliasOrder && !ctx.anchors.has(node.source))
      throw new Error(`Unresolved alias (the anchor must be set before the alias): ${node.source}`);
    return ctx.implicitKey ? `${src} ` : src;
  }
  let props = "";
  if (node.anchor) {
    checkAnchor(node.anchor);
    ctx.anchors.add(node.anchor);
    props = `&${node.anchor}`;
    ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
  }
  let str: string;
  if (node.seq) str = collection(node, node.seq, ctx, false);
  else if (node.map) str = collection(node, node.map, ctx, true);
  else {
    // Any scalar; `tag` below tells which, and each branch uses it as that.
    const value = node.value as any;
    const type = typeof value;
    const tag =
      value == null
        ? "null"
        : type === "string"
          ? "str"
          : type === "boolean"
            ? "bool"
            : type === "bigint" || Number.isInteger(value)
              ? "int"
              : type === "number"
                ? "float"
                : value instanceof Date
                  ? "timestamp"
                  : "";
    const name = Y + tag;
    if (!ctx.tags.some((t) => t.tag === name))
      throw new Error(
        `Tag not resolved for ${value?.constructor?.name ?? (value === null ? "null" : typeof value)} value`,
      );
    // With merge keys on, "<<" is the merge key's own tag, written plain.
    if (value === "<<" && ctx.tags.includes(merge)) str = value;
    // The JSON schema writes every scalar as JSON.
    else if (ctx.tags.some((t) => t.tag === ""))
      str = tag === "int" ? String(value) : JSON.stringify(value ?? null);
    else if (value instanceof Date) str = value.toISOString().replace(/(T00:00:00)?\.000Z$/, "");
    else if (tag === "str") str = stringifyString(value, ctx);
    else if (tag === "null") str = ctx.options.nullStr;
    else if (tag === "bool") str = value ? ctx.options.trueStr : ctx.options.falseStr;
    else if (type === "bigint") str = String(value);
    else if (!isFinite(value)) str = isNaN(value) ? ".nan" : value < 0 ? "-.inf" : ".inf";
    else str = Object.is(value, -0) ? "-0" : JSON.stringify(value);
  }
  if (!props) return str;
  return "value" in node || str[0] === "{" || str[0] === "["
    ? `${props} ${str}`
    : `${props}\n${ctx.indent}${str}`;
}

function collection(node: Node, items: (Node | Pair)[], ctx: Context, isMap: boolean): string {
  const [start, end] = isMap ? "{}" : "[]";
  if (!items.length) return start! + end!;
  const flow = ctx.inFlow ?? node.flow;
  const { indent, indentStep, options, flowCollectionPadding: pad } = ctx;
  const itemCtx: Context = {
    ...ctx,
    indent: indent + (isMap ? "" : "  ") + (flow ? indentStep : ""),
    inFlow: flow ? true : ctx.inFlow,
  };
  let width = 2;
  let newline = false;
  const lines = items.map((it, i) => {
    let text = isMap ? stringifyPair(it as Pair, itemCtx) : write(it as Node, itemCtx);
    if (!flow) return (isMap ? "" : "- ") + text;
    newline ||= text.includes("\n");
    if (i < items.length - 1) text += ",";
    else if (
      options.trailingComma &&
      (newline || (options.lineWidth > 0 && width + text.length + 2 > options.lineWidth))
    ) {
      newline = true;
      text += ",";
    }
    width += text.length + 2;
    return text;
  });
  if (!flow) return lines.join(`\n${indent}`);
  if (!newline && !(options.lineWidth > 0 && width > options.lineWidth))
    return `${start}${pad}${lines.join(" ")}${pad}${end}`;
  return (
    start +
    lines.map((line) => (line ? `\n${indentStep}${indent}${line}` : "\n")).join("") +
    `\n${indent}${end}`
  );
}

function stringifyPair({ key, value }: Pair, parent: Context): string {
  const {
    indent,
    indentStep,
    options: { indentSeq, simpleKeys },
  } = parent;
  if (simpleKeys && isCollection(key))
    throw new Error("With simple keys, collection cannot be used as a key value");
  let explicitKey = !simpleKeys && !("value" in key);
  const ctx: Context = { ...parent, implicitKey: !explicitKey, indent: indent + indentStep };
  let str = write(key, ctx);
  if (!explicitKey && !ctx.inFlow && str.length > 1024) {
    if (simpleKeys)
      throw new Error(
        "With simple keys, single line scalar must not span more than 1024 characters",
      );
    explicitKey = true;
  }
  str = explicitKey ? `? ${str}\n${indent}:` : `${str}:`;
  ctx.implicitKey = false;
  if (!explicitKey && "value" in value) ctx.indentAtStart = str.length + 1;
  if (
    !indentSeq &&
    indentStep.length >= 2 &&
    !ctx.inFlow &&
    !explicitKey &&
    value.seq &&
    !value.flow &&
    !value.anchor
  )
    ctx.indent = ctx.indent.substring(2);
  const valueStr = write(value, ctx);
  let ws = " ";
  if (!explicitKey && isCollection(value)) {
    const nl0 = valueStr.indexOf("\n");
    const flow = ctx.inFlow ?? value.flow ?? (value.seq ?? value.map)!.length === 0;
    if (nl0 !== -1 || !flow) {
      let propsLine = false;
      if (nl0 !== -1 && valueStr[0] === "&") {
        const sp0 = valueStr.indexOf(" ");
        propsLine = sp0 === -1 || nl0 < sp0;
      }
      if (!propsLine) ws = `\n${ctx.indent}`;
    }
  } else if (valueStr === "" || valueStr[0] === "\n") ws = "";
  return str + ws + valueStr;
}

const STR = `${Y}str`;
const FOLD_FLOW = 0;
const FOLD_BLOCK = 1;
const FOLD_QUOTED = 2;

const containsDocumentMarker = (str: string) => /^(%|---|\.\.\.)/m.test(str);

function lineLengthOverLimit(str: string, width: number, indent: number): boolean {
  return width > 0 && str.split("\n").some((line) => line.length > width - indent);
}

// JSON escapes control characters and lone surrogates as \uXXXX; these
// control characters have a short escape.
const SHORT_ESCAPES: Record<string, string> = {
  "0000": "\\0",
  "0007": "\\a",
  "000b": "\\v",
  "001b": "\\e",
};

function doubleQuoted(value: string, ctx: Context): string {
  const json = JSON.stringify(value);
  if (ctx.options.doubleQuotedAsJSON) return json;
  const { implicitKey } = ctx;
  const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
  const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
  const str = json.replace(/ ?\\n(?:\\n)*|\\u[0-9a-f]{4}|\\./g, (escape, offset: number) => {
    if (escape.startsWith("\\u")) {
      const code = escape.slice(2);
      return SHORT_ESCAPES[code] ?? (code.startsWith("00") ? `\\x${code.slice(2)}` : escape);
    }
    const space = escape[0] === " ";
    const prefix = space ? "\\ " : "";
    const run = space ? escape.slice(1) : escape;
    if (!run.startsWith("\\n")) return escape;
    if (implicitKey || json.length < minMultiLineLength) return prefix + run;
    // Keep the final escaped newline before the closing quote.
    const last = json[offset + escape.length] === '"';
    const count = run.length / 2 - Number(last);
    return (
      prefix +
      (count
        ? "\n".repeat(count + 1) + indent + (json[offset + escape.length] === " " ? "\\" : "")
        : "") +
      (last ? "\\n" : "")
    );
  });
  return implicitKey ? str : fold(str, indent, FOLD_QUOTED, ctx);
}

function singleQuoted(value: string, ctx: Context): string {
  if (
    ctx.options.singleQuote === false ||
    (ctx.implicitKey && value.includes("\n")) ||
    /[ \t]\n|\n[ \t]/.test(value)
  )
    return doubleQuoted(value, ctx);
  const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
  const res = `'${value.replace(/'/g, "''").replace(/\n+/g, `$&\n${indent}`)}'`;
  return ctx.implicitKey ? res : fold(res, indent, FOLD_FLOW, ctx);
}

function quoted(value: string, ctx: Context): string {
  // The quote the value doesn't hold, else the one asked for; singleQuoted
  // turns to double quotes when single ones are off.
  const hasDouble = value.includes('"');
  return (hasDouble !== value.includes("'") ? hasDouble : ctx.options.singleQuote)
    ? singleQuoted(value, ctx)
    : doubleQuoted(value, ctx);
}

const blockEndNewlines = /(^|(?<!\n))\n+(?!\n|$)/g;

// `force` indents a top-level scalar whatever it holds.
function blockString(value: string, ctx: Context, force?: boolean): string {
  const { blockQuote, lineWidth } = ctx.options;
  if (!blockQuote || /\n[\t ]+$/.test(value)) return quoted(value, ctx);
  const indent = ctx.indent || (force || containsDocumentMarker(value) ? "  " : "");
  const literal =
    blockQuote === "literal"
      ? true
      : blockQuote === "folded"
        ? false
        : !lineLengthOverLimit(value, lineWidth, indent.length);
  if (!value) return literal ? "|\n" : ">\n";
  let chomp: string;
  let end = /[\n\t ]*$/.exec(value)![0];
  const endNlPos = end.indexOf("\n");
  if (endNlPos === -1) chomp = "-";
  else if (value === end || endNlPos !== end.length - 1) chomp = "+";
  else chomp = "";
  if (end) {
    value = value.slice(0, -end.length);
    if (end[end.length - 1] === "\n") end = end.slice(0, -1);
    end = end.replace(blockEndNewlines, `$&${indent}`);
  }
  const leading = /^[ \n]*/.exec(value)![0];
  const startWithSpace = leading.includes(" ");
  let start = leading.slice(0, leading.lastIndexOf("\n") + 1);
  if (start) {
    value = value.substring(start.length);
    start = start.replace(/\n+/g, `$&${indent}`);
  }
  const header = (startWithSpace ? (indent ? "2" : "1") : "") + chomp;
  if (!literal) {
    const foldedValue = value
      .replace(/\n+/g, "\n$&")
      .replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2")
      .replace(/\n+/g, `$&${indent}`);
    const text = `${start}${foldedValue}${end}`;
    const body = fold(text, indent, FOLD_BLOCK, ctx, blockQuote !== "folded");
    // An empty body is one too, not the overflow.
    if (body || !text) return `>${header}\n${indent}${body}`;
  }
  value = value.replace(/\n+/g, `$&${indent}`);
  return `|${header}\n${indent}${start}${value}${end}`;
}

function plainString(value: string, ctx: Context): string {
  const { implicitKey, indent, indentStep, inFlow } = ctx;
  const multiline = value.includes("\n");
  if ((implicitKey && multiline) || (inFlow && /[[\]{},]/.test(value))) return quoted(value, ctx);
  // Leading or trailing white space, an indicator, or a sequence that would
  // end the scalar early.
  if (
    /^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)
  )
    return implicitKey || inFlow || !multiline ? quoted(value, ctx) : blockString(value, ctx);
  if (!implicitKey && !inFlow && multiline) return blockString(value, ctx);
  if (containsDocumentMarker(value)) {
    if (indent === "") return blockString(value, ctx, true);
    if (implicitKey && indent === indentStep) return quoted(value, ctx);
  }
  const str = multiline ? value.replace(/\n+/g, `$&\n${indent}`) : value;
  // Strings that would be read back as something else, like `true` or `42`.
  if (ctx.tags.some((t) => t.default && t.tag !== STR && t.test?.test(str)))
    return quoted(value, ctx);
  return implicitKey ? str : fold(str, indent, FOLD_FLOW, ctx);
}

function stringifyString(value: string, ctx: Context): string {
  const { implicitKey, inFlow } = ctx;
  if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(value))
    return doubleQuoted(value, ctx);
  const type = (implicitKey && ctx.options.defaultKeyType) || ctx.options.defaultStringType;
  switch (type) {
    case "BLOCK_FOLDED":
    case "BLOCK_LITERAL":
      return implicitKey || inFlow ? quoted(value, ctx) : blockString(value, ctx);
    case "QUOTE_DOUBLE":
      return doubleQuoted(value, ctx);
    case "QUOTE_SINGLE":
      return singleQuoted(value, ctx);
    case "PLAIN":
      return plainString(value, ctx);
    default:
      throw new Error(`Unsupported default string type ${type as string}`);
  }
}

// Keeps lines within `lineWidth`, splitting only at single spaces between
// non-space characters, or anywhere in double-quoted strings. With
// `literal`, a line it can't fit returns "" for a literal block instead.
function fold(text: string, indent: string, mode: number, ctx: Context, literal?: boolean): string {
  const indentAtStart = mode === FOLD_BLOCK ? ctx.indent.length : ctx.indentAtStart;
  const { lineWidth } = ctx.options;
  let { minContentWidth } = ctx.options;
  if (!lineWidth || lineWidth < 0) return text;
  if (lineWidth < minContentWidth) minContentWidth = 0;
  const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
  if (text.length <= endStep) return text;
  const folds: number[] = [];
  const escapedFolds: Record<number, boolean> = {};
  let end = lineWidth - indent.length;
  if (typeof indentAtStart === "number") {
    if (indentAtStart > lineWidth - Math.max(2, minContentWidth)) folds.push(0);
    else end = lineWidth - indentAtStart;
  }
  let split: number | undefined;
  let prev: string | undefined;
  let overflow = false;
  let i = -1;
  let escStart = -1;
  let escEnd = -1;
  if (mode === FOLD_BLOCK) {
    i = consumeMoreIndentedLines(text, i, indent.length);
    if (i !== -1) end = i + endStep;
  }
  for (let ch: string | undefined; (ch = text[(i += 1)]);) {
    if (mode === FOLD_QUOTED && ch === "\\") {
      escStart = i;
      i += text[i + 1] === "x" ? 3 : text[i + 1] === "u" ? 5 : text[i + 1] === "U" ? 9 : 1;
      escEnd = i;
    }
    if (ch === "\n") {
      if (mode === FOLD_BLOCK) i = consumeMoreIndentedLines(text, i, indent.length);
      end = i + indent.length + endStep;
      split = undefined;
    } else {
      if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "\t") {
        const next = text[i + 1];
        if (next && next !== " " && next !== "\n" && next !== "\t") split = i;
      }
      if (i >= end) {
        if (split) {
          folds.push(split);
          end = split + endStep;
          split = undefined;
        } else if (mode === FOLD_QUOTED) {
          // White space at the end may stretch past lineWidth.
          while (prev === " " || prev === "\t") {
            prev = ch;
            ch = text[(i += 1)];
            overflow = true;
          }
          // Break before the escaped newline, or before the escape it would split.
          const j = i > escEnd + 1 ? i - 2 : escStart - 1;
          // Folding here again means the width can't fit an escape: give up.
          if (escapedFolds[j]) return text;
          folds.push(j);
          escapedFolds[j] = true;
          end = j + endStep;
          split = undefined;
        } else overflow = true;
      }
    }
    prev = ch;
  }
  if (overflow && literal) return "";
  if (folds.length === 0) return text;
  let res = text.slice(0, folds[0]);
  for (let i = 0; i < folds.length; ++i) {
    const fold = folds[i]!;
    const end = folds[i + 1] || text.length;
    if (fold === 0) res = `\n${indent}${text.slice(0, end)}`;
    else {
      if (mode === FOLD_QUOTED && escapedFolds[fold]) res += `${text[fold]}\\`;
      res += `\n${indent}${text.slice(fold + 1, end)}`;
    }
  }
  return res;
}

// `i + 1` is at the start of a line; returns the index of the last newline
// in the more-indented block that starts there.
function consumeMoreIndentedLines(text: string, i: number, indent: number): number {
  let end = i;
  let start = i + 1;
  let ch = text[start];
  while (ch === " " || ch === "\t") {
    if (i < start + indent) ch = text[++i];
    else {
      do ch = text[++i];
      while (ch && ch !== "\n");
      end = i;
      start = i + 1;
      ch = text[start];
    }
  }
  return end;
}

/** A collection key as yaml writes it into a JS object: in flow style. */
export function stringifyKey(key: object): string {
  if (key instanceof Date || key instanceof Uint8Array) return String(key);
  const node = createNode(key, builder({}, []));
  const ctx = context({}, getTags(null, "core"));
  ctx.inFlow = true;
  return (node.seq ?? node.map)
    ? collection(node, (node.seq ?? node.map)!, ctx, !!node.map)
    : write(node, ctx);
}

/**
 * YAML text for `value`, undefined when `value` is undefined. A number or
 * string as `options` sets the indent.
 */
export function stringify(
  value: unknown,
  replacer?: Replacer | StringifyOptions | null,
  options?: StringifyOptions | string | number,
): string {
  let fn: Replacer | undefined;
  if (typeof replacer === "function" || Array.isArray(replacer)) fn = replacer;
  else if (options === undefined && replacer) options = replacer;
  if (typeof options === "string") options = options.length;
  if (typeof options === "number") {
    const indent = Math.round(options);
    options = indent < 1 ? undefined : indent > 8 ? { indent: 8 } : { indent };
  }
  if (value === undefined) {
    const { keepUndefined } = (options ?? replacer ?? {}) as StringifyOptions;
    if (!keepUndefined) return undefined as never;
  }
  const opt: StringifyOptions = options ?? {};
  const v11 = opt.version === "1.1";
  const tags = getTags(opt.customTags, opt.schema ?? (v11 ? "yaml-1.1" : "core"), opt.merge);
  if (Array.isArray(fn)) {
    const strings = fn
      .filter((v: unknown) => typeof v === "number" || v instanceof String || v instanceof Number)
      .map(String);
    if (strings.length) fn = fn.concat(strings);
  }
  const b = builder(opt, tags, fn);
  let node = new Node({ value: null });
  if (value !== undefined) {
    if (typeof fn === "function") value = fn.call({ "": value }, "", value);
    node = createNode(value, b);
  }
  if (opt.flow && isCollection(node)) node.flow = true;
  if ("indent" in opt && (!Number.isInteger(opt.indent) || Number(opt.indent) <= 0))
    throw new Error(
      `"indent" option must be a positive integer, not ${JSON.stringify(opt.indent)}`,
    );
  const ctx = context(opt, tags);
  const body = write(node, ctx);
  return `${ctx.options.directives === true ? `---${/^[|>]/.test(body) ? " " : "\n"}` : ""}${body}\n`;
}
