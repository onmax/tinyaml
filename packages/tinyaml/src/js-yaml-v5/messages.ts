// The shared parser's errors in js-yaml 5's words; see core/codes.ts.
export const MESSAGES = `nesting exceeded maxDepth (%s)
comments must be separated from other tokens by white space characters
end of line expected
null byte is not allowed in input
directive name must not be less than one character in length
duplication of %YAML directive
YAML directive accepts exactly one argument
ill-formed argument of the YAML directive
unacceptable YAML version of the document

TAG directive accepts exactly two arguments
ill-formed tag handle (first argument) of the TAG directive
there is a previously declared suffix for "%s" tag handle
ill-formed tag prefix (second argument) of the TAG directive

directives end mark is expected
end of the stream or a document separator is expected
unexpected end of the stream within a verbatim tag
duplication of a tag property

name of an anchor node must contain at least one character
duplication of an anchor property
named tag handle cannot contain such characters
undeclared tag handle "%s"
tag name cannot contain such characters: %s
a whitespace character is expected after a node property
tag prefix is malformed: %s
tag name is malformed: %s
unacceptable node kind for !<?> tag; it should be "scalar", not "%s"
bad indentation of a mapping entry
can not read a block mapping entry; a multiline key may not be an implicit key
a whitespace character is expected after the key-value separator within a block mapping
tab characters must not be used in indentation
alias node should not have any properties

unidentified alias "%s"
abnormal merge sequence size
cannot merge mappings; the provided source object is unacceptable
duplicated mapping key
merge keys exceeded maxTotalMergeKeys (%s)

bad indentation of a sequence entry
repeat of a chomping mode identifier
repeat of an indentation width identifier
bad explicit indentation width of a block scalar; it cannot be less than one
a line break is expected
a line break is expected

bad indentation of a mapping entry
unexpected end of the stream within a %s quoted scalar
expected valid JSON character
unexpected end of the document within a %s quoted scalar
deficient indentation
expected hexadecimal character
unknown escape sequence

the stream contains non-printable characters
unexpected end of the stream within a flow collection
expected the node content, but found ','
missed comma between flow collection entries


expected ':' after a mapping key

`.split("\n");
