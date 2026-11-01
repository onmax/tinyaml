---
title: Get started
description: Install tinyaml and parse or stringify YAML with its own API.
---

```sh
pnpm add tinyaml
```

tinyaml ships ESM only. Node 22.12 and later load it with `import` or `require()`, and so do bundlers.

```ts
import { parse, parseAll, stringify } from "tinyaml";

parse("title: Hello\ntags: [a, b]\ncount: 0x1F"); // { title: "Hello", tags: ["a", "b"], count: 31 }
parseAll("a: 1\n---\nb: 2"); // [{ a: 1 }, { b: 2 }]
stringify({ title: "Hello", draft: false, answer: "yes" }); // "title: Hello\ndraft: false\nanswer: 'yes'\n"
```

Values follow the YAML 1.2 core schema. `true`, `null`, `~`, `.5`, `0o17`, `0x1F` and `.inf` become values, and `yes`, `on` and dates stay strings.

Merge keys work and are on by default:

```ts
parse("base: &base { a: 1 }\nchild:\n  <<: *base\n  b: 2");
// { base: { a: 1 }, child: { a: 1, b: 2 } }
```

Custom tags are functions that get the node's value, and they can call `parse` themselves. A tag you don't handle keeps its value instead of throwing:

```ts
parse("home: !env HOME", {
  tags: { "!env": (value) => (typeof value === "string" ? process.env[value] : undefined) },
});
parse("x: !thing 12"); // { x: "12" }
```

Errors are `YAMLError`s with a 1-based `line` and `column`, also at the end of the message:

```ts
parse("a: 1\na: 2"); // throws YAMLError: duplicated mapping key (2:1)
```

`stringify` writes what `JSON.stringify` would keep, with a few differences. Functions, symbols and `undefined` are left out of objects. In arrays they become `null`, and so do holes. `toJSON` is called with no key, so a Date becomes an ISO string, and a `toJSON` that returns `undefined` leaves the value out. A BigInt throws. Numbers JSON can't write become YAML ones: `Infinity` is `.inf`, `NaN` is `.nan` and `-0` is `-0.0`. Any other object is written from its own enumerable keys, so a Map or a boxed `new Number(5)` becomes `{}`. It quotes strings a YAML 1.1 reader would take for something else, so `"yes"` comes out as `'yes'` and `"0777"` as `'0777'`.

Collection keys such as `[a, b]: c` throw on purpose. A list can't be a JavaScript object key without being turned into a string.
