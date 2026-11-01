---
title: Get started
description: Install tinyjson5 and switch from json5 by changing the import.
---

tinyjson5 reads and writes JSON5 the way [json5](https://github.com/json5/json5) 2.2.3 does. It is 3.0 KB gzipped where json5 is 7.5 KB, has no dependencies, parses 8 to 9 times faster, and stringifies 1.3 to 4.8 times faster. I wrote it as a drop-in for json5 2.2.3, the version [confbox](https://github.com/unjs/confbox) bundles.

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

## Coming from json5

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
