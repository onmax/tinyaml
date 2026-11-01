// The `yaml` package's `parse` on the shared parser: values resolve through
// yaml's schemas and tag objects, and errors are YAMLParseErrors with yaml's
// codes.
import * as E from "../core/codes.ts";
import {
  define,
  fail,
  MERGE_TAG,
  original,
  parse as parseDocs,
  type Engine,
  type Mark,
} from "../core/parse.ts";
import { prettify, YAMLParseError, YAMLWarning, type ErrorCode, type YAMLError } from "./errors.ts";
import { MESSAGES } from "./messages.ts";
import { stringifyKey } from "./stringify.ts";
import {
  checkVersion,
  Collection,
  getTags,
  known,
  MERGE,
  Scalar,
  toNode,
  typed,
  Y,
  type CustomTags,
  type Tag,
  type Tags,
} from "./tags.ts";

export type Reviver = (this: unknown, key: unknown, value: unknown) => unknown;
type Pos = Pick<Mark, "buffer" | "position">;
type Span = [number, number];

export interface ParseOptions {
  /** "core" (default), "json", "failsafe" or "yaml-1.1". */
  schema?: string;
  /** Extra tags, or a function rewriting the schema's tag list. */
  customTags?: CustomTags;
  /** Warn about plain scalars this schema, or these tags, would read as another type. */
  compat?: string | Tags | null;
  /** Merge `<<` keys. Default false, true for YAML 1.1. */
  merge?: boolean;
  /** Resolve !!binary, !!omap, !!pairs, !!set and !!timestamp with the core schema. Default true. */
  resolveKnownTags?: boolean;
  /**
   * Reject duplicate keys. Default true. A function tells whether two keys
   * are the same; yaml passes it its key nodes, tinyaml `{ value }` with each
   * key's parsed value.
   */
  uniqueKeys?: boolean | ((a: { value: unknown }, b: { value: unknown }) => boolean);
  intAsBigInt?: boolean;
  /** Cap on alias expansion, as yaml counts it; -1 for none. Default 100. */
  maxAliasCount?: number;
  /** Add positions and an excerpt of the source to error messages. Default true. */
  prettyErrors?: boolean;
  /** "silent" and "error" don't emit warnings. Default "warn". */
  logLevel?: "silent" | "error" | "warn" | "debug";
  /** YAML version of documents without a %YAML directive. Default "1.2". */
  version?: "1.1" | "1.2" | "next";
  /** Used over the reviver argument when set. */
  reviver?: Reviver;
  /** Called with each anchored value and how many times it's used, before the reviver runs. */
  onAnchor?: (value: unknown, count: number) => void;
  /** Other yaml options are accepted and ignored. */
  [option: string]: unknown;
}

let warnings: YAMLWarning[] = [];
let source = "";
let pretty = true;
let keyWarned: string | false = false;
// Why to throw from the alias count, once the aliases read so far are
// counted.
let excess: (() => string | undefined) | undefined;
const counted = () => {
  const why = excess?.();
  if (why) throw new ReferenceError(why);
};
// Each anchored value, how many times it's used, and its collection's depth
// while it's open.
type Use = [value: unknown, count: number, depth: number];
let anchored: Use[] = [];
const STR = `${Y}str`;
// The engine's tag after a plain scalar that a tag would read only as a key.
const KEY = "key";

// Points `error` at `mark`, or at the span from there to `end` in the same
// copy of the input, which holds no line break or byte order mark the parser
// dropped.
function report<T extends YAMLError>(error: T, mark: Pos | undefined, end?: number): T {
  if (mark) {
    let from = original(source, mark);
    let to = from + 1;
    if (end !== undefined) {
      to = original(source, { buffer: mark.buffer, position: end });
      from = to - end + mark.position;
    }
    error.pos = [from, to];
    if (pretty) prettify(source, error);
  }
  return error;
}

// `reason` is yaml's code and message, from the table.
function toError(reason: string, mark: Mark, code: number): Error {
  if (code === E.ALIAS_UNKNOWN) return new ReferenceError(reason);
  if (code === E.MERGE_SOURCE) return new Error(reason);
  const space = reason.indexOf(" ");
  // `@` and `` ` `` are reserved, so a plain scalar starting with them has
  // its own code.
  const name =
    code === E.UNEXPECTED_CHAR && /"[@`]"$/.test(reason)
      ? "BAD_SCALAR_START"
      : (reason.slice(0, space) as ErrorCode);
  return report(new YAMLParseError([0, 0], name, reason.slice(space + 1)), mark);
}

