// Renders the site the way comark-ui's docs (github.com/onmax/comark-ui/tree/main/docs) do: each Markdown file in
// docs/pages/ goes through comark with the comark-ui preset, and this file draws the page around it. Each page's parts
// go to docs/.generated/pages/ for the app in docs/app to serve, and what the pages load (fonts, the brand, the
// charts, search, each page's Markdown copy) goes to docs/.generated/public/.
// Usage: node docs/build.ts, which `pnpm docs:dev` and `pnpm docs:generate` run first.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { renderHtmlFromDocument } from "@comark/html";
import shiki from "@comark/html/plugins/shiki";
import { icons as lucide } from "@iconify-json/lucide";
import { parseMarkdown, type ComarkTree, type ElementNode, type Node } from "comark";
import { escapeHtml, textContent } from "comark/utils";
import { createIcons, css as iconCss, iconHtml } from "comark-icon/html";
import comarkUi, { criticCss } from "comark-ui/html";
import diff from "shiki/langs/diff.mjs";
import dark from "shiki/themes/github-dark-default.mjs";
import light from "shiki/themes/github-light-high-contrast.mjs";

const root = new URL("./", import.meta.url);
const repo = new URL("../", root);
const out = new URL(".generated/public/", root);
const site = "https://tiny.onmax.me";
const github = "https://github.com/onmax/tiny";

// The sidebar's sections, one per package, and the pages of each in order. A page's file is docs/pages/<section>/<page>.md.
type Section = {
  slug: string;
  icon: string;
  blurb: string;
  lists: { title?: string; slugs: string[] }[];
};
const sections: Section[] = [
  {
    slug: "tinyaml",
    icon: "file-code",
    blurb:
      "Replaces js-yaml 4 and 5, yaml, yamljs and @std/yaml, one subpath each. 1.5× faster and 21% smaller than js-yaml.",
    lists: [
      { title: "Guide", slugs: ["guide/getting-started", "guide/switching", "guide/api"] },
      {
        title: "Numbers",
        slugs: [
          "numbers/size",
          "numbers/speed",
          "numbers/correctness",
          "numbers/comparison",
          "numbers/reproduce",
        ],
      },
    ],
  },
  {
    slug: "tinyjson5",
    icon: "braces",
    blurb: "Replaces json5 2.2.3. 3.0 KB gzipped where json5 is 7.5 KB, and parses 8 to 9 times faster.",
    lists: [{ slugs: ["getting-started", "compatibility", "size-and-speed", "develop"] }],
  },
  {
    slug: "tinyini",
    icon: "settings-2",
    blurb: "Replaces ini 7.0.0. The same 1.6 KB, and parses and stringifies 2 to 2.9 times faster.",
    lists: [{ slugs: ["getting-started", "compatibility", "size-and-speed", "develop"] }],
  },
];
// The files the pages show, from where the READMEs show them, so the site and the READMEs can't drift apart.
const files: [from: string, to: string][] = [
  [".github/assets/logo.svg", "logo.svg"],
  [".github/assets/favicon.svg", "favicon.svg"],
  [".github/assets/favicon.ico", "favicon.ico"],
  [".github/assets/apple-touch-icon.png", "apple-touch-icon.png"],
  [".github/assets/logo-512.png", "logo-512.png"],
  [".github/assets/drop-ins.svg", "drop-ins.svg"],
  ...["size", "speed", "correctness"].map(
    (chart) => [`packages/tinyaml/.github/${chart}.svg`, `charts/${chart}.svg`] as [string, string],
  ),
  ["node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2", "fonts/Geist-Variable.woff2"],
  ["node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2", "fonts/GeistMono-Variable.woff2"],
];

// Lucide's icons come from the installed set, so a slow Iconify API can't fail the build. Shiki goes before
// comark-code, which marks the lines Shiki drew, and adds diff to its languages for the import swaps. The site's own
// links stay plain, without chips.
const preset = comarkUi({
  typeset: false,
  chips: false,
  icon: { collections: { lucide } },
  github: { references: { repo: "onmax/tiny" } },
});
const code = preset.plugins.findIndex((plugin) => plugin.name === "comark-code");
const plugins = [
  ...preset.plugins.slice(0, code),
  shiki({ themes: { light, dark }, languages: [diff] }),
  ...preset.plugins.slice(code),
];

