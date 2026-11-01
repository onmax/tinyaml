// Differential stringify fuzzing of one entry against the library it replaces
// (scripts/engines.ts). Each random value goes through both with every combination of space, quote, and replacer, and the
// output must be byte-identical, or both must throw the same error (cycles).
// Then each acyclic value must survive a round trip: parse(stringify(x))
// equals x as JSON5 sees it (toJSON applied, boxes opened, -0 as 0, values
// JSON5 can't hold dropped from objects and written as null in arrays).
// Usage: node scripts/fuzz-stringify.ts [values] [seed] [engine]
import { attempt, same, seeded, type Outcome } from "./shared.ts";
import { isIdContinue, isIdStart } from "../src/core/unicode.ts";
import { engineFromArgs, numbers } from "./engines.ts";
import { checkCharacters, generator } from "./values.ts";

const engine = await engineFromArgs();
const json5 = engine.t;
const { parse, stringify } = engine.o;
if (engine.util) {
  const mismatched = checkCharacters(await engine.util(), { isIdStart, isIdContinue });
  if (mismatched.length)
    throw new Error(`identifier status differs for ${JSON.stringify(mismatched)}`);
}
const [count = 10000, seed = 1] = numbers();
const generate = generator(seeded(seed));

const spaces = [undefined, 0, 2, 4, "\t", "abcdefghijklmnop"];
const quotes = [undefined, "'", '"'];
function replacerFn(this: unknown, key: string, value: unknown): unknown {
  if (key === "drop") return undefined;
  if (typeof value === "number" && key.length === 1) return value * 2;
  if (typeof value === "string" && value.length > 6) return value.slice(0, 3);
  if (Array.isArray(this) && key === "0") return "first";
  return value;
}
const replacerList = [
  "a",
  "b",
  1,
  "",
  "a b",
  new String("\u00e9t\u00e9"),
  new Number(0),
  {},
  true,
  "a",
  "__proto__",
];
const replacers = [undefined, replacerFn, replacerList];

// Extra arguments beyond the required matrix, tried on every 10th value.
const extraSpaces = [new Number(3), new String("  "), 12, -1, 2.7, null, ""];
const extraQuotes = ["`", "x", ""];

let calls = 0;
let differences = 0;
let throws = 0;
const errorKinds = new Set<string>();
let roundTrips = 0;
let roundTripFailures = 0;
const examples: string[] = [];
const show = (r: Outcome) => (r.ok ? JSON.stringify(r.value) : r.error);

function compare(
  value: unknown,
  replacer: unknown,
  space: unknown,
  quote: unknown,
  positional: boolean,
) {
  const args = positional ? [value, replacer, space] : [value, { replacer, space, quote }];
  const expected = attempt(() => (json5.stringify as (...a: unknown[]) => string)(...args));
  const actual = attempt(() => (stringify as (...a: unknown[]) => string)(...args));
  calls++;
  if (!expected.ok) {
    throws++;
    errorKinds.add(expected.error);
  }
  if (
    actual.ok && expected.ok
      ? actual.value === expected.value
      : !actual.ok && !expected.ok && actual.error === expected.error
  )
    return;
  differences++;
  if (examples.length < 10)
    examples.push(
      `--- replacer=${typeof replacer} space=${JSON.stringify(space)} quote=${JSON.stringify(quote)}\n` +
        `  ${engine.library}: ${show(expected)}\n  ${engine.entry}: ${show(actual)}`,
    );
}

// What a value means in JSON5, built without either stringifier.
function normalize(holder: any, key: string): unknown {
  let value = holder[key];
  if (value != null) {
    if (typeof value.toJSON5 === "function") value = value.toJSON5(key);
    else if (typeof value.toJSON === "function") value = value.toJSON(key);
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean)
    value = value.valueOf();
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value;
  if (typeof value === "string" || typeof value === "boolean" || value === null) return value;
  if (typeof value !== "object") return undefined;
  if (Array.isArray(value)) return Array.from(value, (_, i) => normalize(value, String(i)) ?? null);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value)) {
    const v = normalize(value, k);
    if (v !== undefined)
      Object.defineProperty(out, k, {
        value: v,
        writable: true,
        enumerable: true,
        configurable: true,
      });
  }
  return out;
}

let linked = 0;
for (let n = 0; n < count; n++) {
  const { value, linked: isLinked } = generate(0.05);
  if (isLinked) linked++;
  for (const replacer of replacers)
    for (const space of spaces) {
      compare(value, replacer, space, undefined, true);
      for (const quote of quotes) compare(value, replacer, space, quote, false);
    }
  if (n % 10 === 0)
    for (const space of extraSpaces)
      for (const quote of extraQuotes) compare(value, undefined, space, quote, false);

  if (isLinked) continue;
  const expected = normalize({ "": value }, "");
  // Letters as indentation don't parse back, so that space is left out here.
  for (const space of spaces.slice(0, -1))
    for (const quote of quotes) {
      const text = stringify(value, { space, quote })!;
      roundTrips++;
      const back = text === undefined ? { ok: true, value: undefined } : attempt(() => parse(text));
      if (!back.ok || !same(back.value, expected)) {
        roundTripFailures++;
        if (examples.length < 10) examples.push(`--- round trip: ${text}`);
      }
    }
}

for (const example of examples) console.log(example);
console.log(
  `${count} values (${linked} with shared references or cycles), ${calls} stringify calls ` +
    `(${throws} throw in ${engine.library}, all with ${[...errorKinds].join(" or ")}): ` +
    `${differences} differ from ${engine.library}; ` +
    `${roundTrips} round trips, ${roundTripFailures} fail`,
);
