// Points js-yaml 4's test suite at a wrapper that returns js-yaml's results
// but replays every load, loadAll and dump call through tinyaml with the same
// arguments and records whether they agree. run.sh loads it with --import.
import { registerHooks } from "node:module";

const wrapper = new URL("./wrapper.cjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "js-yaml" && context.parentURL !== wrapper)
      return { url: wrapper, shortCircuit: true };
    return next(specifier, context);
  },
});