const siteIcons = await createIcons({ collections: { lucide }, fetch: false }).resolve(
  [
    ...sections.map((section) => section.icon),
    "arrow-left",
    "arrow-right",
    "search",
  ].map((name) => `lucide:${name}`),
);
const siteIcon = (name: string, size = 18) => {
  const found = siteIcons.get(`lucide:${name}`);
  if (!found || "problem" in found) throw new Error(`docs/build.ts: no icon "${name}".`);
  return iconHtml(found).replace('style="', `style="--comark-icon-size:${size}px;`);
};

const href = (slug: string) => `/${slug}${slug ? "/" : ""}`;
const fileOf = (slug: string) => `docs/pages/${slug || "index"}.md`;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const isElement = (node: Node): node is ElementNode => Array.isArray(node);

const toc = (document: ComarkTree) =>
  document.nodes
    .filter(isElement)
    .filter(([tag]) => tag === "h2" || tag === "h3")
    .map(
      ([tag, attrs, ...children]) =>
        `<a class="nav-${tag}" href="#${text(attrs.id)}">${escapeHtml(textContent([tag, attrs, ...children]))}</a>`,
    )
    .join("");

async function parsePage(slug: string, section?: Section) {
  const file = fileOf(slug);
  const source = await readFile(new URL(file, repo), "utf8");
  const document = await parseMarkdown(source, { plugins });
  if (document.meta.issues.length) throw new Error(`${file}:\n${document.meta.issues.join("\n")}`);
  const [title, label, description, headline, tagline, install] = [
    "title",
    "label",
    "description",
    "headline",
    "tagline",
    "install",
  ].map((key) => text(document.frontmatter[key]));
  if (!title || !description) throw new Error(`${file} needs a title and a description.`);
  return {
    slug,
    section,
    source,
    document,
    title,
    label: label || title,
    description,
    headline,
    tagline,
    install,
    toc: toc(document),
  };
}
type Page = Awaited<ReturnType<typeof parsePage>>;
const listsOf = await Promise.all(
  sections.map(async (section) =>
    Promise.all(
      section.lists.map(async (list) => ({
        title: list.title,
        pages: await Promise.all(
          list.slugs.map((slug) => parsePage(`${section.slug}/${slug}`, section)),
        ),
      })),
    ),
  ),
);
const pagesOf = (section: Section) => listsOf[sections.indexOf(section)]!;
const parsed = sections.flatMap((section) => pagesOf(section).flatMap((list) => list.pages));
const landing = await parsePage("");

const logo = `<img class="logo" src="/logo.svg" alt="" width="24" height="24">`;
const githubIcon = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;
const githubLink = `<a class="github" href="${github}" aria-label="tiny on GitHub">${githubIcon}<span class="github-label">GitHub</span></a>`;
const npmx = `<svg viewBox="0 0 153 153" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M17.6 107.2h24.1v23.7h-24zM119.8.8 116.2 11 69.9 142l-3.6 10.2h15.5l3.6-10.2 11.7-33.2L135.4.8z"/></svg>`;
// npmx shows the package of the page's section; the landing page is about all three, so it has none.
const npmxLink = (npm?: string) =>
  npm
    ? `<a class="npmx" href="https://npmx.dev/package/${npm}" title="${npm} on npmx">${npmx}<span>${npm}</span></a>`
    : "";
const menuIcon = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>`;
const copyIcon = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const checkIcon = `<svg class="check" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20 6 9 17l-5-5"/></svg>`;

// The first column: one icon per package. Hovering or focusing it widens it over the second column to show their names.
const rail = (current?: Section) =>
  `<nav class="rail" aria-label="Packages">${sections
    .map(
      (section) =>
        `<a href="${href(`${section.slug}/${section.lists[0]!.slugs[0]}`)}"${section === current ? ' aria-current="true"' : ""}>${siteIcon(section.icon)}<span class="rail-label">${section.slug}</span></a>`,
    )
    .join("")}</nav>`;
