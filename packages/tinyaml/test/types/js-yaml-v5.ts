// Code written against js-yaml 5's bundled types. scripts/types-compat.ts
// typechecks it with "js-yaml5" (js-yaml 5, installed under that alias)
// resolved to the original, to tinyaml/js-yaml-v5's source, and to the
// packed tinyaml/js-yaml-v5. The events,
// AST, presenter and visit API isn't part of tinyaml/js-yaml-v5, so it isn't
// used here.
import {
  COLLECTION_STYLE,
  CORE_SCHEMA,
  DEFAULT_SCALAR_STYLE_RULES,
  defineScalarTag,
  dump,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  load,
  loadAll,
  mergeTag,
  NOT_RESOLVED,
  realMapTag,
  SCALAR_STYLE,
  Schema,
  YAML11_SCHEMA,
  YAMLException,
  type CollectionStyle,
  type DumpOptions,
  type LoadOptions,
  type ScalarLayout,
  type ScalarStyle,
  type ScalarStyleRule,
  type ScalarTagDefinition,
} from "js-yaml5";
import { same } from "./assert.ts";

declare const src: string;
declare const file: string | undefined;

// load and loadAll return unknown, so callers narrow or cast.
const doc = load(src);
same<typeof doc, unknown>(true);
const config = load(src, { schema: JSON_SCHEMA }) as { name: string };
config.name.toUpperCase();
const docs = loadAll(src, { schema: CORE_SCHEMA.withTags(mergeTag, realMapTag) });
same<typeof docs, unknown[]>(true);
loadAll(src, null, { schema: FAILSAFE_SCHEMA });
const options: LoadOptions = { json: true, maxDepth: 50, maxAliases: 100 };
load(src, { ...options, schema: YAML11_SCHEMA });
if (file) load(src, { filename: file });

// A custom scalar tag, resolving `!env NAME`.
const env: ScalarTagDefinition<string> = defineScalarTag("!env", {
  resolve: (source) => process.env[source] ?? NOT_RESOLVED,
  identify: () => false,
});
load(src, { schema: new Schema([...CORE_SCHEMA.tags, env]) });
load(src, { schema: CORE_SCHEMA.withTags([env]) });

// Dump options, with scalar style rules.
const quoteVersions: ScalarStyleRule = (layout: ScalarLayout) => {
  if (layout.style === SCALAR_STYLE.PLAIN && /^\d/.test(layout.node.value))
    layout.style = SCALAR_STYLE.DOUBLE_QUOTED;
};
const dumpOptions: DumpOptions = {
  indent: 4,
  lineWidth: -1,
  noRefs: true,
  skipInvalid: true,
  flowLevel: 2,
  scalarStyleRules: [...Object.values(DEFAULT_SCALAR_STYLE_RULES), quoteVersions],
};
const out = dump({ a: 1 }, dumpOptions);
same<typeof out, string>(true);
dump([1, 2], { schema: CORE_SCHEMA, sortKeys: (a: string, b: string) => a.localeCompare(b) });

// The style types name the values of the style constants.
const scalar: ScalarStyle = SCALAR_STYLE.SINGLE_QUOTED;
const collection: CollectionStyle = COLLECTION_STYLE.FLOW;
console.log(scalar, collection);

// Errors carry a reason and, usually, a mark.
try {
  load(src);
} catch (error) {
  if (error instanceof YAMLException) {
    const reason: string = error.reason;
    console.error(reason, error.mark?.line, error.mark?.column, error.toString(true));
  }
}
// A mark without a file name or snippet.
const thrown = new YAMLException("bad input", { buffer: "x", position: 0, line: 0, column: 0 });
const name: string | null | undefined = thrown.mark?.name;
console.log(name, thrown.mark?.snippet);
