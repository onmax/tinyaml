// js-yaml 5's `dump`, byte for byte. Like js-yaml 5 it turns the value into
// the same AST first, so `transform` sees the nodes it expects, then picks a
// style for each scalar with the same rules and renders.
import { YAMLException } from "./error.ts";
import { DUMP_SCHEMA, type Schema } from "./schema.ts";
import { isPlainObject, mapTag, strTag, Y, type TagDefinition } from "./tags.ts";

// Plain constants inside, which the minifier inlines.
export const PLAIN = 1;
export const SINGLE_QUOTED = 2;
export const DOUBLE_QUOTED = 3;
export const LITERAL_BLOCK = 4;
export const FOLDED_BLOCK = 5;
export const BLOCK = 1;
export const FLOW = 2;

export const SCALAR_STYLE = {
  PLAIN,
  SINGLE_QUOTED,
  DOUBLE_QUOTED,
  LITERAL_BLOCK,
  FOLDED_BLOCK,
} as const;
export const COLLECTION_STYLE = { BLOCK, FLOW } as const;

export type ScalarStyle = (typeof SCALAR_STYLE)[keyof typeof SCALAR_STYLE];
export type CollectionStyle = (typeof COLLECTION_STYLE)[keyof typeof COLLECTION_STYLE];

interface NodeBase {
  tag: string;
  tagged: boolean;
  anchor?: string;
}
export interface ScalarNode extends NodeBase {
  kind: "scalar";
  style: ScalarStyle;
  value: string;
}
export interface SequenceNode extends NodeBase {
  kind: "sequence";
  style: CollectionStyle;
  items: Node[];
}
export interface MappingNode extends NodeBase {
  kind: "mapping";
  style: CollectionStyle;
  items: Array<{ key: Node; value: Node }>;
}
export interface AliasNode {
  kind: "alias";
  anchor: string;
}
export type Node = ScalarNode | SequenceNode | MappingNode | AliasNode;
export interface Document {
  contents: Node | null;
  explicitStart?: boolean;
  explicitEnd?: boolean;
  directives: Array<
    { kind: "yaml"; version: string } | { kind: "tag"; handle: string; prefix: string }
  >;
}

export interface ScalarLayout {
  readonly node: Readonly<ScalarNode>;
  readonly parent: Readonly<Node> | null;
  readonly level: number;
  readonly isKey: boolean;
  readonly flowOnly: boolean;
  readonly shiftOfParent: number;
  readonly shiftOfContent: number;
  readonly shiftOfFirstLine: number;
  readonly presenterOptions: Readonly<Required<PresenterOptions>>;
  /** Bit `1 << style` is set for each style that can represent the value. */
  allowedStylesMask: number;
  style: ScalarStyle;
}
export type ScalarStyleRule = (layout: ScalarLayout) => void;

export interface PresenterOptions {
  schema?: Schema;
  /** Spaces per level. Default 2. */
  indent?: number;
  /** Don't indent sequences inside mappings. */
  seqNoIndent?: boolean;
  /** Start a nested collection on the `-` line. Default true. */
  seqInlineFirst?: boolean;
  /** Width to fold long strings at, -1 for none. Default 80. */
  lineWidth?: number;
  /** `{ a: 1 }` instead of `{a: 1}`. */
  flowBracketPadding?: boolean;
  /** `[1,2]` instead of `[1, 2]`. */
  flowSkipCommaSpace?: boolean;
  /** `{"a":1}`; quotes flow keys. */
  flowSkipColonSpace?: boolean;
  quoteFlowKeys?: boolean;
  /** Quote for strings that need one. Default 'single'. */
  quoteStyle?: "single" | "double";
  /** Quote every string value. */
  forceQuotes?: boolean;
  /** Replace the default scalar style rules. */
  scalarStyleRules?: readonly ScalarStyleRule[];
  /** `!!set &ref_0` instead of `&ref_0 !!set`. */
  tagBeforeAnchor?: boolean;
}

