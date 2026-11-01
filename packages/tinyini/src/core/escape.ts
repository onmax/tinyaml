/** True for the characters `\s` and `String.prototype.trim` treat as whitespace. */
export const ws = (c: number): boolean =>
  c === 32 || (c < 14 && c > 8) || (c > 159 && /\s/.test(String.fromCharCode(c)));

const quoted = (a: number, z: number) => (a === 34 && z === 34) || (a === 39 && z === 39);

/**
 * Writes a key, value, or section name so that `unsafe` reads it back: as
 * JSON when it is not a string, has `=` or a line break, starts with `[`, is
 * wrapped in quotes, or has whitespace at either end, and otherwise with `;`
 * and `#` escaped.
 */
export function safe(val: string): string {
  if (typeof val !== "string") return JSON.stringify(val);
  const n = val.length;
  if (!n) return val;
  const a = val.charCodeAt(0);
  const z = val.charCodeAt(n - 1);
  if (a === 91 || ws(a) || ws(z) || (n > 1 && quoted(a, z))) return JSON.stringify(val);
  let comment = false;
  for (let i = 0; i < n; i++) {
    const c = val.charCodeAt(i);
    if (c === 61 || c === 10 || c === 13) return JSON.stringify(val);
    if (c === 59 || c === 35) comment = true;
  }
  return comment ? val.replace(/[;#]/g, "\\$&") : val;
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
  const n = val.length;
  if (!n) return val;
  const a = val.charCodeAt(0);
  if (quoted(a, val.charCodeAt(n - 1))) {
    if (a === 39) {
      val = val.slice(1, -1);
      if (!json.test(val)) return val;
    }
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  let i = 0;
  let c = 0;
  for (; i < n; i++) if ((c = val.charCodeAt(i)) === 59 || c === 35 || c === 92) break;
  if (i === n) return val;
  if (c !== 92) return val.slice(0, i).trim();
  // A backslash before `\`, `;`, or `#` escapes it; before anything else it stays.
  let out = val.slice(0, i);
  for (; i < n; i++) {
    c = val.charCodeAt(i);
    if (c === 92) {
      if (++i === n) return (out + "\\").trim();
      const d = val.charCodeAt(i);
      out += d === 92 || d === 59 || d === 35 ? val[i] : "\\" + val[i];
    } else if (c === 59 || c === 35) break;
    else out += val[i];
  }
  return out.trim();
}
