---
title: Get started
description: Install tinyini and switch from ini by changing the import.
---

tinyini reads and writes INI the way [ini](https://github.com/npm/ini) 7.0.0 does. It has no dependencies, parses 2.0 to 2.7 times faster, and stringifies 2.1 to 2.9 times faster. It is not smaller: ini is already 1.6 KB gzipped, and tinyini is the same 1.6 KB. I wrote it as a drop-in for ini 7.0.0, the version [confbox](https://github.com/unjs/confbox) 0.3.2 bundles.

```sh
pnpm add tinyini
```

```ts
import ini, { parse, stringify } from "tinyini";

parse("; comment\nname = app\ntags[] = a\ntags[] = b\n[server.http]\nport = 8080\n");
// { name: "app", tags: ["a", "b"], server: { http: { port: "8080" } } }
stringify({ name: "app", server: { port: 8080 } }, { whitespace: true });
// "name = app\n\n[server]\nport = 8080\n"
ini.decode("a = true"); // { a: true }
```

`parse(text, options?)`, also exported as `decode`, returns an object with a null prototype, as do its sections. Values are strings, except `true`, `false`, and `null`, a key with no `=` (which is `true`), and `key[]` lines, which collect into an array. A value in double quotes is read as a JSON string, or kept as written if it is not one. A value in single quotes is read as JSON without its quotes, so `'1'` is the number 1 and `'x'` is the string `x`. `;` and `#` start a comment, unless a backslash escapes them. Dots split a section name into nested sections, unless a backslash escapes them. `__proto__` keys and sections are dropped.

| Option           | Default | What it does                                                                     |
| ---------------- | ------- | -------------------------------------------------------------------------------- |
| `bracketedArray` | `true`  | Read `key[]` lines as arrays. With `false`, a key that repeats becomes an array. |

`stringify(value, options?)`, also exported as `encode`, writes the top-level values first and then each nested object as a section. The second argument can also be a string, the `section`.

| Option           | Default            | What it does                                                                 |
| ---------------- | ------------------ | ---------------------------------------------------------------------------- |
| `section`        | none               | A section to put the top-level values in, and to prefix the rest by.         |
| `whitespace`     | `false`            | Write `=` instead of `=`.                                                    |
| `align`          | `false`            | Pad the keys of each section so the `=` signs line up. Implies `whitespace`. |
| `sort`           | `false`            | Sort the keys and sections on each level.                                    |
| `newline`        | `false`            | Put a blank line after each section header.                                  |
| `platform`       | `process.platform` | `"win32"` writes CRLF line endings, anything else LF.                        |
| `bracketedArray` | `true`             | Write array items as `key[]=value`, or with `false` as `key=value`.          |

As in ini, both functions write the normalized options back onto the object you pass, and `safe(value)` and `unsafe(value)` escape and unescape a single key or value.

## Coming from ini

```ts
// ini
import ini from "ini";
// or, as confbox does
import { parse, stringify } from "ini";

// tinyini
import ini, { parse, stringify } from "tinyini";
```

The calls, options, output, and errors are the same. tinyini has no CommonJS build.
