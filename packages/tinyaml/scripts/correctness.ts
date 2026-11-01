// Runs tinyaml and the libraries it replaces on the yaml-test-suite and
// scores each against the suite's own answers: a valid case must load to the
// JSON in its in.json, and a case marked invalid must throw. Each library
// gets its YAML 1.2 core schema where it has one, so a date or a `<<` key
// counts the same for all of them; yaml also leaves the optional YAML 1.1
// tags (!!set, !!omap, !!binary) unresolved, as the suite expects. yamljs has
// one fixed schema, and @std/yaml's "core" still reads some YAML 1.1 forms.
// Cases without expected JSON (collection keys) are left out.
//
// yamljs reads one document, so it's scored on the valid cases with exactly
// one; how it does on multi-document and empty streams is reported apart.
// A valid case a library rejects only because it has no type for a custom
// tag such as `!foo` counts on its own: that is a choice, not a misreading.
// tinyaml must get every case right, or the run fails, and the run checks
// how many cases it scored: 279 valid and 94 invalid in the pinned suite.
// Usage: node --no-warnings scripts/correctness.ts [--json] [--failures]
import { parseAll as stdParseAll } from "@std/yaml";
import * as jsYaml4 from "js-yaml";
import * as jsYaml5 from "js-yaml5";
import { parseAllDocuments } from "yaml";
import yamljs from "yamljs";
import { parseAll } from "../src/index.ts";
import { equal, expectCount, suiteCases } from "./support.ts";

const libraries: Record<string, (input: string) => unknown[]> = {
  tinyaml: (input) => parseAll(input, { merge: false }),
  "js-yaml 4": (input) => jsYaml4.loadAll(input, null, { schema: jsYaml4.CORE_SCHEMA }),
  "js-yaml 5": (input) => jsYaml5.loadAll(input),
  yaml: (input) => {
    const docs = parseAllDocuments(input, { schema: "core", resolveKnownTags: false });
    for (const doc of docs) if (doc.errors.length) throw doc.errors[0];
    return docs.map((doc) => doc.toJS());
  },
  // yamljs reads one document; it throws on input it can't read.
  yamljs: (input) => [yamljs.parse(input)],
  "@std/yaml": (input) => stdParseAll(input, { schema: "core" }) as unknown[],
};

interface Score {
  valid: number;
  validRight: number;
  unknownTag: number;
  invalid: number;
  invalidRejected: number;
  wrong: string[];
  /** yamljs only: valid streams of several documents, and empty ones. */
  streams?: {
    multi: number;
    firstRight: string[];
    threw: number;
    empty: number;
    emptyNull: number;
  };
}

const scores: Record<string, Score> = {};
for (const name of Object.keys(libraries))
  scores[name] = {
    valid: 0,
    validRight: 0,
    unknownTag: 0,
    invalid: 0,
    invalidRejected: 0,
    wrong: [],
  };
const streams = (scores.yamljs!.streams = {
  multi: 0,
  firstRight: [] as string[],
  threw: 0,
  empty: 0,
  emptyNull: 0,
});

for (const { id, input, invalid, expected } of suiteCases()) {
  if (!invalid && !expected) continue;
  for (const [name, load] of Object.entries(libraries)) {
    const score = scores[name]!;
    let docs: unknown[] | undefined;
    let error = "";
    try {
      // Through JSON, as the suite's answers are: Dates and other objects
      // compare by their JSON form, and undefined values drop out.
      docs = JSON.parse(JSON.stringify(load(input)) ?? "null");
    } catch (caught) {
      docs = undefined;
      error = String((caught as Error)?.message ?? caught);
    }
    if (invalid) {
      score.invalid++;
      if (docs === undefined) score.invalidRejected++;
      else score.wrong.push(`${id} (invalid YAML, loaded)`);
      continue;
    }
    if (name === "yamljs" && !expected!.length) {
      streams.empty++;
      if (docs?.[0] === null) streams.emptyNull++;
      continue;
    }
    if (name === "yamljs" && expected!.length > 1) {
      streams.multi++;
      if (docs === undefined) streams.threw++;
      else if (equal(docs[0], expected![0], { keyOrder: false, identity: false }))
        streams.firstRight.push(id);
      continue;
    }
    score.valid++;
    if (docs !== undefined && equal(docs, expected, { keyOrder: false, identity: false }))
      score.validRight++;
    else if (/unknown (?:\w+ )?tag/i.test(error)) score.unknownTag++;
    else score.wrong.push(`${id}${docs === undefined ? " (valid YAML, threw)" : ""}`);
  }
}

const percent = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;
if (process.argv.includes("--json")) console.log(JSON.stringify(scores, null, 2));
else {
  console.log("Valid YAML read right, of the cases each reads; invalid YAML rejected:");
  for (const [name, s] of Object.entries(scores)) {
    const read = s.valid - s.unknownTag;
    console.log(
      `${name.padEnd(10)} valid ${`${s.validRight}/${read}`.padStart(7)} ${percent(s.validRight, read).padStart(6)}   invalid ${`${s.invalidRejected}/${s.invalid}`.padStart(5)} ${percent(s.invalidRejected, s.invalid).padStart(6)}${s.unknownTag ? `   ${s.unknownTag} more valid cases refused for an unknown tag` : ""}${name === "yamljs" ? "   (single-document cases)" : ""}`,
    );
    if (process.argv.includes("--failures")) console.log(`  ${s.wrong.join(", ")}`);
  }
  console.log(
    `yamljs on the ${streams.multi} multi-document streams: reads the first document right in ${streams.firstRight.length} (${streams.firstRight.join(", ")}), throws on ${streams.threw}; on the ${streams.empty} empty streams, returns null for ${streams.emptyNull}`,
  );
}
const tiny = scores.tinyaml!;
expectCount("valid cases scored for tinyaml", tiny.valid, 279);
expectCount("invalid cases scored for tinyaml", tiny.invalid, 94);
expectCount("valid cases tinyaml refuses for an unknown tag", tiny.unknownTag, 0);
expectCount("valid cases tinyaml reads wrong", tiny.valid - tiny.validRight, 0);
expectCount("invalid cases tinyaml loads", tiny.invalid - tiny.invalidRejected, 0);
