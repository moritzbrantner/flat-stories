import { describe, expect, it } from "vitest";
import { createIdentityTransform, type CircleObject, type PathObject } from "../model";
import { CanvasStateCache } from "./canvasState";

function target() {
  return {
    fillStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    font: "10px sans-serif",
    globalAlpha: 1,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    lineWidth: 1,
    strokeStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    setLineDash: (_segments: number[]) => undefined,
  };
}

const base = {
  id: "shape",
  name: "Shape",
  transform: createIdentityTransform(),
  opacity: 1,
  visible: true,
  locked: false,
};

const fillOnlyCircle: CircleObject = {
  ...base,
  kind: "circle",
  cx: 0,
  cy: 0,
  radius: 12,
  fill: "#ff0000",
};

const strokedPath: PathObject = {
  ...base,
  id: "path",
  kind: "path",
  fill: "none",
  stroke: "#112233",
  strokeWidth: 3,
  strokeLinecap: "round",
  strokeLinejoin: "bevel",
  path: {
    closed: false,
    anchors: [
      { id: "a", point: { x: 0, y: 0 } },
      { id: "b", point: { x: 10, y: 10 } },
    ],
  },
};

describe("CanvasStateCache", () => {
  it("does not rewrite unchanged fill-only state or irrelevant stroke state", () => {
    const state = new CanvasStateCache(target());

    state.applyDrawable(fillOnlyCircle);
    state.applyDrawable(fillOnlyCircle);
    state.setGlobalAlpha(0.5);
    state.setGlobalAlpha(0.5);

    expect(state.writes.fillStyle).toBe(1);
    expect(state.writes.globalAlpha).toBe(1);
    expect(state.writes.strokeStyle).toBe(0);
    expect(state.writes.lineWidth).toBe(0);
    expect(state.writes.lineDash).toBe(0);
  });

  it("writes a stroked drawable once until selection changes the relevant state", () => {
    const state = new CanvasStateCache(target());

    state.applyDrawable(strokedPath);
    state.applyDrawable(strokedPath);
    expect(state.writes).toMatchObject({
      strokeStyle: 1,
      lineWidth: 1,
      lineCap: 1,
      lineJoin: 1,
      lineDash: 1,
    });

    state.applySelection("#abcdef", strokedPath);
    state.applyDrawable(strokedPath);

    expect(state.writes.strokeStyle).toBe(3);
    expect(state.writes.lineWidth).toBe(3);
    expect(state.writes.lineCap).toBe(3);
    expect(state.writes.lineJoin).toBe(3);
    expect(state.writes.lineDash).toBe(3);
  });
});
