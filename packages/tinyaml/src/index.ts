// tinyaml's own API: YAML 1.2 core schema values, merge keys and custom
// tags, with nothing kept only for compatibility. For drop-in replacements
// of other YAML libraries, see the `tinyaml/*` subpaths.
import { MESSAGES } from "./core/messages.ts";
import {
  fail,
  MERGE_TAG,
  parse as parseDocs,
  YAML_TAG as Y,
  type Engine,
  type Kind,
} from "./core/parse.ts";

export { stringify, type StringifyOptions } from "./stringify.ts";

export interface ParseOptions {
  /**
   * Values for tags, by name:
   * `{ "!env": (value) => (typeof value === "string" ? process.env[value] : undefined) }`.
   * The function gets the node's string, array or object, or null when
   * empty. Other unknown tags keep the node's value.
   */
  tags?: Record<string, (value: unknown) => unknown>;
  /** Merge `<<` keys into their mapping. Default true. */
  merge?: boolean;
  /** Allow duplicate keys; the last one wins. Default false. */
  duplicateKeys?: boolean;
  /** Deepest nesting allowed. Default 100. */
  maxDepth?: number;
}

/** A syntax error, or a value the options don't allow. `line` and `column` start at 1. */
export class YAMLError extends Error {
  override name = "YAMLError";
  declare line: number;
  declare column: number;
  constructor(reason: string, line: number, column: number) {
    super(`${reason} (${line}:${column})`);
    this.line = line;
    this.column = column;
  }
}

const NULL = /^(?:~|null|Null|NULL)$/;
const BOOL = /^(?:true|True|TRUE|false|False|FALSE)$/;
const INT = /^(?:[-+]?\d+|0o[0-7]+|0x[\da-fA-F]+)$/;
const FLOAT =
  /^(?:[-+]?(?:\.\d+|\d+(?:\.\d*)?)(?:[eE][-+]?\d+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;

// A local tag other than `!`, or a URI, which starts with a scheme.
const VERBATIM = /^(?:!|[a-z][\w+.-]*:)(?:%[\da-f]{2}|[\w#;/?:@&=+$,.!~*'()[\]-])+$/i;

// Number reads the rest, `0o` and `0x` included, and `.nan` as NaN.
const float = (text: string) => +text.replace(/\.inf/i, "Infinity");

function engine(options: ParseOptions): Engine {
  const tags = options.tags ?? {};
  const self: Engine = {
    tag: "",
    messages: MESSAGES,
    spec: true,
    printable: true,
    json: options.duplicateKeys,
    maxDepth: options.maxDepth,
    overflow: true,
    verbatim(tag) {
      if (!VERBATIM.test(tag)) fail(`bad verbatim tag !<${tag}>`);
    },
    implicit(text) {
      if (text === null) return null;
      // Past `@`, only `~` and words of five letters at most can be typed.
      if (text.charCodeAt(0) > 64) {
        if (text.length < 6) {
          if (NULL.test(text)) return null;
          if (BOOL.test(text)) return text.length < 5;
        }
      } else if (INT.test(text)) return +text;
      else if (FLOAT.test(text)) return float(text);
      else if (text === "<<" && options.merge !== false) self.tag = MERGE_TAG;
      return text;
    },
    explicit(value, tag, kind: Kind | "fallback") {
      if (Object.hasOwn(tags, tag)) return tags[tag]!(value);
      const text = (value ?? "") as string;
      const name = tag.startsWith(Y) ? tag.slice(18) : "";
      const scalar = kind !== "sequence" && kind !== "mapping";
      if (name === "str" && scalar) return text;
      if (name === "seq" || name === "map")
        if (kind === "fallback" || kind === (name === "seq" ? "sequence" : "mapping"))
          return value ?? (name === "seq" ? [] : {});
      if (scalar) {
        if (name === "null" && (!text || NULL.test(text))) return null;
        if (name === "bool" && BOOL.test(text)) return text.length < 5;
        if (name === "int" && INT.test(text)) return +text;
        if (name === "float" && (FLOAT.test(text) || INT.test(text))) return float(text);
        if (name === "merge" && text === "<<") {
          self.tag = MERGE_TAG;
          return text;
        }
      }
      // Other tags keep the node's own value, as the `yaml` package does.
      if (!/^(?:str|seq|map|null|bool|int|float|merge)$/.test(name)) return value;
      return fail(`cannot resolve a node with !<${tag}> explicit tag`);
    },
    key: (key) =>
      key === null
        ? ""
        : typeof key === "object"
          ? fail("mapping keys must be strings, numbers, booleans or null")
          : String(key as string | number | boolean),
    error: (reason, mark) => new YAMLError(reason, mark.line + 1, mark.column + 1),
  };
  return self;
}

/** Every document in `text`. */
export function parseAll(text: string, options: ParseOptions = {}): unknown[] {
  return parseDocs(text, engine(options));
}

/** The one document in `text`; undefined when there is none. Throws when there are several. */
export function parse(text: string, options: ParseOptions = {}): unknown {
  const docs = parseAll(text, options);
  if (docs.length > 1) throw new YAMLError("expected a single document, but found more", 1, 1);
  return docs[0];
}
