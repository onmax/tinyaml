// Swaps js-yaml for tinyaml/js-yaml-v5 inside js-yaml 5's own test suite, so
// its assertions run against tinyaml unchanged. See shim.mjs.
import { registerHooks } from "node:module";

const shim = new URL("./shim.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "js-yaml") return { url: shim, format: "module", shortCircuit: true };
    return next(specifier, context);
  },
});
