import { describe, expect, it } from "vitest";
import { fixtureDocument } from "./fixture";
import { projectFlatStoriesLayers, reorderFlatStoriesSiblings } from "./layerAdapter";
import { flattenObjects } from "./sceneGraph";

describe("Flat Stories layer adapter", () => {
  it("projects the canonical nested scene graph without changing its hierarchy", () => {
    const projected = projectFlatStoriesLayers(fixtureDocument);
    const canonical = flattenObjects(fixtureDocument.objects);

    expect(projected.layers.map((layer) => layer.id)).toEqual(
      canonical.map(({ node }) => node.id),
    );

    for (const [index, { node, depth, parentId }] of canonical.entries()) {
      const layer = projected.layers[index];
      expect(layer.label).toBe(node.name);
      expect(layer.visible).toBe(node.visible);
      expect(layer.locked).toBe(node.locked);
      expect(layer.opacity).toBe(node.opacity);
      expect(layer.data).toEqual({
        depth,
        parentId,
        hasChildren: node.kind === "group" && node.children.length > 0,
      });
    }
  });

  it("delegates sibling ordering while preserving the original scene objects", () => {
    const siblings = fixtureDocument.objects;
    const first = siblings[0];
    const reordered = reorderFlatStoriesSiblings(
      siblings,
      first.id,
      siblings.length - 1,
    );

    expect(reordered.map((object) => object.id)).toEqual([
      ...siblings.slice(1).map((object) => object.id),
      first.id,
    ]);
    expect(reordered.at(-1)).toBe(first);
    for (const object of siblings) {
      expect(reordered).toContain(object);
    }
  });
});
