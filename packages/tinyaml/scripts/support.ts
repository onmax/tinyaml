// What the comparison scripts share: the yaml-test-suite's cases and their
// expected JSON, the fuzzers' random numbers, one strict deep equality, and
// the check of a run against the differences a script expects.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const SUITE = ".cache/yaml-test-suite";

export interface SuiteCase {
  /** The case's directory under the suite: `2XXW`, or `2G84/00`. */
  id: string;
  dir: string;
  input: string;
  /** The suite marks the case as invalid YAML. */
  invalid: boolean;
  /** The documents in its in.json; undefined if it has none. */
  expected: unknown[] | undefined;
}

/** Every case in the suite, in directory order. */
export function suiteCases(): SuiteCase[] {
  const dirs: string[] = [];
  for (const name of readdirSync(SUITE)) {
    const dir = join(SUITE, name);
    if (!statSync(dir).isDirectory() || name === "name" || name === "tags") continue;
    if (existsSync(join(dir, "in.yaml"))) dirs.push(dir);
    else
      for (const sub of readdirSync(dir))
        if (existsSync(join(dir, sub, "in.yaml"))) dirs.push(join(dir, sub));
  }
  return dirs.map((dir) => {
    const json = join(dir, "in.json");
    return {
      id: dir.slice(SUITE.length + 1),
      dir,
      input: readFileSync(join(dir, "in.yaml"), "utf8"),
      invalid: existsSync(join(dir, "error")),
      expected: existsSync(json) ? jsonStream(readFileSync(json, "utf8")) : undefined,
    };
  });
}

/**
 * The values in a stream of JSON texts, one after another, as in.json holds
 * one per document. Each value is cut at its own end, so `1 23` is [1, 23].
 */
