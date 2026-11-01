// Stands in for js-yaml 5 while its test suite runs. See diff.mjs. Options
// hold js-yaml 5's schemas and tags; they're translated to tinyaml's, and
// custom tags are wrapped so tinyaml sees its own NOT_RESOLVED.
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { inspect } from "node:util";
import * as real from "../../.cache/js-yaml/dist/js-yaml.mjs";
import * as tiny from "../../src/js-yaml-v5/index.ts";
import { equal } from "../support.ts";

export * from "../../.cache/js-yaml/dist/js-yaml.mjs";

const out = process.env.TINYAML_RESULTS;

// js-yaml 5's built-in tags and schemas, to tinyaml's.
const builtins = new Map();
for (const [name, value] of Object.entries(real))
  if (/Tag$|_SCHEMA$/.test(name) && tiny[name]) builtins.set(value, tiny[name]);

const tags = new Map();
function tag(definition) {
  if (builtins.has(definition)) return builtins.get(definition);
  if (tags.has(definition)) return tags.get(definition);
  let copy = definition;
  if (definition?.nodeKind === "scalar")
    copy = {
      ...definition,
      resolve: (...args) => {
        const result = definition.resolve(...args);
        return result === real.NOT_RESOLVED ? tiny.NOT_RESOLVED : result;
      },
    };
  tags.set(definition, copy);
  return copy;
}

const schemas = new Map();
function schema(value) {
  if (!(value instanceof real.Schema)) return value;
  if (builtins.has(value)) return builtins.get(value);
  if (!schemas.has(value)) schemas.set(value, new tiny.Schema(value.tags.map(tag)));
  return schemas.get(value);
}

const translate = (options) =>
  options && typeof options === "object" && "schema" in options
    ? { ...options, schema: schema(options.schema) }
    : options;

// A crash is an error that isn't the library's own YAMLException.
function attempt(fn, lib) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return {
      ok: false,
      crash: !(error instanceof lib.YAMLException),
      reason: String(error?.reason ?? error?.message ?? error),
      mark: error?.mark ? `${error.mark.line}:${error.mark.column}` : "",
      // The rest of what it says, which must agree too.
      error: { name: error?.name, message: error?.message, mark: error?.mark },
    };
  }
}

function show(result) {
  return result.ok
    ? inspect(result.value, { depth: 8, breakLength: Infinity, maxStringLength: 2000 }).slice(
        0,
        4000,
      )
    : `ERROR ${result.reason} @${result.mark} ${inspect(result.error, { depth: 4, breakLength: Infinity, maxStringLength: Infinity }).replaceAll(process.cwd(), ".")}`;
}

// A call's identity, for summary.ts to count each distinct call once: the
// function, the whole input, and the options as inspect shows them.
const identity = (fn, subject, options) =>
  createHash("sha256").update(`${fn}\0${subject}\0${options}`).digest("hex").slice(0, 16);

function compare(fn, input, options, run) {
  try {
    const expected = attempt(() => run(real, (o) => o), real);
    const actual = attempt(() => run(tiny, translate), tiny);
    let status;
    if (!expected.ok && actual.ok) status = "lenient";
    else if (expected.ok !== actual.ok || (actual.crash && !expected.crash)) status = "fail";
    else if (expected.ok)
      status = (
        fn === "dump" ? expected.value === actual.value : equal(expected.value, actual.value)
      )
        ? "pass"
        : "fail";
    else if (expected.reason !== actual.reason) status = "pass-error";
    else status = equal(expected.error, actual.error) ? "pass" : "pass-message";
    const subject =
      typeof input === "string" ? input : inspect(input, { depth: 4, breakLength: Infinity });
    // Without this checkout's path, which a `filename` option may hold.
    const opts = inspect(options, { depth: 4, breakLength: Infinity }).replaceAll(
      process.cwd(),
      ".",
    );
    if (out)
      appendFileSync(
        out,
        `${JSON.stringify({ fn, status, call: identity(fn, subject, opts), input: subject, options: opts, expected: show(expected), actual: show(actual) })}\n`,
      );
  } catch (error) {
    if (out)
      appendFileSync(
        out,
        `${JSON.stringify({ fn, status: "harness", call: `harness ${String(input).slice(0, 200)}`, input: String(input).slice(0, 200), expected: String(error) })}\n`,
      );
  }
}

export function load(input, options) {
  compare("load", input, options, (y, t) => y.load(input, t(options)));
  return real.load(input, options);
}

export function loadAll(input, iterator, options) {
  const opts = typeof iterator === "function" ? options : (iterator ?? options);
  compare("loadAll", input, opts, (y, t) => y.loadAll(input, t(opts)));
  return real.loadAll(input, iterator, options);
}

// `transform` and style rules receive each library's own AST, and a test
// may count their calls, so those calls run once, through js-yaml 5 only.
export function dump(value, options) {
  if (!options?.transform && !options?.scalarStyleRules)
    compare("dump", value, options, (y, t) => y.dump(value, t(options)));
  return real.dump(value, options);
}
