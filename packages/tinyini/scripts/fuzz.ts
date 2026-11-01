// Differential parse fuzzing of a tinyini entry against the library it
// replaces, ini 7.0.0 for tinyini/ini: take ini's fixtures and test
// strings, the config samples in test/samples, and documents ini writes for
// random values, apply a few random edits with INI-significant pieces, and
// check that both parsers return the same thing or throw the same error. The
// comparison covers prototypes, own key order, and shared references, under
// every bracketedArray setting, and on every tenth input odd option values
// too. It also compares what each call left on the options object, and runs
// `safe` and `unsafe` on every input.
// Usage: node scripts/fuzz.ts [iterations] [seed] [engine]
import { generator } from "./values.ts";
import { attempt, describe, engine, ini, iniInputs, samples, seeded, show } from "./shared.ts";

const {
  label,
  ours: tinyini,
  theirs,
  documented = [],
  guard = (_input, fn) => fn(),
} = await engine(process.argv[4]);

const iterations = Number(process.argv[2] ?? 20000);
const next = seeded(Number(process.argv[3] ?? 1));
const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;

const seeds = [...iniInputs(), ...samples()];
const generate = generator(seeded(2));
while (seeds.length < 400) {
  let text = "";
  try {
    text = ini.encode(generate(), {
      whitespace: next() < 0.5,
      align: next() < 0.3,
      newline: next() < 0.3,
      sort: next() < 0.3,
      bracketedArray: next() < 0.7,
      platform: pick(["linux", "win32"]),
      section: pick([undefined, "pre", "a.b"]),
    });
  } catch {
    continue; // BigInt values and cycles
  }
  if (text.length > 2) seeds.push(text);
}

const pieces = [
  "[",
  "]",
  "[]",
  "=",
  " = ",
  ";",
  "#",
  "\\",
  "\\;",
  "\\#",
  "\\\\",
  "\\.",
  ".",
  '"',
  "'",
  '""',
  "''",
  "\n",
  "\r",
  "\r\n",
  "\n\n",
  " ",
  "\t",
  "\v",
  "\f",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u2028",
  "\u2029",
  "\u202f",
  "\u3000",
  "\ufeff",
  "\u0085",
  "\u0000",
  "\u00e9",
  "\ud83d\ude00",
  "\ud800",
  "a",
  "Z",
  "0",
  "1",
  "true",
  "false",
  "null",
  "__proto__",
  "constructor",
  "toString",
  "hasOwnProperty",
  "length",
  "prototype",
  "'1'",
  "'-1.5e3'",
  "'null'",
  "'true'",
  "'[1]'",
  "'[1,2,3]'",
  "'{}'",
  "'{\"length\":5}'",
  "'\"x\"'",
  '"\\u0041"',
  '"\\n"',
  '"a\\"b"',
  "[a]",
  "[a.b]",
  "[a\\.b]",
  "[__proto__]",
  "[a.__proto__]",
  "a=1",
  "a[]=1",
  "a.b=null",
  "\n[",
  "]\n",
];

const decodeOptions: unknown[] = [undefined, { bracketedArray: true }, { bracketedArray: false }];
const oddOptions: unknown[] = [
  {},
  { bracketedArray: 0 },
  { bracketedArray: "false" },
  Object.freeze({ bracketedArray: false }),
  Object.freeze({}),
  "str",
  1,
  true,
  null,
  () => {},
];

const inputs = [...seeds];
for (let i = 0; i < iterations; i++) {
  let input = pick(seeds);
  for (let edits = 1 + Math.floor(next() * 4); edits > 0; edits--) {
    const at = Math.floor(next() * (input.length + 1));
    const r = next();
    if (r < 0.45) input = input.slice(0, at) + pick(pieces) + input.slice(at);
    else if (r < 0.7) input = input.slice(0, at) + input.slice(at + 1 + Math.floor(next() * 3));
    else if (r < 0.95) input = input.slice(0, at) + pick(pieces) + input.slice(at + 1);
    else {
      // Copy a line elsewhere, for duplicate keys and sections.
      const lines = input.split("\n");
      lines.splice(Math.floor(next() * lines.length), 0, pick(lines));
      input = lines.join("\n");
    }
  }
  inputs.push(input);
}

// Fresh copies of an options value, one for each library.
const copy = (o: unknown) =>
  typeof o === "function"
    ? () => {}
    : o && typeof o === "object" && !Object.isFrozen(o)
      ? { ...o }
      : o;

let calls = 0;
let throws = 0;
const diffs = new Map<string, string>();
// Inputs where tinyini differs from the original as the README says it does,
// by name of the difference.
const known = new Map<string, number>();
/**
 * Compares a call to the original with tinyini's. `call` makes the call on a
 * given module, so a difference can be checked against each documented one.
 */
const check = (label: string, input: string, call: (lib: any) => unknown) => {
  calls++;
  const expected = attempt(() => guard(input, () => call(theirs)));
  const actual = attempt(() => call(tinyini));
  if (!expected.ok) throws++;
  if (JSON.stringify(expected) === JSON.stringify(actual)) return;
  for (const { name, theirs: changed } of documented)
    if (JSON.stringify(attempt(() => call(changed))) === JSON.stringify(actual)) {
      known.set(name, (known.get(name) ?? 0) + 1);
      return;
    }
  diffs.set(
    `${label} ${JSON.stringify(input)}`,
    `theirs:  ${show(expected)}\n  tinyini: ${show(actual)}`,
  );
};

for (const [n, input] of inputs.entries()) {
  for (const options of n % 10 ? decodeOptions : [...decodeOptions, ...oddOptions])
    // Each call gets a fresh copy of the options, and returns what it left there.
    check(`decode ${describe(options)}`, input, (lib) => {
      const own = copy(options);
      return [lib.decode(input, own), own];
    });
  // Options whose bracketedArray getter flips on every read, as ini reads it
  // again for every key.
  if (n % 10 === 0)
    check("decode with a flipping getter", input, (lib) => {
      let reads = 0;
      const options = {
        get bracketedArray() {
          return ++reads % 2 === 1;
        },
        set bracketedArray(_: unknown) {},
      };
      return [lib.decode(input, options), reads];
    });
  check("unsafe", input, (lib) => lib.unsafe(input));
  check("safe", input, (lib) => lib.safe(input));
}
// unsafe and safe on values that are not strings.
for (const value of [undefined, null, 0, 1, true, false, {}, [], [1], NaN, new String(" 'x' ")])
  for (const fn of ["safe", "unsafe"] as const) check(fn, describe(value), (lib) => lib[fn](value));

const limit = Number(process.env.SHOW ?? 10);
for (const [input, diff] of [...diffs].sort((a, b) => a[0].length - b[0].length).slice(0, limit))
  console.log(`--- ${input.slice(0, 300)}\n  ${diff}`);
for (const [name, n] of known) console.log(`${n} calls differ as documented: ${name}`);
console.log(
  `${inputs.length} inputs (${seeds.length} seeds + ${iterations} mutated, ${new Set(inputs).size} distinct), ` +
    `${calls} calls (${throws} throw in ${label}): ${diffs.size} differences`,
);
