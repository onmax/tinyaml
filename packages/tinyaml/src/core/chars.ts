// Character codes the parser compares with. Imported, the bundler inlines
// them, whatever runs before the parser in an entry.
export const SPACE = 32;
export const TAB = 9;
export const LF = 10;
export const HASH = 35;
export const COLON = 58;
export const COMMA = 44;
export const DASH = 45;
export const QUOTE = 39;
export const DQUOTE = 34;
export const BANG = 33;
export const AMP = 38;
export const STAR = 42;
export const QMARK = 63;
export const PIPE = 124;
export const GT = 62;
export const RBRACKET = 93;
// `ch | 32` takes `[` to `{` and `]` to `}`, so one test covers both kinds of bracket.
export const LBRACE = 123;
export const RBRACE = 125;
export const BACKSLASH = 92;
export const DOT = 46;
