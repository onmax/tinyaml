// Code written against yaml 2's types, `parse` and `stringify` only.
// scripts/types-compat.ts typechecks it with "yaml" resolved to the
// original, to tinyaml/yaml's source, and to the packed tinyaml/yaml.
//
// Compiles against yaml only, on purpose: everything built on its Document
// and node classes, which tinyaml doesn't have. That covers parseDocument,
// parseAllDocuments, Document, Scalar, YAMLMap, YAMLSeq, Pair, Alias, Schema,
// visit, Lexer, Parser, Composer, LineCounter and CST, and the options that
// take them: `schema` as a Schema instance, `lineCounter`, `onTagObj`,
// `commentString` and a `uniqueKeys` function.
import YAML, {
  parse,
  stringify,
  YAMLError,
  YAMLParseError,
  YAMLWarning,
  type CollectionTag,
  type CreateNodeOptions,
  type DocumentOptions,
  type ErrorCode,
  type ParseOptions,
  type ScalarTag,
  type SchemaOptions,
  type TagId,
  type Tags,
  type ToJSOptions,
  type ToStringOptions,
} from "yaml";
import * as yaml from "yaml";
import { same } from "./assert.ts";

declare const src: string;

// parse returns any, as in yaml.
const value = parse(src, { merge: true });
same<typeof value, any>(true);
void value.anything.goes;
parse(src);
parse(src, { schema: "core", uniqueKeys: false, prettyErrors: true, strict: true });
parse(src, { version: "1.1", logLevel: "error", intAsBigInt: true, maxAliasCount: -1 });
parse(src, { customTags: ["timestamp"], resolveKnownTags: false, mapAsMap: false });
parse(src, (key, value) => (key === "date" ? new Date(value as string) : value));
parse(src, (_key, value) => value, { merge: true });
// Tag objects, typed as yaml types them.
const re: ScalarTag = { tag: "!re", resolve: (str) => new RegExp(str.toUpperCase()) };
const join: CollectionTag = {
  tag: "!join",
  collection: "seq",
  resolve: (node, onError) => {
    if (!node.items.length) onError("empty");
    return node.toJSON();
  },
};
const ids: TagId[] = ["timestamp", "binary"];
const tags: Tags = [re, join, ...ids];
parse(src, { customTags: tags });
parse(src, { customTags: (base) => [...base, re] });
parse(src, { compat: "yaml-1.1", onAnchor: (anchored, count) => console.log(anchored, count) });
const typed: { name: string } = YAML.parse(src);
void typed;
yaml.parse(src);

const parseOptions: ParseOptions & DocumentOptions & SchemaOptions & ToJSOptions = {
  merge: true,
  version: "1.2",
  maxAliasCount: 100,
};
parse(src, parseOptions);

// stringify returns string.
const out = stringify({ a: 1 }, { indent: 4, lineWidth: 0 });
same<typeof out, string>(true);
stringify({ a: 1 });
stringify([1, 2], null, 2);
stringify([1, 2], null, "  ");
stringify({ a: 1, b: 2 }, ["a"]);
stringify({ a: 1 }, (_key, value) => value, { indent: 2 });
stringify(
  { a: "x", b: undefined },
  {
    aliasDuplicateObjects: false,
    blockQuote: "literal",
    collectionStyle: "block",
    defaultKeyType: "PLAIN",
    defaultStringType: "QUOTE_DOUBLE",
    directives: true,
    doubleQuotedAsJSON: true,
    flowCollectionPadding: false,
    indentSeq: false,
    keepUndefined: true,
    minContentWidth: 0,
    nullStr: "~",
    simpleKeys: true,
    singleQuote: true,
    sortMapEntries: true,
    trailingComma: false,
    version: "1.1",
  },
);
stringify({ a: "yes" }, { compat: "yaml-1.1" });
stringify({ b: 1, a: 2 }, { sortMapEntries: (a, b) => (String(a.key) < String(b.key) ? -1 : 1) });
const toString: ToStringOptions & CreateNodeOptions = { lineWidth: 120, flow: true };
YAML.stringify({ a: 1 }, toString);
yaml.stringify({ a: 1 });

// Errors.
try {
  parse(src);
} catch (e) {
  if (e instanceof YAMLParseError) {
    const code: ErrorCode = e.code;
    const [start, end]: [number, number] = e.pos;
    const line = e.linePos?.[0].line;
    const col = e.linePos?.[0].col;
    console.error(e.name, e.message, code, start, end, line, col);
  }
  if (e instanceof YAMLError) console.error(e.code);
}
const warning = new YAMLWarning([0, 1], "BAD_INDENT", "bad");
const name: "YAMLParseError" | "YAMLWarning" = warning.name;
const asError: Error = new YAML.YAMLParseError([0, 1], "IMPOSSIBLE", "x");
void name;
void asError;