export interface DumpOptions extends PresenterOptions {
  /** Skip values YAML can't represent instead of throwing. */
  skipInvalid?: boolean;
  /** Repeat shared objects instead of writing anchors and aliases. */
  noRefs?: boolean;
  /** Depth from which collections are written in flow style; -1 for never. */
  flowLevel?: number;
  /** @deprecated Use `transform`. */
  sortKeys?: boolean | ((a: any, b: any) => number);
  /** Changes the AST before it's rendered. */
  transform?: (documents: Document[]) => void;
}

const hasBit = (mask: number, bit: number) => (mask & (1 << bit)) !== 0;
// The narrowest a folded scalar gets, whatever the indentation.
const MIN_WIDTH = 40;

const hex = (byte: number) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;

// js-yaml 5's percent-encoding of tag characters YAML doesn't allow bare.
function percent(source: string, allowed: string): string {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    let ch = source.charCodeAt(i);
    if (/[\da-zA-Z]/.test(source[i]!) || allowed.includes(source[i]!)) {
      result += source[i];
      continue;
    }
    if (ch >= 0xd800 && ch <= 0xdbff)
      ch = 0x10000 + ((ch & 0x3ff) << 10) + (source.charCodeAt(++i) & 0x3ff);
    // UTF-8: a lead byte whose high bits count the bytes, then 6 bits in each.
    let n = ch < 0x80 ? 0 : ch < 0x800 ? 1 : ch < 0x10000 ? 2 : 3;
    result += hex(n ? ((0xff00 >> (n + 1)) & 0xff) | (ch >> (6 * n)) : ch);
    while (n--) result += hex(0x80 | ((ch >> (6 * n)) & 63));
  }
  return result;
}

const SUFFIX_CHARS = "-#;/?:@&=+$_.~*'()";

function shortTag(tag: string): string {
  if (tag[0] === "!") return `!${percent(tag.slice(1), SUFFIX_CHARS)}`;
  if (tag.startsWith(Y)) return `!!${percent(tag.slice(18), SUFFIX_CHARS)}`;
  return `!<${percent(tag, `${SUFFIX_CHARS}!,[]`)}>`;
}

// Tags in the order `build` tries them, with whether each is implicit:
// implicit scalars first, defaults last, so a custom tag on a plain object wins.
const typeCache = new WeakMap<Schema, Array<[TagDefinition, boolean]>>();
function typesOf(schema: Schema): Array<[TagDefinition, boolean]> {
  let types = typeCache.get(schema);
  if (types) return types;
  const defaults = new Set(
    [schema.defaultScalarTag, schema.defaultSequenceTag, schema.defaultMappingTag].filter(Boolean),
  );
  const implicit = (tag: TagDefinition) =>
    (tag.nodeKind === "scalar" && tag.implicit) || defaults.has(tag);
  types = [
    ...schema.implicitScalarTags,
    ...schema.tags.filter((tag) => !implicit(tag)),
    ...schema.tags.filter((tag) => defaults.has(tag)),
  ].map((tag): [TagDefinition, boolean] => [tag, implicit(tag)]);
  typeCache.set(schema, types);
  return types;
}

