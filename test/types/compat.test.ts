// The usage files in test/types compile against each original library, and
// against tinyaml's subpath for it, from source and from the packed package
// under `nodenext` and `bundler` resolution; the packed package's entries
// and package.json typecheck under legacy `moduleResolution: node`. See
// scripts/types-compat.ts.
import { execFileSync } from "node:child_process";
import { expect, it } from "vite-plus/test";

it("compiles code written for each original against tinyaml", () => {
  const output = execFileSync(process.execPath, ["scripts/types-compat.ts"], {
    encoding: "utf8",
  });
  expect(output).not.toMatch(/error/);
  expect(output.match(/ ok/g)).toHaveLength(21);
  expect(output.match(/^packed tinyaml\/\S+ +(?:nodenext|bundler) +ok$/gm)).toHaveLength(10);
  expect(output).toMatch(/^packed tinyaml, .* moduleResolution node: ok$/m);
});