// The second column: the current package's pages.
const column = (section: Section, current: string) =>
  `<nav class="pages" aria-label="${section.slug}"><p class="pages-title">${section.slug}</p>${pagesOf(section)
    .map(
      (list) =>
        `${list.title ? `<p class="nav-group">${escapeHtml(list.title)}</p>` : ""}${list.pages
          .map(
            (page) =>
              `<a${page.slug === current ? ' aria-current="page"' : ""} href="${href(page.slug)}">${escapeHtml(page.label)}</a>`,
          )
          .join("")}`,
    )
    .join("")}</nav>`;
// Bring the current page's link into view before the first paint, unless the docs app already restored the column's scroll.
const revealCurrent = `<script>{
const c = document.currentScript.previousElementSibling.querySelector(".pages"), a = c && c.querySelector("[aria-current=page]");
if (a && !c.hasAttribute("data-sidebar-restored")) {
  const b = c.getBoundingClientRect(), l = a.getBoundingClientRect();
  if (l.top < b.top || l.bottom > b.bottom) c.scrollTop += l.top - b.top - (b.height - l.height) / 2;
}
}</script>`;

// Previous and next page in the package.
function pager(page: Page) {
  const list = pagesOf(page.section!).flatMap((list) => list.pages);
  const i = list.indexOf(page);
  const [previous, next] = [list[i - 1], list[i + 1]];
  const link = (target: Page | undefined, rel: "prev" | "next") =>
    target
      ? `<a class="pager-${rel}" rel="${rel}" href="${href(target.slug)}"><small>${rel === "prev" ? "Previous" : "Next"}</small><span>${rel === "prev" ? siteIcon("arrow-left", 14) : ""}${escapeHtml(target.label)}${rel === "next" ? siteIcon("arrow-right", 14) : ""}</span></a>`
      : "<span></span>";
  return `<nav class="pager" aria-label="Pages">${link(previous, "prev")}${link(next, "next")}</nav>`;
}

// Every page also has a Markdown copy at its path plus `.md`, for agents and for pasting into a chat.
const markdownHref = (slug: string) => `/${slug || "index"}.md`;
const pageActions = (slug: string) =>
  `<div class="page-actions"><button type="button" class="button copy-page" data-markdown="${markdownHref(slug)}"><span class="copy-page-icon">${copyIcon}${checkIcon}</span>Copy page</button><a class="button" href="${markdownHref(slug)}">View as Markdown</a></div>`;

// The install command for each package manager, copied on click.
function installer(install: string) {
  const packages = install.replace(/^pnpm add /, "");
  const commands = {
    pnpm: `pnpm add ${packages}`,
    npm: `npm install ${packages}`,
    yarn: `yarn add ${packages}`,
    bun: `bun add ${packages}`,
  };
  return `<div class="installer" data-commands='${escapeHtml(JSON.stringify(commands))}'>
<div class="installer-bar"><div class="seg installer-pm" role="group" aria-label="Package manager">${Object.keys(
    commands,
  )
    .map((pm, i) => `<button type="button" data-pm="${pm}" aria-pressed="${i === 0}">${pm}</button>`)
    .join("")}</div></div>
<button type="button" class="install" data-copy="${escapeHtml(commands.pnpm)}" title="Copy the install command"><span aria-hidden="true">$</span><code>${escapeHtml(commands.pnpm)}</code><span class="install-hint">${copyIcon}${checkIcon}</span></button>
</div>`;
}

// The packages as tiles, each a link to its first page.
const packageGrid = () =>
  `<ul class="grid">${sections
    .map(
      (section) =>
        `<li><a href="${href(`${section.slug}/${section.lists[0]!.slugs[0]}`)}"><span class="grid-icon">${siteIcon(section.icon, 20)}</span><strong>${section.slug}</strong><span>${escapeHtml(section.blurb)}</span></a></li>`,
    )
    .join("")}</ul>`;

const footer = `<footer><span>Built on <a href="https://comark.dev">Comark</a>.</span><span>Made by <a href="https://onmax.me">Maxi García</a></span></footer>`;

