// Each published entry is built with one of src/core/mode/*.ts in place of
// src/core/mode.ts (see vite.config.ts), so each must export what mode.ts
// does, each export usable where the original is. tsrs checks this file.
import type * as Mode from "../../src/core/mode.ts";
import type * as Json5 from "../../src/core/mode/json5.ts";
import type * as Json5V1 from "../../src/core/mode/json5-v1.ts";
import type * as Lean from "../../src/core/mode/lean.ts";
import type * as StripJsonComments from "../../src/core/mode/strip-json-comments.ts";
import type * as StripJsonCommentsV2 from "../../src/core/mode/strip-json-comments-v2.ts";
import type * as StripJsonCommentsV5 from "../../src/core/mode/strip-json-comments-v5.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
// The same export names, and the whole module assignable to mode.ts's, so
// one incompatible export fails it.
type StandsIn<T> =
  Equal<keyof T, keyof typeof Mode> extends true ? (T extends typeof Mode ? true : false) : false;

export const checks: [
  StandsIn<typeof Json5>,
  StandsIn<typeof Json5V1>,
  StandsIn<typeof Lean>,
  StandsIn<typeof StripJsonComments>,
  StandsIn<typeof StripJsonCommentsV2>,
  StandsIn<typeof StripJsonCommentsV5>,
] = [true, true, true, true, true, true];
