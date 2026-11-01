// A drop-in replacement for the `yaml` package's `parse` and `stringify`, on
// tinyaml's shared parser and a port of yaml's stringifier.
//
// Not included: the Document, CST, Lexer, Parser, Composer, LineCounter and
// visitor APIs, parseDocument and parseAllDocuments. `parse` doesn't support
// mapAsMap, stringKeys, strict: false or recovering with logLevel "silent",
// and collection keys become yaml's flow text only approximately.
// `stringify` doesn't take Document or Node values, writes no comments, and
// doesn't use customTags or the YAML 1.1 !!set, !!omap and !!binary tags.
import { YAMLError, YAMLParseError, YAMLWarning } from "./errors.ts";
import { parse, type ParseOptions } from "./parse.ts";
import { stringify, type StringifyOptions } from "./stringify.ts";

export type { ErrorCode, LinePos } from "./errors.ts";
export type { ParseOptions, Reviver } from "./parse.ts";
export type { Pair, StringifyOptions } from "./stringify.ts";
export type { CollectionTag, ScalarTag, Tag, TagId, Tags } from "./tags.ts";

// yaml's option groups, which its `parse` and `stringify` take intersections
// of. Each is the options type of the function it applies to.
export type ToJSOptions = ParseOptions;
export type CreateNodeOptions = StringifyOptions;
export type ToStringOptions = StringifyOptions;
export type DocumentOptions = ParseOptions & StringifyOptions;
export type SchemaOptions = ParseOptions & StringifyOptions;

export { parse, stringify, YAMLError, YAMLParseError, YAMLWarning };

export default { parse, stringify, YAMLError, YAMLParseError, YAMLWarning };
