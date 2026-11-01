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
+ import JSON5 from "tinyjson5/json5";
+ import ini from "tinyini/ini";
```

## One package per format

Each is published on its own, so you install only what you use.

::packages
::

## Next to what they replace

<!-- automd:drop-ins -->

| You use               | Switch to                          |      Size, gzip |       Parses | Stringifies |
| --------------------- | ---------------------------------- | --------------: | -----------: | ----------: |
| js-yaml 4             | `tinyaml/js-yaml`                  | 14.4 → 11.7 KiB |  1.5× faster | 1.6× faster |
| js-yaml 5             | `tinyaml/js-yaml-v5`               | 17.1 → 16.0 KiB |  1.5× faster | 1.8× faster |
| yaml                  | `tinyaml/yaml`                     | 29.9 → 16.8 KiB | 12.6× faster | 2.8× faster |
| yamljs                | `tinyaml/yamljs`                   |   8.8 → 8.0 KiB |  5.0× faster | 1.1× faster |
| @std/yaml             | `tinyaml/std`                      | 11.3 → 10.7 KiB |  2.0× faster | 1.6× faster |
| json5 2.2.3           | `tinyjson5/json5`                  |   7.6 → 3.2 KiB |  8.1× faster | 5.6× faster |
| json5 1.0.2           | `tinyjson5/json5-v1`               |   8.4 → 3.3 KiB |  8.4× faster | 6.1× faster |
| strip-json-comments 3 | `tinyjson5/strip-json-comments`    |   0.8 → 0.5 KiB |  3.9× faster |           — |
| strip-json-comments 2 | `tinyjson5/strip-json-comments-v2` |   0.7 → 0.5 KiB |  4.1× faster |           — |
| strip-json-comments 5 | `tinyjson5/strip-json-comments-v5` |   0.6 → 0.6 KiB |  3.9× faster |           — |
| jsonc-parser 3.3.1    | `tinyjson5/jsonc-parser`           |   6.6 → 5.7 KiB |  1.2× faster |           — |
| comment-json 4.6.2    | `tinyjson5/comment-json`           | 35.7 → 18.4 KiB |  1.6× faster | 1.7× faster |
| jju 1.4.0             | `tinyjson5/jju`                    |   9.8 → 9.7 KiB |  1.2× faster | 1.6× faster |
| ini 7.0.0             | `tinyini/ini`                      |   1.6 → 1.5 KiB |  1.4× faster | 2.2× faster |
| ini 2.0.0             | `tinyini/ini-v2`                   |   1.4 → 1.4 KiB |  1.7× faster | 1.4× faster |
| ini 1.3.8             | `tinyini/ini-v1`                   |   1.4 → 1.4 KiB |  1.3× faster | 1.3× faster |
| @one-ini/wasm 0.2.1   | `tinyini/one-ini`                  |  36.2 → 1.7 KiB | 13.1× faster |           — |
| @one-ini/wasm 0.1.1   | `tinyini/one-ini-v0.1`             |  32.5 → 1.7 KiB | 14.7× faster |           — |

Starting fresh with YAML? The root `tinyaml` API is the smallest of all: 7.8 KiB, 1.8× smaller than js-yaml 4 and 3.8× smaller than yaml. It parses 19.3× faster than yaml and stringifies 12.5× faster.

Size is the minified bundle, gzipped. Speed is the median time to parse and stringify each package's large benchmark file. @one-ini/wasm's size adds its .wasm file, gzipped, and its speed is parse_to_uint32array on a 100 KB .editorconfig. Measured on Apple M4, Node 26.13 (tinyaml) and AMD Ryzen 7 255 w/ Radeon 780M Graphics, Node 24.21.0 (tinyjson5, tinyini).

<!-- /automd -->

## Questions

::accordion
:::accordion-item{label="How close is each package to the library it replaces?"}
Each one runs the original library's own tests and is compared with it on fuzzed inputs: 1 million for tinyjson5, 6 million calls for tinyini, and every yaml-test-suite case plus thousands of edits for tinyaml. Each package's compatibility page lists every known difference: [tinyaml](/tinyaml/guide/switching/), [tinyjson5](/tinyjson5/compatibility/), [tinyini](/tinyini/compatibility/).
:::

:::accordion-item{label="Can I load them with require()?"}
Yes. All three ship ESM only, and Node 22.12 and later load ESM from `require()`. Bundlers handle them too.
:::

:::accordion-item{label="Why are they faster?"}
Each parser reads character codes in one pass and builds JavaScript values directly, without a tokenizer or a syntax tree in between. tinyjson5's ports of jsonc-parser, comment-json and jju keep the scanner or tokenizer their API exposes, and are faster at it.
:::

:::accordion-item{label="How are the numbers measured?"}
With scripts in the repository that you can rerun. Each package has a page with the commands: [tinyaml](/tinyaml/numbers/reproduce/), [tinyjson5](/tinyjson5/develop/), [tinyini](/tinyini/develop/).
:::
::
