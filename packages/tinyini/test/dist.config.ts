// Runs the tests against the built dist/, what npm ships, instead of src/:
// `pnpm exec vp test run --config test/dist.config.ts`, which builds first
// when src/ is newer. Imports of an entry's index.ts resolve to its built
// file, here and in the scripts the conformance tests run. Tests of
// internal modules, such as the message tables, still read src/.
import { defineConfig, mergeConfig, type Plugin } from "vite-plus";
import { build, builtFile } from "../scripts/dist.ts";
import base from "../vite.config.ts";

build();

export const dist: Plugin = {
  name: "tinyini-dist",
  enforce: "pre",
  async resolveId(id, importer) {
    if (!importer) return null;
    const resolved = await this.resolve(id, importer, { skipSelf: true });
    return (resolved && builtFile(resolved.id)) ?? null;
  },
};

const loader = new URL("../scripts/dist-loader.ts", import.meta.url).href;

export default mergeConfig(
  base,
  defineConfig({
    plugins: [dist],
    test: {
      // For the scripts the conformance tests start.
      env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${loader}`.trim() },
    },
  }),
);
