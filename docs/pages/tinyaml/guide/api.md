---
title: API
description: parse, parseAll, stringify, their options and YAMLError.
---

## `parse(text, options?)`

Returns the one document in `text`, or `undefined` when there is none. Throws a `YAMLError` for invalid YAML or for more than one document.

## `parseAll(text, options?)`

Returns every document in `text` as an array.

## `ParseOptions`

| Option          | Default | What it does                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tags`          | `{}`    | Functions by tag name, like `!env` in [Get started](/tinyaml/guide/getting-started/). Each gets the node's string, array or object, or `null` when empty, and may call `parse`.                                                                                                                                                                                     |
| `merge`         | `true`  | Merge `<<` keys into their mapping. With `false`, `<<` is a plain key.                                                                                                                                                                                                                                                                                              |
| `duplicateKeys` | `false` | Allow duplicate keys, and the last one wins. Otherwise a duplicate throws.                                                                                                                                                                                                                                                                                          |
| `maxDepth`      | `100`   | Nesting limit. The root node is level 1, and each key or value inside a collection is one level deeper. Scalars and empty nodes count, and a pair in a flow sequence, as in `[a: b]`, is a mapping a level deeper. A node at level `maxDepth` throws, so `a: 1` needs at least 3. Nesting too deep for the call stack throws a `YAMLError` too, whatever the limit. |

Tags you don't list in `tags` keep the node's value. The core tags `!!str`, `!!int`, `!!float`, `!!bool`, `!!null`, `!!seq` and `!!map` work, and throw when the value doesn't fit, as in `!!int x` or `!!map x`. Aliases don't count toward `maxDepth`, so a value reached through one can be nested deeper than it. An implicit key longer than 1,024 Unicode characters throws, as the spec requires. A raw non-printable character, such as U+0001, throws anywhere in the input, comments included. Write it as an escape in a double-quoted string. A `__proto__` key becomes an own property, so YAML can't change an object's prototype.

## `stringify(value, options?)`

Returns YAML text for `value`, ending in a newline, or `""` when `value` is something JSON leaves out, like `undefined`.

## `StringifyOptions`

| Option     | Default | What it does                                                                                       |
| ---------- | ------- | -------------------------------------------------------------------------------------------------- |
| `indent`   | `2`     | Spaces per level. `0` counts as `2`, and a fraction rounds up, so `1.5` writes 2, as in js-yaml.   |
| `refs`     | `true`  | Write an object reached twice as an `&ref_0` anchor and `*ref_0` aliases. With `false`, repeat it. |
| `sortKeys` | `false` | Sort mapping keys, by string order with `true` or with your compare function.                      |

## `YAMLError`

Extends `Error`. `line` and `column` start at 1, and the message ends with `(line:column)`.
