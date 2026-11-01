import { createError, defineEventHandler } from "nuxt/server";
import { loadPages } from "../load-pages.ts";

export default defineEventHandler(async () => {
  const pages = await loadPages();
  if (!pages) throw createError({ status: 404 });
  return new Response(pages.llms, { headers: { "content-type": "text/plain; charset=utf-8" } });
});
