// Stands in for ../mode.ts in the entries built for this mode: ini 1.3.8.
import type { Mode } from "../mode.ts";

export type { Mode };
export const legacy = true;
export const plain = true;
export const emptyValues = false;
export const withMode = <F>(_mode: Mode, fn: F): F => fn;
