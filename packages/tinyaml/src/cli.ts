#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { parseArgs } from "node:util";
import { lintFiles } from "./linter.ts";

const USAGE = `Usage: tinyaml-lint <file or glob>... [--format text|json]

Checks YAML files the way tinyaml loads them. Exits with 1 if there are problems.`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    format: { type: "string", default: "text" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || !positionals.length || (values.format !== "text" && values.format !== "json")) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 2);
}

let failed = false;
const files: string[] = [];
for (const input of positionals) {
  if (!/[*?[\]{}]/.test(input)) {
    files.push(input);
    continue;
  }
  const matches = await Array.fromAsync(
    glob(input, { exclude: (path) => /(?:^|[/\\])(?:node_modules|dist)$/.test(path) }),
  );
  if (!matches.length) {
    console.error(`tinyaml-lint: ${input} matches no files`);
    failed = true;
  }
  files.push(...matches.sort());
}

const results = await lintFiles([...new Set(files)], (file) =>
  readFile(file, "utf8").catch(() => undefined),
);
const problems = results.flatMap(({ file, text, diagnostics }) => {
  if (text === undefined) {
    console.error(`tinyaml-lint: can't read ${file}`);
    failed = true;
  }
  return diagnostics.map((diagnostic) => ({ file, ...diagnostic }));
});

if (values.format === "json") console.log(JSON.stringify(problems, null, 2));
else
  for (const { file, line, column, rule, message, fix } of problems)
    console.log(`${file}:${line}:${column} ${rule} ${message} ${fix}`);

process.exit(failed || problems.length ? 1 : 0);
