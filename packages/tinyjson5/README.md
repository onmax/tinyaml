<h1>
  <img src="./.github/banner.svg" alt="tinyjson5" width="100%">
</h1>

<!-- automd:comark-badges name=tinyjson5 size=size -->
<!-- /automd -->

**JSON5 for JavaScript in 3.4 KiB.** No dependencies, json5 3's rules before json5 3 is out, and strict JSON with comments with one option.

Already on a JSON5 or JSONC library? Change one import and keep your code:

```diff
- import JSON5 from "json5";
+ import JSON5 from "tinyjson5/json5";
```

tinyjson5 ships drop-in replacements for json5 2 and 1, strip-json-comments 3, 2 and 5, jsonc-parser, comment-json and jju. Each one is smaller and faster than the library it replaces, passes that library's own tests, and gives the same result on a million fuzzed inputs.

<!-- automd:drop-ins package=tinyjson5 -->
<!-- /automd -->

[Get started](#get-started) · [Switching](#switching-from-another-library) · [Size](#size) · [Speed](#speed) · [API](#api) · [Develop](#develop)

An independent project by [@onmax](https://github.com/onmax).

## Get started

```sh
pnpm add tinyjson5
```

npm holds only a 0.0.0 placeholder under this name until the first release. Until then, clone this repository and run `pnpm install` and `pnpm build` to get the package in `dist/`.

```ts
import JSON5, { parse, stringify } from "tinyjson5";

parse("{name: 'app', tags: ['a', 'b',], /* comment */ size: 0x10}");
// { name: "app", tags: ["a", "b"], size: 16 }
parse('// tsconfig\n{"strict": true}', { jsonc: true }); // { strict: true }
parse("9007199254740993", { bigint: true }); // 9007199254740993n
stringify({ name: "app", "a-b": [1, NaN] }); // "{name:'app','a-b':[1,NaN]}"
stringify({ a: 1 }, null, 2); // "{\n  a: 1,\n}"
JSON5.parse("[1, 2]"); // [1, 2]
```

The root follows [json5](https://github.com/json5/json5)'s main branch, which holds json5 3 before its release, and adds a strict JSONC mode. Where json5 2 and JSON differ, it does what `JSON.parse` and `JSON.stringify` do:

- No `console.warn`. json5 2 warns about U+2028 and U+2029 in strings.
- The reviver walks own keys, as `JSON.parse`'s does, and a property it can't update stays as it is instead of throwing.
- Error positions count `\r`, `\r\n`, U+2028 and U+2029 as line breaks, and an error on a line break is reported on the line it ends.
- `{ bigint: true }` returns integers outside the safe range as BigInts.
- `stringify` throws on a BigInt, takes only `'` or `"` as `quote`, escapes lone surrogates, writes keys with identifier characters above U+FFFF bare, and reads replacer lists, arrays and `toJSON5`/`toJSON` once, as `JSON.stringify` does.

`{ jsonc: true }` accepts JSON with `//` and `/* */` comments and nothing more: no single quotes, unquoted keys, hex, `+`, `Infinity`, `NaN`, trailing commas, escapes JSON lacks, or whitespace other than JSON's. Comments end at `\n` or `\r`.

Invalid input throws a `SyntaxError` with json5's message and its `lineNumber` and `columnNumber`, as in `JSON5: invalid character '@' at 2:5`.

## Switching from another library

Each subpath exports the functions, options and types of the library it replaces, apart from the gaps listed below, so switching is a change to the import line. The last column is that library's own test suite, copied unchanged into `test/` and run with tinyjson5 in its place.

<!-- SWITCHING -->

```ts
// before
import { parse, modify, applyEdits } from "jsonc-parser";
// after
import { parse, modify, applyEdits } from "tinyjson5/jsonc-parser";
```

Every subpath is checked a second way, with differential fuzzing: inputs made by editing the json5-tests corpus, each library's own test inputs and generated documents at random, and run through both with every option the subpath takes. The details below give the counts and list each known difference.

All subpaths are ES modules. None has a CommonJS build, a CLI, or a `require` hook for `.json5` files.

<!-- DETAILS -->

## Size

<!-- SIZE -->

## Speed

<!-- SPEED -->

## API

### `parse(text, reviver?, options?)`

Parses JSON5 and returns the value. `parse(text, options)` works too. The reviver is the one `JSON.parse` takes.

| Option   | Default | What it does                                                          |
| -------- | ------- | --------------------------------------------------------------------- |
| `bigint` | `false` | Return integers outside the safe range as BigInts. Must be a boolean. |
| `jsonc`  | `false` | Accept only JSON with comments.                                       |

### `stringify(value, replacer?, space?)` and `stringify(value, options)`

Writes JSON5. The replacer is a function or a list of keys, and `space` works as in `JSON.stringify`, up to 10 characters.

| Option     | Default | What it does                                                                               |
| ---------- | ------- | ------------------------------------------------------------------------------------------ |
| `replacer` | none    | A function that changes each value, or a list of the keys to keep.                         |
| `space`    | none    | Spaces per level (at most 10) or a string (its first 10 characters). Adds trailing commas. |
| `quote`    | auto    | `'` or `"`. By default `'`, or `"` when the string has more `'` than `"`.                  |

Keys that are identifiers are written bare. `NaN`, `Infinity` and `-Infinity` are written as such, `-0` as `0`. `toJSON5()` is used before `toJSON()`. A cycle throws `TypeError: Converting circular structure to JSON5`.

## Develop

tinyjson5 uses pnpm 12, Node 24 or later, and [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests and the build. [tsrs](https://github.com/oxc-project/tsrs) does the typecheck. Each entry is built on its own, with `src/core/mode/<mode>.ts` in place of `src/core/mode.ts`, so it carries no other entry's code; `pnpm size` fails if one does.

```sh
pnpm install
pnpm ready                       # format, build, lint, typecheck, and test
pnpm corpus:fetch                # json5-tests, into .cache
pnpm json5:fetch                 # json5 2.2.3, into .cache, for the large benchmark input
pnpm json5:main:fetch            # json5's main branch, into .cache, the root's reference
pnpm json5-tests                 # json5 2.2.3's own tests against tinyjson5/json5
pnpm own-tests <suite>           # an original's own tests: json5-main, json5-v1, strip-json-comments(-v2, -v5), jsonc-parser, comment-json, jju
pnpm corpus [engine]             # every json5-tests case
pnpm fuzz 200000 3 [engine]      # mutated inputs: json5, json5-v1, root, root-bigint, jsonc
pnpm fuzz:stringify 10000 1 [engine]
pnpm fuzz:strip 100000 1 v3      # strip-json-comments v2, v3 or v5
pnpm fuzz:jsonc 20000 1          # jsonc-parser's whole API
pnpm fuzz:comment-json 20000 1
pnpm fuzz:jju 20000 1
pnpm unicode                     # identifier characters that differ from json5's tables
pnpm size                        # bundle sizes next to each original
pnpm bench                       # speed next to each original
```

## License

[MIT](./LICENSE). The ported code and copied tests keep their licenses: json5's tests (MIT), jsonc-parser (MIT, Microsoft), comment-json (MIT), esprima's tokenizer (BSD-2-Clause, JS Foundation), array-timsort (MIT), jju (MIT, Alex Kocharin) and strip-json-comments' tests (MIT, Sindre Sorhus). Each copy has its license next to it.
