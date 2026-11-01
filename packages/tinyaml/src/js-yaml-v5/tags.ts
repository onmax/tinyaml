// js-yaml 5's tag definitions: the three factories, with the same normalized
// fields, and every built-in tag. Resolvers get the scalar text and return a
// value or NOT_RESOLVED, exactly as js-yaml 5's do.

export const NOT_RESOLVED: unique symbol = Symbol("NOT_RESOLVED");
export const Y = "tag:yaml.org,2002:";

export interface ScalarTagOptions<Result> {
  implicit?: boolean;
  matchByTagPrefix?: boolean;
  /** First characters (`source.charAt(0)`) `resolve` may match; null for any. */
  implicitFirstChars?: readonly string[] | null;
  resolve: (source: string, isExplicit: boolean, tagName: string) => Result | typeof NOT_RESOLVED;
  identify: (data: any) => boolean;
  represent?: (data: any) => string;
  representTagName?: (data: any) => string;
}

export interface ScalarTagDefinition<Result = unknown> extends Required<ScalarTagOptions<Result>> {
  tagName: string;
  nodeKind: "scalar";
}

export interface SequenceTagOptions<Carrier, Result = Carrier> {
  matchByTagPrefix?: boolean;
  create: (tagName: string) => Carrier;
  /** Returns an error message to reject the item. */
  addItem: (carrier: Carrier, item: unknown, index: number) => void | string;
  finalize?: (carrier: Carrier) => Result;
  identify: (data: any) => boolean;
  represent?: (data: any) => ArrayLike<unknown>;
  representTagName?: (data: any) => string;
}

export interface SequenceTagDefinition<Carrier = unknown, Result = Carrier> extends Required<
  SequenceTagOptions<Carrier, Result>
> {
  tagName: string;
  nodeKind: "sequence";
  implicit: false;
  carrierIsResult: boolean;
}

export interface MappingTagOptions<Carrier, Result = Carrier> {
  matchByTagPrefix?: boolean;
  create: (tagName: string) => Carrier;
  /** Returns '' on success, or an error message. */
  addPair: (carrier: Carrier, key: unknown, value: unknown) => string;
  has: (carrier: Carrier, key: unknown) => boolean;
  keys: (result: Result) => Iterable<unknown>;
  get: (result: Result, key: unknown) => unknown;
  finalize?: (carrier: Carrier) => Result;
  identify: (data: any) => boolean;
  represent?: (data: any) => Map<unknown, unknown>;
  representTagName?: (data: any) => string;
}

export interface MappingTagDefinition<Carrier = unknown, Result = Carrier> extends Required<
  MappingTagOptions<Carrier, Result>
> {
  tagName: string;
  nodeKind: "mapping";
  implicit: false;
  carrierIsResult: boolean;
}

export type TagDefinition =
  | ScalarTagDefinition<any>
  | SequenceTagDefinition<any, any>
  | MappingTagDefinition<any, any>;

export function defineScalarTag<Result>(
  tagName: string,
  options: ScalarTagOptions<Result>,
): ScalarTagDefinition<Result> {
  return {
    tagName,
    nodeKind: "scalar",
    implicit: options.implicit ?? false,
    matchByTagPrefix: options.matchByTagPrefix ?? false,
    implicitFirstChars: options.implicitFirstChars ?? null,
    resolve: options.resolve,
    identify: options.identify,
    represent: options.represent ?? String,
    representTagName: options.representTagName ?? (() => tagName),
  };
}

// Shared by the sequence and mapping factories, which differ only in kind.
function collection(tagName: string, nodeKind: string, options: any): any {
  return {
    ...options,
    tagName,
    nodeKind,
    implicit: false,
    matchByTagPrefix: options.matchByTagPrefix ?? false,
    finalize: options.finalize ?? ((carrier: unknown) => carrier),
    carrierIsResult: options.finalize === undefined,
    represent: options.represent ?? ((data: unknown) => data),
    representTagName: options.representTagName ?? (() => tagName),
  };
}

