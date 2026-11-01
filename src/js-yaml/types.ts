// js-yaml 4's built-in types and schemas. Resolvers get the scalar text, or
// null for an empty node, and must accept exactly what js-yaml accepts.
import { Schema, Type, type Kind, type TypeOptions } from "./schema.ts";

export const Y = "tag:yaml.org,2002:";
// "Object", "Array", "String"...: what Object.prototype.toString reports.
export const kindOf = (value: unknown): string =>
  Object.prototype.toString.call(value).slice(8, -1);
const isNegativeZero = (n: number) => n === 0 && 1 / n === -Infinity;
const type = (name: string, kind: Kind, options?: Omit<TypeOptions, "kind">) =>
  new Type(Y + name, { kind, ...options });
const orEmpty = (empty: () => unknown) => (data: unknown) => data ?? empty();

// js-yaml's lowercase, uppercase and camelcase spellings of a word.
const CASES = ["lowercase", "uppercase", "camelcase"];
const spell = (word: string, style?: string): string | undefined =>
  [
    word,
    word.toUpperCase(),
    word === ".nan" ? ".NaN" : word.replace(/[a-z]/, (c) => c.toUpperCase()),
  ][CASES.indexOf(style!)];
const cased = (word: (data: any) => string) =>
  Object.fromEntries(CASES.map((style) => [style, (data: any) => spell(word(data), style)!]));

const str = type("str", "scalar", { construct: orEmpty(() => "") });
const seq = type("seq", "sequence", { construct: orEmpty(() => []) });
const map = type("map", "mapping", { construct: orEmpty(() => ({})) });

const nul = type("null", "scalar", {
  // Strict equality like js-yaml, so boxed strings don't match.
  resolve: (data) => data === null || ["~", "null", "Null", "NULL"].includes(data),
  construct: () => null,
  predicate: (data) => data === null,
  represent: { canonical: () => "~", ...cased(() => "null"), empty: () => "" },
  defaultStyle: "lowercase",
});

const bool = type("bool", "scalar", {
  resolve: (data) => ["true", "True", "TRUE", "false", "False", "FALSE"].includes(data),
  construct: (data) => data === "true" || data === "True" || data === "TRUE",
  predicate: (data) => kindOf(data) === "Boolean",
  // A boxed false is truthy, and js-yaml writes it as true.
  represent: cased((data) => (data ? "true" : "false")),
  defaultStyle: "lowercase",
});

// Number() reads the 0b, 0o and 0x prefixes. js-yaml gives 0, not -0, for "-0".
function parseInteger(data: string): number {
  const value = /^[-+]/.test(data) ? data.slice(1) : data;
  return value === "0" ? 0 : (data[0] === "-" ? -1 : 1) * Number(value);
}

// Style, base, alias and prefix.
const RADIXES = [
  ["binary", 2, "bin", "0b"],
  ["octal", 8, "oct", "0o"],
  ["decimal", 10, "dec", ""],
  ["hexadecimal", 16, "hex", "0x"],
] as const;
const int = type("int", "scalar", {
  // A value already resolved, with no length, doesn't match, as in js-yaml.
  resolve: (data) =>
    !!data?.length &&
    /^[-+]?(?:0b[01]+|0x[\da-fA-F]+|0o[0-7]+|\d+)$/.test(data) &&
    isFinite(parseInteger(data)),
  construct: parseInteger,
  predicate: (data: any) => kindOf(data) === "Number" && data % 1 === 0 && !isNegativeZero(data),
  represent: Object.fromEntries(
    RADIXES.map(([style, base, , prefix]) => [
      style,
      (n: any) => {
        const digits = Math.abs(n).toString(base);
        // Only hex digits are uppercased; decimal keeps "1e+21".
        return (n < 0 ? "-" : "") + prefix + (base > 10 ? digits.toUpperCase() : digits);
      },
    ]),
  ),
  defaultStyle: "decimal",
  styleAliases: Object.fromEntries(RADIXES.map(([style, base, alias]) => [style, [base, alias]])),
});

