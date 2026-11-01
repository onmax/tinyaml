// Bundles each entry with esbuild (minified ESM) and prints minified and
// gzip -9 sizes next to json5 2.2.3, the version confbox bundles.
import { buildSync } from "esbuild";
import { gzipSync } from "node:zlib";

const entries: Record<string, string> = {
  "tinyjson5 (parse + stringify)": "export { default } from './src/index.ts'",
  "tinyjson5 parse only": "export { parse } from './src/index.ts'",
  "json5 (parse + stringify)": "export { default } from 'json5'",
  "json5 lib files, as confbox imports them":
    "export { default as parse } from 'json5/lib/parse.js'; export { default as stringify } from 'json5/lib/stringify.js'",
  "json5 parse only": "export { default } from 'json5/lib/parse.js'",
};

// --json prints { [entry]: { min, gzip } } in bytes instead, for the root charts.
const json: Record<string, { min: number; gzip: number }> = {};
for (const [name, contents] of Object.entries(entries)) {
  const result = buildSync({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    write: false,
  });
  const code = result.outputFiles[0]!.contents;
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  const gzip = gzipSync(code, { level: 9 }).length;
  json[name] = { min: code.length, gzip };
  if (!process.argv.includes("--json"))
    console.log(
      `${name.padEnd(42)} ${kb(code.length).padStart(9)} min ${kb(gzip).padStart(8)} gzip`,
    );
}
if (process.argv.includes("--json")) console.log(JSON.stringify(json, null, 2));