// The tabs' and switches' sliding indicator, the copy buttons, the package manager switch, the outline's current
// heading, and the rail's Escape. A block, so the docs app can run it again for each page it navigates to.
const script = `{
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const indicate = (group, selector) => {
  const bar = group.appendChild(Object.assign(document.createElement("span"), { className: "indicator" }));
  bar.setAttribute("aria-hidden", "true");
  const place = () => { const b = group.querySelector(selector); if (b) { bar.style.width = b.offsetWidth + "px"; bar.style.transform = "translateX(" + b.offsetLeft + "px)" } };
  new ResizeObserver(() => { bar.dataset.still = ""; place(); requestAnimationFrame(() => delete bar.dataset.still) }).observe(group);
  new MutationObserver(place).observe(group, { subtree: true, attributeFilter: ["aria-pressed"] });
  group.dataset.indicator = "";
};
for (const seg of document.querySelectorAll(".seg")) indicate(seg, "[aria-pressed=true]");
const copied = async (button, text) => {
  await navigator.clipboard.write([new ClipboardItem({ "text/plain": text })]);
  button.classList.add("copied"); setTimeout(() => button.classList.remove("copied"), 1200);
};
// ClipboardItem takes the fetch's promise, so Safari still counts the copy as part of the click.
for (const button of document.querySelectorAll(".copy-page")) button.addEventListener("click", () =>
  copied(button, fetch(button.dataset.markdown).then(r => r.blob()).then(b => new Blob([b], { type: "text/plain" }))));
for (const box of document.querySelectorAll(".installer")) {
  const commands = JSON.parse(box.dataset.commands), field = box.querySelector(".install");
  box.querySelector(".installer-pm").addEventListener("click", e => {
    const b = e.target.closest("[data-pm]"); if (!b) return;
    for (const x of box.querySelectorAll("[data-pm]")) x.setAttribute("aria-pressed", x === b);
    field.dataset.copy = commands[b.dataset.pm]; field.querySelector("code").textContent = commands[b.dataset.pm];
  });
  field.addEventListener("click", () => copied(field, field.dataset.copy));
}
const links = [...document.querySelectorAll(".toc a")];
const spy = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) for (const a of links) a.toggleAttribute("data-active", a.hash === "#" + e.target.id);
}, { rootMargin: "0px 0px -70% 0px" });
for (const h of document.querySelectorAll("main h2[id], main h3[id]")) spy.observe(h);
// Escape folds the widened rail back without moving focus; it widens again once the pointer or focus leaves it.
for (const rail of document.querySelectorAll(".sidebar .rail")) {
  rail.addEventListener("keydown", e => { if (e.key === "Escape") rail.dataset.dismissed = "" });
  rail.addEventListener("focusout", e => { if (!rail.contains(e.relatedTarget)) delete rail.dataset.dismissed });
  rail.addEventListener("pointerleave", () => delete rail.dataset.dismissed);
}
}`;

