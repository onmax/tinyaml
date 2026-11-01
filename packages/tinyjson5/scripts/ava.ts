// The part of ava that strip-json-comments' tests use, on node:test.
import assert from "node:assert";
import { test as nodeTest } from "node:test";

const t = { is: assert.strictEqual, deepEqual: assert.deepStrictEqual };
export default function test(name: string, fn: (assertions: typeof t) => void): void {
  void nodeTest(name, () => fn(t));
}
