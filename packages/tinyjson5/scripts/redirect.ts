// Loaded with `node --import`, for a library's own tests copied into test/:
// points the library's own `../lib` or `../lib/index.js` at the module in
// REDIRECT_TARGET (a file URL), so the tests run unchanged against tinyjson5
// or against the library itself. Mocha-style tests get node:test's
// `describe` and `it` as globals, and `sinon` a stand-in for the one call
// json5 1.0.2's tests make, `sinon.stub(object, name).callsFake(fn)`.
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

const target = process.env.REDIRECT_TARGET!;
const SINON = new URL("./sinon.ts", import.meta.url).href;
Object.assign(globalThis, { describe, it });

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/test/")) {
      if (specifier === "../lib" || specifier === "../lib/index.js")
        return { url: target, shortCircuit: true };
      if (specifier === "sinon") return { url: SINON, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
