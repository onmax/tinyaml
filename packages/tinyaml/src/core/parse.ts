// Single-pass recursive descent over char codes. No tokens, no AST: every
// node is built straight into the JS value its resolver returns. Parser
// state lives in module scope, which is faster than passing it around; a
// custom tag that parses another document saves and restores it.
//
// Every entry point shares this parser. An `Engine` supplies what differs:
// how values resolve, how errors are worded and look, and whether to copy
// js-yaml 4's leniency (`lenient`) or follow the spec as js-yaml 5 does,
// and with it, whether to call the `yaml` package's hooks (`yaml`).
// Those flags, the ones that tell the `lenient` engines apart, and `js5`
// for neither, come from mode.ts: see there for how each published entry
// gets them as constants, and the rules that let the bundler drop the other
// modes' branches.
import {
  AMP,
  BACKSLASH,
  BANG,
  COLON,
  COMMA,
  DASH,
  DOT,
  DQUOTE,
  GT,
  HASH,
  LBRACE,
  LF,
  PIPE,
  QMARK,
  QUOTE,
  RBRACE,
  RBRACKET,
  SPACE,
  STAR,
  TAB,
} from "./chars.ts";
import * as E from "./codes.ts";
import {
  deep,
  first,
  js5,
  lenient,
  lines,
  maxMergeKeys,
  mergeSize,
  repeats,
  setMode,
  spec,
  warns,
  yaml,
} from "./mode.ts";

export interface Mark {
  /** The input, ending in a line break. */
  buffer: string;
  position: number;
  /** 0-based. */
  line: number;
  /** 0-based. */
  column: number;
}

export type Kind = "scalar" | "sequence" | "mapping";

export interface Engine {
  /**
   * A plain scalar with no tag, or null, to its value. `node` tells an empty
   * node from a key with no value at all.
   */
  implicit(this: void, text: string | null, node?: boolean): unknown;
  /**
   * A tagged node to its value. `value` is the text, array or object, or null
   * for an empty node, whose kind is then "fallback". In `lenient` mode,
   * `source` is the input from the tag on. In `yaml` mode, `span` is where the
   * tag starts and ends. Throw with `fail`.
   */
  explicit(
    value: unknown,
    tag: string,
    kind: Kind | "fallback",
    source?: string,
    span?: [number, number],
  ): unknown;
  /** The tag of the value `implicit` or `explicit` returned last; `<<` merges when it's MERGE_TAG. */
  tag: string;
  /** A key that isn't a string, to the string it's stored under. */
  key(key: unknown): string;
  /**
   * Read only in `yaml` mode: called on a just-finished key while
   * `tag` isn't empty, it returns the key's value as a key, since a tag may
   * read a plain scalar only there, and may set `tag`. `anchors` are the
   * current document's.
   */
  atKey?: ((key: unknown, anchors: Map<string, unknown>) => unknown) | undefined;
  /**
   * Read only in `yaml` mode: called on each anchor, with the depth
   * and whether its node `starts`. A collection's comes as it starts and
   * again, a level up, as it ends; a scalar's once. Each alias comes too,
   * with neither a value nor `starts`, before the parser fails on one whose
   * anchor it hasn't read.
   */
  anchor?: ((name: string, depth: number, value?: unknown, starts?: boolean) => void) | undefined;
  /**
   * What a `<<` merges the keys of in place of `source`, read only in `js5`
   * and `yaml` mode, called on each source of the `<<` in `map` whose value
   * is `value`. `anchors` are the current document's. In `yaml` mode, a `<<`
   * without sources calls it once, its return ignored.
   */
  merge?:
    | ((source: unknown, anchors: Map<string, unknown>, map: object, value: unknown) => unknown)
    | undefined;
  // The next four are js-yaml 5's: the parser reads them only when the engine
  // is neither `lenient` nor `spec`, so the other entries' builds drop them.
  /** Pass string keys to `key` too. */
  allKeys?: boolean | undefined;
  /** Called on each alias, with the current document's anchors. */
  alias?: ((name: string, anchors: Map<string, unknown>) => void) | undefined;
  /** Whether an array is a mapping a tag built, which `<<` merges as one. */
  mapping?: ((value: unknown[]) => boolean) | undefined;
  /**
   * Byte order marks to drop after the first. Without it, the spec engines
   * drop one that starts a document after a `...`, and the others none.
   */
  bom?: RegExp | undefined;
  /** The wording of each code in codes.ts. */
  messages: string[];
  /** `code` is undefined for the engine's own reasons, given to `fail`. */
  error(reason: string, mark: Mark, code?: number): Error;
  /** Read only where mode.ts says the engine `warns`. */
  warn?: ((reason: string, mark: Mark, code: number) => void) | undefined;
  /** Allow duplicate keys; the last one wins. */
  json?: boolean | undefined;
  /**
   * In `lenient` mode, allow duplicate keys, but keep a repeated key's first
   * value, as yamljs does, and in a block mapping after a `<<`, the last.
   */
  first?: boolean | undefined;
  /**
   * In `yaml` mode, whether `key`, stored in `map` as `name` with `value`,
   * repeats a key already in it. Without it, a name already in `map` does.
   */
  duplicate?: ((map: object, key: unknown, name: string, value: unknown) => boolean) | undefined;
  /**
   * In `spec` mode but not `yaml`, called on each verbatim tag, as written.
   * Throw with `fail`.
   */
  verbatim?: ((tag: string) => void) | undefined;
  /** In `spec` mode but not `yaml`, what a %TAG prefix must match, as written. */
  prefix?: RegExp | undefined;
  /** Default 100. */
  maxDepth?: number | undefined;
  /** Cap on keys copied by merges in one call; -1 for none. Default 10000. */
  maxMergeKeys?: number | undefined;
  /**
   * In `lenient` mode, reject a `<<` of more than 100 mappings, as js-yaml 4
   * does. js-yaml 5 always does, and the `spec` engines never.
   */
  mergeSize?: boolean | undefined;
  /** Copy js-yaml 4's leniency and error positions. */
  lenient?: boolean | undefined;
  /**
   * In `lenient` mode, read a document without a %YAML directive as YAML 1.1
   * for js-yaml 4's warning about line breaks 1.2 reads as text.
   */
  legacy?: boolean | undefined;
  /**
   * In `lenient` mode, read as js-yaml 3 does where js-yaml 4 doesn't:
   * reject a property repeated on a later line, where js-yaml 4 ends the
   * node's properties, and keep tags as written, where it decodes them.
   */
  repeats?: boolean | undefined;
  /**
   * In `lenient` mode, end keys, tags and flow scalars where js-yaml does, by
   * the lines they're on, where yamljs reads on, and read the input with a
   * line break added at its end, as js-yaml does.
   */
  lines?: boolean | undefined;
  /**
   * Follow the YAML spec, as the `yaml` package does, where js-yaml 5 doesn't.
   * Without it and without `lenient`, parsing matches js-yaml 5.
   */
  spec?: boolean | undefined;
  /**
   * With `spec`, call the hooks only the `yaml` package's engine sets, and
   * give it each tag's `span`.
   */
  yaml?: boolean | undefined;
}

