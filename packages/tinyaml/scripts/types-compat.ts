// Typechecks each usage file in test/types with its import resolved to the
// original library, to tinyaml's source for the same subpath, and to the
// packed package as npm would publish it, installed into a scratch
// consumer, under both `moduleResolution: nodenext` and `bundler`. Code that
// compiles against the original must compile against tinyaml, and against
// the declarations it ships. The packed checks count errors in those
// declarations too. Last, it typechecks an import of every entry and of
// tinyaml/package.json under TypeScript 5's legacy `moduleResolution: node`,
// which ignores `exports` and reads `typesVersions` instead (TypeScript 7
// dropped it). This builds dist/ first if it's stale.
// Usage: node scripts/types-compat.ts
import { execFile, execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "./dist.ts";

const pairs: [lib: string, specifier: string, subpath: string][] = [
  ["js-yaml", "js-yaml", "src/js-yaml/index.ts"],
  ["js-yaml-v5", "js-yaml5", "src/js-yaml-v5/index.ts"],
  ["yaml", "yaml", "src/yaml/index.ts"],
  ["yamljs", "yamljs", "src/yamljs/index.ts"],
  ["std", "@std/yaml", "src/std/index.ts"],
];

// What a strict consumer project might set. exactOptionalPropertyTypes is on
// so that passing a possibly undefined option is checked too.
const compilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  target: "esnext",
  lib: ["esnext", "dom"],
  module: "nodenext",
  moduleResolution: "nodenext",
  verbatimModuleSyntax: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  types: ["node"],
};

