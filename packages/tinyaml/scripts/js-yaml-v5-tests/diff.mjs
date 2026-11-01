// Points js-yaml 5's test suite at a wrapper that returns js-yaml 5's own
// results but replays every load, loadAll and dump call through
// tinyaml/js-yaml-v5 with the same arguments, and records whether they agree.
import { registerHooks } from "node:module";

const wrapper = new URL("./wrapper.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "js-yaml" && context.parentURL !== wrapper)
      return { url: wrapper, format: "module", shortCircuit: true };
    return next(specifier, context);
  },
});
