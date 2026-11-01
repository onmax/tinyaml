// The root API's rules, written as plainly as possible, with no care for
// speed or size: the oracle scripts/root-fuzz.ts checks src/parse.ts and
// src/stringify.ts against. Where the README describes the root, this file
// is the rule it describes.

type Section = Record<string, unknown>;
const obj = (): Section => Object.create(null);
const isSection = (v: unknown): v is Section =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A JSON string, or undefined when `text` isn't one. */
function jsonString(text: string): string | undefined {
  if (text.length < 2 || text[0] !== '"' || text.at(-1) !== '"') return undefined;
  try {
    const value = JSON.parse(text);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Splits a section name on its unescaped dots: `\.` is a dot, `\\` a backslash. */
function splitPath(name: string): string[] {
  const parts: string[] = [];
  let part = "";
  for (let i = 0; i < name.length; i++) {
    const c = name[i]!;
    if (c === "\\" && (name[i + 1] === "." || name[i + 1] === "\\")) part += name[++i];
    else if (c === ".") {
      parts.push(part);
      part = "";
    } else part += c;
  }
  parts.push(part);
  return parts;
}

/** An unquoted value: cut at the first unescaped `;` or `#`, then trimmed. */
function plainValue(text: string): string | boolean | null {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\" && i + 1 < text.length && ";#\\".includes(text[i + 1]!)) out += text[++i];
    else if (c === ";" || c === "#") break;
    else out += c;
  }
  out = out.trim();
  return out === "true" ? true : out === "false" ? false : out === "null" ? null : out;
}

function value(text: string): string | boolean | null {
  text = text.trim();
  // Text in double quotes that isn't a JSON string stays as written.
  if (text.length > 1 && text[0] === '"' && text.at(-1) === '"') return jsonString(text) ?? text;
  if (text.length > 1 && text[0] === "'" && text.at(-1) === "'") return text.slice(1, -1);
  return plainValue(text);
}

/** The JSON string a line starts with, and where it ends, if it starts with one. */
function quotedKey(line: string): [string, number] | undefined {
  if (line[0] !== '"') return undefined;
  for (let i = 1; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === '"') {
      const key = jsonString(line.slice(0, i + 1));
      return key === undefined ? undefined : [key, i + 1];
    }
  }
  return undefined;
}

export function parse(text: string): Section {
  const out = obj();
  let section = out;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line || line[0] === ";" || line[0] === "#") continue;
    if (line[0] === "[" && line.at(-1) === "]") {
      const name = line.slice(1, -1).trim();
      const path = splitPath(jsonString(name) ?? name);
      section = out;
      if (path.includes("__proto__")) {
        section = obj();
        continue;
      }
      for (const part of path) {
        if (!isSection(section[part])) section[part] = obj();
        section = section[part] as Section;
      }
      continue;
    }
    let key: string;
    let array = false;
    let rest: string;
    const quoted = quotedKey(line);
    const after = quoted && line.slice(quoted[1]).trimStart();
    if (quoted && after !== undefined && /^(\[\])?\s*(=|$)/.test(after)) {
      key = quoted[0];
      array = after.startsWith("[]");
      rest = after.slice(array ? 2 : 0).trimStart();
    } else {
      const eq = line.indexOf("=");
      key = (eq < 0 ? line : line.slice(0, eq)).trim();
      rest = eq < 0 ? "" : line.slice(eq);
      if (key.length > 2 && key.endsWith("[]")) {
        array = true;
        key = key.slice(0, -2);
      }
      if (!key) continue;
    }
    if (key === "__proto__") continue;
    const v = rest ? value(rest.slice(1)) : true;
    const current = section[key];
    if (!array) section[key] = v;
    else if (Array.isArray(current)) current.push(v);
    // `key[]` after `key = value` keeps that value as the first item.
    else section[key] = current === undefined || isSection(current) ? [v] : [current, v];
  }
  return out;
}

export interface StringifyOptions {
  whitespace?: boolean;
  align?: boolean;
  sort?: boolean;
  newline?: boolean;
  eol?: string;
}

const trims = (s: string) => s !== s.trim();

function keyText(key: string, array: boolean): string {
  const quote =
    !key ||
    trims(key) ||
    /[=\r\n]/.test(key) ||
    '[;#"'.includes(key[0]!) ||
    (!array && key.length > 2 && key.endsWith("[]"));
  return (quote ? JSON.stringify(key) : key) + (array ? "[]" : "");
}

function scalarText(v: unknown): string {
  if (typeof v !== "string") return String(v);
  const quote =
    trims(v) ||
    /[\r\n;#\\]/.test(v) ||
    v[0] === '"' ||
    v[0] === "'" ||
    v === "true" ||
    v === "false" ||
    v === "null";
  return quote ? JSON.stringify(v) : v;
}

/** Calls toJSON where JSON.stringify does, on objects, functions and BigInts, with the same key. */
const toJSON = (v: any, key: string): unknown => {
  if (v === null || !["object", "function", "bigint"].includes(typeof v)) return v;
  const method = v.toJSON;
  return typeof method === "function" ? Reflect.apply(method, v, [key]) : v;
};
const skipped = (v: unknown) => v === undefined || typeof v === "function" || typeof v === "symbol";

function header(path: string[]): string {
  const name = path.map((p) => p.replace(/[\\.]/g, "\\$&")).join(".");
  return trims(name) || /[\r\n]/.test(name) || name[0] === '"' ? JSON.stringify(name) : name;
}

export function stringify(value: object, options: StringifyOptions = {}): string {
  const eol = options.eol ?? "\n";
  const separator = options.whitespace || options.align ? " = " : "=";
  const write = (o: Record<string, unknown>, path: string[]): string => {
    const keys = Object.keys(o);
    if (options.sort) keys.sort();
    const lines: [string, string][] = [];
    const children: [string, Record<string, unknown>][] = [];
    for (const k of keys) {
      const v = toJSON(o[k], k);
      if (skipped(v) || k === "__proto__") continue;
      if (Array.isArray(v)) {
        // Each item read after the toJSON before it, up to the length read
        // first, made a whole number: JSON's LengthOfArrayLike.
        // Unary plus, which throws on a BigInt as ToLength does, where Number() doesn't.
        const n = Math.min(Math.max(Math.trunc(+v.length) || 0, 0), Number.MAX_SAFE_INTEGER);
        for (let i = 0; i < n; i++) {
          const x = toJSON(v[i], String(i));
          if (x !== null && typeof x === "object")
            throw new TypeError("tinyini can't write an object inside an array");
          lines.push([keyText(k, true), scalarText(skipped(x) ? null : x)]);
        }
      } else if (v !== null && typeof v === "object")
        children.push([k, v as Record<string, unknown>]);
      else lines.push([keyText(k, false), scalarText(v)]);
    }
    const width = options.align ? Math.max(0, ...lines.map(([k]) => k.length)) : 0;
    let out = lines.map(([k, v]) => k.padEnd(width) + separator + v + eol).join("");
    if (path.length && (out || !children.length))
      out = `[${header(path)}]${eol}${options.newline ? eol : ""}${out}`;
    for (const [k, child] of children) {
      const text = write(child, [...path, k]);
      if (out && text) out += eol;
      out += text;
    }
    return out;
  };
  return write(toJSON(value, "") as Record<string, unknown>, []);
}
