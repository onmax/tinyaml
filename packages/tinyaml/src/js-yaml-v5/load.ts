// js-yaml 5's `load` and `loadAll` on the shared parser, which follows the
// spec as js-yaml 5 does. Values resolve through a Schema's tag definitions.
//
// The parser builds sequences as arrays and mappings as objects with string
// keys. That is what the default seqTag and mapTag make, so for them it's
// the final value. Other tags get the built node replayed into their carrier.
// When a schema has such mapping tags, keys are stored under placeholder
// names, so carriers like Set and Map still see the original keys in order.
import * as E from "../core/codes.ts";
import { fail, original, parse, type Engine, type Mark } from "../core/parse.ts";
import { exceptionAt, YAMLException } from "./error.ts";
import { MESSAGES } from "./messages.ts";
import { CORE_SCHEMA, type Schema } from "./schema.ts";
import {
  isPlainObject,
  legacyMapTag,
  mapTag,
  NOT_RESOLVED,
  seqTag,
  Y,
  type MappingTagDefinition,
  type SequenceTagDefinition,
} from "./tags.ts";

export interface LoadOptions {
  /** Shown in error messages. */
  filename?: string;
  /** Deepest nesting allowed. Default 100. */
  maxDepth?: number;
  /** Tags to resolve with. Default CORE_SCHEMA. */
  schema?: Schema;
  /** Allow duplicate mapping keys; the last one wins, as in JSON.parse. */
  json?: boolean;
  /** Cap on keys copied by `<<` merges in one call; -1 for none. Default 10000. */
  maxTotalMergeKeys?: number;
  /** Cap on aliases per document; -1 (default) for none. */
  maxAliases?: number;
}

// Errors js-yaml 5 raises while building values, after the whole stream has
// parsed. The parser raises these itself; the engine marks its own.
const BUILD_ERRORS = [E.DUPLICATE_KEY, E.ALIAS_UNKNOWN, E.MERGE_SOURCE, E.MERGE_SIZE, E.MERGE_KEYS];
// Placeholder names for keys that aren't strings; YAML can only spell them
// with escapes.
const PLACEHOLDER = "\0\uDBFF\uDFFF";

type Collection = SequenceTagDefinition<any, any> | MappingTagDefinition<any, any>;
// Errors in building values, which a syntax error anywhere comes before.
const BUILT = new WeakSet<object>();

