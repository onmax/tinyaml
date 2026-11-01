// yamljs 0.3.0's `parse` on the shared parser. yamljs reads YAML line by line
// with regular expressions; the parser here reads the structure, and the
// engine gives scalars the values yamljs's `Inline.evaluateScalar` does,
// quirks included: `08` is 0, `1,000` is 1000, `-.inf` is Infinity, dates
// become Date objects and keys are evaluated before they become strings.
//
// Some lines yamljs takes are not YAML, such as `title: Foo: Bar`, `a: @x` or
// a Windows path in double quotes. When the parser rejects the input, those
// lines get quoted the way yamljs reads them and the parser tries again.
import { DUPLICATE_KEY } from "../core/codes.ts";
import { MESSAGES } from "../core/messages.ts";
import { MERGE_TAG, parse as parseDocs, type Engine, type Mark } from "../core/parse.ts";

export type ObjectDecoder = (tag: string, value: unknown) => unknown;

/** yamljs's parse error: a message, plus the 1-based line and its text. The message is tinyaml's. */
export class ParseException extends Error {
  declare parsedLine: number | undefined;
  declare snippet: string | undefined;
  constructor(message: string, parsedLine?: number, snippet?: string) {
    super(message);
    this.parsedLine = parsedLine;
    this.snippet = snippet;
  }

  override toString(): string {
    return `<ParseException> ${this.message}${this.parsedLine != null && this.snippet != null ? ` (line ${this.parsedLine}: '${this.snippet}')` : ""}`;
  }
}

// What the parser reports, before it becomes a ParseException.
class Problem extends Error {
  declare mark: Mark;
  declare code: number | undefined;
  constructor(reason: string, mark: Mark, code?: number) {
    super(reason);
    this.mark = mark;
    this.code = code;
  }
}

export const DATE =
  /^(\d{4})-(\d\d?)-(\d\d?)(?:(?:t|[ \t]+)(\d\d?):(\d\d):(\d\d)(?:.(\d*))?(?:[ \t]*(z|([-+])(\d\d?)(?::(\d\d))?))?)?$/i;
const THOUSANDS = /^[-+]?[\d,]+(?:\.\d+)?$/;

export const isNumeric = (input: unknown): boolean =>
  typeof input === "number" ||
  (typeof input === "string" && !isNaN(input as never) && /\S/.test(input));

const octal = (text: string) => parseInt(text.replace(/[^0-7]/g, ""), 8);

// yamljs's Utils.stringToDate: UTC unless a zone is given, milliseconds only.
function date(text: string): Date | null {
  const m = DATE.exec(text);
  if (!m) return null;
  const n = m.map((part) => +(part ?? 0));
  const at = Date.UTC(
    n[1]!,
    n[2]! - 1,
    n[3],
    n[4],
    n[5],
    n[6],
    +(m[7] ?? "").slice(0, 3).padEnd(3, "0"),
  );
  return new Date(at - (m[9] ? (m[9] === "-" ? -1 : 1) * (n[10]! * 60 + n[11]!) * 60000 : 0));
}

/** A plain scalar's value, the way yamljs's `Inline.evaluateScalar` reads it. */
export function evaluate(scalar: string): unknown {
  scalar = scalar.trim();
  // Text that starts with any other character is a string.
  if (/^[^-+.,~\dnNtTfFI]/.test(scalar)) return scalar;
  const lower = scalar.toLowerCase();
  if (lower === "null" || lower === "" || lower === "~") return null;
  if (lower === "true" || lower === "false") return lower === "true";
  if (lower === ".inf" || lower === "-.inf") return Infinity;
  if (lower === ".nan") return NaN;
  const first = scalar[0];
  const rest = scalar.slice(1);
  if (first === "0") {
    if (rest[0] === "x") return parseInt(rest.slice(1).replace(/[^a-f\d]/gi, ""), 16);
    if (/^\d+$/.test(scalar)) return octal(scalar);
    return isNumeric(scalar) ? parseFloat(scalar) : scalar;
  }
  if (first === "-" && /^\d+$/.test(rest)) return rest[0] === "0" ? -octal(rest) : -+rest;
  return (
    date(scalar) ??
    (isNumeric(scalar)
      ? parseFloat(scalar)
      : THOUSANDS.test(scalar)
        ? parseFloat(scalar.replace(",", ""))
        : scalar)
  );
}

