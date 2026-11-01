// one-ini's EditorConfig INI grammar, as @one-ini/wasm compiles it from
// src/ini.pest with pest:
//
//   ini = { SOI ~ bom? ~ (blank | pair | comment)* ~ section* }
//   blank = _{ "" ~ NEWLINE }
//   pair = { key ~ "=" ~ value ~ eol }
//   comment = ${ indicator ~ comment_value ~ eol }
//   section = { header ~ eol ~ body }
//   body = { (blank | pair | comment)* }
//   header = ${ "[" ~ header_text ~ "]" }
//   header_text = @{ (!header_end ~ char)+ }
//   header_end = !{ "]" ~ eol }
//   key = @{ (!("=" | "[") ~ char) ~ (!key_end ~ char)* }
//   key_end = @{ WHITESPACE* ~ "=" }
//   value = @{ (!value_end ~ char)* }        0.1.x: `+`, at least one char
//   value_end = @{ WHITESPACE+ ~ eol }
//   WHITESPACE = _{ " " | "\t" }
//
// In the rules marked `{` and `!{`, pest skips WHITESPACE between the parts
// of a sequence and between repeats. `ini` doesn't end in EOI, so parsing
// stops without an error at the first line that fits no rule, and the rest
// of the file is ignored.
import { emptyValues } from "./mode.ts";

export const TokenTypes = Object.freeze({
  Key: 0,
  "0": "Key",
  Value: 1,
  "1": "Value",
  Section: 2,
  "2": "Section",
  CommentIndicator: 3,
  "3": "CommentIndicator",
  CommentValue: 4,
  "4": "CommentValue",
});

/** The version one-ini reports. */
export const version = (): string => (emptyValues ? "0.2.1" : "0.1.1");

/**
 * Calls `token(type, start, end)` for each token of `s`, by UTF-16 index, in
 * order: a section's name, a pair's key and value, a comment's indicator and
 * text. The caller sees where each section and pair starts from the tokens.
 */
function scan(s: string, token: (type: number, start: number, end: number) => void): void {
  const n = s.length;
  let i = 0;
  const space = (j: number) => {
    let c;
    while (j < n && ((c = s.charCodeAt(j)) === 32 || c === 9)) j++;
    return j;
  };
  const lineBreak = (j: number) => s.charCodeAt(j) === 13 || s.charCodeAt(j) === 10;
  // Where an end of line at j ends, or -1.
  const eol = (j: number) =>
    j === n
      ? j
      : s.charCodeAt(j) === 13
        ? j + (s.charCodeAt(j + 1) === 10 ? 2 : 1)
        : s.charCodeAt(j) === 10
          ? j + 1
          : -1;

  // blank | pair | comment at i: moves i past it, or returns false.
  const item = (): boolean => {
    let j = space(i);
    if (j < n && lineBreak(j)) {
      i = eol(j);
      return true;
    }
    let c = s.charCodeAt(i);
    // A key can't start with `=` or `[`, and stops at whitespace before `=`.
    if (i < n && c !== 61 && c !== 91 && !lineBreak(i)) {
      j = i + 1;
      for (; j < n && !lineBreak(j); j++) {
        const k = space(j);
        if (s.charCodeAt(k) === 61) break;
        if (k > j) j = k - 1;
      }
      const keyEnd = j;
      j = space(j);
      if (s.charCodeAt(j) === 61) {
        const start = space(j + 1);
        // The value stops at whitespace before the end of the line.
        let end = start;
        while (end < n && !lineBreak(end)) {
          const k = space(end);
          if (k > end && (k === n || lineBreak(k))) break;
          end = k > end ? k : end + 1;
        }
        if (emptyValues || end > start) {
          token(0, i, keyEnd);
          token(1, start, end);
          i = eol(space(end));
          return true;
        }
      }
    }
    if (c === 35 || c === 59) {
      j = i + 1;
      while (j < n && !lineBreak(j)) j++;
      token(3, i, i + 1);
      token(4, i + 1, j);
      i = eol(j);
      return true;
    }
    return false;
  };

  // (blank | pair | comment)*, with whitespace skipped between repeats.
  const items = () => {
    if (!item()) return;
    for (let at = i; ; at = i) {
      i = space(i);
      if (!item()) return void (i = at);
    }
  };

  // header ~ eol ~ body at i: moves i past it, or returns false.
  const section = (): boolean => {
    if (s.charCodeAt(i) !== 91) return false;
    let j = i + 1;
    // The name runs to a `]` that only whitespace separates from the end of the line.
    while (j < n && !lineBreak(j) && !(s.charCodeAt(j) === 93 && eol(space(j + 1)) >= 0)) j++;
    if (j === i + 1 || s.charCodeAt(j) !== 93) return false;
    token(2, i + 1, j);
    i = space(eol(space(j + 1)));
    items();
    return true;
  };

  i = space(i);
  if (s.charCodeAt(i) === 0xfeff) i++;
  i = space(i);
  items();
  i = space(i);
  if (!section()) return;
  for (let at = i; ; at = i) {
    i = space(i);
    if (!section()) return void (i = at);
  }
}

