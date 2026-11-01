// Random values for the stringify fuzzer: nested sections, awkward keys and
// strings, arrays, and the JavaScript values ini passes to JSON.stringify.
const keyParts = [
  "a",
  "b",
  "key",
  "x",
  "0",
  "12",
  "",
  " ",
  ".",
  "\\.",
  "\\",
  "=",
  ";",
  "#",
  "[",
  "]",
  "[]",
  '"',
  "'",
  "\n",
  "\r",
  "\t",
  "\u00a0",
  "\u2028",
  "\ufeff",
  "\u00e9",
  "\ud83d\ude00",
  "true",
  "null",
  "constructor",
  "toString",
  "__proto__",
  "length",
  "a.b",
  "user",
  "remote",
  '"origin"',
];

const stringParts = [
  ...keyParts,
  "value",
  "hello world",
  "1",
  "-0",
  "false",
  "{}",
  "[1]",
  "'1'",
  "\\;",
  "\\#",
  "\u0000",
  "\u001f",
  "\ud800",
  "https://example.com/a?b=c#d",
];

export function generator(next: () => number) {
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
  const text = (parts: string[], max: number) => {
    let s = "";
    for (let i = Math.floor(next() * max); i >= 0; i--) s += pick(parts);
    return next() < 0.15 ? ` ${s} ` : next() < 0.1 ? `"${s}"` : next() < 0.05 ? `'${s}'` : s;
  };

  function scalar(): unknown {
    const r = next();
    if (r < 0.45) return text(stringParts, 4);
    if (r < 0.55) return pick([0, 1, -1, 1.5, -0, NaN, Infinity, 1e21, 2 ** 53]);
    if (r < 0.65) return next() < 0.5;
    if (r < 0.72) return null;
    if (r < 0.77) return undefined;
    if (r < 0.8) return new Date(Math.floor(next() * 2e12));
    if (r < 0.82) return () => 1;
    if (r < 0.84) return Symbol("s");
    if (r < 0.85) return 10n;
    if (r < 0.86) return { toJSON: () => "json" };
    if (r < 0.87) return Object.assign(() => 1, { toJSON: () => "fn json" });
    if (r < 0.9) return { a: 1, b: [2, "c"] };
    return "";
  }

  function array(depth: number): unknown[] {
    const list: unknown[] = [];
    for (let i = Math.floor(next() * 4); i > 0; i--)
      list.push(next() < 0.15 && depth < 3 ? object(depth + 1) : scalar());
    if (next() < 0.05) list.length += 2; // holes
    return list;
  }

  function object(depth: number): Record<string, unknown> {
    const obj: Record<string, unknown> = next() < 0.2 ? Object.create(null) : {};
    for (let i = Math.floor(next() * 6); i > 0; i--) {
      const key = text(keyParts, 2);
      const r = next();
      const value =
        r < 0.5 ? scalar() : r < 0.7 ? array(depth) : depth < 4 ? object(depth + 1) : scalar();
      // An own "__proto__" key, as JSON.parse makes one.
      Object.defineProperty(obj, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return obj;
  }

  /**
   * A random value; about 1 in 200 contains a cycle, and about 1 in 100 has a
   * toJSON method that returns another random value.
   */
  return (): unknown => {
    let value = object(0);
    if (next() < 0.01) {
      const inner = object(0);
      value = { ...value, toJSON: () => inner };
    }
    if (next() < 0.005) {
      const keys = Object.keys(value);
      const inner = { self: value };
      Object.defineProperty(value, keys[0] ?? "c", {
        value: next() < 0.5 ? inner : [inner],
        enumerable: true,
      });
    }
    return value;
  };
}
