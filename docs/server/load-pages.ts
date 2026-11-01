// The pages render in dev and while prerendering. The Worker serves every page from its prerendered files, so its
// bundle leaves the renderer and the Markdown out, and a path nothing prerendered finds nothing here.
export const loadPages = () =>
  import.meta.dev || import.meta.prerender ? import("./pages.ts") : undefined;
