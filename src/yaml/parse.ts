// The `yaml` package's `parse` on the shared parser: values resolve through
// yaml's schemas and tag objects, and errors are YAMLParseErrors with yaml's
// codes.
import * as E from "../core/codes.ts";
import {
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
  getTags,
  keys,
  known,
  MERGE,
  Y,
  type CustomTags,
  type ParseFlags,
  type Tag,
} from "./tags.ts";

export type Reviver = (this: unknown, key: unknown, value: unknown) => unknown;

export interface ParseOptions {
  /** "core" (default), "json", "failsafe" or "yaml-1.1". */
  schema?: string;
  /** Extra tags, or a function rewriting the schema's tag list. */
  customTags?: CustomTags;
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

function report<T extends YAMLError>(error: T, mark: Mark | undefined): T {
  if (mark) {
    const offset = original(source, mark);
    error.pos = [offset, offset + 1];
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

// A warning or an error raised where the parser is now, from inside the
// engine, which isn't handed a position.
function here(code: ErrorCode, message: string, warning?: boolean): void {
  let mark: Mark | undefined;
  try {
    fail("");
  } catch (error) {
    mark = (error as { mark?: Mark }).mark;
  }
  if (!warning) throw report(new YAMLParseError([0, 0], code, message), mark);
  warnings.push(report(new YAMLWarning([0, 0], code, message), mark));
}

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

function engine(options: ParseOptions, version: string): Engine {
  const v11 = version === "1.1";
  const schema = options.schema ?? (v11 ? "yaml-1.1" : "core");
  const tags = getTags(options.customTags, schema, options.merge);
  const knownTags = (options.resolveKnownTags ?? !v11) ? known : [];
  const flags: ParseFlags = options;
  const resolve = (type: Tag, text: unknown): unknown => {
    let value: unknown;
    try {
      value = type.resolve
        ? type.resolve(text, (message) => here("TAG_RESOLVE_FAILED", message), flags)
        : text;
    } catch (error) {
      if (error instanceof YAMLParseError) throw error;
      here("TAG_RESOLVE_FAILED", error instanceof Error ? error.message : String(error));
    }
    if (value === MERGE) {
      self.tag = MERGE_TAG;
      return "<<";
    }
    return value;
  };
  // The keys under each name in a mapping, where a key that isn't a string
  // went: yaml tells scalar keys apart by their values, so 1 and "1", or null
  // and "", go under one name, the last winning.
  const typed = new WeakMap<object, Map<string, unknown[]>>();
  // With a uniqueKeys function, every key in a mapping so far.
  const unique = options.uniqueKeys;
  const earlier = new WeakMap<object, { value: unknown }[]>();
  const [anchor, check] = aliasCounter(options.maxAliasCount ?? 100);
  excess = check;
  const self: Engine = {
    tag: "",
    messages: MESSAGES,
    json: options.uniqueKeys === false,
    maxDepth: Infinity,
    maxMergeKeys: -1,
    spec: true,
    anchor,
    duplicate(map, key, name) {
      if (typeof unique === "function") {
        const keys = earlier.get(map) ?? [];
        const node = { value: key };
        earlier.set(map, keys);
        return keys.some((k) => unique(k, node)) || !keys.push(node);
      }
      const fresh = !Object.hasOwn(map, name);
      if (fresh && typeof key === "string") return false;
      const names = typed.get(map) ?? new Map<string, unknown[]>();
      const seen = names.get(name) ?? (fresh ? [] : [name]);
      typed.set(map, names.set(name, [...seen, key]));
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
      const type = tags.find(
        (t) => (t.default === true || t.default === "key") && t.test?.test(text),
      );
      return type ? resolve(type, text) : text;
    },
    explicit(value, name, kind) {
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
              );
            else here("TAG_RESOLVE_FAILED", `Unresolved tag: ${name}`, true);
            return value;
          }
        }
        return resolve(found, value);
      }
      const text = (value ?? "") as string;
      const named = tags.filter((t) => !t.collection && t.tag === name);
      const found =
        named.find((t) => !(t.default && t.test)) ??
        named.find((t) => t.test!.test(text)) ??
        knownTags.find((t) => !t.collection && t.tag === name);
      if (found) return resolve(found, text);
      here("TAG_RESOLVE_FAILED", `Unresolved tag: ${name}`, name !== `${Y}str`);
      return text;
    },
    key(key) {
      if (key === null) return "";
      if (typeof key !== "object") {
        const text = String(key as string | number | boolean | bigint);
        keys.set(text, key);
        return text;
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
    // The table words an unknown directive as its name and an unsupported
    // version as nothing; a directive without a name gets the latter too.
    warn(name, mark) {
      const message = name ? `Unknown directive %${name}` : `Unsupported YAML version ${version}`;
      warnings.push(report(new YAMLWarning([0, 0], "BAD_DIRECTIVE", message), mark));
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
  if ("reviver" in options) fn = options.reviver;
  const level = options.logLevel ?? "warn";
  // A custom tag may parse another document in the middle of this one.
  const outer = [warnings, source, pretty, keyWarned, excess, [...keys]] as const;
  try {
    source = src;
    pretty = options.prettyErrors !== false;
    warnings = [];
    keyWarned = false;
    keys.clear();
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
      const use = engine(options, directive ?? options.version ?? "1.2");
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
    return fn ? revive(fn, { "": value }, "", value) : value;
  } finally {
    [warnings, source, pretty, keyWarned, excess] = outer;
    keys.clear();
    for (const [key, value] of outer[5]) keys.set(key, value);
  }
}

// JSON.parse's reviver walk, extended to Maps and Sets as yaml does.
function revive(fn: Reviver, holder: unknown, key: unknown, value: any): unknown {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
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
