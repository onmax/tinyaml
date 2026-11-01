// jsonc-parser 3.3.1's formatter (MIT, Copyright (c) Microsoft Corporation),
// without its tables of cached indents, whose quirks it keeps.

import type { Edit, FormattingOptions, Range } from "./index.ts";
import { createScanner } from "./scanner.ts";

// A line break and indent of each length, filled in as they're needed, for
// each indent character and line break.
const INDENTS: Record<string, string[]> = {};

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
  // jsonc-parser looks the line break and indent up in tables for these line breaks.
  const eolFastPathSupported = eol === "\n" || eol === "\r" || eol === "\r\n";

  let numberLineBreaks = 0;

  let indentLevel = 0;
  let indentValue: string;
  if (options.insertSpaces) {
    // A table of 0 to 19 spaces, and a loop for any other count, which a fraction rounds up.
    const tabSize = options.tabSize || 4;
    indentValue =
      Number.isInteger(tabSize) && tabSize >= 0 && tabSize < 20
        ? " ".repeat(tabSize)
        : repeat(" ", tabSize);
  } else {
    indentValue = "\t";
  }
  const indentType = indentValue === "\t" ? "\t" : " ";
  const indents = eolFastPathSupported ? (INDENTS[indentType + eol] ??= []) : undefined;

  let scanner = createScanner(formatText, false);
  let hasError = false;

  function newLinesAndIndent(): string {
    if (numberLineBreaks > 1) {
      return repeat(eol, numberLineBreaks) + repeat(indentValue, initialIndentLevel + indentLevel);
    }

    const amountOfSpaces = indentValue.length * (initialIndentLevel + indentLevel);

    if (!eolFastPathSupported || amountOfSpaces > 200) {
      return eol + repeat(indentValue, initialIndentLevel + indentLevel);
    }

    if (amountOfSpaces <= 0) {
      return eol;
    }

    // The table holds 0 to 199 characters, so 200 finds nothing there.
    if (amountOfSpaces === 200) return undefined as never;
    return (indents![amountOfSpaces] ??= eol + indentType.repeat(amountOfSpaces));
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
      // The text there differs: compared in place, without cutting it out.
      !(startOffset <= endOffset
        ? endOffset - startOffset === text?.length && documentText.startsWith(text, startOffset)
        : documentText.substring(startOffset, endOffset) === text)
    ) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text });
    }
  }

  let firstToken = scanNext();
  if (options.keepLines && numberLineBreaks > 0) {
    addEdit(repeat(eol, numberLineBreaks), 0, 0);
  }

  if (firstToken !== 17 /* EOF */) {
    let firstTokenStart = scanner.getTokenOffset() + formatTextStart;
    let initialIndent =
      indentValue.length * initialIndentLevel < 20 && options.insertSpaces
        ? " ".repeat(indentValue.length * initialIndentLevel)
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
      addEdit(" ", firstTokenEnd, commentTokenStart);
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
        replaceContent = " ";
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
        replaceContent = " ";
      }
    } else {
      switch (firstToken) {
        case 3 /* OpenBracketToken */:
        case 1 /* OpenBraceToken */:
          indentLevel++;
          if ((options.keepLines && numberLineBreaks > 0) || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = " ";
          }
          break;
        case 5 /* CommaToken */:
          if ((options.keepLines && numberLineBreaks > 0) || !options.keepLines) {
            replaceContent = newLinesAndIndent();
          } else {
            replaceContent = " ";
          }
          break;
        case 12 /* LineCommentTrivia */:
          replaceContent = newLinesAndIndent();
          break;
        case 13 /* BlockCommentTrivia */:
          if (numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = " ";
          }
          break;
        case 6 /* ColonToken */:
          if (options.keepLines && numberLineBreaks > 0) {
            replaceContent = newLinesAndIndent();
          } else if (!needsLineBreak) {
            replaceContent = " ";
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
              replaceContent = " ";
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
    if (ch === " ") {
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
