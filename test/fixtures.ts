// The conformance tests run scripts against what `pnpm fixtures` downloads
// into .cache. Without it they skip, so a fresh clone's `pnpm test` passes;
// on CI they always run, and fail if a fixture is missing.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export const missing = (path: string): boolean => !existsSync(path) && !process.env.CI;

/** Runs a script with this Node; its non-zero exit fails the test, output included. */
export const run = (script: string, ...args: string[]): string =>
  execFileSync(process.execPath, ["--no-warnings", script, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
