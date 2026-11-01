import shiki from "@comark/html/plugins/shiki";
import { icons as lucide } from "@iconify-json/lucide";
import { defineContent } from "@vite-hub/content";
import fs from "comark-content/sources/fs";
import comarkUi from "comark-ui/html";
import { useRuntimeConfig } from "nuxt/server";
import diff from "shiki/langs/diff.mjs";
import dark from "shiki/themes/github-dark-default.mjs";
import light from "shiki/themes/github-light-high-contrast.mjs";

// The site renders the way comark-ui's docs (github.com/onmax/comark-ui/tree/main/docs) do: each Markdown file in
// docs/pages/ goes through comark with the comark-ui preset. Lucide's icons come from the installed set, so a slow
// Iconify API can't fail the build. The site's own links stay plain, without chips.
export const preset = comarkUi({
  typeset: false,
  chips: false,
  icon: { collections: { lucide } },
  github: { references: { repo: "onmax/tiny" } },
});

// Shiki goes before comark-code, which marks the lines Shiki drew, and adds diff to its languages for the import swaps.
const code = preset.plugins.findIndex((plugin) => plugin.name === "comark-code");
const plugins = [
  ...preset.plugins.slice(0, code),
  shiki({ themes: { light, dark }, languages: [diff] }),
  ...preset.plugins.slice(code),
];

// docs/pages/<slug>.md is the page at /<slug>/, and docs/pages/index.md the home page. A page that fails to parse fails
// the build instead of prerendering empty.
export const content = defineContent({
  source: fs(useRuntimeConfig().pagesDir),
  markdown: { plugins },
  onError: "throw",
});
