// The `yaml` package with `parse` and `stringify` swapped for tinyaml's, so
// yaml's own tests of those two functions run against tinyaml. Each call
// is counted, so setup.ts can tell which tests exercised tinyaml.
// vite.config.ts resolves `yaml` here.
import * as tiny from "../../src/yaml/index.ts";

export * from "../../node_modules/yaml/dist/index.js";

const used = globalThis as { tinyamlCalls?: number };
export const parse: typeof tiny.parse = (...args) => {
  used.tinyamlCalls = (used.tinyamlCalls ?? 0) + 1;
  return tiny.parse(...args);
};
export const stringify: typeof tiny.stringify = (...args) => {
  used.tinyamlCalls = (used.tinyamlCalls ?? 0) + 1;
  return tiny.stringify(...args);
};
