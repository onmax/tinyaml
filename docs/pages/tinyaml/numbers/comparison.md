---
title: How it compares
description: Schema, merge keys, tags, documents, errors, dependencies and size, library by library.
---

|                        | tinyaml          | js-yaml 4           | js-yaml 5                      | yaml                   | yamljs               | @std/yaml                      |
| ---------------------- | ---------------- | ------------------- | ------------------------------ | ---------------------- | -------------------- | ------------------------------ |
| YAML 1.2 core schema   | ✅               | ✅                  | ✅                             | ✅                     | ❌ `0o17` reads as 0 | partial, `0o17` stays a string |
| Merge keys (`<<`)      | ✅ on by default | ✅                  | ✅ `mergeTag`                  | ✅ `merge: true`       | ✅                   | ✅                             |
| Custom tags            | ✅ `tags`        | ✅ `Type`, `Schema` | ✅ `defineScalarTag`, `Schema` | ✅ `customTags`        | ✅ `objectDecoder`   | ❌ in `parse`                  |
| Unknown tags           | keeps the value  | throws              | throws                         | keeps the value        | becomes `null`       | throws                         |
| Anchors and aliases    | ✅               | ✅                  | ✅                             | ✅                     | ✅                   | ✅                             |
| Multiple documents     | ✅ `parseAll`    | ✅ `loadAll`        | ✅ `loadAll`                   | ✅ `parseAllDocuments` | ❌ merged into one   | ✅ `parseAll`                  |
| Error line and column  | ✅ 1-based       | ✅ 0-based `mark`   | ✅ 0-based `mark`              | ✅ `linePos`           | partial, line only   | ✅                             |
| Dependencies           | 0                | 1, argparse         | 1, argparse                    | 0                      | 2, argparse and glob | 0                              |
| ESM                    | ✅ ESM only      | ✅ and CommonJS     | ✅ and CommonJS                | ✅ and CommonJS        | ❌ CommonJS only     | ✅ ESM only                    |
| TypeScript types       | ✅ built in      | `@types/js-yaml`    | ✅ built in                    | ✅ built in            | `@types/yamljs`      | ✅ built in                    |
| Browser and edge       | ✅               | ✅                  | ✅                             | ✅                     | ✅                   | ✅                             |
| yaml-test-suite, valid | 279 of 279       | 244 of 264          | 263 of 263                     | 276 of 279             | 97 of 256            | 217 of 264                     |
| Size, gzip             | 7.9 KiB          | 14.4 KiB            | 17.1 KiB                       | 29.9 KiB               | 8.8 KiB              | 11.3 KiB                       |

The schema, merge, tag, document and error rows come from parsing the same inputs with each library's default options. A cell that names an option, like `mergeTag` or `merge: true`, needs that option. The others are defaults. The suite row is the first column of the [correctness table](/tinyaml/numbers/correctness/), which leaves out cases refused for an unknown tag and, for yamljs, streams without exactly one document. yaml's size is `parse` and `stringify` only, and js-yaml 5's is `load`, `loadAll`, `dump`, `Schema` and `YAMLException`.
