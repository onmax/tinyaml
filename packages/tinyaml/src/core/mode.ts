// Which engine's behaviour the shared parser copies. In source, and so in
// the tests, `parse` sets these from the engine it's given, and restores the
// caller's when a tag parses a document inside another.
//
// Each published entry is built with one of ./mode/*.ts in place of this
// file (see vite.config.ts), so there the flags are constants and the
// bundler drops every other mode's branches. That holds while parse.ts:
// - reads a flag first in a condition, `spec && x` rather than `x && spec`,
//   since the bundler can't drop `x` unless it knows `x` has no side effects;
// - writes `return fail(...)` where only that mode's code follows, since the
//   bundler doesn't know `fail` never returns;
// - checks the mode before an engine hook only one mode's engine sets.
// scripts/size.ts fails if a built entry keeps another mode's code.
//
// A new flag goes here, in `setMode` and in each file in ./mode, whose
// exports test/types/mode.ts keeps the same as these. A new entry goes in
// vite.config.ts under the mode whose flags its engine sets, or in a mode of
// its own.
//
// `warns`, `deep` and `maxMergeKeys` stand for engine settings every engine
// of a mode gives alike, so its file declares them: an engine that changes
// one needs its mode file changed too, or a mode of its own.
import type { Engine } from "./parse.ts";

export type Mode = Pick<
  Engine,
  | "lenient"
  | "spec"
  | "yaml"
  | "warn"
  | "maxDepth"
  | "maxMergeKeys"
  | "lines"
  | "repeats"
  | "first"
  | "mergeSize"
>;

/** Copy js-yaml 4's leniency and error positions. */
export let lenient: boolean | undefined = false;
/** Follow the YAML spec, as the `yaml` package does, where js-yaml 5 doesn't. */
export let spec: boolean | undefined = false;
/** Neither: parsing matches js-yaml 5, the only engine that wants that. */
export let js5 = false;
/** With `spec`, call the hooks only the `yaml` package's engine sets. */
export let yaml: boolean | undefined = false;
/** The engine may take warnings, which tinyaml's own API, js-yaml 5 and yamljs don't. */
export let warns = false;
/** Nesting has no limit: the engine's maxDepth is Infinity, as yaml's, std's and yamljs's are. */
export let deep = false;
/**
 * The engine's maxMergeKeys where every engine of the mode sets the same: -1,
 * no cap, for yaml, std and yamljs, and the default for tinyaml's own API.
 */
export let maxMergeKeys: number | undefined;
// The rest tell the `lenient` engines apart; see each in Engine.
/** End keys, tags and flow scalars by the lines they're on, as js-yaml does. */
export let lines: boolean | undefined = false;
/** Read as js-yaml 3 does where js-yaml 4 doesn't. */
export let repeats: boolean | undefined = false;
/** Allow duplicate keys, keeping a repeated key's first value, as yamljs does. */
export let first: boolean | undefined = false;
/** Reject a `<<` of more than 100 mappings, as js-yaml 4 does. */
export let mergeSize: boolean | undefined = false;

/** Sets the flags for `engine`, and returns what sets back the ones it replaced. */
export function setMode(engine: Mode): (() => void) | undefined {
  // prettier-ignore
  const outer = [lenient, spec, yaml, warns, deep, maxMergeKeys, lines, repeats, first, mergeSize] as const;
  lenient = engine.lenient;
  spec = engine.spec;
  yaml = engine.yaml;
  warns = !!engine.warn;
  deep = engine.maxDepth === Infinity;
  maxMergeKeys = engine.maxMergeKeys;
  lines = engine.lines;
  repeats = engine.repeats;
  first = engine.first;
  mergeSize = engine.mergeSize;
  js5 = !lenient && !spec;
  return () => {
    // prettier-ignore
    [lenient, spec, yaml, warns, deep, maxMergeKeys, lines, repeats, first, mergeSize] = outer;
    js5 = !lenient && !spec;
  };
}
