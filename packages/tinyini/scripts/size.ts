// Bundles each entry with esbuild (minified ESM) and prints minified and
// gzip -9 sizes next to ini 7.0.0, the version confbox bundles.
import { buildSync } from "esbuild";
import { gzipSync } from "node:zlib";

const entries: Record<string, string> = {
  "tinyini (whole module)": "export { default } from './src/index.ts'",
  "tinyini parse + stringify, as confbox imports them":
    "export { parse, stringify } from './src/index.ts'",
  "tinyini parse only": "export { parse } from './src/index.ts'",
  "ini (whole module)": "export { default } from 'ini'",
  "ini parse + stringify, as confbox imports them": "export { parse, stringify } from 'ini'",
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
  const kb = (n: number) => `${(n / 1024).toFixed(2)} KB`;
  const gzip = gzipSync(code, { level: 9 }).length;
  json[name] = { min: code.length, gzip };
  if (!process.argv.includes("--json"))
    console.log(
      `${name.padEnd(50)} ${kb(code.length).padStart(9)} min ${kb(gzip).padStart(8)} gzip`,
    );
}
if (process.argv.includes("--json")) console.log(JSON.stringify(json, null, 2));
