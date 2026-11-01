---
title: Compatibility with each original
label: Compatibility
description: The subpaths that replace json5 2 and 1, strip-json-comments, jsonc-parser, comment-json and jju, how each was checked, and every place it still differs.
---

Each subpath exports the functions, options and types of the library it replaces, apart from the gaps listed below, so switching is a change to the import line. The last column is that library's own test suite, copied unchanged into `test/` and run with tinyjson5 in its place.

| Library                   | Change the import to                 | Size, gzip      | Its own tests on tinyjson5 |
| ------------------------- | ------------------------------------ | --------------- | -------------------------- |
| json5 2.2.3               | `"tinyjson5/json5"`                  | 7.6 → 3.2 KiB   | 160 of 160                 |
| json5 1.0.2               | `"tinyjson5/json5-v1"`               | 8.4 → 3.3 KiB   | 144 of 144                 |
| strip-json-comments 3.1.1 | `"tinyjson5/strip-json-comments"`    | 0.8 → 0.5 KiB   | 10 of 10                   |
| strip-json-comments 2.0.1 | `"tinyjson5/strip-json-comments-v2"` | 0.7 → 0.5 KiB   | 9 of 9                     |
| strip-json-comments 5.0.3 | `"tinyjson5/strip-json-comments-v5"` | 654 → 646 B     | 13 of 13                   |
| jsonc-parser 3.3.1        | `"tinyjson5/jsonc-parser"`           | 6.6 → 5.7 KiB   | 83 of 83                   |
| comment-json 4.6.2        | `"tinyjson5/comment-json"`           | 35.7 → 18.4 KiB | 384 of 384                 |
| jju 1.4.0                 | `"tinyjson5/jju"`                    | 9.8 → 9.7 KiB   | 421 of 423                 |

jju fails the same 2 of its own tests itself under today's Node: they compare it with `eval`. json5 2.2.3's tests include json5's errors tests, and tinyjson5's root runs json5's main-branch tests too: 197 of 198 pass, and the one left needs an identifier character from Unicode 18, which Node 24 doesn't know yet.

```ts
// before
import { parse, modify, applyEdits } from "jsonc-parser";
// after
import { parse, modify, applyEdits } from "tinyjson5/jsonc-parser";
```

Every subpath is checked a second way, with differential fuzzing: inputs made by editing the json5-tests corpus, each library's own test inputs and generated documents at random, and run through both, each with options picked from all the subpath takes. The sections below give the counts and list each known difference.

All subpaths are ES modules. None has a CommonJS build, a CLI, or a `require` hook for `.json5` files. Node 22.12 and later load them with `require()` too, which returns the module's exports, so a default export, such as strip-json-comments' function, is under `.default`.

## json5 2.2.3 and 1.0.2: what's different

- Identifier characters come from the JavaScript engine's own Unicode tables (`\p{ID_Start}`, `\p{ID_Continue}`), not the ones json5 ships (Unicode 10 in 2.2.3, older in 1.0.2). On Node 24 (Unicode 17) that adds 20,588 characters that can start an unquoted key and 21,146 that can continue one, against json5 2.2.3's tables, such as U+0560. No character json5 accepts is rejected; U+2E2F, which json5's tables count as a letter, is special-cased to keep it that way. `pnpm unicode` prints the full list.
- json5 1.0.2 reads the end of input as the string `"undefined"`, whose `d`, `e` and `f` are hex digits. A hex number that ends the input makes it append `"undefined"` until the string is too long, which takes seconds and hundreds of megabytes. tinyjson5/json5-v1 throws the same `RangeError: Invalid string length` at once.
- json5 1.0.2 is compiled by Babel, and its `for...of` loops go through iterators. A replacer list is iterated as Babel does, but strings and key lists are not, so a patched `String.prototype[Symbol.iterator]`, or an `Array.prototype[Symbol.iterator]` whose `next` or `return` changes, is used differently.
- A `parse` called from inside `console.warn` while json5 warns about U+2028 returns the inner result in json5, whose shared state it overwrites. tinyjson5 throws an end-of-input error there.
- Stack depth: `stringify` and the reviver recurse in both, and run out of stack at slightly different depths.
- 1,000,500 inputs each (500 seeds and a million edits of them) give the same value or the same error, message and position, as json5 2.2.3 (739,687 errors) and json5 1.0.2 (757,833 errors, 4,543 of them that `RangeError`), and the same warnings. 14,000 random values through every space, quote and replacer, 1,037,400 `stringify` calls each, give byte-identical output, or the same `TypeError` where json5 throws (14,025 calls, for cycles and a `"__proto__"` key that reaches `Date.prototype.toJSON`), and every round trip reads back.

