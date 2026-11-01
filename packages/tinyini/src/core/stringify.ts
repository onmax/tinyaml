import { safe } from "./escape.ts";
import { legacy, plain } from "./mode.ts";
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
  // ini 1.x to 4.0 take only `section` and `whitespace`.
  if (legacy) {
    opt = typeof opt === "string" ? { section: opt, whitespace: false } : opt || {};
    set(opt, "whitespace", (opt as Options).whitespace === true);
    return write(obj, opt as Options);
  }
  if (typeof opt === "string") opt = { section: opt };
  normalize(opt as Options, set);
  return write(obj, opt as Options);
}

/**
 * The line ending ini 1.x to 4.0 use. They read process.platform once, when
 * loaded; tinyini reads it on each call.
 */
const platformEol = () =>
  typeof process !== "undefined" && process.platform === "win32" ? "\r\n" : "\n";

function write(obj: any, o: Options): string {
  const eol = legacy ? platformEol() : o.platform === "win32" ? "\r\n" : "\n";
  // ini 2.0.0 and 1.x end array items with "\n" on every platform.
  const itemEol = legacy ? "\n" : eol;
  const separator = o.whitespace ? " = " : "=";
  const children = [];
  const keys = !legacy && o.sort ? Object.keys(obj).sort() : Object.keys(obj);

  // Pad to the longest written key among the values on this level, arrays
  // counted with `[]` whether or not they are written with it. Written as ini
  // writes it, so a getter is read as many times.
  let padToChars = 0;
  if (!legacy && o.align)
    padToChars = safe(
      keys
        .filter((k) => obj[k] === null || Array.isArray(obj[k]) || typeof obj[k] !== "object")
        .map((k) => (Array.isArray(obj[k]) ? `${k}[]` : k))
        .concat([""])
        .reduce((a, b) => (safe(a).length >= safe(b).length ? a : b)),
    ).length;

  let out = "";
  const arraySuffix = legacy || o.bracketedArray ? "[]" : "";
  for (const k of keys) {
    const val = obj[k];
    if (val && Array.isArray(val)) {
      const key = safe(`${k}${arraySuffix}`).padEnd(padToChars, " ") + separator;
      // ini 1.x uses forEach, which skips holes.
      if (plain) val.forEach((item) => (out += key + safe(item) + itemEol));
      else for (const item of val) out += key + safe(item) + itemEol;
    } else if (val && typeof val === "object") {
      children.push(k);
    } else {
      out += safe(k).padEnd(padToChars, " ") + separator + safe(val) + eol;
    }
  }

  if (o.section && out.length)
    out = "[" + safe(o.section) + "]" + (!legacy && o.newline ? eol + eol : eol) + out;

  for (const k of children) {
    // Escape the dots in the key that are not escaped already.
    const section = (o.section ? o.section + "." : "") + splitSections(k).join("\\.");
    // ini calls itself with { ...opt, section }, a fresh object it can write
    // to; ini 1.x to 4.0 with { section, whitespace }.
    let options: Options;
    if (legacy) options = { section, whitespace: o.whitespace === true };
    else normalize((options = { ...o, section }), assign);
    const child = write(obj[k], options);
    if (out.length && child.length) out += eol;
    out += child;
  }
  return out;
}

const assign = (o: any, key: string, value: unknown) => {
  o[key] = value;
};
