// The `yaml` package's schemas as lists of tag objects in its own shape, so
// `customTags` can add to or rewrite them. Only what parsing and string
// quoting need is here: `tag`, `default`, `test`, `collection`, `resolve`.

export interface Tag {
  tag: string;
  /** Resolves untagged plain scalars matching `test`; "key" only for keys. */
  default?: boolean | "key";
  test?: RegExp;
  collection?: "map" | "seq";
  format?: string;
  resolve?: (value: any, onError: (message: string) => void, options: ParseFlags) => unknown;
  [extra: string]: unknown;
}

export interface ParseFlags {
  intAsBigInt?: boolean;
}

export const Y = "tag:yaml.org,2002:";
/**
 * Mapping keys that weren't strings, by the string the parser stored them
 * under, so !!set and !!omap can return the original values.
 */
export const keys = new Map<string, unknown>();
const original = (key: string) => (keys.has(key) ? keys.get(key) : key);
export const MERGE = Symbol("<<");

const tag = (
  name: string,
  test: RegExp | undefined,
  resolve: Tag["resolve"],
  extra?: Partial<Tag>,
): Tag => ({ tag: Y + name, default: true, test, resolve, ...extra });

const str = tag("str", undefined, (s) => s);
const map = tag("map", undefined, (m) => m, { collection: "map" });
const seq = tag("seq", undefined, (s) => s, { collection: "seq" });
const nul = tag("null", /^(?:~|[Nn]ull|NULL)?$/, () => null);
const nan = tag("float", /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/, (s: string) =>
  s.slice(-3).toLowerCase() === "nan" ? NaN : s[0] === "-" ? -Infinity : Infinity,
);
const float = (test: RegExp) => tag("float", test, (s: string) => parseFloat(s.replace(/_/g, "")));
const int = (test: RegExp, offset: number, radix: number) =>
  tag("int", test, (s: string, _, { intAsBigInt }) =>
    intAsBigInt ? BigInt(s) : parseInt(s.substring(offset), radix),
  );

// YAML 1.1 numbers take a sign before any base prefix, and underscores.
const int11 = (test: RegExp, offset: number, radix: number, prefix = "") =>
  tag("int", test, (s: string, _, { intAsBigInt }) => {
    const sign = s[0] === "-" || s[0] === "+" ? s[0] : "";
    const digits = s.substring(offset + sign.length).replace(/_/g, "");
    if (intAsBigInt) {
      const n = BigInt(prefix + digits);
      return sign === "-" ? -n : n;
    }
    const n = parseInt(digits, radix);
    return sign === "-" ? -1 * n : n;
  });

// With `big` every operand is a BigInt, else a number, so they never mix.
function sexagesimal(s: string, big?: boolean): any {
  const num = (n: string | number): any => (big ? BigInt(n) : Number(n));
  const sign = s[0];
  const parts = sign === "-" || sign === "+" ? s.substring(1) : s;
  const res = parts
    .replace(/_/g, "")
    .split(":")
    .reduce((res, p) => res * num(60) + num(p), num(0));
  return sign === "-" ? num(-1) * res : res;
}

const TIMESTAMP =
  /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\.[0-9]+)?)(?:[ \t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$/;

export const timestamp = tag("timestamp", TIMESTAMP, (s: string) => {
  const match = TIMESTAMP.exec(s);
  if (!match) throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
  const [, year, month, day, hour, minute, second] = match.map(Number) as number[];
  const ms = match[7] ? Number(`${match[7]}00`.substr(1, 3)) : 0;
  let date = Date.UTC(year!, month! - 1, day!, hour || 0, minute || 0, second || 0, ms);
  const tz = match[8];
  if (tz && tz !== "Z") {
    let d = sexagesimal(tz);
    if (Math.abs(d) < 30) d *= 60;
    date -= 60000 * d;
  }
  return new Date(date);
});

export const binary = tag(
  "binary",
  undefined,
  (s: string) => {
    // Outside Node there's no Buffer, whatever @types/node declares.
    const B = globalThis.Buffer as typeof Buffer | undefined;
    if (typeof B === "function") return B.from(s, "base64");
    const bytes = atob(s.replace(/[\n\r]/g, ""));
    return Uint8Array.from(bytes, (c) => c.charCodeAt(0));
  },
  { default: false },
);

export const merge = tag("merge", /^<<$/, () => MERGE, { default: "key" });

// A YAML 1.1 !!pairs sequence: every item a mapping with one entry.
function pairs(seq: unknown, onError: (message: string) => void): unknown[] {
  if (!Array.isArray(seq)) onError("Expected a sequence for this tag");
  return (seq as unknown[]).map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const size = Object.keys(item).length;
      if (size > 1) onError("Each pair must have its own sequence indicator");
      return size ? item : { "": null };
    }
    return { [String(item)]: null };
  });
}

