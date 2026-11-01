---
title: Size
description: Bundle size of each tinyaml entry and the library it replaces, minified and gzipped.
---

![Bundle size, KiB gzip](/charts/size.svg)

Each entry as npm ships it in `dist/`, bundled with esbuild, minified ESM, then gzip -9, from [`scripts/size.ts`](https://github.com/onmax/tinyaml/blob/main/scripts/size.ts). A KiB is 1,024 bytes. Gzip sizes come from the zlib in the official Node builds; a Node linked to another zlib, such as Homebrew's, gives about 1% less.

## All sizes

| Entry                | Minified | Gzip     |
| -------------------- | -------- | -------- |
| `tinyaml`            | 17.4 KiB | 7.9 KiB  |
| `tinyaml/js-yaml`    | 25.7 KiB | 11.4 KiB |
| js-yaml 4            | 42.8 KiB | 14.4 KiB |
| `tinyaml/js-yaml-v5` | 38.3 KiB | 15.7 KiB |
| js-yaml 5            | 56.4 KiB | 17.1 KiB |
| `tinyaml/yaml`       | 35.6 KiB | 15.2 KiB |
| yaml                 | 95.8 KiB | 29.9 KiB |
| `tinyaml/yamljs`     | 18.6 KiB | 8.3 KiB  |
| yamljs               | 28.4 KiB | 8.8 KiB  |
| `tinyaml/std`        | 24.4 KiB | 10.6 KiB |
| @std/yaml            | 35.4 KiB | 11.3 KiB |

The tinyaml entries export everything in the subpath. js-yaml 4 and yamljs are bundled whole, js-yaml 5 with `load`, `loadAll`, `dump`, `Schema` and `YAMLException`, yaml with only `parse` and `stringify`, and @std/yaml with `parse`, `parseAll` and `stringify`.

The parser is one pass over character codes that builds JS values directly, with no tokens or syntax tree in between. Every entry shares it, so a subpath only adds its own value rules, error messages and stringifier. Each entry is built with the branches of one parser mode only: the spec for the root and tinyaml/yaml, js-yaml 4's leniency for tinyaml/js-yaml, tinyaml/yamljs and tinyaml/std, and js-yaml 5's rules for tinyaml/js-yaml-v5. `scripts/size.ts` fails if an entry still holds another mode's code. The parser reports errors as numbered codes, and each entry has its own table of wording, so no bundle carries another library's messages.
