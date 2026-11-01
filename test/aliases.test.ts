// An alias is the anchored node itself, not a copy: in every library tinyaml
// replaces, a change made through one reference shows through the others.
// A copy has the same value, so value comparisons alone wouldn't notice
// one; each entry is checked here, and the original alongside it.
import { createRequire } from "node:module";
import * as std from "@std/yaml";
import * as jsYaml from "js-yaml";
import * as jsYaml5 from "js-yaml5";
import * as yaml from "yaml";
import { describe, expect, it } from "vite-plus/test";
import * as tiny from "../src/index.ts";
import * as tinyJsYaml from "../src/js-yaml/index.ts";
import * as tinyJsYaml5 from "../src/js-yaml-v5/index.ts";
import * as tinyStd from "../src/std/index.ts";
import * as tinyYaml from "../src/yaml/index.ts";
import tinyYamljs from "../src/yamljs/index.ts";

const yamljs = createRequire(import.meta.url)("yamljs") as typeof tinyYamljs;

const input = `base: &base {x: 1}
copy: *base
list: &list [1, 2]
items:
  - *list
  - *list
block: &block
  y: 2
again: *block
`;

interface Doc {
  base: { x: number };
  copy: { x: number };
  list: number[];
  items: number[][];
  block: { y: number };
  again: { y: number };
}

function shares(doc: Doc) {
  expect(doc.copy).toBe(doc.base);
  expect(doc.items[0]).toBe(doc.list);
  expect(doc.items[1]).toBe(doc.list);
  expect(doc.again).toBe(doc.block);
  doc.copy.x = 2;
  expect(doc.base).toEqual({ x: 2 });
  doc.items[1]!.push(3);
  expect(doc.list).toEqual([1, 2, 3]);
  doc.again.y = 3;
  expect(doc.block).toEqual({ y: 3 });
}

const entries: [string, Record<string, (text: string) => unknown>][] = [
  ["tinyaml", { parse: tiny.parse, parseAll: (text) => tiny.parseAll(text)[0] }],
  ["js-yaml 4", { load: jsYaml.load, loadAll: (text) => jsYaml.loadAll(text)[0] }],
  ["tinyaml/js-yaml", { load: tinyJsYaml.load, loadAll: (text) => tinyJsYaml.loadAll(text)[0] }],
  ["js-yaml 5", { load: jsYaml5.load, loadAll: (text) => jsYaml5.loadAll(text)[0] }],
  [
    "tinyaml/js-yaml-v5",
    { load: tinyJsYaml5.load, loadAll: (text) => tinyJsYaml5.loadAll(text)[0] },
  ],
  ["yaml", { parse: yaml.parse }],
  ["tinyaml/yaml", { parse: tinyYaml.parse }],
  ["yamljs", { parse: yamljs.parse }],
  ["tinyaml/yamljs", { parse: tinyYamljs.parse }],
  ["@std/yaml", { parse: std.parse, parseAll: (text) => std.parseAll(text)[0] }],
  [
    "tinyaml/std",
    { parse: tinyStd.parse, parseAll: (text) => (tinyStd.parseAll(text) as unknown[])[0] },
  ],
];

describe.each(entries)("%s", (_, functions) => {
  it.each(Object.entries(functions))("%s gives each alias the anchored object", (_, parse) =>
    shares(parse(input) as Doc),
  );
});
