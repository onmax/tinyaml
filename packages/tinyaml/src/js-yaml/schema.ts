// js-yaml 4's Type and Schema classes, with the same constructor options and
// compiled fields, so custom types written for js-yaml work unchanged.
import { YAMLException } from "./error.ts";

export type Kind = "scalar" | "sequence" | "mapping";

export interface TypeOptions {
  /** Required. Optional in the type, as in @types/js-yaml; the constructor throws without it. */
  kind?: Kind | undefined;
  multi?: boolean | undefined;
  resolve?: ((data: any, tag?: string) => boolean) | undefined;
  construct?: ((data: any, tag?: string) => any) | undefined;
  instanceOf?: object | undefined;
  predicate?: ((data: object) => boolean) | undefined;
  represent?:
    | ((data: object, style?: string) => any)
    | Record<string, (data: object) => any>
    | undefined;
  representName?: ((data: object) => any) | undefined;
  defaultStyle?: string | undefined;
  styleAliases?: Record<string, unknown[]> | undefined;
}

// In the order js-yaml sets them; `styleAliases` is compiled separately.
const OPTIONS = [
  "kind",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "multi",
  "styleAliases",
] as const;
const DEFAULTS: Partial<TypeOptions> = {
  resolve: () => true,
  construct: (data) => data,
  multi: false,
};

export class Type {
  declare tag: string;
  declare kind: Kind;
  declare options: TypeOptions;
  declare resolve: (data: any, tag?: string) => boolean;
  declare construct: (data: any, tag?: string) => any;
  declare instanceOf: any;
  declare predicate: ((data: object) => boolean) | null;
  declare represent: TypeOptions["represent"] | null;
  declare representName: ((data: object) => any) | null;
  declare defaultStyle: string | null;
  declare multi: boolean;
  declare styleAliases: Record<string, string>;

  constructor(tag: string, options?: TypeOptions) {
    options ||= {} as TypeOptions;
    for (const name of Object.keys(options))
      if (!OPTIONS.includes(name as any))
        throw new YAMLException(
          `Unknown option "${name}" is met in definition of "${tag}" YAML type.`,
        );
    this.options = options;
    this.tag = tag;
    // `||` like js-yaml, so falsy options get the default.
    for (const name of OPTIONS) (this as any)[name] = options[name] || (DEFAULTS[name] ?? null);
    this.styleAliases = {};
    for (const [style, aliases] of Object.entries(options.styleAliases || {}))
      for (const alias of aliases) this.styleAliases[String(alias)] = style;
    if (!KINDS.includes(this.kind))
      throw new YAMLException(`Unknown kind "${this.kind}" is specified for "${tag}" YAML type.`);
  }
}

const KINDS = ["scalar", "sequence", "mapping"];

export type SchemaDefinition = Type | Type[] | { implicit?: Type[]; explicit?: Type[] };

type TypeMap = Record<Kind | "fallback", Record<string, Type>> & {
  multi: Record<Kind | "fallback", Type[]>;
};

// A later type replaces an earlier one with the same tag, kind and multi flag.
function compile(types: Type[]): Type[] {
  const result: Type[] = [];
  for (const type of types) {
    const index = result.findIndex(
      (old) => old.tag === type.tag && old.kind === type.kind && old.multi === type.multi,
    );
    result[index < 0 ? result.length : index] = type;
  }
  return result;
}

const byKind = <T>(empty: () => T) => ({
  scalar: empty(),
  sequence: empty(),
  mapping: empty(),
  fallback: empty(),
});

export class Schema {
  declare implicit: Type[];
  declare explicit: Type[];
  declare compiledImplicit: Type[];
  declare compiledExplicit: Type[];
  declare compiledTypeMap: TypeMap;

  constructor(definition: SchemaDefinition) {
    // oxlint-disable-next-line no-constructor-return
    return this.extend(definition);
  }

  extend(definition: SchemaDefinition): Schema {
    let implicit: Type[] = [];
    let explicit: Type[] = [];
    if (definition instanceof Type || Array.isArray(definition))
      explicit = explicit.concat(definition);
    else if (
      definition &&
      (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))
    ) {
      // `concat` like js-yaml, so a single Type works here too.
      implicit = implicit.concat(definition.implicit || []);
      explicit = explicit.concat(definition.explicit || []);
    } else
      throw new YAMLException(
        "Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })",
      );
    implicit.concat(explicit).forEach((type, i) => {
      if (!(type instanceof Type))
        throw new YAMLException(
          "Specified list of YAML types (or a single Type object) contains a non-Type object.",
        );
      if (i < implicit.length && type.multi)
        throw new YAMLException(
          "There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.",
        );
    });
    const schema: Schema = Object.create(Schema.prototype);
    schema.implicit = (this.implicit || []).concat(implicit);
    schema.explicit = (this.explicit || []).concat(explicit);
    schema.compiledImplicit = compile(schema.implicit);
    schema.compiledExplicit = compile(schema.explicit);
    const map: TypeMap = { ...byKind(() => ({})), multi: byKind(() => []) };
    for (const type of schema.compiledImplicit.concat(schema.compiledExplicit))
      if (!type.multi) map[type.kind][type.tag] = map.fallback[type.tag] = type;
      else for (const kind of [type.kind, "fallback"] as const) map.multi[kind].push(type);
    schema.compiledTypeMap = map;
    return schema;
  }
}