// Where the parser is now, from inside the engine, which isn't handed a mark.
function where(): Mark {
  try {
    fail("");
  } catch (error) {
    return (error as { mark: Mark }).mark;
  }
}

// yaml warns about an anchor or alias name ending in `:` at the colon, which
// the parser has just read.
function colon(kind: string, { buffer, position }: Pos): void {
  const warning = new YAMLWarning([0, 0], "BAD_ALIAS", `${kind} ending in : is ambiguous`);
  warnings.push(report(warning, { buffer, position: position - 1 }));
}

// A warning or an error raised from inside the engine: on the tag at `span`,
// else where the parser is now.
function here(code: ErrorCode, message: string, warning?: boolean, span?: Span): void {
  const mark = where();
  const at = span && { buffer: mark.buffer, position: span[0] };
  const error = new (warning ? YAMLWarning : YAMLParseError)([0, 0], code, message);
  report(error, at ?? mark, span?.[1]);
  if (!warning) throw error;
  warnings.push(error);
}

// Where the plain scalar `text` the parser has just read is: it ends before
// any white space the parser has passed. An empty one is where the parser is,
// and an empty document's, read after the parser is done, nowhere.
function plain(text: string): Span | undefined {
  const mark = where();
  if (!mark) return undefined;
  const { buffer, position } = mark;
  let end = position;
  while (text && (buffer[end - 1] === " " || buffer[end - 1] === "\t")) end--;
  return [end - text.length, end];
}

// How yaml writes a tag in its messages.
const short = (tag: string) =>
  tag.startsWith(Y) ? `!!${tag.slice(Y.length)}` : tag[0] === "!" ? tag : `!<${tag}>`;

// yaml's guard against alias expansion, which it runs as it converts the
// document, in order: each alias adds one to its anchor's count and weighs
// that count times the anchor's weight, taken at its first alias that finds
// one. A node weighs 1 with a scalar or a pair in it, an alias in it its
// anchor's weight then, and a collection the most of what it holds. No alias
// may weigh more than `max`. A node's weight depends on what follows the
// alias, so the parser records the anchors and aliases, and `check` replays
// them once they're read.
interface Anchor {
  count: number;
  weight: number;
  // A scalar or pair in the node, outside its aliases and anchored collections.
  leaf: boolean;
  // The anchors of the aliases, and the anchored collections, right in it.
  aliases: Anchor[];
  kids: Anchor[];
  parent: Anchor | undefined;
  // Its collection's depth while it's open.
  depth: number;
}

function aliasCounter(max: number): [Engine["anchor"], () => string | undefined] {
  const anchors = new Map<string, Anchor>();
  const nodes = new Set<unknown>();
  const read: Anchor[] = [];
  let done = 0;
  let why: string | undefined;
  let open: Anchor | undefined;
  const hasLeaf = (value: unknown): boolean =>
    !value || typeof value !== "object" || (!nodes.has(value) && leafIn(value));
  const leafIn = (value: object): boolean =>
    Array.isArray(value)
      ? value.some(hasLeaf)
      : Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length > 0;
  const weigh = (anchor: Anchor): number =>
    anchor.aliases.reduce(
      (most, a) => Math.max(most, a.count * a.weight),
      anchor.kids.reduce((most, a) => Math.max(most, weigh(a)), +anchor.leaf),
    );
  const check = () => {
    while (!why && done < read.length) {
      const anchor = read[done++]!;
      anchor.weight ||= weigh(anchor);
      if (++anchor.count * anchor.weight > max)
        why = "Excessive alias count indicates a resource exhaustion attack";
    }
    return why;
  };
  return [
    max < 0
      ? undefined
      : (name, depth, value, starts) => {
          if (starts === undefined) {
            if (!max) why ||= "Alias resolution is disabled";
            const anchor = anchors.get(name)!;
            read.push(anchor);
            open?.aliases.push(anchor);
          } else if (!starts && open?.depth === depth + 1) {
            open.leaf = leafIn(value as object);
            open = open.parent;
          } else {
            const anchor: Anchor = {
              count: 1,
              weight: 0,
              leaf: !starts,
              aliases: [],
              kids: [],
              parent: open,
              depth,
            };
            anchors.set(name, anchor);
            if (starts) {
              open?.kids.push(anchor);
              nodes.add(value);
              open = anchor;
            }
          }
        },
    check,
  ];
}

