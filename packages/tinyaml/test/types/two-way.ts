// Types that code passes between an original and tinyaml: each must be
// assignable to the other, so a function typed with either accepts both.
// scripts/types-compat.ts typechecks this against tinyaml's source, and with
// the imports of it rewritten to "tinyaml/<entry>", against the packed package.
import type * as jsYaml from "js-yaml";
import type * as jsYaml5 from "js-yaml5";
import type * as tinyJsYaml from "../../src/js-yaml/index.ts";
import type * as tinyJsYaml5 from "../../src/js-yaml-v5/index.ts";

declare const original: {
  mark: jsYaml.Mark;
  exception: jsYaml.YAMLException;
  arguments: ConstructorParameters<typeof jsYaml.YAMLException>;
  mark5: NonNullable<jsYaml5.YAMLException["mark"]>;
  exception5: jsYaml5.YAMLException;
  arguments5: ConstructorParameters<typeof jsYaml5.YAMLException>;
};
declare const tinyaml: {
  mark: tinyJsYaml.Mark;
  exception: tinyJsYaml.YAMLException;
  arguments: ConstructorParameters<typeof tinyJsYaml.YAMLException>;
  mark5: NonNullable<tinyJsYaml5.YAMLException["mark"]>;
  exception5: tinyJsYaml5.YAMLException;
  arguments5: ConstructorParameters<typeof tinyJsYaml5.YAMLException>;
};
export const fromOriginal: typeof tinyaml = original;
export const fromTinyaml: typeof original = tinyaml;
