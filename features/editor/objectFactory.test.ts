import { describe, expect, it } from "vitest";
import { createObject, type CreatableObjectKind } from "./objectFactory";
import { pathToSvg } from "./vectorPath";

const kinds: CreatableObjectKind[] = ["rectangle", "circle", "path", "text"];

describe("createObject", () => {
  it("preserves caller ids and shared scene-node defaults", () => {
    for (const kind of kinds) {
      const object = createObject(kind, `id-${kind}`);
      expect(object).toMatchObject({
        id: `id-${kind}`,
        kind,
        name: `${kind[0].toUpperCase()}${kind.slice(1)}`,
        fill: "#2563eb",
        opacity: 1,
        visible: true,
        locked: false,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      });
    }
  });

  it("uses useful geometry and center pivots for new drawable objects", () => {
    expect(createObject("rectangle", "r")).toMatchObject({ kind: "rectangle", x: 250, y: 190, width: 160, height: 100, cornerRadius: 18, transform: { pivotX: 330, pivotY: 240 } });
    expect(createObject("circle", "c")).toMatchObject({ kind: "circle", cx: 400, cy: 260, radius: 70, transform: { pivotX: 400, pivotY: 260 } });
    const path = createObject("path", "p");
    expect(path.kind).toBe("path");
    if (path.kind !== "path") throw new Error("path not created");
    expect(pathToSvg(path.path)).toBe("M280 330 L400 180 L520 330 Z");
    expect(path.transform).toMatchObject({ pivotX: 400, pivotY: 255 });
    expect(createObject("text", "t")).toMatchObject({ kind: "text", x: 300, y: 260, value: "New text", fontSize: 36, transform: { pivotX: 385, pivotY: 245 } });
  });

  it("creates independent transforms on repeated calls", () => {
    const first = createObject("rectangle", "first");
    const second = createObject("rectangle", "second");
    expect(first.transform).not.toBe(second.transform);
    first.transform.x = 50;
    expect(second.transform.x).toBe(0);
  });
});
