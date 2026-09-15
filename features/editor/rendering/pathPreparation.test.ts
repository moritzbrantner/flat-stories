import { describe, expect, it } from "vitest";
import type { VectorPath } from "../model";
import { createPreparedPathCache } from "./pathPreparation";

const path: VectorPath = {
  closed: false,
  anchors: [
    { id: "a", point: { x: 0, y: 0 } },
    { id: "b", point: { x: 20, y: 10 } },
  ],
};

describe("prepared path cache", () => {
  it("prepares an immutable path identity only once", () => {
    let calls = 0;
    const cache = createPreparedPathCache((source) => {
      calls += 1;
      return source;
    });

    const first = cache.get(path);
    const second = cache.get(path);
    expect(first).toBe("M0 0 L20 10");
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it("prepares a new immutable path object even when its geometry is equal", () => {
    let calls = 0;
    const cache = createPreparedPathCache((source) => {
      calls += 1;
      return source;
    });
    const equalButNew = structuredClone(path);

    expect(cache.get(path)).toBe(cache.get(equalButNew));
    expect(calls).toBe(2);
  });
});
