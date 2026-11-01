// js-yaml 4's `load` and `loadAll` on the shared parser: values resolve
// through a Schema's types, and errors carry js-yaml's mark and snippet.
import { fail, original, parse, sanitize, type Engine, type Mark } from "../core/parse.ts";
import { snippet, YAMLException } from "./error.ts";
import { MESSAGES } from "./messages.ts";
import type { Schema } from "./schema.ts";
import { builtin, DEFAULT_SCHEMA, kindOf, maybeTyped } from "./types.ts";

export interface LoadOptions {
  /** Shown in error messages. */
  filename?: string | undefined;
  /** Types to resolve with. Defaults to `DEFAULT_SCHEMA`. */
  schema?: Schema | undefined;
  /** Allows duplicate mapping keys, the last one wins, as JSON.parse does. */
  json?: boolean | undefined;
  /** Called with a YAMLException for problems that don't stop loading. */
  onWarning?: ((this: null, warning: YAMLException) => void) | undefined;
  maxDepth?: number | undefined;
  /** Caps the keys copied by `<<` merges in one call; -1 for no limit. */
  maxTotalMergeKeys?: number | undefined;
}

// A plain object's own toString could run code, so it never gets called.
const plainObject = (value: unknown) => (kindOf(value) === "Object" ? "[object Object]" : value);

function engine(input: string, options: LoadOptions): Engine {
  const schema = options.schema ?? DEFAULT_SCHEMA;
  const { compiledImplicit, compiledTypeMap } = schema;
  const builtinsOnly = builtin(compiledImplicit);
  const exception = (reason: string, mark: Mark) => {
    const buffer = sanitize(input);
    mark = { ...mark, buffer, position: original(buffer, mark) };
    return new YAMLException(reason, {
      name: options.filename ?? null,
      ...mark,
      snippet: snippet(mark),
    });
  };
  const self: Engine = {
    tag: "",
    messages: MESSAGES,
    lenient: true,
    json: options.json,
    maxDepth: options.maxDepth,
    maxMergeKeys: options.maxTotalMergeKeys,
    implicit(text) {
      // js-yaml 4 leaves an empty node null without asking the types.
      if (text !== null && (!builtinsOnly || maybeTyped(text)))
        for (const type of compiledImplicit)
          if (type.resolve(text)) {
            self.tag = type.tag;
            return type.construct(text);
          }
      return text;
    },
    explicit(value, tag, kind) {
      const type =
        compiledTypeMap[kind][tag] ??
        compiledTypeMap.multi[kind].find((t) => tag.startsWith(t.tag));
      if (!type) fail(`unknown tag !<${tag}>`);
      if (value !== null && type.kind !== kind)
        fail(
          `unacceptable node kind for !<${tag}> tag; it should be "${type.kind}", not "${kind}"`,
        );
      if (!type.resolve(value, tag)) fail(`cannot resolve a node with !<${tag}> explicit tag`);
      self.tag = tag;
      return type.construct(value, tag);
    },
    // Arrays join their items, objects become "[object Object]".
    key(key) {
      if (Array.isArray(key)) {
        if (key.some(Array.isArray)) fail("nested arrays are not supported inside keys");
        key = key.map(plainObject);
      }
      return String(plainObject(key));
    },
    error: exception,
    warn:
      options.onWarning &&
      ((reason, mark) => options.onWarning!.call(null, exception(reason, mark))),
  };
  return self;
}

export function loadAll(input: string, options?: LoadOptions | null): unknown[];
export function loadAll(
  input: string,
  iterator: null | undefined,
  options?: LoadOptions,
): unknown[];
export function loadAll(
  input: string,
  iterator: (doc: unknown) => void,
  options?: LoadOptions,
): void;
export function loadAll(
  input: string,
  iterator?: LoadOptions | ((doc: unknown) => void) | null,
  options?: LoadOptions,
): unknown[] | void {
  if (typeof iterator !== "function") options = iterator ?? options;
  input = String(input);
  const docs = parse(input, engine(input, options ?? {}));
  if (typeof iterator !== "function") return docs;
  for (const doc of docs) iterator(doc);
}

/** Parses a single YAML document. Empty input gives `undefined`. */
export function load(input: string, options?: LoadOptions | null): unknown {
  input = String(input);
  const docs = parse(input, engine(input, options ?? {}));
  if (docs.length > 1)
    throw new YAMLException("expected a single document in the stream, but found more");
  return docs[0];
}
