// jsonc-parser 3.3.1's formatter (MIT, Copyright (c) Microsoft Corporation),
// unchanged but for its imports and token numbers, and its edits compared
// in place, marked "tinyjson5".
import type { Edit, FormattingOptions, Range } from "./index.ts";
import { createScanner } from "./scanner.ts";
import {
  cachedBreakLinesWithSpaces,
  cachedSpaces,
  supportedEols,
  type SupportedEOL,
} from "./string-intern.ts";

export function format(
  documentText: string,
  range: Range | undefined,
  options: FormattingOptions,
): Edit[] {
  let initialIndentLevel: number;
  let formatText: string;
  let formatTextStart: number;
  let rangeStart: number;
  let rangeEnd: number;
  if (range) {
    rangeStart = range.offset;
    rangeEnd = rangeStart + range.length;

    formatTextStart = rangeStart;
    while (formatTextStart > 0 && !isEOL(documentText, formatTextStart - 1)) {
      formatTextStart--;
    }
    let endOffset = rangeEnd;
    while (endOffset < documentText.length && !isEOL(documentText, endOffset)) {
      endOffset++;
    }
    formatText = documentText.substring(formatTextStart, endOffset);
    initialIndentLevel = computeIndentLevel(formatText, options);
  } else {
    formatText = documentText;
    initialIndentLevel = 0;
    formatTextStart = 0;
    rangeStart = 0;
    rangeEnd = documentText.length;
  }
  const eol = getEOL(options, documentText);
  const eolFastPathSupported = supportedEols.includes(eol as any);

  let numberLineBreaks = 0;

  let indentLevel = 0;
  let indentValue: string;
  if (options.insertSpaces) {
    indentValue =
      cachedSpaces[options.tabSize || 4] ?? repeat(cachedSpaces[1]!, options.tabSize || 4);
  } else {
    indentValue = "\t";
  }
  const indentType = indentValue === "\t" ? "\t" : " ";

  let scanner = createScanner(formatText, false);
  let hasError = false;

  function newLinesAndIndent(): string {
    if (numberLineBreaks > 1) {
      return repeat(eol, numberLineBreaks) + repeat(indentValue, initialIndentLevel + indentLevel);
    }

    const amountOfSpaces = indentValue.length * (initialIndentLevel + indentLevel);

    if (
      !eolFastPathSupported ||
      amountOfSpaces > cachedBreakLinesWithSpaces[indentType][eol as SupportedEOL].length
    ) {
      return eol + repeat(indentValue, initialIndentLevel + indentLevel);
    }

    if (amountOfSpaces <= 0) {
      return eol;
    }

    return cachedBreakLinesWithSpaces[indentType][eol as SupportedEOL][amountOfSpaces]!;
  }

  function scanNext(): number {
    let token = scanner.scan();
    numberLineBreaks = 0;

    while (token === 15 /* Trivia */ || token === 14 /* LineBreakTrivia */) {
      if (token === 14 /* LineBreakTrivia */ && options.keepLines) {
        numberLineBreaks += 1;
      } else if (token === 14 /* LineBreakTrivia */) {
        numberLineBreaks = 1;
      }
      token = scanner.scan();
    }
    hasError = token === 16 /* Unknown */ || scanner.getTokenError() !== 0; /* None */
    return token;
  }
  const editOperations: Edit[] = [];
  function addEdit(text: string, startOffset: number, endOffset: number) {
    if (
      !hasError &&
      (!range || (startOffset < rangeEnd && endOffset > rangeStart)) &&
      !sameText(text, startOffset, endOffset)
    ) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text });
    }
  }

  // tinyjson5: compared in place, without cutting the text out, where the
  // offsets are whole and in the text; else as jsonc-parser compares it.
  function sameText(text: string, startOffset: number, endOffset: number) {
    return Number.isInteger(startOffset) &&
      Number.isInteger(endOffset) &&
      0 <= startOffset &&
      startOffset <= endOffset &&
      endOffset <= documentText.length
      ? endOffset - startOffset === text?.length && documentText.startsWith(text, startOffset)
      : documentText.substring(startOffset, endOffset) === text;
  }

  let firstToken = scanNext();
  if (options.keepLines && numberLineBreaks > 0) {
    addEdit(repeat(eol, numberLineBreaks), 0, 0);
  }

  if (firstToken !== 17 /* EOF */) {
    let firstTokenStart = scanner.getTokenOffset() + formatTextStart;
    let initialIndent =
      indentValue.length * initialIndentLevel < 20 && options.insertSpaces
        ? cachedSpaces[indentValue.length * initialIndentLevel]!
        : repeat(indentValue, initialIndentLevel);
    addEdit(initialIndent, formatTextStart, firstTokenStart);
  }

  while (firstToken !== 17 /* EOF */) {
    let firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
    let secondToken = scanNext();
    let replaceContent = "";
    let needsLineBreak = false;

    while (
      numberLineBreaks === 0 &&
      (secondToken === 12 /* LineCommentTrivia */ || secondToken === 13) /* BlockCommentTrivia */
    ) {
      let commentTokenStart = scanner.getTokenOffset() + formatTextStart;
      addEdit(cachedSpaces[1]!, firstTokenEnd, commentTokenStart);
      firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
      needsLineBreak = secondToken === 12; /* LineCommentTrivia */
      replaceContent = needsLineBreak ? newLinesAndIndent() : "";
      secondToken = scanNext();
    }

    if (secondToken === 2 /* CloseBraceToken */) {
      if (firstToken !== 1 /* OpenBraceToken */) {
        indentLevel--;
      }

      if (
        (options.keepLines && numberLineBreaks > 0) ||
        (!options.keepLines && firstToken !== 1) /* OpenBraceToken */
      ) {
        replaceContent = newLinesAndIndent();
      } else if (options.keepLines) {
        replaceContent = cachedSpaces[1]!;
      }
    } else if (secondToken === 4 /* CloseBracketToken */) {
      if (firstToken !== 3 /* OpenBracketToken */) {
        indentLevel--;
      }

      if (
        (options.keepLines && numberLineBreaks > 0) ||
        (!options.keepLines && firstToken !== 3) /* OpenBracketToken */
      ) {
        replaceContent = newLinesAndIndent();
      } else if (options.keepLines) {
        replaceContent = cachedSpaces[1]!;
      }
    } else {
      switch (firstToken) {
        case 3 /* OpenBracketToken */:
        case 1 /* OpenBraceToken */:
          indentLevel++;
          if ((options.keepLines && numberLineBreaks > 0) || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = cachedSpaces[1]!;
          }
          break;
        case 5 /* CommaToken */:
          if ((options.keepLines && numberLineBreaks > 0) || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = cachedSpaces[1]!;
          }
          break;
        case 12 /* LineCommentTrivia */:
          replaceContent = newLinesAndIndent();
          break;
        case 13 /* BlockCommentTrivia */:
          if (numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = cachedSpaces[1]!;
          }
          break;
        case 6 /* ColonToken */:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = cachedSpaces[1]!;
          }
          break;
        case 10 /* StringLiteral */:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (secondToken === 6 /* ColonToken */ && !needsLineBreak) {
            replaceContent = "";
          }
          break;
        case 7 /* NullKeyword */:
        case 8 /* TrueKeyword */:
        case 9 /* FalseKeyword */:
        case 11 /* NumericLiteral */:
        case 2 /* CloseBraceToken */:
        case 4 /* CloseBracketToken */:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else {
            if (
              (secondToken === 12 /* LineCommentTrivia */ ||
                secondToken === 13) /* BlockCommentTrivia */ &&
              !needsLineBreak
            ) {
              replaceContent = cachedSpaces[1]!;
            } else if (secondToken !== 5 /* CommaToken */ && secondToken !== 17 /* EOF */) {
              hasError = true;
            }
          }
          break;
        case 16 /* Unknown */:
          hasError = true;
          break;
      }
      if (
        numberLineBreaks > 0 &&
        (secondToken === 12 /* LineCommentTrivia */ || secondToken === 13) /* BlockCommentTrivia */
      ) {
        replaceContent = newLinesAndIndent();
      }
    }
    if (secondToken === 17 /* EOF */) {
      if (options.keepLines && numberLineBreaks > 0) {
        replaceContent = newLinesAndIndent();
      } else {
        replaceContent = options.insertFinalNewline ? eol : "";
      }
    }
    const secondTokenStart = scanner.getTokenOffset() + formatTextStart;
    addEdit(replaceContent, firstTokenEnd, secondTokenStart);
    firstToken = secondToken;
  }
  return editOperations;
}

function repeat(s: string, count: number): string {
  let result = "";
  for (let i = 0; i < count; i++) {
    result += s;
  }
  return result;
}

function computeIndentLevel(content: string, options: FormattingOptions): number {
  let i = 0;
  let nChars = 0;
  const tabSize = options.tabSize || 4;
  while (i < content.length) {
    let ch = content.charAt(i);
    if (ch === cachedSpaces[1]!) {
      nChars++;
    } else if (ch === "\t") {
      nChars += tabSize;
    } else {
      break;
    }
    i++;
  }
  return Math.floor(nChars / tabSize);
}

function getEOL(options: FormattingOptions, text: string): string {
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\r") {
      if (i + 1 < text.length && text.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return "\r";
    } else if (ch === "\n") {
      return "\n";
    }
  }
  return (options && options.eol) || "\n";
}

export function isEOL(text: string, offset: number) {
  return "\r\n".indexOf(text.charAt(offset)) !== -1;
}
