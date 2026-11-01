// A drop-in for strip-json-comments 5.0.3.
import { strip } from "../core/strip.ts";

export interface Options {
  /** Replace comments and trailing commas with whitespace instead of removing them. Default true. */
  readonly whitespace?: boolean;
  /** Strip trailing commas in addition to comments. Default false. */
  readonly trailingCommas?: boolean;
}

const MODE = { strip5: true };

/** Strips comments, and with `trailingCommas` trailing commas, from JSON. */
export default function stripJsonComments(
  jsonString: string,
  { whitespace = true, trailingCommas = false }: Options = {},
): string {
  if (typeof jsonString !== "string")
    throw new TypeError(
      `Expected argument \`jsonString\` to be a \`string\`, got \`${typeof jsonString}\``,
    );
  return strip(jsonString, whitespace, trailingCommas, MODE);
}
