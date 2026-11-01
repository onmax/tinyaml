// tinyini's own parser. The rules are ini's, minus what ini keeps only for
// compatibility: no options to write back, values in quotes are always
// strings, keys are taken as written, and sections nest as they are read.
// scripts/root-spec.ts states the same rules as plainly as it can, and
// scripts/root-fuzz.ts checks this file against it.

type Section = Record<string, any>;

/** The string a JSON string literal holds, or undefined if `text` isn't one. */
const json = (text: string): string | undefined => {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "string") return value;
  } catch {}
  return undefined;
};

const quoted = (text: string, quote: string) =>
  text.length > 1 && text[0] === quote && text.at(-1) === quote;

const isSection = (value: unknown): value is Section =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** A value: a JSON string in double quotes, text in single quotes, or else cut at a comment. */
function value(text: string): string | boolean | null {
  const n = text.length;
  const a = text.charCodeAt(0);
  if (n > 1 && a === text.charCodeAt(n - 1)) {
    if (a === 34) return json(text) ?? text;
    if (a === 39) return text.slice(1, -1);
  }
  let i = 0;
  let c = 0;
  while (i < n && (c = text.charCodeAt(i)) !== 59 && c !== 35 && c !== 92) i++;
  // `\\`, `\;` and `\#` are escapes; any other `;` or `#` starts a comment.
  if (i < n)
    text = (
      c === 92
        ? text.replace(/\\([;#\\])|[;#][^]*/g, (_, escaped?: string) => escaped ?? "")
        : text.slice(0, i)
    ).trimEnd();
  return text === "true" ? true : text === "false" ? false : text === "null" ? null : text;
}

/**
 * Parses INI text into an object with a null prototype, as are its sections.
 * See the README for the rules.
 */
export function parse(text: string): Record<string, any> {
  const out: Section = Object.create(null);
  let section = out;
  for (const line of text.split(/[\r\n]+/)) {
    const t = line.trim();
    const c = t.charCodeAt(0);
    if (!t || c === 59 || c === 35) continue;
    if (c === 91 && t.charCodeAt(t.length - 1) === 93) {
      let name = t.slice(1, -1).trim();
      if (quoted(name, '"')) name = json(name) ?? name;
      // Split on the dots after an even run of backslashes, then unescape `\.` and `\\`.
      const parts = name.includes("\\")
        ? name.split(/(?<=(?<!\\)(?:\\\\)*)\./).map((part) => part.replace(/\\([\\.])/g, "$1"))
        : name.split(".");
      section = out;
      // A section with __proto__ in its name is read into an object that is then dropped.
      if (parts.includes("__proto__")) section = Object.create(null);
      else
        for (const part of parts)
          section = isSection(section[part])
            ? section[part]
            : (section[part] = Object.create(null));
      continue;
    }
    // A key is a JSON string, or the text up to the first `=`.
    const match = c === 34 ? /^("(?:\\[^]|[^\\"])*")\s*(\[\])?\s*(=|$)/.exec(t) : null;
    let key = match ? json(match[1]!) : undefined;
    let array = !!match?.[2];
    let rest: string;
    if (key === undefined) {
      const eq = t.indexOf("=");
      key = eq < 0 ? t : t.slice(0, eq).trimEnd();
      rest = eq < 0 ? "" : t.slice(eq);
      array = key.length > 2 && key.endsWith("[]");
      if (array) key = key.slice(0, -2);
      if (!key) continue;
    } else rest = t.slice(match![0].length - match![3]!.length);
    if (key === "__proto__") continue;
    const v = rest ? value(rest.slice(1).trim()) : true;
    const current = section[key];
    if (!array) section[key] = v;
    else if (Array.isArray(current)) current.push(v);
    // `key[]` after `key = value` keeps that value as the first item.
    else section[key] = current === undefined || isSection(current) ? [v] : [current, v];
  }
  return out;
}
