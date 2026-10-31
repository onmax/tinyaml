// Points every `import ... from 'js-yaml'` in js-yaml's own test files at the
// recording wrapper.
import { registerHooks } from "node:module";

const wrapper = new URL("./wrapper.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "js-yaml" && context.parentURL !== wrapper)
      return { url: wrapper, shortCircuit: true };
    return next(specifier, context);
  },
});
