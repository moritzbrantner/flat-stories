import { describe, expect, it } from "vitest";
import { createIdentityTransform } from "./model";
import { createObject, type CreatableObjectKind } from "./objectFactory";

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
        transform: createIdentityTransform(),
        opacity: 1,
        visible: true,
        locked: false,
      });
    }
  });

  it("returns useful local geometry defaults for each kind", () => {
    expect(createObject("rectangle", "r")).toMatchObject({ kind: "rectangle", x: 250, y: 190, width: 160, height: 100, cornerRadius: 18 });
    expect(createObject("circle", "c")).toMatchObject({ kind: "circle", cx: 400, cy: 260, radius: 70 });
    expect(createObject("path", "p")).toMatchObject({ kind: "path", d: "M280 330 L400 180 L520 330 Z" });
    expect(createObject("text", "t")).toMatchObject({ kind: "text", x: 300, y: 260, value: "New text", fontSize: 36 });
  });

  it("creates independent transforms on repeated calls", () => {
    const first = createObject("rectangle", "first");
    const second = createObject("rectangle", "second");
    expect(first.transform).not.toBe(second.transform);
    first.transform.x = 50;
    expect(second.transform.x).toBe(0);
  });
});
