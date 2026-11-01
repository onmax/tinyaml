// Objects `root` reaches more than once, depth first, named `ref_N` in the
// order their second visit happens, as js-yaml 4 numbers its anchors.
export function findRefs(root: unknown): Map<object, string> {
  const seen = new Set<object>();
  const refs = new Map<object, string>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    if (!seen.has(value)) {
      seen.add(value);
      (Array.isArray(value) ? value : Object.values(value)).forEach(visit);
    } else if (!refs.has(value)) refs.set(value, `ref_${refs.size}`);
  };
  visit(root);
  return refs;
}
