// Code written against @types/js-yaml. scripts/types-compat.ts typechecks it
// with "js-yaml" resolved to the original, to tinyaml/js-yaml's source, and
// to the packed tinyaml/js-yaml.
//
// Compiles against @types/js-yaml only, on purpose:
// - The `listener` load option and its `State` and `EventType` types:
//   tinyaml has no parse events.
// - `e.mark.name` and `e.mark.snippet` as `string`: they are `string | null`
//   in tinyaml, as at runtime, where `name` is null without a `filename`.
import yaml, {
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  dump,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  load,
  loadAll,
  Schema,
  Type,
  YAMLException,
  type DumpOptions,
  type LoadOptions,
  type Mark,
  type SchemaDefinition,
  type TypeConstructorOptions,
} from "js-yaml";
import * as jsyaml from "js-yaml";
import { same } from "./assert.ts";

declare const src: string;
declare const file: string | undefined;

// load and loadAll return unknown, so callers narrow or cast.
const doc = load(src);
same<typeof doc, unknown>(true);
const config = load(src, { schema: yaml.JSON_SCHEMA }) as { name: string };
config.name.toUpperCase();
load(src, { schema: FAILSAFE_SCHEMA, json: true, filename: "config.yml" });
load(src, {
  filename: file,
  schema: undefined,
  onWarning(warning) {
    console.warn(warning.message, warning.reason);
  },
});
const docs = loadAll(src);
same<typeof docs, unknown[]>(true);
const withOptions = loadAll(src, null, { schema: CORE_SCHEMA });
same<typeof withOptions, unknown[]>(true);
void loadAll(src, undefined, { json: true }).length;
const nothing = loadAll(src, (d) => console.log(d));
same<typeof nothing, void>(true);
jsyaml.load(src);

const loadOptions: LoadOptions = { schema: DEFAULT_SCHEMA, json: false };
load(src, loadOptions);

// Custom types and schemas.
class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
const pointType = new yaml.Type("!point", {
  kind: "sequence",
  resolve: (data) => data !== null && data.length === 2,
  construct: (data) => new Point(data[0], data[1]),
  instanceOf: Point,
  represent: (point) => [(point as Point).x, (point as Point).y],
});
const envType = new Type("!env", {
  kind: "scalar",
  resolve: (data: any) => typeof data === "string",
  construct: (data: string) => process.env[data],
});
const options: TypeConstructorOptions = {
  kind: "mapping",
  construct: (data: any) => new Map(Object.entries(data ?? {})),
  predicate: (data: object) => data instanceof Map,
  represent: { flow: (data: object) => Object.fromEntries(data as Map<string, unknown>) },
  defaultStyle: "flow",
};
const mapType = new Type("!map", options);
mapType.kind?.toUpperCase();
mapType.resolve("x");
mapType.construct("x");

const schema = DEFAULT_SCHEMA.extend([pointType, envType]);
const schema2 = JSON_SCHEMA.extend({ implicit: [envType], explicit: [mapType] });
const schema3 = CORE_SCHEMA.extend(pointType);
const definition: SchemaDefinition = { explicit: [pointType] };
const schema4 = new Schema(definition);
new Schema([pointType, envType]);
new Schema(envType);
const schemas: Schema[] = [schema, schema2, schema3, schema4];
load(src, { schema: schemas[0] });

// dump
const out = dump({ a: 1 }, { lineWidth: -1, noRefs: true, sortKeys: true });
same<typeof out, string>(true);
dump([new Point(1, 2)], { schema, indent: 4, flowLevel: 2 });
dump(
  { b: 1, a: 2 },
  {
    sortKeys: (a, b) => (a < b ? -1 : 1),
    skipInvalid: true,
    noArrayIndent: true,
    noCompatMode: true,
    condenseFlow: true,
    quotingType: '"',
    forceQuotes: false,
    styles: { "!!null": "canonical", "!!int": "hexadecimal" },
    replacer: (key, value) => (key === "secret" ? undefined : value),
  },
);
declare const width: number | undefined;
dump(doc, { lineWidth: width, schema: undefined, replacer: undefined });
const dumpOptions: DumpOptions = { indent: 2, lineWidth: 120 };
dump(doc, dumpOptions);
yaml.dump(doc);

// Errors.
try {
  load(src);
} catch (e) {
  if (e instanceof YAMLException) {
    const line: number = e.mark.line + 1;
    const column: number = e.mark.column;
    console.error(e.name, e.reason, e.message, line, column, e.mark.position, e.mark.buffer);
    console.error(e.toString(true));
  }
}
function report(mark: Mark): string {
  return `${mark.line}:${mark.column}`;
}
// @types/js-yaml types the file name and snippet as strings.
function where(e: YAMLException): string {
  const snippet: string = e.mark.snippet;
  return `${e.mark.name}${snippet}`;
}
void where;
new YAMLException("bad", { name: "f", buffer: "", position: 0, line: 0, column: 0, snippet: "" });
new YAMLException();
const error = new yaml.YAMLException("bad");
if (error.mark) report(error.mark);
const asError: Error = error;
void asError;

// The schemas and default export.
const all: Schema[] = [
  yaml.FAILSAFE_SCHEMA,
  yaml.JSON_SCHEMA,
  yaml.CORE_SCHEMA,
  yaml.DEFAULT_SCHEMA,
];
void all;
