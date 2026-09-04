import { describe, expect, it } from "vitest";
import { alignObjects, canArrangeSelection, distributeObjects, objectBoundsInParent } from "./layout";
import { createObject } from "./objectFactory";
import type { EditorDocument } from "./model";

function documentWithRects(): EditorDocument {
  const first = createObject("rectangle", "a");
  const second = createObject("rectangle", "b");
  const third = createObject("rectangle", "c");
  first.transform.x = 0;
  second.transform.x = 300;
  third.transform.x = 1000;
  second.transform.y = 80;
  return { id: "layout", name: "Layout", width: 1400, height: 800, objects: [first, second, third], animations: [] };
}

describe("vector layout operations", () => {
  it("computes parent-space bounds through rotation and scale", () => {
    const rectangle = createObject("rectangle", "r");
    rectangle.transform.rotation = 90;
    const bounds = objectBoundsInParent(rectangle)!;
    expect(bounds.width).toBeCloseTo(100);
    expect(bounds.height).toBeCloseTo(160);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(330);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(240);
  });

  it("aligns sibling objects against the visual selection bounds", () => {
    const document = documentWithRects();
    const aligned = alignObjects(document, ["a", "b"], "left");
    expect(objectBoundsInParent(aligned.objects[0])?.x).toBe(objectBoundsInParent(aligned.objects[1])?.x);
  });

  it("distributes three siblings by visual center while keeping endpoints fixed", () => {
    const document = documentWithRects();
    const distributed = distributeObjects(document, ["a", "b", "c"], "horizontal");
    const centers = distributed.objects.map((node) => {
      const bounds = objectBoundsInParent(node)!;
      return bounds.x + bounds.width / 2;
    });
    expect(centers[1] - centers[0]).toBeCloseTo(centers[2] - centers[1]);
    expect(distributed.objects[0].transform.x).toBe(document.objects[0].transform.x);
    expect(distributed.objects[2].transform.x).toBe(document.objects[2].transform.x);
  });

  it("rejects selections from different structural parents", () => {
    const document = documentWithRects();
    const group = { ...createObject("rectangle", "placeholder"), id: "group" };
    document.objects = [{
      id: "container", name: "Container", kind: "group", transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 }, opacity: 1, visible: true, locked: false,
      children: [group],
    }, document.objects[0]];
    expect(canArrangeSelection(document, ["group", "a"])).toBe(false);
  });
});