// AST from a JS value. A repeated object becomes an alias, and its first
// occurrence gets an anchor.
function toAst(input: unknown, schema: Schema, noRefs: boolean, skipInvalid: boolean): Document[] {
  const types = typesOf(schema);
  // No tag in the default schema before !!str takes a string, or an array or
  // a plain object that doesn't claim another kind, which !!seq and !!map
  // right after it do, so skip to it.
  const strAt = schema === DUMP_SCHEMA ? types.findIndex(([tag]) => tag === strTag) : 0;
  const refs = new Map<unknown, Node>();
  let counter = 0;
  const INVALID = Symbol();

  const build = (object: unknown): Node | typeof INVALID => {
    if (!noRefs && object !== null && typeof object === "object") {
      const existing = refs.get(object) as SequenceNode | MappingNode | undefined;
      if (existing) {
        existing.anchor ??= `ref_${counter++}`;
        return { kind: "alias", anchor: existing.anchor };
      }
    }
    let i =
      typeof object === "string" ||
      ((Array.isArray(object) || isPlainObject(object)) &&
        !(Symbol.toStringTag in (object as object)))
        ? strAt
        : 0;
    while (i < types.length && !types[i]![0].identify(object)) i++;
    const type = types[i];
    if (!type) {
      if (object === undefined || skipInvalid) return INVALID;
      throw new YAMLException(
        `unacceptable kind of an object to dump ${Object.prototype.toString.call(object)}`,
      );
    }
    const tag = type[0];
    const name = tag.matchByTagPrefix ? tag.representTagName(object) : tag.tagName;
    const nodeTag = type[1] ? name : shortTag(name);
    const tagged = !type[1];
    if (tag.nodeKind === "scalar")
      return {
        kind: "scalar",
        tag: nodeTag,
        tagged,
        style: PLAIN,
        value: tag === strTag ? (object as string) : tag.represent(object),
      };
    if (tag.nodeKind === "sequence") {
      const list = tag.represent(object);
      const node: SequenceNode = {
        kind: "sequence",
        tag: nodeTag,
        tagged,
        style: BLOCK,
        items: [],
      };
      if (!noRefs) refs.set(object, node);
      for (let i = 0, n = list.length; i < n; i++) {
        let item = build(list[i]);
        // An undefined item becomes null; an invalid null is then skipped.
        if (item === INVALID && list[i] === undefined) item = build(null);
        if (item !== INVALID) node.items.push(item);
      }
      return node;
    }
    // A plain object's keys and values without the Map `represent` wraps them
    // in, but read all before any is built, as `represent` reads them.
    const map = tag.represent === mapTag.represent ? null : tag.represent(object);
    const keys = map ? null : Object.keys(object as object);
    const values = keys?.map((key) => (object as any)[key]);
    const node: MappingNode = { kind: "mapping", tag: nodeTag, tagged, style: BLOCK, items: [] };
    if (!noRefs) refs.set(object, node);
    const add = (k: unknown, v: unknown) => {
      const key = build(k);
      if (key === INVALID) return;
      const value = build(v);
      if (value !== INVALID) node.items.push({ key, value });
    };
    if (keys) for (let i = 0; i < keys.length; i++) add(keys[i], values![i]);
    else for (const [k, v] of map!) add(k, v);
    return node;
  };

  const root = build(input);
  return [{ contents: root === INVALID ? null : root, directives: [] }];
}

// Calls `visitor` on every node, depth first; returning true skips the
// node's children.
function visit(documents: Document[], visitor: (node: Node, depth: number) => boolean | void) {
  const walk = (node: Node, depth: number): void => {
    if (visitor(node, depth)) return;
    if (node.kind === "sequence") for (const item of node.items) walk(item, depth + 1);
    else if (node.kind === "mapping")
      for (const { key, value } of node.items) {
        walk(key, depth + 1);
        walk(value, depth + 1);
      }
  };
  for (const doc of documents) if (doc.contents) walk(doc.contents, 0);
}

