// The shared parser's errors in plain English, for tinyaml's own API and
// tinyaml/yamljs; see codes.ts. A line one of them never raises is empty in
// its mode's build: yamljs has no depth or merged keys limit and allows
// duplicate keys, and neither takes warnings. In source, the mode flags are
// all false when this runs, so every line is there.
import { lenient, spec } from "./mode.ts";

export const MESSAGES = `${lenient ? "" : "nesting exceeds maxDepth (%s)"}
${lenient ? "" : "a comment needs white space before it"}
${lenient ? "" : "expected the end of the line"}
null byte in input
${spec ? "" : "empty directive name"}
repeated %YAML directive
%YAML takes one argument
${spec ? "" : "bad %YAML version"}


%TAG takes two arguments
bad %TAG handle
repeated %TAG handle "%s"
bad %TAG prefix

expected "---" after directives
expected a document marker or the end of input
unclosed verbatim tag
repeated tag
${lenient ? "" : "tag contains white space"}
empty anchor name
repeated anchor
bad tag handle
undeclared tag handle "%s"
bad tag suffix
expected white space after a tag or anchor
bad escape in tag prefix: %s
bad escape in tag: %s
!<?> needs a scalar, not a %s
bad indentation of a mapping entry
an implicit key must be on one line
expected white space after ":"
tab in indentation
an alias can't have a tag or anchor
${spec ? "" : "empty alias name"}
unknown alias "%s"

can only merge mappings
${lenient ? "" : "duplicated mapping key"}
${lenient ? "" : "too many merged keys (%s)"}
${spec ? "" : "missing mapping key"}
bad indentation of a sequence entry
repeated chomping indicator
repeated indentation indicator
indentation indicator can't be 0
expected white space after a block scalar header
${spec ? "" : "expected a line break after a block scalar header"}
${spec ? "" : "block scalar isn't indented"}
${lenient ? "" : "leading empty lines are indented more than the text"}
unclosed %s-quoted scalar
control character in a quoted scalar
document ends inside a %s-quoted scalar
too little indentation
bad hex escape
unknown escape
${lenient ? "" : 'unexpected character "%s"'}
non-printable character
unclosed flow collection
unexpected ","
missing comma in flow collection
${lenient ? "" : "implicit key longer than 1024 characters"}

${spec ? "" : 'expected ":" after an implicit key'}

`.split("\n");
