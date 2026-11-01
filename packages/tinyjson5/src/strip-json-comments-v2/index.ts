// A drop-in for strip-json-comments 2.0.1.
import { strip } from "../core/strip.ts";

export interface Options {
  /** Replace comments with whitespace instead of removing them. Default true. */
  whitespace?: boolean;
}

const MODE = { strip2: true };

/** Strips comments from JSON, replacing them with whitespace unless `whitespace` is false. */
export default function stripJsonComments(str: string, opts?: Options): string {
  opts = opts || {};
  if (typeof str !== "string") {
    // strip-json-comments 2 reads `str.length` and ends with `str.substr()`,
    // so null throws on the first and anything without substr on the last.
    void (str as unknown as string).length;
    if (typeof (str as unknown as string).substr !== "function")
      throw new TypeError("str.substr is not a function");
    str = String(str);
  }
  return strip(str, opts.whitespace !== false, false, MODE);
}
