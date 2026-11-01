import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// Each mode's entries, built together. src/core/mode.ts resolves to
// src/core/mode/<mode>.ts there, whose constants the bundler folds, so an
// entry carries none of the other modes' branches.
export const MODES = {
  root: { index: "src/index.ts" },
  ini: { ini: "src/ini/index.ts" },
  v2: { "ini-v2": "src/ini-v2/index.ts" },
  v1: { "ini-v1": "src/ini-v1/index.ts" },
  one: { "one-ini": "src/one-ini/index.ts" },
  one01: { "one-ini-v0.1": "src/one-ini-v0.1/index.ts" },
};
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const MODE = here("src/core/mode.ts");

export default defineConfig({
  // ESM only, with types, and publint fails the build on a broken package.json.
  // tsdown cleans once, and runs publint once every build is done.
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
        name: "tinyini-mode",
        async resolveId(id: string, importer: string | undefined) {
          if (!importer || !id.endsWith("mode.ts")) return null;
          const resolved = await this.resolve(id, importer, { skipSelf: true });
          return resolved?.id === MODE ? here(`src/core/mode/${mode}.ts`) : null;
        },
        // In a build the flags are constants, so an entry's functions are the
        // core's as they are: `withMode(MODE, fn)` becomes `fn`, and MODE goes.
        transform(code: string, id: string) {
          if (!Object.values(entry).some((file) => id === here(file))) return null;
          const out = code
            .replace(/^const MODE = \{[^}]*\};$/m, "")
            .replace(/withMode\(MODE, (\w+)\)/g, "$1");
          if (out.includes("MODE")) throw new Error(`${id}: MODE is left after removing withMode`);
          return out;
        },
      },
    ],
  })),
  test: {
    include: ["test/**/*.test.ts"],
    // The conformance tests shell out to scripts that parse thousands of inputs.
    testTimeout: 120_000,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: ["**/dist/**", ".cache/**", "test/suites/**", "test/samples/**"] },
  lint: {
    ignorePatterns: ["**/dist/**", ".cache/**", "test/suites/**"],
    options: { typeAware: true, typeCheck: false },
    // ini 1.x to 4.0 split section names around U+0001 and U+0002 placeholders.
    rules: { "no-control-regex": "off" },
  },
});
