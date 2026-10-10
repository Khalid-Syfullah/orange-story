import { copy } from "@/content/copy";

/**
 * Dot paths into the copy deck (`src/content/copy.ts`), checked by the compiler: a beat's copy key
 * such as `"model.found"` or `"work.cards.0"` must exist, or the build fails.
 */

type Copy = typeof copy;

type Leaf = string | number | boolean | null | undefined | ((...args: never[]) => unknown);

/** Own keys of an object; index keys ("0", "1", ...) of an array or tuple. */
type Keys<T> = T extends readonly unknown[]
  ? number extends T["length"]
    ? `${number}`
    : Extract<keyof T, `${number}`>
  : Extract<keyof T, string>;

/** The node under key K (array indexes resolve to the element type). */
type Child<T, K extends string> = T extends readonly (infer E)[]
  ? K extends `${number}`
    ? E
    : never
  : K extends keyof T
    ? T[K]
    : never;

type Join<K extends string, P> = P extends string ? `${K}.${P}` : never;

/** Depth guard: paths are at most three segments deep (e.g. `questions.items.0`). */
type Prev = [never, 0, 1, 2];

export type PathOf<T, D extends number = 3> = [D] extends [never]
  ? never
  : T extends Leaf
    ? never
    : { [K in Keys<T>]: K | Join<K, PathOf<Child<T, K>, Prev[D]>> }[Keys<T>];

/** Every node in the copy deck, as a dot path. Array entries use their index ("work.cards.0"). */
export type CopyPath = PathOf<Copy>;

/** The copy node at a path. */
export type CopyAt<P extends string, T = Copy> = P extends `${infer K}.${infer Rest}`
  ? CopyAt<Rest, Child<T, K>>
  : Child<T, P>;

/** Reads the copy node at a dot path. */
export function copyAt<P extends CopyPath>(path: P): CopyAt<P> {
  let node: unknown = copy;
  for (const key of path.split(".")) {
    node = node == null ? undefined : (node as Record<string, unknown>)[key];
  }
  return node as CopyAt<P>;
}

/** Same as `copyAt`, for paths that are only known at runtime (validation). */
export function copyAtUnchecked(path: string): unknown {
  let node: unknown = copy;
  for (const key of path.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}
