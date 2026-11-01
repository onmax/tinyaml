// jsonc-parser 3.3.1 as an ES module with named exports, for its own tests
// (scripts/own-tests.ts): its ESM build has no "type": "module", and its UMD
// build hides the names from Node's CommonJS analysis.
import { createRequire } from "node:module";

const jsonc = createRequire(import.meta.url)("jsonc-parser") as typeof import("jsonc-parser");
export const {
  createScanner,
  ScanError,
  SyntaxKind,
  getLocation,
  parse,
  parseTree,
  findNodeAtLocation,
  findNodeAtOffset,
  getNodePath,
  getNodeValue,
  visit,
  stripComments,
  ParseErrorCode,
  printParseErrorCode,
  format,
  modify,
  applyEdits,
} = jsonc;
