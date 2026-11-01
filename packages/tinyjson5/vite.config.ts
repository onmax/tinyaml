import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// Each mode's entries, built together. src/core/mode.ts resolves to
// src/core/mode/<mode>.ts there, whose constants the bundler folds, so an
// entry carries none of the other modes' branches. An entry goes under the
// mode it passes to the core.
export const MODES = {
  lean: { index: "src/index.ts" },
  json5: { json5: "src/json5/index.ts" },
  "json5-v1": { "json5-v1": "src/json5-v1/index.ts" },
  "strip-json-comments": { "strip-json-comments": "src/strip-json-comments/index.ts" },
  "strip-json-comments-v2": { "strip-json-comments-v2": "src/strip-json-comments-v2/index.ts" },
  "strip-json-comments-v5": { "strip-json-comments-v5": "src/strip-json-comments-v5/index.ts" },
  "jsonc-parser": { "jsonc-parser": "src/jsonc-parser/index.ts" },
};
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const MODE = here("src/core/mode.ts");

export default defineConfig({
  // ESM only, with types, and publint fails the build on a broken package.json.
  // tsdown cleans once, and runs publint once all the builds are done.
  pack: Object.entries(MODES).map(([mode, entry]) => ({
    entry,
    format: ["esm"],
    platform: "neutral",
    fixedExtension: true,
    dts: true,
    clean: true,
    publint: true,
    plugins: [
      {
        name: "tinyjson5-mode",
        async resolveId(id: string, importer: string | undefined) {
          if (!importer || !id.endsWith("mode.ts")) return null;
          const resolved = await this.resolve(id, importer, { skipSelf: true });
          return resolved?.id === MODE ? here(`src/core/mode/${mode}.ts`) : null;
        },
      },
    ],
  })),
  test: {
    include: ["test/**/*.test.ts"],
    // jsonc-parser's own tests, which scripts/own-tests.ts runs.
    exclude: ["test/jsonc-parser/**"],
    // The conformance tests shell out to scripts that parse thousands of inputs.
    testTimeout: 120_000,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "**/dist/**",
      ".cache/**",
      "test/json5/**",
      "test/json5-*/**",
      "test/strip-json-comments*/**",
      "test/jsonc-parser/**",
    ],
  },
  lint: {
    ignorePatterns: [
      "**/dist/**",
      ".cache/**",
      "test/json5/**",
      "test/json5-*/**",
      "test/strip-json-comments*/**",
      "test/jsonc-parser/**",
    ],
    options: { typeAware: true, typeCheck: false },
    // The parser and stringifier detect control characters on purpose.
    rules: { "no-control-regex": "off" },
  },
});