// Search over every page and its headings, from /search.json, fetched the first time it's needed. Without the
// script the buttons stay hidden. It listens on the document and finds the dialog when it's used, so it runs once even
// when the docs app swaps the page around it.
const searchScript = `
if (!window.comarkSearch) {
window.comarkSearch = true;
// On <html>, which the docs app leaves alone when it takes over the header.
document.documentElement.dataset.search = "";
if (/Mac|iP(hone|ad)/.test(navigator.platform)) document.documentElement.dataset.mac = "";
let index, results = [], active = 0, restoreMenuFocus = false;
// Words in lowercase, without accents or a plural s, so "Gantts" finds "gantt".
const wordRe = /[\\p{L}\\p{M}\\p{N}]+/gu;
const norm = w => { w = w.normalize("NFD").replace(/\\p{M}/gu, "").toLowerCase(); return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w };
const words = text => text?.match(wordRe)?.map(norm) ?? [];
// Words too common to narrow a search: left out of one unless they're all there is, and matched only as they are.
const common = new Set(["a", "an", "and", "are", "be", "by", "can", "do", "does", "for", "from", "how", "i", "if", "in", "is", "it", "its", "my", "of", "on", "or", "so", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "what", "when", "with", "you", "your"]);
// What a word found in each field counts: the title, the page's keywords, where it sits, its description, and its text.
const fields = [["t", 10], ["w", 6], ["p", 3], ["d", 3], ["x", 1]];
// Each word in the index, with the entries and fields it's in.
const load = () => index ??= fetch("/search.json").then(r => r.json()).then(all => {
  const postings = new Map();
  all.forEach((e, i) => fields.forEach(([key], f) => { for (const w of new Set(words(e[key]))) { if (!postings.has(w)) postings.set(w, []); postings.get(w).push(i, f) } }));
  return { all, postings, titles: all.map(e => words(e.t)) };
});
// Edits between two words, a swap of neighbours counting as one, given up past max.
const distance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before = [], prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    if (Math.min(...row) > max) return max + 1;
    before = prev; prev = row;
  }
  return prev[b.length];
};
// Endings that leave a word the same word, so "theme" finds "Theming" and "sorting" finds "sort".
const endings = new Set(["", "e", "ed", "er", "es", "ing", "ion", "ation", "ly"]);
// How well a typed word matches one in the index: the same word, the start of one, the same word with another ending,
// or one a typo or two away. A short word gets no typos, and neither does a first letter, since allowing them matches
// nearly everything.
const close = (q, w) => {
  if (w === q) return 1;
  if (common.has(q)) return 0;
  if (common.has(w)) return 0;
  if (w.startsWith(q)) return 0.6 + 0.3 * q.length / w.length;
  let same = 0;
  while (same < q.length && q[same] === w[same]) same++;
  if (same >= 4 && endings.has(q.slice(same)) && endings.has(w.slice(same))) return 0.7;
  const typos = q.length < 4 ? 0 : q.length < 8 ? 1 : 2;
  if (!typos || w[0] !== q[0]) return 0;
  if (distance(q, w, typos) <= typos) return 0.5;
  // A word still being typed, with a typo in it.
  return w.length > q.length && distance(q, w.slice(0, q.length), typos) <= typos ? 0.3 : 0;
};
const found = new Map();
const matches = (q, postings) => {
  if (!found.has(q)) {
    const m = new Map();
    for (const w of postings.keys()) { const c = close(q, w); if (c) m.set(w, c) }
    // A word the index has, or starts one, isn't a typo, so "video" doesn't find "Vimeo".
    if ([...m.values()].some(c => c >= 0.6)) for (const [w, c] of m) if (c < 0.6) m.delete(w);
    found.set(q, m);
  }
  return found.get(q);
};
// Each entry scores its best match for each word, by field, and more when the words make up most of its title. A rule
// page scores less than the page about its block. The entries that match the most words are kept, so one word nothing
// has doesn't empty the list.
const search = ({ all, postings, titles }, qs) => {
  const rows = new Map();
  qs.forEach((q, n) => {
    for (const [w, c] of matches(q, postings)) {
      const list = postings.get(w);
      for (let j = 0; j < list.length; j += 2) {
        if (!rows.has(list[j])) rows.set(list[j], qs.map(() => 0));
        const row = rows.get(list[j]), s = c * fields[list[j + 1]][1];
        if (s > row[n]) row[n] = s;
      }
    }
  });
  const ranked = [...rows].map(([i, row]) => {
    const title = titles[i], named = title.filter(w => qs.some(q => matches(q, postings).has(w))).length;
    const score = row.reduce((a, b) => a + b, 0) + (title.length ? 4 * named / title.length : 0) + (all[i].k === "page" ? 0.5 : 0);
    return { i, score: all[i].k === "rule" ? score * 0.6 : score, covered: row.filter(Boolean).length };
  });
  const most = Math.max(0, ...ranked.map(r => r.covered));
  return ranked.filter(r => r.covered === most).sort((a, b) => b.score - a.score || a.i - b.i).map(r => all[r.i]);
};
// A text as nodes, with the words that matched in <mark>.
const marked = (text, hit) => {
  const out = []; let at = 0;
  for (const m of text.matchAll(wordRe)) if (hit(m[0])) {
    out.push(text.slice(at, m.index), Object.assign(document.createElement("mark"), { textContent: m[0] }));
    at = m.index + m[0].length;
  }
  return [...out, text.slice(at)];
};
// The part of a text from just before its first match.
const excerpt = (text, hit) => {
  for (const m of text?.matchAll(wordRe) ?? []) if (hit(m[0])) {
    const start = m.index < 60 ? 0 : Math.min(m.index, text.indexOf(" ", m.index - 50) + 1);
    return (start ? "…" : "") + text.slice(start, start + 200);
  }
};
const parts = () => { const dialog = document.querySelector("dialog.search"); return { dialog, input: dialog.querySelector("input"), list: dialog.querySelector("[role=listbox]"), empty: dialog.querySelector(".search-empty") } };
const select = i => {
  const { input, list } = parts();
  active = i;
  for (const [j, a] of [...list.children].entries()) a.setAttribute("aria-selected", j === i);
  const a = list.children[i];
  if (a) { input.setAttribute("aria-activedescendant", a.id); a.scrollIntoView({ block: "nearest" }) } else input.removeAttribute("aria-activedescendant");
};
const update = async () => {
  const idx = await load(), { dialog, input, list, empty } = parts();
  const typed = input.value.toLowerCase().match(wordRe) ?? [], kept = typed.filter(w => !common.has(w));
  const qs = [...new Set((kept.length ? kept : typed).map(norm))];
  const hit = w => qs.some(q => matches(q, idx.postings).has(norm(w)));
  results = (qs.length ? search(idx, qs) : idx.all.filter(e => e.k === "page")).slice(0, 20);
  list.replaceChildren(...results.map((e, i) => {
    const a = Object.assign(document.createElement("a"), { id: "search-" + i, href: e.h, tabIndex: -1 }), title = document.createElement("span");
    a.setAttribute("role", "option");
    title.append(...marked(e.t, hit));
    a.append(Object.assign(document.createElement("small"), { textContent: e.p }), title);
    // When the title doesn't hold every word, the text that does says why it's here.
    const named = words(e.t);
    if (qs.some(q => !named.some(w => matches(q, idx.postings).has(w)))) {
      const said = excerpt(e.x, hit) ?? excerpt(e.d, hit) ?? e.d;
      if (said) { const p = document.createElement("p"); p.append(...marked(said, hit)); a.append(p) }
    }
    return a;
  }));
  empty.hidden = results.length > 0;
  input.setAttribute("aria-expanded", String(dialog.open));
  select(0);
};
const show = trigger => {
  restoreMenuFocus = trigger?.classList.contains("menu-search") ?? false;
  const menu = document.querySelector(".menu"), { dialog, input } = parts();
  if (menu) menu.open = false;
  dialog.showModal(); input.select(); update();
};
document.addEventListener("pointerover", e => { if (e.target.closest?.(".search-open")) load() });
document.addEventListener("click", e => {
  const open = e.target.closest(".search-open"), dialog = e.target.closest("dialog.search");
  if (open) show(open);
  else if (dialog && (e.target === dialog || e.target.closest(".search-close, [role=option]"))) dialog.close();
});
// close doesn't bubble, but it passes the document on its way down.
document.addEventListener("close", e => {
  if (!e.target.matches?.("dialog.search")) return;
  parts().input.setAttribute("aria-expanded", "false");
  if (restoreMenuFocus) { document.querySelector(".menu summary")?.focus(); restoreMenuFocus = false }
}, true);
document.addEventListener("input", e => { if (e.target.closest("dialog.search")) update() });
document.addEventListener("pointermove", e => { const a = e.target.closest?.("dialog.search [role=option]"); if (a) select([...a.parentElement.children].indexOf(a)) });
document.addEventListener("keydown", e => {
  const { dialog, list } = parts(), typing = e.target.closest("input, textarea, select, [contenteditable]");
  if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); if (dialog.open) dialog.close(); else show() }
  else if (!e.target.closest("dialog.search input")) return;
  else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && results.length) { e.preventDefault(); select((active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length) }
  // A click, so the docs app opens the page without a reload.
  else if (e.key === "Enter" && results[active]) { e.preventDefault(); list.children[active].click() }
});
}
`;