function engine(exceptionOnInvalidType: unknown, objectDecoder: ObjectDecoder | null): Engine {
  const self: Engine = {
    tag: "",
    messages: MESSAGES,
    lenient: true,
    maxDepth: Infinity,
    maxMergeKeys: -1,
    implicit(text) {
      if (text === "<<") self.tag = MERGE_TAG;
      return text === null ? null : evaluate(text);
    },
    explicit(value, tag) {
      const name = tag.replace(/^tag:yaml\.org,2002:/, "!!");
      const text = typeof value === "string" ? value : "";
      switch (name.toLowerCase()) {
        case "!str":
        case "!!str":
          return value ?? "";
        case "!!int":
          return parseInt(evaluate(text) as string);
        case "!!float":
          return parseFloat(evaluate(text) as string);
        case "!!bool": {
          const bool = evaluate(text);
          return typeof bool === "string" ? !/^(?:no|0|false|)$/i.test(bool) : !!bool;
        }
        case "!!timestamp":
          return date(text);
      }
      if (objectDecoder) return objectDecoder(name, value === "" ? null : value);
      if (exceptionOnInvalidType)
        throw new ParseException(
          "Custom object support when parsing a YAML file has been disabled.",
        );
      return null;
    },
    key: String,
    error: (reason, mark, code) => new Problem(reason, mark, code),
  };
  return self;
}

/**
 * Parses YAML into a JavaScript value, or null for an empty document. Typed
 * `any`, as in @types/yamljs.
 */
