// A drop-in replacement for ini 2.0.0, which behaves as 3.0.x and 4.0.0 do outside Windows:
// `import ini from "tinyini/ini-v2"` works as `require("ini")` does, and each
// function is a named export too. The README lists where it differs.
import { safe, unsafe } from "../core/escape.ts";
import { withMode } from "../core/mode.ts";
import { decode as parse } from "../core/parse.ts";
import { encode as write } from "../core/stringify.ts";

/** What ini 2.0.0's encode reads from its options; it ignores ini 4.1's others. */
export interface EncodeOptions {
  /** A section to put the top-level keys in, and to prefix every other section with. */
  section?: string;
  /** Write ` = ` instead of `=`. */
  whitespace?: boolean;
}

const MODE = { legacy: true };
const decode: (str: string) => Record<string, any> = withMode(MODE, parse);
const encode: (object: any, options?: EncodeOptions | string) => string = withMode(MODE, write);

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
