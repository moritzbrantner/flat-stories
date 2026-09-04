import { describe, expect, it } from "vitest";
import { fixtureDocument } from "./fixture";
import { sampleAnimation, sampleKeyframes } from "./animation";

describe("animation sampling", () => {
  it("interpolates deterministic numeric keyframes", () => {
    expect(sampleKeyframes([{ time: 0, value: 0 }, { time: 2, value: 10 }], 1)).toBe(5);
  });

  it("samples bone tracks without mutating the authored document", () => {
    const sampled = sampleAnimation(fixtureDocument, "hello", 0.55);
    expect(sampled.rig?.bones.find((bone) => bone.id === "upper-arm-right")?.rotation).toBe(30);
    expect(fixtureDocument.rig?.bones.find((bone) => bone.id === "upper-arm-right")?.rotation).toBe(65);
  });

  it("loops clips deterministically", () => {
    const first = sampleAnimation(fixtureDocument, "hello", 0.55);
    const looped = sampleAnimation(fixtureDocument, "hello", 2.55);
    expect(looped.rig?.bones).toEqual(first.rig?.bones);
  });
});
