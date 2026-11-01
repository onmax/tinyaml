// tinyini's own API: INI with ini's comments, sections and `key[]` arrays,
// and nothing kept only for compatibility. For drop-in replacements of other
// INI libraries, see the `tinyini/*` subpaths.
export { parse } from "./parse.ts";
export { stringify, type StringifyOptions } from "./stringify.ts";
