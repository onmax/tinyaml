// Type-level checks for the usage files: `same<typeof x, unknown>(true)`
// fails to compile unless the two types are identical, so a return type that
// turns `unknown` into `any` shows up as an error.
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const same = <A, B>(ok: Equal<A, B>): boolean => ok;