const omap = tag(
  "omap",
  undefined,
  (seq, onError) => {
    const result = new Map<unknown, unknown>();
    for (const item of pairs(seq, onError) as Record<string, unknown>[])
      for (const key in item) {
        if (result.has(original(key)))
          onError(`Ordered maps must not include duplicate keys: ${key}`);
        result.set(original(key), item[key]);
      }
    return result;
  },
  { default: false, collection: "seq" },
);

const set = tag(
  "set",
  undefined,
  (map: Record<string, unknown>, onError) => {
    if (Object.values(map).some((v) => v !== null)) onError("Set items must all have null values");
    return new Set(Object.keys(map).map(original));
  },
  { default: false, collection: "map" },
);

/** Tags the core schema resolves when named, though they're not part of it. */
export const known: Tag[] = [
  binary,
  merge,
  omap,
  tag("pairs", undefined, pairs, { default: false, collection: "seq" }),
  set,
  timestamp,
];

const core = [
  map,
  seq,
  str,
  nul,
  tag("bool", /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/, (s: string) => s[0] === "t" || s[0] === "T"),
  int(/^0o[0-7]+$/, 2, 8),
  int(/^[-+]?[0-9]+$/, 0, 10),
  int(/^0x[0-9a-fA-F]+$/, 2, 16),
  nan,
  float(/^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/),
  float(/^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/),
];

const json = [
  map,
  seq,
  str,
  tag("null", /^null$/, () => null),
  tag("bool", /^true$|^false$/, (s) => s === "true"),
  tag("int", /^-?(?:0|[1-9][0-9]*)$/, (s: string, _, { intAsBigInt }) =>
    intAsBigInt ? BigInt(s) : parseInt(s, 10),
  ),
  float(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/),
  {
    tag: "",
    default: true,
    test: /^/,
    resolve(s: string, onError: (message: string) => void) {
      onError(`Unresolved plain scalar ${JSON.stringify(s)}`);
      return s;
    },
  } as Tag,
];

const yaml11 = [
  map,
  seq,
  str,
  nul,
  tag("bool", /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/, () => true),
  tag("bool", /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/, () => false),
  int11(/^[-+]?0b[0-1_]+$/, 2, 2, "0b"),
  int11(/^[-+]?0[0-7_]+$/, 1, 8, "0o"),
  int11(/^[-+]?[0-9][0-9_]*$/, 0, 10),
  int11(/^[-+]?0x[0-9a-fA-F_]+$/, 2, 16, "0x"),
  nan,
  float(/^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/),
  float(/^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/),
  ...known,
  tag("int", /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/, (s: string, _, { intAsBigInt }) =>
    sexagesimal(s, intAsBigInt),
  ),
  tag("float", /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/, (s: string) => sexagesimal(s)),
];
// yaml tries timestamps last.
yaml11.splice(yaml11.indexOf(timestamp), 1);
yaml11.push(timestamp);

export const schemas: Record<string, Tag[]> = {
  core,
  failsafe: [map, seq, str],
  json,
  yaml11,
  "yaml-1.1": yaml11,
};

const byName: Record<string, Tag> = {
  binary,
  bool: core[4]!,
  float: core[10]!,
  floatExp: core[9]!,
  floatNaN: nan,
  floatTime: yaml11.at(-2)!,
  int: core[6]!,
  intHex: core[7]!,
  intOct: core[5]!,
  intTime: yaml11.at(-3)!,
  map,
  merge,
  null: nul,
  omap,
  pairs: known[3]!,
  seq,
  set,
  timestamp,
};

export type CustomTags = (Tag | string)[] | ((tags: Tag[]) => (Tag | string)[]) | null;

// yaml's getTags: the named schema's tags, plus or rewritten by `custom`,
// plus the merge tag when asked for.
export function getTags(custom: CustomTags | undefined, name: string, addMerge?: boolean): Tag[] {
  let tags: (Tag | string)[] | undefined = schemas[name]?.slice();
  if (tags && !custom)
    return (addMerge && !tags.includes(merge) ? [...tags, merge] : tags) as Tag[];
  if (!tags) {
    if (!Array.isArray(custom))
      throw new Error(
        `Unknown schema "${name}"; use one of "core", "failsafe", "json", "yaml-1.1" or define customTags array`,
      );
    tags = [];
  }
  tags = Array.isArray(custom) ? tags.concat(custom) : custom!(tags as Tag[]);
  if (addMerge) tags = tags.concat(merge);
  const out: Tag[] = [];
  for (const t of tags) {
    const obj = typeof t === "string" ? byName[t] : t;
    if (!obj)
      throw new Error(
        `Unknown custom tag ${JSON.stringify(t)}; use one of ${Object.keys(byName)
          .map((k) => JSON.stringify(k))
          .join(", ")}`,
      );
    if (!out.includes(obj)) out.push(obj);
  }
  return out;
}
