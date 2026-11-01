import { snippet, type Mark } from "../js-yaml/error.ts";

export type { Mark };

// js-yaml 5's error: `reason` is the bare message and `mark` the 0-based
// position, which `message` appends as "(line:column)" plus a source snippet.
export class YAMLException extends Error {
  declare reason: string;
  declare mark: Mark | undefined;

  constructor(reason: string, mark?: Mark) {
    super();
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = this.format();
  }

  private format(compact?: boolean): string {
    const mark = this.mark;
    if (!mark) return this.reason;
    const where = `${mark.name ? `in "${mark.name}" ` : ""}(${mark.line + 1}:${mark.column + 1})`;
    return `${this.reason} ${where}${!compact && mark.snippet ? `\n\n${mark.snippet}` : ""}`;
  }

  override toString(compact?: boolean): string {
    return `${this.name}: ${this.format(compact)}`;
  }

  /** Throws a YAMLException pointing at `position` in `source`. */
  static throwAt(source: string, position: number, message: string, filename?: string): never {
    throw exceptionAt(source, position, message, filename);
  }
}

/** A YAMLException pointing at `position` in `source`. */
export function exceptionAt(
  source: string,
  position: number,
  message: string,
  filename = "",
): YAMLException {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < position; i++) {
    const ch = source[i];
    if (ch === "\n" || ch === "\r") {
      line++;
      if (ch === "\r" && source[i + 1] === "\n") i++;
      lineStart = i + 1;
    }
  }
  const mark: Mark = {
    name: filename,
    buffer: source,
    position,
    line,
    column: position - lineStart,
    snippet: null,
  };
  mark.snippet = snippet(mark);
  return new YAMLException(message, mark);
}
