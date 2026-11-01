import { describe, expect, it } from "vite-plus/test";
import { COUNT } from "../src/core/codes.ts";
import { MESSAGES as english } from "../src/core/messages.ts";
import { MESSAGES as jsYaml } from "../src/js-yaml/messages.ts";
import { MESSAGES as jsYaml5 } from "../src/js-yaml-v5/messages.ts";
import { MESSAGES as std } from "../src/std/messages.ts";
import { MESSAGES as yaml } from "../src/yaml/messages.ts";

// A table that skips or adds a line words every later code wrongly.
describe("message tables", () => {
  it.each(Object.entries({ english, jsYaml, jsYaml5, std, yaml }))(
    "%s has a line per error code",
    (_, table) => expect(table).toHaveLength(COUNT),
  );
});
