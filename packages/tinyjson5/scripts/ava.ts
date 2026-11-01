// The part of ava that strip-json-comments' and comment-json's tests use,
// on node:test. `require("ava")` gets the test function itself.
import assert from "node:assert";
import { test as nodeTest } from "node:test";

const t = {
  is: (actual: unknown, expected: unknown, message?: string) =>
    assert.ok(
      Object.is(actual, expected),
      message ?? `${String(actual)} is not ${String(expected)}`,
    ),
  deepEqual: assert.deepStrictEqual,
  true: (value: unknown, message?: string) => assert.ok(value === true, message),
  false: (value: unknown, message?: string) => assert.ok(value === false, message),
  pass: () => {},
  // ava's throws checks `message`, `name` and `instanceOf` when given, and returns the error.
  throws(
    fn: () => unknown,
    expected?: { message?: string | RegExp; name?: string; instanceOf?: Function },
  ) {
    let error: any;
    assert.throws(fn, (e) => ((error = e), true));
    if (expected?.message !== undefined)
      if (typeof expected.message === "string") assert.strictEqual(error.message, expected.message);
      else assert.match(error.message, expected.message);
    if (expected?.name !== undefined) assert.strictEqual(error.name, expected.name);
    if (expected?.instanceOf) assert.ok(error instanceof expected.instanceOf);
    return error;
  },
};

export default function test(name: string, fn: (assertions: typeof t) => void): void {
  void nodeTest(name, () => fn(t));
}
test.only = test;
export { test as "module.exports" };
