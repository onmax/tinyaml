// Stands in for js-yaml while js-yaml's test suite runs. Every load, loadAll
// and dump call still returns js-yaml's result, so js-yaml's own assertions
// are untouched. Each call is also replayed through tinyaml and compared
// with js-yaml configured the way Comark uses it: loadAll with JSON_SCHEMA,
// and dump with lineWidth -1.
import { appendFileSync } from "node:fs";
import { inspect } from "node:util";
import * as real from "../../.cache/js-yaml/dist/js-yaml.mjs";
import * as lite from "../../src/index.ts";

export * from "../../.cache/js-yaml/dist/js-yaml.mjs";

const out = process.env.TINYAML_RESULTS;
const SUPPORTED_DUMP = new Set(["indent", "noRefs", "skipInvalid", "sortKeys", "lineWidth"]);

function attempt(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).split("\n")[0] };
  }
}

// Iterative deep equality: alias chains in the pathological tests are far
// deeper than the call stack. Pairs already compared count as equal, which
// also handles cycles and shared references.
function sameValue(a, b) {
  const stack = [[a, b]];
  const seen = new Map();
  while (stack.length) {
    const [x, y] = stack.pop();
    if (Object.is(x, y)) continue;
    if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) return false;
    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return false;
    let pairs = seen.get(x);
    if (pairs?.has(y)) continue;
    if (!pairs) seen.set(x, (pairs = new Set()));
    pairs.add(y);
    const keys = Object.keys(x);
    if (keys.length !== Object.keys(y).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(y, key)) return false;
      stack.push([x[key], y[key]]);
    }
  }
  return true;
}

function record(entry) {
  if (out) appendFileSync(out, `${JSON.stringify(entry)}\n`);
}

function show(result) {
  return result.ok
    ? inspect(result.value, { depth: 8, breakLength: Infinity, maxStringLength: 2000 }).slice(
        0,
        4000,
      )
    : `ERROR ${result.error}`;
}

// Huge pathological inputs must not break js-yaml's own tests.
function guarded(fn, subject) {
  try {
    fn();
  } catch (error) {
    const input =
      typeof subject === "string"
        ? subject.slice(0, 200)
        : inspect(subject, { depth: 2 }).slice(0, 200);
    record({
      fn: "harness",
      status: "fail",
      input,
      expected: String(error),
      actual: (error?.stack ?? "").split("\n").slice(1, 6).join(" | "),
    });
  }
}

function compareLoad(fn, input) {
  if (typeof input !== "string")
    return record({ fn, status: "skipped", reason: `non-string input (${typeof input})` });
  const expected = attempt(() => real.loadAll(input, { schema: real.JSON_SCHEMA }));
  const actual = attempt(() => lite.loadAll(input));
  const same =
    expected.ok === actual.ok && (!expected.ok || sameValue(expected.value, actual.value));
  record({
    fn,
    status: same ? "pass" : "fail",
    input: input.slice(0, 2000),
    expected: show(expected),
    actual: show(actual),
  });
}

function compareDump(value, options = {}) {
  const unsupported = Object.keys(options).filter(
    (key) =>
      options[key] !== undefined &&
      (!SUPPORTED_DUMP.has(key) || (key === "lineWidth" && options[key] !== -1)),
  );
  const input = inspect(value, { depth: 6, breakLength: Infinity }).slice(0, 400);
  if (unsupported.length)
    return record({
      fn: "dump",
      status: "skipped",
      reason: `options: ${unsupported.sort().join(", ")}`,
      input,
    });
  const expected = attempt(() => real.dump(value, { ...options, lineWidth: -1 }));
  const actual = attempt(() => lite.dump(value, options));
  const same = expected.ok === actual.ok && (!expected.ok || expected.value === actual.value);
  record({
    fn: "dump",
    status: same ? "pass" : "fail",
    input,
    options,
    expected: show(expected),
    actual: show(actual),
  });
}

export function load(input, options) {
  guarded(() => compareLoad("load", input), input);
  return real.load(input, options);
}

export function loadAll(input, iterator, options) {
  guarded(() => compareLoad("loadAll", input), input);
  return real.loadAll(input, iterator, options);
}

export function dump(value, options) {
  guarded(() => compareDump(value, options), value);
  return real.dump(value, options);
}
