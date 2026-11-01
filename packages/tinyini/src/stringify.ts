// tinyini's own stringifier: what parse reads back as the same value, in ini's
// layout. See scripts/root-spec.ts for the rules.

export interface StringifyOptions {
  /** Write ` = ` instead of `=`. */
  whitespace?: boolean;
  /** Pad the keys of each section so the `=` signs line up. Implies `whitespace`. */
  align?: boolean;
  /** Sort the keys and sections on each level. */
  sort?: boolean;
  /** Put a blank line after each section header. */
  newline?: boolean;
  /** The line ending, `"\n"` unless given. */
  eol?: string;
}

// What makes a key, a value, or a section name need quotes to read back as
// itself: whitespace at either end, a line break, or a character that means
// something there.
const KEY = /^$|^[\s[;#"]|\s$|[=\r\n]/;
const VALUE = /^[\s"']|\s$|[\r\n;#\\]|^(?:true|false|null)$/;
const NAME = /^[\s"]|\s$|[\r\n]/;

const own = (v: any): unknown =>
  typeof v === "object" && v && typeof v.toJSON === "function" ? v.toJSON() : v;
const skipped = (v: unknown) => v === undefined || typeof v === "function" || typeof v === "symbol";
const text = (s: string, special: RegExp) => (special.test(s) ? JSON.stringify(s) : s);
const scalar = (v: unknown) => (typeof v === "string" ? text(v, VALUE) : String(v));

/**
 * Writes an object as INI text: its values first, then each object in it as
 * a section. Functions, symbols and `undefined` are left out, or written as
 * `null` in arrays; `toJSON` is called, so a Date is written as an ISO
 * string. Objects inside arrays throw.
 */
export function stringify(value: object, options: StringifyOptions = {}): string {
  const eol = options.eol ?? "\n";
  const separator = options.whitespace || options.align ? " = " : "=";
  const write = (o: Record<string, unknown>, path: string): string => {
    const keys = Object.keys(o);
    if (options.sort) keys.sort();
    const lines: string[] = [];
    const children: [string, any][] = [];
    for (const k of keys) {
      const v = own(o[k]);
      // parse drops __proto__ keys, so they aren't written.
      if (skipped(v) || k === "__proto__") continue;
      if (Array.isArray(v))
        for (let item of v) {
          item = own(item);
          if (item && typeof item === "object")
            throw new TypeError("tinyini can't write an object inside an array");
          lines.push(text(k, KEY) + "[]", scalar(skipped(item) ? null : item));
        }
      else if (v && typeof v === "object") children.push([k, v]);
      else lines.push(text(k, k.length > 2 && k.endsWith("[]") ? /^/ : KEY), scalar(v));
    }
    let width = 0;
    if (options.align)
      for (let i = 0; i < lines.length; i += 2) width = Math.max(width, lines[i]!.length);
    let out = "";
    for (let i = 0; i < lines.length; i += 2)
      out += lines[i]!.padEnd(width) + separator + lines[i + 1] + eol;
    if (path && (out || !children.length))
      out = `[${text(path.slice(1), NAME)}]${eol}${options.newline ? eol : ""}${out}`;
    for (const [k, v] of children) {
      const child = write(v, `${path}.${k.replace(/[\\.]/g, "\\$&")}`);
      if (out && child) out += eol;
      out += child;
    }
    return out;
  };
  return write(value as Record<string, unknown>, "");
}
