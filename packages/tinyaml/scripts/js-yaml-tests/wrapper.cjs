// Stands in for js-yaml while its test suite runs, and appends each call's
// outcome to $TINYAML_RESULTS. diff.mjs points `js-yaml` here.
const { appendFileSync } = require("node:fs");
const { inspect } = require("node:util");
const path = require("node:path");
const real = require(path.resolve(__dirname, "../../.cache/js-yaml4/index.js"));
const lite = require("../../src/js-yaml/index.ts");
const { equal } = require("../support.ts");

const out = process.env.TINYAML_RESULTS;

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
    };
  }
}

function show(result) {
  return result.ok
    ? inspect(result.value, { depth: 8, breakLength: Infinity, maxStringLength: 2000 }).slice(
        0,
        4000,
      )
    : `ERROR ${result.reason} @${result.mark}`;
}

function compare(fn, input, run) {
  try {
    const expected = attempt(() => run(real), real);
    const actual = attempt(() => run(lite), lite);
    let status;
    if (expected.ok !== actual.ok || (actual.crash && !expected.crash)) status = "fail";
    else if (expected.ok)
      status = (
        fn === "dump" ? expected.value === actual.value : equal(expected.value, actual.value)
      )
        ? "pass"
        : "fail";
    else
      status =
        expected.reason === actual.reason
          ? expected.mark === actual.mark
            ? "pass"
            : "pass-message"
          : "pass-error";
    const subject =
      typeof input === "string" ? input : inspect(input, { depth: 4, breakLength: Infinity });
    if (out)
      appendFileSync(
        out,
        `${JSON.stringify({ fn, status, input: subject.slice(0, 2000), expected: show(expected), actual: show(actual) })}\n`,
      );
  } catch (error) {
    if (out)
      appendFileSync(
        out,
        `${JSON.stringify({ fn, status: "harness", input: String(input).slice(0, 200), expected: String(error) })}\n`,
      );
  }
}

// Options may hold a schema built from js-yaml's own Type and Schema
// classes; tinyaml's loader reads the same fields, so they pass through.
module.exports = {
  ...real,
  load(input, options) {
    compare("load", input, (y) => y.load(input, options));
    return real.load(input, options);
  },
  loadAll(input, iterator, options) {
    const opts = typeof iterator === "function" ? options : (iterator ?? options);
    compare("loadAll", input, (y) => y.loadAll(input, opts));
    return real.loadAll(input, iterator, options);
  },
  dump(value, options) {
    // The suite's replacers count their calls, so they can't run twice.
    if (!options?.replacer) compare("dump", value, (y) => y.dump(value, options));
    return real.dump(value, options);
  },
};