export function defineSequenceTag<Carrier, Result = Carrier>(
  tagName: string,
  options: SequenceTagOptions<Carrier, Result>,
): SequenceTagDefinition<Carrier, Result> {
  return collection(tagName, "sequence", options);
}

export function defineMappingTag<Carrier, Result = Carrier>(
  tagName: string,
  options: MappingTagOptions<Carrier, Result>,
): MappingTagDefinition<Carrier, Result> {
  return collection(tagName, "mapping", options);
}

const kindOf = (data: unknown) => Object.prototype.toString.call(data);
// Each first character a resolver may match, in js-yaml 5's order. Calls
// marked pure let a bundler drop the tags nothing uses.
const chars = (list: string) => list.split("");
const DIGITS = /* @__PURE__ */ chars("0123456789");
const SIGNED = /* @__PURE__ */ chars("-+0123456789");
const MINUS = /* @__PURE__ */ chars("-0123456789");
const FLOATY = /* @__PURE__ */ chars("-+.0123456789");

export function isPlainObject(data: unknown): boolean {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
  const prototype = Object.getPrototypeOf(data);
  return prototype === null || prototype === Object.prototype;
}

export const strTag = /* @__PURE__ */ defineScalarTag(`${Y}str`, {
  resolve: (source) => source,
  identify: (data) => typeof data === "string",
});

const NULLS = ["", "~", "null", "Null", "NULL"];
const nullTag = (chars: string[], resolve: (source: string, isExplicit: boolean) => unknown) =>
  defineScalarTag(`${Y}null`, {
    implicit: true,
    implicitFirstChars: chars,
    resolve,
    identify: (data) => data === null,
    represent: () => "null",
  });
const nullCore = (source: string) => (NULLS.includes(source) ? null : NOT_RESOLVED);
export const nullCoreTag = /* @__PURE__ */ nullTag(["", "~", "n", "N"], nullCore);
export const nullJsonTag = /* @__PURE__ */ nullTag(["n"], (source, isExplicit) =>
  source === "null" || (isExplicit && source === "") ? null : NOT_RESOLVED,
);
export const nullYaml11Tag = /* @__PURE__ */ nullTag(["", "~", "n", "N"], nullCore);

const boolTag = (chars: string[], truthy: string[], falsy: string[]) =>
  defineScalarTag(`${Y}bool`, {
    implicit: true,
    implicitFirstChars: chars,
    resolve: (source) =>
      truthy.includes(source) ? true : falsy.includes(source) ? false : NOT_RESOLVED,
    identify: (data) => kindOf(data) === "[object Boolean]",
    represent: (data) => (data ? "true" : "false"),
  });
export const boolCoreTag = /* @__PURE__ */ boolTag(
  ["t", "T", "f", "F"],
  ["true", "True", "TRUE"],
  ["false", "False", "FALSE"],
);
export const boolJsonTag = /* @__PURE__ */ boolTag(["t", "f"], ["true"], ["false"]);
export const boolYaml11Tag = /* @__PURE__ */ boolTag(
  ["y", "Y", "n", "N", "t", "T", "f", "F", "o", "O"],
  ["true", "True", "TRUE", "y", "Y", "yes", "Yes", "YES", "on", "On", "ON"],
  ["false", "False", "FALSE", "n", "N", "no", "No", "NO", "off", "Off", "OFF"],
);

// Integers are numbers with no fraction, not negative zero, and not in
// exponent form; every other number is a float.
const isInt = (data: any) =>
  Number.isInteger(data) && !Object.is(data, -0) && !data.toString(10).includes("e");
const isFloat = (data: unknown) => typeof data === "number" && !isInt(data);

const INT_EXPLICIT = /^[-+]?(?:0b[01]+|0o[0-7]+|0x[\da-fA-F]+|\d+)$/;

function parseInteger(source: string): number {
  const sign = source[0] === "-" ? -1 : 1;
  const value = /^[-+]/.test(source) ? source.slice(1) : source;
  const base = { b: 2, o: 8, x: 16 }[value.startsWith("0") ? value[1]! : ""] as number | undefined;
  return sign * parseInt(base ? value.slice(2) : value, base ?? 10);
}

