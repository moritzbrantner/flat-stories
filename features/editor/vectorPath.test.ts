import { describe, expect, it } from "vitest";
import type { VectorPath } from "./model";
import { mirrorPath, movePathAnchor, pathBounds, pathToSvg, togglePathHandles, updatePathHandle } from "./vectorPath";

const curve: VectorPath = {
  closed: false,
  anchors: [
    { id: "a", point: { x: 0, y: 0 }, outHandle: { x: 0, y: 100 } },
    { id: "b", point: { x: 100, y: 0 }, inHandle: { x: 100, y: 100 } },
  ],
};

describe("vector paths", () => {
  it("serializes line and cubic segments into deterministic SVG path data", () => {
    expect(pathToSvg(curve)).toBe("M0 0 C0 100 100 100 100 0");
    expect(pathToSvg({ closed: true, anchors: [
      { id: "a", point: { x: 0, y: 0 } },
      { id: "b", point: { x: 10, y: 0 } },
      { id: "c", point: { x: 10, y: 10 } },
    ] })).toBe("M0 0 L10 0 L10 10 Z");
  });

  it("computes cubic extrema instead of using control-point bounds", () => {
    expect(pathBounds(curve)).toEqual({ x: 0, y: 0, width: 100, height: 75 });
  });

  it("moves anchors with their handles and can edit a handle independently", () => {
    const moved = movePathAnchor(curve, "a", { x: 10, y: 20 });
    expect(moved.anchors[0]).toMatchObject({ point: { x: 10, y: 20 }, outHandle: { x: 10, y: 120 } });
    const handled = updatePathHandle(moved, "a", "outHandle", { x: 40, y: 80 });
    expect(handled.anchors[0].point).toEqual({ x: 10, y: 20 });
    expect(handled.anchors[0].outHandle).toEqual({ x: 40, y: 80 });
  });

  it("toggles a straight anchor into symmetric cubic handles", () => {
    const straight: VectorPath = { closed: false, anchors: [{ id: "a", point: { x: 20, y: 30 } }] };
    const curved = togglePathHandles(straight, "a", 10);
    expect(curved.anchors[0]).toMatchObject({ inHandle: { x: 10, y: 30 }, outHandle: { x: 30, y: 30 } });
    expect(togglePathHandles(curved, "a").anchors[0]).toEqual({ id: "a", point: { x: 20, y: 30 }, inHandle: undefined, outHandle: undefined });
  });

  it("mirrors anchors and handles around the path bounds", () => {
    const mirrored = mirrorPath(curve, "horizontal");
    expect(mirrored.anchors[0]).toMatchObject({ point: { x: 100, y: 0 }, outHandle: { x: 100, y: 100 } });
    expect(mirrored.anchors[1]).toMatchObject({ point: { x: 0, y: 0 }, inHandle: { x: 0, y: 100 } });
  });
});
