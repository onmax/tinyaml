// Differential fuzzing of how each dumper reads its input: random values whose
// array items and object properties are getters that log each read and, on
// their first read, grow or shrink their own collection or the root one, some
// with a toJSON getter, written by every original and by tinyaml's drop-in.
// Output or error and the log of reads must match exactly, so each dumper
// reads lengths, keys and values in its original's order and count.
// Usage: node scripts/dump-reads.ts [cases] [seed]
import { createRequire } from "node:module";
import * as std from "@std/yaml";
import * as js5 from "js-yaml5";
import * as yaml from "yaml";
import * as tinyJs from "../src/js-yaml/index.ts";
import * as tinyJs5 from "../src/js-yaml-v5/index.ts";
import * as tinyStd from "../src/std/index.ts";
import * as tinyYaml from "../src/yaml/index.ts";
import * as tinyYamljs from "../src/yamljs/index.ts";
import { expectCount, iterationsArg, mulberry32, seedArg } from "./support.ts";

const require = createRequire(import.meta.url);
const js4 = require("js-yaml") as typeof tinyJs;
const yamljs = require("yamljs") as typeof tinyYamljs;

const cases = iterationsArg(process.argv[2], 2000);
const rand = mulberry32(seedArg(process.argv[3]));
const int = (n: number) => Math.floor(rand() * n);
const pick = <T>(list: readonly T[]): T => list[int(list.length)]!;
const chance = (p: number) => rand() < p;

type Op = "grow" | "shrink" | "swap" | "hide" | "none";
interface Item {
  key: string;
  spec: Spec;
  // A getter, and what its first read does to its own collection or the root one.
  getter?: { op: Op; root: boolean };
}
type Spec =
  | { scalar: unknown }
  | { kind: "array" | "object" | "map"; items: Item[]; toJSON?: Spec | undefined };

const SCALARS = ["first", "a b", "", "1", 1, 0, true, null, undefined, () => 1];
const KEYS = ["a", "b", "c", "x y", "1", "toJSON"];

function randomSpec(depth: number, shared: Spec[]): Spec {
  if (shared.length && chance(0.05)) return pick(shared);
  if (depth > 2 || chance(0.3)) return { scalar: pick(SCALARS) };
  const kind = pick(["array", "array", "object", "object", "map"] as const);
  const items: Item[] = [];
  for (let n = int(5); n > 0; n--)
    items.push({
      key: kind === "array" ? "" : pick(KEYS),
      spec: randomSpec(depth + 1, shared),
      getter: chance(0.6)
        ? { op: pick(["grow", "shrink", "swap", "hide", "none"] as const), root: chance(0.3) }
        : undefined,
    });
  const spec: Spec = {
    kind,
    items,
    toJSON: chance(0.15) ? randomSpec(depth + 1, shared) : undefined,
  };
  shared.push(spec);
  return spec;
}

// A fresh value for `spec`, logging every getter read to `log`.
function build(root: Spec, log: string[]): unknown {
  const built = new Map<Spec, unknown>();
  let top: any;
  const act = (target: any, op: Op) => {
    if (target instanceof Map) {
      const keys = [...target.keys()];
      if (op === "grow") target.set(`added${keys.length}`, "later");
      else if (op === "shrink") target.delete(keys.at(-1));
      else if (op === "swap" && keys.length) target.set(keys.at(-1), "swapped");
    } else if (Array.isArray(target)) {
      if (op === "grow") target.push("later");
      else if (op === "shrink") target.pop();
      else if (op === "swap" && target.length) target[target.length - 1] = "swapped";
      // A hole where the last item was.
      else if (op === "hide") Reflect.deleteProperty(target, target.length - 1);
    } else if (target && typeof target === "object") {
      const keys = Object.keys(target);
      const last = keys.at(-1);
      if (op === "grow") target[`added${keys.length}`] = "later";
      else if (last === undefined) return;
      else if (op === "shrink") delete target[last];
      else if (op === "swap") target[last] = "swapped";
      else if (op === "hide") Object.defineProperty(target, last, { enumerable: false });
    }
  };
  const make = (spec: Spec, path: string): unknown => {
    if ("scalar" in spec) return spec.scalar;
    if (built.has(spec)) return built.get(spec);
    const value: any = spec.kind === "array" ? [] : spec.kind === "map" ? new Map() : {};
    built.set(spec, value);
    top ??= value;
    spec.items.forEach((item, i) => {
      const key = spec.kind === "array" ? i : item.key;
      const at = `${path}/${key}`;
      const child = make(item.spec, at);
      const { getter } = item;
      if (!getter) {
        if (value instanceof Map) value.set(key, child);
        else value[key] = child;
        return;
      }
      let fired = false;
      const get = () => {
        log.push(at);
        if (!fired) {
          fired = true;
          act(getter.root ? top : value, getter.op);
        }
        return child;
      };
      // A Map can't hold a getter, so its getters are on a wrapper object.
      if (value instanceof Map)
        value.set(key, Object.defineProperty({}, "v", { get, enumerable: true }));
      else Object.defineProperty(value, key, { get, enumerable: true, configurable: true });
    });
    if (spec.toJSON) {
      const json = make(spec.toJSON, `${path}/toJSON()`);
      Object.defineProperty(value, "toJSON", {
        get() {
          log.push(`${path}.toJSON`);
          return () => (log.push(`${path}.toJSON()`), json);
        },
        configurable: true,
      });
    }
    return value;
  };
  return make(root, "");
}

