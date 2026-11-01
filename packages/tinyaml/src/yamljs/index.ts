// A drop-in replacement for yamljs 0.3.0: `import YAML from "tinyaml/yamljs"`
// works as `require("yamljs")` did, and each method is a named export too.
// `stringify` is byte for byte yamljs's. `parse` gives yamljs's values, but
// reads structure as YAML does where yamljs's result is broken; the README
// lists where. Errors are ParseExceptions with tinyaml's messages.
import { DumpException, stringify, type ObjectEncoder } from "./dump.ts";
import { parse, ParseException, type ObjectDecoder } from "./parse.ts";

export type { ObjectDecoder, ObjectEncoder };

type Callback = (result: any) => void;
interface FS {
  readFileSync(path: string, encoding: "utf8"): string;
  readFile(path: string, encoding: "utf8", done: (error: unknown, data?: string) => void): void;
}

/**
 * Reads and parses a YAML file. Node reads it with `fs`, looked up only when
 * called, so bundles for the browser don't pull it in; elsewhere a callback
 * is required and the path is fetched. With a callback, a file that can't be
 * read gives null; without one, the read error is thrown, as in yamljs.
 */
export function parseFile(
  path: string,
  callback?: Callback | null,
  exceptionOnInvalidType?: unknown,
  objectDecoder?: ObjectDecoder | null,
): any {
  const fs = (
    globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
  ).process?.getBuiltinModule?.("fs") as FS | undefined;
  const read = (input: string | null | undefined) =>
    input == null ? null : parse(input, exceptionOnInvalidType, objectDecoder);
  if (!callback) {
    if (!fs) throw new Error("yamljs: reading a file without a callback needs Node");
    return read(fs.readFileSync(path, "utf8"));
  }
  if (fs) fs.readFile(path, "utf8", (error, data) => callback(read(error ? null : data)));
  else
    void fetch(path)
      .then((response) => (response.ok ? response.text() : null))
      .catch(() => null)
      .then((text) => callback(read(text)));
}

const load = parseFile;
const dump = stringify;

export { dump, DumpException, load, parse, ParseException, stringify };

export default { dump, DumpException, load, parse, parseFile, ParseException, stringify };
