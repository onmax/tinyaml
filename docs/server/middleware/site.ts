import { defineEventHandler, getRequestURL } from "nuxt/server";
import { fromAssets, redirectTarget } from "../utils/site.ts";

// Nitro's Cloudflare entry hangs the Worker's bindings on the request.
type WorkerRequest = Request & {
  runtime?: { cloudflare?: { env: { ASSETS?: Parameters<typeof fromAssets>[1] } } };
};

// The Worker runs before the static assets (`run_worker_first` in nuxt.config.ts), so the old host redirects first.
// Anonymous requests still end at a prerendered file; only the paths with none reach Nitro's routes.
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const target = redirectTarget(url);
  if (target) return Response.redirect(target, 301);
  const request = event.req as WorkerRequest;
  const assets = request.runtime?.cloudflare?.env.ASSETS;
  if (!assets) return;
  return fromAssets(request, assets);
});
