import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// Each mode's entries, built together. src/core/mode.ts resolves to
// src/core/mode/<mode>.ts there, whose constants the bundler folds, so an
// entry carries none of the other modes' branches.
export const MODES = {
  ini: { index: "src/index.ts", ini: "src/ini/index.ts" },
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
  },
});
