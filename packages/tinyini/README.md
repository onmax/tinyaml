<h1>
  <img src="./.github/banner.svg" alt="tinyini" width="100%">
</h1>

<!-- automd:comark-badges name=tinyini size=size -->

[![release](https://comark-ui.onmax.me/badge.svg?source=npm-version&package=tinyini&label=release&icon=npm)](https://github.com/onmax/tiny/releases)
[![size](https://comark-ui.onmax.me/badge.svg?label=size&value=1.3+KiB+gzip)](#size)
[![dependencies](https://comark-ui.onmax.me/badge.svg?label=dependencies&value=0)](https://www.npmjs.com/package/tinyini?activeTab=dependencies)
[![license: MIT](https://comark-ui.onmax.me/badge.svg?label=license&value=MIT)](./LICENSE)
[![Release status](https://comark-ui.onmax.me/badge.svg?source=github-actions&repository=onmax%2Ftiny&workflow=release.yaml&icon=github)](https://github.com/onmax/tiny/actions/workflows/release.yaml)

<!-- /automd -->

**INI for JavaScript in 1.3 KiB.** No dependencies, 2 to 3 times faster than ini, and values come back as they were written: `stringify` quotes whatever `parse` would read differently.

Already on ini or @one-ini/wasm? Change one import and keep your code:

```diff
- import ini from "ini";
+ import ini from "tinyini/ini";
```

tinyini ships drop-in replacements for ini 7 (and 4.1.3 to 6), ini 2, ini 1.3.8, and both versions of @one-ini/wasm, the EditorConfig parser. Each one is smaller and faster than the library it replaces, passes that library's own tests, and gives the same result on a million fuzzed inputs, apart from the differences listed under [Switching](#switching-from-another-library).

<!-- automd:drop-ins package=tinyini -->

| You use             | Switch to              |     Size, gzip |       Parses | Stringifies |
| ------------------- | ---------------------- | -------------: | -----------: | ----------: |
| ini 7.0.0           | `tinyini/ini`          |  1.6 → 1.5 KiB |  1.4× faster | 2.2× faster |
| ini 2.0.0           | `tinyini/ini-v2`       |  1.4 → 1.4 KiB |  1.7× faster | 1.4× faster |
| ini 1.3.8           | `tinyini/ini-v1`       |  1.4 → 1.4 KiB |  1.3× faster | 1.3× faster |
| @one-ini/wasm 0.2.1 | `tinyini/one-ini`      | 36.2 → 1.7 KiB | 13.1× faster |           — |
| @one-ini/wasm 0.1.1 | `tinyini/one-ini-v0.1` | 32.5 → 1.7 KiB | 14.7× faster |           — |

The root `tinyini` API is 1.3 KiB against 1.6 KiB for ini 7.0.0. It parses 2.3× faster than ini 7.0.0 and stringifies 2.9× faster.

Size is the minified bundle, gzipped. Speed is the median time to parse and stringify the large benchmark file. @one-ini/wasm's size adds its .wasm file, gzipped, and its speed is parse_to_uint32array on a 100 KB .editorconfig. Measured on AMD Ryzen 7 255 w/ Radeon 780M Graphics, Node 24.21.0.

<!-- /automd -->

[Get started](#get-started) · [Switching](#switching-from-another-library) · [Size](#size) · [Speed](#speed) · [How it's checked](#how-its-checked) · [npm](https://www.npmjs.com/package/tinyini)

An independent project by [@onmax](https://github.com/onmax).

## Get started

```sh
pnpm add tinyini
```

npm holds only a 0.0.0 placeholder under this name until the first release. Until then, clone this repository and run `pnpm install` and `pnpm build` to get the package in `dist/`.

```ts
import { parse, stringify } from "tinyini";

parse("; comment\nname = app\ntags[] = a\ntags[] = b\n[server.http]\nport = 8080\n");
// { name: "app", tags: ["a", "b"], server: { http: { port: "8080" } } }
stringify({ name: "app", debug: "true", server: { port: 8080 } }, { whitespace: true });
// 'name = app\ndebug = "true"\n\n[server]\nport = 8080\n'
```

`parse(text)` returns an object with a null prototype, as are its sections:

- A line that starts with `;` or `#` is a comment. In a value, an unescaped `;` or `#` starts one too; write `\;`, `\#` and `\\` for the characters.
- `[name]` starts a section. Dots nest it, `[a.b]` inside `a`, unless a backslash escapes them, and a name in double quotes is read as a JSON string. A section replaces a value of the same name.
- `key = value` sets a key, and a line with no `=` sets it to `true`. The key is the text before the first `=`, or a JSON string in double quotes. `true`, `false` and `null` become values, everything else stays a string.
- A value in double quotes is read as a JSON string, and one in single quotes as the text between them. Either way it stays a string, so `"true"` is the string `true`.
- `key[] = value` adds to an array. A `key[]` after `key = value` keeps that value as the first item, and a plain `key` after them replaces the array.
- `__proto__` keys and sections are dropped.

`stringify(value, options?)` writes the values of each object first, and then each object in it as a section, in the layout ini uses. It quotes keys, values and section names that `parse` would read differently, so `parse(stringify(x))` gives back `x`, with numbers and BigInts as strings. `toJSON` is called, so a Date becomes an ISO string. Functions, symbols and `undefined` are left out of objects and written as `null` in arrays, an empty array is left out, since INI has no way to write one, and an object in an array throws.

| Option       | Default | What it does                                                                 |
| ------------ | ------- | ---------------------------------------------------------------------------- |
| `whitespace` | `false` | Put a space on each side of the `=`.                                         |
| `align`      | `false` | Pad the keys of each section so the `=` signs line up. Implies `whitespace`. |
| `sort`       | `false` | Sort the keys and sections on each level.                                    |
| `newline`    | `false` | Put a blank line after each section header.                                  |
| `eol`        | `"\n"`  | The line ending.                                                             |

The rules are ini's, minus what ini keeps only for compatibility. [`scripts/root-spec.ts`](./scripts/root-spec.ts) states them as plainly as it can, and the root is fuzzed against it. Coming from ini 7, this is what changes:

- `parse` takes no options, and neither function writes to the options you pass. `stringify` has no `section` or `platform` option and no string second argument; `eol` sets the line ending.
- Quoted values stay strings. ini reads `"true"` as `true` and `'1'` as the number 1.
- Keys are taken as written, so `a;b = 1` is the key `a;b`, where ini cuts it to `a`. A quoted key must be a JSON string; ini reads any JSON there and throws on `'null' = x`.
- Sections nest when they are read, so keys keep the order they first appear in, and `\.` is a dot in every part of a name. A section replaces a value of the same name, where ini throws or drops the section's keys, and `[a.b]` after `a = null` doesn't throw.
- A plain key after `key[]` lines replaces the array, where ini adds to it. There is no `bracketedArray: false`, so a repeated key keeps its last value.
- `stringify` quotes values `parse` would change, such as `"true"`, `"a;b"` or `"a\\b"`, as JSON strings, where ini writes `true`, `a\;b` and `a\b`. It writes an empty object as an empty section, leaves out `undefined`, and throws on an object in an array, where ini leaves out the section, writes `undefined`, and writes the object as JSON.

## Switching from another library

Each subpath exports the functions of the library it replaces, so switching is a change to the import line. The last column is that library's own test suite, run with tinyini in its place.

| Library                   | Change the import to     | Size, gzip      | Its own tests on tinyini                    |
| ------------------------- | ------------------------ | --------------- | ------------------------------------------- |
| ini 4.1.3 to 7.0.0        | `"tinyini/ini"`          | 1.64 → 1.54 KiB | 40 of 40 pass                               |
| ini 2.0.0, 3.x and 4.0.0  | `"tinyini/ini-v2"`       | 1.40 → 1.37 KiB | 60 of 60 pass (2.0.0's and 4.0.0's)         |
| ini 1.3.8                 | `"tinyini/ini-v1"`       | 1.42 → 1.37 KiB | 30 of 30 pass                               |
| @one-ini/wasm 0.2.x       | `"tinyini/one-ini"`      | 36.2 → 1.69 KiB | editorconfig-core-test: 202 of 203, as WASM |
| @one-ini/wasm 0.1.1–0.1.3 | `"tinyini/one-ini-v0.1"` | 32.5 → 1.69 KiB | editorconfig-core-test: 201 of 203, as WASM |

```ts
// before
import ini from "ini";
import { parse_to_uint32array } from "@one-ini/wasm";
// after
import ini from "tinyini/ini";
import { parse_to_uint32array } from "tinyini/one-ini";
```

Which ini you have decides the subpath, and `npm ls ini` shows it. `rc` pins 1.3.x, which is why 1.3.8 still has the most downloads. [`scripts/versions.ts`](./scripts/versions.ts) fuzzes 15 published ini versions, every one from 1.3.7 on plus 1.3.4 and 1.3.5, each against the next, to find where they behave differently: 1.3.8 differs from 2.0.0 on every input (plain objects against null-prototype ones), 2.0.0 to 4.0.0 behave the same apart from the line endings of array items on Windows, 4.1.0 added options and changed how whitespace-only lines and section headers are read, and 4.1.3 to 7.0.0 behave the same. @one-ini/wasm 0.2.0 reads `key =` as an empty value, where 0.1.x stops parsing there; `editorconfig` 1 uses 0.1.1, and `editorconfig` 3 uses 0.2.1.

The subpaths share one core, built once per library; the root has its own smaller parser and stringifier. The details below list each known difference from the original.

<details>
<summary>ini 7: what's different</summary>

- Strict mode. ini is CommonJS in sloppy mode, where a write to a primitive or a frozen object does nothing. tinyini is an ES module, so it checks for those cases and does nothing too: `parse("a=1\n[a]\nb=2")` returns `{ a: "1" }` in both. The copy of ini that confbox bundles is an ES module and throws `Cannot create property 'b' on string '1'` there.
- Replaced built-ins. tinyini reads options and values in ini's order, so getters and proxies see the same reads, but it doesn't call `JSON.parse` or string methods everywhere ini does, so a program that replaces one of them, for instance from inside an option's getter, can see a different result.
- Arguments that are neither strings nor `String` objects but have their own `split` or `trim` method, passed to `parse` or `unsafe`, can give a different result.
- Stack depth. Both write nested objects recursively and run out of stack at different depths: on Node 24, ini writes 5,632 nested objects and tinyini/ini 5,888.
- ini 4.1.0 to 4.1.2: with `bracketedArray: false`, they cut the last two characters off a key that repeats, a bug 4.1.3 fixed. tinyini/ini doesn't. ini 4.1.0 also throws where there is no `process`, as in a browser.
- Packaging. ESM only, with named exports next to the default. The types are the signatures of `@types/ini` 4.1.1, plus exported `DecodeOptions` and `EncodeOptions`.

</details>

<details>
<summary>ini 2: what's different</summary>

- Windows. ini 2.0.0 to 4.0.0 pick the line ending from `process.platform` when they load; tinyini/ini-v2 reads it each time it writes. ini 3.x and 4.0.0 also end array items with CRLF on Windows, where 2.0.0 and tinyini/ini-v2 write `\n`.
- Stack depth: on Node 24, ini 2.0.0 writes 6,072 nested objects and tinyini/ini-v2 5,918.
- Strict mode, replaced built-ins, arguments with their own `split` or `trim`, and packaging, as for ini 7. The types take only `section` and `whitespace`, the options ini 2 reads.

</details>

<details>
<summary>ini 1.3.8: what's different</summary>

- A section named after a property every object inherits, such as `[constructor]`, `[toString]` or `[hasOwnProperty]`. ini 1.3.8 looks the name up on its plain result object, finds the built-in function, and writes the section's keys onto it, so `[constructor]` followed by `keys = 1` replaces `Object.keys` for the whole program. tinyini/ini-v1 starts a new object for the section instead, as later versions do. The fuzzer checks those inputs against ini 1.3.8 with that one line changed.
- Windows, strict mode, replaced built-ins, arguments with their own `split` or `trim`, and packaging, as for ini 2. Stack depth: ini 1.3.8 writes 2,559 nested objects and tinyini/ini-v1 5,453.
- Versions before 1.3.8 differ from it: 1.3.5 and earlier write a `[__proto__]` section's keys to `Object.prototype`, and 1.3.7 returns null-prototype objects.

</details>

<details>
<summary>@one-ini/wasm: what's different</summary>

- Memory. The WASM module's memory grows on every call, by about 48 KiB for a 1 KiB file in 0.1.1, and once it reaches 4 GiB every call throws `RuntimeError: unreachable`, for good. With 0.2.1 that takes 65,504 calls to `parse_to_uint32array` on an 800-byte file. tinyini keeps nothing between calls.
- Arguments of the wrong type. tinyini copies an argument in as wasm-bindgen's glue does, so a string, a `String` object, a typed array, a `Buffer` or an array gives the same result or error, and so does an array-like whose `length` is negative. An argument that doesn't act like one can differ: one whose `length` grows from one read to the next, even on a real `Uint8Array`, a typed array whose own `length` hides more bytes than the WASM module's memory has room for (it throws, tinyini doesn't), a `length` that is fractional or from 2³¹ up to 4 GiB (0.1.1 allocates that much memory, where tinyini throws `RuntimeError: unreachable` as 0.2.1 does), and a `charCodeAt` that returns something other than a UTF-16 code unit, such as a negative number.
- Exports. `parse_to_json`, `parse_to_uint32array`, `version` and `TokenTypes`, as named exports and on the default export. 0.1.1 also exports wasm-bindgen's internal functions and `__wasm`, which tinyini leaves out.
- `version()` and the AST's `version` say 0.2.1 or 0.1.1, the versions `editorconfig` 3 and 1 pin. 0.2.0, 0.2.2, 0.1.2 and 0.1.3 say their own version and otherwise give the same results on 20,083 fuzzed inputs each (`THEIRS=<path> node scripts/one-ini-fuzz.ts 20000 1 one-ini`, or `one-ini-v0.1` for 0.1.x). 0.1.0 reads comments differently, trimming their text, and tinyini doesn't follow it.

</details>

## Size

Each entry as npm ships it in `dist/`, bundled with esbuild, minified ESM, then gzip -9, from [`scripts/size.ts`](./scripts/size.ts). An entry counts its named exports and its default export. @one-ini/wasm counts its JavaScript and its `.wasm` file, each gzipped. A KiB is 1,024 bytes.

| Entry                  | Minified  | Gzip      |
| ---------------------- | --------- | --------- |
| `tinyini`              | 2.49 KiB  | 1.33 KiB  |
| `tinyini/ini`          | 3.15 KiB  | 1.54 KiB  |
| ini 7.0.0              | 3.46 KiB  | 1.64 KiB  |
| `tinyini/ini-v2`       | 2.78 KiB  | 1.37 KiB  |
| ini 2.0.0              | 2.89 KiB  | 1.40 KiB  |
| `tinyini/ini-v1`       | 2.75 KiB  | 1.37 KiB  |
| ini 1.3.8              | 2.89 KiB  | 1.42 KiB  |
| `tinyini/one-ini`      | 3.38 KiB  | 1.69 KiB  |
| @one-ini/wasm 0.2.1    | 91.68 KiB | 36.18 KiB |
| `tinyini/one-ini-v0.1` | 3.39 KiB  | 1.69 KiB  |
| @one-ini/wasm 0.1.1    | 87.60 KiB | 32.52 KiB |

ini is already small, so the ini subpaths save little: they look at character codes where ini runs a regular expression per line, and that takes about as much code. Importing one function leaves the rest out: `parse` alone is 0.75 KiB from `tinyini` and 0.92 KiB from `tinyini/ini`.

Each subpath is built with the branches of one core mode only: ini 4.1 for `tinyini/ini`, ini 1.x to 4.0 for `tinyini/ini-v2`, ini 1.x for `tinyini/ini-v1`, and one-ini 0.2 or 0.1 for the one-ini entries. `scripts/size.ts` fails if an entry outgrows its budget or the library it replaces, if it still holds another mode's code or behaves as another mode, if a package specifier such as `tinyini/ini-v2` loads the wrong mode, if importing one function keeps the others, or if the root stops being the smallest entry.

## Speed

Median time per call over seven rounds, from [`bench/index.ts`](./bench/index.ts), on the built `dist/` (AMD Ryzen 7 255, Node 24.21.0, on a machine other jobs share, so runs vary: the table at the top comes from another run, where ini 7's large parse is 1.4x faster rather than 1.9x). The two sides' rounds interleave, and which runs first alternates. The inputs are ini's `foo.ini` fixture, a `.gitconfig`, and about 100 KB of generated sections, comments, quoted values, escapes and arrays; stringify writes what ini 7 reads from each, with `whitespace: true`. For @one-ini/wasm, "parse" is `parse_to_uint32array` on the file's bytes, which is what `editorconfig` calls, and the inputs are an `.editorconfig` and 100 KB of generated EditorConfig sections.

| Library                                      | Operation                   |  Library |  tinyini | Speedup |
| -------------------------------------------- | --------------------------- | -------: | -------: | ------: |
| ini 7.0.0 → `tinyini/ini`                    | parse foo.ini               |  53.5 µs |  24.9 µs |    2.1x |
|                                              | parse .gitconfig            |  35.0 µs |  14.5 µs |    2.4x |
|                                              | parse large                 |  2.82 ms |  1.48 ms |    1.9x |
|                                              | stringify foo.ini           |  20.2 µs |   9.6 µs |    2.1x |
|                                              | stringify .gitconfig        |  29.0 µs |  15.1 µs |    1.9x |
|                                              | stringify large             |  2.89 ms |  1.01 ms |    2.9x |
| ini 2.0.0 → `tinyini/ini-v2`                 | parse foo.ini               |  64.1 µs |  26.4 µs |    2.4x |
|                                              | parse .gitconfig            |  36.8 µs |  14.6 µs |    2.5x |
|                                              | parse large                 |  2.71 ms |  1.62 ms |    1.7x |
|                                              | stringify foo.ini           |  14.1 µs |  10.4 µs |    1.4x |
|                                              | stringify .gitconfig        |  25.9 µs |  20.8 µs |    1.2x |
|                                              | stringify large             |  1.81 ms |  1.22 ms |    1.5x |
| ini 1.3.8 → `tinyini/ini-v1`                 | parse foo.ini               |  62.6 µs |  27.1 µs |    2.3x |
|                                              | parse .gitconfig            |  38.7 µs |  15.3 µs |    2.5x |
|                                              | parse large                 |  2.86 ms |  1.64 ms |    1.7x |
|                                              | stringify foo.ini           |  14.4 µs |   9.9 µs |    1.5x |
|                                              | stringify .gitconfig        |  22.8 µs |  17.6 µs |    1.3x |
|                                              | stringify large             |  1.70 ms |  1.20 ms |    1.4x |
| @one-ini/wasm 0.2.1 → `tinyini/one-ini`      | parse .editorconfig         | 197.2 µs |  10.0 µs |   19.7x |
|                                              | parse large                 | 13.53 ms |  1.02 ms |   13.2x |
|                                              | parse_to_json .editorconfig | 172.9 µs |   7.0 µs |   24.8x |
|                                              | parse_to_json large         | 17.50 ms |  1.22 ms |   14.4x |
| @one-ini/wasm 0.1.1 → `tinyini/one-ini-v0.1` | parse .editorconfig         | 196.1 µs |  10.4 µs |   18.8x |
|                                              | parse large                 | 14.06 ms | 912.9 µs |   15.4x |
|                                              | parse_to_json .editorconfig | 186.2 µs |   6.8 µs |   27.2x |
|                                              | parse_to_json large         | 16.53 ms |  1.17 ms |   14.1x |

The root, tinyini's own API, against ini 7.0.0 and against each ini subpath, on the same inputs:

| Against          | parse foo.ini | parse .gitconfig | parse large | stringify foo.ini | stringify .gitconfig | stringify large |
| ---------------- | ------------: | ---------------: | ----------: | ----------------: | -------------------: | --------------: |
| ini 7.0.0        |          3.1x |             3.2x |        2.5x |              2.8x |                 2.4x |            3.3x |
| `tinyini/ini`    |          1.2x |             1.2x |        1.5x |              1.5x |                 1.3x |            1.5x |
| `tinyini/ini-v2` |          1.4x |             1.2x |        1.5x |              1.3x |                 1.4x |            1.6x |
| `tinyini/ini-v1` |          1.3x |             1.4x |        1.4x |              1.7x |                 1.4x |            1.5x |

## How it's checked

Each subpath is checked against the library it replaces, which is installed next to it as a development dependency:

- The original's own tests, copied unchanged into [`test/suites`](./test/suites) and run with tinyini in its place: ini 7.0.0's, 2.0.0's, 4.0.0's and 1.3.8's tap tests, with their snapshots; one-ini's Rust tests (`integration_test.rs` and `node.rs`), turned into JavaScript by [`scripts/one-ini-tests.ts`](./scripts/one-ini-tests.ts), 42 of 42 with each WASM version and each tinyini entry; and [editorconfig-core-test](https://github.com/editorconfig/editorconfig-core-test) through the `editorconfig` package's command line, with CMake as the suite expects.
- 1,000,400 parse inputs per ini subpath, made by editing ini's fixtures and test strings, the config files in `test/samples` (two `.gitconfig` files, `.npmrc`, `.editorconfig`, `php.ini`, a systemd unit, `desktop.ini`, `setup.cfg`, `my.cnf` and some odd cases, each also with CRLF endings, with a BOM, and as pkg-types' `parseGitConfig` rewrites them), and documents ini writes for random values. 970,283 of them are distinct. Each is parsed with `bracketedArray` unset, `true` and `false`, every tenth also with 10 odd options such as `null`, a string, a frozen object or a getter that changes its answer, and `safe` and `unsafe` run on each: 6,102,462 calls per subpath, with 0 differences. The comparison covers prototypes, own key order, property flags, shared references, the options object afterwards, and the error class and message. For tinyini/ini-v1, 57,450 calls differ, all in the one documented way.
- 10,000 random values per ini subpath, with nested and null-prototype objects, awkward keys and strings, arrays with holes, `undefined`, functions, symbols, BigInts, dates, `toJSON` and cycles, through all 384 combinations of the options plus 12 odd ones on every tenth value, and through the defaults on Windows: 3,851,216 calls each, plus 30,000 on Windows, with byte-identical output, the same options object afterwards, and the same error where the original throws. Every tenth value also runs behind proxies that log each read and write of the value and the options, which must come in the same order, and with every option name set on `Object.prototype`. The text then parses to the same value in both, in 3,569,892 round trips; for tinyini/ini-v1, 8,976 of them differ in the documented way.
- 1,000,083 inputs per one-ini subpath, made by editing the `.editorconfig` files of editorconfig-core-test, the samples and ini's fixtures, through `parse_to_json` as strings and `parse_to_uint32array` as UTF-8, one in five with random bytes spliced in so that some aren't UTF-8, then odd arguments, and the AST's names set on `Object.prototype` as values and as setters that log each assignment: 2,200,135 calls against 0.2.1 and 2,200,133 against 0.1.1, 0 differences, the errors for bytes that aren't UTF-8 included.
- The root against its spec: 1,000,400 parse inputs, and 10,000 random values through every option combination, whose text must parse back to the value it came from, with the changes `stringify` documents above, such as numbers read back as strings and empty arrays left out: 0 differences in 246,720 round trips.
- Every fuzzer and suite runner exits with an error on a difference or a failed test, and when a suite runs no tests. The ini and one-ini suite runners also fail when an original fails its own tests; editorconfig-core-test fails for the WASM module too in the cases listed above, so that runner fails only on a test that fails with tinyini alone.

## Run the comparisons yourself

```sh
pnpm ini-tests                        # ini's own tests against each ini and its tinyini subpath
pnpm one-ini-tests                    # one-ini's Rust tests with each @one-ini/wasm and tinyini
pnpm editorconfig-tests               # editorconfig-core-test with each @one-ini/wasm and tinyini (needs CMake)
node scripts/fuzz.ts 1000000 1 ini    # parse fuzzing; also ini-v2 or ini-v1
node scripts/fuzz-stringify.ts 10000 1 ini
node scripts/one-ini-fuzz.ts 1000000 1 one-ini   # or one-ini-v0.1
node scripts/root-fuzz.ts 1000000 10000 1        # the root against scripts/root-spec.ts
node scripts/versions.ts 20000        # 15 ini versions, each against the next
node scripts/depth.ts                 # how deep each entry writes
pnpm size                             # bundle sizes
pnpm bench                            # speed
```

## Develop

tinyini is developed with pnpm 12, Node 26 and [Vite+](https://viteplus.dev) (`vp`), which runs oxlint, oxfmt, Vitest and tsdown. [tsrs](https://github.com/oxc-project/tsrs) does the typecheck. On Node, the published package needs version 22 or later.

```sh
pnpm install
pnpm ready      # format, build, lint, typecheck and test
pnpm test:dist  # the tests against the built dist/
```

## License

[MIT](./LICENSE). The ini and one-ini entries follow the behaviour and parts of the code of ini, @one-ini/wasm and wasm-bindgen's glue, so [LICENSE](./LICENSE) also carries their notices. The tests in `test/suites/ini-*` are ini's, under its ISC license, those in `test/suites/one-ini` are one-ini's, under the MIT license in that folder, and those in `test/suites/editorconfig-core-test` are the EditorConfig team's, under the BSD license in that folder.
