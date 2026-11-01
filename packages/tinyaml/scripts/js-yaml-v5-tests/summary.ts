// Summarizes run.sh's output and checks it against what's expected.
// `direct` reads the TAP log of js-yaml 5's suite run against
// tinyaml/js-yaml-v5; `diff` reads the calls the wrapper recorded. `-v` lists
// what differs.
import { readFileSync } from "node:fs";
import { Baseline, shorten } from "../baseline.ts";
import { expectCount } from "../support.ts";

// Tests that pass, and tests that call the events/AST API tinyaml leaves out.
const PASSING = 1023;
const UNSUPPORTED = 610;

const [mode, file, flag] = process.argv.slice(2);
const verbose = flag === "-v";
const text = readFileSync(file!, "utf8");

if (mode === "direct") {
  const lines = text.split("\n");
  const counts = { pass: 0, fail: 0, skip: 0, unsupported: 0 };
  const failures: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const test = /^\s*(not ok|ok) \d+ - (.*?)(?: # (SKIP|TODO).*)?$/.exec(lines[i]!);
    if (!test) continue;
    let type = "";
    let error = "";
    let file = "";
    for (let j = i + 1; j < lines.length && !/^\s*\.\.\.$/.test(lines[j]!); j++) {
      const line = lines[j]!;
      type ||= /^\s*type: '(\w+)'/.exec(line)?.[1] ?? "";
      file ||= /^\s*location: '.*\/test\/(.*?):\d+:\d+'/.exec(line)?.[1] ?? "";
      if (!error && /^\s*error: /.test(line))
        error = line.replace(/^\s*error: \|?-?\s*/, "") || lines[j + 1]!.trim();
      if (/^\s*(?:not ok|ok) \d+ - /.test(line)) break;
    }
    if (type !== "test") continue;
    if (test[3]) counts.skip++;
    else if (test[1] === "ok") counts.pass++;
    else if (
      /UNSUPPORTED/.test(
        text
          .slice(text.indexOf(lines[i]!), text.indexOf(lines[i]!) + 4000)
          .split(/\n\s*\.\.\.\n/)[0]!,
      )
    )
      counts.unsupported++;
    else {
      counts.fail++;
      failures.push(`${file} ${test[2]}: ${error.slice(0, 160)}`);
    }
  }
  console.log(
    `js-yaml 5 tests on tinyaml: ${counts.pass} pass, ${counts.fail} fail, ${counts.unsupported} use the unsupported events/AST API, ${counts.skip} skipped`,
  );
  expectCount("failing tests", counts.fail, 0);
  expectCount("passing tests", counts.pass, PASSING);
  expectCount("tests on the unsupported API", counts.unsupported, UNSUPPORTED);
  if (verbose || process.env.SHOW_FAILS)
    for (const failure of failures) console.log(`  ${failure}`);
} else {
  interface Entry {
    fn: string;
    status: string;
    /** A hash of the function, the whole input and the options. */
    call: string;
    input?: string;
    options?: string;
    expected?: string;
    actual?: string;
  }
  const entries: Entry[] = text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  // The same call often appears in several tests; count it once. A call is
  // the function, the whole input and the options (see wrapper.mjs), so the
  // same input with other options counts again.
  const unique = new Map<string, Entry>();
  for (const entry of entries) unique.set(entry.call, entry);
  const count: Record<string, number> = {};
  for (const entry of unique.values()) {
    const key = `${entry.fn === "dump" ? "dump" : "load"} ${entry.status}`;
    count[key] = (count[key] ?? 0) + 1;
  }
  console.log(
    `calls recorded: ${entries.length}, ${unique.size} distinct by function, input and options`,
  );
  for (const [key, n] of Object.entries(count).sort((a, b) => a[0].localeCompare(b[0])))
    console.log(`  ${key}: ${n}`);
  console.log(
    "  (pass: same value or output, or the same error; pass-message: same reason, other message or mark; pass-error: both throw, other message; lenient: tinyaml loads where js-yaml 5 throws)",
  );
  if (verbose)
    for (const entry of unique.values())
      if (entry.status !== "pass")
        console.log(
          `\n--- ${entry.fn} ${entry.status}\n${entry.input}\n  js-yaml 5: ${entry.expected}\n  tinyaml:   ${entry.actual}`,
        );
  // Each distinct call that doesn't match exactly is a record in
  // scripts/baselines/js-yaml-v5-tests.json with its function, options and
  // both outcomes, so any change to one fails, as does a call that differs
  // anew. (The one `fail`: an empty `!!merge` key is {} in js-yaml 5 and a
  // `<<` key in tinyaml.) Calls run in no fixed order, so each is at 0,
  // sorted by identity.
  const baseline = new Baseline("js-yaml-v5-tests", "replay", unique.size);
  for (const entry of [...unique.values()].sort((a, b) => (a.call < b.call ? -1 : 1)))
    if (entry.status !== "pass")
      baseline.add(
        0,
        entry.status,
        entry.input ?? "",
        { fn: entry.fn, options: shorten(entry.options ?? "") },
        { "js-yaml 5": shorten(entry.expected ?? ""), tinyaml: shorten(entry.actual ?? "") },
      );
  baseline.finish();
}