// js-yaml 5 drops a byte order mark only before a document's directives or
// `---`, or right after a `...`.
const BOM =
  /(?<=\n)\uFEFF(?=(?:[ \t]*(?:#.*)?\n)*(?:%|---(?:[ \t\n]|$)))|(?<=(?:^|\n)\.\.\.(?:[ \t].*)?\n(?:[ \t]*(?:#.*)?\n)*)\uFEFF/g;

const isObjectMap = (tag: unknown): tag is MappingTagDefinition =>
  tag === mapTag || tag === legacyMapTag;

const NON_PRINTABLE =
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

// Where the last spelling of `tag` before `end` starts, or `end`. The parser
// reports a tag's problems where its node ends. Only `!<>` spells the empty tag.
function tagStart(input: string, end: number, tag: string): number {
  let found = -1;
  const spellings = [`!<${tag}>`, tag.startsWith(Y) ? `!!${tag.slice(18)}` : tag || "!<>"];
  for (const spelling of spellings)
    for (let i = input.lastIndexOf(spelling, end); i >= 0; i = input.lastIndexOf(spelling, i - 1))
      if (/^$|[\s,[\]{}]/.test(input[i + spelling.length] ?? "")) {
        found = Math.max(found, i);
        break;
      }
  return found < 0 ? end : found;
}

// The error for a problem the parser found at `at`.
function parseError(
  input: string,
  at: Mark,
  reason: string,
  code?: number,
  filename?: string,
  tag?: string,
): YAMLException {
  // js-yaml 5 points at the first line that's less indented than the
  // leading empty lines.
  if (code === E.LEADING_EMPTY)
    at = {
      ...at,
      position: at.position + 1 + /^ */.exec(at.buffer.slice(at.position + 1))![0].length,
    };
  let position = original(input, at);
  if (tag !== undefined) position = tagStart(input, position, tag);
  // The parser checks a plain or block scalar once it ends; js-yaml 5 points
  // at the first bad character, here the first on the last bad one's line.
  if (code === E.NON_PRINTABLE) {
    const bad = [...input.slice(0, position).matchAll(NON_PRINTABLE)].map((m) => m.index);
    const last = bad.at(-1) ?? position;
    const line = input.lastIndexOf("\n", last) + 1;
    position = bad.find((i) => i >= line) ?? position;
  }
  const error = exceptionAt(input, position, reason, filename);
  if (code !== undefined && BUILD_ERRORS.includes(code)) BUILT.add(error);
  return error;
}

function engine(input: string, options: LoadOptions) {
  const schema = options.schema ?? CORE_SCHEMA;
  const defaultSeq = schema.lookupSequenceTag(`${Y}seq`);
  const defaultMap = schema.lookupMappingTag(`${Y}map`);
  // Carriers need the original keys when a mapping can get a tag other than
  // the object maps, which store keys as strings anyway.
  const typed =
    !isObjectMap(defaultMap) ||
    (input.includes("!") &&
      schema.tags.some((tag) => tag.nodeKind === "mapping" && !isObjectMap(tag)));
  // Keys behind placeholder names.
  const keys = new Map<string, unknown>();
  // With `json`, every pair has a name of its own, so a carrier sees each
  // repeat. So does each pair a merge copies: these are their names, and
  // each stands for the mapping it comes from, which the tag reads the value
  // from as it builds the mapping, as js-yaml 5 does at the `<<`.
  const merged = new Set<string>();
  // Values tags built, as opposed to arrays and objects straight from the parser.
  const built = new WeakSet<object>();
  // The tag that built each mapping, which a merge reads it with.
  const mappings = new WeakMap<object, MappingTagDefinition>();
  const replaced = new Map<object, unknown>();
  const aliasNames = new WeakMap<object, string>();
  let building = false;
  // The tag of the node being rejected, which js-yaml 5 points at.
  let tagged: string | undefined;
  let parsing = true;
  // Aliases in the current document, and whether the parser reports them.
  let aliasCount = 0;
  let aliasDocument: unknown;
  let countsAliases = false;
  // Whether `convert` must run over the documents.
  let walk = defaultSeq !== seqTag || !isObjectMap(defaultMap);

  // After parsing, the position is unknown. js-yaml 5 reports problems with
  // a collection key at 0.
  function reject(reason: string, tag?: string, at?: number): never {
    building = true;
    tagged = tag;
    if (parsing && at === undefined) return fail(reason);
    const error = exceptionAt(input, at ?? 0, reason, options.filename);
    BUILT.add(error);
    throw error;
  }

  const mark = (value: unknown) => {
    if (typeof value === "object" && value !== null) built.add(value);
    return value;
  };

  const decode = (name: string) => (keys.has(name) ? keys.get(name) : name);

  // Builds a node the parser made into the value `tag` makes of it. Its
  // children are converted first, as js-yaml 5 builds bottom-up.
  function build(tag: Collection, name: string, raw: object): unknown {
    if (!tag.carrierIsResult) {
      const seen = new Set<unknown>();
      const recursive = (value: unknown): boolean => {
        if (value === raw) return true;
        if (!value || typeof value !== "object" || seen.has(value)) return false;
        seen.add(value);
        return Object.values(value).some(recursive);
      };
      if (Object.values(raw).some(recursive))
        reject(
          `recursive alias "${aliasNames.get(raw)}" is not supported for tag ${name} because it uses finalize()`,
          name,
        );
    }
    const carrier = tag.create(name);
    // A recursive alias inside the node points at the raw node.
    if (tag.carrierIsResult) replaced.set(raw, carrier);
    if (tag.nodeKind === "sequence")
      (raw as unknown[]).forEach((item, index) => {
        const error = tag.addItem(carrier, convert(item), index);
        if (error) reject(error);
      });
    else {
      // Keys a merge added, which a later pair may override once.
      const overridable = new Set<unknown>();
      for (const name of Object.keys(raw)) {
        const key = convert(decode(name));
        let value = convert((raw as Record<string, unknown>)[name]);
        if (merged.has(name)) {
          if (tag.has(carrier, key)) continue;
          value = (mappings.get(value as object) ?? defaultMap!).get(value, key);
        } else if (!options.json && tag.has(carrier, key) && !overridable.has(key))
          reject("duplicated mapping key");
        const error = tag.addPair(carrier, key, value);
        if (error) reject(error);
        if (merged.has(name)) overridable.add(key);
        else overridable.delete(key);
      }
    }
    let result: unknown = carrier;
    if (!tag.carrierIsResult)
      try {
        result = tag.finalize(carrier);
      } catch (error) {
        if (error instanceof YAMLException) throw error;
        reject(error instanceof Error ? error.message : String(error), name);
      }
    replaced.set(raw, result);
    if (tag.nodeKind === "mapping" && typeof result === "object" && result !== null)
      mappings.set(result, tag);
    return mark(result);
  }

  // The final value for something the parser returned: raw arrays and
  // objects become their default tag's value, and the children of built
  // values are converted in place.
  function convert(value: unknown): unknown {
    if (!walk || typeof value !== "object" || value === null) return value;
    if (replaced.has(value)) return replaced.get(value);
    if (!built.has(value)) {
      if (Array.isArray(value)) {
        if (!defaultSeq) reject(`unknown sequence tag !<${Y}seq>`);
        return build(defaultSeq, `${Y}seq`, value);
      }
      if (isPlainObject(value)) {
        if (!defaultMap) reject(`unknown mapping tag !<${Y}map>`);
        if (
          isObjectMap(defaultMap) &&
          !Object.keys(value).some((key) => key.startsWith(PLACEHOLDER))
        )
          built.add(value);
        else return build(defaultMap, `${Y}map`, value);
      } else return value;
    }
    replaced.set(value, value);
    if (Array.isArray(value)) value.forEach((item, i) => (value[i] = convert(item)));
    else if (value instanceof Map || value instanceof Set) {
      const entries = [...value.entries()];
      value.clear();
      for (const [k, v] of entries)
        if (value instanceof Map) value.set(convert(k), convert(v));
        else value.add(convert(k));
    } else if (isPlainObject(value))
      for (const key of Object.keys(value))
        (value as Record<string, unknown>)[key] = convert((value as Record<string, unknown>)[key]);
    return value;
  }

  const self: Engine & {
    convert: typeof convert;
    done: () => void;
    countsAliases: () => boolean;
  } = {
    tag: "",
    messages: MESSAGES,
    bom: BOM,
    json: options.json,
    maxDepth: options.maxDepth,
    maxMergeKeys: options.maxTotalMergeKeys,
    implicit(text) {
      const { value, tag } = schema.resolveImplicitScalarTag(text ?? "");
      self.tag = tag.tagName;
      return mark(value);
    },
    explicit(value, name, kind) {
      if (kind === "scalar" || kind === "fallback") {
        const source = (value ?? "") as string;
        const tag = schema.lookupScalarTag(name);
        if (tag) {
          const result = tag.resolve(source, true, name);
          if (result === NOT_RESOLVED)
            reject(`cannot resolve a node with !<${name}> explicit tag`, name);
          self.tag = tag.tagName;
          return mark(result);
        }
        const collection = schema.lookupMappingTag(name) ?? schema.lookupSequenceTag(name);
        if (!collection) reject(`unknown scalar tag !<${name}>`, name);
        if (source) reject(`cannot resolve a node with !<${name}> explicit tag`, name);
        return build(collection, name, []);
      }
      const tag =
        kind === "sequence" ? schema.lookupSequenceTag(name) : schema.lookupMappingTag(name);
      if (!tag) reject(`unknown ${kind} tag !<${name}>`, name);
      // The parser already made what these make, unless keys are typed.
      if (!walk && (tag === seqTag || tag === defaultMap)) return value;
      return build(tag, name, value as object);
    },
    key(key) {
      if (typed) {
        walk = true;
        // Equal scalars share a name, so the parser finds repeats and merges.
        const scalar = key as string | number | boolean | null;
        const name =
          (typeof key === "object" && key !== null) || options.json
            ? `${PLACEHOLDER}${keys.size}`
            : `${PLACEHOLDER}${scalar === null ? "null" : typeof scalar}:${String(scalar)}`;
        keys.set(name, key);
        return name;
      }
      // The name the object map stores the key under, or its error.
      const carrier = {};
      const error = (defaultMap as MappingTagDefinition).addPair(carrier, key, null);
      if (error) reject(error, undefined, Array.isArray(key) || isPlainObject(key) ? 0 : undefined);
      return Object.keys(carrier)[0]!;
    },
    error(reason, at, code) {
      const error = parseError(input, at, reason, code, options.filename, tagged);
      if (building) BUILT.add(error);
      building = false;
      tagged = undefined;
      return error;
    },
    // Then the parser keeps their order too.
    allKeys: typed,
    // Each document has its own anchors.
    alias(name, anchors) {
      const target = anchors.get(name);
      if (typeof target === "object" && target !== null) aliasNames.set(target, name);
      countsAliases = true;
      if (anchors !== aliasDocument) aliasCount = 0;
      aliasDocument = anchors;
      const max = options.maxAliases ?? -1;
      if (max !== -1 && ++aliasCount > max) reject(`aliases exceeded maxAliases (${max})`);
    },
    // js-yaml 5 merges any mapping, through its tag, and nothing else. The
    // parser rejects what isn't an object, and arrays.
    merge(source) {
      let sourceKeys: Iterable<unknown>;
      if (built.has(source as object)) {
        const tag = mappings.get(source as object);
        if (!tag) return;
        sourceKeys = tag.keys(source);
        if (!typed)
          return Object.fromEntries(
            [...sourceKeys].map((key) => [self.key(key), tag.get(source, key)]),
          );
      } else if (typed && isPlainObject(source)) {
        // The keys the default tag will build it with.
        const names = Object.keys(source as object).map(decode);
        if (isObjectMap(defaultMap)) {
          const carrier = defaultMap.create("");
          for (const key of names) defaultMap.addPair(carrier, key, null);
          sourceKeys = defaultMap.keys(carrier);
        } else sourceKeys = new Set(names);
      } else return source;
      const pairs: Record<string, unknown> = {};
      for (const key of sourceKeys) {
        const name = `${PLACEHOLDER}${keys.size}`;
        keys.set(name, key);
        merged.add(name);
        pairs[name] = source;
      }
      return pairs;
    },
    mapping: (value) => mappings.has(value),
    convert,
    done() {
      parsing = false;
    },
    countsAliases: () => countsAliases,
  };
  return self;
}

// Builds nothing: every scalar becomes a fresh object, so a node reached
// twice in the result was reached through an alias.
function probe(input: string, options: LoadOptions, keyNodes: Map<string, unknown>): Engine {
  return {
    tag: "",
    messages: MESSAGES,
    bom: BOM,
    json: true,
    maxDepth: options.maxDepth,
    maxMergeKeys: -1,
    implicit: () => ({}),
    explicit: (value, _tag, kind) => (kind === "sequence" || kind === "mapping" ? value : {}),
    key(key) {
      const name = String(keyNodes.size);
      keyNodes.set(name, key);
      return name;
    },
    error: (reason, at, code) => parseError(input, at, reason, code, options.filename),
  };
}

function aliases(doc: unknown, keyNodes: Map<string, unknown>): number {
  const seen = new Set<object>();
  let count = 0;
  const visit = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    if (seen.has(node)) {
      count++;
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) node.forEach(visit);
    else
      for (const name of Object.keys(node)) {
        visit(keyNodes.get(name));
        visit((node as Record<string, unknown>)[name]);
      }
  };
  visit(doc);
  return count;
}

function loadDocuments(input: string, options?: LoadOptions): unknown[] {
  // js-yaml 5 spreads the options over its defaults, so null works too.
  options ??= {};
  const source = String(input);
  const max = options.maxAliases ?? -1;
  // A pass that builds nothing tells syntax errors, which js-yaml 5 reports
  // first, and counts aliases when the parser doesn't.
  const syntax = (count: boolean): void => {
    const keyNodes = new Map<string, unknown>();
    try {
      const docs = parse(source, probe(source, options, keyNodes));
      if (count && docs.some((doc) => aliases(doc, keyNodes) > max))
        // Where isn't known.
        throw exceptionAt(source, 0, `aliases exceeded maxAliases (${max})`, options.filename);
    } catch (error) {
      if (!BUILT.has(error as object)) throw error;
    }
  };
  const use = engine(source, options);
  let docs;
  try {
    docs = parse(source, use);
  } catch (error) {
    // js-yaml 5 parses the whole stream before building any value, so a
    // syntax error anywhere wins over a value error.
    if (BUILT.has(error as object)) syntax(false);
    throw error;
  }
  if (max >= 0 && !use.countsAliases()) syntax(true);
  use.done();
  return docs.map(use.convert);
}

export function loadAll(input: string, options?: LoadOptions): unknown[];
export function loadAll(input: string, iterator: null, options?: LoadOptions): unknown[];
export function loadAll(
  input: string,
  iterator: (document: unknown) => void,
  options?: LoadOptions,
): void;
export function loadAll(
  input: string,
  iterator?: ((document: unknown) => void) | LoadOptions | null,
  options?: LoadOptions,
): unknown[] | void {
  if (typeof iterator !== "function" && iterator !== null && typeof iterator === "object")
    options = iterator;
  const documents = loadDocuments(input, options);
  if (typeof iterator !== "function") return documents;
  for (const document of documents) iterator(document);
}

/** Parses one YAML document. Throws on empty input or more than one document. */
export function load(input: string, options?: LoadOptions): unknown {
  const documents = loadDocuments(input, options);
  if (documents.length === 0)
    throw new YAMLException("expected a document, but the input is empty");
  if (documents.length === 1) return documents[0];
  throw new YAMLException("expected a single document in the stream, but found more");
}