// yaml merges a mapping by converting it to JS again, so what's in it is
// copied, except for aliases and scalars, and each anchor in it names the
// copy from then on. A node anchored after the mapping opened and before it
// closed is in it; one anchored outside it is an alias. `note` hears of each
// alias in it, and of each anchored node it copies.
function merger(
  note: (value: object, copy?: object) => void,
): [NonNullable<Engine["anchor"]>, NonNullable<Engine["merge"]>, WeakSet<object>] {
  // When each anchored node opened and closed, and its anchor, which names
  // the node's latest copy.
  const nodes = new WeakMap<object, [number, number, { name: string; value: unknown }?]>();
  const scalars = new WeakSet<object>();
  let clock = 0;
  return [
    (name, _, value, starts) => {
      if (value && typeof value === "object")
        nodes.set(
          value,
          starts ? [clock++, Infinity] : [nodes.get(value)?.[0] ?? clock, clock++, { name, value }],
        );
    },
    (source, anchors) => {
      const [from, to] = nodes.get(source as object) ?? [];
      if (from === undefined) return source;
      const copies = new Map<object, any>();
      const copy = (value: unknown): unknown => {
        if (!value || typeof value !== "object" || scalars.has(value)) return value;
        const [, at, anchor] = nodes.get(value) ?? [];
        if (anchor && !(at! > from && at! < to!)) {
          note(anchor.value as object);
          return anchor.value;
        }
        let out = copies.get(value);
        if (out) {
          note(out);
          return out;
        }
        const set = value instanceof Set;
        const map = value instanceof Map;
        out = Array.isArray(value)
          ? []
          : set
            ? new Set()
            : map
              ? new Map()
              : Object.getPrototypeOf(value) === Object.prototype && {};
        if (!out) return value;
        copies.set(value, out);
        const span: [number, number, typeof anchor] = [clock++, Infinity, anchor];
        // The anchor names the copy before what's in it is copied, which may
        // hold aliases to it.
        if (anchor) {
          if (anchors.get(anchor.name) === anchor.value) anchors.set(anchor.name, out);
          note(anchor.value as object, out);
          anchor.value = out;
          nodes.set(out, span);
        }
        if (set) for (const v of value) out.add(copy(v));
        else if (map) for (const [k, v] of value) out.set(copy(k), copy(v));
        else for (const [k, v] of Object.entries(value)) define(out, k, copy(v));
        span[1] = clock++;
        return out;
      };
      return Object.fromEntries(Object.entries(source as object).map(([k, v]) => [k, copy(v)]));
    },
    scalars,
  ];
}