type Options = Record<string, unknown>;
const replacer = (log: string[]) =>
  function (this: unknown, key: string, value: unknown) {
    log.push(`replacer ${key}`);
    return value;
  };

interface Dumper {
  real: (value: unknown, options: Options, log: string[]) => string;
  tiny: (value: unknown, options: Options, log: string[]) => string;
  options: () => Options;
}
const jsYamlOptions = () => ({
  flowLevel: pick([-1, -1, 0, 1, 2]),
  noRefs: chance(0.3),
  sortKeys: chance(0.2),
  skipInvalid: chance(0.5),
});
const withReplacer = (o: Options, log: string[]) =>
  o.replacer ? { ...o, replacer: replacer(log) } : o;
const dumpers: Record<string, Dumper> = {
  yamljs: {
    real: (v, o) => yamljs.stringify(v, o.inline as number, o.indent as number),
    tiny: (v, o) => tinyYamljs.stringify(v, o.inline as number, o.indent as number),
    options: () => ({ inline: pick([undefined, 0, 1, 2, 9]), indent: pick([undefined, 2]) }),
  },
  "js-yaml 4": {
    real: (v, o, log) => js4.dump(v, withReplacer(o, log)),
    tiny: (v, o, log) => tinyJs.dump(v, withReplacer(o, log)),
    options: () => ({ ...jsYamlOptions(), replacer: chance(0.3) }),
  },
  "js-yaml 5": {
    real: (v, o) => js5.dump(v, o),
    tiny: (v, o) => tinyJs5.dump(v, o),
    options: jsYamlOptions,
  },
  yaml: {
    real: (v, o, log) => yaml.stringify(v, o.replacer ? replacer(log) : null, o),
    tiny: (v, o, log) => tinyYaml.stringify(v, o.replacer ? replacer(log) : null, o as never),
    options: () => ({
      replacer: chance(0.3),
      aliasDuplicateObjects: chance(0.7),
      keepUndefined: chance(0.3),
      sortMapEntries: chance(0.2),
      collectionStyle: pick(["any", "block", "flow"]),
    }),
  },
  std: {
    real: (v, o) => std.stringify(v, o),
    tiny: (v, o) => tinyStd.stringify(v, o),
    options: () => ({
      flowLevel: pick([-1, -1, 0, 1, 2]),
      useAnchors: chance(0.7),
      sortKeys: chance(0.2),
      skipInvalid: chance(0.5),
    }),
  },
};

function attempt(run: Dumper["real"], spec: Spec, options: Options): string {
  const log: string[] = [];
  let out: string;
  try {
    out = JSON.stringify(run(build(spec, log), options, log));
  } catch (error) {
    out = `THROW ${(error as Error)?.name}: ${(error as Error)?.message}`;
  }
  return `${out}\n  reads: ${log.join(" ")}`;
}

let differ = 0;
let shown = 0;
for (const [name, dumper] of Object.entries(dumpers)) {
  let same = 0;
  for (let i = 0; i < cases; i++) {
    const spec = randomSpec(0, []);
    const options = dumper.options();
    const expected = attempt(dumper.real, spec, options);
    const actual = attempt(dumper.tiny, spec, options);
    if (expected === actual) {
      same++;
      continue;
    }
    differ++;
    if (shown++ < Number(process.env.SHOW ?? 10))
      console.log(
        `--- ${name} ${JSON.stringify(options)} ${JSON.stringify(spec)}\n  original: ${expected}\n  tinyaml:  ${actual}`,
      );
  }
  console.log(`${name}: ${cases} values, ${same} same output and reads, ${cases - same} differ`);
}
expectCount("values that differ", differ, 0);
