// The shared parser's error codes. The parser reports a code, plus an
// argument where the wording names something, and each entry words it with
// its own table (Engine.messages), so no entry bundles another's wording.
// A table has one line per code, in this order, with `%s` for the argument;
// a code the entry can't run into gets an empty line.
// Bundlers inline these, so they cost nothing.

export const MAX_DEPTH = 0; // the limit
export const COMMENT_SPACE = 1;
export const LINE_END = 2;
export const NULL_BYTE = 3;
export const DIRECTIVE_NAME = 4;
export const YAML_REPEATED = 5;
export const YAML_ARGS = 6;
export const YAML_ARG = 7;
export const YAML_VERSION = 8;
/** A warning. */
export const YAML_UNSUPPORTED = 9;
export const TAG_ARGS = 10;
export const TAG_HANDLE = 11;
export const TAG_REDECLARED = 12; // the handle
export const TAG_PREFIX = 13;
/** A warning. */
export const DIRECTIVE_UNKNOWN = 14; // the name
export const DIRECTIVES_END = 15;
export const DOCUMENT_END = 16;
export const VERBATIM_END = 17;
export const TAG_REPEATED = 18;
export const TAG_SPACE = 19;
export const ANCHOR_EMPTY = 20;
export const ANCHOR_REPEATED = 21;
export const HANDLE_CHARS = 22;
export const HANDLE_UNDECLARED = 23; // the handle
export const SUFFIX_CHARS = 24;
export const PROPERTY_SPACE = 25;
export const PREFIX_ENCODING = 26; // the prefix
export const TAG_ENCODING = 27; // the tag
export const NON_SPECIFIC = 28; // the node's kind
export const MAP_INDENT = 29;
export const MULTILINE_KEY = 30;
export const VALUE_SPACE = 31;
export const TAB_INDENT = 32;
export const ALIAS_PROPS = 33;
export const ALIAS_EMPTY = 34;
export const ALIAS_UNKNOWN = 35; // the name
export const MERGE_SIZE = 36;
export const MERGE_SOURCE = 37;
export const DUPLICATE_KEY = 38;
export const MERGE_KEYS = 39; // the limit
export const KEY_MISSING = 40;
export const SEQ_INDENT = 41;
export const CHOMP_REPEATED = 42;
export const WIDTH_REPEATED = 43;
export const WIDTH_ZERO = 44;
export const HEADER_SPACE = 45;
export const HEADER_BREAK = 46;
export const BLOCK_INDENT = 47;
export const LEADING_EMPTY = 48;
export const QUOTED_END = 49; // "single" or "double"
export const CONTROL_CHAR = 50;
export const QUOTED_DOCUMENT_END = 51; // "single" or "double"
/** A warning where js-yaml 4 only warns. */
export const DEFICIENT_INDENT = 52;
export const HEX_ESCAPE = 53;
export const UNKNOWN_ESCAPE = 54;
export const UNEXPECTED_CHAR = 55; // the character
export const NON_PRINTABLE = 56;
export const FLOW_END = 57;
export const EMPTY_ENTRY = 58;
export const MISSED_COMMA = 59;
export const KEY_LENGTH = 60;
export const TAG_FLOW = 61;
export const KEY_COLON = 62;
/** A warning in `spec` mode only. */
export const ANCHOR_COLON = 63;
/** A warning in `lenient` mode only. */
export const NON_ASCII_BREAKS = 64;
