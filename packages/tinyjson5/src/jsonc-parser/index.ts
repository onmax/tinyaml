// A drop-in for jsonc-parser 3.3.1 (MIT, Copyright (c) Microsoft
// Corporation): its API, types and documentation, on a port of its code.
import * as edit from "./edit.ts";
import * as formatter from "./format.ts";
import * as parser from "./parser.ts";
import * as scanner from "./scanner.ts";

// jsonc-parser's enums are TypeScript enums: objects that map each name to
// its number and each number back to its name. Here each is such an object,
// a type of its numbers, and a namespace of a type per member, which is what
// an enum declares. The type takes any number too, as a numeric enum does.
// Typed by the declaration each export gives it.
function enumOf(names: string, first: number): never {
  const object: Record<string | number, string | number> = {};
  names.split(" ").forEach((name, i) => (object[(object[name] = i + first)] = name));
  return object as never;
}

/**
 * Creates a JSON scanner on the given text.
 * If ignoreTrivia is set, whitespaces or comments are ignored.
 */
export const createScanner: (text: string, ignoreTrivia?: boolean) => JSONScanner =
  scanner.createScanner;

export const ScanError: {
  readonly None: 0;
  readonly UnexpectedEndOfComment: 1;
  readonly UnexpectedEndOfString: 2;
  readonly UnexpectedEndOfNumber: 3;
  readonly InvalidUnicode: 4;
  readonly InvalidEscapeCharacter: 5;
  readonly InvalidCharacter: 6;
  readonly [code: number]: string;
} = enumOf(
  "None UnexpectedEndOfComment UnexpectedEndOfString UnexpectedEndOfNumber InvalidUnicode InvalidEscapeCharacter InvalidCharacter",
  0,
);
export type ScanError = 0 | 1 | 2 | 3 | 4 | 5 | 6 | (number & {});
export declare namespace ScanError {
  type None = 0;
  type UnexpectedEndOfComment = 1;
  type UnexpectedEndOfString = 2;
  type UnexpectedEndOfNumber = 3;
  type InvalidUnicode = 4;
  type InvalidEscapeCharacter = 5;
  type InvalidCharacter = 6;
}

export const SyntaxKind: {
  readonly OpenBraceToken: 1;
  readonly CloseBraceToken: 2;
  readonly OpenBracketToken: 3;
  readonly CloseBracketToken: 4;
  readonly CommaToken: 5;
  readonly ColonToken: 6;
  readonly NullKeyword: 7;
  readonly TrueKeyword: 8;
  readonly FalseKeyword: 9;
  readonly StringLiteral: 10;
  readonly NumericLiteral: 11;
  readonly LineCommentTrivia: 12;
  readonly BlockCommentTrivia: 13;
  readonly LineBreakTrivia: 14;
  readonly Trivia: 15;
  readonly Unknown: 16;
  readonly EOF: 17;
  readonly [code: number]: string;
} = enumOf(
  "OpenBraceToken CloseBraceToken OpenBracketToken CloseBracketToken CommaToken ColonToken NullKeyword TrueKeyword FalseKeyword StringLiteral NumericLiteral LineCommentTrivia BlockCommentTrivia LineBreakTrivia Trivia Unknown EOF",
  1,
);
export type SyntaxKind =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | (number & {});
export declare namespace SyntaxKind {
  type OpenBraceToken = 1;
  type CloseBraceToken = 2;
  type OpenBracketToken = 3;
  type CloseBracketToken = 4;
  type CommaToken = 5;
  type ColonToken = 6;
  type NullKeyword = 7;
  type TrueKeyword = 8;
  type FalseKeyword = 9;
  type StringLiteral = 10;
  type NumericLiteral = 11;
  type LineCommentTrivia = 12;
  type BlockCommentTrivia = 13;
  type LineBreakTrivia = 14;
  type Trivia = 15;
  type Unknown = 16;
  type EOF = 17;
}

/**
 * The scanner object, representing a JSON scanner at a position in the input string.
 */
export interface JSONScanner {
  /**
   * Sets the scan position to a new offset. A call to 'scan' is needed to get the first token.
   */
  setPosition(pos: number): void;
  /**
   * Read the next token. Returns the token code.
   */
  scan(): SyntaxKind;
  /**
   * Returns the zero-based current scan position, which is after the last read token.
   */
  getPosition(): number;
  /**
   * Returns the last read token.
   */
  getToken(): SyntaxKind;
  /**
   * Returns the last read token value. The value for strings is the decoded string content. For numbers it's of type number, for boolean it's true or false.
   */
  getTokenValue(): string;
  /**
   * The zero-based start offset of the last read token.
   */
  getTokenOffset(): number;
  /**
   * The length of the last read token.
   */
  getTokenLength(): number;
  /**
   * The zero-based start line number of the last read token.
   */
  getTokenStartLine(): number;
  /**
   * The zero-based start character (column) of the last read token.
   */
  getTokenStartCharacter(): number;
  /**
   * An error code of the last scan.
   */
  getTokenError(): ScanError;
}

