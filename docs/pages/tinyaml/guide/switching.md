---
title: Switching from another library
description: Change one import to move from js-yaml, yaml, yamljs or @std/yaml, and what each drop-in does differently.
---

Each subpath exports the functions, options and types of the library it replaces, apart from the gaps listed below, so switching is a change to the import line. The sizes are esbuild bundles of the published files, minified, then gzip -9. The last column is that library's own test suite, run with tinyaml in its place.

| Library         | Change the import to   | Size, gzip      | Its own tests on tinyaml |
| --------------- | ---------------------- | --------------- | ------------------------ |
| js-yaml 4.3.2   | `"tinyaml/js-yaml"`    | 14.4 → 11.4 KiB | 301 of 304 pass          |
| js-yaml 5.5.0   | `"tinyaml/js-yaml-v5"` | 17.1 → 15.7 KiB | 1,023 of 1,646 pass      |
| yaml 2.9.1      | `"tinyaml/yaml"`       | 29.9 → 15.2 KiB | 195 of 220 pass          |
| yamljs 0.3.0    | `"tinyaml/yamljs"`     | 8.8 → 8.3 KiB   | 103 of 103 pass          |
| @std/yaml 1.3.0 | `"tinyaml/std"`        | 11.3 → 10.6 KiB | 92 of 95 pass            |

```ts
// before
import yaml from "js-yaml";
// after
import yaml from "tinyaml/js-yaml";
```

Of js-yaml 5's 1,646 tests, 610 call the events and AST API that tinyaml/js-yaml-v5 leaves out, and js-yaml 5 skips 13 itself. The other 1,023 pass. yaml's five test files that cover `parse` and `stringify` hold 531 tests, and the 220 counted are the ones that call tinyaml. The rest test yaml's Document API.

For yamljs and @std/yaml the swap saves less than 1 KiB. The bigger change is the parser. On the yaml-test-suite, tinyaml/yamljs loads 144 cases that yamljs throws on, and in 39 where the two disagree only tinyaml/yamljs matches the suite.

Every subpath runs the same parser code as the root. The details below list each known difference from the original.

## js-yaml 4: what's different

