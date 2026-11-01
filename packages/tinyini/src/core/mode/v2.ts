// Stands in for ../mode.ts in the entries built for this mode: ini 2.0.0 to 4.0.0.
import type { Mode } from "../mode.ts";

export type { Mode };
export const root = false;
export const legacy = true;
export const plain = false;
export const emptyValues = false;
export const withMode = <F>(_mode: Mode, fn: F): F => fn;
