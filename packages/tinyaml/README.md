<h1>
  <img src="./.github/banner.svg" alt="tinyaml" width="100%">
</h1>

<!-- automd:comark-badges name=tinyaml size=size-and-speed -->

[![release](https://comark-ui.onmax.me/badge.svg?source=npm-version&package=tinyaml&label=release&icon=npm)](https://github.com/onmax/tiny/releases)
[![size](https://comark-ui.onmax.me/badge.svg?label=size&value=7.8+KiB+gzip)](#size-and-speed)
[![dependencies](https://comark-ui.onmax.me/badge.svg?label=dependencies&value=0)](https://www.npmjs.com/package/tinyaml?activeTab=dependencies)
[![license: MIT](https://comark-ui.onmax.me/badge.svg?label=license&value=MIT)](./LICENSE)
[![Release status](https://comark-ui.onmax.me/badge.svg?source=github-actions&repository=onmax%2Ftiny&workflow=release.yaml&icon=github)](https://github.com/onmax/tiny/actions/workflows/release.yaml)

<!-- /automd -->

**YAML for JavaScript in 7.8 KiB.** No dependencies, 12–19× faster than yaml, and right on all 373 [yaml-test-suite](https://github.com/yaml/yaml-test-suite) cases with an expected result: every valid document read, every invalid one rejected. js-yaml, yaml, yamljs and @std/yaml each miss some.

Already on another YAML library? Change one import and keep your code:

```diff
- import yaml from "js-yaml";
+ import yaml from "tinyaml/js-yaml";
```

tinyaml ships drop-in replacements for js-yaml 4 and 5, yaml, yamljs and @std/yaml. Each drop-in is checked against the original library's own tests and thousands of fuzzed inputs. [Switching](https://tiny.onmax.me/tinyaml/guide/switching) lists what each one does differently.

## Size and speed

<!-- automd:drop-ins package=tinyaml -->

| You use   | Switch to            |      Size, gzip |       Parses | Stringifies |
| --------- | -------------------- | --------------: | -----------: | ----------: |
| js-yaml 4 | `tinyaml/js-yaml`    | 14.4 → 11.7 KiB |  1.5× faster | 1.6× faster |
| js-yaml 5 | `tinyaml/js-yaml-v5` | 17.1 → 15.9 KiB |  1.5× faster | 1.8× faster |
| yaml      | `tinyaml/yaml`       | 29.9 → 16.7 KiB | 12.6× faster | 2.8× faster |
| yamljs    | `tinyaml/yamljs`     |   8.8 → 8.0 KiB |  5.0× faster | 1.1× faster |
| @std/yaml | `tinyaml/std`        | 11.3 → 10.7 KiB |  2.0× faster | 1.6× faster |

Starting fresh with YAML? The root `tinyaml` API is the smallest of all: 7.8 KiB, 1.8× smaller than js-yaml 4 and 3.8× smaller than yaml. It parses 19.3× faster than yaml and stringifies 12.5× faster.

Size is the minified bundle, gzipped. Speed is the median time to parse and stringify the large benchmark file. Measured on Apple M4, Node 26.13.

<!-- /automd -->

## Get started

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

Values follow the YAML 1.2 core schema, merge keys are on by default, and errors carry a line and column. The [docs](https://tiny.onmax.me) cover the rest:

- [Get started](https://tiny.onmax.me/tinyaml/guide/getting-started): values, merge keys, custom tags, errors and `stringify`
- [Switching](https://tiny.onmax.me/tinyaml/guide/switching): what each drop-in does differently from the library it replaces
- [API](https://tiny.onmax.me/tinyaml/guide/api): every function and option
- [Size](https://tiny.onmax.me/tinyaml/numbers/size), [speed](https://tiny.onmax.me/tinyaml/numbers/speed), [correctness](https://tiny.onmax.me/tinyaml/numbers/correctness) and [how it compares](https://tiny.onmax.me/tinyaml/numbers/comparison), with [the scripts to rerun them](https://tiny.onmax.me/tinyaml/numbers/reproduce)

## Linter

`tinyaml-lint` reports YAML tinyaml can't parse, and plain values such as `no` or `1_000` that parse as strings here but not in other YAML readers. It also runs as a library (`tinyaml/linter`), an [ESLint plugin](https://github.com/onmax/tiny/blob/main/docs/pages/tinyaml/linter/eslint.md) (`tinyaml/eslint`), and a [Vite Doctor extension](https://github.com/onmax/tiny/blob/main/docs/pages/tinyaml/linter/vite-doctor.md) (`tinyaml/doctor`). See [the linter docs](https://github.com/onmax/tiny/blob/main/docs/pages/tinyaml/linter/index.md).

```sh
pnpm tinyaml-lint "**/*.{yaml,yml}"
```

An independent project by [@onmax](https://github.com/onmax).

## Develop

tinyaml is developed with pnpm 12, Node 26 and [Vite+](https://viteplus.dev) (`vp`).

```sh
pnpm install
pnpm --filter tinyaml fixtures  # the comparison tests need the upstream suites and fixtures
pnpm --filter tinyaml ready     # format, build, lint, typecheck and test
```

The website lives in the repository's [`docs/`](../../docs); `pnpm docs:dev` from the root runs it.

## License

[MIT](./LICENSE). The drop-in entries follow the code of js-yaml, yaml, yamljs and @std/yaml, so [LICENSE](./LICENSE) also carries those libraries' notices.
