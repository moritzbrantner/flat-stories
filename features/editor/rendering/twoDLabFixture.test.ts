import { describe, expect, it } from "vitest";

import { create2dLabNovaFixture } from "../../../scripts/2d-lab-nova-fixture";

describe("2d-lab Nova fixture exporter", () => {
  it("exports the product-owned one-copy Nova render frame", () => {
    const snapshot = create2dLabNovaFixture();

    expect(snapshot).toMatchObject({
      background: "#ffffff",
      height: 160,
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
    expect(serialized).not.toContain("animations");
    expect(serialized).not.toContain("rig");
    expect(serialized).not.toContain("children");
  });
});
