// yamljs 0.3.0's Dumper and Inline.dump, kept operation for operation so the
// output matches byte for byte, for odd inputs too: arguments are compared
// and added as yamljs does, objects walk inherited keys with for-in, and an
// objectEncoder only sees objects the dumper writes inline itself.
import { DATE, isNumeric, NAMED } from "./parse.ts";

export type ObjectEncoder = (value: object) => unknown;

/** yamljs's dump error. yamljs never throws it; it's exported for code that checks for it. */
export class DumpException extends Error {
  declare parsedLine: number | undefined;
  declare snippet: string | undefined;
  constructor(message: string, parsedLine?: number, snippet?: string) {
    super(message);
    this.parsedLine = parsedLine;
    this.snippet = snippet;
  }

  override toString(): string {
    return `<DumpException> ${this.message}${this.parsedLine != null && this.snippet != null ? ` (line ${this.parsedLine}: '${this.snippet}')` : ""}`;
  }
}

const escape = (c: string) => {
  const i = NAMED.indexOf(c);
  const code = c.charCodeAt(0);
  return `\\${i > 0 ? NAMED[i - 1] : code < 32 ? `x${code.toString(16).padStart(2, "0")}` : c}`;
};

// Empty: falsy, "0", [] or an object without own enumerable keys.
const isEmpty = (value: any): boolean =>
  !value ||
  value === "0" ||
  (value instanceof Array && !value.length) ||
  (value instanceof Object && !Object.keys(value).length);

function inline(value: any, encoder?: ObjectEncoder | null): string {
  if (value == null) return "null";
  const type = typeof value;
  if (type === "object") {
    if (value instanceof Date) return value.toISOString();
    if (encoder != null) {
      const result = encoder(value);
      if (result != null) return result as string;
    }
    const out: string[] = [];
    if (value instanceof Array)
      for (let i = 0, n = value.length; i < n; i++) out.push(inline(value[i]));
    else {
      for (const key in value) out.push(`${inline(key)}: ${inline(value[key])}`);
      return `{${out.join(", ")}}`;
    }
    return `[${out.join(", ")}]`;
  }
  if (type === "boolean") return String(value);
  // Most strings are words: nothing below quotes them unless they read as null, a boolean or Infinity.
  if (
    type === "string" &&
    /^[a-z_][\w./]*$/i.test(value) &&
    !/^(?:null|true|false|infinity)$/i.test(value)
  )
    return value;
  if (/^\d+$/.test(value)) return type === "string" ? `'${value}'` : String(parseInt(value));
  if (isNumeric(value)) return type === "string" ? `'${value}'` : String(parseFloat(value));
  // Two-character sequences: yamljs means UTF-8 bytes but tests characters.
  if (/[\x00-\x1f]|\xc2[\x85\xa0]|\xe2\x80[\xa8\xa9]/.test(value))
    return `"${value.replace(/[\\"\x00-\x1f\x85\xa0\u2028\u2029]/g, escape)}"`;
  if (/[\s'":{}[\],&*#?]|^[-?|<>=!%@`]/.test(value)) return `'${value.replace(/'/g, "''")}'`;
  if (value === "") return '""';
  if (DATE.test(value) || /^(?:null|~|true|false)$/.test(value.toLowerCase())) return `'${value}'`;
  return value;
}

function block(
  input: any,
  level: any,
  indent: any,
  step: any,
  encoder: ObjectEncoder | null,
): string {
  let prefix = "";
  for (let i = 0; i < indent; i++) prefix += " ";
  if (level <= 0 || typeof input !== "object" || input instanceof Date || isEmpty(input))
    return prefix + inline(input, encoder);
  let output = "";
  const item = (head: string, value: any) => {
    const flat = level - 1 <= 0 || typeof value !== "object" || isEmpty(value);
    output += `${prefix + head}${flat ? " " : "\n"}${block(value, level - 1, flat ? 0 : indent + step, step, encoder)}${flat ? "\n" : ""}`;
  };
  if (input instanceof Array) for (let i = 0, n = input.length; i < n; i++) item("-", input[i]);
  else for (const key in input) item(`${inline(key, encoder)}:`, input[key]);
  return output;
}

/**
 * Dumps a value to YAML. Levels deeper than `inline` are written in flow
 * style; `indent` is the number of spaces per level.
 */
export function stringify(
  input: unknown,
  inline?: number | null,
  indent?: number | null,
  exceptionOnInvalidType?: unknown,
  objectEncoder?: ObjectEncoder | null,
): string {
  return block(input, inline ?? 2, 0, indent ?? 4, objectEncoder ?? null);
}