const finite = (n: number) => (Number.isFinite(n) ? n : NOT_RESOLVED);

const intTag = (chars: string[], resolve: (source: string, isExplicit: boolean) => unknown) =>
  defineScalarTag(`${Y}int`, {
    implicit: true,
    implicitFirstChars: chars,
    resolve,
    identify: isInt,
    represent: (data: number) => data.toString(10),
  });
// JSON and core differ only in what resolves without a tag.
const int12 = (implicit: RegExp) => (source: string, isExplicit: boolean) =>
  (isExplicit ? INT_EXPLICIT : implicit).test(source) ? finite(parseInteger(source)) : NOT_RESOLVED;
export const intCoreTag = /* @__PURE__ */ intTag(
  SIGNED,
  /* @__PURE__ */ int12(/^(?:0o[0-7]+|0x[\da-fA-F]+|[-+]?\d+)$/),
);
export const intJsonTag = /* @__PURE__ */ intTag(
  MINUS,
  /* @__PURE__ */ int12(/^-?(?:0|[1-9]\d*)$/),
);

// Base 60: each `:` part is a digit group, worth 60 of the next.
const sexagesimal = (value: string) =>
  value.split(":").reduce((total, part) => total * 60 + Number(part), 0);

export const intYaml11Tag = /* @__PURE__ */ intTag(SIGNED, (source) => {
  if (
    !/^(?:[-+]?0b[01_]+|[-+]?0[0-7_]+|[-+]?0x[\da-fA-F_]+|[-+]?\d[\d_]*(?::[0-5]?\d)+|[-+]?(?:0|[1-9][\d_]*))$/.test(
      source,
    )
  )
    return NOT_RESOLVED;
  let value = source.replace(/_/g, "");
  const sign = value[0] === "-" ? -1 : 1;
  if (/^[-+]/.test(value)) value = value.slice(1);
  return finite(
    sign *
      (value.startsWith("0b")
        ? parseInt(value.slice(2), 2)
        : value.startsWith("0x")
          ? parseInt(value.slice(2), 16)
          : value.includes(":")
            ? sexagesimal(value)
            : value !== "0" && value[0] === "0"
              ? parseInt(value, 8)
              : parseInt(value, 10)),
  );
});

