---
title: Compatibility with json5 2.2.3
label: Compatibility
description: How tinyjson5 was checked against json5 2.2.3, and every place it still differs.
---

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
