// Runs yaml 2.9.1's own tests (cloned to .cache/yaml-src) with `yaml`
// resolved to shim.ts, or to the real package with UPSTREAM_BASELINE=1.
// With DIST=1, shim.ts wraps the built dist/yaml.mjs instead of src/.
// Run `pnpm fixtures` first. run.ts runs it and checks the results.
// Usage: node scripts/yaml-upstream/run.ts, or pnpm exec vp test --config
// scripts/yaml-upstream/vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { dist } from "../../test/dist.config.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("../.."),
  plugins: process.env.DIST ? [dist] : [],
  resolve: {
    alias: [
      { find: /^yaml\/util$/, replacement: here("../../node_modules/yaml/dist/util.js") },
      {
        find: /^yaml$/,
        replacement: process.env.UPSTREAM_BASELINE
          ? here("../../node_modules/yaml/dist/index.js")
          : here("./shim.ts"),
      },
    ],
  },
  test: {
    globals: true,
    setupFiles: [here("./setup.ts")],
    // Whole values in failure messages, which run.ts records.
    chaiConfig: { truncateThreshold: 0 },
    include: [
      ".cache/yaml-src/tests/doc/stringify.ts",
      ".cache/yaml-src/tests/doc/parse.ts",
      ".cache/yaml-src/tests/doc/errors.ts",
      ".cache/yaml-src/tests/doc/types.ts",
      ".cache/yaml-src/tests/doc/anchors.ts",
    ],
  },
});
