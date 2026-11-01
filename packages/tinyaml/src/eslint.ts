import type { ESLint, Linter, Rule as RuleModule } from "eslint";
import * as parser from "yaml-eslint-parser";
import { lint, rules as info, type Diagnostic, type Rule } from "./linter.ts";

// SAFETY: the keys of `info` are exactly the rules.
const ids = Object.keys(info) as Rule[];

// Every rule reads one result per file.
const results = new WeakMap<object, Diagnostic[]>();

const rules = Object.fromEntries(
  ids.map((id): [string, RuleModule.RuleModule] => [
    id.replace("tinyaml/", ""),
    {
      meta: {
        type: "problem",
        docs: {
          description: info[id].title,
          url: `https://github.com/onmax/tiny/blob/main/docs/pages/tinyaml/linter/index.md#${id.replace("/", "")}`,
        },
        schema: [],
      },
      create(context) {
        const { sourceCode } = context;
        let found = results.get(sourceCode);
        if (!found) results.set(sourceCode, (found = lint(sourceCode.text)));
        for (const { rule, line, column, message, fix } of found)
          if (rule === id)
            context.report({
              // ESLint counts columns from 0, the linter from 1.
              loc: { line, column: column - 1 },
              message: `${message} ${fix}`,
            });
        return {};
      },
    },
  ]),
);

const plugin = {
  meta: { name: "tinyaml" },
  rules,
  configs: {} as Record<"recommended", Linter.Config>,
} satisfies ESLint.Plugin;

plugin.configs.recommended = {
  name: "tinyaml/recommended",
  files: ["**/*.{yaml,yml}"],
  plugins: { tinyaml: plugin },
  languageOptions: { parser },
  rules: Object.fromEntries(ids.map((id) => [id, info[id].severity])),
};

export default plugin;
