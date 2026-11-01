<h1>
  <img src="./.github/banner.svg" alt="tinyjson5" width="100%">
</h1>

<!-- automd:comark-badges name=tinyjson5 size=size-and-speed -->

[![release](https://comark-ui.onmax.me/badge.svg?source=npm-version&package=tinyjson5&label=release&icon=npm)](https://github.com/onmax/tiny/releases)
[![size](https://comark-ui.onmax.me/badge.svg?label=size&value=3.0+KiB+gzip)](#size-and-speed)
[![dependencies](https://comark-ui.onmax.me/badge.svg?label=dependencies&value=0)](https://www.npmjs.com/package/tinyjson5?activeTab=dependencies)
[![license: MIT](https://comark-ui.onmax.me/badge.svg?label=license&value=MIT)](./LICENSE)
[![Release status](https://comark-ui.onmax.me/badge.svg?source=github-actions&repository=onmax%2Ftiny&workflow=release.yaml&icon=github)](https://github.com/onmax/tiny/actions/workflows/release.yaml)

<!-- /automd -->

**JSON5 for JavaScript in 3.0 KiB.** No dependencies, reads and writes JSON5 the way [json5](https://github.com/json5/json5) 2.2.3 does, and passes all 160 of json5's own test assertions.

Already on json5? Change one import and keep your code:

```diff
- import JSON5 from "json5";
+ import JSON5 from "tinyjson5";
```

<!-- automd:drop-ins package=tinyjson5 -->

| You use     | Switch to   |    Size, gzip |      Parses | Stringifies |
| ----------- | ----------- | ------------: | ----------: | ----------: |
| json5 2.2.3 | `tinyjson5` | 7.5 → 3.0 KiB | 8.1× faster | 4.8× faster |

Size is the minified bundle, gzipped. Speed is the median time to parse and stringify the large benchmark file. Measured on Apple M4, Node 26.13.

<!-- /automd -->

[Get started](#get-started) · [Coming from json5](#coming-from-json5) · [Compatibility](#compatibility-with-json5-223) · [Size and speed](#size-and-speed)

An independent project by [@onmax](https://github.com/onmax).

## Get started

```sh
pnpm add tinyjson5
```

```ts
import JSON5, { parse, stringify } from "tinyjson5";

parse("{name: 'app', tags: ['a', 'b',], /* comment */ size: 0x10}");
// { name: "app", tags: ["a", "b"], size: 16 }
stringify({ name: "app", "a-b": [1, NaN] }); // "{name:'app','a-b':[1,NaN]}"
stringify({ a: 1 }, null, 2); // "{\n  a: 1,\n}"
JSON5.parse("[1, 2]"); // [1, 2]
```

`parse(text, reviver?)` takes the same reviver as `JSON.parse`. Invalid input throws a `SyntaxError` with json5's message and position, as in `JSON5: invalid character '@' at 2:5`, and with `lineNumber` and `columnNumber` set. An unescaped U+2028 or U+2029 inside a string parses, with the same `console.warn` json5 prints.

`stringify(value, replacer?, space?)` takes a replacer function or a list of keys, and a space as `JSON.stringify` does. The second argument can also be an options object:

| Option     | Default | What it does                                                                                |
| ---------- | ------- | ------------------------------------------------------------------------------------------- |
| `replacer` | none    | A function that changes each value, or a list of the keys to keep.                          |
| `space`    | none    | Spaces per level (at most 10) or a string (its first 10 characters). Adds trailing commas.  |
| `quote`    | auto    | The quote to use for strings. By default `'`, or `"` when the string has more `'` than `"`. |

Keys that are identifiers are written bare. `NaN`, `Infinity`, and `-Infinity` are written as such, `-0` as `0`. `toJSON5()` is used before `toJSON()`. A cycle throws `TypeError: Converting circular structure to JSON5`.

### Coming from json5

```ts
// json5
import JSON5 from "json5";
// or, as confbox does
import parse from "json5/lib/parse.js";
import stringify from "json5/lib/stringify";

// tinyjson5
import JSON5, { parse, stringify } from "tinyjson5";
```

The calls, options, output, and errors are the same. tinyjson5 has no CommonJS build, no `json5` CLI, and no `json5/lib/register` hook for `require("./file.json5")`.

## Compatibility with json5 2.2.3

I tested tinyjson5 against json5 2.2.3 five ways:

- json5's own `parse`, `stringify`, and `errors` tests, copied unchanged into `test/json5` and run with tinyjson5 in place of json5. All 160 assertions pass: 49 parse, 67 stringify, 44 errors.
- The [json5-tests](https://github.com/json5/json5-tests) corpus. All 114 files are right: every `.json` and `.json5` file parses, every `.js` and `.txt` file throws, and each gives json5's value or json5's error.
- 1,000,000 inputs made by editing corpus files, json5's test inputs, and generated documents at random. Every one gives the same value, or the same error message, `lineNumber`, and `columnNumber` (791,888 of 791,888 errors identical). The `console.warn` calls match too.
- 10,000 random values, with nested objects and arrays, awkward keys, both quote kinds, control characters, U+2028, `NaN`, `-0`, dates, boxed primitives, `toJSON` and `toJSON5`, functions, symbols, and cycles. Each is stringified with 6 space settings, 3 quote settings, and 3 replacers, positionally and as an options object, plus odd options on every tenth value: 741,000 calls with byte-identical output. Where json5 throws, in 9,993 of them, tinyjson5 throws the same `TypeError`: for cycles, and when a `"__proto__"` entry in the key list reaches `Date.prototype.toJSON`.
- The same values round-trip: `parse(stringify(x))` equals what JSON5 can hold of `x` in all 147,015 checks.

Where tinyjson5 differs:

- Identifier characters. json5 2.2.3 ships Unicode 10 tables; tinyjson5 asks the JavaScript engine with `\p{ID_Start}` and `\p{ID_Continue}`. On Node 26.13 (Unicode 17) that adds 20,588 code points as an identifier start and 21,146 as an identifier part, such as U+0560 (added in Unicode 11) and U+00B7 MIDDLE DOT (an identifier part that json5's table leaves out). `parse` accepts unquoted keys with them where json5 throws, and `stringify` writes such keys bare where json5 quotes them. Older engines know fewer characters. json5 accepts no identifier character that tinyjson5 rejects; U+2E2F VERTICAL TILDE, which json5's tables count as a letter, is special-cased to keep it that way. `pnpm unicode` prints the full list.
- Stack depth. Both parse nesting of any depth without recursion. `stringify` and the reviver recurse in both, and run out of stack at slightly different depths: here `stringify` handles 3,906 nested arrays to json5's 3,672, and the reviver 5,675 nested objects to json5's 5,859.
- Packaging. ESM only, with named exports next to the default. There is no CommonJS or browser build, no CLI, and no `register` or `require` hook. The types are the same signatures, written for ESM, plus exported `Reviver`, `Replacer`, and `StringifyOptions`.

## Size and speed

Bundled with esbuild, minified ESM, then gzip level 9:

|                                              | Minified | Gzip   |
| -------------------------------------------- | -------- | ------ |
| tinyjson5, `parse` and `stringify`           | 7.6 KB   | 3.0 KB |
| tinyjson5, `parse` only                      | 4.9 KB   | 2.0 KB |
| json5, `parse` and `stringify`               | 26.4 KB  | 7.5 KB |
| json5, `lib/parse.js` and `lib/stringify.js` | 27.2 KB  | 7.9 KB |
| json5, `lib/parse.js` only                   | 24.5 KB  | 6.9 KB |

json5's Unicode tables alone are 15.9 KB minified and 4.1 KB gzipped.

Median time per call on an Apple M4 with Node 26.13. The tsconfig is a 15-line file with comments and trailing commas, `test.json5` is json5's own `{a: 1, b: 2}`, and the large file is json5's `package-lock.json` as 215 KB of JSON5. Stringify uses a 2-space indent.

| Operation               | json5   | tinyjson5 | Speedup |
| ----------------------- | ------- | --------- | ------- |
| Parse tsconfig          | 13.0 µs | 1.5 µs    | 8.6x    |
| Parse `test.json5`      | 1.1 µs  | 125 ns    | 9.1x    |
| Parse a 215 KB file     | 7.37 ms | 0.92 ms   | 8.1x    |
| Stringify tsconfig      | 2.8 µs  | 899 ns    | 3.1x    |
| Stringify `test.json5`  | 161 ns  | 129 ns    | 1.3x    |
| Stringify a 215 KB file | 2.22 ms | 0.47 ms   | 4.8x    |

The parser reads character codes in one pass with an explicit stack and builds values directly, where json5 runs a lexer state machine that copies each character into a string. The stringifier only escapes strings that need it.

## Develop

tinyjson5 uses pnpm 12, Node 26, and [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests, and the build. [tsrs](https://github.com/oxc-project/tsrs) does the typecheck.

```sh
pnpm install
pnpm ready                  # format, build, lint, typecheck, and test
pnpm corpus:fetch           # json5-tests, into .cache, so the conformance tests run
pnpm json5:fetch            # json5 2.2.3, into .cache, for the large benchmark input
pnpm json5-tests            # json5's own tests against json5 and tinyjson5
pnpm corpus                 # every json5-tests case against json5
pnpm fuzz 200000 3          # 200,000 mutated inputs with seed 3
pnpm fuzz:stringify 10000 1 # 10,000 random values through every option
pnpm unicode                # identifier characters that differ from json5's tables
pnpm size                   # bundle sizes next to json5
pnpm bench                  # speed next to json5
```

## License

[MIT](./LICENSE). The tests in `test/json5` are json5's, under its [MIT license](./test/json5/LICENSE.md).
