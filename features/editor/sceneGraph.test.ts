import { describe, expect, it } from "vitest";
import { fixtureDocument } from "./fixture";
import { findObject, flattenObjects, groupRootObjects, patchObjectTransform, ungroupRootObject } from "./sceneGraph";

describe("scene graph", () => {
  it("flattens nested character artwork without losing hierarchy depth", () => {
    const flattened = flattenObjects(fixtureDocument.objects);
    expect(flattened.find(({ node }) => node.id === "nova")?.depth).toBe(0);
    expect(flattened.find(({ node }) => node.id === "head-art")?.depth).toBe(1);
    expect(flattened.find(({ node }) => node.id === "eye-left")?.depth).toBe(2);
  });

  it("updates nested nodes immutably", () => {
    const next = patchObjectTransform(fixtureDocument, "eye-left", { x: 12 });
    expect(next).not.toBe(fixtureDocument);
    expect(findObject(next.objects, "eye-left")?.transform.x).toBe(12);
    expect(findObject(fixtureDocument.objects, "eye-left")?.transform.x).toBe(0);
  });

  it("groups and ungroups a contiguous root slice without order drift", () => {
    const grouped = groupRootObjects(fixtureDocument, ["ground", "nova"], "group-test");
    const group = grouped.objects.find((node) => node.id === "group-test");
    expect(group?.kind).toBe("group");
    if (group?.kind !== "group") throw new Error("group not created");
    expect(group.children.map((node) => node.id)).toEqual(["ground", "nova"]);
    const ungrouped = ungroupRootObject(grouped, "group-test");
    expect(ungrouped.objects.map((node) => node.id)).toEqual(fixtureDocument.objects.map((node) => node.id));
  });
});
