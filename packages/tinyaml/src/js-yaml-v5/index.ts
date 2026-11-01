// A drop-in for js-yaml 5's load and dump API. The events, AST, presenter
// and visit API isn't included.
export { dump, COLLECTION_STYLE, DEFAULT_SCALAR_STYLE_RULES, SCALAR_STYLE } from "./dump.ts";
export type {
  CollectionStyle,
  DumpOptions,
  PresenterOptions,
  ScalarLayout,
  ScalarStyle,
  ScalarStyleRule,
} from "./dump.ts";
export { YAMLException } from "./error.ts";
export { load, loadAll, type LoadOptions } from "./load.ts";
export {
  CORE_SCHEMA,
  DUMP_SCHEMA,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  Schema,
  YAML11_SCHEMA,
} from "./schema.ts";
export {
  binaryTag,
  boolCoreTag,
  boolJsonTag,
  boolYaml11Tag,
  defineMappingTag,
  defineScalarTag,
  defineSequenceTag,
  floatCoreTag,
  floatJsonTag,
  floatYaml11Tag,
  intCoreTag,
  intJsonTag,
  intYaml11Tag,
  legacyMapTag,
  mapTag,
  mergeTag,
  NOT_RESOLVED,
  nullCoreTag,
  nullJsonTag,
  nullYaml11Tag,
  omapTag,
  pairsTag,
  realMapTag,
  seqTag,
  setTag,
  strTag,
  timestampTag,
} from "./tags.ts";
export type {
  MappingTagDefinition,
  MappingTagOptions,
  ScalarTagDefinition,
  ScalarTagOptions,
  SequenceTagDefinition,
  SequenceTagOptions,
  TagDefinition,
} from "./tags.ts";

// js-yaml exposes both grouped and individual style constants.
export {
  PLAIN as SCALAR_STYLE_PLAIN,
  SINGLE_QUOTED as SCALAR_STYLE_SINGLE_QUOTED,
  DOUBLE_QUOTED as SCALAR_STYLE_DOUBLE_QUOTED,
  LITERAL_BLOCK as SCALAR_STYLE_LITERAL_BLOCK,
  FOLDED_BLOCK as SCALAR_STYLE_FOLDED_BLOCK,
  BLOCK as COLLECTION_STYLE_BLOCK,
  FLOW as COLLECTION_STYLE_FLOW,
} from "./dump.ts";
