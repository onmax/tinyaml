// @std/yaml's types and schemas. Its numbers follow js-yaml 3: `_` digit
// separators, octal as `0755`, and decimal integers that its int resolver
// never accepts, so they resolve through float. Resolvers get the scalar
// text, or null for an empty node, and accept exactly what std accepts.
import type { Kind } from "../core/parse.ts";

export interface StdType {
  tag: string;
  kind: Kind;
  resolve: (data: any) => boolean;
  construct: (data: any) => unknown;
  predicate?: (data: unknown) => boolean;
  /** Called with the style, which defaults to `defaultStyle`, else "lowercase". */
  represent?: ((data: any, style?: string) => string) | Record<string, (data: any) => string>;
  defaultStyle?: string;
}

export interface Schema {
  implicit: StdType[];
  explicit: StdType[];
  /** The implicit types, then the explicit ones. */
  types: StdType[];
}

export const Y = "tag:yaml.org,2002:";
export const isPlainObject = (value: unknown): boolean =>
  Object.prototype.toString.call(value) === "[object Object]";
const unbox = (value: any) =>
  value instanceof Number || value instanceof Boolean ? value.valueOf() : value;
const type = (
  name: string,
  kind: Kind,
  resolve: StdType["resolve"],
  construct: StdType["construct"],
  rest?: Partial<StdType>,
): StdType => ({ tag: Y + name, kind, resolve, construct, ...rest });
const any = () => true;

// What std's implicit types can match: text starting with a digit, sign or
// dot, or a short word like `null`, `True` or `<<`. Anything else is a string.
export const maybeTyped = (text: string): boolean =>
  (text.length < 6 ? "-+.0123456789<~nNtTfF" : "-+.0123456789").includes(text[0]!);

// `null`, `Null` and `NULL`, and the same for any word.
const cases = (word: string) => [word, word[0]!.toUpperCase() + word.slice(1), word.toUpperCase()];
const styles = (write: (data: any) => string) => ({
  lowercase: write,
  uppercase: (data: any) => write(data).toUpperCase(),
  camelcase: (data: any) => cases(write(data))[1]!,
});

const NULLS = cases("null");
const TRUES = cases("true");
const FALSES = cases("false");

const str = type("str", "scalar", any, (data) => data ?? "");
const seq = type("seq", "sequence", any, (data) => data ?? []);
const map = type("map", "mapping", any, (data) => data ?? {});

const nil = type(
  "null",
  "scalar",
  (data) => data === "~" || NULLS.includes(data),
  () => null,
  { predicate: (data) => data === null, represent: styles(() => "null") },
);

const bool = type(
  "bool",
  "scalar",
  (data) => TRUES.includes(data) || FALSES.includes(data),
  (data) => TRUES.includes(data),
  {
    predicate: (data) => typeof data === "boolean" || data instanceof Boolean,
    represent: styles((data) => `${unbox(data)}`),
  },
);

const radix = (prefix: string, base: number) => (n: any) => {
  const digits = Math.abs((n = unbox(n))).toString(base);
  return (n < 0 ? "-" : "") + prefix + (base === 16 ? digits.toUpperCase() : digits);
};

// The text without `_` and its sign, and the sign.
const unsigned = (data: string): [string, number] => {
  const value = data.replace(/_/g, "");
  return [value.replace(/^[-+]/, ""), value[0] === "-" ? -1 : 1];
};

// Throws a TypeError for an empty node (`!!int`), as std's does.
const INT = /^[-+]?(?:0|0b[01_]*[01]|0x[\da-fA-F_]*[\da-fA-F]|0[0-7_]*[0-7])$/;
const isInt = (data: unknown) => {
  const n = unbox(data);
  return typeof n === "number" && n % 1 === 0 && !Object.is(n, -0);
};
const int = type(
  "int",
  "scalar",
  (data) => data.length > 0 && INT.test(data),
  (data: string) => {
    const [value, sign] = unsigned(data);
    const base = value[1] === "b" ? 2 : value[1] === "x" ? 16 : 8;
    return value === "0" ? 0 : sign * parseInt(base === 2 ? value.slice(2) : value, base);
  },
  {
    predicate: isInt,
    represent: {
      binary: radix("0b", 2),
      octal: radix("0", 8),
      decimal: radix("", 10),
      hexadecimal: radix("0x", 16),
    },
    defaultStyle: "decimal",
  },
);

