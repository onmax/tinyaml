// Fills the <!-- automd:... --> blocks in every README: the comark-ui badges,
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
  stringify: Timing;
};
export type DropIns = { machine: string; dropIns: Comparison[]; root: Comparison };

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

export default {
  input: ["README.md", "packages/*/README.md"],
  generators: {
    // `name=tinyaml` for one package, `packages=a,b` for the root.
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
        const data: DropIns = JSON.parse(readFileSync(".github/drop-ins.json", "utf8"));
        const rows = data.dropIns.filter((r) => !args.package || r.package === args.package);
        const lines = table(
          [
            ["You use", "Switch to", "Size, gzip", "Parses", "Stringifies"],
            ...rows.map((r) => [
              r.library,
              `\`${r.entry}\``,
              `${kib(r.gzip.theirs)} → ${kib(r.gzip.ours)} KiB`,
              `${times(r.parse)} faster`,
              `${times(r.stringify)} faster`,
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
              `It parses ${times(root.parse)} faster than yaml and stringifies ${times(root.stringify)} faster.`,
          );
        }
        lines.push(
          "",
          `Size is the minified bundle, gzipped. Speed is the median time to parse and stringify ` +
            `${args.package ? "the" : "each package's"} large benchmark file. Measured on ${data.machine}.`,
        );
        return { contents: lines.join("\n") };
      },
    },
  },
} satisfies Config;
