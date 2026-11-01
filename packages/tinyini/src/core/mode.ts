// Which library's behaviour the shared core copies. The root, tinyini's own
// API, has its own parser and stringifier and doesn't use the core. In source, and so in the
// tests, each entry wraps its functions with `withMode`, which sets these
// flags for the call and puts the caller's back afterwards, so entries can
// call each other (a getter that parses, say) and stay apart.
//
// Each published entry is built with one of ./mode/*.ts in place of this
// file (see vite.config.ts), so there the flags are constants, `withMode`
// returns the function as it is, and the bundler drops every other mode's
// branches. That holds while the core reads a flag first in a condition,
// `legacy && x` rather than `x && legacy`. scripts/size.ts fails if a built entry
// keeps another mode's code.
//
// A new flag goes here, in `withMode` and in each file in ./mode, whose
// exports test/types/mode.ts keeps the same as these. A new entry goes in
// vite.config.ts under its mode.

export interface Mode {
  /** ini 1.x to 4.0.0. */
  legacy?: boolean;
  /** ini 1.x. */
  plain?: boolean;
  /** @one-ini/wasm 0.2, which reads `key =` as a pair with an empty value. */
  emptyValues?: boolean;
}

/** ini 1.x to 4.0.0: no options, the older line patterns and dot splitting. */
export let legacy: boolean | undefined = false;
/** ini 1.x: plain objects, and truthiness where later versions check own keys. */
export let plain: boolean | undefined = false;
/** @one-ini/wasm 0.2: a value can be empty, where 0.1 stops parsing. */
export let emptyValues: boolean | undefined = false;

/** Returns `fn`, made to run with the flags of `mode` and restore the caller's. */
export function withMode<F extends (...args: any[]) => any>(mode: Mode, fn: F): F {
  return function (this: unknown, ...args: unknown[]) {
    const outer = [legacy, plain, emptyValues] as const;
    ({ legacy, plain, emptyValues } = mode);
    try {
      return fn.apply(this, args);
    } finally {
      [legacy, plain, emptyValues] = outer;
    }
  } as F;
}
