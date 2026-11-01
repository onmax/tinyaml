// Objects `root` reaches more than once, depth first, named `ref_N` in the
// order their second visit happens, as js-yaml 4 numbers its anchors.
export function findRefs(root: unknown): Map<object, string> {
  const seen = new Set<object>();
  const refs = new Map<object, string>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    if (!seen.has(value)) {
      seen.add(value);
      if (Array.isArray(value)) for (let i = 0, n = value.length; i < n; i++) visit(value[i]);
      else for (const key of Object.keys(value)) visit((value as any)[key]);
    } else if (!refs.has(value)) refs.set(value, `ref_${refs.size}`);
  };
  visit(root);
  return refs;
}
