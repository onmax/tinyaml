// Differential stringify fuzzing of a tinyini entry against the library it
// replaces, ini 7.0.0 for tinyini/ini: random values through
// every combination of align, sort, whitespace, newline, bracketedArray,
// platform, and section, plus odd option values on every tenth value. Output
// must be byte-identical, a throw must be the same error, and the options
// object must be left the same. Then the round trip: decode(encode(x)) with
// tinyini must describe the same as with ini.
// Usage: node scripts/fuzz-stringify.ts [values] [seed] [engine]
import { generator } from "./values.ts";
import { attempt, describe, engine, seeded, show } from "./shared.ts";

const {
  label,
  ours: tinyini,
  theirs: ini,
  fresh,
  documented = [],
  guard = (_input, fn) => fn(),
} = await engine(process.argv[4]);

// Runs fn as if on Windows. ini before 4.1 picks its line endings when it
// loads, so `win32` is a copy of it loaded that way.
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const onWindows = <T>(fn: () => T): T => {
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, "platform", platform);
  }
};
const win32 = onWindows(fresh);

const count = Number(process.argv[2] ?? 1000);
const generate = generator(seeded(Number(process.argv[3] ?? 1)));

const flags = ["align", "sort", "whitespace", "newline", "bracketedArray"] as const;
const combinations: Record<string, unknown>[] = [];
for (let bits = 0; bits < 1 << flags.length; bits++)
  for (const platform of [undefined, "win32", "linux"])
    for (const section of [undefined, "pre", "a.b", "x;y\\.z"]) {
      const opt: Record<string, unknown> = {};
      flags.forEach((flag, i) => (opt[flag] = (bits >> i) % 2 === 1));
      if (platform) opt.platform = platform;
      if (section) opt.section = section;
      combinations.push(opt);
    }
// Values ini normalizes in its own way, and options that are not objects.
const odd: (() => unknown)[] = [
  () => undefined,
  () => ({}),
  () => "sec",
  () => "",
  () => 5,
  () => true,
  () => null,
  () => ({ align: "yes", whitespace: 1, sort: 1, newline: "y", bracketedArray: 0 }),
  () => ({ platform: "", section: 0 }),
  () => ({ section: ["a", "b"] }),
  () => Object.freeze({ align: true, platform: "win32" }),
  () => Object.freeze({ bracketedArray: false, section: "s" }),
];

let calls = 0;
let throws = 0;
let roundTrips = 0;
let windowsCalls = 0;
let encodeDiffs = 0;
let roundTripDiffs = 0;
let overflowed = false;
const diffs = new Map<string, string>();
// Round trips that differ only as the README says decode does, by name.
const known = new Map<string, number>();
for (let n = 0; n < count; n++) {
  const value = generate();
  // Default options on Windows, where the platform's line ending applies.
  for (const make of [() => undefined, () => ({ whitespace: true }), () => "sec"]) {
    windowsCalls++;
    const expected = attempt(() => onWindows(() => win32.encode(value, make())));
    const actual = attempt(() => onWindows(() => tinyini.encode(value, make())));
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      encodeDiffs++;
      diffs.set(
        `win32 ${describe(value)} ${describe(make())}`,
        `ini:     ${show(expected)}\n  tinyini: ${show(actual)}`,
      );
    }
  }
  // The value behind a proxy that reads null every third time, so that
  // reading a key more or fewer times than the original shows.
  if (n % 10 === 0)
    for (const make of [() => ({ align: true }), () => ({}), () => ({ align: true, sort: true })]) {
      const proxy = () => {
        let reads = 0;
        return new Proxy(value as object, {
          get: (target, key, receiver) =>
            ++reads % 3 === 0 ? null : Reflect.get(target, key, receiver),
        });
      };
      calls++;
      const expected = attempt(() => ini.encode(proxy(), make()));
      const actual = attempt(() => tinyini.encode(proxy(), make()));
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        encodeDiffs++;
        diffs.set(
          `proxy ${describe(value)} ${describe(make())}`,
          `ini:     ${show(expected)}\n  tinyini: ${show(actual)}`,
        );
      }
    }
  const options: (() => unknown)[] = combinations.map((o) => () => ({ ...o }));
  if (n % 10 === 0) options.push(...odd);
  for (const [i, make] of options.entries()) {
    // A cycle through objects overflows the stack in both; a few dozen of
    // those per value are enough.
    if (i > 24 && i % 16 && overflowed) continue;
    const theirs = make();
    const mine = make();
    calls++;
    const expected = attempt(() => [ini.encode(value, theirs as never), theirs]);
    const actual = attempt(() => [tinyini.encode(value, mine as never), mine]);
    if (!expected.ok) throws++;
    overflowed = !expected.ok && expected.error.startsWith("RangeError");
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      encodeDiffs++;
      diffs.set(
        `${describe(value)} ${describe(make())}`,
        `ini:     ${show(expected)}\n  tinyini: ${show(actual)}`,
      );
      continue;
    }
    if (!expected.ok || !theirs || typeof theirs !== "object") continue;
    // The round trip, reading arrays the way they were written.
    const read = { bracketedArray: (theirs as { bracketedArray?: boolean }).bracketedArray };
    roundTrips++;
    const text = tinyini.encode(value, make() as never) as string;
    const a = attempt(() => guard(text, () => ini.decode(text, { ...read })));
    const b = attempt(() => tinyini.decode(text, { ...read }));
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    const doc = documented.find(
      (d) =>
        JSON.stringify(attempt(() => d.theirs.decode(text, { ...read }))) === JSON.stringify(b),
    );
    if (doc) known.set(doc.name, (known.get(doc.name) ?? 0) + 1);
    else {
      roundTripDiffs++;
      diffs.set(`round trip ${describe(value)}`, `ini:     ${show(a)}\n  tinyini: ${show(b)}`);
    }
  }
}

const limit = Number(process.env.SHOW ?? 10);
for (const [input, diff] of [...diffs].slice(0, limit))
  console.log(`--- ${input.slice(0, 300)}\n  ${diff}`);
for (const [name, n] of known) console.log(`${n} round trips differ as documented: ${name}`);
console.log(
  `${count} values, ${calls} encode calls and ${windowsCalls} on win32 (${throws} throw in ${label}): ${encodeDiffs} differ from ${label}; ` +
    `${roundTrips} round trips, ${roundTripDiffs} differ`,
);
