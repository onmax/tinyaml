// Bundles each entry with esbuild (minified ESM), the way PR #1 measured
// Comark's bundle, and prints minified and gzip -9 sizes next to js-yaml.
import { buildSync } from 'esbuild'
import { gzipSync } from 'node:zlib'

const entries: Record<string, string> = {
  'tinyaml (load + dump)': "export { loadAll, dump, YAMLException } from './src/index.ts'",
  'tinyaml load only': "export { loadAll, YAMLException } from './src/index.ts'",
  'js-yaml (loadAll + dump, as Comark imports it)': "export { loadAll, dump, JSON_SCHEMA, YAMLException } from 'js-yaml'",
  'js-yaml load only': "export { loadAll, JSON_SCHEMA, YAMLException } from 'js-yaml'",
}

for (const [name, contents] of Object.entries(entries)) {
  const result = buildSync({
    stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  })
  const code = result.outputFiles[0]!.contents
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
  console.log(`${name.padEnd(48)} ${kb(code.length).padStart(9)} min ${kb(gzipSync(code, { level: 9 }).length).padStart(8)} gzip`)
}
