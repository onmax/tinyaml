// Stands in for ../mode.ts in the entries built for this mode: @one-ini/wasm 0.1.
import type { Mode } from "../mode.ts";

export type { Mode };
export const legacy = false;
export const plain = false;
export const emptyValues = false;
export const withMode = <F>(_mode: Mode, fn: F): F => fn;
