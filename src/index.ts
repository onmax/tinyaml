import { parse } from "./parse.ts";
import { stringify } from "./stringify.ts";

export { parse, stringify };
export type { Reviver } from "./parse.ts";
export type { Replacer, StringifyOptions } from "./stringify.ts";

const JSON5: { parse: typeof parse; stringify: typeof stringify } = { parse, stringify };
export default JSON5;
