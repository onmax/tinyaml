import { dump } from "./dump.ts";
import { YAMLException } from "./error.ts";
import { load, loadAll } from "./load.ts";
import { Schema, Type } from "./schema.ts";
import { CORE_SCHEMA, DEFAULT_SCHEMA, FAILSAFE_SCHEMA, JSON_SCHEMA, types } from "./types.ts";

export type { DumpOptions } from "./dump.ts";
export type { Mark } from "./error.ts";
export type { LoadOptions } from "./load.ts";
export type {
  Kind,
  SchemaDefinition,
  TypeOptions,
  // @types/js-yaml's name for TypeOptions.
  TypeOptions as TypeConstructorOptions,
} from "./schema.ts";

// js-yaml 3 names. js-yaml 4 throws for these; tinyaml keeps them working,
// since `load` and `dump` are safe by default.
const safeLoad = load;
const safeLoadAll = loadAll;
const safeDump = dump;

export {
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  dump,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  load,
  loadAll,
  safeDump,
  safeLoad,
  safeLoadAll,
  Schema,
  Type,
  types,
  YAMLException,
};

export default {
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  dump,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  load,
  loadAll,
  safeDump,
  safeLoad,
  safeLoadAll,
  Schema,
  Type,
  types,
  YAMLException,
};
