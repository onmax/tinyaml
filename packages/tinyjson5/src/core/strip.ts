// strip-json-comments' state machine, which tracks double-quoted strings and
// nothing else, as one pass that jumps from one quote or slash to the next.
// strip-json-comments 3 is the default; the mode picks 2 or 5 where they
// differ: 2 sees a quote as escaped by exactly one backslash, and 5 blanks
// every character but ASCII spaces, tabs and line breaks, keeps a comment
// that never ends, and can blank trailing commas.
import { setMode, strip2, strip5, type Mode } from "./mode.ts";

export function strip(
  text: string,
  whitespace: unknown,
  trailingCommas: unknown,
  mode: Mode,
): string {
  const outerMode = setMode(mode);
  try {
    const blank = (source: string, start: number, end?: number) =>
      whitespace ? source.slice(start, end).replace(strip5 ? /[^ \t\r\n]/g : /\S/g, " ") : "";
    let result = "";
    let offset = 0;
    // Where a comma waiting to be called trailing is in `result`, or -1.
    let comma = -1;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c === 47 /* / */) {
        const d = text.charCodeAt(i + 1);
        if (d === 47) {
          // A line comment ends before the next "\n", which stays.
          const end = text.indexOf("\n", i + 2);
          result += text.slice(offset, i);
          if (end < 0) return result + blank(text, i);
          result += blank(text, i, end);
          offset = i = end;
          continue;
        }
        if (d === 42 /* * */) {
          const end = text.indexOf("*/", i + 2);
          result += text.slice(offset, i);
          if (end < 0) return result + (strip5 ? text.slice(i) : blank(text, i));
          result += blank(text, i, end + 2);
          offset = end + 2;
          i = end + 1;
          continue;
        }
      }
      if (strip5 && trailingCommas) {
        if (comma >= 0) {
          if (c === 125 /* } */ || c === 93 /* ] */) {
            result += text.slice(offset, i);
            offset = i;
            result =
              result.slice(0, comma) + blank(result, comma, comma + 1) + result.slice(comma + 1);
            comma = -1;
          } else if (c !== 32 && c !== 9 && c !== 13 && c !== 10) comma = -1;
        } else if (c === 44 /* , */) comma = result.length + i - offset;
      }
      if (c === 34 /* " */ && !escaped(text, i)) {
        let end = i;
        do end = text.indexOf('"', end + 1);
        while (end >= 0 && escaped(text, end));
        // A string that never ends runs to the end of the text, as it is.
        if (end < 0) break;
        i = end;
      }
    }
    return result + text.slice(offset);
  } finally {
    if (outerMode) setMode(outerMode);
  }
}

function escaped(text: string, at: number): boolean {
  if (strip2) return text.charCodeAt(at - 1) === 92 && text.charCodeAt(at - 2) !== 92;
  let k = at;
  while (text.charCodeAt(k - 1) === 92 /* \ */) k--;
  return (at - k) % 2 === 1;
}
