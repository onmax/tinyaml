// Code written against @types/yamljs. scripts/types-compat.ts typechecks it
// with "yamljs" resolved to the original, to tinyaml/yamljs's source, and to
// the packed tinyaml/yamljs.
import YAML from "yamljs";
import * as yamljs from "yamljs";
import { same } from "./assert.ts";

declare const src: string;

const value = YAML.parse(src);
same<typeof value, any>(true);
void value.anything.goes;
const config: { port: number } = YAML.parse(src);
void config;

const out = YAML.stringify({ a: [1, 2] }, 4, 2);
same<typeof out, string>(true);
YAML.stringify({ a: 1 });
YAML.stringify({ a: 1 }, 2);

const file = YAML.load("config.yml");
same<typeof file, any>(true);
YAML.load("config.yml", (result) => console.log(result.port));

yamljs.parse(src);
yamljs.stringify({ a: 1 }, 2, 4);
yamljs.load("config.yml");
