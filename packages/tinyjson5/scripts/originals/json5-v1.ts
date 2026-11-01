// json5-v1 as an ES module default export, for its own tests (scripts/own-tests.ts):
// Node 22 gives an empty object for a CommonJS module that a resolve hook
// hands to import, where later Node gives module.exports.
import { createRequire } from "node:module";

export default createRequire(import.meta.url)("json5-v1");
