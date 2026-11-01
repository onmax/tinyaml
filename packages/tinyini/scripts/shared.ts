// Helpers the differential scripts share.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type * as tinyini from "../src/ini/index.ts";

const require = createRequire(import.meta.url);
export const ini = require("ini") as typeof tinyini;

/** A tinyini entry and the library it stands in for. */
export interface Engine {
  /** The original, as `name version`. */
  label: string;
  /** The original module. */
  theirs: any;
  /** The tinyini entry. */
  ours: any;
  /** The directory of the original's own tests, copied unchanged. */
  tests: string;
}

const engines: Record<string, () => Promise<Engine>> = {
  ini: async () => ({
    label: "ini 7.0.0",
    theirs: ini,
    ours: await import("../src/ini/index.ts"),
    tests: "test/suites/ini",
  }),
};

/** Every engine's name, which is its entry's subpath. */
export const ENGINES: string[] = Object.keys(engines);

/** The engine named on the command line, `ini` when none is. */
export async function engine(name = "ini"): Promise<Engine> {
  const load = engines[name];
  if (!load) throw new Error(`unknown engine ${name}; one of ${Object.keys(engines).join(", ")}`);
  return load();
}

/** mulberry32: a 32-bit PRNG with a period of 2^32, in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A string that describes a value completely: the type, the prototype (null,
 * Object, Array, or other), every own key in order with its value, and shared
 * references. Two values describe the same only if they are the same shape.
 */
export function describe(value: unknown): string {
  const seen = new Map<object, number>();
  const walk = (v: unknown): string => {
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "number") return Object.is(v, -0) ? "-0" : String(v);
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "function") return `function ${v.name}`;
    if (v === null || typeof v !== "object") return String(v);
    const id = seen.get(v);
    if (id !== undefined) return `ref#${id}`;
    seen.set(v, seen.size);
    const proto = Object.getPrototypeOf(v) as object | null;
    const tag =
      proto === null
        ? "null"
        : proto === Object.prototype
          ? "Object"
          : proto === Array.prototype
            ? "Array"
            : `other(${walk(proto)})`;
    const keys = Reflect.ownKeys(v).map((key) => {
      const d = Object.getOwnPropertyDescriptor(v, key)!;
      const flags = `${d.enumerable ? "" : "!e"}${d.writable === false ? "!w" : ""}`;
      const name = typeof key === "symbol" ? key.toString() : JSON.stringify(key);
      return `${name}${flags}:${"value" in d ? walk(d.value) : "accessor"}`;
    });
    return `${tag}{${keys.join(",")}}`;
  };
  return walk(value);
}

export type Outcome = { ok: true; value: string } | { ok: false; error: string };

/** Runs fn and describes what it returned or threw. */
export function attempt(fn: () => unknown): Outcome {
  try {
    return { ok: true, value: describe(fn()) };
  } catch (error) {
    if (!(error instanceof Error)) return { ok: false, error: `non-error ${String(error)}` };
    return { ok: false, error: `${error.constructor.name}: ${error.message}` };
  }
}

export const show = (r: Outcome): string => (r.ok ? r.value : `throws ${r.error}`).slice(0, 300);

/** ini's fixtures and the strings its tests parse. */
export function iniInputs(): string[] {
  const fixtures = readdirSync("test/suites/ini/fixtures").map((f) =>
    readFileSync(join("test/suites/ini/fixtures", f), "utf8"),
  );
  const proto = /var data = `([^`]*)`/.exec(readFileSync("test/suites/ini/proto.js", "utf8"))![1]!;
  return [
    ...fixtures,
    proto,
    "=just junk!\r\n[foo]\r\nbar\r\n",
    "[x]\r\ny=1\r\ny[]=2\r\n",
    "x;y",
    "x  # y",
    'x "\\',
  ];
}

/**
 * Config files of the kinds people read with ini, written for these tests,
 * each also with CRLF line endings, with a BOM, and (for git config files) as
 * pkg-types' parseGitConfig rewrites them before calling parseINI.
 */
export function samples(): string[] {
  const files = readdirSync("test/samples")
    .sort()
    .map((f) => readFileSync(join("test/samples", f), "utf8"));
  files.push(
    "[unicode]\nname = Jos\u00e9\nemoji = \ud83d\ude00\nnbsp\u00a0= x\u00a0\nline = a\u2028b\n" +
      "key\u2029 = v\nideo\u3000= \u3000y\nlone = \ud800\n\ufeffbom = mid\n",
  );
  return files.flatMap((text) => [
    text,
    text.replaceAll("\n", "\r\n"),
    `\ufeff${text}`,
    ...(text.includes('"]') ? [gitToIni(text)] : []),
  ]);
}

/** What pkg-types' parseGitConfig does to a .gitconfig before it calls parseINI. */
export const gitToIni = (text: string): string =>
  text.replaceAll(
    /^\[(\w+) "(.*)"\]$/gm,
    (_, section: string, subsection: string) =>
      `[${section}.${subsection.replaceAll(/\\(.)/g, "$1").replaceAll("\\", "\\\\").replaceAll(".", "\\.")}]`,
  );
