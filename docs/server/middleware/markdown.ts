import { defineEventHandler, getRequestURL } from "nuxt/server";
import { loadPages } from "../load-pages.ts";

// Each page's Markdown copy, at its path plus `.md` (`/index.md` for the home page). A route can't end in `.md`, so
// this answers before the routes do.
export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event);
  if (!pathname.endsWith(".md")) return;
  const markdown = (await loadPages())?.markdown.get(pathname);
  if (markdown === undefined) return;
  return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8" } });
});
