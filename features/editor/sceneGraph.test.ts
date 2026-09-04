import { describe, expect, it } from "vitest";
import { fixtureDocument } from "./fixture";
import { cloneObjectWithIds, duplicateSiblingObjects, findObject, flattenObjects, groupRootObjects, patchObjectTransform, reorderObject, siblingObjects, ungroupRootObject } from "./sceneGraph";

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

  it("duplicates sibling nodes with fresh recursive IDs next to their originals", () => {
    let counter = 0;
    const result = duplicateSiblingObjects(fixtureDocument, ["nova"], (kind) => `${kind}-copy-${++counter}`);
    expect(result.duplicatedIds).toEqual(["group-copy-1"]);
    expect(result.document.objects.map((node) => node.id).slice(2, 4)).toEqual(["nova", "group-copy-1"]);
    const copy = findObject(result.document.objects, "group-copy-1");
    expect(copy?.name).toBe("Nova Copy");
    if (copy?.kind !== "group") throw new Error("group copy missing");
    expect(copy.children[0].id).not.toBe("torso");
  });

  it("clones without sharing nested child arrays", () => {
    let counter = 0;
    const nova = findObject(fixtureDocument.objects, "nova")!;
    const copy = cloneObjectWithIds(nova, (kind) => `${kind}-${++counter}`);
    expect(copy).not.toBe(nova);
    if (copy.kind !== "group" || nova.kind !== "group") throw new Error("expected groups");
    expect(copy.children).not.toBe(nova.children);
  });

  it("reorders a nested layer within its structural siblings", () => {
    const before = siblingObjects(fixtureDocument, ["eye-left"])!;
    const index = before.findIndex((node) => node.id === "eye-left");
    const moved = reorderObject(fixtureDocument, "eye-left", "forward");
    const after = siblingObjects(moved, ["eye-left"])!;
    expect(after[index + 1].id).toBe("eye-left");
  });
});
