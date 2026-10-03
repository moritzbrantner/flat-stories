import { describe, expect, it } from "vitest";

import { create2dLabNovaFixture } from "../../../scripts/2d-lab-nova-fixture";
import { fixtureDocument } from "../fixture";
import type { EditorObject } from "../model";

const sourceRevision = "0123456789abcdef0123456789abcdef01234567";

describe("2d-lab Nova fixture exporter", () => {
  it("exports the product-owned one-copy Nova render frame", () => {
    const snapshot = create2dLabNovaFixture({ sourceRevision });

    expect(snapshot).toMatchObject({
      background: "#ffffff",
      height: 160,
      provenance: { sourceRevision },
      schema: "flat-stories-2d-lab-render-frame/v1",
      width: 180,
    });
    expect(snapshot.items).toHaveLength(16);

    const counts = snapshot.items.reduce<Record<string, number>>((result, item) => {
      result[item.shape.kind] = (result[item.shape.kind] ?? 0) + 1;
      return result;
    }, {});

    expect(counts).toEqual({
      circle: 5,
      rectangle: 8,
      "svg-path": 3,
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('"animations":');
    expect(serialized).not.toContain('"rig":');
    expect(serialized).not.toContain('"children":');
  });

  it("requires an exact source revision", () => {
    expect(() => create2dLabNovaFixture({ sourceRevision: "HEAD" })).toThrow(/source revision/);
  });

  it("rejects non-finite path coordinates instead of serializing them", () => {
    const document = structuredClone(fixtureDocument);
    const poison = (objects: EditorObject[]) => {
      for (const object of objects) {
        if (object.kind === "group") poison(object.children);
        if (object.kind === "path") object.path.anchors[0].point.x = Number.NaN;
      }
    };
    poison(document.objects);

    expect(() => create2dLabNovaFixture({ sourceRevision, document })).toThrow(/non-finite anchors\[0\]\.point\.x/);
  });
});