const searchDialog = `<dialog class="search" aria-label="Search the docs">
<div class="search-field">${siteIcon("search", 16)}<input type="text" enterkeyhint="search" role="combobox" aria-label="Search the docs" aria-controls="search-results" aria-expanded="false" aria-autocomplete="list" placeholder="Search the docs" autocomplete="off" spellcheck="false"><kbd>Esc</kbd><button type="button" class="search-close">Cancel</button></div>
<div id="search-results" class="search-results" role="listbox" aria-label="Results"></div>
<p class="search-empty" role="status" hidden>No page or heading matches.</p>
</dialog>`;

// Each page's title, description, and body, which the docs app (docs/app) serves.
const fragments = new Map<string, { title: string; description: string; body: string }>();
function shell(options: { slug: string; section?: Section; title: string; description: string; body: string }) {
  const { slug, section } = options;
  const nav = rail(section) + (section ? column(section, slug) : "");
  const header = `<div class="top-start"><a class="name" href="/">${logo}tiny</a>${section ? "" : `<nav class="top-links" aria-label="Packages">${sections.map((s) => `<a href="${href(`${s.slug}/${s.lists[0]!.slugs[0]}`)}">${s.slug}</a>`).join("")}</nav>`}</div>
<button type="button" class="search-open" aria-haspopup="dialog" aria-label="Search docs">${siteIcon("search", 15)}<span class="search-label">Search docs</span><kbd><span class="kbd-mac">⌘K</span><span class="kbd-other">Ctrl K</span></kbd></button>
<div class="top-end">
<nav>${npmxLink(section?.slug)}${githubLink}</nav>
<details class="menu"><summary aria-label="Menu" title="Menu">${menuIcon}</summary><div class="menu-panel"><button type="button" class="search-open menu-search" aria-haspopup="dialog">${siteIcon("search", 15)}<span>Search docs</span></button>${nav}</div></details>
</div>`;
  const body = `<header class="top">
${header}
</header>
${searchDialog}
${section ? `<div class="layout">\n<aside class="sidebar">${nav}</aside>${revealCurrent}\n${options.body}\n</div>` : options.body}
<script>${searchScript.trim()}</script>`;
  fragments.set(slug, { title: options.title, description: options.description, body });
}

