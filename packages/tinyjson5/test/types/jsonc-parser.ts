// jsonc-parser's enums used as a TypeScript program uses them, which must
// type-check against tinyjson5/jsonc-parser as against jsonc-parser. tsrs
// checks this file.
import {
  createScanner,
  ParseErrorCode,
  printParseErrorCode,
  ScanError,
  SyntaxKind,
} from "../../src/jsonc-parser/index.ts";

const kind: SyntaxKind = SyntaxKind.StringLiteral;
const member: SyntaxKind.StringLiteral = SyntaxKind.StringLiteral;
const scanner = createScanner('"a"');
const scanned: SyntaxKind = scanner.scan();
const error: ScanError = scanner.getTokenError();
const none: ScanError.None = ScanError.None;
const name: "InvalidSymbol" | "<unknown ParseErrorCode>" | string = printParseErrorCode(
  ParseErrorCode.InvalidSymbol,
);
const code: ParseErrorCode.ValueExpected = ParseErrorCode.ValueExpected;
const reverse: string = SyntaxKind[10]!;

export const used = [kind, member, scanned, error, none, name, code, reverse];
