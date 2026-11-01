---
title: tiny
description: Smaller, faster drop-ins for js-yaml, yaml, yamljs, @std/yaml, json5 and ini.
headline: Smaller, faster parsers. Same API.
tagline: Drop-in replacements for the YAML, JSON5 and INI libraries you already use, with no dependencies. Change one import and keep your code.
install: pnpm add tinyaml tinyjson5 tinyini
---

```diff [config.ts]
- import yaml from "js-yaml";
- import JSON5 from "json5";
- import ini from "ini";
+ import yaml from "tinyaml/js-yaml";
+ import JSON5 from "tinyjson5";
+ import ini from "tinyini";
```

## One package per format

Each is published on its own, so you install only what you use.

::packages
::

## Next to what they replace

How many times smaller each drop-in is, gzipped, and how many times faster it parses each package's large benchmark file.

![Each drop-in next to the library it replaces](/drop-ins.svg)

## Questions

::accordion
:::accordion-item{label="How close is each package to the library it replaces?"}
Each one runs the original library's own tests and is compared with it on fuzzed inputs: 1 million for tinyjson5, 6 million calls for tinyini, and every yaml-test-suite case plus thousands of edits for tinyaml. Each package's compatibility page lists every known difference: [tinyaml](/tinyaml/guide/switching/), [tinyjson5](/tinyjson5/compatibility/), [tinyini](/tinyini/compatibility/).
:::

:::accordion-item{label="Can I load them with require()?"}
Yes. All three ship ESM only, and Node 22.12 and later load ESM from `require()`. Bundlers handle them too.
:::

:::accordion-item{label="Why are they faster?"}
Each parser reads character codes in one pass and builds JavaScript values directly, without a tokenizer or a syntax tree in between.
:::

:::accordion-item{label="How are the numbers measured?"}
With scripts in the repository that you can rerun. Each package has a page with the commands: [tinyaml](/tinyaml/numbers/reproduce/), [tinyjson5](/tinyjson5/develop/), [tinyini](/tinyini/develop/).
:::
::
