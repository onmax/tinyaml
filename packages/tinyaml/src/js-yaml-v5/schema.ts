// js-yaml 5's Schema: a list of tag definitions, looked up by kind and name,
// plus the five built-in schemas.
import {
  binaryTag,
  boolCoreTag,
  boolJsonTag,
  boolYaml11Tag,
  floatCoreTag,
  floatJsonTag,
  floatYaml11Tag,
  intCoreTag,
  intJsonTag,
  intYaml11Tag,
  mapTag,
  mergeTag,
  NOT_RESOLVED,
  nullCoreTag,
  nullJsonTag,
  nullYaml11Tag,
  omapTag,
  pairsTag,
  seqTag,
  setTag,
  strTag,
  timestampTag,
  Y,
  type MappingTagDefinition,
  type ScalarTagDefinition,
  type SequenceTagDefinition,
  type TagDefinition,
} from "./tags.ts";

export class Schema {
  readonly tags: readonly TagDefinition[];
  /** @internal */
  declare readonly implicitScalarTags: readonly ScalarTagDefinition[];
  /** @internal */
  declare readonly defaultScalarTag: ScalarTagDefinition;
  /** @internal */
  declare readonly defaultSequenceTag: SequenceTagDefinition<any, any> | undefined;
  /** @internal */
  declare readonly defaultMappingTag: MappingTagDefinition<any, any> | undefined;
  // Implicit resolvers by first character; `any` holds those without a hint.
  declare private byFirstChar: Map<string, ScalarTagDefinition[]>;
  declare private any: ScalarTagDefinition[];

  constructor(tags: readonly TagDefinition[]) {
    // A later tag replaces an earlier one of the same kind, name and matching.
    const compiled: TagDefinition[] = [];
    for (const tag of tags) {
      const index = compiled.findIndex(
        (old) =>
          old.nodeKind === tag.nodeKind &&
          old.tagName === tag.tagName &&
          old.matchByTagPrefix === tag.matchByTagPrefix,
      );
      compiled[index < 0 ? compiled.length : index] = tag;
    }
    const implicit = compiled.filter(
      (tag): tag is ScalarTagDefinition => tag.nodeKind === "scalar" && tag.implicit,
    );
    if (implicit.some((tag) => tag.matchByTagPrefix))
      throw new Error("Implicit scalar tags cannot match by tag prefix");
    this.tags = compiled;
    this.implicitScalarTags = implicit;
    this.any = implicit.filter((tag) => tag.implicitFirstChars === null);
    this.byFirstChar = new Map();
    for (const tag of implicit)
      for (const ch of tag.implicitFirstChars ?? [])
        this.byFirstChar.set(
          ch,
          implicit.filter((t) => t.implicitFirstChars?.includes(ch) ?? true),
        );
    const str = this.find("scalar", `${Y}str`, false);
    if (!str)
      throw new Error("schema does not define the default scalar tag (tag:yaml.org,2002:str)");
    this.defaultScalarTag = str as ScalarTagDefinition;
    this.defaultSequenceTag = this.find("sequence", `${Y}seq`, false) as
      | SequenceTagDefinition<any, any>
      | undefined;
    this.defaultMappingTag = this.find("mapping", `${Y}map`, false) as
      | MappingTagDefinition<any, any>
      | undefined;
  }

  // The tag for this kind and name: an exact match, else the first prefix one.
  private find(kind: string, name: string, prefix = true): TagDefinition | undefined {
    let found: TagDefinition | undefined;
    for (const tag of this.tags)
      if (tag.nodeKind === kind) {
        if (!tag.matchByTagPrefix && tag.tagName === name) return tag;
        if (prefix && tag.matchByTagPrefix && !found && name.startsWith(tag.tagName)) found = tag;
      }
    return found;
  }

  /** @internal */
  lookupScalarTag(tagName: string): ScalarTagDefinition | undefined {
    return this.find("scalar", tagName) as ScalarTagDefinition | undefined;
  }

  /** @internal */
  lookupSequenceTag(tagName: string): SequenceTagDefinition<any, any> | undefined {
    return this.find("sequence", tagName) as SequenceTagDefinition<any, any> | undefined;
  }

  /** @internal */
  lookupMappingTag(tagName: string): MappingTagDefinition<any, any> | undefined {
    return this.find("mapping", tagName) as MappingTagDefinition<any, any> | undefined;
  }

  /** @internal */
  resolveImplicitScalarTag(source: string): { value: unknown; tag: ScalarTagDefinition } {
    for (const tag of this.byFirstChar.get(source.charAt(0)) ?? this.any) {
      const value = tag.resolve(source, false, tag.tagName);
      if (value !== NOT_RESOLVED) return { value, tag };
    }
    const tag = this.defaultScalarTag;
    return { value: tag.resolve(source, false, tag.tagName), tag };
  }

  /** A new schema with these tags added; each replaces any of the same kind and name. */
  withTags(...tags: Array<TagDefinition | readonly TagDefinition[]>): Schema {
    return new Schema(this.tags.concat(...tags));
  }
}

export const FAILSAFE_SCHEMA = /* @__PURE__ */ new Schema([strTag, seqTag, mapTag]);

export const JSON_SCHEMA = /* @__PURE__ */ FAILSAFE_SCHEMA.withTags(
  nullJsonTag,
  boolJsonTag,
  intJsonTag,
  floatJsonTag,
);

/** The default schema for loading. Merge keys are off; add `mergeTag` to enable them. */
export const CORE_SCHEMA = /* @__PURE__ */ FAILSAFE_SCHEMA.withTags(
  nullCoreTag,
  boolCoreTag,
  intCoreTag,
  floatCoreTag,
);

export const YAML11_SCHEMA = /* @__PURE__ */ FAILSAFE_SCHEMA.withTags(
  nullYaml11Tag,
  boolYaml11Tag,
  intYaml11Tag,
  floatYaml11Tag,
  timestampTag,
  mergeTag,
  binaryTag,
  omapTag,
  pairsTag,
  setTag,
);

// Falls back to `core` when the YAML 1.1 resolver doesn't match.
const either = (tag: ScalarTagDefinition, core: ScalarTagDefinition): ScalarTagDefinition => ({
  ...tag,
  resolve: (source, isExplicit, tagName) => {
    const result = tag.resolve(source, isExplicit, tagName);
    return result === NOT_RESOLVED ? core.resolve(source, isExplicit, tagName) : result;
  },
});

/** The default schema for dumping: YAML 1.1 types that also accept core numbers. */
export const DUMP_SCHEMA = /* @__PURE__ */ YAML11_SCHEMA.withTags(
  /* @__PURE__ */ either(intYaml11Tag, intCoreTag),
  /* @__PURE__ */ either(floatYaml11Tag, floatCoreTag),
);
