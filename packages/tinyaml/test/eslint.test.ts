import { Linter } from "eslint";
import { describe, expect, it } from "vite-plus/test";
import tinyaml from "../src/eslint.ts";

const linter = new Linter({ configType: "flat" });
const check = (text: string) =>
  linter
    .verify(text, [tinyaml.configs.recommended], "config.yaml")
    .map(({ ruleId, severity, line, column }) => `${ruleId} ${severity} ${line}:${column}`);

describe("eslint plugin", () => {
  it("reports each rule at the linter's position, with its severity", () => {
    expect(check("draft: no\n[a, b]: c\n")).toEqual(["tinyaml/invalid-yaml 2 2:10"]);
    expect(check("draft: no\nport: 0b10\n")).toEqual([
      "tinyaml/ambiguous-value 1 1:8",
      "tinyaml/ambiguous-value 1 2:7",
    ]);
  });

  it("reports nothing for clean YAML", () => {
    expect(check('draft: false\ntitle: "no"\n')).toEqual([]);
  });
});