// A table wider than the column scrolls inside it instead of widening the page.
const render = async (page: Page, components = {}) =>
  (await renderHtmlFromDocument(page.document, { components: { ...preset.components, ...components } })).replace(
    /<table>[\s\S]*?<\/table>/g,
    (table) => `<div class="table-scroll">${table}</div>`,
  );

shell({
  slug: "",
  title: `${landing.title} · ${landing.description}`,
  description: landing.tagline,
  body: `<div class="landing">
<div class="landing-hero"><div><h1>${escapeHtml(landing.headline)}</h1><p>${escapeHtml(landing.tagline)}</p>${pageActions("")}</div>
<div>${installer(landing.install)}<div class="actions"><a class="button primary" href="/tinyaml/guide/getting-started/">Get started${siteIcon("arrow-right", 15)}</a><a class="button" href="${github}">${githubIcon}GitHub</a></div></div></div>
<main>${await render(landing, { packages: packageGrid })}</main>
${footer}
</div>
<script>${script}</script>`,
});

for (const page of parsed)
  shell({
    slug: page.slug,
    section: page.section,
    title: `${page.title} · ${page.section!.slug}`,
    description: page.description,
    body: `<div class="page">
<div class="content">
<div class="hero"><p class="eyebrow mono">${page.section!.slug}</p><div class="hero-title"><h1>${escapeHtml(page.title)}</h1>${pageActions(page.slug)}</div><p>${escapeHtml(page.description)}</p></div>
<main>${await render(page)}</main>
${pager(page)}
${footer}
</div>
${page.toc ? `<aside class="toc"><nav aria-label="On this page"><p class="nav-group">On this page</p>${page.toc}</nav></aside>` : ""}
</div>
<script>${script}</script>`,
  });

