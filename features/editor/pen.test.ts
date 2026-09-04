import { describe, expect, it } from "vitest";
import { symmetricPenHandles } from "./pen";

describe("pen authoring", () => {
  it("turns a drag into symmetric Bézier handles around the anchor", () => {
    expect(symmetricPenHandles({ x: 100, y: 80 }, { x: 125, y: 65 })).toEqual({
      inHandle: { x: 75, y: 95 },
      outHandle: { x: 125, y: 65 },
    });
  });

  it("keeps ordinary clicks as straight anchors", () => {
    expect(symmetricPenHandles({ x: 10, y: 10 }, { x: 11, y: 11 })).toBeNull();
  });
});
