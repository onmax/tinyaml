// Loaded with `node --import`, for a library's own tests copied into test/:
// points the library's own `../lib` or `../lib/index.js` at the module in
// REDIRECT_TARGET (a file URL), so the tests run unchanged against tinyjson5
// or against the library itself. Mocha-style tests get node:test's
// `describe` and `it` as globals, `sinon` a stand-in for the one call
// json5 1.0.2's tests make, `sinon.stub(object, name).callsFake(fn)`, and
// `ava` one for strip-json-comments' `t.is` and `t.deepEqual`.
import { transformSync } from "esbuild";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const target = process.env.REDIRECT_TARGET!;
const STAND_INS: Record<string, string> = {
  sinon: new URL("./sinon.ts", import.meta.url).href,
  ava: new URL("./ava.ts", import.meta.url).href,
};
// How each library's tests import it.
// jsonc-parser's format tests import its formatter, which is its `format`.
const LIBRARY = new Set([
  "../lib",
  "../lib/index.js",
  ".",
  "./",
  "./index.js",
  "../main",
  "../impl/format",
]);
// Mocha's BDD and TDD names.
Object.assign(globalThis, { describe, it, suite: describe, test: it });

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/test/")) {
      if (LIBRARY.has(specifier)) return { url: target, shortCircuit: true };
      if (specifier in STAND_INS) return { url: STAND_INS[specifier]!, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  // TypeScript tests written for CommonJS, as jsonc-parser's are: they import
  // types by name without `import type`, which Node's type stripping keeps,
  // and call `import * as assert`, which tsc's CommonJS output makes the
  // module itself. esbuild compiles them, with that import as a default one.
  load(url, context, nextLoad) {
    if (!url.includes("/test/") || !url.endsWith(".test.ts")) return nextLoad(url, context);
    const source = readFileSync(fileURLToPath(url), "utf8").replace(
      "import * as assert from 'assert';",
      "import assert from 'assert';",
    );
    const { code } = transformSync(source, { loader: "ts", format: "esm" });
    return { format: "module", source: code, shortCircuit: true };
  },
});
