import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";

// The same app as comark-ui's docs (github.com/onmax/comark-ui/tree/main/docs): docs/build.ts renders every page with
// comark, and this app serves what it wrote, prerendered, from a Cloudflare Worker.
const root = new URL("./", import.meta.url);
const generated = new URL(".generated/public/", root);

// Every page, so one that nothing links to still prerenders.
const pageRoutes = () =>
  readdirSync(new URL("pages/", root), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".md"))
    .map((file) => `/${file.replace(/(^|\/)?index\.md$|\.md$/, "")}`.replace(/\/?$/, "/"));

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
    generatedPagesDir: fileURLToPath(new URL(".generated/pages/", root)),
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
    "vite-hub/nuxt",
    "~~/modules/wrangler-output",
    (_, nuxt) => {
      nuxt.options.nitro.publicAssets ??= [];
      nuxt.options.nitro.publicAssets.push({ dir: fileURLToPath(generated), maxAge: 0 });
    },
  ],
  vitehub: {
    name: "tiny",
    preset: "cloudflare",
  },
  nitro: {
    // The root wrangler.jsonc holds what ViteHub doesn't generate (name, routes). Nitro merges it with ViteHub's
    // bindings into docs/dist/server/wrangler.json, which the local Wrangler module selects for commands run from the
    // repository's root.
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
    output: { dir: fileURLToPath(new URL("dist/", root)) },
    prerender: {
      crawlLinks: true,
      failOnError: true,
      routes: pageRoutes(),
    },
  },
});
