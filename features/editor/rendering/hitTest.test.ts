import { describe, expect, it } from "vitest";
import { createIdentityTransform, type EditorDocument } from "../model";
import { buildRenderFrame } from "./renderFrame";
import { hitTestRenderFrame, inverseTransformPoint } from "./hitTest";

function base(id: string) {
  return {
    id,
    name: id,
    transform: createIdentityTransform(),
    opacity: 1,
    visible: true,
    locked: false,
  };
}

const document: EditorDocument = {
  id: "hit-test",
  name: "Hit test",
  width: 400,
  height: 300,
  animations: [],
  objects: [
    {
      ...base("back"),
      kind: "rectangle",
      x: 10,
      y: 10,
      width: 120,
      height: 80,
      cornerRadius: 12,
      fill: "#111111",
    },
    {
      ...base("front"),
      transform: { ...createIdentityTransform(), x: 40, y: 20 },
      kind: "circle",
      cx: 40,
      cy: 40,
      radius: 35,
      fill: "#222222",
    },
    {
      ...base("nested"),
      transform: { ...createIdentityTransform(), x: 200, y: 100, rotation: 90 },
      kind: "group",
      children: [{
        ...base("child"),
        kind: "rectangle",
        x: 0,
        y: 0,
        width: 50,
        height: 20,
        cornerRadius: 0,
        fill: "#333333",
      }],
    },
  ],
};

describe("renderer hit testing", () => {
  it("returns the topmost painted drawable", () => {
    const frame = buildRenderFrame(document);
    expect(hitTestRenderFrame(frame, { x: 80, y: 60 })).toBe("front");
    expect(hitTestRenderFrame(frame, { x: 20, y: 20 })).toBe("back");
    expect(hitTestRenderFrame(frame, { x: 390, y: 290 })).toBeNull();
  });

  it("uses the same hierarchical transform frame as rendering", () => {
    const frame = buildRenderFrame(document);
    expect(hitTestRenderFrame(frame, { x: 190, y: 125 })).toBe("child");
    expect(hitTestRenderFrame(frame, { x: 225, y: 125 })).toBeNull();
  });

  it("inverts affine transforms deterministically", () => {
    const point = inverseTransformPoint([0, 1, -1, 0, 200, 100], { x: 190, y: 125 });
    expect(point?.x).toBeCloseTo(25);
    expect(point?.y).toBeCloseTo(10);
    expect(inverseTransformPoint([0, 0, 0, 0, 0, 0], { x: 1, y: 1 })).toBeNull();
  });
});