// ns-plain(n,c) projected to the loaded value, where each run of line
// breaks reads back one shorter: text of ns-chars, spaces and breaks that
// starts with a non-indicator, or `?`, `:` or `-` before a non-space, with
// no `#` after a space or break, no `:` before one or the end, no space
// next to a break and none at the end. A key has no break, and flow text
// no flow indicator.
const PLAIN_START = /^(?:[^-?:,[\]{}#&*!|>'"%@` \t\n]|[?:-][^ \t\n])/;
const NOT_PLAIN = /[ \t\n]#|:(?![^ \t\n])|[ \t\n]$|[ \t]\n|\n[ \t]/;
// Most text is one line of printable ASCII, which passes every check of
// characters, so it skips the slower Unicode classes.
const NOT_ASCII = /[^\t\x20-\x7E]/;
const SINGLE_KEY = /^[\t\x20-\uD7FF\uE000-\uFFFF\u{10000}-\u{10FFFF}]*$/u;
const SINGLE = /^[\t\n\x20-\uD7FF\uE000-\uFFFF\u{10000}-\u{10FFFF}]*$/u;
const BLOCK_CONTENT =
  /^[\t\n\x20-\x7E\x85\xA0-\uD7FF\uE000-\uFEFE\uFF00-\uFFFD\u{10000}-\u{10FFFF}]*$/u;
const FORBIDDEN_FIRST = /^(?:---|\.\.\.)(?=$|[ \t\n\r])/;
const FORBIDDEN = /^(?:---|\.\.\.)(?=$|[ \t\n\r])/m;
const ESCAPE = /["\\\x00-\x1F\x7F-\xA0\u2028\u2029\uD800-\uDFFF\uFEFF\uFFFE\uFFFF]/gu;
// The characters with a short escape, and their letters in the same order.
const ESCAPED = '\0\x07\b\t\n\v\f\r\x1B"\\\x85\xA0\u2028\u2029';
const ESCAPES = '0abtnvfre"\\N_LP';

// Forbidden document markers on a zero-indented continuation line.
const markerAfterBreak = (text: string) => {
  const at = text.indexOf("\n");
  return at >= 0 && FORBIDDEN.test(text.slice(at + 1));
};

function canUsePlain(layout: ScalarLayout, ascii: boolean): boolean {
  const { node, presenterOptions } = layout;
  const text = node.value;
  if (text !== "") {
    if (
      !PLAIN_START.test(text) ||
      NOT_PLAIN.test(text) ||
      (layout.isKey && text.includes("\n")) ||
      (layout.flowOnly && /[,[\]{}]/.test(text)) ||
      !(ascii || BLOCK_CONTENT.test(text))
    )
      return false;
    if (layout.shiftOfFirstLine === 0 && FORBIDDEN_FIRST.test(text)) return false;
    if (layout.shiftOfContent === 0 && markerAfterBreak(text)) return false;
  }
  // Plain text must read back as the same tag, and `=` is YAML 1.1's !!value.
  const resolved = presenterOptions.schema.resolveImplicitScalarTag(text).tag.tagName;
  if (!node.tagged && resolved !== node.tag) return false;
  return (
    node.tagged || text !== "=" || resolved !== presenterOptions.schema.defaultScalarTag.tagName
  );
}

function canUseSingle(layout: ScalarLayout, ascii: boolean): boolean {
  if (ascii) return true;
  const text = layout.node.value;
  if (!(layout.isKey ? SINGLE_KEY : SINGLE).test(text) || /[ \t]\n|\n[ \t]/.test(text))
    return false;
  return layout.isKey || layout.shiftOfContent !== 0 || !markerAfterBreak(text);
}

function canUseBlock(layout: ScalarLayout, ascii: boolean): boolean {
  const text = layout.node.value;
  if (layout.flowOnly || !(ascii || BLOCK_CONTENT.test(text))) return false;
  const indent = layout.shiftOfContent - layout.shiftOfParent;
  if (indent < 1 || (indent > 9 && /^\n* /.test(text))) return false;
  return layout.shiftOfContent !== 0 || !FORBIDDEN.test(text);
}

const preferredQuote = (layout: ScalarLayout): ScalarStyle =>
  layout.presenterOptions.quoteStyle === "single" && hasBit(layout.allowedStylesMask, SINGLE_QUOTED)
    ? SINGLE_QUOTED
    : DOUBLE_QUOTED;

// Room for content on one line, given the indentation.
const available = (layout: ScalarLayout, width: number) =>
  Math.max(Math.min(width, MIN_WIDTH), width - layout.shiftOfContent);

const isPlain = (layout: ScalarLayout) => layout.style === PLAIN;

export const DEFAULT_SCALAR_STYLE_RULES = {
  applyQuoteFlowKeysOption(layout: ScalarLayout): void {
    if (layout.presenterOptions.quoteFlowKeys && layout.isKey && layout.flowOnly && isPlain(layout))
      layout.style = DOUBLE_QUOTED;
  },
  doubleQuoteForInvisibles(layout: ScalarLayout): void {
    if (isPlain(layout) && /[\t\x7F-\xA0\u2028\u2029\uFEFF\uFFFE\uFFFF]/.test(layout.node.value))
      layout.style = DOUBLE_QUOTED;
  },
  doubleQuoteWhitespaceOnly(layout: ScalarLayout): void {
    if (isPlain(layout) && /^\s+$/.test(layout.node.value)) layout.style = DOUBLE_QUOTED;
  },
  applyForceQuotesOption(layout: ScalarLayout): void {
    const { presenterOptions, node } = layout;
    if (!presenterOptions.forceQuotes || layout.isKey || !isPlain(layout)) return;
    if (node.tag !== presenterOptions.schema.defaultScalarTag.tagName) return;
    layout.style = node.value.includes("\n") ? DOUBLE_QUOTED : preferredQuote(layout);
  },
  tryLongOrMultilineAsBlock(layout: ScalarLayout): void {
    if (!isPlain(layout) || layout.isKey) return;
    const text = layout.node.value;
    const multiline = text.includes("\n");
    if (!hasBit(layout.allowedStylesMask, LITERAL_BLOCK)) {
      if (multiline) layout.style = DOUBLE_QUOTED;
      return;
    }
    const width = layout.presenterOptions.lineWidth;
    if (width === -1) {
      if (multiline) layout.style = LITERAL_BLOCK;
      return;
    }
    // Fold when some line is too long and can break at a space.
    const room = available(layout, width);
    const fold =
      text.length > room &&
      text
        .split("\n")
        .some((line) => line.length > room && line[0] !== " " && / [^ \t]/.test(line));
    if (fold) layout.style = FOLDED_BLOCK;
    else if (multiline) layout.style = LITERAL_BLOCK;
  },
  quoteInvalidPlain(layout: ScalarLayout): void {
    if (isPlain(layout) && !hasBit(layout.allowedStylesMask, PLAIN))
      layout.style = preferredQuote(layout);
  },
  fallbackToDoubleQuoted(layout: ScalarLayout): void {
    if (!hasBit(layout.allowedStylesMask, layout.style)) layout.style = DOUBLE_QUOTED;
  },
};

// Flow scalars fold line breaks, so each run of \n is written one longer,
// and the next line indented.
const flowBreaks = (text: string, shift: number) =>
  !text.includes("\n") ? text : text.replace(/\n+/g, (breaks) => `${breaks}\n${" ".repeat(shift)}`);

// Indents every line but empty ones, and drops a final line break, which the
// presenter adds back.
const indentBlock = (text: string, shift: number) =>
  text
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line && " ".repeat(shift) + line)
    .join("\n");

function blockHeader(text: string, layout: ScalarLayout): string {
  const indicator = /^\n* /.test(text) ? String(layout.shiftOfContent - layout.shiftOfParent) : "";
  const clip = text.endsWith("\n");
  const keep = clip && (text.endsWith("\n\n") || text === "\n");
  return `${indicator}${keep ? "+" : clip ? "" : "-"}\n`;
}

const indented = (line: string) => line[0] === " " || line[0] === "\t";

// Breaks one line at single spaces so pieces fit `width` where possible.
function foldLine(line: string, width: number): string {
  if (line === "" || indented(line)) return line;
  const spaces = / [^ \t]/g;
  let start = 0;
  let curr = 0;
  let result = "";
  for (let match; (match = spaces.exec(line));) {
    const next = match.index;
    if (next - start > width) {
      const end = curr > start ? curr : next;
      result += `${line.slice(start, end)}\n`;
      start = end + 1;
    }
    curr = next;
  }
  return (
    result +
    (line.length - start > width && curr > start
      ? `${line.slice(start, curr)}\n${line.slice(curr + 1)}`
      : line.slice(start))
  );
}

function fold(text: string, width: number): string {
  const lines = /(\n+)([^\n]*)/g;
  let first = text.indexOf("\n");
  if (first < 0) first = text.length;
  lines.lastIndex = first;
  let result = foldLine(text.slice(0, first), width);
  let prevIndented = text[0] === "\n" || indented(text);
  for (let match; (match = lines.exec(text));) {
    const line = match[2]!;
    const more = indented(line);
    result += match[1]! + (!prevIndented && !more && line ? "\n" : "") + foldLine(line, width);
    prevIndented = more;
  }
  return result;
}

function renderScalar(layout: ScalarLayout): string {
  const text = layout.node.value;
  const shift = layout.shiftOfContent;
  switch (layout.style) {
    case PLAIN:
      return flowBreaks(text, shift);
    case SINGLE_QUOTED:
      return `'${flowBreaks(text, shift).replace(/'/g, "''")}'`;
    case LITERAL_BLOCK:
      return `|${blockHeader(text, layout)}${indentBlock(text, shift)}`;
    case FOLDED_BLOCK: {
      const width = layout.presenterOptions.lineWidth;
      return `>${blockHeader(text, layout)}${indentBlock(fold(text, width === -1 ? Infinity : available(layout, width)), shift)}`;
    }
    default:
      return `"${text.replace(ESCAPE, (ch) => {
        const short = ESCAPED.indexOf(ch);
        if (short >= 0) return `\\${ESCAPES[short]}`;
        const code = ch.charCodeAt(0);
        const hex = code.toString(16).toUpperCase();
        return code <= 0xff ? `\\x${hex.padStart(2, "0")}` : `\\u${hex.padStart(4, "0")}`;
      })}"`;
  }
}

type State = Required<PresenterOptions> & {
  openEnded: boolean;
  // What writeNode tells its caller about the text it returned: whether it's
  // empty, and whether it starts a line (empty or a line break), so no one
  // reads the first character of a long, unflattened string.
  noBody: boolean;
  breaks: boolean;
};

// writeNode's context, as bits.
const IN_BLOCK = 1;
const COMPACT = 2;
const IS_KEY = 4;
// Content follows an indicator that already shifted it right, so it keeps
// its indentation under seqNoIndent.
const IN_SEQ = 8;

const newline = (state: State, level: number) => `\n${" ".repeat(state.indent * level)}`;

// Whether a node must drop to its own line instead of following `-`, `?` or `:`.
const cannotBeCompact = (state: State, node: Node, level: number) =>
  node.kind === "alias" ||
  node.tagged ||
  node.anchor !== undefined ||
  (state.indent < 2 && level > 0);

const isBlockCollection = (node: Node) =>
  (node.kind === "mapping" || node.kind === "sequence") &&
  node.style === BLOCK &&
  node.items.length !== 0;

// The separator before `:`, kept when the key's text ends in a property or
// alias the colon could otherwise join.
const colonSpace = (key: Node, noBody: boolean) =>
  key.kind === "alias" ||
  (key.kind === "scalar" && noBody && (key.tagged || key.anchor !== undefined))
    ? " "
    : "";

const startsLine = (text: string) => text === "" || text.charCodeAt(0) === 10;

function writeNode(
  state: State,
  level: number,
  node: Node,
  parent: Node | null,
  flags: number,
): string {
  if (node.kind === "alias") {
    state.openEnded = state.noBody = state.breaks = false;
    return `*${node.anchor}`;
  }
  const compact = (flags & COMPACT) !== 0 && !cannotBeCompact(state, node, level);
  const hasAnchor = node.anchor !== undefined;
  const useBlock = (flags & IN_BLOCK) !== 0 && isBlockCollection(node);
  // A block collection off the indicator's line starts with its line break.
  let breaks = useBlock && !compact;
  let printTag = node.tagged;
  let body = "";

  if (node.kind === "mapping") {
    const items = node.items;
    if (!useBlock) {
      const space = state.flowSkipCommaSpace ? "" : " ";
      for (const { key, value } of items) {
        if (body) body += `,${space}`;
        body += writeNode(state, level, key, node, IS_KEY);
        body += colonSpace(key, state.noBody);
        const valueText = writeNode(state, level, value, node, 0);
        body += `:${state.flowSkipColonSpace || valueText === "" ? "" : " "}${valueText}`;
      }
      const pad = state.flowBracketPadding && body ? " " : "";
      body = `{${pad}${body}${pad}}`;
    } else
      for (let index = 0; index < items.length; index++) {
        const { key, value } = items[index]!;
        if (!compact || index) body += newline(state, level);
        // A block key can't sit on a `key:` line; such a pair, a key with a
        // line break, or one too long for an implicit key, takes `? key`.
        const keyBlock =
          isBlockCollection(key) ||
          (key.kind === "scalar" && (key.style === LITERAL_BLOCK || key.style === FOLDED_BLOCK));
        const keyText = writeNode(
          state,
          level + 1,
          key,
          node,
          keyBlock
            ? IN_BLOCK | COMPACT | (cannotBeCompact(state, key, level + 1) ? 0 : IN_SEQ)
            : IN_BLOCK | COMPACT | IS_KEY,
        );
        const explicit =
          keyBlock ||
          (key.kind === "scalar" && key.value.includes("\n")) ||
          (keyText.length > 1024 && /^[\s\S]{1025}/u.test(keyText));
        if (explicit)
          body += `${state.breaks && !state.noBody ? "?" : "? "}${keyText}${newline(state, level)}`;
        else body += keyText + colonSpace(key, state.noBody);
        const valueText = writeNode(
          state,
          level + 1,
          value,
          node,
          explicit
            ? IN_BLOCK | COMPACT | (cannotBeCompact(state, value, level + 1) ? 0 : IN_SEQ)
            : IN_BLOCK,
        );
        body += `:${state.breaks ? "" : " "}${valueText}`;
      }
  } else if (node.kind === "sequence") {
    const items = node.items;
    if (!useBlock) {
      for (let index = 0; index < items.length; index++) {
        if (index) body += state.flowSkipCommaSpace ? "," : ", ";
        body += writeNode(state, level, items[index]!, node, 0);
      }
      const pad = state.flowBracketPadding && items.length ? " " : "";
      body = `[${pad}${body}${pad}]`;
    } else {
      const at = state.seqNoIndent && !(flags & IN_SEQ) && level > 0 ? level - 1 : level;
      for (let index = 0; index < items.length; index++) {
        const text = writeNode(
          state,
          at + 1,
          items[index]!,
          node,
          IN_BLOCK | IN_SEQ | (state.seqInlineFirst ? COMPACT : 0),
        );
        if (!compact || index) body += newline(state, at);
        body += `${state.breaks ? "-" : "- "}${text}`;
      }
    }
  } else {
    const text = node.value;
    const layout: ScalarLayout = {
      node,
      parent,
      level,
      isKey: (flags & IS_KEY) !== 0,
      flowOnly: (flags & IN_BLOCK) === 0,
      shiftOfParent: level === 0 ? -1 : state.indent * (level - 1),
      shiftOfContent: state.indent * Math.max(1, level),
      shiftOfFirstLine: level === 0 ? 0 : state.indent * level,
      presenterOptions: state,
      allowedStylesMask: 1 << DOUBLE_QUOTED,
      style: node.style,
    };
    const ascii = !NOT_ASCII.test(text);
    if (canUsePlain(layout, ascii)) layout.allowedStylesMask |= 1 << PLAIN;
    if (canUseSingle(layout, ascii)) layout.allowedStylesMask |= 1 << SINGLE_QUOTED;
    if (canUseBlock(layout, ascii))
      layout.allowedStylesMask |= (1 << LITERAL_BLOCK) | (1 << FOLDED_BLOCK);
    for (const rule of state.scalarStyleRules) rule(layout);
    body = renderScalar(layout);
    breaks = startsLine(body);
    const isBlock = layout.style === LITERAL_BLOCK || layout.style === FOLDED_BLOCK;
    state.openEnded = isBlock && (text === "\n" || text.endsWith("\n\n"));
    // An empty flow sequence entry prints its tag to exist at all; a quoted
    // or block scalar prints a tag other than !!str, which it no longer implies.
    printTag =
      node.tagged ||
      (body === "" && layout.flowOnly && parent?.kind === "sequence" && !hasAnchor) ||
      (!isPlain(layout) && node.tag !== state.schema.defaultScalarTag.tagName);
  }

  if (node.kind !== "scalar" && !useBlock) state.openEnded = false;
  // Pad a compact block collection under a wide indent so its first item
  // lines up with the rest.
  if (useBlock && compact && level > 0 && state.indent > 2)
    body = " ".repeat(state.indent - 2) + body;

  state.noBody = body === "";
  state.breaks = breaks;
  if (!printTag && !hasAnchor) return body;
  state.breaks = false;
  const tag = printTag ? (node.tagged ? node.tag : shortTag(node.tag)) : null;
  const anchor = hasAnchor ? `&${node.anchor}` : null;
  const props = (state.tagBeforeAnchor ? [tag, anchor] : [anchor, tag]).filter((p) => p !== null);
  return `${props.join(" ")}${breaks ? "" : " "}${body}`;
}

function present(documents: Document[], options: DumpOptions & { schema: Schema }): string {
  const state: State = {
    schema: options.schema,
    indent: 2,
    seqNoIndent: false,
    seqInlineFirst: true,
    lineWidth: 80,
    flowBracketPadding: false,
    flowSkipCommaSpace: false,
    flowSkipColonSpace: false,
    quoteFlowKeys: false,
    quoteStyle: "single",
    forceQuotes: false,
    scalarStyleRules: Object.values(DEFAULT_SCALAR_STYLE_RULES),
    tagBeforeAnchor: false,
    openEnded: false,
    noBody: false,
    breaks: false,
  };
  // Options left undefined keep their defaults; the rest only the dumper reads.
  for (const [key, value] of Object.entries(options))
    if (value !== undefined) (state as Record<string, unknown>)[key] = value;
  if (state.flowSkipColonSpace) state.quoteFlowKeys = true;
  let result = "";
  let ended = false;
  documents.forEach((doc, index) => {
    state.openEnded = false;
    let directives = "";
    for (const directive of doc.directives)
      directives +=
        directive.kind === "yaml"
          ? `%YAML ${directive.version}\n`
          : `%TAG ${directive.handle} ${directive.prefix}\n`;
    const marker = doc.explicitStart || directives !== "" || (index > 0 && !ended);
    result += directives;
    const contents = doc.contents;
    if (contents === null) {
      if (marker) result += "---\n";
    } else {
      const body = writeNode(state, 0, contents, null, IN_BLOCK | COMPACT);
      if (!marker) result += `${body}\n`;
      else {
        // A bare block collection starts on the line after `---`.
        const own =
          isBlockCollection(contents) &&
          !(contents as NodeBase).tagged &&
          (contents as NodeBase).anchor === undefined;
        result += `---${body === "" ? "" : directives || own ? "\n" : " "}${body}\n`;
      }
    }
    ended = !!doc.explicitEnd || state.openEnded;
    if (ended) result += "...\n";
  });
  return result;
}

/** Serializes a value as one YAML document. */
export function dump(input: any, options: DumpOptions = {}): string {
  const opts = { schema: DUMP_SCHEMA, ...options };
  const { flowLevel, sortKeys, transform } = opts;
  const documents = toAst(input, opts.schema, !!opts.noRefs, !!opts.skipInvalid);
  // Every collection at this depth is written in flow style, and so is all
  // below. Like js-yaml 5's -1 default, undefined is never at least 0.
  if ((flowLevel as number) >= 0)
    visit(documents, (node, depth) => {
      if (depth < flowLevel!) return;
      if (node.kind === "sequence" || node.kind === "mapping") node.style = FLOW;
      return true;
    });
  if (sortKeys) {
    const compareFn =
      sortKeys === true
        ? (a: unknown, b: unknown) => {
            const x = String(a);
            const y = String(b);
            return x < y ? -1 : x > y ? 1 : 0;
          }
        : sortKeys;
    visit(documents, (node) => {
      if (node.kind === "mapping")
        node.items.sort((a, b) =>
          compareFn(
            a.key.kind === "scalar" ? a.key.value : "",
            b.key.kind === "scalar" ? b.key.value : "",
          ),
        );
    });
  }
  // A null transform throws, as in js-yaml 5.
  if (transform !== undefined) transform(documents);
  return present(documents, opts);
}
