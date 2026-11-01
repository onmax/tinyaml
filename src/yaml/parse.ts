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
  /** Reject duplicate keys. Default true. */
  uniqueKeys?: boolean;
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
// Why to throw once the document is read, from the alias count.
let excess: string | undefined;

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

// yaml's guard against alias expansion, kept as the parser goes. An anchor
// counts its node and each alias of it. An alias weighs its anchor's count
// times the anchor's weight, which is taken at the anchor's first alias:
// the most any alias in its node weighs then, or 1 with a scalar or pair in
// it. No alias may weigh more than `max`. Past it, counting stops, and the
// error comes once the document is read, after any yaml reports first.
interface Anchor {
  count: number;
  weight: number;
  // The most an alias in the node weighs, kept up to date.
  most: number;
  leaf: boolean;
  // The anchored collection the node is in.
  parent: Anchor | undefined;
  // Its collection's depth while it's open, else -1.
  depth: number;
  // The innermost anchored collections it's aliased in, which hold it.
  inside: Anchor[];
  node: unknown;
}

function aliasCounter(max: number): Engine["anchor"] {
  const anchors = new Map<string, Anchor>();
  let open: Anchor | undefined;
  const limit = (anchor: Anchor, leaf: boolean) => {
    anchor.weight ||= Math.max(+leaf, anchor.most);
    const weight = anchor.count * anchor.weight;
    if (weight > max) excess = "Excessive alias count indicates a resource exhaustion attack";
    return weight;
  };
  return max < 0
    ? undefined
    : (name, depth, value, starts) => {
        if (excess) return;
        if (starts === undefined) {
          if (!max) return void (excess = "Alias resolution is disabled");
          const anchor = anchors.get(name)!;
          anchor.count++;
          // Inside its own node, a mapping has a pair, and a sequence the
          // scalars read so far. Without, the node is weighed as it ends.
          const node = anchor.node;
          const weight = limit(
            anchor,
            anchor.depth < 0 ? anchor.leaf : !Array.isArray(node) || node.some(isScalar),
          );
          if (!weight || excess) return;
          if (open && anchor.inside.at(-1) !== open) anchor.inside.push(open);
          for (const at of anchor.inside)
            for (let a: Anchor | undefined = at; a && a.most < weight; a = a.parent)
              a.most = weight;
        } else if (!starts && open?.depth === depth + 1) {
          open.leaf = hasLeaf(value);
          open.depth = -1;
          if (open.count > 1) limit(open, open.leaf);
          open = open.parent;
        } else {
          const anchor: Anchor = {
            count: 1,
            weight: 0,
            most: 0,
            leaf: !starts,
            parent: open,
            depth: starts ? depth : -1,
            inside: [],
            node: value,
          };
          anchors.set(name, anchor);
          if (starts) open = anchor;
        }
      };
}

// Whether a node holds a scalar or a pair, looking into its sequences. A
// sequence is looked into once.
const leafy = new WeakMap<object, boolean>();
const isScalar = (value: unknown) => !value || typeof value !== "object";
function hasLeaf(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  if (!Array.isArray(value))
    return Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length > 0;
  let known = leafy.get(value);
  if (known === undefined) {
    leafy.set(value, false);
    leafy.set(value, (known = value.some(hasLeaf)));
  }
  return known;
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
  const self: Engine = {
    tag: "",
    messages: MESSAGES,
    json: options.uniqueKeys === false,
    maxDepth: Infinity,
    maxMergeKeys: -1,
    spec: true,
    anchor: aliasCounter(options.maxAliasCount ?? 100),
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
      if (excess) throw new ReferenceError(excess);
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
    if (excess) throw new ReferenceError(excess);
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
