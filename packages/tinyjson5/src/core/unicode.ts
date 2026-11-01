// Identifier rules shared by the parser and the stringifier. json5 2.2.3
// ships generated Unicode 10 tables; these use the engine's own Unicode data,
// plus U+2E2F, which json5's tables count as a letter although Unicode has
// never put it in ID_Start or ID_Continue.
const ID_START = /\p{ID_Start}/u;
const ID_CONTINUE = /\p{ID_Continue}/u;

export function isIdStart(cp: number): boolean {
  if (cp < 0x80) return (cp >= 97 && cp <= 122) || (cp >= 65 && cp <= 90) || cp === 36 || cp === 95;
  return cp === 0x2e2f || ID_START.test(String.fromCodePoint(cp));
}

export function isIdContinue(cp: number): boolean {
  if (cp < 0x80)
    return (
      (cp >= 97 && cp <= 122) ||
      (cp >= 65 && cp <= 90) ||
      (cp >= 48 && cp <= 57) ||
      cp === 36 ||
      cp === 95
    );
  return (
    cp === 0x200c || cp === 0x200d || cp === 0x2e2f || ID_CONTINUE.test(String.fromCodePoint(cp))
  );
}

// How json5 escapes a character, in strings and in error messages. json5
// builds this table as an object literal and indexes it with the quote
// option, so an unusual `quote` behaves exactly as it does there.
export const ESCAPES: Record<string, string> = {
  "'": "\\'",
  '"': '\\"',
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\v": "\\v",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/** How json5 prints a character in an error message. */
export function formatChar(c: string): string {
  const escaped = ESCAPES[c];
  if (escaped) return escaped;
  if (c < " ") return "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0");
  return c;
}
