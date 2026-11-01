import { cp, mkdir, rm } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";

// The same app as comark-ui's docs (github.com/onmax/comark-ui/tree/main/docs). server/pages.ts renders every page in
// docs/pages/ from @vite-hub/content, and the Worker serves them prerendered.
const root = new URL("./", import.meta.url);
const repo = new URL("../", root);
const generated = new URL(".generated/public/", root);

// The files the pages show, from where the READMEs show them, so the site and the READMEs can't drift apart.
const files: [from: string, to: string][] = [
  [".github/assets/logo.svg", "logo.svg"],
  [".github/assets/favicon.svg", "favicon.svg"],
  [".github/assets/favicon.ico", "favicon.ico"],
  [".github/assets/favicon-32.png", "favicon-32.png"],
  [".github/assets/apple-touch-icon.png", "apple-touch-icon.png"],
  [".github/assets/logo-512.png", "logo-512.png"],
  ...["size", "speed", "correctness"].map(
    (chart) => [`packages/tinyaml/.github/${chart}.svg`, `charts/${chart}.svg`] as [string, string],
  ),
  ["node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2", "fonts/Geist-Variable.woff2"],
  [
    "node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
    "fonts/GeistMono-Variable.woff2",
  ],
];
async function copyFiles() {
  await rm(generated, { recursive: true, force: true });
  for (const [from, to] of files) {
    await mkdir(new URL(".", new URL(to, generated)), { recursive: true });
    await cp(new URL(from, from.startsWith("node_modules/") ? root : repo), new URL(to, generated));
  }
}

// Every page, so one that nothing links to still prerenders, and its Markdown copy.
const markdown = readdirSync(new URL("pages/", root), { recursive: true, encoding: "utf8" }).filter(
  (file) => file.endsWith(".md"),
);
const routes = [
  ...markdown.map((file) => `/${file.replace(/(^|\/)?index\.md$|\.md$/, "")}`.replace(/\/?$/, "/")),
  ...markdown.map((file) => `/${file}`),
  // Fetched by scripts, so the crawler doesn't find them.
  "/search.json",
  "/llms.txt",
];

export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  devtools: { enabled: false },
  telemetry: false,
  experimental: {
    componentIslands: true,
    // Nuxt 5's default: the first load reads the payload inlined in the HTML, and client navigations fetch `_payload.json`.
    payloadExtraction: "client",
  },
  css: ["~~/style.css"],
  runtimeConfig: {
    pagesDir: fileURLToPath(new URL("pages/", root)),
  },
  app: {
    head: {
      htmlAttrs: { lang: "en" },
      link: [
        { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
        { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        {
          rel: "preload",
          href: "/fonts/Geist-Variable.woff2",
          as: "font",
          type: "font/woff2",
          crossorigin: "",
        },
      ],
    },
  },
  modules: [
    async (_, nuxt) => {
      await copyFiles();
      nuxt.options.nitro.publicAssets ??= [];
      nuxt.options.nitro.publicAssets.push({ dir: fileURLToPath(generated), maxAge: 0 });
      // Nuxt 5's nightly leaves Vite's client manifest in the public output, which would publish /manifest.json. The
      // server has already inlined it.
      nuxt.hook("nitro:init", (nitro) => {
        nitro.hooks.hook("compiled", () =>
          rm(join(nitro.options.output.publicDir, "manifest.json"), { force: true }),
        );
      });
    },
  ],
  nitro: {
    preset: "cloudflare_module",
    output: { dir: fileURLToPath(new URL("dist/", root)) },
    // The Worker's whole config. The build writes it, with `main` and the assets' directory filled in, to
    // docs/dist/server/wrangler.json, which .github/workflows/docs.yml deploys.
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        name: "tiny",
        compatibility_date: "2026-10-01",
        compatibility_flags: ["nodejs_compat"],
        // The Worker runs first so the old host can redirect before an asset answers. Nitro's middleware then serves
        // the prerendered file through ASSETS (server/middleware/site.ts).
        assets: { binding: "ASSETS", run_worker_first: true },
        // tiny.onmax.me and tinyaml.onmax.me are attached to the Worker as custom domains in Cloudflare, not listed
        // here as routes, so the deploy token needs no zone permissions. A deploy leaves them in place.
        workers_dev: false,
      },
    },
    prerender: {
      crawlLinks: true,
      failOnError: true,
      routes,
    },
  },
});
