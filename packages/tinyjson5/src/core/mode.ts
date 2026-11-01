// Which library's behaviour the shared parser and stringifier copy. In source,
// and so in the tests, `parse` and `stringify` set these from the mode their
// entry passes, and restore the caller's when they return.
//
// Each published entry is built with one of ./mode/*.ts in place of this
// file (see vite.config.ts), so there the flags are constants and the
// bundler drops every other mode's branches. That holds while the core:
// - reads a flag first in a condition, `json5 && x` rather than `x && json5`,
//   since the bundler can't drop `x` unless it knows `x` has no side effects;
// - writes `return fail(...)` where only that mode's code follows, since the
//   bundler doesn't know `fail` never returns.
// scripts/size.ts fails if a built entry keeps another mode's code.
//
// A new flag goes here, in `setMode` and in each file in ./mode, whose
// exports test/types/mode.ts keeps the same as these. A new entry goes in
// vite.config.ts under the mode it passes.

export interface Mode {
  /** Copy json5 2.2.3 rather than follow the root's rules. */
  json5?: boolean;
  /** Copy json5 1.0.2 where it differs from 2.2.3. Implies `json5`. */
  v1?: boolean;
}

/** Copy json5 2.2.3 (or 1.0.2, with `v1`). */
export let json5: boolean | undefined = false;
/** Copy json5 1.0.2. */
export let v1: boolean | undefined = false;
/** Neither: the root's rules, after the unreleased json5 3. */
export let lean = true;

/** Sets the flags for `mode`, and returns the ones it replaced. */
export function setMode(mode: Mode): Mode | undefined {
  const outer = { json5, v1 };
  v1 = mode.v1;
  json5 = mode.json5 || v1;
  lean = !json5;
  return outer;
}
