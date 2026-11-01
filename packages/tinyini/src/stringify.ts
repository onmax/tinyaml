import { safe } from "./escape.ts";
import { set, splitSections } from "./parse.ts";

export interface EncodeOptions {
  /** Pad keys so the `=` signs of a section line up. Implies `whitespace`. */
  align?: boolean;
  /** A section to put the top-level keys in, and to prefix every other section with. */
  section?: string;
  /** Sort the keys and sections of each level. */
  sort?: boolean;
  /** Write ` = ` instead of `=`. */
  whitespace?: boolean;
  /** Put a blank line after each section header. */
  newline?: boolean;
  /** `"win32"` for CRLF line endings; the default is the current `process.platform`. */
  platform?: string;
  /** Write array items as `key[]=value` (the default), or else as `key=value`. */
  bracketedArray?: boolean;
}

type Options = Record<string, any>;

/**
 * ini normalizes the options onto the object it was given, and then reads
 * them back from it, so on a frozen object or a primitive the raw values win.
 */
function normalize(o: Options, assign: (o: unknown, key: string, value: unknown) => void) {
  for (const key of ["align", "newline", "sort"]) assign(o, key, o[key] === true);
  assign(o, "whitespace", o.whitespace === true || o.align === true);
  assign(o, "platform", o.platform || (typeof process !== "undefined" && process.platform));
  assign(o, "bracketedArray", o.bracketedArray !== false);
}

/** Writes an object as INI text, as ini 7.0.0 does. */
export function encode(obj: any, opt: EncodeOptions | string = {}): string {
  if (typeof opt === "string") opt = { section: opt };
  normalize(opt as Options, set);
  return write(obj, opt as Options);
}

function write(obj: any, o: Options): string {
  const eol = o.platform === "win32" ? "\r\n" : "\n";
  const separator = o.whitespace ? " = " : "=";
  const children = [];
  const keys = o.sort ? Object.keys(obj).sort() : Object.keys(obj);

  // Pad to the longest written key among the values on this level, arrays
  // counted with `[]` whether or not they are written with it.
  let padToChars = 0;
  if (o.align)
    for (const k of keys) {
      const val = obj[k];
      if (val === null || typeof val !== "object" || Array.isArray(val)) {
        const length = safe(Array.isArray(val) ? `${k}[]` : k).length;
        if (length > padToChars) padToChars = length;
      }
    }

  let out = "";
  const arraySuffix = o.bracketedArray ? "[]" : "";
  for (const k of keys) {
    const val = obj[k];
    if (val && Array.isArray(val)) {
      const key = safe(`${k}${arraySuffix}`).padEnd(padToChars, " ") + separator;
      for (const item of val) out += key + safe(item) + eol;
    } else if (val && typeof val === "object") {
      children.push(k);
    } else {
      out += safe(k).padEnd(padToChars, " ") + separator + safe(val) + eol;
    }
  }

  if (o.section && out.length)
    out = "[" + safe(o.section) + "]" + (o.newline ? eol + eol : eol) + out;

  for (const k of children) {
    // Escape the dots in the key that are not escaped already.
    const section = (o.section ? o.section + "." : "") + splitSections(k).join("\\.");
    // ini calls itself with { ...opt, section }, a fresh object it can write to.
    const options: Options = { ...o, section };
    normalize(options, assign);
    const child = write(obj[k], options);
    if (out.length && child.length) out += eol;
    out += child;
  }
  return out;
}

const assign = (o: any, key: string, value: unknown) => {
  o[key] = value;
};
