// The `yaml` package's error classes. `pos` holds offsets into the source;
// `linePos` and the message's "at line L, column C:" plus source excerpt are
// added unless `prettyErrors` is false.

export type ErrorCode =
  | "ALIAS_PROPS"
  | "BAD_ALIAS"
  | "BAD_DIRECTIVE"
  | "BAD_DQ_ESCAPE"
  | "BAD_INDENT"
  | "BAD_PROP_ORDER"
  | "BAD_SCALAR_START"
  | "BLOCK_AS_IMPLICIT_KEY"
  | "BLOCK_IN_FLOW"
  | "DUPLICATE_KEY"
  | "IMPOSSIBLE"
  | "KEY_OVER_1024_CHARS"
  | "MISSING_CHAR"
  | "MULTILINE_IMPLICIT_KEY"
  | "MULTIPLE_ANCHORS"
  | "MULTIPLE_DOCS"
  | "MULTIPLE_TAGS"
  | "NON_STRING_KEY"
  | "RESOURCE_EXHAUSTION"
  | "TAB_AS_INDENT"
  | "TAG_RESOLVE_FAILED"
  | "UNEXPECTED_TOKEN"
  | "BAD_COLLECTION_TYPE";

export interface LinePos {
  line: number;
  col: number;
}

export class YAMLError extends Error {
  declare name: "YAMLParseError" | "YAMLWarning";
  declare code: ErrorCode;
  declare pos: [number, number];
  declare linePos?: [LinePos] | [LinePos, LinePos];

  constructor(name: YAMLError["name"], pos: [number, number], code: ErrorCode, message: string) {
    super();
    this.name = name;
    this.code = code;
    this.message = message;
    this.pos = pos;
  }
}

export class YAMLParseError extends YAMLError {
  constructor(pos: [number, number], code: ErrorCode, message: string) {
    super("YAMLParseError", pos, code, message);
  }
}

export class YAMLWarning extends YAMLError {
  constructor(pos: [number, number], code: ErrorCode, message: string) {
    super("YAMLWarning", pos, code, message);
  }
}

// yaml's prettifyError: 1-based line and column of both ends of `pos`, and
// the offending line (with the one before, when the error is at its start)
// with carets under the span.
export function prettify(src: string, error: YAMLError): void {
  const starts = [0];
  for (let i = src.indexOf("\n"); i >= 0; i = src.indexOf("\n", i + 1)) starts.push(i + 1);
  const at = (offset: number): LinePos => {
    let line = 0;
    while (line < starts.length - 1 && starts[line + 1]! <= offset) line++;
    return { line: line + 1, col: offset - starts[line]! + 1 };
  };
  const [start, end] = (error.linePos = [at(error.pos[0]), at(error.pos[1])]);
  const { line, col } = start;
  error.message += ` at line ${line}, column ${col}`;
  let ci = col - 1;
  let text = src.substring(starts[line - 1]!, starts[line]).replace(/[\n\r]+$/, "");
  if (ci >= 60 && text.length > 80) {
    const trim = Math.min(ci - 39, text.length - 79);
    text = `…${text.substring(trim)}`;
    ci -= trim - 1;
  }
  if (text.length > 80) text = `${text.substring(0, 79)}…`;
  if (line > 1 && /^ *$/.test(text.substring(0, ci))) {
    let prev = src.substring(starts[line - 2]!, starts[line - 1]);
    if (prev.length > 80) prev = `${prev.substring(0, 79)}…\n`;
    text = prev + text;
  }
  if (/[^ ]/.test(text)) {
    const count =
      end.line === line && end.col > col ? Math.max(1, Math.min(end.col - col, 80 - ci)) : 1;
    error.message += `:\n\n${text}\n${" ".repeat(ci)}${"^".repeat(count)}\n`;
  }
}
