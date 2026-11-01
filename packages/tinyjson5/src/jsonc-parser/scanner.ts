// jsonc-parser 3.3.1's scanner (MIT, Copyright (c) Microsoft Corporation),
// with its tokens, values, errors, offsets and line counts, but token values
// sliced from the text instead of built a character at a time. Token kinds
// and errors are the numbers of its SyntaxKind and ScanError, noted inline.
import type { JSONScanner } from "./index.ts";

export function createScanner(text: string, ignoreTrivia = false): JSONScanner {
  const len = text.length;
  let pos = 0;
  // A token's value, or undefined while it's still the slice from
  // `valueStart` to `valueEnd`, cut when asked for.
  let value: string | undefined = "";
  let valueStart = 0;
  let valueEnd = 0;
  let tokenOffset = 0;
  let token = 16; /* Unknown */
  let lineNumber = 0;
  let lineStartOffset = 0;
  let tokenLineStartOffset = 0;
  let prevTokenLineStartOffset = 0;
  let scanError = 0; /* None */

  // Exactly `count` hex digits, or -1.
  function scanHexDigits(count: number): number {
    let digits = 0;
    let result = 0;
    while (digits < count) {
      const ch = text.charCodeAt(pos);
      if (ch >= 48 && ch <= 57) result = result * 16 + ch - 48;
      else if (ch >= 65 && ch <= 70) result = result * 16 + ch - 55;
      else if (ch >= 97 && ch <= 102) result = result * 16 + ch - 87;
      else break;
      pos++;
      digits++;
    }
    return digits < count ? -1 : result;
  }

  function setPosition(newPosition: number) {
    pos = newPosition;
    value = "";
    tokenOffset = 0;
    token = 16;
    scanError = 0;
  }

  // jsonc-parser's own, bounds checks included: they stop it at a position
  // that isn't a number, such as setPosition(NaN) leaves.
  function scanNumber(): string {
    const start = pos;
    if (text.charCodeAt(pos) === 48) pos++;
    else {
      pos++;
      while (pos < text.length && isDigit(text.charCodeAt(pos))) pos++;
    }
    if (pos < text.length && text.charCodeAt(pos) === 46 /* . */) {
      pos++;
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) pos++;
      } else {
        scanError = 3; /* UnexpectedEndOfNumber */
        return text.substring(start, pos);
      }
    }
    let end = pos;
    if (
      pos < text.length &&
      (text.charCodeAt(pos) === 69 || text.charCodeAt(pos) === 101) /* E e */
    ) {
      pos++;
      if ((pos < text.length && text.charCodeAt(pos) === 43) || text.charCodeAt(pos) === 45) pos++;
      if (pos < text.length && isDigit(text.charCodeAt(pos))) {
        pos++;
        while (pos < text.length && isDigit(text.charCodeAt(pos))) pos++;
        end = pos;
      } else scanError = 3;
    }
    return text.substring(start, end);
  }

  function scanString(): string {
    let result = "";
    let start = pos;
    for (;;) {
      if (pos >= len) {
        result += text.substring(start, pos);
        scanError = 2; /* UnexpectedEndOfString */
        break;
      }
      const ch = text.charCodeAt(pos);
      if (ch === 34 /* " */) {
        result += text.substring(start, pos);
        pos++;
        break;
      }
      if (ch === 92 /* \ */) {
        result += text.substring(start, pos);
        pos++;
        if (pos >= len) {
          scanError = 2;
          break;
        }
        switch (text.charCodeAt(pos++)) {
          case 34:
            result += '"';
            break;
          case 92:
            result += "\\";
            break;
          case 47:
            result += "/";
            break;
          case 98:
            result += "\b";
            break;
          case 102:
            result += "\f";
            break;
          case 110:
            result += "\n";
            break;
          case 114:
            result += "\r";
            break;
          case 116:
            result += "\t";
            break;
          case 117: {
            const ch3 = scanHexDigits(4);
            if (ch3 >= 0) result += String.fromCharCode(ch3);
            else scanError = 4; /* InvalidUnicode */
            break;
          }
          default:
            scanError = 5; /* InvalidEscapeCharacter */
        }
        start = pos;
        continue;
      }
      if (ch <= 0x1f) {
        if (ch === 10 || ch === 13) {
          result += text.substring(start, pos);
          scanError = 2;
          break;
        }
        // A control character is an error, and the string goes on.
        scanError = 6; /* InvalidCharacter */
      }
      pos++;
    }
    return result;
  }

  // A token whose value is the text from `start` to where the scan ended.
  function sliced(kind: number, start = tokenOffset): number {
    value = undefined;
    valueStart = start;
    valueEnd = pos;
    return (token = kind);
  }

  function scanNext(): number {
    value = "";
    scanError = 0;
    tokenOffset = pos;
    lineStartOffset = lineNumber;
    prevTokenLineStartOffset = tokenLineStartOffset;
    if (pos >= len) {
      tokenOffset = len;
      return (token = 17); /* EOF */
    }
    let code = text.charCodeAt(pos);
    if (code === 32 || code === 9) {
      do code = text.charCodeAt(++pos);
      while (code === 32 || code === 9);
      return sliced(15); /* Trivia */
    }
    if (code === 10 || code === 13) {
      pos++;
      if (code === 13 && text.charCodeAt(pos) === 10) pos++;
      lineNumber++;
      tokenLineStartOffset = pos;
      return sliced(14); /* LineBreakTrivia */
    }
    switch (code) {
      case 123 /* { */:
        pos++;
        return (token = 1);
      case 125 /* } */:
        pos++;
        return (token = 2);
      case 91 /* [ */:
        pos++;
        return (token = 3);
      case 93 /* ] */:
        pos++;
        return (token = 4);
      case 58 /* : */:
        pos++;
        return (token = 6);
      case 44 /* , */:
        pos++;
        return (token = 5);
      case 34 /* " */:
        pos++;
        value = scanString();
        return (token = 10); /* StringLiteral */
      case 47 /* / */: {
        // jsonc-parser starts a comment's value one character early, so it
        // holds the character before the comment too.
        const start = pos - 1;
        const next = text.charCodeAt(pos + 1);
        if (next === 47) {
          pos += 2;
          while (pos < len) {
            const ch = text.charCodeAt(pos);
            if (ch === 10 || ch === 13) break;
            pos++;
          }
          return sliced(12, start); /* LineCommentTrivia */
        }
        if (next === 42 /* * */) {
          pos += 2;
          const safeLength = len - 1;
          let closed = false;
          while (pos < safeLength) {
            const ch = text.charCodeAt(pos);
            if (ch === 42 && text.charCodeAt(pos + 1) === 47) {
              pos += 2;
              closed = true;
              break;
            }
            pos++;
            if (ch === 10 || ch === 13) {
              if (ch === 13 && text.charCodeAt(pos) === 10) pos++;
              lineNumber++;
              tokenLineStartOffset = pos;
            }
          }
          if (!closed) {
            pos++;
            scanError = 1; /* UnexpectedEndOfComment */
          }
          return sliced(13, start); /* BlockCommentTrivia */
        }
        value = "/";
        pos++;
        return (token = 16);
      }
      case 45 /* - */:
        value = "-";
        pos++;
        if (pos === len || !isDigit(text.charCodeAt(pos))) return (token = 16);
        value += scanNumber();
        return (token = 11); /* NumericLiteral */
      case 48:
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        value = scanNumber();
        return (token = 11);
    }
    // A keyword, or else an unknown word, read whole.
    while (pos < len && isUnknownContentCharacter(code)) code = text.charCodeAt(++pos);
    if (tokenOffset !== pos) {
      value = text.substring(tokenOffset, pos);
      return (token = value === "true" ? 8 : value === "false" ? 9 : value === "null" ? 7 : 16);
    }
    value = String.fromCharCode(code);
    pos++;
    return (token = 16);
  }

  function scanNextNonTrivia(): number {
    let result: number;
    do result = scanNext();
    while (result >= 12 && result <= 15);
    return result;
  }

  return {
    setPosition,
    getPosition: () => pos,
    scan: ignoreTrivia ? scanNextNonTrivia : scanNext,
    getToken: () => token,
    getTokenValue: () => (value ??= text.substring(valueStart, valueEnd)),
    getTokenOffset: () => tokenOffset,
    getTokenLength: () => pos - tokenOffset,
    getTokenStartLine: () => lineStartOffset,
    getTokenStartCharacter: () => tokenOffset - prevTokenLineStartOffset,
    getTokenError: () => scanError,
  } as JSONScanner;
}

function isDigit(ch: number): boolean {
  return ch >= 48 && ch <= 57;
}

// Anything but whitespace, a line break, or a character that ends a word.
function isUnknownContentCharacter(code: number): boolean {
  switch (code) {
    case 32:
    case 9:
    case 10:
    case 13:
    case 125:
    case 93:
    case 123:
    case 91:
    case 34:
    case 58:
    case 44:
    case 47:
      return false;
  }
  return true;
}
