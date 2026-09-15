import { describe, expect, it } from "vitest";
import { fixtureDocument } from "../fixture";
import { sampleAnimation } from "../animation";
import { buildRenderComposition } from "./renderComposition";

const clip = fixtureDocument.animations[0];

describe("render composition", () => {
  it("preserves explicit onion-to-current layer order and opacity", () => {
    const previous = sampleAnimation(fixtureDocument, clip.id, 0.4);
    const next = sampleAnimation(fixtureDocument, clip.id, 0.6);
    const current = sampleAnimation(fixtureDocument, clip.id, 0.5);
    const composition = buildRenderComposition([
      { kind: "onion-previous", document: previous, opacity: 0.18, hitTestable: false },
      { kind: "onion-next", document: next, opacity: 0.12, hitTestable: false },
      { kind: "current", document: current, opacity: 1, hitTestable: true },
    ]);

    expect(composition.layers.map((layer) => layer.kind)).toEqual(["onion-previous", "onion-next", "current"]);
    expect(composition.layers.map((layer) => layer.opacity)).toEqual([0.18, 0.12, 1]);
    expect(composition.hitTestFrame).toBe(composition.layers[2].frame);
  });

  it("rejects dimension drift between composed frames", () => {
    const changed = { ...fixtureDocument, width: fixtureDocument.width + 1 };
    expect(() => buildRenderComposition([
      { kind: "current", document: fixtureDocument, opacity: 1, hitTestable: true },
      { kind: "onion-next", document: changed, opacity: 0.12, hitTestable: false },
    ])).toThrow("same dimensions");
  });

  it("requires a hit-testable frame", () => {
    expect(() => buildRenderComposition([
      { kind: "onion-previous", document: fixtureDocument, opacity: 0.18, hitTestable: false },
    ])).toThrow("hit-testable");
  });
});
