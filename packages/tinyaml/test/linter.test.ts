import { describe, expect, it } from "vite-plus/test";
import { lint } from "../src/linter.ts";

const at = (text: string) =>
  lint(text).map(({ rule, line, column }) => `${rule} ${line}:${column}`);

describe("lint", () => {
  it("reports YAML tinyaml can't load, at tinyaml's position", () => {
    expect(lint("a: 1\na: 2\n")).toEqual([
      {
        rule: "tinyaml/invalid-yaml",
        severity: "error",
        line: 2,
        column: 1,
        message: "tinyaml can't load this YAML: duplicated mapping key.",
        fix: "Fix the YAML at this position.",
      },
    ]);
  });

  it("reports plain values other readers don't read as strings", () => {
    const text = "a: yes\nb: 0b10\nc: 1_000\nd: 2026-11-01\ne: [on, off]\n";
    expect(at(text)).toEqual([
      "tinyaml/ambiguous-value 1:4",
      "tinyaml/ambiguous-value 2:4",
      "tinyaml/ambiguous-value 3:4",
      "tinyaml/ambiguous-value 4:4",
      "tinyaml/ambiguous-value 5:5",
      "tinyaml/ambiguous-value 5:9",
    ]);
    expect(lint("- no")[0]?.message).toBe(
      '`no` loads as the string "no", but YAML 1.1 readers such as PyYAML read it as a boolean.',
    );
  });

  it("leaves quoted values, block scalars, and JSON values alone", () => {
    expect(
      at(
        'a: "yes"\nb: \'~\'\nc: "x, yes, y"\nd: |\n  e: yes\nf: true\ng: null\nh: 16\ni: hello # yes\n',
      ),
    ).toEqual([]);
  });

  it("uses the root API's YAML 1.2 core schema", () => {
    expect(lint('a: True\nb: ~\nc: 0x10\nd: .inf\ne: "0x10"\n')).toEqual([]);
  });

  it.each([
    ['a: "no"\n# example: no\n', []],
    ['a: "yes"\n# example: yes\n', []],
    ['a: "x\n  no\n  y"\nb: no\n', ["4:4"]],
    ["a: hello\n  no\nb: no\n", ["3:4"]],
    ["a: :yes\nb: no#word\n", []],
    ['a: {"key":no}\n', ["1:11"]],
    ['a: {"it\'s": no}\n', ["1:13"]],
    ['a: ["it\'s fine", yes]\n', ["1:18"]],
    ['a: ["escaped \\\" yes", no]\n', ["1:23"]],
    ["a: ['it''s yes', no]\n", ["1:18"]],
    ["- a: |\n    text\n  b: yes\n", ["3:6"]],
    ["- a: >2-\n    no\n  b: yes\n", ["3:6"]],
    ["a: &x yes\nb: *x\n", ["1:7"]],
    ["a: &x\n  no\nb: *x\n", ["2:3"]],
    ["a: !!str no\nb: no\n", ["2:4"]],
    ["a: _\nb: __\nc: +_\nd: 0x_\ne: 0b_\n", []],
    ['a: 1\nb: !!str 1\nc: "1"\n', []],
    ["1: value\n", []],
    ["a: .5\nb: -.5\nc: +.5\n", []],
  ])("recognizes plain scalar nodes in %j", (text, positions) => {
    expect(lint(text).map(({ line, column }) => `${line}:${column}`)).toEqual(positions);
  });

  it("returns nothing for empty input", () => {
    expect(lint("")).toEqual([]);
  });
});