// With the `u` flag, the surrogate range matches only lone surrogates.
const NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uD800-\uDFFF\uFFFE\uFFFF]/u;
const TAG_HANDLE = /^!(?:[\da-z-]*!)?$/i;
const TAG_SUFFIX = /^(?:%[\da-fA-F]{2}|[\w\-#;/?:@&=+$.~*'()])+$/;
const TAG_PREFIX =
  /^(?:!|%[\da-fA-F]{2}|[\w\-#;/?:@&=+$.~*'()])(?:%[\da-fA-F]{2}|[\w\-#;/?:@&=+$,.!~*'()[\]])*$/;
// What js-yaml 4 and std, and js-yaml 5, accept in a verbatim tag.
const VERBATIM_4 = /^(?:!|[^,[\]{}])(?:%[\da-f]{2}|[\w\-#;/?:@&=+$,.!~*'()[\]])*$/i;
const VERBATIM_5 = /^(?:%[\da-f]{2}|[\w\-#;/?:@&=+$,.!~*'()[\]])*$/i;

export const YAML_TAG = "tag:yaml.org,2002:";
export const MERGE_TAG = `${YAML_TAG}merge`;
// Stands in for a `<<` key until setKey merges its value.
const MERGE = Symbol();
// Stands in for the next key of a block mapping where no node starts.
const END = Symbol();
// Stands in for the key of an explicit `?` entry, not read yet.
const EXPLICIT = Symbol();

// Each escape character in ESCAPES stands for the character at the same index
// in ESCAPED.
export const ESCAPES = '0abt\tnvfre "/\\N_LP';
export const ESCAPED = '\0\x07\b\t\t\n\v\f\r\x1B "/\\\x85\xA0\u2028\u2029';

let src = "";
let pos = 0;
// Offset of the current line's first character. Everything that steps over a
// line break updates it, so the column is just `pos - lineStart`.
let lineStart = 0;
let len = 0;
let anchors = new Map<string, unknown>();

// A scalar's raw text plus whether it was plain, so tags and the schema can
// resolve it after the fact.
let plain = false;
// The current line's indentation contains a tab.
let tabbed = false;
// The last scalar spanned more than one line.
let crossed = false;
// The last implicit key was omitted (`: value`); js-yaml then allows a
// compact mapping as the value.
let emptyKey = false;
// An anchor read but not yet attached. Collections claim it as soon as they
// exist, so their own children can alias them.
let pendingAnchor: string | undefined;
// Nesting of the node being parsed: the level of the innermost collection.
// js-yaml counts a level for every node it reads, aliases and empty nodes
// too, where it starts, and rejects one past maxDepth; see `frame`.
let depth = 0;
// The input holds a tab, so indentation needs checking for one.
let tabs = false;
let maxDepth = 100;
// The resolved tag of the last finished node, so a key can tell it was `<<`.
let lastTag = "";
// Where the last block mapping key started; duplicate key errors point there.
let keyAt = 0;
let engine: Engine;
// `engine.implicit`, read once per call: each entry's engine has its own
// shape, so in a process that uses several, reading it per node is slow.
let implicit: Engine["implicit"];
let mergeKeys = 0;
// In js-yaml 4, the column of the block mapping whose explicit `?` key is
// being read.
let explicitAt = -1;
// Keys a merge copied into a mapping, which explicit keys may still override.
let overridable = new WeakMap<object, Set<string>>();

// Where a node last reached the level right above maxDepth, which a key in a
// flow sequence, or a block mapping's first key, pushes past it when it turns
// out to start a pair or the mapping.
let brink = -1;

// A scalar one level below the current node, or a node at `level`.
function leaf(level = depth + 1): void {
  if (deep) return;
  if (spec ? level >= maxDepth : level > maxDepth) fail(E.MAX_DEPTH, maxDepth);
  if (spec && level >= maxDepth - 1) brink = pos;
}

// Outside `spec` mode, a node js-yaml reads at `level`, from `at`.
function frame(at: number, level = depth + 1): void {
  if (!deep && level > maxDepth) {
    pos = at;
    fail(E.MAX_DEPTH, maxDepth);
  }
}
// %TAG handles of the current document, to their prefixes, none of them empty.
let handles = new Map<string, string>();

function mark(exact?: boolean): Mark {
  // js-yaml 4 reads a copy that ends in a line break, and mostly reports
  // problems at the end of input after that break.
  const buffer = src.endsWith("\n") ? src : `${src}\n`;
  const at = pos < len || exact || !lenient ? pos : buffer.length;
  return {
    buffer,
    position: at,
    line: buffer.slice(0, at).split("\n").length - 1,
    column: at - buffer.lastIndexOf("\n", at - 1) - 1,
  };
}

// The parser reads a copy of the input with \n line breaks and without the
// byte order marks it drops. Maps a position in that copy back to `input`.
// js-yaml 4 and std point past a byte order mark at the start, which their
// `input` leaves out, and the parser drops no other in `lenient` mode.
export function original(
  input: string,
  { buffer, position }: Pick<Mark, "buffer" | "position">,
): number {
  // How many characters of `input` the copy dropped so far.
  let dropped = 0;
  for (let i = 0; i - dropped < position; i++)
    if (
      (input[i] === "\r" && input[i + 1] === "\n") ||
      (!lenient && input[i] === "\uFEFF" && buffer[i - dropped] !== "\uFEFF")
    )
      dropped++;
  return position + dropped;
}

/**
 * The input as js-yaml 4 and std point into it: without a byte order mark at
 * the start, and ending in a line break.
 */
export const sanitize = (input: string): string =>
  input.replace(/^\uFEFF/, "").replace(/[^\r\n]$/, "$&\n");

/** Where the parser is in the input it reads, from inside the engine. */
export const at = (): number => pos;

/** Where the parser is, from inside the engine, or undefined once it's done. */
export const where = (): Mark | undefined => engine && mark();

/** Throws the error for a code from codes.ts, or for the engine's own reason. */
export function fail(reason: number | string, arg?: string | number): never {
  if (typeof reason === "string") throw engine.error(reason, mark());
  // js-yaml 4 points at an empty alias name even at the end of input.
  throw engine.error(word(reason, arg), mark(lenient && reason === E.ALIAS_EMPTY), reason);
}

function word(code: number, arg?: string | number): string {
  return engine.messages[code]!.split("%s").join(arg as string);
}

function warn(code: number, arg?: string): void {
  if (warns) engine.warn?.(word(code, arg), mark(), code);
}

// js-yaml 4 only warns where the spec, and js-yaml 5, reject.
function bend(code: number): void {
  if (lenient) warn(code);
  else fail(code);
}

// NaN (end of input) counts as a break.
function isBreak(ch: number): boolean {
  return ch === LF || ch !== ch;
}

function isBlank(ch: number): boolean {
  return ch === SPACE || ch === TAB || ch === LF || ch !== ch;
}

function isFlowIndicator(ch: number): boolean {
  return ch === COMMA || (ch | 32) === LBRACE || (ch | 32) === RBRACE;
}

// Whether the character after `pos` is white space, or in flow context a flow
// indicator, so the indicator at `pos` stands alone.
function separated(flow?: boolean): boolean {
  const next = src.charCodeAt(pos + 1);
  return isBlank(next) || (!!flow && isFlowIndicator(next));
}

// Whether `ch` is at `pos` and stands alone.
function indicator(ch: number, flow?: boolean): boolean {
  return src.charCodeAt(pos) === ch && separated(flow);
}

function skipSpace(): void {
  let ch = src.charCodeAt(pos);
  while (ch === SPACE || ch === TAB) ch = src.charCodeAt(++pos);
}

function hasTab(from: number, to: number): boolean {
  if (tabs) while (from < to) if (src.charCodeAt(from++) === TAB) return true;
  return false;
}

// Spaces before the first other character of the current line.
function leadingSpaces(): number {
  let i = lineStart;
  while (src.charCodeAt(i) === SPACE) i++;
  return i - lineStart;
}

// Text that isn't a scalar, from `from` to `to`. The spec rejects a
// non-printable character anywhere, and not only in plain and block scalars,
// as yaml does.
function raw(from: number, to: number): void {
  if (spec && !yaml) {
    const at = src.slice(from, to).search(NON_PRINTABLE);
    if (at >= 0) {
      pos = from + at;
      fail(E.NON_PRINTABLE);
    }
  }
}

// The line break that ends the line at `from`, or the end of input.
function lineEnd(from: number): number {
  const end = src.indexOf("\n", from);
  return end < 0 ? len : end;
}

function skipComment(): void {
  if (src.charCodeAt(pos) === HASH) {
    // js-yaml 4 takes `#` as a comment wherever white space may go, even
    // right after a quote or bracket. At the start, NaN counts as blank.
    if (!lenient && !isBlank(src.charCodeAt(pos - 1))) fail(E.COMMENT_SPACE);
    raw(pos, (pos = lineEnd(pos)));
  }
}

// Skips whitespace, comments and line breaks. Returns the column of the next
// content, or -1 at end of input. With `spaces`, a tabbed indentation counts
// only its leading spaces, as js-yaml 5 measures it.
function skipLines(spaces?: boolean): number {
  for (;;) {
    skipSpace();
    skipComment();
    if (src.charCodeAt(pos) !== LF) break;
    lineStart = ++pos;
  }
  if (pos >= len) return -1;
  // Tabs may separate a scalar or flow node from the margin, but can't
  // indent block collections; those check `tabbed`.
  tabbed = hasTab(lineStart, pos);
  return spaces && tabbed ? leadingSpaces() : pos - lineStart;
}

function isDocMarker(at = pos): boolean {
  const ch = src.charCodeAt(at);
  return (
    (ch === DASH || ch === DOT) &&
    (at === 0 || src.charCodeAt(at - 1) === LF) &&
    src.charCodeAt(at + 1) === ch &&
    src.charCodeAt(at + 2) === ch &&
    isBlank(src.charCodeAt(at + 3))
  );
}

function expectLineEnd(): void {
  skipSpace();
  const ch = src.charCodeAt(pos);
  if (ch !== HASH && !isBreak(ch)) fail(E.LINE_END);
}

// js-yaml 5 counts only spaces as indentation, and none on the first line or
// right after a directive, which ends at `directiveEnd`.
function indented(directiveEnd: number): number | false {
  return lineStart && lineStart !== directiveEnd && leadingSpaces();
}

/** Every document in `input`. */
export function parse(input: string, use: Engine): unknown[] {
  // The caller's state, all of it, when a tag parses a document in the middle
  // of another.
  // prettier-ignore
  const outer = [src, pos, lineStart, len, anchors, plain, tabbed, crossed, emptyKey, pendingAnchor, depth, brink, tabs, maxDepth, lastTag, keyAt, engine, implicit, mergeKeys, explicitAt, handles] as const;
  const restore = setMode(use);
  engine = use;
  implicit = use.implicit;
  maxDepth = use.maxDepth ?? 100;
  pendingAnchor = undefined;
  depth = mergeKeys = 0;
  brink = -1;
  if (lenient) explicitAt = -1;
  const docs: unknown[] = [];
  try {
    src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    if (src.includes("\r")) src = src.replace(/\r\n?/g, "\n");
    // js-yaml reads the input with a line break added at its end.
    if (lines && src && !src.endsWith("\n")) src += "\n";
    if (spec && src.includes("\uFEFF")) {
      // A document may start with a byte order mark too: the first line
      // that isn't blank or a comment, after the start or a `...`.
      let start = true;
      src = src
        .split("\n")
        .map((line) => {
          const bom = start && line.charCodeAt(0) === 0xfeff;
          if (bom) line = line.slice(1);
          start = /^\.\.\.(?:[ \t]|$)/.test(line) || (start && !bom && /^[ \t]*(?:#|$)/.test(line));
          return line;
        })
        .join("\n");
    } else if (js5 && use.bom && src.includes("\uFEFF")) src = src.replace(use.bom, "");
    len = src.length;
    pos = src.indexOf("\0");
    if (pos >= 0) fail(E.NULL_BYTE);
    pos = lineStart = 0;
    tabs = src.includes("\t");
    // Where js-yaml 4 starts the next document; -1 for after the lines that
    // follow a `...`.
    let start = 0;
    for (;;) {
      let col = skipLines();
      if (lenient && warns && start < 0) start = pos;
      let directives = false;
      let directiveEnd = -1;
      handles = new Map().set("!!", YAML_TAG).set("!", "!");
      let version = false;
      // YAML 1.1, where js-yaml 4 warns about line breaks 1.2 reads as text.
      let breaks = lenient && warns && use.legacy;
      const declared = new Set<string>();
      while (!(js5 ? indented(directiveEnd) : col) && src.charCodeAt(pos) === 37 /* % */) {
        directives = true;
        const end = lineEnd(pos);
        raw(pos, end);
        const line = src.slice(pos + 1, end);
        // A comment ends the arguments: it splits off with the space before it.
        const args = line.split(/[ \t]+(?:#.*)?/).filter((arg, i) => arg || !i);
        const name = args.shift();
        pos++;
        if (!spec && !name) fail(E.DIRECTIVE_NAME);
        // js-yaml 4 reports directive problems from the start of the next line.
        lineStart = pos = end < len ? end + 1 : end;
        // js-yaml 5 reads on to the next line's indentation after a comment.
        directiveEnd = js5 && /[ \t]#/.test(line) ? -1 : pos;
        if (name === "YAML") {
          if (version) fail(E.YAML_REPEATED);
          if (args.length !== 1) fail(E.YAML_ARGS);
          const match = /^(\d+)\.\d+$/.exec(args[0]!);
          if (!match) fail(E.YAML_ARG);
          if (!spec && match[1] !== "1") fail(E.YAML_VERSION);
          // yaml supports 1.1 and 1.2 as written; js-yaml reads the minor
          // version as a number.
          if (warns && !(spec ? /^1\.[12]$/ : /\.0*[12]$/).test(args[0]!)) warn(E.YAML_UNSUPPORTED);
          if (lenient && warns) breaks = /\.0*[01]$/.test(args[0]!);
          version = true;
        } else if (name === "TAG") {
          const [handle, prefix] = args;
          if (args.length !== 2) fail(E.TAG_ARGS);
          if (!TAG_HANDLE.test(handle!)) fail(E.TAG_HANDLE);
          if (declared.has(handle!)) fail(E.TAG_REDECLARED, handle);
          if (spec ? !yaml && !engine.prefix!.test(prefix!) : !TAG_PREFIX.test(prefix!))
            fail(E.TAG_PREFIX);
          declared.add(handle!);
          handles.set(handle!, decode(prefix!, E.PREFIX_ENCODING));
        } else warn(E.DIRECTIVE_UNKNOWN, name);
        col = skipLines();
      }
      if (col < 0) {
        if (directives) fail(E.DIRECTIVES_END);
        // js-yaml 4 yields an empty document for input holding anything but
        // leading spaces and one line break, such as just a comment.
        if (lenient && !docs.length && !/^\uFEFF? *[\r\n]?$/.test(input)) docs.push(null);
        break;
      }
      anchors = new Map();
      // Like js-yaml 4, a document starts at any `---` not indented by
      // spaces, even `---text`, and its content may be a block collection on
      // that line. Right after a directive, js-yaml doesn't measure the
      // indentation at all. js-yaml 5 instead takes an indented `---` on the
      // first line.
      const explicit =
        (lenient
          ? !leadingSpaces() || lineStart === directiveEnd
          : !(js5 ? indented(directiveEnd) : col)) &&
        (lenient || isBlank(src.charCodeAt(pos + 3))) &&
        src.startsWith("---", pos);
      if (explicit) pos += 3;
      else if (directives) fail(E.DIRECTIVES_END);
      else if (isDocMarker()) {
        // In js-yaml 4, a `...` with no document before it ends an empty one.
        if (lenient) {
          frame(pos, 2);
          docs.push(null);
        }
        pos += 3;
        if (spec) expectLineEnd();
        continue;
      }
      // js-yaml 5 measures indentation only after a line break, so on the
      // very first line the top-level node's parent indent is -1.
      docs.push(
        parseValue(
          spec || explicit || (!lines && !lineStart) ? -1 : leadingSpaces() - 1,
          false,
          lenient && explicit,
        ),
      );
      col = skipLines();
      if (lenient && warns && breaks && /[\x85\u2028\u2029]/.test(src.slice(start, pos)))
        warn(E.NON_ASCII_BREAKS);
      if (col < 0) break;
      if (!isDocMarker()) fail(E.DOCUMENT_END);
      if (lenient && warns) start = src.charCodeAt(pos) === DOT ? -1 : pos;
      if (src.charCodeAt(pos) === DOT) {
        pos += 3;
        if (!lenient) expectLineEnd();
      }
    }
  } catch (error) {
    // Outside yaml, nesting deep enough to overflow the call stack fails
    // where it happens, with the RangeError's message.
    if (spec && !yaml && error instanceof RangeError) fail(error.message);
    throw error;
  } finally {
    // prettier-ignore
    [src, pos, lineStart, len, anchors, plain, tabbed, crossed, emptyKey, pendingAnchor, depth, brink, tabs, maxDepth, lastTag, keyAt, engine, implicit, mergeKeys, explicitAt, handles] = outer;
    restore?.();
  }
  return docs;
}

// A node's properties, holding only the keys that are set, so spreading
// merges two.
interface Props {
  tag?: string | undefined;
  // Never empty, so it's set when it's truthy.
  anchor?: string | undefined;
  // An anchor from an earlier line, when this line has its own too.
  outer?: string | undefined;
  // Where this line first repeats a kind of property the earlier lines have,
  // outside js-yaml 4's leniency.
  at?: number;
  // In `lenient` mode, where the tag ends.
  end?: number;
  // In `yaml` mode, where the tag starts and ends.
  span?: [number, number];
}

// With `split`, stops before a second anchor or tag. `node` holds the node's
// properties from earlier lines. A flow node adds to them, where with `comma`
// a repeat is a missed comma; a block node's may still go to a key.
function parseProps(flow = false, split = false, node?: Props, comma?: boolean): Props | undefined {
  let props = flow ? node : undefined;
  for (;;) {
    const ch = src.charCodeAt(pos);
    if (ch !== BANG && ch !== AMP) return props;
    const kind = ch === AMP ? "anchor" : "tag";
    if (props?.[kind] !== undefined) {
      if (split) return props;
      fail(comma ? E.MISSED_COMMA : ch === AMP ? E.ANCHOR_REPEATED : E.TAG_REPEATED);
    }
    props ??= {};
    if (!lenient && node?.[kind] !== undefined) props.at ??= pos;
    const start = ++pos;
    if (ch === BANG && src.charCodeAt(pos) === 60 /* < */) {
      // js-yaml 4 looks for the `>` from the second character on, and
      // js-yaml points at the end of the input when there's none.
      const end = src.indexOf(">", lines ? pos + 2 : pos);
      if (end < 0) {
        if (lines || js5) pos = len;
        fail(E.VERBATIM_END);
      }
      raw(start, end);
      const tag = src.slice(start + 1, end);
      if (lines || js5) {
        pos = end + 1;
        if (tag && !(js5 ? VERBATIM_5 : VERBATIM_4).test(tag)) fail(E.SUFFIX_CHARS, tag);
      }
      // The spec, yaml and std deliver a verbatim tag as written.
      props.tag = spec || repeats ? tag : decode(tag, E.TAG_ENCODING);
      if (spec && /\s/.test(props.tag)) fail(E.TAG_SPACE);
      if (spec && !yaml) engine.verbatim!(tag);
      pos = end + 1;
    } else {
      // js-yaml 4 reads a tag up to white space, flow indicators and all.
      const name = readName(lines && ch === BANG);
      if (ch === AMP) {
        if (!name) fail(E.ANCHOR_EMPTY);
        if (yaml && name.endsWith(":")) warn(E.ANCHOR_COLON);
        props.anchor = pendingAnchor = name;
      } else {
        const bang = name.indexOf("!");
        // Just `!` when the name has no other `!`.
        const handle = `!${name.slice(0, bang + 1)}`;
        const suffix = name.slice(bang + 1);
        if (!TAG_HANDLE.test(handle)) fail(E.HANDLE_CHARS);
        if (lines && /[,[\]{}]/.test(name)) fail(E.TAG_FLOW);
        const prefix = handles.get(handle);
        if (!prefix) fail(E.HANDLE_UNDECLARED, handle);
        // The drop-ins name the suffix, and tinyaml's own wording doesn't.
        if (name && !TAG_SUFFIX.test(suffix)) {
          if (spec) fail(E.SUFFIX_CHARS);
          else fail(E.SUFFIX_CHARS, suffix);
        }
        props.tag = name ? prefix + (repeats ? suffix : decode(suffix, E.TAG_ENCODING)) : "!";
        if (lenient) props.end = pos;
      }
    }
    if (yaml && ch === BANG) props.span = [start - 1, pos];
    const next = src.charCodeAt(pos);
    if (
      !isBlank(next) &&
      (!isFlowIndicator(next) ||
        ((spec || (!lenient && !flow && ch === BANG)) && (next | 32) === LBRACE))
    )
      fail(E.PROPERTY_SPACE);
    skipSpace();
  }
}

function decode(text: string, code: number): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return fail(code, text);
  }
}

// A new collection, one level deeper, which claims the pending anchor.
function claim<T>(container: T): T {
  leaf(++depth);
  if (pendingAnchor) anchor(pendingAnchor, container, true);
  pendingAnchor = undefined;
  return container;
}

function anchor(name: string, value: unknown, starts: boolean): void {
  anchors.set(name, value);
  if (yaml) engine.anchor?.(name, depth, value, starts);
}

// Finishes a node: resolves it through the schema and records its anchor.
// `value` is the parsed content, null for an empty node. Only plain scalars
// without a tag resolve implicitly. In `spec` mode, every node but an alias
// counts toward maxDepth here, where js-yaml counts scalars and aliases.
function finish(value: unknown, props?: Props, untagged?: boolean): unknown {
  if (spec) leaf();
  pendingAnchor = undefined;
  const tag = props?.tag ?? (untagged ? "?" : "");
  engine.tag = "";
  if (tag === "?") {
    if (value !== null && typeof value !== "string") fail(E.NON_SPECIFIC, kindOf(value));
    value = implicit(value as string | null, true);
  } else if ((tag || (js5 && props?.tag === "")) && tag !== "!")
    value = engine.explicit(
      value,
      tag,
      value === null ? "fallback" : kindOf(value),
      lenient ? src.slice(props!.end, pos) : undefined,
      props!.span,
    );
  else if (value === null) value = !lenient && tag === "!" ? "" : implicit(null, true);
  lastTag = engine.tag;
  if (props?.anchor) anchor(props.anchor, value, false);
  if (props?.outer) anchor(props.outer, value, false);
  return value;
}

function kindOf(value: unknown): Kind {
  return typeof value === "string" ? "scalar" : Array.isArray(value) ? "sequence" : "mapping";
}

// A just-finished key, with `<<` swapped for the merge marker.
function asKey(key: unknown): unknown {
  if (yaml && lastTag && engine.atKey) {
    key = engine.atKey(key, anchors);
    lastTag = engine.tag;
  }
  return lastTag === MERGE_TAG ? MERGE : key;
}

// The node after a `key:`, `-` or `---`, on this line or the following ones.
// `indent` is the parent block's column. `outer` holds properties already
// read on an earlier line.
function parseValue(indent: number, inSeq: boolean, compact = inSeq, outer?: Props): unknown {
  const start = pos;
  // js-yaml reads a mapping value from its `:`, and an entry from where its
  // content starts, but none for an entry without content, unless js-yaml 5
  // finds the input ends there.
  if (!spec && !inSeq) frame(pos);
  skipSpace();
  const col = pos - lineStart;
  // Something before us on this line: block collections can't start here,
  // except in a compact `- ` entry. Where that matters, the node follows an
  // indicator right before `start`, or starts a document, where js-yaml 4
  // ignores a `...` and white space before it on the line.
  const inline = !compact && src.charCodeAt(start - 1) > SPACE;
  const separatedByTab = hasTab(start, pos);
  if (!spec && inSeq) {
    const first = src.charCodeAt(pos);
    if ((js5 && pos >= len) || (first !== HASH && !isBreak(first))) frame(pos);
  }
  const props = parseProps();
  const ch = src.charCodeAt(pos);
  if (ch === HASH || isBreak(ch)) {
    const merged = mergeProps(outer, props);
    const save = pos;
    const saveLine = lineStart;
    const next = skipLines(js5);
    if (next > indent && !isDocMarker()) {
      if (!spec && inSeq && !props) frame(pos);
      // Only spaces indent it; tabs may follow them. js-yaml 4 resolves the
      // empty node it reads first, and lets a tab indent an explicit key.
      if (
        (spec || (lines && (repeats || indent !== explicitAt))) &&
        tabbed &&
        leadingSpaces() <= indent
      ) {
        if (lenient) finish(null, merged);
        tabIndent();
      }
      if (js5 && !inSeq && indent >= 0) return splitProps(indent, next, merged);
      return parseBlockNode(
        indent < 0 && lenient ? leadingSpaces() - 1 : indent,
        next,
        inSeq,
        merged,
      );
    }
    // js-yaml 4 measures a tabbed line in spaces, which leave it short of
    // the mapping, so the value is empty.
    if (next === indent && !inSeq && indicator(DASH) && !isDocMarker() && !(lines && tabbed)) {
      if (spec && tabbed) tabIndent();
      if (js5 && tabbed) {
        pos = lineStart + indent;
        fail(E.TAB_INDENT);
      }
      return finish(parseBlockSeq(next), merged);
    }
    // js-yaml tries an empty document as a key where the next one starts.
    if (!spec && !depth && pos < len) frame(pos, 2);
    // js-yaml 4 resolves an empty node where the next one starts.
    if (!lines) {
      pos = save;
      lineStart = saveLine;
    }
    return finish(null, merged);
  }
  // A node that starts its line keeps the line's own indentation status.
  tabbed = inline ? separatedByTab : tabbed || separatedByTab;
  return parseBlockNode(indent, col, inSeq, outer, props, inline);
}

// A mapping value on its own line, in js-yaml 5. There, a second anchor or
// tag on the line starts a mapping, which gets the properties before it,
// and its first key the rest. Otherwise, or where the properties before it
// repeat the node's, the second repeats the first.
function splitProps(indent: number, col: number, node: Props | undefined): unknown {
  const own = parseProps(false, true, node);
  const at = pos;
  const ch = src.charCodeAt(at);
  if (ch !== AMP && ch !== BANG) return parseBlockNode(indent, col, false, node, own);
  const line = lineStart;
  parseKey(-1, parseProps(), false);
  skipSpace();
  const mapping = indicator(COLON) && !crossed;
  pos = at;
  lineStart = line;
  if (!mapping || own!.at !== undefined) fail(ch === AMP ? E.ANCHOR_REPEATED : E.TAG_REPEATED);
  return parseBlockNode(indent, at - lineStart, false, mergeProps(node, own), parseProps(), true);
}

// Properties from an earlier line plus this line's. Like js-yaml 4, the later
// tag wins and both anchors name the node. Elsewhere a repeat fails where it
// starts, in js-yaml 5 as a bad entry of the parent.
function mergeProps(
  a: Props | undefined,
  b: Props | undefined,
  inSeq?: boolean,
): Props | undefined {
  if (!a || !b) return a ?? b;
  if (!lenient && b.at !== undefined) {
    pos = b.at;
    fail(
      js5
        ? inSeq
          ? E.SEQ_INDENT
          : E.MAP_INDENT
        : src.charCodeAt(pos) === AMP
          ? E.ANCHOR_REPEATED
          : E.TAG_REPEATED,
    );
  }
  return {
    tag: b.tag ?? a.tag,
    anchor: b.anchor ?? a.anchor,
    outer: b.anchor && a.anchor,
    ...(yaml && { span: (b.tag ? b : a).span }),
  };
}

// A block node starting at column `col`. `node` are properties of this node
// from an earlier line; `own` are those on this line, which belong to the
// key when the node turns out to be a mapping.
function parseBlockNode(
  indent: number,
  col: number,
  inSeq: boolean,
  node: Props | undefined,
  own = parseProps(false, false, node),
  inline = false,
): unknown {
  let ch = src.charCodeAt(pos);
  // In js-yaml 5, a `-` at the column of the sequence this is an entry of
  // starts the next entry, even after another line of properties.
  if (own && (ch === HASH || isBreak(ch)))
    return parseValue(indent, js5 && inSeq, false, mergeProps(node, own, inSeq));
  // js-yaml first reads a node as an implicit block mapping key, a level
  // deeper: where a block collection may start, and after properties on its
  // line, unless it's a flow collection or a block scalar or, in js-yaml 5,
  // on a `---` line.
  if ((ch === DASH || ch === QMARK) && separated()) {
    if (tabbed) return tabbedCollection(indent, col);
    if (!spec && own) frame(lineStart + col, depth + 2);
    const props = mergeProps(node, own, inSeq);
    if (inline || (own && (!lenient || ch === DASH))) fail(E.MAP_INDENT);
    return finish(
      ch === DASH ? parseBlockSeq(col) : parseBlockMap(col, EXPLICIT, indent),
      props,
      false,
    );
  }
  const flow = !spec && (ch | 32) === LBRACE;
  const tries =
    !spec &&
    !tabbed &&
    (own
      ? !flow && ch !== PIPE && ch !== GT && !(js5 && inline && !depth)
      : !inline && !indicator(COLON));
  if (tries) frame(lineStart + col, depth + 2);
  if (ch === PIPE || ch === GT) {
    if (spec) leaf();
    return finish(parseBlockScalar(indent), mergeProps(node, own, inSeq));
  }
  const isAlias = ch === STAR;
  const line = lineStart;
  keyAt = pos;
  if (tries && flow) depth++;
  const key = parseKey(indent, own, true);
  if (tries && flow) depth--;
  const wasPlain = plain;
  // Only scalars that fold step over a line break, and they say so, but yaml
  // also rejects flow keys that do.
  const multiline = (!lenient && lineStart !== line) || crossed;
  skipSpace();
  ch = src.charCodeAt(pos);
  // In js-yaml, a node that ends on a later line is no key but a value, and
  // in js-yaml 3, one without content either.
  if (
    ch === COLON &&
    (separated() || !wasPlain) &&
    !(js5 ? multiline : lines && (lineStart !== line || multiline || (emptyKey && repeats)))
  ) {
    // js-yaml lets a key with properties start a nested mapping mid-line,
    // and js-yaml 4 a key on one line, but not js-yaml 3. It doesn't look
    // past the `:` of one that can't.
    if (!spec && inline && (!own || indent < 0 || (lenient && (multiline || repeats))))
      fail(E.MAP_INDENT);
    if (!separated()) {
      // js-yaml points past the `:`.
      if (!spec) pos++;
      fail(E.VALUE_SPACE);
    }
    checkKey(line + col);
    if (tabbed) return tabbedCollection(indent, col);
    if (spec && inline) fail(E.MAP_INDENT);
    if (multiline) fail(E.MULTILINE_KEY);
    // The key turns out to be a level below the mapping it starts, and so is
    // everything in it.
    if (spec && !isAlias) {
      if (!deep && brink >= keyAt) fail(E.MAX_DEPTH, maxDepth);
      leaf(depth + 2);
    }
    const resolved = isAlias ? key : asKey(finish(key, own, wasPlain));
    pendingAnchor = node?.anchor;
    // A key with properties isn't omitted, so no compact value follows it.
    if (!spec) emptyKey &&= !own;
    return finish(parseBlockMap(col, resolved, indent), node);
  }
  if (spec && !wasPlain) expectLineEnd();
  if (isAlias) return key;
  const props = mergeProps(node, own, inSeq);
  // js-yaml 4 resolves a plain scalar below its tag as if untagged, and then
  // the tag gets that value.
  const tag = lenient && node?.tag;
  if (tag && wasPlain && !own?.tag) {
    const value = implicit(key as string, true);
    return finish(tag === "!" ? value : engine.explicit(value, tag, "scalar"), {
      ...props!,
      tag: "!",
    });
  }
  return finish(key, props, wasPlain);
}

// A block collection whose indentation holds a tab. js-yaml 4 rejects it
// outright only when spaces alone leave it no deeper than its parent;
// otherwise it reads an empty node and the parent reports the rest.
function tabbedCollection(indent: number, col: number): null {
  if (
    !lenient ||
    (/^[\t ]*$/.test(src.slice(lineStart, lineStart + col)) && leadingSpaces() <= indent)
  )
    return fail(E.TAB_INDENT);
  pos = lineStart + col;
  return finish(null) as null;
}

// Fails at the first tab of the current line's indentation.
function tabIndent(): never {
  pos = lineStart + leadingSpaces();
  return fail(E.TAB_INDENT);
}

// Properties and aliases end their names at the same separators, or with
// `blank`, at white space only.
function readName(blank?: boolean): string {
  const start = pos;
  let ch = src.charCodeAt(pos);
  while (!isBlank(ch) && (blank || !isFlowIndicator(ch))) ch = src.charCodeAt(++pos);
  raw(start, pos);
  return src.slice(start, pos);
}

function parseAlias(props?: Props): unknown {
  if (!lenient && props) fail(E.ALIAS_PROPS);
  pos++;
  const name = readName();
  if (!name && lenient) fail(E.ALIAS_EMPTY);
  if (yaml) engine.anchor?.(name, depth);
  if (!anchors.has(name)) fail(E.ALIAS_UNKNOWN, name);
  // js-yaml 4 checks for properties once it's read on past the alias.
  if (lenient && props) {
    skipLines();
    fail(E.ALIAS_PROPS);
  }
  plain = false;
  lastTag = "";
  if (js5) engine.alias?.(name, anchors);
  return anchors.get(name);
}

// Stores a pair the way js-yaml 4 does: keys become strings, arrays join
// their items, objects become "[object Object]", and `<<` merges mappings.
// `block` tells a block mapping. Returns `map`.
function setKey(
  map: Record<string, unknown>,
  key: unknown,
  value: unknown,
  at: number,
  block?: boolean,
): Record<string, unknown> {
  if (key === MERGE) {
    const end = pos;
    // js-yaml 5 points at the `<<` for what's wrong with what it merges.
    if (js5) pos = at;
    const sources = Array.isArray(value) && !(js5 && engine.mapping?.(value)) ? value : [value];
    if ((js5 || mergeSize) && sources.length > 100) fail(E.MERGE_SIZE);
    let keys = overridable.get(map);
    if (!keys) overridable.set(map, (keys = new Set()));
    // yaml's collection tags still see a `<<` that merges nothing.
    if (yaml && !sources.length) engine.merge?.(MERGE, anchors, map, value);
    for (let source of sources) {
      if ((js5 || yaml) && engine.merge) source = engine.merge(source, anchors, map, value);
      if (typeof source !== "object" || source === null || (!lenient && Array.isArray(source)))
        fail(E.MERGE_SOURCE);
      chargeMerge();
      for (const name of Object.keys(source)) {
        chargeMerge();
        if (!Object.hasOwn(map, name)) {
          define(map, name, (source as Record<string, unknown>)[name]);
          keys.add(name);
        }
      }
    }
    if (js5) pos = end;
    return map;
  }
  const name = typeof key === "string" && !(js5 && engine.allKeys) ? key : engine.key(key);
  if (
    yaml && engine.duplicate ? engine.duplicate(map, key, name, value) : Object.hasOwn(map, name)
  ) {
    const keys = overridable.get(map);
    // js-yaml 5 lets only an equal key override a merged one, whose keys are strings.
    if (!keys?.has(name) || (js5 && typeof key !== "string")) {
      if (!first && !engine.json) {
        pos = at;
        // js-yaml 5 places an alias key at its name, and another collection
        // key at 0, where its end event is.
        if (js5 && src.charCodeAt(at) === STAR) pos++;
        else if (js5 && typeof key === "object" && key) pos = 0;
        fail(E.DUPLICATE_KEY);
      }
      // yamljs keeps the last value in a block mapping once it has merged.
      if (first && !(block && overridable.has(map))) return map;
    }
    keys?.delete(name);
  }
  return define(map, name, value);
}

export function define(
  map: Record<string, unknown>,
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (name === "__proto__")
    Object.defineProperty(map, name, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  else map[name] = value;
  return map;
}

function chargeMerge(): void {
  const max = maxMergeKeys ?? engine.maxMergeKeys ?? 10000;
  if (max !== -1 && ++mergeKeys > max) fail(E.MERGE_KEYS, max);
}

// `key` is the already-parsed first key, or EXPLICIT when the map starts
// with an explicit `?` entry. The position is on the `:` or `?`. `indent` is
// the parent block's column. yamljs reads one that merges no keys as null.
function parseBlockMap(col: number, key: unknown, indent: number): Record<string, unknown> | null {
  const map: Record<string, unknown> = claim({});
  let at = keyAt;
  for (;;) {
    let value: unknown;
    // js-yaml lets a tab indent the line after an explicit entry without a value.
    let tab = false;
    if (key === EXPLICIT) {
      // Explicit entry: `? key`, then an optional `: value` at the same column.
      at = ++pos;
      // A block sequence may sit at the `?` column, which js-yaml 5 rejects.
      // `<<` here is a plain key, except to yaml.
      const outer = explicitAt;
      if (lenient) explicitAt = col;
      key = parseValue(col, false, true);
      if (lenient) explicitAt = outer;
      if (spec) key = asKey(key);
      // js-yaml measures indentation in spaces, so a tab may indent the `:`,
      // and js-yaml 4 reads it mid-line after a key that ends on a later line
      // indented like the mapping.
      const next = skipLines(!spec);
      if (spec && tabbed && next === col) tabIndent();
      if (
        (next === col || (lines && lineStart > at && leadingSpaces() === col)) &&
        indicator(COLON)
      ) {
        pos++;
        value = parseValue(col, false, true);
      } else {
        if (spec) leaf();
        else tab = lineStart > at;
        value = implicit(null);
      }
    } else {
      pos++;
      value = parseValue(col, false, !spec && emptyKey);
    }
    setKey(map, key, value, at, true);
    let next = skipLines(tab);
    // A value that ends on a later line indented like the mapping, as a flow
    // collection can, may be followed by the next entry in js-yaml 4.
    if (lenient && next > col && lineStart > at && leadingSpaces() === col) next = col;
    if (next !== col || isDocMarker()) {
      if (next > col) {
        // On a later line, js-yaml 5 counts only spaces, and so rejects the tab.
        if (js5 && tabbed && lineStart > at && leadingSpaces() === col) {
          pos = lineStart + col;
          fail(E.TAB_INDENT);
        }
        fail(E.MAP_INDENT);
      }
      break;
    }
    key = parseNextKey(tab, indent);
    if (!spec && key === END) break;
    at = keyAt;
  }
  depth--;
  return lenient && !lines && overridable.has(map) && !Object.keys(map).length ? null : map;
}

// A node that may be an implicit key, after its properties `props`. `multiline`
// lets a plain scalar continue on the next lines.
function parseKey(indent: number, props: Props | undefined, multiline: boolean): unknown {
  const ch = src.charCodeAt(pos);
  plain = true;
  crossed = false;
  emptyKey = indicator(COLON);
  if (emptyKey) {
    // js-yaml 4 needs a key, or at least a property, before a block `:`.
    if (!props && lenient) fail(E.KEY_MISSING);
    return null;
  }
  if (ch === STAR) {
    return parseAlias(props);
  }
  if ((ch | 32) === LBRACE) {
    // js-yaml 5 doesn't measure a flow key's indentation, and one after a
    // `key:` or `-` has none.
    if (tabbed && !js5 && leadingSpaces() <= indent && !src.slice(lineStart, pos).trim())
      bend(E.DEFICIENT_INDENT);
    return parseFlowCollection(indent);
  }
  if (ch === QUOTE || ch === DQUOTE) return parseQuoted(indent);
  return parsePlain(indent, false, multiline);
}

// The spec caps an implicit key at 1024 characters, from its start to the
// `:`, counting code points as the writer does.
function checkKey(start: number): void {
  if (spec && pos - start > 1024 && /^[\s\S]{1025}/u.test(src.slice(start, pos)))
    fail(E.KEY_LENGTH);
}

// The key of the next entry, EXPLICIT for an explicit `?` entry, or END
// where js-yaml reads no node and leaves the line to the mapping's parent.
// Leaves the position on the key's `:`.
function parseNextKey(allowTab: boolean, indent: number): unknown {
  if (tabbed && !allowTab) fail(E.TAB_INDENT);
  keyAt = pos;
  if (indicator(QMARK)) return EXPLICIT;
  if (!spec) frame(pos);
  const props = parseProps();
  const ch = src.charCodeAt(pos);
  const line = lineStart;
  // After properties that end their line, js-yaml reads the node on the
  // next line with content, if that's indented two more than the mapping's
  // parent.
  if (
    !spec &&
    props &&
    (ch === HASH || isBreak(ch)) &&
    skipLines(true) <= indent + 1 &&
    lineStart !== line
  )
    fail(E.MULTILINE_KEY);
  // Read on across lines, as js-yaml does, so a key missing its colon is
  // reported where the colon turns up.
  const key = parseKey(spec ? -1 : indent, props, !spec);
  const wasPlain = plain;
  if (!spec && key === null && plain && !emptyKey && !props) return END;
  if (!spec) emptyKey &&= !props;
  // js-yaml 4 reads on past the lines after an alias.
  if (lenient && ch === STAR) skipLines();
  skipSpace();
  const moved = (!spec && lineStart !== line) || crossed;
  if (src.charCodeAt(pos) !== COLON || moved) fail(spec || moved ? E.MULTILINE_KEY : E.KEY_COLON);
  if (!separated()) {
    if (!spec) pos++;
    fail(E.VALUE_SPACE);
  }
  checkKey(keyAt);
  return ch === STAR ? key : asKey(finish(key, props, wasPlain));
}

function parseBlockSeq(col: number): unknown[] {
  const seq: unknown[] = claim([]);
  for (;;) {
    const line = lineStart;
    pos++;
    if (lenient && afterEmpty(col)) {
      seq.push(finish(null));
      continue;
    }
    seq.push(parseValue(col, true));
    let next = skipLines();
    // js-yaml 4 measures the indentation of the line an entry ends on, not
    // where the next node starts on it.
    if (lines && next > col && lineStart > line && !tabbed) next = leadingSpaces();
    // A tab may not indent the next entry. js-yaml measures it in spaces,
    // which leave it short of the sequence; yamljs reads on.
    if ((!lenient || lines) && tabbed && next === col) {
      if (spec) tabIndent();
      next = leadingSpaces();
    }
    if (next !== col || !indicator(DASH) || isDocMarker()) {
      if (next > col) fail(E.SEQ_INDENT);
      break;
    }
  }
  depth--;
  return seq;
}

// After an empty entry, js-yaml 4 takes a `-` on a line indented no more
// than the sequence as its next entry, however little.
function afterEmpty(col: number): boolean {
  const save = pos;
  const line = lineStart;
  skipSpace();
  skipComment();
  if (isBreak(src.charCodeAt(pos)) && skipLines() >= 0 && leadingSpaces() <= col) {
    if (!tabbed && indicator(DASH) && !isDocMarker()) return true;
  }
  pos = save;
  lineStart = line;
  return false;
}

function parseBlockScalar(indent: number): string {
  const folded = src.charCodeAt(pos) === GT;
  let chomp = 0; // -1 strip, 0 clip, 1 keep
  let explicit = 0;
  for (;;) {
    const ch = src.charCodeAt(++pos);
    if (ch === 43 /* + */ || ch === DASH) {
      if (chomp) fail(E.CHOMP_REPEATED);
      chomp = 44 - ch; // 1 for +, -1 for -
    } else if (ch >= 49 && ch <= 57) {
      if (explicit) fail(E.WIDTH_REPEATED);
      explicit = ch - 48;
    } else if (ch === 48) {
      fail(E.WIDTH_ZERO);
    } else break;
  }
  if (!isBlank(src.charCodeAt(pos))) fail(E.HEADER_SPACE);
  skipSpace();
  skipComment();
  if (!isBreak(src.charCodeAt(pos))) fail(spec ? E.LINE_END : E.HEADER_BREAK);

  // js-yaml counts an indicator from the -1 indent of a top-level node.
  let textIndent = explicit ? (spec && indent < 0 ? 0 : indent) + explicit : -1;
  let maxEmpty = 0;
  const rows: string[] = []; // '' marks an empty line
  // pos is on the line break that ends the previous line.
  while (pos < len) {
    const lineStart = pos + 1;
    let p = lineStart;
    while (src.charCodeAt(p) === SPACE) p++;
    const spaces = p - lineStart;
    if (isBreak(src.charCodeAt(p)) && (textIndent < 0 || spaces <= textIndent)) {
      // js-yaml 5 also drops a last line of only spaces.
      if (p >= len && (!spaces || (js5 && textIndent >= 0))) break;
      if (spaces > maxEmpty) maxEmpty = spaces;
      rows.push("");
      pos = p;
      continue;
    }
    if (textIndent < 0) {
      if (lenient && indent < 0 && !spaces && !isBreak(src.charCodeAt(p))) {
        pos = p;
        fail(E.BLOCK_INDENT);
      }
      // js-yaml 4 ends the scalar at a line of tabs, and of a comment too.
      if (
        src.charCodeAt(p) === TAB &&
        spaces <= indent &&
        !(lenient && (lines ? /^[\t ]*(?:#|\n|$)/ : /^[\t ]*(?:\n|$)/).test(src.slice(p, p + 80)))
      ) {
        // js-yaml points at the tab, past the line break.
        if (!spec) pos = p;
        fail(E.TAB_INDENT);
      }
      // Unlike yaml, js-yaml lets a document marker end even this.
      if (spaces <= indent || (!spec && !spaces && isDocMarker(p))) break;
      if (spaces < maxEmpty) {
        if (lenient) break;
        fail(E.LEADING_EMPTY);
      }
      textIndent = spaces;
    } else if (spaces < textIndent) break;
    if (!spaces && isDocMarker(p)) break;
    const end = lineEnd(p);
    rows.push(src.slice(lineStart + textIndent, end));
    pos = end;
  }
  // js-yaml 4 stops past the line break, at the next line's content.
  if (lines && pos < len) pos = (lineStart = pos + 1) + leadingSpaces();
  plain = false;

  let last = rows.length;
  while (last > 0 && rows[last - 1] === "") last--;
  const trailing = rows.length - last;
  let out = rows.slice(0, last).join("\n");
  checkPrintable(out, true);
  if (folded) {
    out = "";
    let empty = 0;
    let more = false;
    for (let i = 0; i < last; i++) {
      const line = rows[i]!;
      if (!line) {
        empty++;
        continue;
      }
      const ch = line.charCodeAt(0);
      const was = more;
      more = ch === SPACE || ch === TAB;
      // Past the first line, a break between two lines that aren't more
      // indented is a space, or goes when empty lines follow it.
      out += (i > empty ? "\n".repeat(empty + +(more || was)) || " " : "\n".repeat(empty)) + line;
      empty = 0;
    }
  }
  // Clip keeps the last line break, and keep the empty lines after it too.
  return out + "\n".repeat(chomp < 0 ? 0 : (last && 1) + (chomp && trailing));
}

// Folds the line break(s) at `pos` inside a flow or plain scalar. Returns the
// text they stand for, and leaves `pos` at the next line's first content.
function foldBreaks(): string {
  let breaks = 0;
  while (src.charCodeAt(pos) === LF) {
    lineStart = ++pos;
    breaks++;
    skipSpace();
  }
  crossed = true;
  return breaks === 1 ? " " : "\n".repeat(breaks - 1);
}

// A quoted scalar can't hold a document marker, even after an escaped break,
// and goes on past the indentation of the block it's in.
function quotedBreaks(kind: string, indent: number): string {
  const breaks = foldBreaks();
  if (isDocMarker()) fail(E.QUOTED_DOCUMENT_END, kind);
  if ((!spec || pos < len) && leadingSpaces() <= indent) bend(E.DEFICIENT_INDENT);
  return breaks;
}

function parseQuoted(indent: number): string {
  const quote = src.charCodeAt(pos);
  const single = quote === QUOTE;
  const kind = single ? "single" : "double";
  let out = "";
  const first = ++pos;
  let start = first;
  // Saw a character the printable check may reject.
  let odd = false;
  for (;;) {
    const ch = src.charCodeAt(pos);
    if (ch !== ch) fail(E.QUOTED_END, kind);
    if (ch === quote) {
      if (single && src.charCodeAt(pos + 1) === QUOTE) {
        out += src.slice(start, pos + 1);
        start = pos += 2;
        continue;
      }
      out += src.slice(start, pos++);
      break;
    }
    if (ch < SPACE && ch !== TAB && ch !== LF) {
      // js-yaml 4 checks a run of text when it ends, so it reports there.
      if (lenient) {
        const end = src.slice(pos).search(single ? /['\n]/ : /["\\\n]/);
        pos = end < 0 ? len : pos + end;
      }
      fail(E.CONTROL_CHAR);
    } else if (spec && ch > 126) odd = true;
    if (ch === LF) {
      out += src.slice(start, pos).replace(/[ \t]+$/, "");
      out += quotedBreaks(kind, indent);
      start = pos;
      continue;
    }
    if (ch === BACKSLASH && !single) {
      out += src.slice(start, pos);
      // Past the end, `e` is undefined, which indexOf doesn't find.
      const e = src[++pos]!;
      if (e === "\n") {
        // Escaped line break: join without a space, keep empty lines. js-yaml
        // 5 drops those too.
        if (js5) quotedBreaks(kind, indent);
        else out += quotedBreaks(kind, indent).replace(" ", "");
      } else if (e === "x" || e === "u" || e === "U") {
        // 2, 4 or 8 hex digits.
        const size = 2 << "xuU".indexOf(e);
        const hex = src.slice(pos + 1, pos + 1 + size);
        const code = parseInt(hex, 16);
        if (!/^[\da-f]+$/i.test(hex) || hex.length < size || code > 0x10ffff) fail(E.HEX_ESCAPE);
        out += String.fromCodePoint(code);
        pos += size + 1;
      } else {
        const i = ESCAPES.indexOf(e);
        if (i < 0) fail(E.UNKNOWN_ESCAPE);
        out += ESCAPED[i];
        pos++;
      }
      start = pos;
      continue;
    }
    pos++;
  }
  // Escapes are printable, so this checks only what's written.
  if (odd) raw(first, pos);
  plain = false;
  return out;
}

// Scans a plain scalar. In block context it may continue on more indented
// lines; `multiline` is false for implicit keys.
function parsePlain(indent: number, flow: boolean, multiline: boolean): string | null {
  let ch = src.charCodeAt(pos);
  if (
    ch === HASH ||
    ch === COMMA ||
    (ch | 32) === RBRACE ||
    ch === 37 ||
    (ch | 32) === 96 /* @ or ` */ ||
    ch === PIPE ||
    ch === GT ||
    ((ch === DASH || ch === QMARK || ch === COLON) && separated(flow))
  ) {
    // Nothing here can start a scalar. Like js-yaml 4, read an empty node
    // and let the enclosing collection or document report what follows.
    if (spec) return fail(E.UNEXPECTED_CHAR, src[pos]);
    plain = true;
    return null;
  }
  let out = "";
  // Saw a character the printable check may reject.
  let odd = false;
  for (;;) {
    const start = pos;
    let end = pos;
    let at = pos;
    for (;;) {
      // Fast path: ASCII above '#' but ':' and flow indicators.
      if (ch > HASH && ch < 127 && ch !== COLON && !(flow && isFlowIndicator(ch))) {
        end = ++at;
        ch = src.charCodeAt(at);
        continue;
      }
      if (isBreak(ch)) break;
      if (ch === COLON) {
        pos = at;
        if (separated(flow)) break;
      } else if (ch === HASH) {
        const prev = src.charCodeAt(at - 1);
        if (prev === SPACE || prev === TAB) break;
      } else if (flow && isFlowIndicator(ch)) break;
      else odd ||= ch < SPACE ? ch !== TAB : ch > 126 && (ch < 160 || ch > 0xd7ff);
      if (ch !== SPACE && ch !== TAB) end = at + 1;
      ch = src.charCodeAt(++at);
    }
    pos = at;
    out += src.slice(start, end);
    if (!multiline || ch !== LF) {
      // In flow context the scalar owns its trailing white space, as in js-yaml.
      if (!flow || ch === LF) pos = end;
      break;
    }
    // Look ahead for a continuation line.
    const save = pos;
    const saveLine = lineStart;
    const wasCrossed = crossed;
    const folded = foldBreaks();
    ch = src.charCodeAt(pos);
    if (
      pos >= len ||
      ch === HASH ||
      isDocMarker() ||
      // js-yaml 5 counts spaces only, as js-yaml 4 does for an explicit key,
      // after which a tab may indent the next entry. In flow, js-yaml 4 ends
      // the scalar at a line indented no deeper than the block around.
      (flow
        ? isFlowIndicator(ch) || (lines && leadingSpaces() <= indent)
        : (js5 || (lenient && indent === explicitAt) ? leadingSpaces() : pos - lineStart) <=
          indent) ||
      indicator(COLON, flow)
    ) {
      // js-yaml stays on the line it looked at, unless it's indented too little.
      if (spec || (lenient && !lines) || pos - lineStart <= indent || leadingSpaces() <= indent) {
        pos = save;
        lineStart = saveLine;
      }
      crossed = wasCrossed;
      break;
    }
    if (leadingSpaces() <= indent) {
      if (!flow) fail(E.TAB_INDENT);
      bend(E.DEFICIENT_INDENT);
    }
    out += folded;
  }
  plain = true;
  checkPrintable(out, odd);
  return out;
}

// Comments may hold anything, so only scalars are checked, and plain ones
// only when their scan saw a character outside printable ASCII.
function checkPrintable(text: string, odd: boolean): void {
  if (odd && NON_PRINTABLE.test(text)) fail(E.NON_PRINTABLE);
}

// Skips white space, comments and line breaks inside a flow collection whose
// block parent sits at column `indent`. Returns whether a line ended. Only
// js-yaml 5 measures the line's indentation at a tab within it too.
function skipFlowSpace(indent: number): boolean {
  let ended = false;
  let tab = false;
  for (;;) {
    const start = pos;
    skipSpace();
    if (js5) tab ||= hasTab(start, pos);
    skipComment();
    if (src.charCodeAt(pos) !== LF) break;
    lineStart = ++pos;
    ended = true;
  }
  if ((ended || (js5 && tab)) && (!spec || pos < len)) {
    if (ended && isDocMarker()) fail(E.DEFICIENT_INDENT);
    const closes = spec && (src.charCodeAt(pos) | 32) === RBRACE && leadingSpaces() === indent;
    if (leadingSpaces() <= indent && !closes) bend(E.DEFICIENT_INDENT);
  }
  return ended;
}

function parseFlowCollection(indent: number): unknown {
  const isMap = src.charCodeAt(pos) === LBRACE;
  const close = isMap ? RBRACE : RBRACKET;
  const result: unknown = claim(isMap ? {} : []);
  pos++;
  for (;;) {
    skipFlowSpace(indent);
    let ch = src.charCodeAt(pos);
    if (ch === close) {
      pos++;
      break;
    }
    if (ch !== ch) fail(E.FLOW_END);
    let explicit = false;
    if (indicator(QMARK)) {
      explicit = true;
      pos++;
      skipFlowSpace(indent);
      ch = src.charCodeAt(pos);
    }
    const at = pos;
    const line = lineStart;
    const empty = (explicit && (ch === COMMA || ch === close)) || indicator(COLON, true);
    if (empty) plain = true;
    else if (ch === COMMA) fail(E.EMPTY_ENTRY);
    crossed = false;
    if (!spec) frame(at);
    const node = empty ? finish(null) : parseFlowNode(indent);
    const multiline = crossed;
    const broken = skipFlowSpace(indent);
    ch = src.charCodeAt(pos);
    // An entry of a sequence is a key only before a `:`.
    const key = isMap || explicit || ch === COLON ? asKey(node) : node;
    // An implicit key in a flow sequence must end on its own line, and in
    // js-yaml 4 any implicit key on the line it starts.
    if (ch === COLON && !explicit && (lines || !isMap)) {
      if (js5 || lines ? lineStart !== line : broken || multiline) fail(E.MISSED_COMMA);
      checkKey(at);
    }
    let value: unknown;
    let pair = isMap || explicit;
    // In a sequence, a pair is a mapping one level deeper, and so is its key.
    const nested = spec && !isMap && (explicit || ch === COLON);
    if (nested) {
      if (!deep && brink >= at) fail(E.MAX_DEPTH, maxDepth);
      leaf(++depth);
    }
    if (ch === COLON) {
      // Only a quoted or flow collection key may have its value right after.
      if (spec && (plain || src.charCodeAt(at) === STAR) && !separated(true)) fail(E.VALUE_SPACE);
      pos++;
      pair = true;
      skipFlowSpace(indent);
      ch = src.charCodeAt(pos);
      if (!spec) frame(pos);
      if (ch !== COMMA && ch !== close) value = parseFlowNode(indent);
      // yaml reads an empty node after the `:`, not a missing value.
      else value = spec ? finish(null) : implicit(null);
      skipFlowSpace(indent);
      ch = src.charCodeAt(pos);
    } else if (pair) {
      if (spec) leaf();
      value = implicit(null);
    }
    if (isMap) setKey(result as Record<string, unknown>, key, value, at);
    else (result as unknown[]).push(pair ? setKey({}, key, value, at) : node);
    if (nested) depth--;
    if (ch === COMMA) pos++;
    // js-yaml says when the input ends where a comma or the end should be.
    else if (ch !== close) fail((js5 || lines) && ch !== ch ? E.FLOW_END : E.MISSED_COMMA);
  }
  plain = false;
  depth--;
  return result;
}

function parseFlowNode(indent: number): unknown {
  const props = parseProps(true);
  // Properties go on over lines. js-yaml 4 and 5 end them at a repeat, which
  // leaves a missed comma, and read the node as multiline.
  while (props && skipFlowSpace(indent)) {
    if (leadingSpaces() <= Math.max(indent, 0)) {
      if (!js5) return fail(E.MISSED_COMMA);
      // js-yaml 5 reads an empty node, and leaves the rest to the collection.
      crossed = true;
      return finish(null, props);
    }
    if (!spec) crossed = true;
    parseProps(true, false, props, js5 || (lenient && !repeats));
  }
  const ch = src.charCodeAt(pos);
  if ((ch | 32) === LBRACE) return finish(parseFlowCollection(indent), props);
  if (ch === STAR) return parseAlias(props);
  let value: string | null = null;
  if (ch === QUOTE || ch === DQUOTE) value = parseQuoted(indent);
  // `[` and `{` were taken above.
  else if (props && (isFlowIndicator(ch) || indicator(COLON, true))) plain = true;
  else value = parsePlain(indent, true, true);
  return finish(value, props, plain);
}