const float = type("float", "scalar", {
  resolve: (data) =>
    /^(?:[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/.test(data) ||
    (/^(?:[-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)$/.test(data) &&
      isFinite(parseFloat(data))),
  construct: (data: string) => parseFloat(data.toLowerCase().replace(".inf", "Infinity")),
  predicate: (data: any) => kindOf(data) === "Number" && (data % 1 !== 0 || isNegativeZero(data)),
  represent: (data: any, style?: string) => {
    const name = isNaN(data)
      ? ".nan"
      : data === Infinity
        ? ".inf"
        : data === -Infinity
          ? "-.inf"
          : "";
    if (name && CASES.includes(style!)) return spell(name, style);
    if (isNegativeZero(data)) return "-0.0";
    const text = data.toString(10);
    return /^[-+]?\d+e/.test(text) ? text.replace("e", ".e") : text;
  },
  defaultStyle: "lowercase",
});

const DATE =
  /^(\d{4})-(\d\d?)-(\d\d?)(?:(?:[Tt]|[ \t]+)(\d\d?):(\d\d):(\d\d)(?:\.(\d*))?(?:[ \t]*(Z|([-+])(\d\d?)(?::(\d\d))?))?)?$/;
const timestamp = type("timestamp", "scalar", {
  // A date alone needs two-digit month and day; a full timestamp doesn't.
  resolve: (data) => DATE.test(data) && (/:/.test(data) || /^\d{4}-\d\d-\d\d$/.test(data)),
  construct: (data: string) => {
    const [, y, mo, d, h = 0, mi = 0, s = 0, fraction = "", , sign, tzh, tzm = 0] =
      DATE.exec(data)!;
    const time = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s, +fraction.slice(0, 3).padEnd(3, "0"));
    return new Date(sign ? time - (sign === "-" ? -60000 : 60000) * (+tzh! * 60 + +tzm) : time);
  },
  instanceOf: Date,
  represent: (data: any) => data.toISOString(),
});

const merge = type("merge", "scalar", { resolve: (data) => data === "<<" || data === null });

const binary = type("binary", "scalar", {
  // Whole groups of four, counting `=` padding but not line breaks.
  resolve: (data) =>
    data !== null &&
    /^[A-Za-z\d+/=\n\r]*$/.test(data) &&
    data.replace(/[\n\r]/g, "").length % 4 === 0,
  // js-yaml drops a lone trailing character, which atob rejects, and
  // reads nothing as three zero bytes.
  construct: (data: string) => {
    const input = data.replace(/[\r\n=]/g, "") || "AAAA";
    return Uint8Array.from(atob(input.length % 4 === 1 ? input.slice(0, -1) : input), (c) =>
      c.charCodeAt(0),
    );
  },
  predicate: (data) => kindOf(data) === "Uint8Array",
  // js-yaml writes an empty array as three zero bytes.
  represent: (data: any) =>
    btoa(data.reduce((s: string, byte: number) => s + String.fromCharCode(byte), "")) || "AAAA",
});

const isPair = (pair: unknown) =>
  kindOf(pair) === "Object" && Object.keys(pair as object).length === 1;

const omap = type("omap", "sequence", {
  resolve: (data) => {
    if (data === null) return true;
    // js-yaml counts own enumerable keys with for...in.
    for (const pair of data) if (!isPair(pair)) return false;
    return new Set(data.flatMap(Object.keys)).size === data.length;
  },
  construct: orEmpty(() => []),
});

const pairs = type("pairs", "sequence", {
  resolve: (data) => data === null || data.every(isPair),
  construct: (data) =>
    (data ?? []).map((pair: Record<string, unknown>) => {
      const key = Object.keys(pair)[0]!;
      return [key, pair[key]];
    }),
});

const set = type("set", "mapping", {
  resolve: (data) => data === null || Object.values(data).every((value) => value === null),
  construct: orEmpty(() => ({})),
});

export const types = {
  binary,
  float,
  map,
  null: nul,
  pairs,
  set,
  timestamp,
  bool,
  int,
  merge,
  omap,
  seq,
  str,
};

const BUILTINS = new Set<Type>(Object.values(types));

// Whether all these types are built in, so `maybeTyped` can rule strings out.
export const builtin = (types: Type[]): boolean => types.every((type) => BUILTINS.has(type));

// Whether a built-in implicit type might match: numbers and dates, or short
// words like `null`, `True` and `<<`. Anything else is a string without
// trying each type.
export function maybeTyped(text: string): boolean {
  return !text || (text.length < 6 ? "-+.0123456789<~nNtTfF" : "-+.0123456789").includes(text[0]!);
}

export const FAILSAFE_SCHEMA = new Schema({ explicit: [str, seq, map] });
export const JSON_SCHEMA = FAILSAFE_SCHEMA.extend({ implicit: [nul, bool, int, float] });
export const CORE_SCHEMA = JSON_SCHEMA;
export const DEFAULT_SCHEMA = CORE_SCHEMA.extend({
  implicit: [timestamp, merge],
  explicit: [binary, omap, pairs, set],
});
