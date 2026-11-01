// Runs json5 2.2.3's own tap test files (copied unchanged into test/json5)
// against any { parse, stringify }. The files are CommonJS and require
// '../lib', 'tap', 'sinon', and 'assert'; each require gets a small stand-in
// that records every assertion instead of printing TAP.
import nodeAssert from "node:assert";
import { readFileSync } from "node:fs";

export interface Assertion {
  name: string;
  ok: boolean;
  error?: string;
}

type Lib = { parse: unknown; stringify: unknown };

export function runTapFile(file: string, lib: Lib): Assertion[] {
  const results: Assertion[] = [];
  let path: string[] = [];

  const record = (name: string, check: () => void) => {
    const full = [...path, name].join(" > ");
    try {
      check();
      results.push({ name: full, ok: true });
    } catch (error) {
      results.push({ name: full, ok: false, error: String((error as Error).message ?? error) });
    }
  };

  const t = {
    test(name: string, fn: (t: unknown) => void) {
      const saved = path;
      path = [...path, name];
      try {
        fn(t);
      } catch (error) {
        results.push({ name: path.join(" > "), ok: false, error: String(error) });
      } finally {
        path = saved;
      }
    },
    end() {},
    strictSame(actual: unknown, expected: unknown, message = "strictSame") {
      record(message, () => nodeAssert.deepStrictEqual(actual, expected));
    },
    equal(actual: unknown, expected: unknown, message = "equal") {
      record(message, () => nodeAssert.strictEqual(actual, expected));
    },
    ok(value: unknown, message = "ok") {
      record(message, () => nodeAssert.ok(value));
    },
    throws(fn: () => unknown, expected: object, message = "throws") {
      record(message, () => nodeAssert.throws(fn, expected as Error));
    },
  };

  // Bare assert.* calls inside a subtest count as assertions too.
  const assert = new Proxy(nodeAssert, {
    get(target, key) {
      const value = Reflect.get(target, key) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        record(`assert.${String(key)}`, () => (value as (...a: unknown[]) => void)(...args));
    },
  });

  // sinon.mock(console).expects('warn').twice().calledWithMatch(text), then
  // verify() and restore(). The stand-in also checks that every call's first
  // argument contains the matched text.
  const sinon = {
    mock(object: Record<string, unknown>) {
      const expectations: {
        name: string;
        original: unknown;
        calls: unknown[][];
        count: number;
        match?: string;
      }[] = [];
      return {
        expects(name: string) {
          const expectation = { name, original: object[name], calls: [] as unknown[][], count: 1 };
          object[name] = (...args: unknown[]) => expectation.calls.push(args);
          expectations.push(expectation);
          const chain = {
            once: () => ((expectation.count = 1), chain),
            twice: () => ((expectation.count = 2), chain),
            calledWithMatch: (text: string) => (
              ((expectation as { match?: string }).match = text),
              chain
            ),
          };
          return chain;
        },
        verify() {
          record("sinon mock verify", () => {
            for (const e of expectations) {
              nodeAssert.strictEqual(e.calls.length, e.count, `${e.name} call count`);
              if (e.match)
                for (const call of e.calls) nodeAssert.ok(String(call[0]).includes(e.match));
            }
          });
        },
        restore() {
          for (const e of expectations) object[e.name] = e.original;
        },
      };
    },
  };

  const modules: Record<string, unknown> = { "../lib": lib, tap: t, sinon, assert };
  const require = (id: string) => {
    if (!(id in modules)) throw new Error(`unexpected require('${id}') in ${file}`);
    return modules[id];
  };
  // eslint-disable-next-line typescript/no-implied-eval
  new Function("require", readFileSync(file, "utf8"))(require);
  return results;
}
