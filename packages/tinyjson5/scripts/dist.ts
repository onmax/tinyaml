// The built dist/ that size.ts measures and the dist test runs check: what
// npm users get. Each entry is the file package.json exports it as.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** Each entry's name, `index` for the root, to its built file. */
export const ENTRIES: Record<string, string> = Object.fromEntries(
  Object.values(JSON.parse(readFileSync(root("package.json"), "utf8")).exports as object)
    .filter((path: string) => path.endsWith(".mjs"))
    .map((path: string) => [path.slice("./dist/".length, -".mjs".length), root(path)]),
);

const SOURCES = new Map(
  Object.entries(ENTRIES).map(([name, file]) => [
    root(name === "index" ? "src/index.ts" : `src/${name}/index.ts`),
    file,
  ]),
);

/** The built file for the path of one of our entries' index.ts, if it's one. */
export const builtFile = (path: string): string | undefined => SOURCES.get(path);

/** Why dist/ isn't what src/ builds to: an entry is missing, or older than the source. */
export function stale(): string | undefined {
  const built = Object.values(ENTRIES).map((file) =>
    existsSync(file) ? statSync(file).mtimeMs : 0,
  );
  const sources = ["package.json", "tsconfig.json", "vite.config.ts"].map(root);
  for (const file of readdirSync(root("src"), { recursive: true, encoding: "utf8" }))
    sources.push(root(`src/${file}`));
  const oldest = Math.min(...built);
  if (!oldest) return "dist/ is missing an entry";
  const newer = sources.find((file) => statSync(file).mtimeMs > oldest);
  return newer && `${newer} is newer than dist/`;
}

/** Runs `vp pack` unless dist/ is up to date. Its output goes to stderr. */
export function build(): void {
  if (!stale()) return;
  execFileSync(root("node_modules/.bin/vp"), ["pack"], {
    cwd: root(""),
    stdio: ["ignore", process.stderr, "inherit"],
  });
}
