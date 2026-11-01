// parse(stringify(x)) must give x back for any JSON-like value. The values
// are random but seeded, built from pieces YAML gives meaning to: indicators,
// document markers, numbers and the other scalars a plain string could be
// read as, line breaks, byte order marks and non-BMP characters.
// ROUNDTRIP=100000 runs more.
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vite-plus/test";
import { CR_VALUES, iterationsArg } from "../scripts/support.ts";
import { parse, stringify, type StringifyOptions } from "../src/index.ts";
import * as jsYaml from "../src/js-yaml/index.ts";
import * as jsYaml5 from "../src/js-yaml-v5/index.ts";
import * as std from "../src/std/index.ts";
import * as yaml from "../src/yaml/index.ts";
import yamljs from "../src/yamljs/index.ts";

const COUNT = iterationsArg(process.env.ROUNDTRIP, 20000);

// xorshift32, so a failure reproduces from its seed.
function random(seed: number): () => number {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

// prettier-ignore
const PIECES = [
  "a", "b", "1", "0", "9", "-", "?", ":", "[", "]", "{", "}", ",", "&", "*", "#", "!", "|", ">",
  "'", '"', "%", "@", "`", " ", "  ", "\t", "\n", "\r", "\r\n", "\\", "😀", "é", "日本",
  "\uFEFF", "\x85", "\xA0", "\u2028", "\uD800", "\uDC00", "\0", "\x7F", "---", "...", "<<",
  "true", "no", "~", "null", ".inf", ".nan", "1e999", "-1e999", ".5", "-.5", "+1", "0x1F",
  "0o17", "0b11", "1_000", "1:30", "2001-12-14", "1e3", "12345678901234567890",
];
const NUMBERS = [0, -0, 0.5, -0.5, 1e21, 1e-7, 2 ** 53, -1, Infinity, -Infinity, NaN];
const OPTIONS: (StringifyOptions | undefined)[] = [
  undefined,
  undefined,
  undefined,
  { indent: 1 },
  { indent: 3 },
  { indent: 4 },
  { indent: 9 },
  { indent: 10 },
  { refs: false },
  { sortKeys: true },
];

function generate(rand: () => number): (depth?: number) => unknown {
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)]!;
  const text = (): string => {
    // Mostly short, now and then past the 1024 characters of an implicit key.
    const n = rand() < 0.002 ? 400 : Math.floor(rand() * 12);
    let out = "";
    for (let i = 0; i < n; i++) out += pick(PIECES);
    return out;
  };
  const value = (depth = 0): unknown => {
    const kind = Math.floor(rand() * (depth >= 4 ? 4 : 6));
    if (kind === 0) return rand() < 0.5 ? null : rand() < 0.5;
    if (kind === 1) return rand() < 0.5 ? pick(NUMBERS) : Math.round(rand() * 1e9) / 1e3;
    if (kind <= 3) return text();
    if (kind === 4) return Array.from({ length: Math.floor(rand() * 5) }, () => value(depth + 1));
    const map: Record<string, unknown> = {};
    for (let i = Math.floor(rand() * 5); i > 0; i--) {
      // Some keys start like a document marker; `__proto__` must stay a key.
      const key = rand() < 0.1 ? `${pick(["---", "...", "--- ", "... "])}${text()}` : text();
      Object.defineProperty(map, key, {
        value: value(depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return map;
  };
  return value;
}

describe("parse(stringify(x))", () => {
  it(`gives back ${COUNT} random values`, () => {
    const rand = random(0x394218);
    const value = generate(rand);
    const failures: {
      value: unknown;
      options?: StringifyOptions;
      yaml?: string;
      error?: string;
    }[] = [];
    for (let i = 0; i < COUNT; i++) {
      const input = value();
      const options = OPTIONS[i % OPTIONS.length];
      let yaml: string | undefined;
      try {
        yaml = stringify(input, options);
        if (isDeepStrictEqual(parse(yaml), input)) continue;
        failures.push({ value: input, options, yaml });
      } catch (error) {
        failures.push({ value: input, options, yaml, error: String(error) });
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    expect(failures.length).toBe(0);
  });
});

// Carriage returns alone, before line feeds and mixed with them, which a
// writer has to escape or keep as they are; fixed, so they don't depend on
// the random values above. Each entry must read back what it writes.
describe("strings with carriage returns", () => {
  it.each([
    ["tinyaml", stringify, parse],
    ["tinyaml/js-yaml", jsYaml.dump, jsYaml.load],
    ["tinyaml/js-yaml-v5", jsYaml5.dump, jsYaml5.load],
    ["tinyaml/yaml", yaml.stringify, yaml.parse],
    ["tinyaml/yamljs", (value: unknown) => yamljs.stringify(value, 10), yamljs.parse],
    ["tinyaml/std", std.stringify, std.parse],
  ] as [string, (value: unknown) => string, (text: string) => unknown][])(
    "come back from %s",
    (_, write, read) => {
      const failures = CR_VALUES.flatMap((value) => {
        const text = write(value);
        return isDeepStrictEqual(read(text), value) ? [] : [{ value, text }];
      });
      expect(failures).toEqual([]);
    },
  );
});
