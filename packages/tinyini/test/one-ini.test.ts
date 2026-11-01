// tinyini/one-ini and tinyini/one-ini-v0.1 against @one-ini/wasm 0.2.1 and
// 0.1.1: the differential fuzzer, one-ini's own Rust tests, and
// editorconfig-core-test through the editorconfig package when CMake is
// installed.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";
import * as one from "../src/one-ini/index.ts";
import * as one01 from "../src/one-ini-v0.1/index.ts";

const run = (...args: string[]) =>
  execFileSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
let cmake = true;
try {
  execFileSync("cmake", ["--version"], { stdio: "ignore" });
} catch {
  cmake = false;
}

describe("one-ini", () => {
  it("reads pairs, comments and sections into one-ini's AST, and stops at a line that fits no rule", () => {
    expect(
      one.parse_to_json("root = true\n; c\n[*.md]\nindent_size = 4 ; x\nempty =\nbad\n[a]\nb=c"),
    ).toEqual({
      version: "0.2.1",
      body: [
        { type: "Pair", key: "root", value: "true" },
        { type: "Comment", indicator: ";", value: " c" },
        {
          type: "Section",
          name: "*.md",
          body: [
            { type: "Pair", key: "indent_size", value: "4 ; x" },
            { type: "Pair", key: "empty", value: "" },
          ],
        },
      ],
    });
    expect(one01.parse_to_json("a = 1\nempty =\nb = 2")).toEqual({
      version: "0.1.1",
      body: [{ type: "Pair", key: "a", value: "1" }],
    });
  });

  it("gives UTF-8 byte offsets, and Rust's error for bytes that aren't UTF-8", () => {
    expect([...one.parse_to_uint32array(Buffer.from("é=ü\n[ß]"))]).toEqual([
      0, 0, 2, 1, 3, 5, 2, 7, 9,
    ]);
    expect(() => one.parse_to_uint32array(new Uint8Array([97, 0xc3]))).toThrow(
      "incomplete utf-8 byte sequence from index 1",
    );
    expect(() => one.parse_to_uint32array(new Uint8Array([0xe2, 0x28, 0xa1]))).toThrow(
      "invalid utf-8 sequence of 1 bytes from index 0",
    );
  });

  for (const name of ["one-ini", "one-ini-v0.1"])
    it(`${name} matches the WASM module on mutated inputs`, () => {
      expect(run("scripts/one-ini-fuzz.ts", "5000", "1", name)).toMatch(/: 0 differences$/m);
    });

  it("passes one-ini's own tests, as the WASM module does", () => {
    expect(run("scripts/one-ini-tests.ts")).toMatch(/^tinyini: 0 failing tests$/m);
  });

  // Four CTest runs of 203 tests, each starting Node: over a minute.
  it.skipIf(!cmake)(
    "passes editorconfig-core-test wherever the WASM module does",
    () => {
      expect(run("scripts/editorconfig-tests.ts")).toMatch(
        /^tinyini: 0 tests fail only with tinyini$/m,
      );
    },
    600_000,
  );
});
