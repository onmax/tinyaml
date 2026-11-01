import { createError, defineEventHandler, getQuery, getRouterParam } from "nuxt/server";
import type { Page } from "#shared/pages";
import { loadPages } from "../../load-pages.ts";

export default defineEventHandler(async (event): Promise<Page> => {
  const param = (getRouterParam(event, "slug") ?? "").replace(/\/$/, "");
  const slug = param === "index" ? "" : param;
  const pages = await loadPages();
  const fragment = pages?.fragments.get(slug);
  if (!pages || !fragment) throw createError({ status: 404, message: `No page at /${slug}.` });
  // The page shell asks without the body, which the PageBody server component renders.
  return {
    ...fragment,
    css: pages.css,
    slug,
    body: getQuery(event).body === "0" ? "" : fragment.body,
  };
});
