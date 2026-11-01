// Every runtime export of each original library that tinyaml covers exists in
// tinyaml's subpath with the same typeof, and so does each default export's
// shape. What isn't covered is listed in OUT_OF_SCOPE, with the reason.
import * as std from "@std/yaml";
import * as jsYaml from "js-yaml";
import * as yaml from "yaml";
import yamljs from "yamljs";
import { describe, expect, it } from "vite-plus/test";
import * as tinyJsYaml from "../../src/js-yaml/index.ts";
import * as tinyStd from "../../src/std/index.ts";
import * as tinyYaml from "../../src/yaml/index.ts";
import * as tinyYamljs from "../../src/yamljs/index.ts";

const OUT_OF_SCOPE: Record<string, string[]> = {
  // Nothing: js-yaml 4's deprecated safeLoad, safeLoadAll and safeDump are
  // exported too, and work instead of throwing.
  "js-yaml": [],
  // tinyaml/yaml is `parse` and `stringify` with their errors. Not the
  // Document, node, schema, visitor, CST, lexer, parser or composer APIs.
  yaml: [
    "Alias",
    "CST",
    "Composer",
    "Document",
    "Lexer",
    "LineCounter",
    "Pair",
    "Parser",
    "Scalar",
    "Schema",
    "YAMLMap",
    "YAMLSeq",
    "isAlias",
    "isCollection",
    "isDocument",
    "isMap",
    "isNode",
    "isPair",
    "isScalar",
    "isSeq",
    "parseAllDocuments",
    "parseDocument",
    "visit",
    "visitAsync",
  ],
  yamljs: [],
  std: [],
};

// Node gives a CommonJS module's namespace `default` and `module.exports`.
const named = (ns: object) =>
  Object.keys(ns).filter((key) => key !== "default" && key !== "module.exports");

const pairs: [lib: string, original: object, tinyaml: object][] = [
  ["js-yaml", jsYaml, tinyJsYaml],
  ["yaml", yaml, tinyYaml],
  // yamljs is CommonJS with only `module.exports`, which @types/yamljs
  // also allows to be imported by name.
  ["yamljs", yamljs, tinyYamljs],
  ["std", std, tinyStd],
];

describe.each(pairs)("tinyaml/%s", (lib, original, tinyaml) => {
  const outOfScope = OUT_OF_SCOPE[lib]!;
  const inScope = named(original).filter((key) => !outOfScope.includes(key));

  it("has every export in scope, with the same typeof", () => {
    const typeOf = (ns: object) =>
      Object.fromEntries(inScope.map((key) => [key, typeof (ns as any)[key]]));
    expect(typeOf(tinyaml)).toEqual(typeOf(original));
  });

  it("lists only exports the original has and tinyaml lacks as out of scope", () => {
    expect(outOfScope.filter((key) => !(key in original))).toEqual([]);
    expect(outOfScope.filter((key) => key in tinyaml)).toEqual([]);
  });
});

describe("default exports", () => {
  const shape = (value: object, keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, typeof (value as any)[key]]));

  it("js-yaml: the same object of functions, schemas and types", () => {
    const keys = Object.keys(jsYaml.default);
    expect(typeof tinyJsYaml.default).toBe(typeof jsYaml.default);
    expect(shape(tinyJsYaml.default, keys)).toEqual(shape(jsYaml.default, keys));
  });

  it("yaml: parse, stringify and the errors", () => {
    const keys = Object.keys(yaml.default).filter((key) => !OUT_OF_SCOPE.yaml!.includes(key));
    expect(keys.sort()).toEqual(Object.keys(tinyYaml.default).sort());
    expect(shape(tinyYaml.default, keys)).toEqual(shape(yaml.default, keys));
  });

  it("yamljs: every static method", () => {
    // yamljs's default export is its YAML class, called only through its
    // static methods; tinyaml's is a plain object with the same methods.
    const keys = Object.keys(yamljs);
    expect(keys.sort()).toEqual(["dump", "load", "parse", "parseFile", "stringify"]);
    expect(shape(tinyYamljs.default, keys)).toEqual(shape(yamljs, keys));
  });

  it("std: none, as in @std/yaml", () => {
    expect("default" in std).toBe(false);
    expect("default" in tinyStd).toBe(false);
  });
});

describe("tinyaml/js-yaml values", () => {
  it("has js-yaml's built-in types, as Type instances", () => {
    // js-yaml exports `types`, but @types/js-yaml doesn't declare it.
    const { types } = jsYaml as unknown as { types: object };
    expect(Object.keys(tinyJsYaml.types).sort()).toEqual(Object.keys(types).sort());
    for (const type of Object.values(tinyJsYaml.types))
      expect(type).toBeInstanceOf(tinyJsYaml.Type);
  });

  it("has its schemas as Schema instances", () => {
    for (const name of ["FAILSAFE_SCHEMA", "JSON_SCHEMA", "CORE_SCHEMA", "DEFAULT_SCHEMA"] as const)
      expect(tinyJsYaml[name]).toBeInstanceOf(tinyJsYaml.Schema);
  });

  it("has an error class extending Error", () => {
    expect(new tinyJsYaml.YAMLException("x")).toBeInstanceOf(Error);
  });
});

describe("error classes extend what the originals' do", () => {
  it("yaml: YAMLParseError and YAMLWarning extend YAMLError", () => {
    for (const error of [
      new tinyYaml.YAMLParseError([0, 0], "IMPOSSIBLE", "x"),
      new tinyYaml.YAMLWarning([0, 0], "IMPOSSIBLE", "x"),
    ]) {
      expect(error).toBeInstanceOf(tinyYaml.YAMLError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("std: YamlSyntaxError extends SyntaxError", () => {
    const position = { line: 1, column: 1, offset: 0 };
    expect(new tinyStd.YamlSyntaxError("x", position)).toBeInstanceOf(SyntaxError);
  });
});
