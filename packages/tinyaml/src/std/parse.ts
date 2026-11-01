// @std/yaml's `parse` and `parseAll` on the shared parser: std's types,
// js-yaml 4's leniency, and std's YamlSyntaxError with its wording.
import * as E from "../core/codes.ts";
import {
  fail,
  original,
  parse as parseDocuments,
  sanitize,
  type Engine,
  type Mark,
} from "../core/parse.ts";
import { MESSAGES } from "./messages.ts";
import { isPlainObject, maybeTyped, schemaOf } from "./types.ts";

export type SchemaType = "failsafe" | "json" | "core" | "default" | "extended";

export interface ParseOptions {
  /** Default "default". */
  schema?: SchemaType;
  /** Let a later duplicate key overwrite instead of throwing. */
  allowDuplicateKeys?: boolean;
  onWarning?(error: YamlSyntaxError): void;
}

export interface YamlPosition {
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  /** 0-based. */
  readonly offset: number;
}

export class YamlSyntaxError extends SyntaxError {
  declare readonly line: number;
  declare readonly column: number;
  declare readonly offset: number;
  declare readonly snippet?: string;

  constructor(message: string, position: YamlPosition, snippet?: string) {
    super(
      `${message} at line ${position.line}, column ${position.column}${snippet ? `:\n${snippet}` : ""}`,
    );
    this.line = position.line;
    this.column = position.column;
    this.offset = position.offset;
    this.snippet = snippet;
    this.name = "YamlSyntaxError";
  }
}

// The line around `position`, cut to about 75 characters, and a caret.
function snippet(buffer: string, position: number): string {
  let start = position;
  let end = position;
  let head = "";
  let tail = "";
  while (start > 0 && !/[\0\r\n\x85\u2028\u2029]/.test(buffer[start - 1]!))
    if (position - --start > 36.5) {
      head = " ... ";
      start += 5;
      break;
    }
  while (end < buffer.length && !/[\0\r\n\x85\u2028\u2029]/.test(buffer[end]!))
    if (++end - position > 36.5) {
      tail = " ... ";
      end -= 5;
      break;
    }
  return `    ${head}${buffer.slice(start, end)}${tail}\n${" ".repeat(4 + position - start + head.length)}^`;
}

// Problems std finds inside a node, as it does those the engine raises
// itself, which are all about values.
const IN_NODE = [E.ALIAS_UNKNOWN, E.NON_PRINTABLE, E.MERGE_SOURCE, E.YAML_VERSION, E.NON_SPECIFIC];

// The input as std reads it, with `\n` for each line break, as the parser does.
const lines = (content: string) => sanitize(content).replace(/\r\n?/g, "\n");

// A YamlSyntaxError at `offset` in the `lines` of `content`. Its offset
// points into `content` as it is.
function syntaxError(message: string, content: string, offset: number): YamlSyntaxError {
  const buffer = lines(content);
  const lineStart = buffer.lastIndexOf("\n", offset - 1) + 1;
  return new YamlSyntaxError(
    message,
    {
      line: buffer.slice(0, lineStart).split("\n").length,
      column: offset - lineStart + 1,
      offset: original(sanitize(content), { buffer, position: offset }),
    },
    snippet(buffer, offset),
  );
}

