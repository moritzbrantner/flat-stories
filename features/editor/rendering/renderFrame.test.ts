import { describe, expect, it } from "vitest";
import { fixtureDocument } from "../fixture";
import { buildRenderFrame, encodeRenderScene } from "./renderFrame";
import { referenceTransformKernel, TRANSFORM_INPUT_STRIDE } from "./transformKernel";

describe("render frame", () => {
  it("encodes parents before children and preserves the SVG drawable order", () => {
    const encoded = encodeRenderScene(fixtureDocument);
    encoded.nodes.forEach((_, index) => {
      const parent = encoded.input[index * TRANSFORM_INPUT_STRIDE];
      expect(parent === -1 || parent < index).toBe(true);
    });

    const frame = buildRenderFrame(fixtureDocument, referenceTransformKernel);
    expect(frame.items.map((item) => item.id)).toEqual([
      "background",
      "ground",
      "torso",
      "upper-arm-left-art",
      "forearm-left-art",
      "hand-left",
      "upper-arm-right-art",
      "forearm-right-art",
      "hand-right",
      "thigh-left-art",
      "shin-left-art",
      "thigh-right-art",
      "shin-right-art",
      "face",
      "hair",
      "eye-left",
      "eye-right",
      "smile",
      "caption",
    ]);
  });

  it("composes inherited opacity through groups", () => {
    const document = structuredClone(fixtureDocument);
    const character = document.objects.find((object) => object.id === "nova");
    if (!character || character.kind !== "group") throw new Error("Fixture character group is missing.");
    character.opacity = 0.5;
    const head = character.children.find((object) => object.id === "head-art");
    if (!head || head.kind !== "group") throw new Error("Fixture head group is missing.");
    head.opacity = 0.5;

    const frame = buildRenderFrame(document, referenceTransformKernel);
    expect(frame.items.find((item) => item.id === "eye-left")?.opacity).toBeCloseTo(0.25, 5);
  });
});