/**
 * For a given offset, evaluate the location in the JSON document. Each segment in the location path is either a property name or an array index.
 */
export const getLocation: (text: string, position: number) => Location = parser.getLocation;

/**
 * Parses the given text and returns the object the JSON content represents. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 * Therefore, always check the errors list to find out if the input was valid.
 */
export const parse: (text: string, errors?: ParseError[], options?: ParseOptions) => any =
  parser.parse;

/**
 * Parses the given text and returns a tree representation the JSON content. On invalid input, the parser tries to be as fault tolerant as possible, but still return a result.
 */
export const parseTree: (
  text: string,
  errors?: ParseError[],
  options?: ParseOptions,
) => Node | undefined = parser.parseTree;

/**
 * Finds the node at the given path in a JSON DOM.
 */
export const findNodeAtLocation: (root: Node, path: JSONPath) => Node | undefined =
  parser.findNodeAtLocation;

/**
 * Finds the innermost node at the given offset. If includeRightBound is set, also finds nodes that end at the given offset.
 */
export const findNodeAtOffset: (
  root: Node,
  offset: number,
  includeRightBound?: boolean,
) => Node | undefined = parser.findNodeAtOffset;

/**
 * Gets the JSON path of the given JSON DOM node
 */
export const getNodePath: (node: Node) => JSONPath = parser.getNodePath;

/**
 * Evaluates the JavaScript object of the given JSON DOM node
 */
export const getNodeValue: (node: Node) => any = parser.getNodeValue;

/**
 * Parses the given text and invokes the visitor functions for each object, array and literal reached.
 */
export const visit: (text: string, visitor: JSONVisitor, options?: ParseOptions) => any =
  parser.visit;

/**
 * Takes JSON with JavaScript-style comments and remove
 * them. Optionally replaces every none-newline character
 * of comments with a replaceCharacter
 */
export const stripComments: (text: string, replaceCh?: string) => string = parser.stripComments;

export interface ParseError {
  error: ParseErrorCode;
  offset: number;
  length: number;
}

export const ParseErrorCode: {
  readonly InvalidSymbol: 1;
  readonly InvalidNumberFormat: 2;
  readonly PropertyNameExpected: 3;
  readonly ValueExpected: 4;
  readonly ColonExpected: 5;
  readonly CommaExpected: 6;
  readonly CloseBraceExpected: 7;
  readonly CloseBracketExpected: 8;
  readonly EndOfFileExpected: 9;
  readonly InvalidCommentToken: 10;
  readonly UnexpectedEndOfComment: 11;
  readonly UnexpectedEndOfString: 12;
  readonly UnexpectedEndOfNumber: 13;
  readonly InvalidUnicode: 14;
  readonly InvalidEscapeCharacter: 15;
  readonly InvalidCharacter: 16;
  readonly [code: number]: string;
} = enumOf(
  "InvalidSymbol InvalidNumberFormat PropertyNameExpected ValueExpected ColonExpected CommaExpected CloseBraceExpected CloseBracketExpected EndOfFileExpected InvalidCommentToken UnexpectedEndOfComment UnexpectedEndOfString UnexpectedEndOfNumber InvalidUnicode InvalidEscapeCharacter InvalidCharacter",
  1,
);
export type ParseErrorCode =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | (number & {});
export declare namespace ParseErrorCode {
  type InvalidSymbol = 1;
  type InvalidNumberFormat = 2;
  type PropertyNameExpected = 3;
  type ValueExpected = 4;
  type ColonExpected = 5;
  type CommaExpected = 6;
  type CloseBraceExpected = 7;
  type CloseBracketExpected = 8;
  type EndOfFileExpected = 9;
  type InvalidCommentToken = 10;
  type UnexpectedEndOfComment = 11;
  type UnexpectedEndOfString = 12;
  type UnexpectedEndOfNumber = 13;
  type InvalidUnicode = 14;
  type InvalidEscapeCharacter = 15;
  type InvalidCharacter = 16;
}

// jsonc-parser's switch, which doesn't read the exported enum: its names, in order.
const ERROR_NAMES =
  "InvalidSymbol InvalidNumberFormat PropertyNameExpected ValueExpected ColonExpected CommaExpected CloseBraceExpected CloseBracketExpected EndOfFileExpected InvalidCommentToken UnexpectedEndOfComment UnexpectedEndOfString UnexpectedEndOfNumber InvalidUnicode InvalidEscapeCharacter InvalidCharacter".split(
    " ",
  );

