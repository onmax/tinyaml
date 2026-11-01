// Random JavaScript values for the stringify fuzzer: nested objects and
// arrays, awkward keys and strings, special numbers, toJSON and toJSON5,
// dates, boxed primitives, values JSON5 can't hold, and shared references and cycles.
// Every character here has the same identifier status in Unicode 10 and in
// the engine's tables, so key quoting matches json5 (see scripts/unicode.ts).

const chars = [
  "a",
  "b",
  "Z",
  "0",
  "9",
  "$",
  "_",
  " ",
  "-",
  ".",
  "'",
  '"',
  "`",
  "\\",
  "\0",
  "\b",
  "\f",
  "\n",
  "\r",
  "\t",
  "\v",
  "\x01",
  "\x1f",
  "\x7f",
  "\u2028",
  "\u2029",
  "\u00e9",
  "\u00f9",
  "\u4e2d",
  "\u200c",
  "\u200d",
  "\u3000",
  "\u00a0",
  "\ufeff",
  "\ud835\udc4e",
  "\ud83d\ude00",
  "\ud800",
  "\udc00",
  "\u0660",
  "\u01c5",
  "\u2e2f",
  "\u0301",
];
const numbers = [
  0,
  -0,
  1,
  -1,
  1.5,
  -2.25,
  1e21,
  1e-7,
  123456789,
  2 ** 53,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  NaN,
  Infinity,
  -Infinity,
  0.1 + 0.2,
];
const keys = [
  "",
  "a",
  "b",
  "drop",
  "__proto__",
  "1",
  "01",
  "a b",
  "a-b",
  "$_",
  "\u00e9t\u00e9",
  "\u0660",
];

export interface Generated {
  value: unknown;
  /** A nested container also refers to an earlier one, often its ancestor. */
  linked: boolean;
}

export function generator(next: () => number) {
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(list: readonly T[]) => list[int(list.length)]!;

  const string = () => {
    let s = "";
    for (let n = int(9); n > 0; n--) s += next() < 0.5 ? pick(chars) : pick(["a", "b", "x"]);
    return s;
  };
  // Keys that are, or nearly are, identifiers, to exercise bare keys.
  const identifier = () => {
    let s = pick(["a", "Z", "$", "_", "\u00e9", "\u01c5", "\ud835\udc4e", "\u2e2f"]);
    for (let n = int(5); n > 0; n--)
      s +=
        next() < 0.9
          ? pick(["a", "0", "$", "_", "\u200c", "\u0660", "\u0301", "\u00e9"])
          : pick(chars);
    return s;
  };
  const key = () => {
    const r = next();
    return r < 0.4 ? pick(keys) : r < 0.7 ? identifier() : string();
  };

  const containers: object[] = [];

  function value(depth: number): unknown {
    const r = int(depth > 3 ? 14 : 20);
    switch (r) {
      case 0:
      case 1:
      case 2:
        return string();
      case 3:
      case 4:
        return next() < 0.7 ? pick(numbers) : (next() - 0.5) * 10 ** int(25);
      case 5:
        return pick([true, false, null]);
      case 6:
        return pick([undefined, () => 1, Symbol("s"), 1n]);
      case 7:
        return next() < 0.8
          ? new Date(Date.UTC(2000 + int(30), int(12), 1 + int(28)))
          : new Date(NaN);
      case 8:
        return pick([
          () => new Number(pick(numbers)),
          () => new String(string()),
          () => new Boolean(next() < 0.5),
          () => Object(Symbol("boxed")) as unknown,
        ])();
      case 9: {
        // toJSON and toJSON5 get the key and may return anything.
        const result = value(depth + 1);
        const which = int(3);
        const object: Record<string, unknown> = { ignored: 1 };
        if (which !== 1) object.toJSON5 = (k: string) => (k === "drop" ? undefined : result);
        if (which !== 0) object.toJSON = (k: string) => [k, result];
        return object;
      }
      case 10:
      case 11:
      case 12:
      case 13:
        return depth > 3 ? string() : r < 12 ? array(depth) : object(depth);
      default:
        return r % 2 ? array(depth) : object(depth);
    }
  }

  function array(depth: number): unknown[] {
    const list: unknown[] = [];
    containers.push(list);
    const n = int(6);
    for (let i = 0; i < n; i++) if (next() < 0.95) list[i] = value(depth + 1);
    list.length = n; // keeps trailing holes
    return list;
  }

  function object(depth: number): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    containers.push(record);
    for (let n = int(6); n > 0; n--)
      Object.defineProperty(record, key(), {
        value: value(depth + 1),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    return record;
  }

  return (cycleChance: number): Generated => {
    containers.length = 0;
    const root = value(0);
    if (containers.length === 0 || next() >= cycleChance) return { value: root, linked: false };
    // Point a nested container back at an earlier one (or itself).
    const at = int(containers.length);
    const target = containers[int(at + 1)]!;
    const holder = containers[at]! as Record<string, unknown>;
    if (Array.isArray(holder)) holder.push(target);
    else
      Object.defineProperty(holder, key(), {
        value: target,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    return { value: root, linked: true };
  };
}

// json5 2.2.3's identifier tables must agree with the engine's on every
// character used above, or key quoting would differ for a known reason.
export function checkCharacters(
  util: Record<"isIdStartChar" | "isIdContinueChar", (c: string) => boolean>,
  ours: { isIdStart: (cp: number) => boolean; isIdContinue: (cp: number) => boolean },
): string[] {
  const bad: string[] = [];
  // Code points, so a surrogate pair is checked as one character.
  for (const c of [...chars, ...Array.from(keys.join(""))]) {
    const cp = c.codePointAt(0)!;
    if (
      util.isIdStartChar(c) !== ours.isIdStart(cp) ||
      util.isIdContinueChar(c) !== ours.isIdContinue(cp)
    )
      bad.push(c);
  }
  return bad;
}
