import { describe, expect, it } from "vitest";
import { fixtureDocument } from "./fixture";
import {
  applyCharacterPose,
  applyExpression,
  captureCharacterPose,
  captureExpression,
  upsertExpression,
  upsertPose,
} from "./poses";
import { findObject, patchObject, patchObjectTransform } from "./sceneGraph";

describe("character poses", () => {
  it("captures and reapplies bone rotations and node transforms", () => {
    const pose = captureCharacterPose(fixtureDocument, "neutral", "Neutral");
    const edited = patchObjectTransform({
      ...fixtureDocument,
      rig: fixtureDocument.rig ? {
        ...fixtureDocument.rig,
        bones: fixtureDocument.rig.bones.map((bone) => bone.id === "head" ? { ...bone, rotation: 24 } : bone),
      } : undefined,
    }, "head-art", { x: 77, rotation: 12 });

    const restored = applyCharacterPose(edited, pose);
    expect(restored.rig?.bones.find((bone) => bone.id === "head")?.rotation).toBe(0);
    expect(findObject(restored.objects, "head-art")?.transform).toEqual(
      findObject(fixtureDocument.objects, "head-art")?.transform,
    );
  });

  it("ignores pose entries whose target no longer exists", () => {
    const pose = captureCharacterPose(fixtureDocument, "neutral", "Neutral");
    pose.nodeTransforms.missing = { x: 1, y: 2, rotation: 3, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 };
    expect(() => applyCharacterPose(fixtureDocument, pose)).not.toThrow();
  });

  it("upserts poses by stable id", () => {
    const first = captureCharacterPose(fixtureDocument, "neutral", "Neutral");
    const second = { ...first, name: "Neutral updated" };
    const once = upsertPose(fixtureDocument, first);
    const twice = upsertPose(once, second);
    expect(twice.poses).toHaveLength(1);
    expect(twice.poses?.[0].name).toBe("Neutral updated");
  });
});

describe("character expressions", () => {
  it("captures only requested nodes and reapplies their visual state", () => {
    const expression = captureExpression(fixtureDocument, "eyes-open", "Eyes open", ["eye-left", "eye-right"]);
    expect(Object.keys(expression.nodes).sort()).toEqual(["eye-left", "eye-right"]);

    let edited = patchObject(fixtureDocument, "eye-left", { visible: false, opacity: 0.2 });
    edited = patchObjectTransform(edited, "eye-right", { scaleY: 0.1 });
    const restored = applyExpression(edited, expression);

    expect(findObject(restored.objects, "eye-left")?.visible).toBe(true);
    expect(findObject(restored.objects, "eye-left")?.opacity).toBe(1);
    expect(findObject(restored.objects, "eye-right")?.transform.scaleY).toBe(1);
  });

  it("upserts expressions by stable id", () => {
    const first = captureExpression(fixtureDocument, "smile", "Smile", ["smile"]);
    const second = { ...first, name: "Happy smile" };
    const once = upsertExpression(fixtureDocument, first);
    const twice = upsertExpression(once, second);
    expect(twice.expressions).toHaveLength(1);
    expect(twice.expressions?.[0].name).toBe("Happy smile");
  });
});
