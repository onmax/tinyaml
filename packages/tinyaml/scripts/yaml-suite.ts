// Compares tinyaml/yaml's `parse` with the `yaml` package on every
// yaml-test-suite input, with default options and with each schema and a few
// option sets: the same value, or both throwing the same kind of error, a
// YAMLParseError with the same code. The differences are listed below,
// exactly; a new one, or a listed one that's gone, fails the run. Each
// side's outcome on them is recorded in scripts/baselines/yaml-suite.json
// (see baseline.ts), per option set, and one that changes fails the run too.
// Usage: node --no-warnings scripts/yaml-suite.ts [-v] [--update]
import * as yaml from "yaml";
import { parse, YAMLError, type ParseOptions } from "../src/yaml/index.ts";
import { Baseline, describe, describeError } from "./baseline.ts";
import { equal, expectList, suiteCases, yamlOnPurpose } from "./support.ts";

const optionSets: Record<string, ParseOptions> = {
  default: {},
  merge: { merge: true },
  json: { schema: "json" },
  failsafe: { schema: "failsafe" },
  "yaml-1.1": { schema: "yaml-1.1" },
  "uniqueKeys:false": { uniqueKeys: false },
  intAsBigInt: { intAsBigInt: true },
};

// Every option set but json differs on these. yaml turns a collection key
// into a string from its source; tinyaml, which never sees the source, writes
// its own (4FJ6, 6BFJ, M2N8), and two such keys collide in X38W. SF5V has
// two %YAML directives, which yaml lets through. The rest are invalid YAML
// both reject, with another error code.
const KNOWN = [
  "236B: other error code",
  "4FJ6: different value",
  "4HVU: other error code",
  "5U3A: other error code",
  "6BFJ: different value",
  "7MNF: other error code",
  "9C9N: other error code",
  "9CWY: other error code",
  "9KBC: other error code",
  "CXX2: other error code",
  "DK4H: other error code",
  "EW3V: other error code",
  "G5U8: other error code",
  "G9HC: other error code",
  "GDY7: other error code",
  "H7J7: other error code",
  "JY7Z: other error code",
  "M2N8/00: different value",
  "M2N8/01: different value",
  "MUS6/01: other error code",
  "QLJ7: other error code",
  "RHX7: other error code",
  "SF5V: only tinyaml throws",
  "SY6V: other error code",
  "T833: other error code",
  "U99R: other error code",
  "VJP3/00: other error code",
  "X38W: only tinyaml throws",
  "X4QW: other error code",
  "Y79Y/000: other error code",
  "Y79Y/003: other error code",
  "YJV2: other error code",
  "ZCZ6: other error code",
  "ZL4Z: other error code",
  "ZVH3: other error code",
  "ZXT5: other error code",
];
// With the json schema, only these differ, all rejected by both.
const JSON_KNOWN = [
  "9KAX: other error code",
  "9KBC: other error code",
  "B63P: other error code",
  "CXX2: other error code",
  "G5U8: other error code",
  "KSS4: other error code",
  "MUS6/01: other error code",
  "SF5V: other error code",
  "SY6V: other error code",
  "U99R: other error code",
  "W4TN: other error code",
  "Y79Y/003: other error code",
  "YJV2: other error code",
  "ZXT5: other error code",
];
// With uniqueKeys: false, X38W's colliding keys load, to another value.
const UNIQUE_KEYS = ["X38W: different value"];

type Outcome =
  | { ok: true; value: unknown }
  | { ok: false; error: string; message: string; crash: boolean };
function outcome(f: () => unknown, type: typeof YAMLError | typeof yaml.YAMLError): Outcome {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    const { name, code, message } = e as { name?: string; code?: string; message?: string };
    return {
      ok: false,
      error: `${name} ${code ?? ""}`,
      message: `${name} ${code ?? ""}: ${message ?? String(e)}`,
      crash: !yamlOnPurpose(e, type),
    };
  }
}
const record = (o: Outcome) => (o.ok ? describe(o.value) : describeError(o.message));

const show = (o: Outcome) =>
  o.ok
    ? JSON.stringify(o.value, (_, x) => (typeof x === "bigint" ? `${x}n` : x))?.slice(0, 80)
    : `${o.crash ? "CRASH" : "ERROR"} ${o.error}`;

process.removeAllListeners("warning");
process.on("warning", () => {});
const cases = suiteCases();
let total = 0;
let same = 0;
for (const [label, options] of Object.entries(optionSets)) {
  const cats: Record<string, number> = {};
  const found: string[] = [];
  const baseline = new Baseline("yaml-suite", label, cases.length);
  for (const [i, { id, input }] of cases.entries()) {
    const expected = outcome(() => yaml.parse(input, options as yaml.ParseOptions), yaml.YAMLError);
    const actual = outcome(() => parse(input, options), YAMLError);
    const k =
      !actual.ok && actual.crash
        ? "tinyaml crashes"
        : expected.ok && actual.ok
          ? equal(expected.value, actual.value)
            ? "same"
            : "different value"
          : !expected.ok && !actual.ok
            ? expected.error === actual.error
              ? "same"
              : "other error code"
            : `only ${expected.ok ? "tinyaml" : "yaml"} throws`;
    cats[k] = (cats[k] ?? 0) + 1;
    total++;
    if (k === "same") {
      same++;
      continue;
    }
    found.push(`${id}: ${k}`);
    baseline.add(i, `${id} ${k}`, input, undefined, {
      yaml: record(expected),
      tinyaml: record(actual),
    });
    if (process.argv[2] === "-v") console.log(label, id, show(expected), "|", show(actual));
  }
  console.log(label.padEnd(18), JSON.stringify(cats));
  const known =
    label === "json"
      ? JSON_KNOWN
      : label === "uniqueKeys:false"
        ? [
            ...KNOWN.filter((k) => !UNIQUE_KEYS.some((u) => u.split(":")[0] === k.split(":")[0])),
            ...UNIQUE_KEYS,
          ]
        : KNOWN;
  expectList(`${label}: cases that differ from yaml`, found, known);
  baseline.finish();
}
console.log(`${same}/${total} agree`);
