// Typed as @types/js-yaml has it, though `name` is null without a filename,
// and `snippet` null for empty input.
export interface Mark {
  name: string;
  buffer: string;
  position: number;
  line: number;
  column: number;
  snippet: string;
}

const format = ({ reason, mark }: YAMLException, compact?: boolean) =>
  (reason || "(unknown reason)") +
  (mark
    ? ` ${mark.name ? `in "${mark.name}" ` : ""}(${mark.line + 1}:${mark.column + 1})${!compact && mark.snippet ? `\n\n${mark.snippet}` : ""}`
    : "");

// js-yaml 4's error: `reason` is the bare message and `mark` the 0-based
// position, which `message` appends as "(line:column)" plus a source snippet.
export class YAMLException extends Error {
  override name = "YAMLException";
  declare reason: string;
  // Typed as always set, as @types/js-yaml has it, so `e.mark.line` compiles
  // in a catch. Errors from `load` always have one; `dump`'s don't.
  declare mark: Mark;

  constructor(reason?: string, mark?: Mark);
  constructor(reason: string, mark: Mark) {
    super();
    this.reason = reason;
    this.mark = mark;
    this.message = format(this);
  }

  override toString(compact?: boolean): string {
    return `${this.name}: ${format(this, compact)}`;
  }
}

// The lines around `mark`, numbered, with a caret under its column; the same
// layout js-yaml prints.
export function snippet({ buffer, position, line }: Omit<Mark, "name" | "snippet">): string | null {
  if (!buffer) return null;
  const starts = [0];
  const ends: number[] = [];
  let found = -1;
  for (const { index, 0: end } of buffer.matchAll(/\r?\n|\r|\0/g)) {
    ends.push(index);
    starts.push(index + end.length);
    if (position <= index && found < 0) found = starts.length - 2;
  }
  if (found < 0) found = starts.length - 1;
  const width = String(Math.min(line + 2, ends.length)).length;
  const half = ((75 - width) >> 1) - 1;
  let result = "";
  // Three lines before, the mark's line and its caret, two lines after.
  for (let i = Math.max(0, found - 3); i <= found || (i <= found + 2 && i < ends.length); i++) {
    const at = position - starts[found]! + starts[i]!;
    let start = starts[i]!;
    let end = ends[i]!;
    let head = "";
    let tail = "";
    if (at - start > half) {
      head = " ... ";
      start = at - half + 5;
    }
    if (end - at > half) {
      tail = " ...";
      end = at + half - 4;
    }
    result += ` ${String(line + 1 + i - found).padStart(width)} | ${head}${buffer.slice(start, end).replace(/\t/g, "→")}${tail}\n`;
    if (i === found) result += `${"-".repeat(width + 4 + at - start + head.length)}^\n`;
  }
  return result.slice(0, -1);
}