export function jsonStream(text: string): unknown[] {
  const values: unknown[] = [];
  const space = /[ \t\n\r]/;
  let at = 0;
  for (;;) {
    while (at < text.length && space.test(text[at]!)) at++;
    if (at === text.length) return values;
    const start = at;
    let depth = 0;
    do {
      const c = text[at++];
      if (c === '"') {
        while (at < text.length && text[at] !== '"') at += text[at] === "\\" ? 2 : 1;
        at++;
      } else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth--;
      // A number, true, false or null runs to the next delimiter.
      else if (depth === 0) while (at < text.length && !/[\s{}[\]",]/.test(text[at]!)) at++;
    } while (depth > 0 && at < text.length);
    values.push(JSON.parse(text.slice(start, at)));
  }
}

/**
 * mulberry32: numbers in [0, 1) from a 32-bit seed, in 32-bit integer
 * arithmetic, so no step loses bits and a seed's sequence doesn't cycle
 * within any run's length. Every fuzzer uses it.
 */
export function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A fuzzer's iteration count, or `fallback` without one: a positive safe
 * integer. Anything else throws, since a NaN count would run no iterations,
 * expect no differences, and pass.
 */
export function iterationsArg(arg: string | undefined, fallback: number): number {
  const n = Number(arg ?? fallback);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error(`iterations must be a positive integer, not ${JSON.stringify(arg)}`);
  return n;
}

/** A fuzzer's seed, 1 without one: a safe integer, as mulberry32 takes. */
export function seedArg(arg: string | undefined): number {
  const n = Number(arg ?? 1);
  if (!Number.isSafeInteger(n))
    throw new Error(`seed must be an integer, not ${JSON.stringify(arg)}`);
  return n;
}

/**
 * `input` with \r\n line breaks in a tenth of the calls and lone \r in a few
 * more, so the comparisons see both, as Windows and old Mac files have them.
 * Draws once from `next`.
 */
export function withBreaks(input: string, next: () => number): string {
  const draw = next();
  if (draw < 0.1) return input.replace(/\n/g, "\r\n");
  return draw < 0.13 ? input.replace(/\n/g, "\r") : input;
}

/**
 * Strings with carriage returns: alone, before a line feed, mixed with the
 * other line breaks, at either end, and beside the backslash escapes a
 * writer could confuse them with. CR_VALUES holds each alone, in a
 * sequence, and as a key and value; every stringify fuzzer writes those
 * with expectWritten before its random values, so they don't depend on the
 * seed.
 */
export const CR_STRINGS = [
  "\r",
  "\r\n",
  "a\rb",
  "a\r\nb",
  "\ra",
  "a\r",
  "\r\n\r\n",
  "a\nb\r\nc\rd",
  " \r ",
  "a \r\n  b\r\n",
  "\\r",
  "\\r\r",
  "a\\r\\n\r\nb",
];
export const CR_VALUES: unknown[] = CR_STRINGS.flatMap((s) => [
  s,
  [s],
  { [s]: s },
  { key: { a: s, b: `${s}tail` } },
]);

/** Fails the run unless each side writes each value alike: `write` gives both outputs. */
export function expectWritten(
  values: readonly unknown[],
  write: (value: unknown) => [string, string],
) {
  for (const value of values) {
    const [theirs, ours] = write(value);
    if (theirs !== ours)
      fail(
        `${JSON.stringify(value)} written differently:\n  ${JSON.stringify(theirs)}\n  ${JSON.stringify(ours)}`,
      );
  }
}

/**
 * An error's full message with each of `parts` in it, found in order,
 * written as %0, %1 and so on. Where each part is a field compared on its
 * own, a message that differs only through them has the same template, and
 * one put together otherwise, cut short say, doesn't.
 */
export function template(message: string, parts: (string | number | null | undefined)[]): string {
  let text = "";
  let at = 0;
  parts.forEach((part, i) => {
    const found = part ? message.indexOf(String(part), at) : -1;
    if (found < 0) return;
    text += `${message.slice(at, found)}%${i}`;
    at = found + String(part).length;
  });
  return text + message.slice(at);
}

/**
 * What a js-yaml 4 or 5 YAMLException says, field by field: its name and
 * reason, each field of its mark, the mark's keys in order, and `text`, the
 * template of its full message with the reason, the filename and position,
 * and the snippet in it.
 */
export function yamlException(error: unknown): Record<string, unknown> {
  const { name, reason, message, mark } = error as {
    name: string;
    reason: string;
    message: string;
    mark?: Record<string, string | number | null>;
  };
  const { position, line, column, snippet, buffer, name: file } = mark ?? {};
  const where = mark && `${file ? `in "${file}" ` : ""}(${+line! + 1}:${+column! + 1})`;
  return {
    name,
    reason,
    file,
    position,
    line,
    column,
    snippet,
    buffer,
    keys: mark && Object.keys(mark),
    text: template(message, [reason, where, snippet]),
  };
}

/** The groups errorDifference compares yamlException's fields in. */
export const YAML_EXCEPTION_GROUPS = {
  message: ["reason"],
  position: ["position", "line", "column"],
  snippet: ["snippet"],
  buffer: ["buffer"],
  "full message": ["name", "file", "keys", "text"],
};

/**
 * How two errors that both sides threw differ, as records of the fields
 * their library exposes: `groups` names sets of fields, such as
 * `{ message: ["reason"], position: ["position", "line", "column"] }`.
 * The kind lists the groups that differ, "message and position" say, and
 * each side shows its values of their fields. Undefined where all agree.
 */
export function errorDifference(
  groups: Record<string, readonly string[]>,
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): { kind: string; sides: [Record<string, unknown>, Record<string, unknown>] } | undefined {
  const differ = Object.entries(groups).filter(([, fields]) =>
    fields.some((field) => !equal(a[field], b[field])),
  );
  if (!differ.length) return;
  const fields = differ.flatMap(([, fields]) => fields);
  const pick = (error: Record<string, unknown>) =>
    Object.fromEntries(fields.map((field) => [field, error[field]]));
  return { kind: differ.map(([group]) => group).join(" and "), sides: [pick(a), pick(b)] };
}

/**
 * Deep equality as strict as a drop-in needs: the same prototypes, own
 * enumerable keys in the same order, arrays of the same length with holes in
 * the same places, Dates and boxed primitives by value, RegExps and errors by
 * their text, typed arrays and buffers byte for byte, and Maps and Sets entry
 * by entry in order. NaN equals NaN; -0 and 0 differ. Objects pair up one to
 * one: where one side has the same object at two places, as an alias gives,
 * so must the other, since a change through one alias shows through the
 * other. A pair already being compared counts as equal, so cycles end.
 * Against JSON, which has no order (the suite's RR7F lists `d` before `a`)
 * and no shared objects, pass `{ keyOrder: false, identity: false }`.
 */
export function equal(a: unknown, b: unknown, { keyOrder = true, identity = true } = {}): boolean {
  const seen = new Map<object, Set<object>>();
  // With identity, each side's objects mapped to the other's.
  const there = new Map<object, object>();
  const back = new Map<object, object>();
  const stack: [unknown, unknown][] = [[a, b]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    // The same object on both sides still pairs: found again, it must be
    // with itself, and so must each object inside it.
    if (Object.is(x, y) && !(identity && typeof x === "object" && x)) continue;
    if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) return false;
    if (identity) {
      const [paired, pairedBack] = [there.get(x), back.get(y)];
      if (paired || pairedBack) {
        if (paired === y && pairedBack === x) continue;
        return false;
      }
      there.set(x, y);
      back.set(y, x);
    } else {
      let pairs = seen.get(x);
      if (pairs?.has(y)) continue;
      if (!pairs) seen.set(x, (pairs = new Set()));
      pairs.add(y);
    }
    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return false;
    if (Array.isArray(x) && x.length !== (y as unknown[]).length) return false;
    if (x instanceof Date || x instanceof Number || x instanceof String || x instanceof Boolean) {
      if (!Object.is(x.valueOf(), y.valueOf())) return false;
    } else if (x instanceof RegExp || x instanceof Error) {
      if (String(x) !== String(y as RegExp | Error)) return false;
    } else if (ArrayBuffer.isView(x) || x instanceof ArrayBuffer) {
      const bytes = (v: object) =>
        ArrayBuffer.isView(v)
          ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
          : new Uint8Array(v as ArrayBuffer);
      const [p, q] = [bytes(x), bytes(y)];
      if (p.length !== q.length || p.some((byte, i) => byte !== q[i])) return false;
    } else if (x instanceof Map || x instanceof Set) {
      const xs = [...x.entries()];
      const ys = [...(y as Map<unknown, unknown>).entries()];
      if (xs.length !== ys.length) return false;
      xs.forEach(([key, value], i) => stack.push([key, ys[i]![0]], [value, ys[i]![1]]));
    }
    const keys = Object.keys(x);
    const other = Object.keys(y);
    if (keys.length !== other.length) return false;
    for (const [i, key] of keys.entries()) {
      if (keyOrder ? key !== other[i] : !Object.hasOwn(y, key)) return false;
      stack.push([(x as Record<string, unknown>)[key], (y as Record<string, unknown>)[key]]);
    }
  }
  return true;
}

/**
 * Inputs whose aliases name mappings and sequences. No yaml-test-suite
 * input gives a shared object in js-yaml or std, so a parser that copied
 * each aliased collection would agree on every mutated one; each parse
 * fuzzer checks these first with expectAliases. yamljs reads only the first
 * three as the others do.
 */
export const ALIASED = [
  "base: &base {x: 1, y: [a, b]}\ncopy: *base\n",
  "list: &list\n  - 1\n  - &item {z: 2}\nagain: *list\nitem: *item\n",
  "defaults: &d\n  adapter: pg\n  pool: &p {max: 5}\ndev:\n  <<: *d\n  db: dev\npool: *p\n",
  "- &a [1, 2]\n- *a\n- &m\n  k: v\n- *m\n- [*a, *m]\n",
  "&root\nself: *root\nkids:\n  - &kid {name: x}\n  - *kid\n",
  "a: &x [&y {k: 1}]\n---\nb: &x [*x, &y {}]\nc: *y\n",
  "? &k [1]\n: *k\n",
];

/**
 * Fails the run unless each side reads each input to an equal value, the
 * same objects shared, or both throw.
 */
export function expectAliases(
  inputs: readonly string[],
  theirs: (input: string) => unknown,
  ours: (input: string) => unknown,
): void {
  for (const input of inputs) {
    const [a, b] = [theirs, ours].map((read) => {
      try {
        return { ok: true, value: read(input) };
      } catch (error) {
        return { ok: false, value: error };
      }
    }) as [{ ok: boolean; value: unknown }, { ok: boolean; value: unknown }];
    if (a.ok !== b.ok || (a.ok && !equal(a.value, b.value)))
      fail(`aliases read differently: ${JSON.stringify(input)}`);
  }
}

export type ErrorClass = abstract new (...args: never[]) => unknown;

/**
 * Whether an error is one a library throws on purpose, an instance of one of
 * its error classes. Anything else, a TypeError say, is a crash: it never
 * counts as agreeing with the other library's error.
 */
export const onPurpose = (error: unknown, classes: readonly ErrorClass[]): boolean =>
  classes.some((type) => error instanceof type);

/**
 * Whether an error is one the `yaml` package, or tinyaml/yaml after it,
 * throws on purpose: one of its YAMLErrors, a ReferenceError for an unknown
 * alias or too many aliases, or a plain Error for a merge source that isn't
 * a mapping.
 */
export const yamlOnPurpose = (error: unknown, type: ErrorClass): boolean =>
  onPurpose(error, [type]) ||
  (error instanceof ReferenceError &&
    /^(?:Unresolved alias|Alias resolution|Excessive alias)/.test(error.message)) ||
  (error instanceof Error &&
    Object.getPrototypeOf(error) === Error.prototype &&
    error.message.startsWith("Merge sources must be maps"));

/**
 * Checks the cases that differ against the ones a script expects to differ.
 * A new difference fails the run, and so does an expected one that's gone:
 * the list, and the numbers printed from it, need updating.
 */
export function expectList(what: string, found: Iterable<string>, known: readonly string[]): void {
  const actual = new Set(found);
  const unexpected = [...actual].filter((id) => !known.includes(id));
  const gone = known.filter((id) => !actual.has(id));
  if (unexpected.length) fail(`${what}, not expected: ${unexpected.join(", ")}`);
  if (gone.length) fail(`${what}, expected but gone (update the list): ${gone.join(", ")}`);
}

/** Fails the run unless `count` is in [min, max]; NaN is in no range. */
export function expectCount(what: string, count: number, min: number, max = min): void {
  if (!(count >= min && count <= max))
    fail(`${what}: ${count}, expected ${min === max ? min : `${min} to ${max}`}`);
}

/** Prints why the run failed and sets a failing exit code. */
export function fail(message: string): void {
  console.log(`FAIL ${message}`);
  process.exitCode = 1;
}
