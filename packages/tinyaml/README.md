<h1>
  <img src="./.github/banner.svg" alt="tinyaml" width="100%">
</h1>

[![release](https://comark-ui.onmax.me/badge.svg?source=npm-version&package=tinyaml&label=release&icon=npm)](https://github.com/onmax/tiny/releases)
[![license: MIT](https://comark-ui.onmax.me/badge.svg?label=license&value=MIT)](./LICENSE)
[![Release status](https://comark-ui.onmax.me/badge.svg?source=github-actions&repository=onmax%2Ftiny&workflow=release.yaml&icon=github)](https://github.com/onmax/tiny/actions/workflows/release.yaml)

**YAML for JavaScript in 7.9 KiB.** No dependencies, 12–19× faster than yaml, and right on all 373 [yaml-test-suite](https://github.com/yaml/yaml-test-suite) cases with an expected result: every valid document read, every invalid one rejected. js-yaml, yaml, yamljs and @std/yaml each miss some.

Already on another YAML library? Change one import and keep your code:

```diff
- import yaml from "js-yaml";
+ import yaml from "tinyaml/js-yaml";
```

| Replace     | With                 | Smaller, gzip | Faster    |
| ----------- | -------------------- | ------------- | --------- |
| `js-yaml` 4 | `tinyaml/js-yaml`    | 21%           | 1.5–1.6×  |
| `js-yaml` 5 | `tinyaml/js-yaml-v5` | 8%            | 1.5–2.0×  |
| `yaml`      | `tinyaml/yaml`       | 49%           | 2.8–12.6× |
| `yamljs`    | `tinyaml/yamljs`     | 5%            | 1.1–5.0×  |
| `@std/yaml` | `tinyaml/std`        | 6%            | 1.6–2.1×  |

Each drop-in is checked against the original library's own tests and thousands of fuzzed inputs. [Switching](https://tiny.onmax.me/tinyaml/guide/switching) lists what each one does differently.

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

I wrote tinyaml for [Comark](https://comark.dev), which reads YAML for frontmatter and component props and was bundling all of js-yaml to do it.

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