const FLOAT_SPECIAL = /^(?:[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
const FLOAT_12 = /^(?:[-+]?\d+(?:\.\d*)?(?:[eE][-+]?\d+)?|[-+]?\.\d+(?:[eE][-+]?\d+)?)$/;

// Sign, then `.inf`, `.nan`, or whatever `parse` reads. Finite unless special.
function parseFloat12(source: string, parse: (value: string) => number = parseFloat) {
  let value = source.toLowerCase();
  const sign = value[0] === "-" ? -1 : 1;
  if (/^[-+]/.test(value)) value = value.slice(1);
  if (value === ".inf") return sign * Infinity;
  if (value === ".nan") return NaN;
  return finite(sign * parse(value));
}

const floatTag = (chars: string[], resolve: (source: string, isExplicit: boolean) => unknown) =>
  defineScalarTag(`${Y}float`, {
    implicit: true,
    implicitFirstChars: chars,
    resolve,
    identify: isFloat,
    represent: (data: number) => {
      if (Number.isNaN(data)) return ".nan";
      if (data === Infinity) return ".inf";
      if (data === -Infinity) return "-.inf";
      if (Object.is(data, -0)) return "-0.0";
      const text = data.toString(10);
      return /^[-+]?\d+e/.test(text) ? text.replace("e", ".e") : text;
    },
  });
const floatCore = (source: string) =>
  FLOAT_12.test(source) || FLOAT_SPECIAL.test(source) ? parseFloat12(source) : NOT_RESOLVED;
export const floatCoreTag = /* @__PURE__ */ floatTag(FLOATY, floatCore);
export const floatJsonTag = /* @__PURE__ */ floatTag(MINUS, (source, isExplicit) => {
  if (isExplicit) return floatCore(source);
  return /^-?(?:0|[1-9]\d*)(?:\.\d*)?(?:[eE][-+]?\d+)?$/.test(source)
    ? finite(Number(source))
    : NOT_RESOLVED;
});
export const floatYaml11Tag = /* @__PURE__ */ floatTag(FLOATY, (source) =>
  /^(?:[-+]?(?:\d[\d_]*)?\.[\d_]*(?:[eE][-+]\d+)?|[-+]?\d[\d_]*(?::[0-5]?\d)+\.[\d_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/.test(
    source,
  )
    ? parseFloat12(source.replace(/_/g, ""), (value) =>
        value.includes(":") ? sexagesimal(value) : parseFloat(value),
      )
    : NOT_RESOLVED,
);

export const mergeTag = /* @__PURE__ */ defineScalarTag(`${Y}merge`, {
  implicit: true,
  implicitFirstChars: ["<"],
  resolve: (source, isExplicit) =>
    source === "<<" || (isExplicit && source === "") ? "<<" : NOT_RESOLVED,
  identify: () => false,
});

export const binaryTag = /* @__PURE__ */ defineScalarTag(`${Y}binary`, {
  resolve: (source) => {
    const input = source.replace(/\s/g, "");
    if (input.length % 4 || !/^[A-Za-z\d+/]*={0,2}$/.test(input)) return NOT_RESOLVED;
    return Uint8Array.from(atob(input), (ch) => ch.charCodeAt(0));
  },
  identify: (data) => kindOf(data) === "[object Uint8Array]",
  represent: (data: Uint8Array) => {
    let binary = "";
    for (const byte of data) binary += String.fromCharCode(byte);
    return btoa(binary);
  },
});

const TIMESTAMP =
  /^(\d{4})-(\d\d?)-(\d\d?)(?:(?:[Tt]|[ \t]+)(\d\d?):(\d\d):(\d\d)(?:\.(\d*))?(?:[ \t]*(Z|([-+])(\d\d?)(?::(\d\d))?))?)?$/;

export const timestampTag = /* @__PURE__ */ defineScalarTag(`${Y}timestamp`, {
  implicit: true,
  implicitFirstChars: DIGITS,
  resolve: (source) => {
    const m = TIMESTAMP.exec(source);
    // A date alone needs two-digit month and day.
    if (!m || (!m[4] && !/^\d{4}-\d\d-\d\d$/.test(source))) return NOT_RESOLVED;
    const [year, month, day, hour = 0, minute = 0, second = 0] = m.slice(1, 7).map(Number) as [
      number,
      number,
      number,
      number?,
      number?,
      number?,
    ];
    if (hour > 23 || minute > 59 || second > 59) return NOT_RESOLVED;
    const date = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second,
        +(m[7] ?? "").slice(0, 3).padEnd(3, "0"),
      ),
    );
    // Date.UTC maps years 0-99 to 1900-1999, and both roll over invalid days.
    date.setUTCFullYear(year, month - 1, day);
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    )
      return NOT_RESOLVED;
    if (m[9]) {
      const offsetHour = +m[10]!;
      const offsetMinute = +(m[11] ?? 0);
      if (offsetHour > 23 || offsetMinute > 59) return NOT_RESOLVED;
      const offset = (offsetHour * 60 + offsetMinute) * 60000;
      date.setTime(date.getTime() - (m[9] === "-" ? -offset : offset));
    }
    return date;
  },
  identify: (data) => data instanceof Date,
  represent: (data: Date) => data.toISOString(),
});

export const seqTag = /* @__PURE__ */ defineSequenceTag(`${Y}seq`, {
  create: () => [] as unknown[],
  addItem: (carrier, item) => {
    carrier.push(item);
  },
  identify: Array.isArray,
});

// The single key of an omap or pairs item, or undefined when it has more or
// fewer, or isn't a mapping.
function onlyKey(item: unknown): { key: unknown } | undefined {
  if (item instanceof Map) return item.size === 1 ? { key: item.keys().next().value } : undefined;
  if (kindOf(item) !== "[object Object]") return undefined;
  const keys = Object.keys(item as object);
  return keys.length === 1 ? { key: keys[0] } : undefined;
}

export const omapTag = /* @__PURE__ */ defineSequenceTag(`${Y}omap`, {
  create: () => ({ list: [] as unknown[], seen: new Set<unknown>() }),
  addItem: (carrier, item) => {
    // js-yaml 5 checks for a plain object here, and for any object in pairs.
    const only = isPlainObject(item) || item instanceof Map ? onlyKey(item) : undefined;
    if (!only) return "cannot resolve an ordered map item";
    if (carrier.seen.has(only.key)) return "duplicate key in ordered map";
    carrier.seen.add(only.key);
    carrier.list.push(item);
  },
  finalize: (carrier) => carrier.list,
  identify: () => false,
});

export const pairsTag = /* @__PURE__ */ defineSequenceTag(`${Y}pairs`, {
  create: () => [] as [unknown, unknown][],
  addItem: (carrier, item) => {
    const only = onlyKey(item);
    if (!only) return "cannot resolve a pairs item";
    carrier.push([
      only.key,
      item instanceof Map ? item.get(only.key) : (item as any)[only.key as string],
    ]);
  },
  identify: () => false,
});

// A plain object, wrapped in the Map form the dumper walks. Key by key, as
// js-yaml 5 reads it: a key an earlier getter deleted still reads, as undefined.
const entries = (data: Record<string, unknown>) => {
  const map = new Map<unknown, unknown>();
  for (const key of Object.keys(data)) map.set(key, data[key]);
  return map;
};

// Defines a key as own data, so `__proto__` never reaches the prototype setter.
function define(carrier: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(carrier, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

const objectMap = (normalize: (key: unknown) => string | null, complex: string) =>
  defineMappingTag(`${Y}map`, {
    create: (): Record<string, unknown> => ({}),
    identify: isPlainObject,
    represent: entries,
    addPair: (carrier, key, value) => {
      const name = normalize(key);
      if (name === null) return complex;
      define(carrier, name, value);
      return "";
    },
    has: (carrier, key) => {
      const name = normalize(key);
      return name !== null && Object.hasOwn(carrier, name);
    },
    keys: (carrier) => Object.keys(carrier),
    get: (carrier, key) => (Object.hasOwn(carrier, String(key)) ? carrier[String(key)] : null),
  });

// Only scalar keys, stored as strings.
export const mapTag = /* @__PURE__ */ objectMap(
  (key) => (key !== null && typeof key === "object" ? null : String(key)),
  "object-based map does not support complex keys",
);

const plainToString = (value: unknown) =>
  kindOf(value) === "[object Object]" ? "[object Object]" : value;

// js-yaml 4's keys: arrays join their items, objects become "[object Object]".
export const legacyMapTag = /* @__PURE__ */ objectMap((key) => {
  if (!Array.isArray(key)) return String(plainToString(key));
  if (key.some(Array.isArray)) return null;
  return String(key.map(plainToString));
}, "nested arrays are not supported inside keys");

export const realMapTag = /* @__PURE__ */ defineMappingTag(`${Y}map`, {
  create: () => new Map<unknown, unknown>(),
  addPair: (carrier, key, value) => {
    carrier.set(key, value);
    return "";
  },
  has: (carrier, key) => carrier.has(key),
  keys: (carrier) => carrier.keys(),
  get: (carrier, key) => carrier.get(key),
  identify: (data) => data instanceof Map || isPlainObject(data),
  represent: (data) => (data instanceof Map ? data : entries(data)),
});

export const setTag = /* @__PURE__ */ defineMappingTag(`${Y}set`, {
  create: () => new Set<unknown>(),
  identify: (data) => data instanceof Set,
  represent: (data: Set<unknown>) => new Map([...data].map((key) => [key, null])),
  addPair: (carrier, key, value) => {
    if (value !== null) return "cannot resolve a set item";
    carrier.add(key);
    return "";
  },
  has: (carrier, key) => carrier.has(key),
  keys: (carrier) => carrier.keys(),
  get: () => null,
});
