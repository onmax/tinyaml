// Helpers the differential scripts share.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse, stringify, type Reviver } from "../src/json5/index.ts";
import { runTapFile } from "./tap.ts";

export type Outcome = { ok: true; value: unknown } | { ok: false; error: string };

export function attempt(fn: () => unknown): Outcome {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    if (!(error instanceof Error)) return { ok: false, error: `non-error ${String(error)}` };
    const { lineNumber, columnNumber } = error as Error & Record<string, unknown>;
    return {
      ok: false,
      error: `${error.name}: ${error.message} [${String(lineNumber)}:${String(columnNumber)}]`,
    };
  }
}

/** Deep equality that tells -0 from 0 and treats NaN as equal to itself. */
export const same = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b);

/** Every file in the json5-tests corpus, with whether it must parse. */
export function corpus(root = ".cache/json5-tests"): { file: string; valid: boolean }[] {
  const files: { file: string; valid: boolean }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== ".git") walk(path);
      } else if (/\.(json5?|js|txt)$/.test(entry.name))
        files.push({ file: path, valid: /\.json5?$/.test(entry.name) });
    }
  };
  walk(root);
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

/** Every string json5's own tests pass to parse, plus test.json5. */
export function testInputs(): string[] {
  const inputs = [readFileSync("test/json5/test.json5", "utf8")];
  const recorder = {
    parse: (text: string, reviver?: Reviver) => (inputs.push(String(text)), parse(text, reviver)),
    stringify,
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const file of ["parse.js", "errors.js"]) runTapFile(`test/json5/${file}`, recorder);
  } finally {
    console.warn = warn;
  }
  return inputs;
}

export function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}
