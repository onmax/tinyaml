// The site started at tinyaml.onmax.me, before the repository held the whole family. Its links move to the same path
// here.
export const SITE = "https://tiny.onmax.me";
const MOVED = new Set(["tinyaml.onmax.me"]);

/** Where an old host's request now lives, or nothing when the request is current. */
export function redirectTarget(url: URL): string | undefined {
  if (MOVED.has(url.hostname)) return `${SITE}${url.pathname}${url.search}${url.hash}`;
}

type Assets = { fetch: (request: Request) => Promise<Response> };

/**
 * The prerendered file for a request, from the assets binding. The Worker runs before the assets so the redirect
 * above comes first, so this answers what the assets would have: a page, a file, or the page's Markdown copy for an
 * agent that asks for Markdown. A path with no file returns nothing, and Nitro goes on to its own routes.
 */
export async function fromAssets(request: Request, assets: Assets): Promise<Response | undefined> {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  const url = new URL(request.url);
  if (url.pathname.endsWith("/") && request.headers.get("accept")?.includes("text/markdown")) {
    url.pathname = url.pathname === "/" ? "/index.md" : `${url.pathname.slice(0, -1)}.md`;
    const markdown = await assets.fetch(new Request(url, request));
    if (markdown.ok) return markdown;
  }
  const asset = await assets.fetch(request);
  if (asset.status !== 404) return asset;
}
