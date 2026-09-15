import type { VectorPath } from "../model";
import { pathToSvg } from "../vectorPath";

export type PreparedPathCache<T> = {
  get(path: VectorPath): T;
};

export function createPreparedPathCache<T>(prepare: (source: string) => T): PreparedPathCache<T> {
  const cache = new WeakMap<VectorPath, T>();
  return {
    get(path) {
      if (cache.has(path)) return cache.get(path)!;
      const prepared = prepare(pathToSvg(path));
      cache.set(path, prepared);
      return prepared;
    },
  };
}
