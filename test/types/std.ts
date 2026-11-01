// Code written against @std/yaml's types. scripts/types-compat.ts typechecks
// it with "@std/yaml" resolved to the original, to tinyaml/std's source, and
// to the packed tinyaml/std.
import {
  parse,
  parseAll,
  stringify,
  YamlSyntaxError,
  type ParseOptions,
  type SchemaType,
  type StringifyOptions,
  type StyleVariant,
  type YamlPosition,
} from "@std/yaml";
import * as std from "@std/yaml";
import { same } from "./assert.ts";

declare const s: string;
declare const d: Record<string, unknown>;

// parse and parseAll return unknown, so callers narrow or cast.
const value = parse(s, { schema: "core" });
same<typeof value, unknown>(true);
const config = parse(s) as { name: string };
config.name.toUpperCase();
parse(s, {
  schema: "extended",
  allowDuplicateKeys: true,
  onWarning(error) {
    console.warn(error.message, error.line);
  },
});
const docs = parseAll(s, { schema: "json" });
same<typeof docs, unknown[]>(true);
const schema: SchemaType = "failsafe";
const parseOptions: ParseOptions = { schema };
std.parse(s, parseOptions);

const out = stringify(d, { indent: 4, lineWidth: 80 });
same<typeof out, string>(true);
stringify(d);
stringify([1, 2]);
const style: StyleVariant = "hexadecimal";
stringify(d, {
  arrayIndent: false,
  skipInvalid: true,
  flowLevel: 1,
  styles: { "!!int": style, "!!null": "camelcase" },
  schema: "default",
  sortKeys: (a, b, depth) => (depth > 0 ? 0 : a.localeCompare(b)),
  useAnchors: false,
  compatMode: false,
  condenseFlow: true,
  quoteStyle: '"',
});
const stringifyOptions: StringifyOptions = { sortKeys: true };
std.stringify(d, stringifyOptions);

try {
  parse(s);
} catch (e) {
  if (e instanceof YamlSyntaxError) {
    const where: YamlPosition = e;
    console.error(e.name, e.message, where.line, where.column, where.offset, e.snippet);
  }
}
const error: SyntaxError = new YamlSyntaxError("bad", { line: 1, column: 1, offset: 0 }, "a\n^");
void error;
