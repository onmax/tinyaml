// Lets yaml's Jest tests run under Vitest, and marks each test that called
// tinyaml's parse or stringify through shim.ts in its meta, which run.ts
// reads from the JSON report. vite.config.ts loads it.
import { afterEach, beforeEach, vi } from "vite-plus/test";

const g = globalThis as { jest?: unknown; tinyamlCalls?: number };
g.jest = vi;
beforeEach(() => {
  g.tinyamlCalls = 0;
});
afterEach((context) => {
  if (g.tinyamlCalls) Object.assign(context.task.meta, { tinyaml: true });
});
