---
title: Linter
description: Check YAML the way tinyaml loads it, from the command line, as a library, in ESLint or in Vite Doctor.
---

The linter checks YAML files the way tinyaml loads them. It reports YAML tinyaml can't load, with the line and column, and plain values that load as strings here but that other YAML readers take for a boolean, null, a number, or a date.

It runs from the command line, as a library, as an [ESLint](./eslint.md) plugin, or as a [Vite Doctor](./vite-doctor.md) extension. It all ships with tinyaml. The command line and the library need nothing else, and the ESLint plugin and the Vite Doctor extension need ESLint or Vite Doctor installed.

## Command line

```sh
pnpm add -D tinyaml
pnpm tinyaml-lint "**/*.{yaml,yml}"
```

It prints one line per problem and exits with 1 if there are any:

```txt
config.yaml:1:8 tinyaml/ambiguous-value `no` loads as the string "no", but YAML 1.1 readers such as PyYAML read it as a boolean. Quote it to keep the string, or write `true` or `false`.
site.yaml:3:13 tinyaml/invalid-yaml tinyaml can't load this YAML: duplicated mapping key. Fix the YAML at this position.
```

Globs skip `node_modules` and `dist`. `--format json` prints the problems as a JSON array instead.

## Library

```ts
import { lint } from "tinyaml/linter";

lint("draft: no\n");
// [{ rule: "tinyaml/ambiguous-value", severity: "warn", line: 1, column: 8, message: "…", fix: "…" }]
```

`lint` takes one YAML stream and never throws. `lintFiles(files, read)` lints several files, reading each one with `read`. `rules` maps each rule to its Vite Doctor code, title, and severity.

## Rules

| Rule                                                 | Code          | Severity | Reports                                                 |
| ---------------------------------------------------- | ------------- | -------- | ------------------------------------------------------- |
| [`tinyaml/invalid-yaml`](#tinyamlinvalid-yaml)       | `TINYAML0001` | error    | YAML tinyaml can't load                                 |
| [`tinyaml/ambiguous-value`](#tinyamlambiguous-value) | `TINYAML0002` | warning  | A plain value other YAML readers don't read as a string |

### `tinyaml/invalid-yaml`

tinyaml throws on this YAML, so `parse` and `parseAll` fail. The linter reports tinyaml's message at the line and column it names.

```yaml
# ❌ the second `title` throws `duplicated mapping key`
title: Hello
title: World
```

```yaml
# ✅
title: Hello
```

### `tinyaml/ambiguous-value`

tinyaml reads YAML with the YAML 1.2 core schema. Other readers turn more plain values into something else: js-yaml's default schema reads `0b10`, `1_000`, and `2026-11-01` as numbers and dates, and YAML 1.1 readers such as PyYAML read `yes`, `no`, `on`, and `off` as booleans. The same file gives different data depending on who reads it. Values tinyaml already parses as booleans, null, or numbers, such as `True`, `~`, `0x10`, and `.inf`, are not reported.

```yaml
# ❌ a string here, a boolean in PyYAML
draft: no
```

```yaml
# ✅ the same in every reader
draft: false
title: "no"
```

Quote the value to keep the string, or write the JSON value you meant. Quoted values, block scalars, and comments are never reported.
