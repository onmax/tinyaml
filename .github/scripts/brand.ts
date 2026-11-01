// Writes the family's logo, favicon and banners as SVG: one mark for every
// package, and a banner for the root and each package in the same layout.
// Usage: node --no-warnings .github/scripts/brand.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const RED = "#e5484d";
const GRAY = "#737373";

// Three lines of a config file, key in red and value in gray, each shorter
// than the last until the last one is two dots: the file getting tiny.
const mark = `<g fill="${RED}"><rect x="11" y="14" width="16" height="8" rx="4"/><rect x="11" y="28" width="12" height="8" rx="4"/><rect x="11" y="42" width="8" height="8" rx="4"/></g>
<g fill="${GRAY}"><rect x="31" y="14" width="22" height="8" rx="4"/><rect x="27" y="28" width="14" height="8" rx="4"/><rect x="23" y="42" width="8" height="8" rx="4"/></g>`;

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-labelledby="t">
<title id="t">tiny</title>
<rect width="64" height="64" rx="14" fill="#0a0a0a"/>
${mark}
</svg>
`;

type Stat = [value: string, label: string];
interface Banner {
  file: string;
  name: string;
  title: string;
  tagline: string;
  stats: Stat[];
  code: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Code lines: "-" and "+" get a red sign, "#" lines are comments.
const codeLine = (line: string, y: number) => {
  if (line.startsWith("#")) return `<text x="728" y="${y}" fill="#525252">${esc(line)}</text>`;
  const sign = line[0];
  const fill = sign === "+" ? "#fafafa" : "#737373";
  return `<text x="728" y="${y}" fill="${fill}"><tspan fill="${RED}">${sign}</tspan>${esc(line.slice(1))}</text>`;
};

const banner = (b: Banner) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="400" viewBox="0 0 1280 400" role="img" aria-labelledby="t">
<title id="t">${esc(b.title)}</title>
<defs>
<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#fff" fill-opacity=".06"/></pattern>
<radialGradient id="glow" cx="1060" cy="420" r="520" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${RED}" stop-opacity=".18"/><stop offset="1" stop-color="${RED}" stop-opacity="0"/></radialGradient>
<clipPath id="frame"><rect width="1280" height="400" rx="24"/></clipPath>
</defs>
<g clip-path="url(#frame)">
<rect width="1280" height="400" fill="#0a0a0a"/>
<rect width="1280" height="400" fill="url(#dots)"/>
<rect width="1280" height="400" fill="url(#glow)"/>
<g transform="translate(80 72) scale(1.25)">
<rect width="64" height="64" rx="14" fill="#171717" stroke="#262626" stroke-width=".8"/>
${mark}
</g>
<g font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
<text x="188" y="140" fill="#fafafa" font-size="80" font-weight="700" letter-spacing="-3">${esc(b.name)}</text>
<text x="80" y="214" fill="#a3a3a3" font-size="28">${esc(b.tagline)}</text>
${b.stats
  .map(([value, label], i) => {
    const x = 80 + i * 210;
    const v = esc(value).replace("×", `<tspan fill="${RED}">×</tspan>`);
    return `<text x="${x}" y="306" fill="#fafafa" font-size="56" font-weight="700" letter-spacing="-2">${v}</text>
<text x="${x}" y="340" fill="${GRAY}" font-size="20">${esc(label)}</text>`;
  })
  .join("\n")}
</g>
<rect x="700" y="92" width="500" height="216" rx="16" fill="#121212" stroke="#262626"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="20">
${b.code.map((line, i) => codeLine(line, 138 + i * 44)).join("\n")}
</g>
</g>
</svg>
`;

const banners: Banner[] = [
  {
    file: ".github/assets/banner.svg",
    name: "tiny",
    title: "tiny: smaller, faster drop-ins for js-yaml, yaml, yamljs, @std/yaml, json5 and ini",
    tagline: "Swap your parsers for smaller, faster ones.",
    stats: [
      ["7", "drop-in replacements"],
      ["11.9×", "faster than yaml"],
      ["0", "dependencies"],
    ],
    code: [
      "# change one import",
      '- import JSON5 from "json5"',
      '+ import JSON5 from "tinyjson5"',
      "# also tinyaml and tinyini",
    ],
  },
  {
    file: "packages/tinyaml/.github/banner.svg",
    name: "tinyaml",
    title: "tinyaml: a smaller, faster drop-in for js-yaml 4 and 5, yaml, yamljs and @std/yaml",
    tagline: "Swap your YAML library for a smaller, faster one.",
    stats: [
      ["1.5×", "faster than js-yaml"],
      ["5", "drop-in replacements"],
      ["0", "dependencies"],
    ],
    code: [
      "# change one import",
      '- import yaml from "js-yaml"',
      '+ import yaml from "tinyaml/js-yaml"',
      "# also js-yaml-v5, yaml, yamljs, std",
    ],
  },
  {
    file: "packages/tinyjson5/.github/banner.svg",
    name: "tinyjson5",
    title: "tinyjson5: a smaller, faster drop-in for json5 2.2.3",
    tagline: "Swap json5 for a smaller, faster one.",
    stats: [
      ["8×", "faster parsing"],
      ["2.5×", "smaller, gzip"],
      ["0", "dependencies"],
    ],
    code: [
      "# change one import",
      '- import JSON5 from "json5"',
      '+ import JSON5 from "tinyjson5"',
      "# same values, same errors",
    ],
  },
  {
    file: "packages/tinyini/.github/banner.svg",
    name: "tinyini",
    title: "tinyini: a faster drop-in for ini 7.0.0",
    tagline: "Swap ini for a faster one, at the same size.",
    stats: [
      ["2.1×", "faster parsing"],
      ["2.9×", "faster stringify"],
      ["0", "dependencies"],
    ],
    code: [
      "# change one import",
      '- import ini from "ini"',
      '+ import ini from "tinyini"',
      "# same objects, same output",
    ],
  },
];

const write = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log(file);
};

write(".github/assets/logo.svg", logo);
write(".github/assets/favicon.svg", logo);
for (const b of banners) write(b.file, banner(b));
