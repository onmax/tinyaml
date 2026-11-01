// Fuzzes each published ini version against the next one, to find which
// versions behave the same, and so which need an entry of their own. It
// installs the versions into .cache/versions the first time. Each pair is
// compared on the parse fuzzer's kind of inputs (decode with and without
// bracketedArray: false, safe and unsafe) and on random values through
// encode with each option, the options object afterwards included, once as
// loaded here and once loaded with process.platform set to "win32". Then
// encode once more where there is no `process`. Each call runs with the
// built-ins put back afterwards, since ini 1.3.5 and before write a
// [__proto__] section's keys to Object.prototype.
// Usage: node scripts/versions.ts [inputs] [version,version,...]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { generator } from "./values.ts";
import { attempt, iniInputs, restoreBuiltIns, samples, seeded } from "./shared.ts";

const VERSIONS =
  "1.3.4,1.3.5,1.3.7,1.3.8,2.0.0,3.0.0,3.0.1,4.0.0,4.1.0,4.1.1,4.1.2,4.1.3,5.0.0,6.0.0,7.0.0";
const iterations = Number(process.argv[2] ?? 20000);
const versions = (process.argv[3] ?? VERSIONS).split(",");

const dir = ".cache/versions";
if (!versions.every((v) => existsSync(`${dir}/node_modules/ini-${v}`))) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/package.json`, '{ "private": true }\n');
  const specs = VERSIONS.split(",").map((v) => `ini-${v}@npm:ini@${v}`);
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", ...specs], {
    cwd: dir,
    stdio: "inherit",
  });
}
const require = createRequire(new URL(`../${dir}/package.json`, import.meta.url));
const libs = versions.map((v) => require(`ini-${v}`));

/**
 * Each version loaded again with process.platform set to "win32": ini 1.x to
 * 4.0.0 pick their line endings when they load, and ignore the `platform`
 * option ini 4.1 added.
 */
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
Object.defineProperty(process, "platform", { value: "win32" });
const win32 = versions.map((v) => {
  const id = require.resolve(`ini-${v}`);
  delete require.cache[id];
  const lib = require(id);
  delete require.cache[id];
  return lib;
});
Object.defineProperty(process, "platform", platform);

/** What each version's encode does where there is no `process`, as in a browser. */
const noProcess = versions.map((v) => {
  const module = { exports: {} as any };
  const source = readFileSync(require.resolve(`ini-${v}`), "utf8");
  return attempt(() => {
    runInNewContext(`(function (module, exports) {${source}\n})`)(module, module.exports);
    return module.exports.encode({ a: [1], b: { c: 2 } });
  });
});

const next = seeded(7);
const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
const seeds = [...iniInputs(), ...samples()];
const generate = generator(seeded(2));
const latest = require("ini-7.0.0");
while (seeds.length < 400) {
  try {
    const text = latest.encode(generate(), {
      whitespace: next() < 0.5,
      bracketedArray: next() < 0.7,
      section: pick([undefined, "pre", "a.b"]),
    });
    if (text.length > 2) seeds.push(text);
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
  "\\.",
  ".",
  '"',
  "'",
  "\n",
  "\r\n",
  " ",
  "\t",
  " ",
  " ",
  "﻿",
  "a",
  "0",
  "true",
  "null",
  "__proto__",
  "constructor",
  "toString",
  "'1'",
  "[a]",
  "[a.b]",
  "[a\\.b]",
  "a=1",
  "a[]=1",
  "\n[",
  "]\n",
  "  \n",
  "] ",
  "\u0001",
  "\u0002LITERAL\\1LITERAL\u0002",
];
const inputs = [...seeds];
for (let i = 0; i < iterations; i++) {
  let input = pick(seeds);
  for (let edits = 1 + Math.floor(next() * 4); edits > 0; edits--) {
    const at = Math.floor(next() * (input.length + 1));
    const r = next();
    if (r < 0.5) input = input.slice(0, at) + pick(pieces) + input.slice(at);
    else if (r < 0.75) input = input.slice(0, at) + input.slice(at + 1 + Math.floor(next() * 3));
    else input = input.slice(0, at) + pick(pieces) + input.slice(at + 1);
  }
  inputs.push(input);
}
const encodeOptions: unknown[] = [
  undefined,
  { whitespace: true },
  "sec",
  { section: "a.b" },
  { bracketedArray: false },
  { align: true },
  { sort: true },
  { newline: true, section: "s" },
  { platform: "win32" },
];
const values = Array.from({ length: Math.max(200, iterations / 20) }, generate);
const copy = (o: unknown) => (o && typeof o === "object" ? { ...o } : o);

for (let v = 1; v < libs.length; v++) {
  const [a, b] = [libs[v - 1], libs[v]];
  const [winA, winB] = [win32[v - 1], win32[v]];
  const counts = new Map<string, number>();
  const examples = new Map<string, string>();
  // ini 1.3.5 and before write a [__proto__] section's keys to
  // Object.prototype, so each call runs with the built-ins put back after it.
  const compare = (kind: string, input: unknown, fa: () => unknown, fb: () => unknown) => {
    const x = JSON.stringify(restoreBuiltIns(() => attempt(fa)));
    const y = JSON.stringify(restoreBuiltIns(() => attempt(fb)));
    if (x === y) return;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    const example = `${JSON.stringify(input)}\n      ${x.slice(0, 160)}\n      ${y.slice(0, 160)}`;
    if (!examples.has(kind) || example.length < examples.get(kind)!.length)
      examples.set(kind, example);
  };
  for (const input of inputs) {
    compare(
      "decode",
      input,
      () => a.decode(input),
      () => b.decode(input),
    );
    const off = () => ({ bracketedArray: false });
    compare(
      "decode, bracketedArray: false",
      input,
      () => a.decode(input, off()),
      () => b.decode(input, off()),
    );
    compare(
      "unsafe",
      input,
      () => a.unsafe(input),
      () => b.unsafe(input),
    );
    compare(
      "safe",
      input,
      () => a.safe(input),
      () => b.safe(input),
    );
  }
  for (const value of values)
    for (const o of encodeOptions) {
      const [oa, ob] = [copy(o), copy(o)];
      compare(
        `encode ${JSON.stringify(o)}`,
        value,
        () => [a.encode(value, oa), oa],
        () => [b.encode(value, ob), ob],
      );
      const [wa, wb] = [copy(o), copy(o)];
      compare(
        `encode ${JSON.stringify(o)}, loaded on win32`,
        value,
        () => [winA.encode(value, wa), wa],
        () => [winB.encode(value, wb), wb],
      );
    }
  compare(
    "encode with no process",
    "{ a: [1], b: { c: 2 } }",
    () => noProcess[v - 1],
    () => noProcess[v],
  );
  const same = counts.size === 0 ? "the same" : "different";
  console.log(
    `ini ${versions[v - 1]} -> ${versions[v]}: ${same} on ${inputs.length} inputs and ${values.length} values`,
  );
  for (const [kind, n] of counts)
    console.log(`  ${kind}: ${n} differ, such as\n      ${examples.get(kind)}`);
}
