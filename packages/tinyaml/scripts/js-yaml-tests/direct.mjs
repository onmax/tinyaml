// Swaps js-yaml for tinyaml inside js-yaml 4's own test suite, so its
// assertions run against tinyaml unchanged. run.sh loads it with --import.
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// A path, which both require and import resolve.
const tinyaml = fileURLToPath(new URL("../../src/js-yaml/index.ts", import.meta.url));

registerHooks({
  resolve(specifier, context, next) {
    // Through `next`, so scripts/dist-loader.ts can point it at dist/.
    if (specifier === "js-yaml") return next(tinyaml, context);
    return next(specifier, context);
  },
});
