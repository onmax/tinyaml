// Stands in for ../mode.ts in the entries built for this mode: ini 4.1.3 to 7.
import type { Mode } from "../mode.ts";

export type { Mode };
export const legacy = false;
export const plain = false;
export const emptyValues = false;
export const withMode = <F>(_mode: Mode, fn: F): F => fn;
