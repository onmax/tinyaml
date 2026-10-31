import { readFileSync } from "node:fs";

interface Entry {
  fn: string;
  status: "pass" | "fail" | "skipped";
  reason?: string;
  input?: string;
  options?: unknown;
  expected?: string;
  actual?: string;
}

const [file, flag] = process.argv.slice(2);
const entries: Entry[] = readFileSync(file!, "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
// The same input often appears in several tests; count it once.
const unique = new Map<string, Entry>();
for (const entry of entries)
  unique.set(`${entry.fn}\0${entry.input}\0${JSON.stringify(entry.options ?? null)}`, entry);

const by = (status: string) => [...unique.values()].filter((entry) => entry.status === status);
const fails = by("fail");
const skipped = by("skipped");
console.log(`calls recorded: ${entries.length}, unique: ${unique.size}`);
console.log(`pass: ${by("pass").length}, fail: ${fails.length}, skipped: ${skipped.length}`);
const reasons = new Map<string, number>();
for (const entry of skipped) reasons.set(entry.reason!, (reasons.get(entry.reason!) ?? 0) + 1);
for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1]))
  console.log(`  skipped ${count}: ${reason}`);
if (flag === "-v") {
  for (const entry of fails) {
    console.log(
      `\n--- ${entry.fn} ${entry.options ? JSON.stringify(entry.options) : ""}\n${entry.input}`,
    );
    console.log(`  js-yaml:   ${entry.expected}\n  tinyaml: ${entry.actual}`);
  }
}
