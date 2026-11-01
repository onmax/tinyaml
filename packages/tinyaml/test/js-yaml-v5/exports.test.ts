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

it("reads its options in js-yaml 5's order and count", () => {
  // Through a getter and every trap, with a symbol and options only the
  // other call or neither library knows.
  const options = (lib: typeof real, log: string[], dumps: boolean) => {
    const target: Record<PropertyKey, unknown> = dumps
      ? { schema: lib.DUMP_SCHEMA, noRefs: true, flowLevel: 1, sortKeys: true, indent: 4 }
      : { schema: lib.CORE_SCHEMA.withTags(lib.mergeTag), json: true, maxDepth: 50 };
    Object.assign(target, { filename: "f", [Symbol("s")]: 1, other: 0 });
    Object.defineProperty(target, "maxAliases", {
      get: () => (log.push("maxAliases"), 5),
      enumerable: true,
    });
    return new Proxy(target, {
      get: (t, key, r) => (log.push(`get ${String(key)}`), Reflect.get(t, key, r)),
      has: (t, key) => (log.push(`has ${String(key)}`), Reflect.has(t, key)),
      ownKeys: (t) => (log.push("ownKeys"), Reflect.ownKeys(t)),
      getOwnPropertyDescriptor: (t, key) => (
        log.push(`descriptor ${String(key)}`),
        Reflect.getOwnPropertyDescriptor(t, key)
      ),
    }) as never;
  };
  const runs = [
    (lib: typeof real, log: string[]) =>
      lib.load("a: &a {b: 1}\nc: {<<: *a}", options(lib, log, false)),
    (lib: typeof real, log: string[]) =>
      lib.loadAll("a\n---\nb", () => {}, options(lib, log, false)),
    (lib: typeof real, log: string[]) => lib.loadAll("a: [", options(lib, log, false)),
    (lib: typeof real, log: string[]) => lib.dump({ b: [1], a: { c: 2 } }, options(lib, log, true)),
  ];
  for (const run of runs) {
    const reads = (lib: typeof real) => {
      const log: string[] = [];
      try {
        run(lib, log);
      } catch {}
      return log;
    };
    expect(reads(tiny as never)).toEqual(reads(real));
  }
  let n = 0;
  tiny.load("x", {
    get maxAliases() {
      return (n++, 0);
    },
  });
  expect(n).toBe(1);
});
