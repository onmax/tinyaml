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
// vite.config.ts under the mode its engine sets.
import type { Engine } from "./parse.ts";

export type Mode = Pick<Engine, "lenient" | "spec">;

/** Copy js-yaml 4's leniency and error positions. */
export let lenient: boolean | undefined = false;
/** Follow the YAML spec, as the `yaml` package does, where js-yaml 5 doesn't. */
export let spec: boolean | undefined = false;
/** Neither: parsing matches js-yaml 5, the only engine that wants that. */
export let js5 = false;

/** Sets the flags for `engine`, and returns the ones it replaced. */
export function setMode(engine: Mode): Mode | undefined {
  const outer = { lenient, spec };
  lenient = engine.lenient;
  spec = engine.spec;
  js5 = !lenient && !spec;
  return outer;
}
