// Compares tinyjson5's identifier and whitespace tests with json5 2.2.3's
// generated Unicode 10 tables for every code point, lone surrogates included,
// and prints the code points where they disagree as ranges.
// Usage: node scripts/unicode.ts
import { createRequire } from "node:module";
import { isIdContinue, isIdStart } from "../src/unicode.ts";

const util = createRequire(import.meta.url)("json5/lib/util.js") as Record<
  "isIdStartChar" | "isIdContinueChar" | "isSpaceSeparator",
  (c: string) => boolean
>;
const SPACE = /\p{Zs}/u;

function compare(name: string, theirs: (c: string) => boolean, ours: (cp: number) => boolean) {
  const ranges: [number, number, boolean][] = [];
  let count = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const a = theirs(String.fromCodePoint(cp));
    const b = ours(cp);
    if (a === b) continue;
    count++;
    const last = ranges.at(-1);
    if (last && last[1] === cp - 1 && last[2] === b) last[1] = cp;
    else ranges.push([cp, cp, b]);
  }
  const hex = (cp: number) => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
  console.log(`${name}: ${count} code points differ in ${ranges.length} ranges`);
  for (const [from, to, accepted] of ranges)
    console.log(
      `  ${from === to ? hex(from) : `${hex(from)}..${hex(to)}`} ${accepted ? "only tinyjson5" : "only json5"}`,
    );
}

console.log(`Unicode in this engine: ${process.versions.unicode}`);
compare("ID_Start", util.isIdStartChar, isIdStart);
compare("ID_Continue", util.isIdContinueChar, isIdContinue);
// The parser hard-codes json5's space list; check it against today's Zs.
compare(
  "Space_Separator",
  util.isSpaceSeparator,
  (cp) => cp !== 32 && cp !== 0xa0 && SPACE.test(String.fromCodePoint(cp)),
);
