// Puts a tinyini entry in place of @one-ini/wasm for everything the process
// loads: `node --import ./scripts/one-ini-loader.ts`, with ONE_INI set to the
// file of the entry, such as src/one-ini/index.ts or dist/one-ini.mjs.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const entry = process.env.ONE_INI;
if (!entry) throw new Error("ONE_INI must name the tinyini entry to load");
const url = pathToFileURL(entry).href;

registerHooks({
  resolve(specifier, context, next) {
    return specifier === "@one-ini/wasm" ? { url, shortCircuit: true } : next(specifier, context);
  },
});
