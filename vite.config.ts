import { defineConfig } from "vite-plus";

export default defineConfig({
  // ESM only, with types, and publint fails the build on a broken package.json.
  pack: {
    entry: ["src/index.ts"],
    format: ["esm"],
    platform: "neutral",
    fixedExtension: true,
    dts: true,
    clean: true,
    publint: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    // The conformance tests shell out to scripts that parse hundreds of files.
    testTimeout: 120_000,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: ["**/dist/**", ".cache/**"] },
  lint: {
    ignorePatterns: ["**/dist/**", ".cache/**"],
    options: { typeAware: true, typeCheck: false },
    // The loader and dumper detect control characters on purpose.
    rules: { "no-control-regex": "off" },
  },
});
