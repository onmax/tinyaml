import { expect, it } from "vite-plus/test";
import * as real from "js-yaml5";
import * as tiny from "../../src/js-yaml-v5/index.ts";

it("preserves non-specific empty tags and content byte order marks", () => {
  for (const source of ["!", "---\na\nb\n\uFEFFc\n", "!\n a\nnull #", '"a\\\n \n b"'])
    expect(tiny.loadAll(source)).toEqual(real.loadAll(source));
});

it("merges sets through their mapping tag", () => {
  const source = "a: &a !!set {x, y}\nb: {<<: *a}\n";
  expect(tiny.load(source, { schema: tiny.YAML11_SCHEMA })).toEqual(
    real.load(source, { schema: real.YAML11_SCHEMA }),
  );
});

it("rejects nested recursive aliases in finalized carriers", () => {
  const schema = tiny.CORE_SCHEMA.withTags(
    tiny.defineSequenceTag("!immutable", {
      create: () => [] as unknown[],
      addItem: (carrier, item) => {
        carrier.push(item);
      },
      finalize: (carrier) => Object.freeze([...carrier]),
      identify: Array.isArray,
      represent: (value: unknown[]) => value,
    }),
  );
  for (const source of ["&a !immutable [*a]", "&a !immutable [&b [*a]]"])
    expect(() => tiny.load(source, { schema })).toThrow(
      'recursive alias "a" is not supported for tag !immutable because it uses finalize()',
    );
});

it("rejects leading empty block scalar lines longer than the content", () => {
  expect(() => tiny.load("a: |\n   \n b\n")).toThrow(/bad indentation/);
});

it("reads flow node properties across lines as js-yaml 5 does", () => {
  const outcome = (load: (source: string) => unknown, source: string) => {
    try {
      return load(source);
    } catch (error) {
      const { reason, mark } = error as { reason: string; mark: { position: number } };
      return `${reason} @${mark.position}`;
    }
  };
  for (const source of [
    "[!!str\n &a x]",
    "[!t\n]",
    "{!oo\n:bar}\n",
    "[&a\n!t x]",
    "[!!str \n",
    "{!\n",
    "[&a \n &b c]",
    "[!!str \n !!int c]",
    "{a: &a \n &b c}",
    "[!!str \n &c \n c]",
    "[&a \n !!str \n &b c]",
    "[&a \n k: v]",
    "[&a &b c]",
    "- !!str \n  &c c",
    "- &a \n  &b c",
    "a: &a \n  &b c",
    "? &a \n  &b c",
    "- &a \n  !!str &b c",
    "- &a # c\n  &b |\n  x",
    "- &a \n  &b - x",
    "a:\n  - !!str \n    !!int c",
    "a: &x \n  &b &c k: v",
    "a: &a \n  &b k: v",
  ])
    expect(outcome(tiny.loadAll, source)).toEqual(outcome(real.loadAll, source));
  expect(() => tiny.load("[&a\n &b x]")).toThrow("missed comma between flow collection entries");
});