function engine(options: ParseOptions, version: string, directive?: string): Engine {
  const v11 = version === "1.1";
  // yaml reads the schema options over its version's defaults, which take
  // them even when undefined.
  const { schema, resolveKnownTags } = {
    schema: v11 ? "yaml-1.1" : "core",
    resolveKnownTags: !v11,
    ...options,
  };
  const tags = getTags(
    options.customTags,
    (typeof schema === "string" && schema) || "core",
    options.merge,
  );
  const knownTags = resolveKnownTags ? known : [];
  const c = options.compat;
  const compat = c ? (Array.isArray(c) ? getTags(c, "compat") : getTags(null, c)) : undefined;
  const max = options.maxAliasCount;
  const limit = typeof max === "number" ? max : 100;
  // Each anchored value and how many times it's used, for onAnchor, by the
  // anchor's name and by the value. yaml counts uses only with a limit on
  // them, and starts again for each anchored node a merge copies.
  const uses: Use[] = [];
  const named = new Map<string, Use>();
  const used = new Map<unknown, Use>();
  const use = (u: Use | undefined) => {
    if (u && limit >= 0) u[1]++;
  };
  const [track, merge, scalars] = merger((value, copy) => {
    const u = used.get(value);
    if (!copy) use(u);
    else if (u) used.set(copy, Object.assign(u, [copy, 1]));
  });
  // yaml reports a tag's error on the tag, or on a plain scalar without one.
  const resolve = (type: Tag, input: unknown, span?: Span): unknown => {
    const onError = (message: string) =>
      here("TAG_RESOLVE_FAILED", message, false, span ?? plain(input as string));
    let value: unknown;
    try {
      value = type.resolve ? type.resolve(input, onError, options) : input;
    } catch (error) {
      if (error instanceof YAMLParseError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (!type.collection) onError(message);
      // yaml reads an empty node with the tag where the collection was, and
      // reports the error at the collection.
      self.explicit(null, type.tag, "fallback", undefined, span);
      const { buffer } = where();
      const at = span![1] + /^(?:\s|#.*|&\S*)*/.exec(buffer.slice(span![1]))![0].length;
      throw report(new YAMLParseError([0, 0], "RESOURCE_EXHAUSTION", message), {
        buffer,
        position: at,
      });
    }
    // A collection tag may return the node it was given, or nothing for it.
    if (type.collection) value ??= input;
    if (value instanceof Scalar || value instanceof Collection) value = value.toJSON();
    if (value === MERGE) {
      self.tag = MERGE_TAG;
      return "<<";
    }
    if (value && typeof value === "object" && !type.collection) scalars.add(value);
    return value;
  };
  // Warns when the compat schema reads the plain scalar `text` with another
  // tag than `type`, and returns where the warning went, or -1.
  const differs = (type: Tag | undefined, text: string, span?: Span): number => {
    const a = type?.tag ?? STR;
    const b = compat!.find((t) => t.default && t.test?.test(text))?.tag ?? STR;
    if (a === b) return -1;
    here(
      "TAG_RESOLVE_FAILED",
      `Value may be parsed as either ${short(a)} or ${short(b)}`,
      true,
      span,
    );
    return warnings.length - 1;
  };
  // A plain scalar a tag only reads as a key: the tag, the text, the compat
  // warning given for it as a value, and where it is.
  let pending: [Tag, string, number, Span | undefined] | undefined;
  // With a uniqueKeys function, every key in a mapping so far.
  const unique = options.uniqueKeys;
  const earlier = new WeakMap<object, { value: unknown }[]>();
  const [count, check] = aliasCounter(limit);
  excess = check;
  anchored = uses;
  const self: Engine = {
    tag: "",
    messages: MESSAGES,
    json: options.uniqueKeys === false,
    maxDepth: Infinity,
    maxMergeKeys: -1,
    spec: true,
    anchor(name, depth, value, starts) {
      let u = named.get(name);
      if (starts === undefined) {
        if (name.endsWith(":")) colon("Alias", where());
        // An alias as a key isn't the scalar read before it.
        self.tag = "";
        use(u);
      } else {
        // A collection's anchor comes again as it ends, with its value now.
        if (starts || u?.[2] !== depth + 1) {
          uses.push((u = [value, 1, starts ? depth : -1]));
          named.set(name, u);
        }
        used.set((u[0] = value), u);
      }
      count?.(name, depth, value, starts);
      track(name, depth, value, starts);
    },
    merge,
    duplicate(map, key, name) {
      // yaml tells scalar keys apart by their values, so 1 and "1", or null
      // and "", go under one name, the last winning.
      const fresh = !Object.hasOwn(map, name);
      let seen: unknown[] = [];
      if (!fresh || typeof key !== "string") {
        const names = typed.get(map) ?? new Map<string, unknown[]>();
        seen = names.get(name) ?? (fresh ? [] : [name]);
        typed.set(map, names.set(name, [...seen, key]));
      }
      if (typeof unique === "function") {
        const keys = earlier.get(map) ?? [];
        const node = { value: key };
        earlier.set(map, keys);
        return keys.some((k) => unique(k, node)) || !keys.push(node);
      }
      // NaN is a key of its own. yaml's collection keys are too, but tinyaml
      // tells them apart only by how they're written out.
      return !!seen.length && (key === Object(key) || seen.indexOf(key) >= 0);
    },
    // yaml resolves an empty node like "", but a pair without a value is
    // null whatever the schema.
    implicit(text, node) {
      if (text === null) {
        if (!node) return null;
        text = "";
      }
      // The first tag that reads it, and one before that which would as a key.
      let key: Tag | undefined;
      const type = tags.find(
        (t) => t.default && t.test?.test(text) && (t.default === true || !(key ??= t)),
      );
      const span = compat ? plain(text) : undefined;
      const warned = compat ? differs(type, text, span) : -1;
      const value = type ? resolve(type, text) : text;
      if (key) {
        pending = [key, text, warned, span];
        self.tag = KEY;
      }
      return value;
    },
    atKey(key) {
      if (self.tag !== KEY) return key;
      const [type, text, warned, span] = pending!;
      self.tag = "";
      if (warned >= 0) warnings.splice(warned, 1);
      if (compat) differs(type, text, span);
      return resolve(type, text);
    },
    explicit(value, name, kind, _, span) {
      if (kind === "sequence" || kind === "mapping") {
        const type = kind === "sequence" ? "seq" : "map";
        if (name === Y + type) return value;
        let found = tags.find((t) => t.tag === name && t.collection === type);
        if (!found) {
          const kt = knownTags.find((t) => t.tag === name);
          if (kt?.collection === type) found = kt;
          else {
            if (kt)
              here(
                "BAD_COLLECTION_TYPE",
                `${name} used for ${type} collection, but expects ${kt.collection ?? "scalar"}`,
                true,
                span,
              );
            else here("TAG_RESOLVE_FAILED", `Unresolved tag: ${name}`, true, span);
            return value;
          }
        }
        return resolve(found, toNode(value), span);
      }
      const text = (value ?? "") as string;
      const named = tags.filter((t) => !t.collection && t.tag === name);
      const found =
        named.find((t) => !(t.default && t.test)) ??
        named.find((t) => t.test!.test(text)) ??
        knownTags.find((t) => !t.collection && t.tag === name);
      if (found) return resolve(found, text, span);
      here("TAG_RESOLVE_FAILED", `Unresolved tag: ${name}`, name !== STR, span);
      return text;
    },
    key(key) {
      if (key === null) return "";
      if (typeof key !== "object") {
        return String(key as string | number | boolean | bigint);
      }
      // Writing it out expands its aliases.
      counted();
      const text = stringifyKey(key);
      if (!keyWarned) {
        let json = JSON.stringify(text);
        if (json.length > 40) json = `${json.substring(0, 36)}..."`;
        keyWarned = `Keys with collection values will be stringified due to JS Object restrictions: ${json}. Set mapAsMap: true to use object keys.`;
      }
      return text;
    },
    // The engine's own reason is empty, from `here`, which only wants the position.
    error: (reason, mark, code) =>
      code === undefined ? ({ mark } as never) : toError(reason, mark, code),
    // The table words an unknown directive as its name. yaml points from the
    // start of the directive's line, or 6 characters in for the version, to
    // the end of what's before its comment, which the parser has passed.
    warn(reason, mark, code) {
      if (code === E.ANCHOR_COLON) return colon("Anchor", mark);
      const { buffer, position } = mark;
      const version = code === E.YAML_UNSUPPORTED;
      const message = version
        ? `Unsupported YAML version ${directive}`
        : `Unknown directive %${reason}`;
      const start = buffer.lastIndexOf("\n", position - 2) + 1;
      const end = start + /^[^\n]*?(?=[ \t]*(?:[ \t]#|\n))/.exec(buffer.slice(start))![0].length;
      const at = { buffer, position: start + (version ? 6 : 0) };
      warnings.push(report(new YAMLWarning([0, 0], "BAD_DIRECTIVE", message), at, end));
    },
  };
  return self;
}

function emit(level: ParseOptions["logLevel"], warning: unknown): void {
  if (level === "debug" || level === "warn") {
    const p = (globalThis as { process?: { emitWarning?: (w: unknown) => void } }).process;
    if (typeof p?.emitWarning === "function") p.emitWarning(warning);
    else console.warn(warning);
  }
}

/**
 * The value of the single YAML document in `src`, null when there is none.
 * Throws a YAMLParseError for invalid input or more than one document.
 */
export function parse(src: string, reviver?: Reviver | ParseOptions, options?: ParseOptions): any {
  let fn: Reviver | undefined;
  if (typeof reviver === "function") fn = reviver;
  else if (options === undefined && reviver && typeof reviver === "object") options = reviver;
  options ??= {};
  const prettyErrors = options.prettyErrors;
  // yaml reads its own copy of the options over defaults, which an option
  // set to undefined still replaces.
  options = {
    intAsBigInt: false,
    keepSourceTokens: false,
    logLevel: "warn",
    prettyErrors: true,
    strict: true,
    stringKeys: false,
    uniqueKeys: true,
    version: "1.2",
    ...options,
  };
  if ("reviver" in options) fn = options.reviver;
  const level = options.logLevel;
  // A custom tag may parse another document in the middle of this one.
  const outer = [warnings, source, pretty, keyWarned, excess, anchored] as const;
  try {
    source = src;
    pretty = prettyErrors !== false;
    warnings = [];
    keyWarned = false;
    excess = undefined;
    const directive = /^(?:[ \t]*(?:#.*)?\r?\n|%.*\r?\n)*%YAML[ \t]+(\S+)/.exec(src)?.[1];
    // Where yaml sees documents start. Unlike the shared parser, it counts an
    // empty one for each `...` with no document open.
    const starts: number[] = [];
    let open = false;
    let empty = 0;
    // In a document, only a line that may be a marker matters.
    const lines = [/^.*$/gm, /^\uFEFF?[-.].*$/gm];
    for (let at = 0, line: RegExpExecArray | null; ; at = line.index + line[0].length + 1) {
      const re: RegExp = lines[+open]!;
      re.lastIndex = at;
      if (!(line = re.exec(src))) break;
      const text = line[0].replace(/^\uFEFF/, "");
      if (/^\.\.\.(?:\s|$)/.test(text)) {
        if (!open) empty = starts.push(line.index);
        open = false;
      } else if (/^---(?:\s|$)/.test(text) || (!open && /^(?![ \t]*#|%)\s*\S/.test(text)))
        open = !!starts.push(line.index);
    }
    let docs: unknown[];
    try {
      // A %YAML directive yaml supports sets the version. Another one leaves
      // it to the option, or 1.2 when that's unset.
      const version = checkVersion(
        directive === "1.1" || directive === "1.2"
          ? directive
          : directive
            ? options.version || "1.2"
            : options.version,
      );
      const use = engine(options, version, directive);
      try {
        docs = parseDocs(src, use);
      } catch (error) {
        // Nesting deep enough to overflow the stack.
        if (error instanceof RangeError)
          throw new YAMLParseError([0, 0], "RESOURCE_EXHAUSTION", error.message);
        throw error;
      }
      // An empty document holds an empty node.
      empty += docs.length;
      if (!docs.length && empty) docs.push(use.implicit(null, true));
    } finally {
      // yaml warns in the order of the input, where the parser warns about a
      // collection's tag only once it has read the collection.
      warnings.sort((a, b) => a.pos[0] - b.pos[0]);
      for (const warning of warnings) emit(level, warning);
    }
    if (empty > 1) {
      const error = new YAMLParseError(
        [starts[1] ?? 0, (starts[1] ?? 0) + 1],
        "MULTIPLE_DOCS",
        "Source contains multiple documents; please use YAML.parseAllDocuments()",
      );
      if (pretty) prettify(src, error);
      throw error;
    }
    if (keyWarned) emit(level, keyWarned);
    counted();
    const value = docs.length ? docs[0] : null;
    const { onAnchor } = options;
    if (typeof onAnchor === "function") for (const [res, count] of anchored) onAnchor(res, count);
    return fn ? revive(fn, { "": value }, "", value) : value;
  } finally {
    [warnings, source, pretty, keyWarned, excess, anchored] = outer;
  }
}

// JSON.parse's reviver walk, extended to Maps and Sets as yaml does.
function revive(fn: Reviver, holder: unknown, key: unknown, value: any): unknown {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      // Entries the reviver adds aren't visited.
      for (let i = 0, length = value.length; i < length; i++) {
        const v0 = value[i];
        const v1 = revive(fn, value, String(i), v0);
        // oxlint-disable-next-line no-array-delete
        if (v1 === undefined) delete value[i];
        else if (v1 !== v0) value[i] = v1;
      }
    } else {
      const map = value instanceof Map;
      const set = value instanceof Set;
      const entries = map || set ? Array.from(value.keys(), (k) => [k]) : Object.entries(value);
      for (const [k, entry] of entries) {
        const v0 = map ? value.get(k) : set ? k : entry;
        const v1 = revive(fn, value, k, v0);
        if (v1 === undefined || (set && v1 !== v0)) {
          if (map || set) value.delete(k);
          else delete value[k];
        }
        if (v1 !== undefined && v1 !== v0) {
          if (map) value.set(k, v1);
          else if (set) value.add(v1);
          else value[k] = v1;
        }
      }
    }
  }
  return fn.call(holder, key, value);
}
