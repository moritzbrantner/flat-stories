import { describe, expect, it } from "vitest";

import { createObject, type CreatableObjectKind } from "./objectFactory";

const kinds: CreatableObjectKind[] = ["rectangle", "circle", "path", "text"];

describe("createObject", () => {
  it("preserves caller ids and shared defaults for every creatable kind", () => {
    for (const kind of kinds) {
      const object = createObject(kind, `id-${kind}`);
      expect(object).toMatchObject({
        id: `id-${kind}`,
        kind,
        name: `${kind[0].toUpperCase()}${kind.slice(1)}`,
        fill: "#2563eb",
      });
    }
  });

  it("returns the expected geometry defaults for each kind", () => {
    expect(createObject("rectangle", "r")).toEqual({
      id: "r",
      name: "Rectangle",
      fill: "#2563eb",
      kind: "rectangle",
      x: 250,
      y: 190,
      width: 160,
      height: 100,
    });
    expect(createObject("circle", "c")).toEqual({
      id: "c",
      name: "Circle",
      fill: "#2563eb",
      kind: "circle",
      cx: 400,
      cy: 260,
      radius: 70,
    });
    expect(createObject("path", "p")).toEqual({
      id: "p",
      name: "Path",
      fill: "#2563eb",
      kind: "path",
      d: "M280 330 L400 180 L520 330 Z",
    });
    expect(createObject("text", "t")).toEqual({
      id: "t",
      name: "Text",
      fill: "#2563eb",
      kind: "text",
      x: 300,
      y: 260,
      value: "New text",
      fontSize: 36,
    });
  });

  it("creates independent objects on repeated calls", () => {
    const first = createObject("rectangle", "first");
    const second = createObject("rectangle", "second");

    expect(first).not.toBe(second);
    expect(first.id).toBe("first");
    expect(second.id).toBe("second");
  });
});
