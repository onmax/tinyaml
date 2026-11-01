// Differential fuzzing of tinyini/one-ini and tinyini/one-ini-v0.1 against
// @one-ini/wasm 0.2.1 and 0.1.1. The inputs are the .editorconfig files of
// editorconfig-core-test, the config samples in test/samples and ini's
// fixtures, each randomly edited with the pieces the grammar cares about.
// Each input goes through parse_to_json as a string, and through
// parse_to_uint32array as its UTF-8 bytes and, one in five, with random bytes
// spliced in, so that some aren't UTF-8. The results must describe the same,
// prototypes and key order included, or throw the same error. Then odd
// arguments, version() and TokenTypes.
// Usage: node scripts/one-ini-fuzz.ts [inputs] [seed] [one-ini|one-ini-v0.1]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { attempt, describe, iniInputs, samples, seeded, show } from "./shared.ts";

const require = createRequire(import.meta.url);
const iterations = Number(process.argv[2] ?? 20000);
const next = seeded(Number(process.argv[3] ?? 1));
const name = process.argv[4] ?? "one-ini";
const id = require.resolve(name === "one-ini" ? "@one-ini/wasm" : "one-ini-v0.1");
// The WASM module leaks memory on every call, about 48 KiB for a 1 KiB file,
// and once it reaches 4 GiB every call throws `RuntimeError: unreachable`.
// A fresh instance every 5,000 inputs keeps it far from that.
const load = () => {
  delete require.cache[id];
  return require(id);
};
let theirs = load();
const ours = await import(`../src/${name}/index.ts`);
const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;

/** Every file under dir whose name ends in .in or is .editorconfig. */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    if (statSync(path).isDirectory()) return files(path);
    return f.endsWith(".in") || f === ".editorconfig" ? [readFileSync(path, "utf8")] : [];
  });
const seeds = [...files("test/suites/editorconfig-core-test"), ...samples(), ...iniInputs()];
const pieces = [
  "[",
  "]",
  "[]",
  "=",
  " = ",
  ";",
  "#",
  " ",
  "  ",
  "\t\t",
  "\t",
  "\n",
  "\r",
  "\r\n",
  "\n\n",
  "\n[",
  "]\n",
  "[*]\n",
  "[a]b]",
  "a=b",
  "a =",
  "a = \n",
  "=\n",
  "\ufeff",
  "\u00e9",
  "\ud83d\ude00",
  "\ud800",
  "\udc00",
  "\u00a0",
  "\u2028",
  "\u0000",
  "\u0085",
  "root = true",
  "# c",
  "; c",
  "#a=b",
  "[ s ]  ",
  "x",
  "\v",
  "\f",
];

let calls = 0;
let throws = 0;
const diffs = new Map<string, string>();
const check = (label: string, call: (lib: any) => unknown) => {
  calls++;
  const a = attempt(() => call(theirs));

  const b = attempt(() => call(ours));
  if (!a.ok) throws++;
  if (JSON.stringify(a) !== JSON.stringify(b))
    diffs.set(label, `wasm:    ${show(a)}\n  tinyini: ${show(b)}`);
};
const array = (u: unknown) => (u instanceof Uint32Array ? `Uint32Array ${u.join()}` : u);

const encoder = new TextEncoder();
for (let i = 0; i < seeds.length + iterations; i++) {
  if (i % 5000 === 4999) theirs = load();
  let input = seeds[i] ?? pick(seeds);
  if (i >= seeds.length)
    for (let edits = 1 + Math.floor(next() * 4); edits > 0; edits--) {
      const at = Math.floor(next() * (input.length + 1));
      const r = next();
      if (r < 0.5) input = input.slice(0, at) + pick(pieces) + input.slice(at);
      else if (r < 0.75) input = input.slice(0, at) + input.slice(at + 1 + Math.floor(next() * 3));
      else input = input.slice(0, at) + pick(pieces) + input.slice(at + 1);
    }
  check(`parse_to_json ${JSON.stringify(input)}`, (lib) => lib.parse_to_json(input));
  let bytes = encoder.encode(input);
  check(`parse_to_uint32array ${JSON.stringify(input)}`, (lib) =>
    array(lib.parse_to_uint32array(bytes)),
  );
  if (next() < 0.2) {
    const copy = Array.from(bytes);
    for (let n = 1 + Math.floor(next() * 3); n > 0; n--)
      copy.splice(
        Math.floor(next() * (copy.length + 1)),
        next() < 0.5 ? 1 : 0,
        Math.floor(next() * 256),
      );
    bytes = new Uint8Array(copy);
    check(`parse_to_uint32array [${bytes.join()}]`, (lib) =>
      array(lib.parse_to_uint32array(bytes)),
    );
  }
}
const odd: unknown[] = [
  undefined,
  null,
  5,
  true,
  "",
  "a=b",
  new String("a=b"),
  new String("a=\u00e9"),
  ["a"],
  { length: 2 },
  Buffer.from("a=b"),
  [97, 61, 98],
  new Uint16Array([97, 61, 1000]),
  "\ud800=1",
  // wasm-bindgen's malloc takes the length as an i32: a negative one traps,
  // a fractional one is cut. 0.1.1 reads 2 ** 31 as unsigned and allocates
  // 2 GiB, so only 0.2.1 gets it.
  { length: -1 },
  { length: -2.5 },
  ...(name === "one-ini" ? [{ length: 2 ** 31 }] : []),
  { length: 2 ** 32 + 1, 0: 97 },
  { length: 1.5, 0: 97, 1: 98 },
  { length: "2", 0: 97, 1: 61 },
  { length: NaN },
];
for (const value of odd) {
  // A trap can leave the module's allocator broken, so each gets a fresh one.
  theirs = load();
  check(`parse_to_json ${describe(value)}`, (lib) => lib.parse_to_json(value));
  check(`parse_to_uint32array ${describe(value)}`, (lib) => array(lib.parse_to_uint32array(value)));
}
check("version()", (lib) => lib.version());
check("TokenTypes", (lib) => [lib.TokenTypes, Object.isFrozen(lib.TokenTypes)]);

const limit = Number(process.env.SHOW ?? 10);
for (const [label, diff] of [...diffs].sort((a, b) => a[0].length - b[0].length).slice(0, limit))
  console.log(`--- ${label.slice(0, 300)}\n  ${diff}`);
console.log(
  `${seeds.length + iterations} inputs (${seeds.length} seeds), ${calls} calls (${throws} throw in @one-ini/wasm ${theirs.version()}): ${diffs.size} differences`,
);