// A directory of each run's own, so runs at once don't share a consumer.
mkdirSync("node_modules/.cache", { recursive: true });
const dir = resolve(mkdtempSync("node_modules/.cache/types-compat-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

// The error lines of a tsrs run on `config`.
async function tsrs(config: string, cwd?: string): Promise<string[]> {
  const output = await promisify(execFile)(
    resolve("node_modules/.bin/tsrs"),
    ["--noEmit", "--pretty", "false", "-p", config],
    { cwd, encoding: "utf8" },
  ).then(
    (result) => result.stdout,
    // A failed run without diagnostics means tsrs itself failed.
    (error: Error & { stdout?: string }) => {
      if (!error.stdout?.includes("error TS")) throw error;
      return error.stdout;
    },
  );
  return output.split("\n").filter((line) => line.includes("error TS"));
}

async function check(lib: string, specifier: string, subpath?: string) {
  const file = `test/types/${lib}.ts`;
  const config = resolve(dir, `${lib}.${subpath ? "tinyaml" : "original"}.json`);
  const paths = subpath ? { [specifier]: [resolve(subpath)] } : {};
  writeFileSync(
    config,
    JSON.stringify({ compilerOptions: { ...compilerOptions, paths }, files: [resolve(file)] }),
  );
  const errors = await tsrs(config);
  // tinyaml's own sources are checked as source here, under the consumer's
  // flags; a published .d.ts wouldn't be, so only the usage file counts.
  return {
    errors: errors.filter((line) => line.startsWith(file)),
    ignored: errors.filter((line) => !line.startsWith(file)).length,
  };
}

const results = await Promise.all(
  pairs.map(async ([lib, specifier, subpath]) => ({
    lib,
    specifier,
    subpath,
    original: await check(lib, specifier),
    tinyaml: await check(lib, specifier, subpath),
  })),
);

// The packed consumer. A package.json of its own, as a consumer has, keeps
// TypeScript from resolving `tinyaml` to this package by its name, which
// it would do from anywhere under this directory.
const consumer = resolve(dir, "consumer");
build();
mkdirSync(resolve(consumer, "node_modules"), { recursive: true });
writeFileSync(
  resolve(consumer, "package.json"),
  JSON.stringify({ name: "consumer", private: true, type: "module" }),
);
execFileSync("npm", ["pack", "--ignore-scripts", "--silent", "--pack-destination", consumer], {
  stdio: ["ignore", "ignore", "inherit"],
});
const tarball = readdirSync(consumer).find((file) => file.endsWith(".tgz"))!;
execFileSync("tar", ["-xzf", tarball, "-C", "node_modules"], { cwd: consumer });
renameSync(resolve(consumer, "node_modules/package"), resolve(consumer, "node_modules/tinyaml"));

// Each usage file, its import of the original rewritten to tinyaml's
// subpath, against the installed package. Errors in the usage file and in
// tinyaml's declarations count; skipLibCheck is off so the latter show.
const resolutions = {
  nodenext: { module: "nodenext", moduleResolution: "nodenext" },
  bundler: { module: "preserve", moduleResolution: "bundler" },
};
mkdirSync(resolve(consumer, "usage"));
writeFileSync(resolve(consumer, "usage/assert.ts"), readFileSync("test/types/assert.ts"));
async function installed(lib: string, specifier: string, resolution: keyof typeof resolutions) {
  const file = `usage/${lib}.ts`;
  const code = readFileSync(`test/types/${lib}.ts`, "utf8").replaceAll(
    `from "${specifier}"`,
    `from "tinyaml/${lib}"`,
  );
  if (new RegExp(`(?:from|import\\()\\s*["']${specifier}["']`).test(code))
    throw new Error(`${file} still imports ${specifier}`);
  writeFileSync(resolve(consumer, file), code);
  const config = `${lib}.${resolution}.json`;
  writeFileSync(
    resolve(consumer, config),
    JSON.stringify({
      compilerOptions: { ...compilerOptions, ...resolutions[resolution], skipLibCheck: false },
      files: [file],
    }),
  );
  const errors = await tsrs(config, consumer);
  const ours = (line: string) => line.startsWith(file) || line.startsWith("node_modules/tinyaml/");
  return { errors: errors.filter(ours), ignored: errors.filter((line) => !ours(line)).length };
}
const packedResults = await Promise.all(
  pairs.flatMap(([lib, specifier]) =>
    (Object.keys(resolutions) as (keyof typeof resolutions)[]).map(async (resolution) => ({
      lib,
      resolution,
      ...(await installed(lib, specifier, resolution)),
    })),
  ),
);

const consumerFile = "consumer.ts";
async function legacy() {
  writeFileSync(
    resolve(consumer, consumerFile),
    `import metadata from "tinyaml/package.json";
import { parse, YAMLError } from "tinyaml";
import { load, YAMLException } from "tinyaml/js-yaml";
import { load as load5, type ScalarStyle } from "tinyaml/js-yaml-v5";
import { parse as yamlParse, YAMLParseError } from "tinyaml/yaml";
import yamljs from "tinyaml/yamljs";
import { parse as stdParse, YamlSyntaxError } from "tinyaml/std";

const name: string = metadata.name;
const version: string = metadata.version;
const values: unknown[] = [parse("a: 1"), load("a"), load5("a"), yamlParse("a"), yamljs.parse("a"), stdParse("a")];
const errors: Error[] = [new YAMLError("x", 1, 1), new YAMLException("x")];
const classes = [YAMLParseError, YamlSyntaxError];
const style: ScalarStyle | undefined = undefined;
export { name, version, values, errors, classes, style };
`,
  );
  writeFileSync(
    resolve(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        moduleResolution: "node",
        module: "commonjs",
        target: "es2022",
        resolveJsonModule: true,
        esModuleInterop: true,
        types: [],
      },
      files: [consumerFile],
    }),
  );
  const options = ["--pretty", "false", "-p", "tsconfig.json"];
  return promisify(execFile)(resolve("node_modules/typescript5/bin/tsc"), options, {
    cwd: consumer,
    encoding: "utf8",
  }).then(
    () => [],
    (error: Error & { stdout?: string }) => {
      if (!error.stdout?.includes("error TS")) throw error;
      return error.stdout.split("\n").filter((line) => line.includes("error TS"));
    },
  );
}
const consumerErrors = await legacy();

let failed = false;
const status = ({ errors }: { errors: string[] }) =>
  errors.length ? `${errors.length} error(s)` : "ok";
for (const { lib, specifier, subpath, original, tinyaml } of results) {
  console.log(
    `${lib.padEnd(10)} ${specifier.padEnd(10)} ${status(original).padEnd(12)} tinyaml/${lib.padEnd(10)} ${status(tinyaml)}${tinyaml.ignored ? ` (${tinyaml.ignored} in ${subpath}'s module graph not counted)` : ""}`,
  );
  for (const line of [...original.errors, ...tinyaml.errors]) console.log(`  ${line}`);
  failed ||= original.errors.length + tinyaml.errors.length > 0;
}
for (const { lib, resolution, errors, ignored } of packedResults) {
  console.log(
    `packed tinyaml/${lib.padEnd(10)} ${resolution.padEnd(8)} ${status({ errors })}${ignored ? ` (${ignored} outside tinyaml's declarations not counted)` : ""}`,
  );
  for (const line of errors) console.log(`  ${line}`);
  failed ||= errors.length > 0;
}
console.log(
  `packed tinyaml, every entry and tinyaml/package.json, TypeScript 5 moduleResolution node: ${consumerErrors.length ? `${consumerErrors.length} error(s)` : "ok"}`,
);
for (const line of consumerErrors) console.log(`  ${line}`);
failed ||= consumerErrors.length > 0;
if (failed) process.exitCode = 1;
