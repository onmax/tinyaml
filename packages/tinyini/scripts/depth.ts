// How deeply nested an object each ini-family entry and its original can
// write before they run out of stack, both writing nested objects
// recursively. Run with the default stack size; the two only need to be
// close.
// Usage: node scripts/depth.ts
import { engine, ENGINES } from "./shared.ts";

/** The deepest nesting encode handles, found by bisection. */
function deepest(encode: (value: unknown) => string): number {
  const nested = (depth: number) => {
    let value: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < depth; i++) value = { k: value };
    return value;
  };
  let [low, high] = [1, 1 << 16];
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    try {
      encode(nested(mid));
      low = mid;
    } catch {
      high = mid;
    }
  }
  return low;
}

for (const name of ENGINES) {
  const { label, theirs, ours } = await engine(name);
  console.log(
    `${label}: ${deepest((v) => theirs.encode(v))}, tinyini/${name}: ${deepest((v) => ours.encode(v))}`,
  );
}
