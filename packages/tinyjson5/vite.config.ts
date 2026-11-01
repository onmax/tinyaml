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
    // The conformance tests shell out to scripts that parse thousands of inputs.
    testTimeout: 120_000,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: ["**/dist/**", ".cache/**", "test/json5/**"] },
  lint: {
    ignorePatterns: ["**/dist/**", ".cache/**", "test/json5/**"],
    options: { typeAware: true, typeCheck: false },
    // The parser and stringifier detect control characters on purpose.
    rules: { "no-control-regex": "off" },
  },
});