## strip-json-comments 3, 2 and 5: what's different

- tinyjson5/strip-json-comments-v2 with an argument that isn't a string, null or undefined: strip-json-comments 2 runs its loop on the object itself, through `length`, its indexes, `slice` and `substr`. The subpath reads `length`, throws `TypeError: str.substr is not a function` if there's no `substr`, and else strips `String(argument)`. Doing what 2 does would make the subpath bigger than it.
- 1,000,400 inputs each (400 seeds and a million edits of them), with every option set: 3,001,221 calls to 3, 4,001,628 to 2 and 5,002,035 to 5, with the same output or the same error.

## jsonc-parser: what's different

- Its enums are declared as `declare enum`, not `declare const enum`: code reads `SyntaxKind.StringLiteral` from the exported object instead of inlining 10, which also works under `isolatedModules` and `verbatimModuleSyntax`.
- `visit` passes one path-supplier function to all of a visit's callbacks, where jsonc-parser makes a new one for each. Each returns the path at the time it's called, as there.
- Token values are cut from the text with `substring`, when asked for, where jsonc-parser builds trivia with `String.fromCharCode` and cuts the rest as it scans. A program that replaces `String.prototype.substring` or `String.fromCharCode`, also between a `scan()` and its `getTokenValue()`, sees other calls and values; `String.prototype.charCodeAt` is called as jsonc-parser calls it.
- No deep imports such as `jsonc-parser/lib/esm/impl/format`. Its `string-intern` test, which tests caches inside its formatter, isn't run.
- 1,000,922 inputs (922 seeds and a million edits of them), 23,021,226 calls over the whole API: the scanner in both trivia modes and after `setPosition`, `parse` and `parseTree` with each option set, `visit` with suppressed callbacks, `getLocation`, `findNodeAtOffset`, `findNodeAtLocation`, `getNodePath`, `getNodeValue`, `stripComments`, `format` with random ranges and options and `modify` with random paths, values and options, both through `applyEdits`. All give the same result or throw the same error.

## comment-json: what's different

- `stringify` reads each object's comments once per call. Code that runs while the value is written and adds or changes comments, such as a getter, a `toJSON`, or the `toString` of a comment's value, isn't seen, where comment-json reads them again. An object with a getter for a comment is read as comment-json reads it, and a proxy sees other traps. Without a replacer only, and only with `Symbol.for` and the prototypes of objects, arrays and `CommentArray` as they were; otherwise comments are read as comment-json reads them.
- `tokenize` builds esprima's tokens itself for JSON with comments, and hands any other input to esprima's own tokenizer, which comes along unchanged.
- Both faster paths, the comment read and the tokenizer, run only while the built-ins they rely on are the engine's own, and otherwise do what comment-json and esprima do. They tell from each built-in's name and source, read from its descriptor without running a getter, and from what it does on a known input. A program that replaces `globalThis`, `Object`, `Function`, `Reflect`, `Object.getOwnPropertyDescriptor`, `Reflect.apply` or `Function.prototype.toString` before tinyjson5 loads can fool that check, which has to read and call them before it can check anything.
- No CommonJS build and no deep imports. `require("tinyjson5/comment-json")` works on Node 22.12 and later.
- 1,000,509 inputs (509 seeds and a million edits of them), 8,004,072 calls: `parse` with and without comments and with a reviver, compared with every comment symbol and token; `tokenize`; `stringify` with a space and a replacer picked at random; `assign`, `moveComments` and `removeComments`. All give the same result or throw the same error, with esprima's and comment-json's error fields.

## jju: what's different

- Not jju's `utils`: its `require` hook for `.json5` files, its `JSON.parse` patch and its middleware, which are Node-only.
- Off Node, an assertion `update` trips throws an `AssertionError`-named error with Node's `code`, `actual`, `expected` and `operator`, but a shorter message and no `generatedMessage` or `diff`. On Node it's Node's own `AssertionError`, as in jju.
- 1,000,648 inputs (648 seeds and a million edits of them), 6,003,888 calls: `parse` with a mode and options picked at random, `tokenize`, `analyze`, `stringify` with random options, and `update`, with the same result or the same error, `row` and `column` included.

jju, comment-json and array-timsort are written for sloppy mode, and their ports run as ES modules, which are strict. Writes that would fail silently there go through `Reflect.set` and `Reflect.deleteProperty` here, so frozen options, objects and arrays behave the same. jju's go through one sloppy-mode function made with `Function` instead, which is faster, and through `Reflect` where a Content-Security-Policy or `--disallow-code-generation-from-strings` blocks it.
