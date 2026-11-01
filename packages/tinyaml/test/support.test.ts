// The comparison scripts' shared helpers: a comparator that misses a
// difference, or a stream reader that splits a value, hides a regression.
import { describe, expect, it, vi } from "vite-plus/test";
import { equal, expectCount, iterationsArg, jsonStream, seedArg } from "../scripts/support.ts";

// An array of `length` with only the given indexes set; the rest are holes.
function holes(length: number, values: Record<number, unknown>): unknown[] {
  const array: unknown[] = [];
  array.length = length;
  return Object.assign(array, values);
}

describe("equal", () => {
  it("compares array lengths and holes", () => {
    expect(equal([1], holes(2, { 0: 1 }))).toBe(false);
    expect(equal(holes(3, { 0: 1, 2: 3 }), [1, undefined, 3])).toBe(false);
    expect(equal(holes(3, { 0: 1, 2: 3 }), holes(3, { 0: 1, 2: 3 }))).toBe(true);
    expect(equal(Object.assign([1], { x: 1 }), [1])).toBe(false);
  });

  it("compares prototypes, key order and own keys", () => {
    expect(equal({ a: 1 }, Object.assign(Object.create(null), { a: 1 }))).toBe(false);
    expect(equal(new (class A {})(), {})).toBe(false);
    expect(equal({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
    expect(equal({ a: 1, b: 2 }, { b: 2, a: 1 }, { keyOrder: false })).toBe(true);
    expect(equal({ a: undefined }, {})).toBe(false);
  });

  it("compares numbers as Object.is does", () => {
    expect(equal(NaN, NaN)).toBe(true);
    expect(equal([NaN], [NaN])).toBe(true);
    expect(equal(0, -0)).toBe(false);
    expect(equal(1, "1")).toBe(false);
  });

  it("compares Dates, boxed values, RegExps and errors by value", () => {
    expect(equal(new Date(1), new Date(1))).toBe(true);
    expect(equal(new Date(1), new Date(2))).toBe(false);
    expect(equal(new Number(1), new Number(2))).toBe(false);
    expect(equal(/a/g, /a/i)).toBe(false);
    expect(equal(new Error("a"), new Error("b"))).toBe(false);
  });

  it("compares typed arrays and buffers byte for byte", () => {
    expect(equal(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(equal(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(equal(Buffer.from("ab"), Buffer.from("ab"))).toBe(true);
    expect(equal(new Uint8Array([1]), new Int8Array([1]))).toBe(false);
  });

  it("compares Maps and Sets entry by entry, in order", () => {
    expect(equal(new Map([["a", [1]]]), new Map([["a", [1]]]))).toBe(true);
    expect(equal(new Map([["a", [1]]]), new Map([["a", [2]]]))).toBe(false);
    expect(equal(new Set([1, 2]), new Set([2, 1]))).toBe(false);
    expect(equal(new Set([{ a: 1 }]), new Set([{ a: 1 }]))).toBe(true);
  });

  it("ends on cycles", () => {
    const a: unknown[] = [1];
    a.push(a);
    const b: unknown[] = [1];
    b.push(b);
    expect(equal(a, b)).toBe(true);
    const c: unknown[] = [2];
    c.push(c);
    expect(equal(a, c)).toBe(false);
  });

  // An alias's value is the anchored object itself: a change through one
  // shows through the other. A copy looks the same until then.
  it("pairs objects one to one, unless told not to", () => {
    const shared = { x: 1 };
    const aliased = { base: shared, copy: shared };
    const copied = { base: { x: 1 }, copy: { x: 1 } };
    expect(equal(aliased, aliased)).toBe(true);
    expect(equal(aliased, { ...aliased })).toBe(true);
    expect(equal(aliased, copied)).toBe(false);
    expect(equal(copied, aliased)).toBe(false);
    expect(equal(aliased, copied, { identity: false })).toBe(true);
    const list = [1];
    expect(equal(new Map([[list, list]]), new Map([[[1], [1]]]))).toBe(false);
    // Each side's object found again with another partner.
    const [p, q] = [{ a: 1 }, { a: 1 }];
    const [r, s] = [{ a: 1 }, { a: 1 }];
    expect(equal([p, q, p], [r, s, r])).toBe(true);
    expect(equal([p, q, p], [r, s, s])).toBe(false);
    const a: unknown[] = [];
    a.push(a, a);
    const b: unknown[] = [];
    b.push(b, [b, b]);
    expect(equal(a, b)).toBe(false);
    expect(equal(a, b, { identity: false })).toBe(true);
  });
});

describe("jsonStream", () => {
  it("reads whole values, numbers included", () => {
    expect(jsonStream("123\n")).toEqual([123]);
    expect(jsonStream("12.5\n-3e2\n")).toEqual([12.5, -300]);
    expect(jsonStream("1 23")).toEqual([1, 23]);
    expect(jsonStream("true\nfalse\nnull\n")).toEqual([true, false, null]);
    expect(jsonStream('"a \\" ]" "b"')).toEqual(['a " ]', "b"]);
    expect(jsonStream('{"a":[1,{"b":"}"}]}\n[2,3]\n')).toEqual([{ a: [1, { b: "}" }] }, [2, 3]]);
    expect(jsonStream("")).toEqual([]);
  });

  it("throws on what isn't JSON", () => {
    expect(() => jsonStream("[1,")).toThrow();
    expect(() => jsonStream("nope")).toThrow();
  });
});

describe("run arguments", () => {
  // N=not-a-number once ran every fuzzer for no iterations, and passed.
  it("take a positive integer count and an integer seed", () => {
    expect(iterationsArg(undefined, 5000)).toBe(5000);
    expect(iterationsArg("20", 5000)).toBe(20);
    for (const arg of ["not-a-number", "", "0", "-1", "1.5", "Infinity", "1e300"])
      expect(() => iterationsArg(arg, 1)).toThrow(/positive integer/);
    expect(seedArg(undefined)).toBe(1);
    expect(seedArg("-3")).toBe(-3);
    for (const arg of ["x", "NaN", "0.5", "Infinity"])
      expect(() => seedArg(arg)).toThrow(/integer/);
  });

  it("fail a count that is NaN", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expectCount("crashes", NaN, 0);
      expect(process.exitCode).toBe(1);
      expect(log).toHaveBeenCalledWith("FAIL crashes: NaN, expected 0");
    } finally {
      process.exitCode = undefined;
      log.mockRestore();
    }
  });
});
