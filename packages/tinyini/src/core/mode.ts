// Which library's behaviour the shared core copies. In source, and so in the
// tests, each entry wraps its functions with `withMode`, which sets these
// flags for the call and puts the caller's back afterwards, so entries can
// call each other (a getter that parses, say) and stay apart.
//
// Each published entry is built with one of ./mode/*.ts in place of this
// file (see vite.config.ts), so there the flags are constants, `withMode`
// returns the function as it is, and the bundler drops every other mode's
// branches. That holds while the core reads a flag first in a condition,
// `root && x` rather than `x && root`. scripts/size.ts fails if a built entry
// keeps another mode's code.
//
// A new flag goes here, in `withMode` and in each file in ./mode, whose
// exports test/types/mode.ts keeps the same as these. A new entry goes in
// vite.config.ts under its mode.

export interface Mode {
  /** tinyini's own API. */
  root?: boolean;
}

/** tinyini's own API, which drops ini's legacy behaviour. */
export let root: boolean | undefined = false;

/** Returns `fn`, made to run with the flags of `mode` and restore the caller's. */
export function withMode<F extends (...args: any[]) => any>(mode: Mode, fn: F): F {
  return function (this: unknown, ...args: unknown[]) {
    const outer = root;
    root = mode.root;
    try {
      return fn.apply(this, args);
    } finally {
      root = outer;
    }
  } as F;
}