- The `listener` option isn't supported. It accounts for 2 of the 3 tests that don't pass. js-yaml skips the third test itself.
- `safeLoad`, `safeLoadAll` and `safeDump` work and do what `load`, `loadAll` and `dump` do. js-yaml 4 throws for them.
- js-yaml's tests make 746 calls to `load`, `loadAll` and `dump`. Replayed through tinyaml, 737 give the same result. 8 throw the same error at a different position, and 1 throws with a different message. tinyaml throws in every case js-yaml does.
- On the yaml-test-suite, 399 of 402 cases give the same result as js-yaml. 1 is valid YAML that tinyaml loads and js-yaml rejects ([9KAX](https://github.com/yaml/yaml-test-suite/tree/data-2022-01-17/9KAX)). The other 2 are js-yaml bugs tinyaml doesn't copy: js-yaml drops a tag on its own line above a less indented block scalar ([M5C3](https://github.com/yaml/yaml-test-suite/tree/data-2022-01-17/M5C3)), and it loads the invalid [H7J7](https://github.com/yaml/yaml-test-suite/tree/data-2022-01-17/H7J7).
- 5,000 randomly edited suite inputs: none load to a different value, none throw only in tinyaml, and 12 load where js-yaml throws, 2 of them invalid YAML. 5,000 random values give matching outcomes, including matching errors: 4,021 dump to the same text and 979 throw the same error.

## js-yaml 5: what's different

- Only the load and dump API: `load`, `loadAll`, `dump`, `YAMLException`, `Schema`, the schemas, the tag definitions and the style constants. The events, AST, presenter and visit API isn't there: `parseEvents`, `getScalarValue`, `constructFromEvents`, `eventsToAst`, `jsToAst`, `present`, `visit`, and the `EVENT_*`, `VISIT_*` and `CHOMPING_*` constants.
- `dump`'s `transform` option works. `dump` builds the same AST as js-yaml 5 and passes it to `transform`, but there is no `visit` to walk it with.
- js-yaml 5's tests make 10,085 calls to `load`, `loadAll` and `dump`, 5,256 of them different in function, input or options. Replayed through tinyaml, 5,199 of those 5,256 give the same result. 31 throw the same error at a different position, and 25 throw with a different message. tinyaml throws in every case js-yaml 5 does.
- The one call that loads to a different value is an empty key tagged `!!merge` with `mergeTag` in the schema, `? !!merge\n: []`. js-yaml 5 loads `{}`, and tinyaml loads `{ "<<": [] }`.
- On the yaml-test-suite, all 402 cases give the same result as js-yaml 5. Both reject 126, and 107 of those throw the same message.
- 5,000 randomly edited suite inputs: none load to a different value, and 2 load where js-yaml 5 throws. 5,000 random values give matching outcomes, including matching errors: 3,584 dump to the same text and 1,416 throw the same error.

## yaml: what's different

- Only `parse` and `stringify`. There is no `parseDocument`, `parseAllDocuments`, Document, CST, Lexer, Parser, Composer, LineCounter or visitor API.
- `parse` doesn't support `mapAsMap`, `stringKeys`, `strict: false` (which `strict: undefined` also means to yaml), or recovering from errors with `logLevel: "silent"`. Collection keys are turned into strings that don't always match yaml's.
- A lone carriage return is a line break, as the YAML spec has it. yaml reads it as text, so `- a\r- b` is `["a", "b"]` where yaml gives `["a\r- b"]`. Error positions count such input as one line, as yaml's do.
- `stringify` doesn't take Document or Node values, writes no comments, and doesn't use `customTags` or the YAML 1.1 `!!set`, `!!omap` and `!!binary` tags.
- The upstream run covers yaml's tests of `parse` and `stringify`, the `stringify`, `parse`, `errors`, `types` and `anchors` files in `tests/doc/`. Of the 25 that fail, 4 are `logLevel` tests that fail against yaml itself under Vitest, and 13 use the features above. 5 stringify with `indent: 1`, `indent: 4` or `indentSeq: false`, where the output differs. The last 3 are parse cases: a merge key missing its space, which throws another message, carriage returns inside double quotes, and a collection key in an alias expansion test with the limits turned off.
- Across 7 option sets on the yaml-test-suite, 2,584 of 2,814 runs agree with yaml.
- 5,000 randomly edited suite inputs: 1,943 give the same value and the same warnings. 2 more throw the same error with fewer warnings: tinyaml throws for an unknown alias as it reads it, and yaml only after warning about what follows. 2,941 throw in both: 43 the same error, 827 another error code, and the rest the same code at another position or with another message, since tinyaml marks one character where yaml marks the whole token, and words most errors as js-yaml 4 does. 36 load to a different value, 20 of those with a collection key. 48 load only in tinyaml and 30 only in yaml. Lone carriage returns, which yaml reads as text, cause most of these: all 16 other values without a collection key, 39 of the 48 and 22 of the 30. 5,000 random values: 4,932 stringify to the same text, 68 throw the same error, none differ.

## yamljs: what's different

`stringify` writes what yamljs writes, byte for byte. `parse` gives yamljs's values but reads structure as YAML does where yamljs's result is broken:

- Multi-line plain and quoted scalars fold line breaks to spaces, and folded block scalars keep more-indented lines. `a: x\n  y` is `"x y"`, where yamljs gives `"x\ny"`.
- `- - a` is `[["a"]]`, where yamljs gives `["- a"]`. `- ? a` is `[{ a: null }]`, where yamljs gives `["? a"]`.
- Flow mapping keys are read whole: `{a b: 1}` is `{ "a b": 1 }`, where yamljs gives `{ a: "b: 1" }`.
- `\x`, `\u` and `\U` escapes give the character, not its UTF-8 bytes.
- Block scalars keep trailing spaces on their last line.
- Quoted strings stay strings. `['*a']` is `["*a"]` and `!!str "x"` is `"x"`, where yamljs gives `[undefined]` and `'"x"'`.
- A comment line is never read as a value or key.
- Errors are `ParseException`s with the root's messages.

On the yaml-test-suite's 402 cases, 186 give the same result as yamljs, and 144 load where yamljs throws. In 39 the values differ and only tinyaml/yamljs matches the suite. In 33 neither matches or the case is invalid YAML. There is no case where only yamljs is right. 5,000 random values give matching outcomes, including matching errors: 4,994 dump to the same text and 6 throw the same error.

## @std/yaml: what's different

- `unstable_parse` and `unstable_stringify` aren't supported. They account for 2 of the 3 tests that don't pass. The third starts a Deno subprocess, which can't run under Node.
- On the yaml-test-suite, 360 of 402 cases give the same result as std, 99 of them the same error message. 11 parse where std throws. The other 31 differ, and in all 31 std's own result is wrong by the suite's answers.
- 5,000 randomly edited suite inputs: 117 parse to a different value, 146 throw only in tinyaml, and 49 parse where std throws, so values or acceptance differ in 312 of them, 6.2%. 2,865 throw in both, 2,527 of them with the same message and 2,556 with the same message apart from the position.
- 5,000 random values give matching outcomes, including matching errors: 3,499 stringify to the same text and 1,501 throw the same error.
