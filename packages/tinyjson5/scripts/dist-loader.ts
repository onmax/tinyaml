// Runs a script against dist/ instead of src/: an import of one of our
// entries' index.ts resolves to the file it's built to.
// Usage: node --import ./scripts/dist-loader.ts scripts/<script>.ts, or
// bench/index.ts, which loads it unless given --source. Build
// first with `pnpm build`; it throws when dist/ is out of date.
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { builtFile, stale } from "./dist.ts";

const reason = stale();
if (reason) throw new Error(`${reason}; run \`pnpm build\` first`);

registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    const built = resolved.url.startsWith("file:") && builtFile(fileURLToPath(resolved.url));
    return built
      ? { url: pathToFileURL(built).href, format: "module", shortCircuit: true }
      : resolved;
  },
});
