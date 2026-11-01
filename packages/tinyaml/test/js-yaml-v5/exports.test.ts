import { expect, it } from "vite-plus/test";
import * as real from "js-yaml5";
import * as tiny from "../../src/js-yaml-v5/index.ts";

it("exports every load/dump tag, schema and style constant", () => {
  for (const [name, value] of Object.entries(real)) {
    if (/Tag$|SCHEMA$|^(?:SCALAR_STYLE|COLLECTION_STYLE)(?:_|$)/.test(name)) {
      expect(name in tiny, name).toBe(true);
      if (typeof value === "number" || name.endsWith("STYLE"))
        expect(tiny[name as keyof typeof tiny], name).toEqual(value);
    }
  }
  expect("default" in tiny).toBe("default" in real);
});

it("reports finalize errors at the explicit tag", () => {
  const schema = tiny.CORE_SCHEMA.withTags(
    tiny.defineSequenceTag("!immutable", {
      create: () => [],
      addItem: () => {},
      finalize: () => {
        throw new Error("cannot create immutable value");
      },
      identify: Array.isArray,
      represent: (value: unknown[]) => value,
    }),
  );
  try {
    tiny.load("root:\n  !immutable [one]", { schema, filename: "example.yml" });
    throw new Error("expected finalize to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(tiny.YAMLException);
    expect((error as tiny.YAMLException).mark).toMatchObject({
      name: "example.yml",
      line: 1,
      column: 2,
    });
  }
});