interface Node {
  type: string;
  [key: string]: unknown;
}
type Body = { body?: Node[] };

/** Adds a node to a body, which serde leaves out while it's empty. */
const add = (o: Body, node: Node) => (o.body ??= []).push(node);

/** The AST of an EditorConfig INI file, as one-ini's `parse_to_json` returns it. */
export function parse_to_json(contents: string): { version: string; body?: Node[] } {
  const text = utf16(contents);
  const out = { version: version() } as { version: string } & Body;
  let target: Body = out;
  let last: Node;
  scan(text, (type, start, end) => {
    const value = text.slice(start, end);
    if (type === 2) {
      const section: Node & Body = { type: "Section", name: value };
      add(out, section);
      target = section;
    } else if (type === 1 || type === 4) last.value = value;
    else
      add(
        target,
        (last =
          type === 0
            ? { type: "Pair", key: value, value: "" }
            : { type: "Comment", indicator: value, value: "" }),
      );
  });
  return out;
}

const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

/**
 * Rust's error for bytes that aren't UTF-8: where the valid part ends, and
 * how many bytes the bad sequence has, or none if the input ends inside it.
 */
function utf8Error(bytes: Uint8Array): string | undefined {
  const n = bytes.length;
  const cont = (j: number) => j < n && (bytes[j]! & 0xc0) === 0x80;
  for (let i = 0; i < n;) {
    const a = bytes[i]!;
    if (a < 0x80) {
      i++;
      continue;
    }
    const width = a < 0xc2 ? 0 : a < 0xe0 ? 2 : a < 0xf0 ? 3 : a < 0xf5 ? 4 : 0;
    // The second byte's range depends on the first, to rule out overlong
    // forms, surrogates and code points past U+10FFFF.
    const low = a === 0xe0 ? 0xa0 : a === 0xf0 ? 0x90 : 0x80;
    const high = a === 0xed ? 0x9f : a === 0xf4 ? 0x8f : 0xbf;
    let bad = 0;
    if (!width) bad = 1;
    else if (i + 1 >= n) bad = -1;
    else if (bytes[i + 1]! < low || bytes[i + 1]! > high) bad = 1;
    else if (width > 2 && i + 2 >= n) bad = -1;
    else if (width > 2 && !cont(i + 2)) bad = 2;
    else if (width > 3 && i + 3 >= n) bad = -1;
    else if (width > 3 && !cont(i + 3)) bad = 3;
    if (bad > 0) return `invalid utf-8 sequence of ${bad} bytes from index ${i}`;
    if (bad < 0) return `incomplete utf-8 byte sequence from index ${i}`;
    i += width;
  }
  return undefined;
}

/**
 * The tokens of UTF-8 `contents`, three numbers each: the type, from
 * TokenTypes, and the start and end byte offsets. Bytes that aren't UTF-8
 * throw the Error Rust's from_utf8 gives.
 */
export function parse_to_uint32array(contents: Uint8Array): Uint32Array {
  // wasm-bindgen copies the argument into memory the same way, after a
  // malloc that takes the length as an i32 and traps on a negative one.
  const bytes = new Uint8Array(malloc(contents.length * 1));
  bytes.set(contents);
  const text = decoder.decode(bytes);
  if (text.includes("\ufffd")) {
    const error = utf8Error(bytes);
    if (error) throw new Error(error);
  }
  const out: number[] = [];
  // Byte offsets, counted from the UTF-16 ones as the tokens come, in order.
  const ascii = text.length === bytes.length;
  let index = 0;
  let offset = 0;
  const at = (j: number) => {
    if (ascii) return j;
    for (; index < j; index++) {
      const c = text.charCodeAt(index);
      offset +=
        c < 0x80
          ? 1
          : c < 0x800
            ? 2
            : c >= 0xd800 && c < 0xdc00
              ? 4
              : c < 0xdc00 || c > 0xdfff
                ? 3
                : 0;
    }
    return offset;
  };
  scan(text, (type, start, end) => out.push(type, at(start), at(end)));
  return new Uint32Array(out);
}

const encoder = new TextEncoder();

/** The size wasm-bindgen's malloc gets: the length as an i32, which traps if negative. */
function malloc(len: number): number {
  if ((len | 0) < 0) throw new WebAssembly.RuntimeError("unreachable");
  return len | 0;
}

/**
 * The text the WASM module gets: wasm-bindgen copies a string's ASCII
 * start, and has TextEncoder write the rest, which turns a lone surrogate
 * into U+FFFD and throws for what isn't a string.
 */
function utf16(arg: any): string {
  if (typeof arg === "string") return arg.toWellFormed();
  const len = arg.length;
  malloc(len);
  let offset = 0;
  let out = "";
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7f) break;
    out += String.fromCharCode(code);
  }
  if (offset !== len) {
    if (offset !== 0) arg = arg.slice(offset);
    encoder.encodeInto(arg, new Uint8Array(0));
    out += String(arg).toWellFormed();
  }
  return out;
}
