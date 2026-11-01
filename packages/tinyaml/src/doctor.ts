import {
  createRule,
  defineDoctorDiagnostics,
  defineDoctorExtension,
  defineRulePack,
  type RuleContext,
} from "vite-doctor/extension";
import { lintFiles, rules, type LintedFile, type Rule } from "./linter.ts";

export interface DoctorOptions {
  /** YAML to check, relative to the project root. Default `**\/*.{yaml,yml}`. */
  include?: string;
  /** Globs to skip. Default `node_modules` and `dist`. */
  exclude?: readonly string[];
}

// SAFETY: the keys of `rules` are exactly the rules.
const ids = Object.keys(rules) as Rule[];

const diagnostics = defineDoctorDiagnostics(
  ids.map((ruleId) => ({ code: rules[ruleId].code, ruleId })),
  {
    docsBase: (code) => {
      const rule = ids.find((id) => rules[id].code === code);
      return rule && `https://tiny.onmax.me/tinyaml/linter/overview/#${rule.replace("/", "")}`;
    },
  },
);

/**
 * A Doctor Extension that lints the project's YAML with tinyaml. Register it in
 * `doctor.config.ts` and run `vite-doctor . --config doctor.config.ts`.
 */
export default function tinyaml(options: DoctorOptions = {}) {
  const { include = "**/*.{yaml,yml}", exclude = ["**/node_modules/**", "**/dist/**"] } = options;

  // Every Rule reads the same results; the first one to run lints the files.
  const lintProject = async (ctx: RuleContext) => {
    const key = `tinyaml-lint:${ctx.project.root}`;
    let results = ctx.cache.get<LintedFile[]>(key);
    if (!results) {
      results = await lintFiles(ctx.fs.glob(include, { exclude }), (file) => ctx.fs.readText(file));
      // Doctor snapshots dependencies at set(), so all reads must finish first.
      ctx.cache.set(key, results);
    }
    return results;
  };

  const doctorRules = ids.map((id) =>
    createRule({
      meta: {
        id,
        title: rules[id].title,
        category: "correctness",
        severity: rules[id].severity,
        execution: "manifest",
      },
      create(ctx) {
        return {
          async onProjectEnd() {
            for (const { file, text = "", diagnostics: found } of await lintProject(ctx)) {
              const starts = [0];
              for (const match of text.matchAll(/\r\n?|\n/g))
                starts.push(match.index + match[0].length);
              for (const diagnostic of found) {
                if (diagnostic.rule !== id) continue;
                const start = (starts[diagnostic.line - 1] ?? 0) + diagnostic.column - 1;
                ctx.report(
                  diagnostics.diagnostics[rules[id].code]!({
                    why: diagnostic.message,
                    fix: diagnostic.fix,
                    sources: [`${file}:${diagnostic.line}:${diagnostic.column}`],
                  }),
                  {
                    file,
                    range: { start, end: start, line: diagnostic.line, column: diagnostic.column },
                  },
                );
              }
            }
          },
        };
      },
    }),
  );

  return defineDoctorExtension({
    name: "tinyaml",
    rulePacks: [
      defineRulePack({
        name: "tinyaml",
        version: "1.0.0",
        rules: doctorRules,
        diagnostics,
        presets: { recommended: ids },
      }),
    ],
  });
}
