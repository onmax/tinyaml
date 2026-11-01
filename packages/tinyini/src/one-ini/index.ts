// A drop-in replacement for @one-ini/wasm 0.2.x: 0.2.0 to 0.2.2, which `editorconfig` 3 uses, in JavaScript:
// `import { parse_to_uint32array } from "tinyini/one-ini"` works as the same
// import from "@one-ini/wasm" does. The README lists where it differs.
import { withMode } from "../core/mode.ts";
import {
  parse_to_json as json,
  parse_to_uint32array as tokens,
  TokenTypes,
  version as ver,
} from "../core/one-ini.ts";

const MODE = { emptyValues: true };
const parse_to_json: typeof json = withMode(MODE, json);
const parse_to_uint32array: typeof tokens = withMode(MODE, tokens);
const version: typeof ver = withMode(MODE, ver);

export { parse_to_json, parse_to_uint32array, TokenTypes, version };
export default { parse_to_json, version, parse_to_uint32array, TokenTypes };