// What a page or a heading says, in one line, so search finds it by its words and not only its title. Code blocks
// are left out.
const inlineTags = new Set(["a", "code", "del", "em", "ins", "kbd", "mark", "s", "span", "strong", "sub", "sup"]);
const prose = (nodes: Node[]): string =>
  nodes
    .map((node) => {
      if (typeof node === "string") return node;
      if (!isElement(node) || node[0] === "pre") return " ";
      const [tag, , ...children] = node;
      return inlineTags.has(tag) ? prose(children) : ` ${prose(children)} `;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
// A page's nodes cut at each h2 and h3: what comes before the first, then each heading with what follows it.
const sectionsOf = (nodes: Node[]) => {
  const parts: { heading?: ElementNode; nodes: Node[] }[] = [{ nodes: [] }];
  for (const node of nodes)
    if (isElement(node) && (node[0] === "h2" || node[0] === "h3")) parts.push({ heading: node, nodes: [] });
    else parts.at(-1)!.nodes.push(node);
  return parts;
};
// One entry per page and per heading: its title, where it sits, its link, and the words that find it.
const searchIndex = [landing, ...parsed].flatMap((page) => {
  const where = page.section ? `${page.section.slug} › ${page.label}` : "tiny";
  const [intro, ...headed] = sectionsOf(page.document.nodes);
  return [
    {
      k: "page",
      t: page.title,
      p: page.section?.slug ?? "tiny",
      h: href(page.slug),
      d: page.description,
      x: prose(intro!.nodes) || undefined,
    },
    ...headed.map(({ heading, nodes }) => ({
      k: "heading",
      t: textContent(heading!),
      p: where,
      h: `${href(page.slug)}#${text(heading![1].id)}`,
      x: prose(nodes) || undefined,
    })),
  ];
});

await rm(new URL(".generated/", root), { recursive: true, force: true });
for (const [from, to] of files) {
  await mkdir(new URL(".", new URL(to, out)), { recursive: true });
  await cp(new URL(from, from.startsWith("node_modules/") ? root : repo), new URL(to, out));
}
await writeFile(new URL("search.json", out), JSON.stringify(searchIndex));

// The Markdown copies keep each page's source under its title and description, with the site's links made absolute.
const markdownOf = (page: Page) =>
  `# ${page.title}\n\n> ${page.description}\n\n${page.source
    .replace(/^---\n[\s\S]*?\n---\n+/, "")
    .replaceAll("](/", `](${site}/`)
    .trim()}\n\n## Sitemap\n\nSee the full list of pages in [llms.txt](${site}/llms.txt).\n`;
for (const page of [landing, ...parsed]) {
  const file = new URL(markdownHref(page.slug).slice(1), out);
  await mkdir(new URL(".", file), { recursive: true });
  await writeFile(file, markdownOf(page));
}
// llms.txt: what the site is, and every page's Markdown copy by package.
await writeFile(
  new URL("llms.txt", out),
  `# tiny\n\n> ${landing.tagline}\n\nEvery page has a Markdown copy at its path plus \`.md\`, listed here.\n\n- [tiny](${site}/index.md): ${landing.description}\n${sections
    .map(
      (section) =>
        `\n## ${section.slug}\n\n${section.blurb}\n\n${pagesOf(section)
          .flatMap((list) => list.pages)
          .map((page) => `- [${page.title}](${site}${markdownHref(page.slug)}): ${page.description}`)
          .join("\n")}\n`,
    )
    .join("")}`,
);

const generatedPages = new URL(".generated/pages/", root);
await mkdir(generatedPages, { recursive: true });
await writeFile(new URL("site.json", generatedPages), JSON.stringify({ css: iconCss + criticCss }));
for (const [slug, fragment] of fragments)
  await writeFile(
    new URL(`${slug.replaceAll("/", "~") || "index"}.json`, generatedPages),
    JSON.stringify(fragment),
  );
console.log(`docs/.generated/ written (${fragments.size} pages)`);
