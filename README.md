# tiny

Small, fast, dependency-free parsers you can drop in for the libraries you already use. Each package matches its original on that library's own tests and on hundreds of thousands of fuzzed inputs, and lists every place it still differs.

| Package | Replaces | Size, gzip | Speed | Checked against |
| --- | --- | --- | --- | --- |
| [tinyaml](./packages/tinyaml) | js-yaml 4 and 5, yaml, yamljs, @std/yaml | 7.9 KiB for the root API | 1.1–12.6× faster | yaml-test-suite, each library's own tests, fuzzing |
| [tinyjson5](./packages/tinyjson5) | json5 2.2.3 | 3.0 KB, json5 is 7.5 KB | parses 8–9× faster | json5's tests, json5-tests, 1.6M fuzzed inputs |
| [tinyini](./packages/tinyini) | ini 7.0.0 | 1.6 KB, the same as ini | 2–2.9× faster | ini's tests, 6M fuzzed calls |

Each package is published on its own, so you install only what you use:

```sh
pnpm add tinyaml tinyjson5 tinyini
```

Every number above comes from the package's README, where you'll find how it was measured and the full list of differences.

## Develop

The repository is a pnpm workspace. Node 26, pnpm 12, and [Vite+](https://viteplus.dev) (`vp`) for formatting, linting, tests and builds.

```sh
pnpm install
pnpm build     # every package
pnpm check     # format, lint and typecheck every package
pnpm test      # every package's tests
pnpm --filter tinyjson5 fuzz 200000 1   # one package's script
```

All packages share one version and release together.

## License

MIT, by [@onmax](https://github.com/onmax).
