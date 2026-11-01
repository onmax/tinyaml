// Each published entry is built with one of src/core/mode/*.ts in place of
// src/core/mode.ts (see vite.config.ts), so each must export what mode.ts
// does, each export usable where the original is. tsrs checks this file.
import type * as Mode from "../../src/core/mode.ts";
import type * as Ini from "../../src/core/mode/ini.ts";
import type * as Root from "../../src/core/mode/root.ts";
import { same, type Equal } from "./assert.ts";

type StandsIn<T> =
  Equal<keyof T, keyof typeof Mode> extends true
    ? { [K in keyof T]: T[K] extends (typeof Mode)[K & keyof typeof Mode] ? true : false }[keyof T]
    : false;

same<StandsIn<typeof Ini>, true>(true);
same<StandsIn<typeof Root>, true>(true);
