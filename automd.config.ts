// Fills the <!-- automd:... --> blocks in every README and the website's home page: the comark-ui badges,
// and the drop-in tables from .github/drop-ins.json, which
// .github/scripts/drop-ins.ts measures. Run `pnpm readme` after editing either.
import { readFileSync } from "node:fs";
import type { Config } from "automd";

export type Timing = { theirs: number; ours: number };
export type Comparison = {
  package: string;
  library: string;
  entry: string;
  gzip: Timing;
  parse: Timing;
  /** Absent for a library that only parses, such as strip-json-comments. */
  stringify?: Timing;
  /** Where this row was measured, when not on the file's `machine`. */
  machine?: string;
};
// `root` is tinyaml's own API against yaml; `roots` the other packages' own
// APIs, each against the library its users switch from.
export type DropIns = { machine: string; dropIns: Comparison[]; root: Comparison; roots?: Comparison[] };

const BADGE = "https://comark-ui.onmax.me/badge.svg";
const REPO = "onmax/tiny";

const badge = (alt: string, params: Record<string, string>, to: string) =>
  `[![${alt}](${BADGE}?${new URLSearchParams(params)})](${to})`;

// Padded the way `vp fmt` pads Markdown tables, so formatting the packages
// leaves the generated blocks alone. A column whose separator is "--:" is
// right-aligned.
const table = (rows: string[][], right: boolean[]) => {
  const widths = rows[0]!.map((_, i) => Math.max(3, ...rows.map((row) => row[i]!.length)));
  const line = (cells: string[]) =>
    `| ${cells.map((c, i) => (right[i] ? c.padStart(widths[i]!) : c.padEnd(widths[i]!))).join(" | ")} |`;
  const rule = widths.map((w, i) => (right[i] ? `${"-".repeat(w - 1)}:` : "-".repeat(w)));
  return [line(rows[0]!), `| ${rule.join(" | ")} |`, ...rows.slice(1).map(line)];
};

const kib = (bytes: number) => (bytes / 1024).toFixed(1);
const times = ({ theirs, ours }: Timing) => `${(theirs / ours).toFixed(1)}×`;

const readDropIns = (): DropIns => JSON.parse(readFileSync(".github/drop-ins.json", "utf8"));

// The machines the rows were measured on: one, or each with its packages.
const machines = (data: DropIns, rows: Comparison[]) => {
  const packages = new Map<string, Set<string>>();
  for (const r of rows) {
    const machine = r.machine ?? data.machine;
    packages.set(machine, (packages.get(machine) ?? new Set()).add(r.package));
  }
  if (packages.size <= 1) return [...packages.keys()][0] ?? data.machine;
  return [...packages].map(([machine, names]) => `${machine} (${[...names].join(", ")})`).join(" and ");
};

// The size of the package's own entry, which for tinyaml is its root API.
const facts = (name: string, section: string) => {
  const data = readDropIns();
  const own = [data.root, ...(data.roots ?? []), ...data.dropIns].find((r) => r.entry === name)!;
  const pkg = JSON.parse(readFileSync(`packages/${name}/package.json`, "utf8"));
  const dependencies = String(Object.keys(pkg.dependencies ?? {}).length);
  return [
    badge("size", { label: "size", value: `${kib(own.gzip.ours)} KiB gzip` }, `#${section}`),
    badge(
      "dependencies",
      { label: "dependencies", value: dependencies },
      `https://www.npmjs.com/package/${name}?activeTab=dependencies`,
    ),
  ];
};

export default {
  input: ["README.md", "packages/*/README.md", "docs/pages/index.md"],
  generators: {
    // `name=tinyaml` for one package, `packages=a,b` for the root. A package
    // also gets its gzip size, from .github/drop-ins.json, and its dependency
    // count, from its package.json; `size=` names the README section to link.
    "comark-badges": {
      name: "comark-badges",
      generate({ args }) {
        const versions = args.name
          ? [
              badge(
                "release",
                { source: "npm-version", package: args.name, label: "release", icon: "npm" },
                `https://github.com/${REPO}/releases`,
              ),
              ...facts(args.name, args.size),
            ]
          : String(args.packages)
              .split(",")
              .map((name) =>
                badge(
                  name,
                  { source: "npm-version", package: name, label: name, icon: "npm" },
                  `https://www.npmjs.com/package/${name}`,
                ),
              );
        return {
          contents: [
            ...versions,
            badge("license: MIT", { label: "license", value: "MIT" }, "./LICENSE"),
            badge(
              "Release status",
              { source: "github-actions", repository: REPO, workflow: "release.yaml", icon: "github" },
              `https://github.com/${REPO}/actions/workflows/release.yaml`,
            ),
          ].join("\n"),
        };
      },
    },
    // Every drop-in, or with `package=tinyaml` only that package's.
    "drop-ins": {
      name: "drop-ins",
      generate({ args }) {
        const data = readDropIns();
        const rows = data.dropIns.filter((r) => !args.package || r.package === args.package);
        const lines = table(
          [
            ["You use", "Switch to", "Size, gzip", "Parses", "Stringifies"],
            ...rows.map((r) => [
              r.library,
              `\`${r.entry}\``,
              `${kib(r.gzip.theirs)} → ${kib(r.gzip.ours)} KiB`,
              `${times(r.parse)} faster`,
              r.stringify ? `${times(r.stringify)} faster` : "—",
            ]),
          ],
          [false, false, true, true, true],
        );
        // tinyaml's own API is smaller than any drop-in, so it gets a line of its own.
        if (!args.package || args.package === "tinyaml") {
          const { root } = data;
          const jsYaml = data.dropIns.find((r) => r.library === "js-yaml 4")!;
          const smaller = (bytes: number) => (bytes / root.gzip.ours).toFixed(1);
          lines.push(
            "",
            `Starting fresh with YAML? The root \`tinyaml\` API is the smallest of all: ${kib(root.gzip.ours)} KiB, ` +
              `${smaller(jsYaml.gzip.theirs)}× smaller than js-yaml 4 and ${smaller(root.gzip.theirs)}× smaller than yaml. ` +
              `It parses ${times(root.parse)} faster than yaml and stringifies ${times(root.stringify!)} faster.`,
          );
        }
        // Another package's own API, from `roots`, against the library its users switch from.
        const own = data.roots?.find((r) => r.package === args.package);
        if (own)
          lines.push(
            "",
            `The root \`${own.entry}\` API is ${kib(own.gzip.ours)} KiB against ${kib(own.gzip.theirs)} KiB for ${own.library}. ` +
              `It parses ${times(own.parse)} faster than ${own.library}` +
              (own.stringify ? ` and stringifies ${times(own.stringify)} faster.` : "."),
          );
        lines.push(
          "",
          `Size is the minified bundle, gzipped. Speed is the median time to parse and stringify ` +
            `${args.package ? "the" : "each package's"} large benchmark file.` +
            (rows.some((r) => r.library.startsWith("@one-ini/wasm"))
              ? " @one-ini/wasm's size adds its .wasm file, gzipped, and its speed is parse_to_uint32array on a 100 KB .editorconfig."
              : "") +
            ` Measured on ${machines(data, rows)}.`,
        );
        return { contents: lines.join("\n") };
      },
    },
  },
} satisfies Config;
