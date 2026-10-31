export { YAMLException } from "./error.ts";
export { loadAll } from "./load.ts";
export { dump } from "./dump.ts";
export type { DumpOptions } from "./dump.ts";

import { YAMLException } from "./error.ts";
import { loadAll } from "./load.ts";

/** Parses a single YAML document. Empty input gives `undefined`. */
export function load(input: string): unknown {
  const docs = loadAll(input);
  if (docs.length > 1)
    throw new YAMLException("expected a single document in the stream, but found more");
  return docs[0];
}
