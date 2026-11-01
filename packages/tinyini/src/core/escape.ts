/**
 * Writes a key, value, or section name so that `unsafe` reads it back: as
 * JSON when it is not a string, has `=` or a line break, starts with `[`, is
 * wrapped in quotes, or has whitespace at either end, and otherwise with `;`
 * and `#` escaped.
 */
export function safe(val: string): string {
  if (typeof val !== "string") return JSON.stringify(val);
  const a = val[0];
  if (
    /[=\r\n]/.test(val) ||
    a === "[" ||
    val !== val.trim() ||
    (val.length > 1 && (a === '"' || a === "'") && val.at(-1) === a)
  )
    return JSON.stringify(val);
  return /[;#]/.test(val) ? val.replace(/[;#]/g, "\\$&") : val;
}

/**
 * Reads a key, value, or section name: trims it, then either JSON-decodes it
 * when it is wrapped in quotes (a single-quoted value is decoded without its
 * quotes, so `'1'` is the number 1), or cuts it at the first `;` or `#` that
 * is not escaped with a backslash.
 */
export function unsafe(val: string): string {
  return unquote((val || "").trim()) as string;
}

// JSON.parse throws on most single-quoted values, like 'something', and
// throwing is slow, so only try it when the text could be JSON.
const json = /^[\t\n\r ]*[-\d"[{tfn]/;

/** `unsafe` for a string; the result is anything JSON can hold. */
export function unquote(val: string): unknown {
  val = val.trim();
  const a = val[0];
  if ((a === '"' || a === "'") && val.at(-1) === a) {
    if (a === "'") {
      val = val.slice(1, -1);
      if (!json.test(val)) return val;
    }
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  // An unescaped `;` or `#` ends the text. A backslash before `\`, `;`, or
  // `#` escapes it; before anything else it stays, with the character after it.
  const i = val.search(/[;#\\]/);
  if (i < 0) return val;
  return (
    val[i] === "\\"
      ? val.replace(/\\([^])|[;#][^]*/g, (all, c?: string) =>
          c === undefined ? "" : c === "\\" || c === ";" || c === "#" ? c : all,
        )
      : val.slice(0, i)
  ).trim();
}
