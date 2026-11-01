// The shared parser's errors in @std/yaml's words; see core/codes.ts. std
// words an ill-formed %TAG handle itself, from the directive's arguments.
export const MESSAGES = `


Cannot read document: end of the stream or a document separator is expected
Cannot read document: directive name length must be greater than zero
Cannot handle YAML directive: duplication of %YAML directive
Cannot handle YAML directive: YAML directive accepts exactly one argument
Cannot handle YAML directive: ill-formed argument
Cannot handle YAML directive: unacceptable YAML version
Cannot handle YAML directive: unsupported YAML version
Cannot handle tag directive: directive accepts exactly two arguments

Cannot handle tag directive: previously declared suffix for "%s" tag handle
Cannot handle tag directive: ill-formed tag prefix (second argument) of the TAG directive
unknown document directive "%s"
Cannot read document: directives end mark is expected
Cannot read document: end of the stream or a document separator is expected
Cannot read tag property: unexpected end of stream
Cannot read tag property: duplication of a tag property

Cannot read anchor property: name of an anchor node must contain at least one character
Cannot read anchor property: duplicate anchor property
Cannot read tag property: named tag handle contains invalid characters
Cannot read tag property: undeclared tag handle "%s"
tag suffix cannot contain such characters
Cannot read block: a whitespace character is expected after a node property
tag prefix is malformed: %s
tag name is malformed: %s
unacceptable node kind for !<?> tag; it should be "scalar", not "%s"
Cannot read block: bad indentation of a mapping entry
Cannot read a block mapping entry: a multiline key may not be an implicit key
Cannot read block: a whitespace character is expected after the key-value separator within a block mapping
tab characters must not be used in indentation
Cannot compose node: alias node should not have any properties
Cannot read alias: alias name must contain at least one character
Cannot read alias: unidentified alias "%s"
abnormal merge sequence size
Cannot merge mappings: the provided source object is unacceptable
Cannot store mapping pair: duplicated key

Cannot read block as explicit mapping pair is incomplete: a key node is missed or followed by a non-tabulated empty line
Cannot read block sequence: bad indentation of a sequence entry
Cannot read block: chomping mode identifier repeated
Cannot read block: indentation width identifier repeated
Cannot read block: indentation width must be greater than 0
Cannot read line: line break not found
Cannot read line: line break not found
missing indentation for block scalar

Unexpected end of the stream within a %s quoted scalar
Expected valid JSON character
Unexpected end of the document within a %s quoted scalar
deficient indentation
Cannot read double quoted scalar: expected hexadecimal character
Cannot read double quoted scalar: unknown escape sequence

Stream contains non-printable characters
Cannot read flow collection: unexpected end of the stream within a flow collection
expected the node content, but found ','
Cannot read flow collection: missing comma between flow collection entries

Cannot read tag property: tag suffix cannot contain flow indicator characters`.split("\n");