export function printParseErrorCode(
  code: ParseErrorCode,
):
  | "InvalidSymbol"
  | "InvalidNumberFormat"
  | "PropertyNameExpected"
  | "ValueExpected"
  | "ColonExpected"
  | "CommaExpected"
  | "CloseBraceExpected"
  | "CloseBracketExpected"
  | "EndOfFileExpected"
  | "InvalidCommentToken"
  | "UnexpectedEndOfComment"
  | "UnexpectedEndOfString"
  | "UnexpectedEndOfNumber"
  | "InvalidUnicode"
  | "InvalidEscapeCharacter"
  | "InvalidCharacter"
  | "<unknown ParseErrorCode>" {
  return (
    Number.isInteger(code) && code >= 1 && code <= 16
      ? ERROR_NAMES[code - 1]
      : "<unknown ParseErrorCode>"
  ) as never;
}

export type NodeType = "object" | "array" | "property" | "string" | "number" | "boolean" | "null";

export interface Node {
  readonly type: NodeType;
  readonly value?: any;
  readonly offset: number;
  readonly length: number;
  readonly colonOffset?: number;
  readonly parent?: Node;
  readonly children?: Node[];
}

/**
 * A {@linkcode JSONPath} segment. Either a string representing an object property name
 * or a number (starting at 0) for array indices.
 */
export type Segment = string | number;
export type JSONPath = Segment[];

export interface Location {
  /**
   * The previous property key or literal value (string, number, boolean or null) or undefined.
   */
  previousNode?: Node;
  /**
   * The path describing the location in the JSON document. The path consists of a sequence of strings
   * representing an object property or numbers for array indices.
   */
  path: JSONPath;
  /**
   * Matches the locations path against a pattern consisting of strings (for properties) and numbers (for array indices).
   * '*' will match a single segment of any property name or index.
   * '**' will match a sequence of segments of any property name or index, or no segment.
   */
  matches: (patterns: JSONPath) => boolean;
  /**
   * If set, the location's offset is at a property key.
   */
  isAtPropertyKey: boolean;
}

export interface ParseOptions {
  disallowComments?: boolean;
  allowTrailingComma?: boolean;
  allowEmptyContent?: boolean;
}

/**
 * Visitor called by {@linkcode visit} when parsing JSON.
 *
 * The visitor functions have the following common parameters:
 * - `offset`: Global offset within the JSON document, starting at 0
 * - `startLine`: Line number, starting at 0
 * - `startCharacter`: Start character (column) within the current line, starting at 0
 *
 * Additionally some functions have a `pathSupplier` parameter which can be used to obtain the
 * current `JSONPath` within the document.
 */
export interface JSONVisitor {
  /**
   * Invoked when an open brace is encountered and an object is started. The offset and length represent the location of the open brace.
   * When `false` is returned, the object properties will not be visited.
   */
  onObjectBegin?: (
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number,
    pathSupplier: () => JSONPath,
  ) => boolean | void;

  /**
   * Invoked when a property is encountered. The offset and length represent the location of the property name.
   * The `JSONPath` created by the `pathSupplier` refers to the enclosing JSON object, it does not include the
   * property name yet.
   */
  onObjectProperty?: (
    property: string,
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number,
    pathSupplier: () => JSONPath,
  ) => void;

  /**
   * Invoked when a closing brace is encountered and an object is completed. The offset and length represent the location of the closing brace.
   */
  onObjectEnd?: (offset: number, length: number, startLine: number, startCharacter: number) => void;

  /**
   * Invoked when an open bracket is encountered. The offset and length represent the location of the open bracket.
   * When `false` is returned, the array items will not be visited.
   */
  onArrayBegin?: (
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number,
    pathSupplier: () => JSONPath,
  ) => boolean | void;

  /**
   * Invoked when a closing bracket is encountered. The offset and length represent the location of the closing bracket.
   */
  onArrayEnd?: (offset: number, length: number, startLine: number, startCharacter: number) => void;

  /**
   * Invoked when a literal value is encountered. The offset and length represent the location of the literal value.
   */
  onLiteralValue?: (
    value: any,
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number,
    pathSupplier: () => JSONPath,
  ) => void;

  /**
   * Invoked when a comma or colon separator is encountered. The offset and length represent the location of the separator.
   */
  onSeparator?: (
    character: string,
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number,
  ) => void;

  /**
   * When comments are allowed, invoked when a line or block comment is encountered. The offset and length represent the location of the comment.
   */
  onComment?: (offset: number, length: number, startLine: number, startCharacter: number) => void;

