// A drop-in for strip-json-comments 3.1.1.
import { strip } from "../core/strip.ts";

export interface Options {
  /** Replace comments with whitespace instead of removing them. Default true. */
  readonly whitespace?: boolean;
}

const MODE = {};

/** Strips comments from JSON, replacing them with whitespace unless `whitespace` is false. */
export default function stripJsonComments(jsonString: string, options: Options = {}): string {
  if (typeof jsonString !== "string")
    throw new TypeError(
      `Expected argument \`jsonString\` to be a \`string\`, got \`${typeof jsonString}\``,
    );
  return strip(jsonString, options.whitespace !== false, false, MODE);
}
