// A drop-in replacement for ini 4.1.3 to 7.0.0: `import ini from "tinyini/ini"`
// works as `require("ini")` does, and each function is a named export too.
// The README lists where it differs.
import { safe, unsafe } from "../core/escape.ts";
import { withMode } from "../core/mode.ts";
import { decode as parse } from "../core/parse.ts";
import { encode as write } from "../core/stringify.ts";

export type { DecodeOptions } from "../core/parse.ts";
export type { EncodeOptions } from "../core/stringify.ts";

const MODE = {};
const decode: typeof parse = withMode(MODE, parse);
const encode: typeof write = withMode(MODE, write);

export { decode, decode as parse, encode, encode as stringify, safe, unsafe };

const ini: {
  parse: typeof decode;
  decode: typeof decode;
  stringify: typeof encode;
  encode: typeof encode;
  safe: typeof safe;
  unsafe: typeof unsafe;
} = { parse: decode, decode, stringify: encode, encode, safe, unsafe };
export default ini;
