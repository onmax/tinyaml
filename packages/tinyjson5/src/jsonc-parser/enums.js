// The objects jsonc-parser 3.3.1's TypeScript enums compile to: each name maps
// to its number and each number back to its name. enums.d.ts declares them.
function enumOf(names, first) {
  const object = {};
  names.split(" ").forEach((name, i) => (object[(object[name] = i + first)] = name));
  return object;
}

export const ScanError = enumOf(
  "None UnexpectedEndOfComment UnexpectedEndOfString UnexpectedEndOfNumber InvalidUnicode InvalidEscapeCharacter InvalidCharacter",
  0,
);
export const SyntaxKind = enumOf(
  "OpenBraceToken CloseBraceToken OpenBracketToken CloseBracketToken CommaToken ColonToken NullKeyword TrueKeyword FalseKeyword StringLiteral NumericLiteral LineCommentTrivia BlockCommentTrivia LineBreakTrivia Trivia Unknown EOF",
  1,
);
export const ParseErrorCode = enumOf(
  "InvalidSymbol InvalidNumberFormat PropertyNameExpected ValueExpected ColonExpected CommaExpected CloseBraceExpected CloseBracketExpected EndOfFileExpected InvalidCommentToken UnexpectedEndOfComment UnexpectedEndOfString UnexpectedEndOfNumber InvalidUnicode InvalidEscapeCharacter InvalidCharacter",
  1,
);
