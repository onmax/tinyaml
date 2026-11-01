// Runs ini 7.0.0's own tap test files (copied unchanged into test/ini) against
// any ini-shaped module. The files are CommonJS and require '../' or '..',
// 'tap', 'fs', and 'path'; 'tap' gets a small stand-in that records every
// assertion instead of printing TAP. Snapshots are read from the copied
// tap-snapshots files and formatted with tcompare, as tap 16 does.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const tcompare = require("tcompare") as {
  format: (value: unknown, options?: { sort?: boolean }) => string;
  same: (found: unknown, wanted: unknown) => { match: boolean; diff: string };
};

export interface Assertion {
  name: string;
  ok: boolean;
  error?: string;
}

export const files = ["bar.js", "duplicate-properties.js", "foo.js", "proto.js", "win32.js"];

export function runTapFile(file: string, lib: unknown, root = "test/ini"): Assertion[] {
  const results: Assertion[] = [];
  const path = resolve(root, file);
  const prefix = `test/${file} TAP`;
  const snapshotFile = join(root, "tap-snapshots/test", `${file}.test.cjs`);
  let snapshots: Record<string, string> | undefined;
  const indexes = new Map<string, number>();

  // Each tap file runs in its own process; foo.js and win32.js redefine
  // process.platform, so put it back afterwards.
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!;

  const tap: Record<string, any> = {
    cleanSnapshot: (s: string) => s,
    test(name: string, fn: (t: unknown) => void) {
      fn(makeT(`${prefix} ${name}`));
    },
  };

  function makeT(fullname: string) {
    const record = (name: string, ok: boolean, error?: string) =>
      results.push(
        ok ? { name: `${fullname} > ${name}`, ok } : { name: `${fullname} > ${name}`, ok, error },
      );
    return {
      end() {},
      comment() {},
      equal(found: unknown, wanted: unknown, message = "should be equal") {
        record(message, found === wanted, `${String(found)} !== ${String(wanted)}`);
      },
      not(found: unknown, wanted: unknown, message = "should not be equal") {
        record(message, found !== wanted, `${String(found)} === ${String(wanted)}`);
      },
      same(found: unknown, wanted: unknown, message = "should be equivalent") {
        const result = tcompare.same(found, wanted);
        record(message, result.match, result.diff);
      },
      matchSnapshot(found: unknown, message = "must match snapshot") {
        const m = `${fullname} > ${message}`;
        if (typeof found !== "string") found = tcompare.format(found, { sort: true });
        found = tap.cleanSnapshot(found);
        const index = indexes.get(m) ?? 1;
        indexes.set(m, index + 1);
        snapshots ??= require(resolve(snapshotFile)) as Record<string, string>;
        const wanted = snapshots[`${m} ${index}`]?.replace(/\r\n/g, "\n").replace(/^\n|\n$/g, "");
        record(message, found === wanted, `snapshot ${m} ${index} differs:\n${String(found)}`);
      },
    };
  }
  Object.assign(tap, makeT(`${prefix}`));

  const modules: Record<string, unknown> = {
    "../": lib,
    "..": lib,
    tap,
    fs: require("node:fs"),
    path: require("node:path"),
  };
  const localRequire = (id: string) => {
    if (!(id in modules)) throw new Error(`unexpected require('${id}') in ${file}`);
    return modules[id];
  };
  try {
    // eslint-disable-next-line typescript/no-implied-eval
    new Function("require", "__dirname", readFileSync(path, "utf8"))(localRequire, dirname(path));
  } catch (error) {
    results.push({ name: `${prefix} (top level)`, ok: false, error: String(error) });
  } finally {
    Object.defineProperty(process, "platform", platform);
  }
  return results;
}
