// The shared parser's errors as yaml reports them: its error code, then its
// message, which is js-yaml 4's where yaml's own wording isn't copied. An
// unidentified alias and a bad merge source are other errors, so they have
// no code. Directive warnings are worded where they're raised, from the
// directive's name, and so is the one about an anchor. See core/codes.ts.
export const MESSAGES = `
MISSING_CHAR comments must be separated from other tokens by white space characters
UNEXPECTED_TOKEN end of line expected
UNEXPECTED_TOKEN null byte is not allowed in input

BAD_DIRECTIVE duplication of %YAML directive
BAD_DIRECTIVE YAML directive accepts exactly one argument
BAD_DIRECTIVE ill-formed argument of the YAML directive


BAD_DIRECTIVE TAG directive accepts exactly two arguments
BAD_DIRECTIVE ill-formed tag handle (first argument) of the TAG directive
MISSING_CHAR there is a previously declared suffix for "%s" tag handle

%s
MISSING_CHAR Missing directives-end indicator line
UNEXPECTED_TOKEN end of the stream or a document separator is expected
TAG_RESOLVE_FAILED unexpected end of the stream within a verbatim tag
MULTIPLE_TAGS A node can have at most one tag
TAG_RESOLVE_FAILED tag name is malformed
BAD_ALIAS name of an anchor node must contain at least one character
MULTIPLE_ANCHORS A node can have at most one anchor
TAG_RESOLVE_FAILED named tag handle cannot contain such characters
TAG_RESOLVE_FAILED undeclared tag handle "%s"
MISSING_CHAR tag suffix cannot contain such characters
MISSING_CHAR a whitespace character is expected after a node property
TAG_RESOLVE_FAILED tag prefix is malformed: %s
TAG_RESOLVE_FAILED tag name is malformed: %s
TAG_RESOLVE_FAILED unacceptable node kind for !<?> tag; it should be "scalar", not "%s"
BAD_INDENT bad indentation of a mapping entry
MULTILINE_IMPLICIT_KEY Implicit keys need to be on a single line
MISSING_CHAR a whitespace character is expected after the key-value separator within a block mapping
TAB_AS_INDENT Tabs are not allowed as indentation
ALIAS_PROPS An alias node must not specify any properties

Unresolved alias (the anchor must be set before the alias): %s
UNEXPECTED_TOKEN abnormal merge sequence size
Merge sources must be maps or map aliases
DUPLICATE_KEY Map keys must be unique


MISSING_CHAR bad indentation of a sequence entry
UNEXPECTED_TOKEN repeat of a chomping mode identifier
UNEXPECTED_TOKEN repeat of an indentation width identifier
UNEXPECTED_TOKEN bad explicit indentation width of a block scalar; it cannot be less than one
UNEXPECTED_TOKEN a whitespace character is expected after a block scalar indicator


MISSING_CHAR leading empty lines contain more spaces than the first non-empty line
MISSING_CHAR unexpected end of the stream within a %s quoted scalar
UNEXPECTED_TOKEN expected valid JSON character
MISSING_CHAR unexpected end of the document within a %s quoted scalar
MISSING_CHAR deficient indentation
BAD_DQ_ESCAPE expected hexadecimal character
BAD_DQ_ESCAPE unknown escape sequence
UNEXPECTED_TOKEN unexpected character "%s"
UNEXPECTED_TOKEN the stream contains non-printable characters
BAD_INDENT unexpected end of the stream within a flow collection
UNEXPECTED_TOKEN expected the node content, but found ','
MISSING_CHAR missed comma between flow collection entries
KEY_OVER_1024_CHARS implicit key longer than 1024 characters


`.split("\n");