const FLOAT =
  /^(?:[-+]?(?:0|[1-9][\d_]*)(?:\.[\d_]*)?(?:[eE][-+]?\d+)?|\.[\d_]+(?:[eE][-+]?\d+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
// In camelcase; the other styles change the case of every letter.
const SPECIAL: Record<string, string> = { NaN: ".NaN", Infinity: ".Inf", "-Infinity": "-.Inf" };
const float = type(
  "float",
  "scalar",
  (data) => FLOAT.test(data) && !data.endsWith("_"),
  (data: string) => {
    const [value, sign] = unsigned(data.toLowerCase());
    return value === ".inf" ? sign * Infinity : value === ".nan" ? NaN : sign * parseFloat(value);
  },
  {
    predicate: (data) => typeof unbox(data) === "number" && !isInt(data),
    represent: (data, style) => {
      const n = unbox(data);
      const word = SPECIAL[n];
      const special =
        word &&
        [word.toLowerCase(), word.toUpperCase(), word][
          ["lowercase", "uppercase", "camelcase"].indexOf(style!)
        ];
      if (special) return special;
      if (Object.is(n, -0)) return "-0.0";
      const text = n.toString(10);
      return /^[-+]?\d+e/.test(text) ? text.replace("e", ".e") : text;
    },
  },
);

const TIMESTAMP =
  /^(\d{4})-(\d\d?)-(\d\d?)(?:(?:[Tt]|[ \t]+)(\d\d?):(\d\d):(\d\d)(?:\.(\d*))?(?:[ \t]*(Z|([-+])(\d\d?)(?::(\d\d))?))?)?$/;
// A date alone has two-digit months and days.
const timestamp = type(
  "timestamp",
  "scalar",
  (data) => {
    const m = TIMESTAMP.exec(data);
    return !!m && (m[4] !== undefined || data.length === 10);
  },
  (data: string) => {
    const m = TIMESTAMP.exec(data)!;
    const n = m.map((part) => +(part ?? 0));
    const offset = m[9] ? (m[9] === "-" ? -1 : 1) * (n[10]! * 60 + n[11]!) * 60000 : 0;
    const ms = +(m[7] ?? "").slice(0, 3).padEnd(3, "0");
    return new Date(Date.UTC(n[1]!, n[2]! - 1, n[3], n[4], n[5], n[6], ms) - offset);
  },
  { predicate: (data) => data instanceof Date, represent: (date) => date.toISOString() },
);

const merge = type(
  "merge",
  "scalar",
  (data) => data === "<<" || data === null,
  (data) => data,
);

// atob and btoa read and write the same base64 as std's own code, except
// that std reads "" as three zero bytes, writes no bytes as "AAAA" and
// ignores a lone last character.
const binary = type(
  "binary",
  "scalar",
  (data) =>
    data !== null &&
    /^[A-Za-z\d+/=\n\r]*$/.test(data) &&
    data.replace(/[\n\r]/g, "").length % 4 === 0,
  (data: string) => {
    const input = data.replace(/[\n\r=]/g, "");
    return input
      ? Uint8Array.from(atob(input.slice(0, input.length % 4 === 1 ? -1 : undefined)), (c) =>
          c.charCodeAt(0),
        )
      : new Uint8Array(3);
  },
  {
    predicate: (data) => data instanceof Uint8Array,
    represent: (data: Uint8Array) =>
      data.length ? btoa(data.reduce((s, byte) => s + String.fromCharCode(byte), "")) : "AAAA",
  },
);

const isPair = (pair: unknown) => isPlainObject(pair) && Object.keys(pair as object).length === 1;

// Throws a TypeError for an empty node, as std's does.
const omap = type(
  "omap",
  "sequence",
  (data: object[]) => {
    for (const pair of data) if (!isPair(pair)) return false;
    return new Set(data.flatMap(Object.keys)).size === data.length;
  },
  (data) => data,
);

const pairs = type(
  "pairs",
  "sequence",
  (data) => data === null || data.every(isPair),
  (data) => data?.flatMap(Object.entries) ?? [],
);

const set = type(
  "set",
  "mapping",
  (data) => data === null || Object.values(data).every((value) => value === null),
  (data) => data ?? {},
);

const REGEXP = /^\/([\s\S]+)\/([gismuy]*)$/;
const regexp = type(
  "js/regexp",
  "scalar",
  (data) => {
    const flags = REGEXP.exec(data)?.[2];
    return (
      !!data && (data[0] !== "/" || (flags !== undefined && new Set(flags).size === flags.length))
    );
  },
  (data: string) => {
    const m = REGEXP.exec(data);
    return new RegExp(m ? m[1]! : data, m ? m[2] : "");
  },
  { predicate: (data) => data instanceof RegExp, represent: (data) => data.toString() },
);

const undef = type("js/undefined", "scalar", any, () => undefined, {
  predicate: (data) => data === undefined,
  represent: () => "",
});

function schema(implicit: StdType[], explicit: StdType[], include?: Schema): Schema {
  implicit = implicit.concat(include?.implicit ?? []);
  explicit = explicit.concat(include?.explicit ?? []);
  return { implicit, explicit, types: implicit.concat(explicit) };
}

const FAILSAFE = schema([], [str, seq, map]);
const JSON_SCHEMA = schema([nil, bool, int, float], [], FAILSAFE);
const DEFAULT = schema([timestamp, merge], [binary, omap, pairs, set], JSON_SCHEMA);
const SCHEMAS = new Map<unknown, Schema>([
  ["failsafe", FAILSAFE],
  ["json", JSON_SCHEMA],
  ["core", JSON_SCHEMA],
  ["extended", schema([], [regexp, undef], DEFAULT)],
]);

/** The schema std names `name`; the default one for any other value. */
export const schemaOf = (name: unknown): Schema => SCHEMAS.get(name) ?? DEFAULT;
