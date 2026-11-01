// Fuzzes tinyini's own API against scripts/root-spec.ts, the same rules
// written plainly. Parse: the parse fuzzer's kind of inputs (ini's fixtures,
// the config samples, documents ini writes, each randomly edited) must parse
// to the same value, prototypes, key order and errors included. Stringify:
// random values through every combination of the options must give the same
// text or the same error, and parse must read the text back as the value
// the README says it writes: numbers as strings, skipped values left out,
// and on each level the values before the sections.
// Usage: node scripts/root-fuzz.ts [inputs] [values] [seed]
import { parse, stringify } from "../src/index.ts";
import * as spec from "./root-spec.ts";
import { generator } from "./values.ts";
import {
  attempt,
  count as argument,
  describe,
  ini,
  iniInputs,
  samples,
  seeded,
  show,
} from "./shared.ts";

const iterations = argument(2, 20000);
const count = argument(3, 1000);
const seed = argument(4, 1);
const next = seeded(seed);
const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;

const seeds = [...iniInputs(), ...samples()];
const write = generator(seeded(2));
while (seeds.length < 400) {
  try {
    seeds.push(
      ini.encode(write(), { whitespace: next() < 0.5, section: pick([undefined, "a.b"]) }),
    );
  } catch {
    // BigInt values and cycles
  }
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
  "\\\\.",
  ".",
  '"',
  "'",
  '""',
  "''",
  "\n",
  "\r",
  "\r\n",
  " ",
  "\t",
  "\u00a0",
  "\u2028",
  "\ufeff",
  "a",
  "0",
  "true",
  "false",
  "null",
  "__proto__",
  "constructor",
  "'1'",
  '"\\u0041"',
  '"a\\"b"',
  '"\\\\"',
  "[a]",
  "[a.b]",
  "[a\\.b]",
  "[__proto__]",
  "[a.__proto__]",
  "a=1",
  "a[]=1",
  '"k"',
  '"k"[]',
  '"k" [] =',
  "\n[",
  "]\n",
  '["x"]',
  '["a.b"]',
];

let diffs = 0;
const report = (label: string, a: unknown, b: unknown) => {
  if (diffs++ < Number(process.env.SHOW ?? 10))
    console.log(
      `--- ${label.slice(0, 300)}\n  spec: ${show(a as never)}\n  root: ${show(b as never)}`,
    );
};

let inputs = 0;
for (let i = 0; i < seeds.length + iterations; i++) {
  let input = seeds[i] ?? pick(seeds);
  if (i >= seeds.length)
    for (let edits = 1 + Math.floor(next() * 4); edits > 0; edits--) {
      const at = Math.floor(next() * (input.length + 1));
      const r = next();
      if (r < 0.5) input = input.slice(0, at) + pick(pieces) + input.slice(at);
      else if (r < 0.75) input = input.slice(0, at) + input.slice(at + 1 + Math.floor(next() * 3));
      else input = input.slice(0, at) + pick(pieces) + input.slice(at + 1);
    }
  inputs++;
  const a = attempt(() => spec.parse(input));
  const b = attempt(() => parse(input));
  if (JSON.stringify(a) !== JSON.stringify(b)) report(`parse ${JSON.stringify(input)}`, a, b);
}

// What parse reads back from what stringify writes for `v`.
const model = (v: any, sort: boolean, key: string, inArray = false): any => {
  const method =
    v !== null && ["object", "function", "bigint"].includes(typeof v) ? v.toJSON : undefined;
  if (typeof method === "function") v = Reflect.apply(method, v, [key]);
  if (v === undefined || typeof v === "function" || typeof v === "symbol")
    return inArray ? null : undefined;
  if (v === null || typeof v === "boolean") return v;
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) {
    const items = [];
    const n = Math.min(Math.max(Math.trunc(Number(v.length)) || 0, 0), Number.MAX_SAFE_INTEGER);
    for (let i = 0; i < n; i++) items.push(model(v[i], sort, String(i), true));
    return items;
  }
  const out = Object.create(null);
  const keys = Object.keys(v);
  if (sort) keys.sort();
  const sections: [string, unknown][] = [];
  for (const k of keys) {
    const m = model(v[k], sort, k);
    if (m === undefined || k === "__proto__" || (Array.isArray(m) && !m.length)) continue;
    if (m && typeof m === "object" && !Array.isArray(m)) sections.push([k, m]);
    else out[k] = m;
  }
  for (const [k, m] of sections) out[k] = m;
  return out;
};

const generate = generator(seeded(seed));
const flags = ["whitespace", "align", "sort", "newline"] as const;
let calls = 0;
let throws = 0;
let trips = 0;
for (let n = 0; n < count; n++) {
  const value = generate() as object;
  for (let bits = 0; bits < 1 << flags.length; bits++)
    for (const eol of [undefined, "\r\n"]) {
      const options: Record<string, unknown> = {};
      flags.forEach((flag, i) => (options[flag] = (bits >> i) % 2 === 1));
      if (eol) options.eol = eol;
      calls++;
      const a = attempt(() => spec.stringify(value, { ...options }));
      const b = attempt(() => stringify(value, { ...options }));
      if (!a.ok) throws++;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        report(`stringify ${describe(value)} ${JSON.stringify(options)}`, a, b);
        continue;
      }
      if (!a.ok) continue;
      trips++;
      const back = attempt(() => parse(stringify(value, { ...options })));
      const want = attempt(() => model(value, !!options.sort, ""));
      if (JSON.stringify(back) !== JSON.stringify(want))
        report(`round trip ${describe(value)} ${JSON.stringify(options)}`, want, back);
    }
}
console.log(
  `${inputs} inputs, ${calls} stringify calls (${throws} throw), ${trips} round trips: ${diffs} differences`,
);
process.exitCode = diffs ? 1 : 0;
