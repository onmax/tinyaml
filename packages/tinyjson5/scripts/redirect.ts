// Loaded with `node --import`: points the `../lib/index.js` that copied test
// files import at the module in REDIRECT_TARGET (a file URL), so a library's
// own tests run unchanged against tinyjson5 or against the library itself.
import { registerHooks } from "node:module";

const target = process.env.REDIRECT_TARGET!;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "../lib/index.js" && context.parentURL?.includes("/test/"))
      return { url: target, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
