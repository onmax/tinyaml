import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { MODES } from "../vite.config.ts";
import { build, ENTRIES } from "../scripts/dist.ts";
import * as codes from "../src/core/codes.ts";
import { MESSAGES as english } from "../src/core/messages.ts";
import { MESSAGES as jsYaml } from "../src/js-yaml/messages.ts";
import { MESSAGES as jsYaml5 } from "../src/js-yaml-v5/messages.ts";
import { MESSAGES as std } from "../src/std/messages.ts";
import { MESSAGES as yaml } from "../src/yaml/messages.ts";

// A table that skips or adds a line words every later code wrongly.
describe("message tables", () => {
  it.each(Object.entries({ english, jsYaml, jsYaml5, std, yaml }))(
    "%s has a line per error code",
    (_, table) => expect(table).toHaveLength(Math.max(...Object.values(codes)) + 1),
  );
});

// The codes an entry's built parser passes to `fail`, `bend`, `warn` or
// `decode`, where a mode's build empties the lines of the codes it can't
// raise: as literals, or the outcomes of a conditional.
function raised(code: string): Set<number> {
  const found = new Set<number>();
  for (const call of code.matchAll(/\b(fail|bend|warn|decode)\(/g)) {
    // The arguments, with a NUL for each comma between them.
    let text = "";
    for (let i = call.index + call[0].length, depth = 1; ; i++) {
      depth += +(code[i] === "(") - +(code[i] === ")");
      if (!depth) break;
      text += depth === 1 && code[i] === "," ? "\0" : code[i];
    }
    const arg = text.split("\0")[call[1] === "decode" ? 1 : 0];
    for (const part of arg?.split(/[?:]/) ?? []) if (/^\s*\d+\s*$/.test(part)) found.add(+part);
  }
  return found;
}

// Codes an entry's engine words itself, or never meets.
const OWN: Record<string, number[]> = {
  // std words an ill-formed %TAG handle from the directive's arguments.
  std: [codes.TAG_HANDLE],
  // yaml words its directive and anchor warnings where they're raised.
  yaml: [codes.YAML_UNSUPPORTED, codes.ANCHOR_COLON],
  // yamljs drops a %YAML line or quotes it as text, so no directive reaches the parser.
  yamljs: [codes.YAML_VERSION],
};

// The built dist/, where a mode's constants empty lines of the table: a line
// emptied for a code the mode still raises throws a reason of "". The linter's
// entries reuse the root's parser, so only the parser entries are scanned.
const PARSERS = Object.values(MODES).flatMap((entries) => Object.keys(entries));
describe("built entries", () => {
  build();
  it.each(Object.entries(ENTRIES).filter(([name]) => PARSERS.includes(name)))(
    "%s words every error its parser raises",
    (name, file) => {
      const entry = readFileSync(file, "utf8");
      const chunk = /from "\.\/(parse-[\w-]+\.mjs)"/.exec(entry)?.[1];
      const table = /\bMESSAGES = `([^`]*)`/.exec(entry)?.[1]?.split("\n");
      expect(chunk && table, name).toBeTruthy();
      const found = raised(readFileSync(join(dirname(file), chunk!), "utf8"));
      // Every parser rejects a null byte, so the scan still finds its codes.
      expect(found).toContain(codes.NULL_BYTE);
      const unworded = [...found].filter((code) => !table![code] && !OWN[name]?.includes(code));
      const names = Object.keys(codes) as (keyof typeof codes)[];
      expect(unworded.map((code) => names.find((key) => codes[key] === code))).toEqual([]);
    },
  );
});
