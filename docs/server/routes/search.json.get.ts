import { createError, defineEventHandler } from "nuxt/server";
import { loadPages } from "../load-pages.ts";

// Every page and heading, which the search dialog fetches the first time it opens.
export default defineEventHandler(async () => {
  const pages = await loadPages();
  if (!pages) throw createError({ status: 404 });
  return pages.searchIndex;
});
