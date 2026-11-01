// The differences a fuzzer is known to find, kept one by one in
// scripts/baselines/<fuzzer>.json. Each record names an input and its
// options by a hash, the iteration that first generated it, the kind of
// difference, and each side's outcome. A run fails on a difference that has
// no record, on a record whose outcome changed, and on a record within the
// run's iterations that no longer turns up. Records are kept per seed (and
// mode), and a shorter run checks the records its iterations reach, since
// a seed's first N inputs are the same however many follow.
//
// A run with --update rewrites its seed's records to what it found, and
// prints what it added, removed and changed; `git diff scripts/baselines`
// shows the same, one record per line. Review it before committing.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fail } from "./support.ts";

/** One known difference: which input, and what each side did with it. */
export interface Difference {
  /** The iteration that first generated the input. */
  at: number;
  /** A hash of the input and its options. */
  id: string;
  kind: string;
  options?: unknown;
  /** Each side's outcome, by library name. */
  sides: Record<string, string>;
  /** The input's start, to recognise it by. */
  input: string;
}

interface Run {
  iterations: number;
  differences: Difference[];
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** The positional arguments, without --update. */
export const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const update = process.argv.includes("--update");

/**
 * Text for a value that tells apart what deep equality does: types,
 * prototypes, key order, holes, -0, bigints, Dates, Maps and Sets, and
 * which objects are the same: an object found at more than one place is
 * written once, after `&1`, and as `*1` at each place after. Longer than
 * 100 characters, it's cut to 80 and a hash of the whole.
 */
export function describe(value: unknown): string {
  return shorten(serialize(value, 0, { shared: repeated(value), ids: new Map() }));
}

interface Refs {
  /** The objects found at more than one place. */
  shared: Set<object>;
  /** Those written so far, by their number. */
  ids: Map<object, number>;
}

// The objects reachable from `value` by more than one path.
function repeated(value: unknown): Set<object> {
  const seen = new Set<object>();
  const shared = new Set<object>();
  const stack = [value];
  while (stack.length) {
    const x = stack.pop();
    if (typeof x !== "object" || x === null) continue;
    if (seen.has(x)) {
      shared.add(x);
      continue;
    }
    seen.add(x);
    if (x instanceof Map) for (const entry of x) stack.push(...entry);
    else if (x instanceof Set) stack.push(...x);
    if (!ArrayBuffer.isView(x)) stack.push(...Object.values(x));
  }
  return shared;
}

/** Text for an error: its first line, cut as describe cuts. */
export const describeError = (message: string): string => shorten(`! ${message.split("\n")[0]}`);

function shorten(text: string): string {
  return text.length > 100 ? `${text.slice(0, 80)}… #${hash(text).slice(0, 12)}` : text;
}

function serialize(value: unknown, depth: number, refs: Refs): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (typeof value !== "object" || value === null) return String(value);
  const id = refs.ids.get(value);
  if (id) return `*${id}`;
  if (depth > 64) return "[Deep]";
  let anchor = "";
  if (refs.shared.has(value)) {
    refs.ids.set(value, refs.ids.size + 1);
    anchor = `&${refs.ids.size} `;
  }
  const proto = Object.getPrototypeOf(value) as object | null;
  const name = proto === null ? "[null]" : proto === Object.prototype ? "" : proto.constructor.name;
  const keys = (keys: string[]) =>
    keys.map(
      (key) => `${JSON.stringify(key)}:${serialize((value as never)[key], depth + 1, refs)}`,
    );
  let text: string;
  if (value instanceof Date)
    text = `Date(${Number.isNaN(+value) ? "Invalid" : value.toISOString()})`;
  else if (value instanceof RegExp || value instanceof Error) text = `${name}(${String(value)})`;
  else if (ArrayBuffer.isView(value))
    text = `${name}(${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex")})`;
  else if (value instanceof Map)
    text = `Map{${[...value].map(([k, v]) => `${serialize(k, depth + 1, refs)}=>${serialize(v, depth + 1, refs)}`).join(",")}}`;
  else if (value instanceof Set)
    text = `Set[${[...value].map((v) => serialize(v, depth + 1, refs)).join(",")}]`;
  else if (Array.isArray(value)) {
    const items = Array.from({ length: value.length }, (_, i) =>
      i in value ? serialize(value[i], depth + 1, refs) : "<hole>",
    );
    const extra = Object.keys(value).filter((key) => !/^\d+$/.test(key));
    text = `${name === "Array" ? "" : name}[${[...items, ...keys(extra)].join(",")}]`;
  } else text = `${name}{${keys(Object.keys(value)).join(",")}}`;
  return anchor + text;
}

