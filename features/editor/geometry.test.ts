import { describe, expect, it } from "vitest";
import { createObject } from "./objectFactory";
import { drawableBounds, resizeBoundsFromHandle, resizeDrawable } from "./geometry";
import { pathBounds } from "./vectorPath";

describe("drawable geometry", () => {
  it("computes stable local bounds for primitive objects", () => {
    expect(drawableBounds(createObject("rectangle", "r"))).toEqual({ x: 250, y: 190, width: 160, height: 100 });
    expect(drawableBounds(createObject("circle", "c"))).toEqual({ x: 330, y: 190, width: 140, height: 140 });
  });

  it("turns corner-handle positions into positive resize bounds", () => {
    const start = { x: 10, y: 20, width: 100, height: 80 };
    expect(resizeBoundsFromHandle(start, "se", { x: 160, y: 140 })).toEqual({ x: 10, y: 20, width: 150, height: 120 });
    expect(resizeBoundsFromHandle(start, "nw", { x: 109.9, y: 99.9 })).toEqual({ x: 109, y: 99, width: 1, height: 1 });
  });

  it("resizes vector paths by mapping anchors and handles through their bounds", () => {
    const path = createObject("path", "p");
    if (path.kind !== "path") throw new Error("path not created");
    const resized = resizeDrawable(path, { x: 0, y: 0, width: 120, height: 300 });
    if (resized.kind !== "path") throw new Error("path not resized");
    expect(pathBounds(resized.path)).toEqual({ x: 0, y: 0, width: 120, height: 300 });
  });
});
