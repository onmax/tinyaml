import { unquote, ws } from "./escape.ts";

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

/** Splits a section name on the dots that are not escaped with a backslash. */
export const splitSections = (str: string): string[] => str.split(/(?<!\\)\./);

type Section = Record<string, any>;

/** Parses INI text into an object with a null prototype, as ini 7.0.0 does. */
export function decode(str: string, opt: DecodeOptions = {}): Record<string, any> {
  set(opt, "bracketedArray", opt.bracketedArray !== false);
  const bracketed = opt.bracketedArray;
  const out: Section = Object.create(null);
  let p: Section = out;
  const duplicates: Record<string, any> = {};
  const lines = str.split(/[\r\n]+/g);
  const separators = /[\u2028\u2029]/.test(str);
  for (const line of lines) {
    const end = line.length;
    let i = 0;
    let c = line.charCodeAt(0);
    while (ws(c) && ++i < end) c = line.charCodeAt(i);
    if (i >= end || c === 59 || c === 35) continue;
    if (line.charCodeAt(0) === 91) {
      const close = line.indexOf("]");
      if (close > 0) {
        i = close + 1;
        while (i < end && ws(line.charCodeAt(i))) i++;
        if (i === end) {
          const section = unquote(line.slice(1, close)) as string;
          if (section === "__proto__") {
            // Keep reading the section, but do not attach it.
            p = Object.create(null);
            continue;
          }
          p = out[section] = out[section] || Object.create(null);
          continue;
        }
      }
    }

    let valueRaw: unknown = true;
    const eq = line.indexOf("=");
    if (eq >= 0) {
      // `(.*)` in ini's line pattern stops at U+2028 and U+2029, so a line
      // that has one after its `=` does not match and is skipped.
      if (!eq || (separators && /[\u2028\u2029]/.test(line.slice(eq)))) continue;
      valueRaw = unquote(line.slice(eq + 1));
    }
    // A quoted key or value can decode to any JSON value, so these lines stay
    // as ini wrote them, and throw where ini throws.
    const keyRaw = unquote(eq < 0 ? line : line.slice(0, eq)) as string;
    let isArray;
    if (bracketed) {
      isArray = keyRaw.length > 2 && keyRaw.slice(-2) === "[]";
    } else {
      duplicates[keyRaw] = (duplicates?.[keyRaw] || 0) + 1;
      isArray = duplicates[keyRaw] > 1;
    }
    const key = isArray && keyRaw.endsWith("[]") ? keyRaw.slice(0, -2) : keyRaw;
    if (key === "__proto__") continue;
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
      if (!Object.hasOwn(p, key)) p[key] = [];
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
    if (typeof out[k] !== "object" || Array.isArray(out[k]) || !k.includes(".")) continue;
    const parts = splitSections(k);
    p = out;
    const l = parts.pop()!;
    const nl = l.replace(/\\\./g, ".");
    for (const part of parts) {
      if (part === "__proto__") continue;
      if (!Object.hasOwn(p, part) || typeof p[part] !== "object") p[part] = Object.create(null);
      p = p[part];
    }
    if (p === out && nl === l) continue;
    p[nl] = out[k];
    remove.push(k);
  }
  for (const del of remove) delete out[del];
  return out;
}