function engine(content: string, options: ParseOptions): Engine {
  const { implicit, types } = schemaOf(options.schema);
  const error = (message: string, { buffer, position }: Mark, code?: number) => {
    // The line that ends at the position, line break included: the
    // directive whose arguments are wrong, or the scalar with a bad character.
    const line = buffer.slice(buffer.lastIndexOf("\n", position - 2) + 1, position);
    const args = line.slice(0, -1).split(/[ \t]+/);
    // std reads a little further before it notices some problems, and not
    // as far past the end of input as js-yaml 4.
    if (code === E.HEX_ESCAPE) position += /^.[\da-fA-F]*/.exec(buffer.slice(position))![0].length;
    else if (code === E.CONTROL_CHAR)
      message += `: received "${/[\0-\x08\v-\x1F]/.exec(line)?.[0].charCodeAt(0)}"`;
    else if (code === E.MISSED_COMMA && position === buffer.length) message = MESSAGES[E.FLOW_END]!;
    else if (code === E.TAG_ARGS) message += `, received ${args.length - 1}`;
    else if (code === E.TAG_HANDLE)
      message = `Cannot handle tag directive: ill-formed handle (first argument) in "${args[1]}"`;
    // A node that ends the input inside a collection, unless it's empty.
    else if (
      position === buffer.length &&
      !/[\r\n]$/.test(content) &&
      (code === undefined || IN_NODE.includes(code)) &&
      /["'\]}]\n$|^(?:[ \t]|[-?:][ \t])|:[ \t]/.test(line) &&
      !/(?:^|[ \t])![^ \t\n]*\n$/.test(line)
    )
      position--;
    return syntaxError(message, content, position);
  };
  const self: Engine = {
    tag: "",
    messages: MESSAGES,
    lenient: true,
    repeats: true,
    lines: true,
    json: options.allowDuplicateKeys,
    maxDepth: Infinity,
    maxMergeKeys: -1,
    implicit(text) {
      if (text !== null && maybeTyped(text))
        for (const type of implicit)
          if (type.resolve(text)) {
            self.tag = type.tag;
            return type.construct(text);
          }
      return text;
    },
    explicit(value, tag, kind) {
      const type = types.find(
        (type) => type.tag === tag && (kind === "fallback" || type.kind === kind),
      );
      if (!type) fail(`Cannot resolve unknown tag !<${tag}>`);
      if (value !== null && type.kind !== kind)
        fail(
          `Unacceptable node kind for !<${tag}> tag: it should be "${type.kind}", not "${kind}"`,
        );
      if (!type.resolve(value)) fail(`Cannot resolve a node with !<${tag}> explicit tag`);
      self.tag = tag;
      return type.construct(value);
    },
    // Arrays join their items, objects become "[object Object]".
    key(key) {
      const plain = (value: unknown) => (isPlainObject(value) ? "[object Object]" : value);
      if (Array.isArray(key)) {
        if (key.some(Array.isArray))
          fail("Cannot store mapping pair: nested arrays are not supported inside keys");
        key = key.map(plain);
      }
      return String(plain(key));
    },
    error,
    warn:
      options.onWarning && ((reason, mark, code) => options.onWarning!(error(reason, mark, code))),
  };
  return self;
}

/** Every document in `content`. */
export function parseAll(content: string, options: ParseOptions = {}): unknown[] {
  content = String(content);
  const docs = parseDocuments(content, engine(content, options));
  // Under YAML 1.1, std warns about line breaks YAML 1.2 reads as text, at
  // the end of the input.
  let buffer;
  if (
    options.onWarning &&
    /[\x85\u2028\u2029]/.test(content) &&
    /^%YAML[ \t]+1\.0*[01](?!\d)/m.test((buffer = lines(content)))
  )
    options.onWarning(
      syntaxError("non-ASCII line breaks are interpreted as content", content, buffer.length),
    );
  // std reads a document from anything but the empty string.
  return docs.length || !content ? docs : [null];
}

/** The single document in `content`, or null when there is none. */
export function parse(content: string, options: ParseOptions = {}): unknown {
  const docs = parseAll(content, options);
  if (docs.length > 1) {
    // std stops where the second document starts.
    content = String(content);
    const buffer = lines(content);
    const start = /^(?:[ \t]*(?:[#%].*)?\n)*---(?=\s|$)/.exec(buffer)?.[0].length ?? 0;
    const end = /^(?:---|(\.\.\.))(?=\s|$)/gm;
    end.lastIndex = start;
    const m = end.exec(buffer);
    let at = m?.index ?? 0;
    if (m?.[1]) at += 3 + /^(?:[ \t]*(?:#.*)?\n)*[ \t]*/.exec(buffer.slice(at + 3))![0].length;
    throw syntaxError(
      "Found more than 1 document in the stream: expected a single document",
      content,
      at,
    );
  }
  return docs[0] ?? null;
}
