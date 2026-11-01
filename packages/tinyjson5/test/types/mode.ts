// Each published entry is built with one of src/core/mode/*.ts in place of
// src/core/mode.ts (see vite.config.ts), so each must export what mode.ts
// does, each export usable where the original is. tsrs checks this file.
import type * as Mode from "../../src/core/mode.ts";
import type * as Json5 from "../../src/core/mode/json5.ts";
import type * as Lean from "../../src/core/mode/lean.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type StandsIn<T> =
  Equal<keyof T, keyof typeof Mode> extends true
    ? { [K in keyof T]: T[K] extends (typeof Mode)[K & keyof typeof Mode] ? true : false }[keyof T]
    : false;

export const checks: [StandsIn<typeof Json5>, StandsIn<typeof Lean>] = [true, true];