/**
 * The known differences of one fuzzer's run: `name` is its baseline file,
 * `run` its seed and mode, as in "seed 1" or "seed 1, schemas".
 */
export class Baseline {
  readonly found = new Map<string, Difference>();
  readonly file: string;
  readonly run: string;
  readonly iterations: number;
  /** Each found input in full, to print for a new or changed record. */
  private inputs = new Map<string, string>();
  constructor(name: string, run: string, iterations: number) {
    this.run = run;
    this.iterations = iterations;
    this.file = new URL(`baselines/${name}.json`, import.meta.url).pathname;
  }

  /** Records a difference at iteration `at`. An input seen before is skipped. */
  add(at: number, kind: string, input: string, options: unknown, sides: Record<string, string>) {
    const id = hash(`${input}\0${JSON.stringify(options ?? null)}`).slice(0, 12);
    if (this.found.has(id)) return;
    this.inputs.set(id, input);
    const preview = JSON.stringify(input.slice(0, 40)) + (input.length > 40 ? "…" : "");
    this.found.set(id, {
      at,
      id,
      kind,
      ...(options === undefined ? {} : { options }),
      sides,
      input: preview,
    });
  }

  /** Checks what was found against the file, or with --update rewrites it. */
  finish(): void {
    const runs: Record<string, Run> = existsSync(this.file)
      ? JSON.parse(readFileSync(this.file, "utf8"))
      : {};
    const known = runs[this.run];
    const covered = Math.min(known?.iterations ?? 0, this.iterations);
    const expected = new Map(
      (known?.differences ?? []).filter((d) => d.at < covered).map((d) => [d.id, d]),
    );
    const line = (d: Difference) =>
      `${d.id} at ${d.at}, ${d.kind}${d.options === undefined ? "" : ` ${JSON.stringify(d.options)}`}: ${d.input}\n    ${Object.entries(
        d.sides,
      )
        .map(([side, outcome]) => `${side}: ${outcome}`)
        .join("\n    ")}`;
    const added: Difference[] = [];
    const changed: [Difference, Difference][] = [];
    for (const d of this.found.values()) {
      const before = expected.get(d.id);
      if (!before) added.push(d);
      else if (before.kind !== d.kind || JSON.stringify(before.sides) !== JSON.stringify(d.sides))
        changed.push([before, d]);
    }
    const gone = [...expected.values()].filter((d) => !this.found.has(d.id));
    const where = `${this.file.slice(this.file.indexOf("scripts/"))}, ${this.run}`;
    console.log(
      `known differences (${where}, ${known ? `${known.iterations} iterations recorded` : "none recorded"}): ${this.found.size} found, ${added.length} new, ${changed.length} changed, ${gone.length} gone`,
    );
    if (update && process.exitCode) {
      console.log(`not updating ${where}: the run failed`);
      return;
    }
    if (update) {
      runs[this.run] = {
        iterations: this.iterations,
        differences: [...this.found.values()].sort((a, b) => a.at - b.at),
      };
      writeFileSync(this.file, format(runs));
      console.log(`updated ${where}: review \`git diff scripts/baselines\` before committing`);
      return;
    }
    for (const d of added) console.log(`- new ${line(d)}${this.full(d.id)}`);
    for (const [before, d] of changed)
      console.log(`- changed ${line(d)}\n  was ${line(before)}${this.full(d.id)}`);
    for (const d of gone) console.log(`- gone ${line(d)}`);
    if (this.iterations > (known?.iterations ?? 0) && added.length)
      console.log(
        `- ${this.run} is recorded through ${known?.iterations ?? 0} iterations; differences past that are new`,
      );
    if (added.length || changed.length || gone.length)
      fail(
        `known differences in ${where}: ${added.length} new, ${changed.length} changed, ${gone.length} gone; if intended, rerun with --update and review the diff`,
      );
  }

  private full(id: string): string {
    return `\n    input: ${JSON.stringify(this.inputs.get(id))}`;
  }
}

// One record per line, records in iteration order, so a diff shows each
// difference added or removed as a line.
function format(runs: Record<string, Run>): string {
  const entries = Object.entries(runs).sort(([a], [b]) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  const body = entries.map(
    ([run, { iterations, differences }]) =>
      `  ${JSON.stringify(run)}: {\n    "iterations": ${iterations},\n    "differences": [${differences.length ? `\n${differences.map((d) => `      ${JSON.stringify(d)}`).join(",\n")}\n    ` : ""}]\n  }`,
  );
  return `{\n${body.join(",\n")}\n}\n`;
}
