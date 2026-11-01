import { unquote } from "./escape.ts";
import { legacy, plain } from "./mode.ts";

export interface DecodeOptions {
  /** Read `key[]` lines as arrays (the default), or else repeated keys. */
  bracketedArray?: boolean;
}

/**
 * ini writes the normalized options back onto the caller's object and reads
 * them from there. It is CommonJS, so on a primitive or a frozen object the
 * write does nothing; Reflect.set does the same where an assignment in an ES
 * module would throw.
 */
export const set = (o: unknown, key: string, value: unknown): void => {
  if ((typeof o === "object" && o) || typeof o === "function") Reflect.set(o, key, value);
};

/**
 * Splits a section name on the dots that are not escaped with a backslash.
 * ini 1.x to 4.0 swap `\\.` and U+0001 for placeholders around the split, so a
 * name holding their placeholder for U+0001 gets a U+0001 in its place.
 */
export const splitSections = (str: string): string[] =>
  legacy
    ? str
        .replace(/\x01/g, "\x02LITERAL\\1LITERAL\x02")
        .replace(/\\\./g, "\x01")
        .split(".")
        .map((part) => part.replace(/\x01/g, "\\.").replace(/\x02LITERAL\\1LITERAL\x02/g, "\x01"))
    : str.split(/(?<!\\)\./);

type Section = Record<string, any>;

/**
 * Whether a key ends in `[]`, written as ini 1.x writes it, so that a key that
 * isn't a string throws the error ini 1.x throws, which names the variable.
 */
const bracketedKey = (key: any) => key.length > 2 && key.slice(-2) === "[]";

/** An object for a section: ini 1.x makes plain ones, later versions ones with a null prototype. */
export const section = (): Section => (plain ? {} : Object.create(null));

/** Parses INI text into an object with a null prototype, as ini 7.0.0 does. */
export function decode(str: string, opt: DecodeOptions = {}): Record<string, any> {
  // ini 1.x to 4.0 take no options.
  if (!legacy) set(opt, "bracketedArray", opt.bracketedArray !== false);
  const out: Section = section();
  let p: Section = out;
  const duplicates: Record<string, any> = {};
  const lines = str.split(/[\r\n]+/g);
  const separators = /[\u2028\u2029]/.test(str);
  for (const line of lines) {
    const text = line.trimStart();
    const c = text.charCodeAt(0);
    // ini 1.x to 4.0 read a line of whitespace as the key "", set to true.
    if (text ? c === 59 || c === 35 : !legacy || !line) continue;
    if (line.charCodeAt(0) === 91) {
      const close = line.indexOf("]");
      // ini 4.1 allows whitespace after the `]`.
      if (close > 0) {
        if (legacy ? close === line.length - 1 : !line.slice(close + 1).trim()) {
          const name = unquote(line.slice(1, close)) as string;
          if (name === "__proto__") {
            // Keep reading the section, but do not attach it.
            p = section();
            continue;
          }
          // ini 1.x reuses whatever out[name] holds, inherited or not, and so
          // writes the keys of a section named `constructor` or `toString`
          // onto the built-in function. tinyini starts a new section instead.
          p = out[name] = (plain && !Object.hasOwn(out, name) ? 0 : out[name]) || section();
          continue;
        }
      }
    }

    const eq = line.indexOf("=");
    // `(.*)` in ini's line pattern stops at U+2028 and U+2029, so a line
    // that has one after its `=` does not match and is skipped.
    if (eq >= 0 && (!eq || (separators && /[\u2028\u2029]/.test(line.slice(eq))))) continue;
    // A quoted key or value can decode to any JSON value, so these lines stay
    // as ini wrote them, and throw where ini throws, in ini's order: the key,
    // the option, then the value.
    const keyRaw = unquote(eq < 0 ? line : line.slice(0, eq)) as string;
    let isArray;
    // ini reads the option again for every key, so a getter can change it.
    if (legacy || opt.bracketedArray) {
      isArray = plain ? bracketedKey(keyRaw) : keyRaw.length > 2 && keyRaw.slice(-2) === "[]";
    } else {
      duplicates[keyRaw] = (duplicates?.[keyRaw] || 0) + 1;
      isArray = duplicates[keyRaw] > 1;
    }
    const key = isArray && keyRaw.endsWith("[]") ? keyRaw.slice(0, -2) : keyRaw;
    if (key === "__proto__") continue;
    const valueRaw = eq < 0 ? true : unquote(line.slice(eq + 1));
    const value =
      valueRaw === "true"
        ? true
        : valueRaw === "false"
          ? false
          : valueRaw === "null"
            ? null
            : valueRaw;
    // After `a=1` and then `[a]`, p is the string "1", where ini's writes do nothing.
    if (typeof p !== "object") continue;
    if (isArray) {
      // ini 1.x starts a new array over any falsy value, such as "" or false.
      if (plain ? !p[key] : !Object.hasOwn(p, key)) p[key] = [];
      else if (!Array.isArray(p[key])) p[key] = [p[key]];
    }
    // A key without brackets after the same key with them still adds to the array.
    const current = p[key];
    if (Array.isArray(current)) current.push(value);
    else p[key] = value;
  }

  // {a:{y:1},"a.b":{x:2}} --> {a:{y:1,b:{x:2}}}
  const remove = [];
  for (const k of Object.keys(out)) {
    if (
      (plain && !out[k]) ||
      typeof out[k] !== "object" ||
      Array.isArray(out[k]) ||
      !k.includes(".")
    )
      continue;
    const parts = splitSections(k);
    p = out;
    const l = parts.pop()!;
    const nl = l.replace(/\\\./g, ".");
    for (const part of parts) {
      if (part === "__proto__") continue;
      if ((plain ? !p[part] : !Object.hasOwn(p, part)) || typeof p[part] !== "object")
        p[part] = section();
      p = p[part];
    }
    if (p === out && nl === l) continue;
    p[nl] = out[k];
    remove.push(k);
  }
  for (const del of remove) delete out[del];
  return out;
}
