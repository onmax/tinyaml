import { safe, unsafe } from "./escape.ts";
import { decode } from "./parse.ts";
import { encode } from "./stringify.ts";

export { decode, decode as parse, encode, encode as stringify, safe, unsafe };
export type { DecodeOptions } from "./parse.ts";
export type { EncodeOptions } from "./stringify.ts";

const ini: {
  parse: typeof decode;
  decode: typeof decode;
  stringify: typeof encode;
  encode: typeof encode;
  safe: typeof safe;
  unsafe: typeof unsafe;
} = { parse: decode, decode, stringify: encode, encode, safe, unsafe };
export default ini;