  /**
   * Invoked on an error.
   */
  onError?: (
    error: ParseErrorCode,
    offset: number,
    length: number,
    startLine: number,
    startCharacter: number,
  ) => void;
}

/**
 * An edit result describes a textual edit operation. It is the result of a {@linkcode format} and {@linkcode modify} operation.
 * It consist of one or more edits describing insertions, replacements or removals of text segments.
 * * The offsets of the edits refer to the original state of the document.
 * * No two edits change or remove the same range of text in the original document.
 * * Multiple edits can have the same offset if they are multiple inserts, or an insert followed by a remove or replace.
 * * The order in the array defines which edit is applied first.
 * To apply an edit result use {@linkcode applyEdits}.
 * In general multiple EditResults must not be concatenated because they might impact each other, producing incorrect or malformed JSON data.
 */
export type EditResult = Edit[];

/**
 * Represents a text modification
 */
export interface Edit {
  /**
   * The start offset of the modification.
   */
  offset: number;
  /**
   * The length of the modification. Must not be negative. Empty length represents an *insert*.
   */
  length: number;
  /**
   * The new content. Empty content represents a *remove*.
   */
  content: string;
}

/**
 * A text range in the document
 */
export interface Range {
  /**
   * The start offset of the range.
   */
  offset: number;
  /**
   * The length of the range. Must not be negative.
   */
  length: number;
}

/**
 * Options used by {@linkcode format} when computing the formatting edit operations
 */
export interface FormattingOptions {
  /**
   * If indentation is based on spaces (`insertSpaces` = true), the number of spaces that make an indent.
   */
  tabSize?: number;
  /**
   * Is indentation based on spaces?
   */
  insertSpaces?: boolean;
  /**
   * The default 'end of line' character. If not set, '\n' is used as default.
   */
  eol?: string;
  /**
   * If set, will add a new line at the end of the document.
   */
  insertFinalNewline?: boolean;
  /**
   * If true, will keep line positions as is in the formatting
   */
  keepLines?: boolean;
}

/**
 * Computes the edit operations needed to format a JSON document.
 *
 * @param documentText The input text
 * @param range The range to format or `undefined` to format the full content
 * @param options The formatting options
 * @returns The edit operations describing the formatting changes to the original document following the format described in {@linkcode EditResult}.
 * To apply the edit operations to the input, use {@linkcode applyEdits}.
 */
export function format(
  documentText: string,
  range: Range | undefined,
  options: FormattingOptions,
): EditResult {
  return formatter.format(documentText, range, options);
}

/**
 * Options used by {@linkcode modify} when computing the modification edit operations
 */
export interface ModificationOptions {
  /**
   * Formatting options. If undefined, the newly inserted code will be inserted unformatted.
   */
  formattingOptions?: FormattingOptions;
  /**
   * Default false. If `JSONPath` refers to an index of an array and `isArrayInsertion` is `true`, then
   * {@linkcode modify} will insert a new item at that location instead of overwriting its contents.
   */
  isArrayInsertion?: boolean;
  /**
   * Optional function to define the insertion index given an existing list of properties.
   */
  getInsertionIndex?: (properties: string[]) => number;
}

/**
 * Computes the edit operations needed to modify a value in the JSON document.
 *
 * @param documentText The input text
 * @param path The path of the value to change. The path represents either to the document root, a property or an array item.
 * If the path points to an non-existing property or item, it will be created.
 * @param value The new value for the specified property or item. If the value is undefined,
 * the property or item will be removed.
 * @param options Options
 * @returns The edit operations describing the changes to the original document, following the format described in {@linkcode EditResult}.
 * To apply the edit operations to the input, use {@linkcode applyEdits}.
 */
export function modify(
  text: string,
  path: JSONPath,
  value: any,
  options: ModificationOptions,
): EditResult {
  return edit.setProperty(text, path, value, options);
}

/**
 * Applies edits to an input string.
 * @param text The input text
 * @param edits Edit operations following the format described in {@linkcode EditResult}.
 * @returns The text with the applied edits.
 * @throws An error if the edit operations are not well-formed as described in {@linkcode EditResult}.
 */
export function applyEdits(text: string, edits: EditResult): string {
  let sortedEdits = edits.slice(0).sort((a, b) => {
    const diff = a.offset - b.offset;
    if (diff === 0) {
      return a.length - b.length;
    }
    return diff;
  });
  let lastModifiedOffset = text.length;
  for (let i = sortedEdits.length - 1; i >= 0; i--) {
    let e = sortedEdits[i]!;
    if (e.offset + e.length <= lastModifiedOffset) {
      text = edit.applyEdit(text, e);
    } else {
      throw new Error("Overlapping edit");
    }
    lastModifiedOffset = e.offset;
  }
  return text;
}