export function parse(
  input: string,
  exceptionOnInvalidType: unknown = false,
  objectDecoder: ObjectDecoder | null = null,
): any {
  // yamljs drops a %YAML line and every comment line at column 0, even in
  // block scalars, then every line that starts with `---`, which merges the
  // documents.
  let text = input.replace(/\r\n?/g, "\n").replace(/^(?:%YAML[: ][\d.]+|#).*\n/gm, "");
  if (/^---.*\n/m.test(text)) text = text.replace(/^---.*\n/gm, "").replace(/^\.\.\.\s*$/gm, "");
  const use = engine(exceptionOnInvalidType, objectDecoder);
  let first: Problem | undefined;
  let quoted = false;
  for (;;) {
    try {
      return parseDocs(text, use)[0] ?? null;
    } catch (error) {
      if (!(error instanceof Problem)) throw error;
      if (error.code === DUPLICATE_KEY) {
        // yamljs keeps the first value of a key.
        const next = dropEntry(text, error.mark.position);
        if (next === undefined) use.json = true;
        else text = next;
      } else if (!quoted) {
        first = error;
        quoted = true;
        text = requote(text);
      } else {
        const { message, mark } = first ?? error;
        throw new ParseException(message, mark.line + 1, mark.buffer.split("\n")[mark.line]);
      }
    }
  }
}

const indentOf = (line: string) => line.length - line.trimStart().length;

// Removes the block mapping entry whose key starts at `position`, with the
// lines nested under it. Undefined when the key is inside a flow mapping.
function dropEntry(text: string, position: number): string | undefined {
  const start = text.lastIndexOf("\n", position - 1) + 1;
  const column = position - start;
  if (text.slice(start, position).trim()) return undefined;
  const lines = text.slice(start).split("\n");
  let end = 1;
  for (; end < lines.length; end++) {
    const line = lines[end]!;
    const indent = indentOf(line);
    const body = line.trim();
    if (
      body &&
      body[0] !== "#" &&
      indent <= column &&
      !(indent === column && /^-(?: |$)/.test(body))
    )
      break;
  }
  return text.slice(0, start) + lines.slice(end).join("\n");
}

// yamljs's named escapes, each letter followed by its character.
export const NAMED = "0\0a\x07b\bt\tn\nv\vf\fr\re\x1BN\x85_\xA0L\u2028P\u2029";

// A double-quoted string's content as yamljs reads it: unknown escapes, such
// as those in `"C:\Users"`, stay as they are.
const unescape = (text: string) =>
  text.replace(
    /\\([0abt\tnvfre "/\\N_LP]|x[\da-fA-F]{2}|u[\da-fA-F]{4}|U[\da-fA-F]{8})/g,
    (_, e: string) => {
      // `\<tab>`, `\ `, `\"`, `\/` and `\\` stand for the character itself.
      const i = NAMED.indexOf(e);
      if (e.length < 2) return i % 2 ? e : NAMED[i + 1]!;
      const code = parseInt(e.slice(1), 16);
      return code > 0x10ffff ? "\uFFFD" : String.fromCodePoint(code);
    },
  );

// A key or value yamljs takes as it is, but YAML doesn't, as a JSON string.
function requoteScalar(text: string, value: boolean): string {
  const quoted = /^"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/.exec(text);
  if (quoted) return JSON.stringify(unescape(quoted[1]!));
  if (text[0] === '"') return text;
  const plain = uncomment(text);
  return /^[@`%]/.test(plain) || (value && /^[\]}|>]|^[-?:](?:[ \t]|$)|:[ \t]/.test(plain))
    ? JSON.stringify(plain)
    : text;
}

// yamljs ends a plain scalar at the first " #".
const uncomment = (text: string) => text.split(" #")[0]!.trimEnd();

// Quotes keys and values the way yamljs reads them, where YAML would reject
// them. Block scalars and lines continuing a value are left alone, except that
// a plain value that gets quoted takes its continuation lines along.
function requote(text: string): string {
  // yamljs ignores the spaces of a blank line.
  const lines = text.replace(/^[ \t]+$/gm, "").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const [, head, body] = /^((?: *-(?= |$))* *)(.*)$/.exec(line)!;
    if (!body || body[0] === "#") {
      // yamljs drops a comment line indented less than the block it's in.
      const next = lines.slice(i + 1).find((next) => next.trim());
      if (!body || head!.includes("-") || !next || indentOf(next) <= head!.length) out.push(line);
      continue;
    }
    const entry = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^ '"[{].*?) *:(?:[ \t]+|$)/.exec(body);
    const key = entry && !entry[1]!.includes(" #") ? entry[1]! : undefined;
    const [, anchor = "", value = ""] = /^(&\S+(?: +|$))?(.*?)\s*$/.exec(
      key === undefined ? body : body.slice(entry![0].length),
    )!;
    // Lines indented deeper than this belong to the value.
    const indent = key === undefined ? head!.trimEnd().length - 1 : head!.length;
    // Like yamljs, skip comment lines, even less indented ones, and stop
    // after the last line that continues the value.
    let end = i + 1;
    if (value && value[0] !== "#")
      for (let j = end; j < lines.length; j++) {
        const next = lines[j]!;
        if (/^\s*(?:#|$)/.test(next)) continue;
        if (indentOf(next) <= indent) break;
        end = j + 1;
      }
    const rest = lines.slice(i + 1, end);
    let fixed = value;
    if (!/^(?:[#'[{*!]|[|>][-+\d]*(?: +#.*)?$)/.test(fixed)) {
      fixed = requoteScalar(fixed, true);
      if (
        value[0] !== '"' &&
        rest.length &&
        (fixed !== value || rest.some((next) => /:[ \t]|^ *#/.test(next)))
      ) {
        // Fold the continuation lines into the quoted value: a line break
        // joins lines with a space, and each further one is kept.
        const folded = [uncomment(value), ...rest.map((next) => next.trim())]
          .filter((part) => part[0] !== "#")
          .join("\n")
          .replace(/\n(\n*)/g, (_, more: string) => more || " ");
        fixed = JSON.stringify(uncomment(folded));
      }
    }
    out.push(head! + (key === undefined ? "" : `${requoteScalar(key, false)}: `) + anchor + fixed);
    // Keep the value's lines, but not comment lines indented less than its
    // content, which yamljs skips even in a block scalar.
    const margin = indentOf(rest.find((next) => /^ *[^ #]/.test(next)) ?? "");
    if (fixed === value)
      for (const next of rest) if (!/^ *#/.test(next) || indentOf(next) >= margin) out.push(next);
    i = end - 1;
  }
  return out.join("\n");
}
