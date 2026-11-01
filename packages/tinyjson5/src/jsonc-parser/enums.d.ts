// jsonc-parser 3.3.1's enum declarations, from its main.d.ts (MIT, Copyright
// (c) Microsoft Corporation), as `declare enum` where it has `declare const
// enum`: code then reads the objects enums.js holds instead of inlining the
// numbers, which also works with isolatedModules and verbatimModuleSyntax.
export declare enum ScanError {
  None = 0,
  UnexpectedEndOfComment = 1,
  UnexpectedEndOfString = 2,
  UnexpectedEndOfNumber = 3,
  InvalidUnicode = 4,
  InvalidEscapeCharacter = 5,
  InvalidCharacter = 6,
}
export declare enum SyntaxKind {
  OpenBraceToken = 1,
  CloseBraceToken = 2,
  OpenBracketToken = 3,
  CloseBracketToken = 4,
  CommaToken = 5,
  ColonToken = 6,
  NullKeyword = 7,
  TrueKeyword = 8,
  FalseKeyword = 9,
  StringLiteral = 10,
  NumericLiteral = 11,
  LineCommentTrivia = 12,
  BlockCommentTrivia = 13,
  LineBreakTrivia = 14,
  Trivia = 15,
  Unknown = 16,
  EOF = 17,
}
export declare enum ParseErrorCode {
  InvalidSymbol = 1,
  InvalidNumberFormat = 2,
  PropertyNameExpected = 3,
  ValueExpected = 4,
  ColonExpected = 5,
  CommaExpected = 6,
  CloseBraceExpected = 7,
  CloseBracketExpected = 8,
  EndOfFileExpected = 9,
  InvalidCommentToken = 10,
  UnexpectedEndOfComment = 11,
  UnexpectedEndOfString = 12,
  UnexpectedEndOfNumber = 13,
  InvalidUnicode = 14,
  InvalidEscapeCharacter = 15,
  InvalidCharacter = 16,
}
