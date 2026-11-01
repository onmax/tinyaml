import { describe, expect, it } from "vite-plus/test";
import {
  COLLECTION_STYLE,
  CORE_SCHEMA,
  DEFAULT_SCALAR_STYLE_RULES,
  dump,
  realMapTag,
  SCALAR_STYLE,
} from "../../src/js-yaml-v5/index.ts";

describe("dump", () => {
  it("writes js-yaml 5's default output", () => {
    expect(
      dump({
        a: 1,
        b: [1, "two", { c: null }],
        d: "yes",
        e: "multi\nline\n",
        f: new Date(0),
        g: new Set(["x"]),
        h: new Uint8Array([104, 105]),
      }),
    ).toBe(
      "a: 1\nb:\n  - 1\n  - two\n  - c: null\nd: 'yes'\ne: |\n  multi\n  line\nf: 1970-01-01T00:00:00.000Z\ng: !!set\n  x: null\nh: !!binary aGk=\n",
    );
  });

  it("reads its input in js-yaml 5's order and count", () => {
    // js-yaml 5 reads all of a mapping's values before its children, and
    // reads a key by name even after an earlier getter hid it.
    const log: string[] = [];
    const inner = {
      get x() {
        return (log.push("a.x"), 1);
      },
    };
    const value = {
      get a() {
        log.push("a");
        Object.defineProperty(value, "b", { enumerable: false });
        return inner;
      },
      get b() {
        return (log.push("b"), 2);
      },
    };
    expect(dump(value)).toBe("a:\n  x: 1\nb: 2\n");
    expect(log).toEqual(["a", "b", "a.x"]);
    // An item's getter pushes another, which js-yaml's snapshot of the length leaves out.
    const array = () => {
      const v: unknown[] = [];
      Object.defineProperty(v, 0, {
        enumerable: true,
        get: () => (v.length === 1 && v.push("later"), "first"),
      });
      return v;
    };
    expect(dump(array())).toBe("- first\n");
    expect(dump(array(), { flowLevel: 0 })).toBe("[first]\n");
  });

  it("folds long strings at 80 columns", () => {
    expect(dump({ text: "word ".repeat(30).trim() })).toBe(
      `text: >-\n  ${"word ".repeat(15).trim()}\n  ${"word ".repeat(15).trim()}\n`,
    );
    expect(dump("word ".repeat(30).trim(), { lineWidth: -1 })).toBe(
      `${"word ".repeat(30).trim()}\n`,
    );
  });

  it("takes the presenter options", () => {
    expect(
      dump(
        { a: [1, { b: 2 }], c: "x y" },
        { flowLevel: 1, quoteStyle: "double", forceQuotes: true, flowBracketPadding: true },
      ),
    ).toBe('a: [ 1, { b: 2 } ]\nc: "x y"\n');
    expect(dump({ a: [1] }, { indent: 4, seqNoIndent: true })).toBe("a:\n- 1\n");
    expect(
      dump({ a: [1, 2] }, { flowLevel: 0, flowSkipCommaSpace: true, flowSkipColonSpace: true }),
    ).toBe('{"a":[1,2]}\n');
  });

  it("writes anchors for shared objects unless noRefs", () => {
    const o = { a: 1 };
    expect(dump([o, o])).toBe("- &ref_0\n  a: 1\n- *ref_0\n");
    expect(dump([o, o], { noRefs: true })).toBe("- a: 1\n- a: 1\n");
  });

  it("sorts keys and runs transform on the AST", () => {
    expect(dump({ b: 1, a: 2 }, { sortKeys: true })).toBe("a: 2\nb: 1\n");
    expect(
      dump(
        { b: 1, a: [1, 2] },
        {
          transform: (docs) => {
            const root = docs[0]!.contents as any;
            root.items.reverse();
            root.items[0].value.style = COLLECTION_STYLE.FLOW;
            docs[0]!.explicitStart = true;
          },
        },
      ),
    ).toBe("---\na: [1, 2]\nb: 1\n");
  });

  it("applies custom scalar style rules", () => {
    const literal = (layout: any) => {
      if (!layout.isKey && layout.allowedStylesMask & (1 << SCALAR_STYLE.LITERAL_BLOCK))
        layout.style = SCALAR_STYLE.LITERAL_BLOCK;
    };
    expect(
      dump(
        { a: "x" },
        { scalarStyleRules: [literal, ...Object.values(DEFAULT_SCALAR_STYLE_RULES)] },
      ),
    ).toBe("a: |-\n  x\n");
  });

  it("throws on values YAML can't hold unless skipInvalid", () => {
    expect(() => dump({ f() {} })).toThrow(
      "unacceptable kind of an object to dump [object Function]",
    );
    expect(dump({ f() {}, a: 1, u: undefined }, { skipInvalid: true })).toBe("a: 1\n");
    expect(dump([undefined])).toBe("- null\n");
  });

  it("writes Maps with realMapTag", () => {
    expect(
      dump(
        new Map<unknown, unknown>([
          [1, "a"],
          [["x"], "b"],
        ]),
        { schema: CORE_SCHEMA.withTags(realMapTag) },
      ),
    ).toBe("1: a\n? - x\n: b\n");
  });
});
