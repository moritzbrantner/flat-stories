import { describe, expect, it } from "vitest";
import type { AnimationClip } from "./model";
import { getOnionSkinTimes } from "./onionSkin";

const clip = (overrides: Partial<AnimationClip> = {}): AnimationClip => ({
  id: "clip",
  name: "Clip",
  duration: 2,
  loop: false,
  tracks: [],
  ...overrides,
});

describe("onion skin timing", () => {
  it("samples neighboring frames inside a non-looping clip", () => {
    expect(getOnionSkinTimes(clip(), 1, 0.1)).toEqual({ previous: 0.9, next: 1.1 });
  });

  it("omits neighbors beyond non-looping clip boundaries", () => {
    expect(getOnionSkinTimes(clip(), 0, 0.1)).toEqual({ previous: null, next: 0.1 });
    expect(getOnionSkinTimes(clip(), 2, 0.1)).toEqual({ previous: 1.9, next: null });
  });

  it("wraps neighboring frames for looping clips", () => {
    const times = getOnionSkinTimes(clip({ loop: true }), 0.05, 0.1);
    expect(times.previous).toBeCloseTo(1.95);
    expect(times.next).toBeCloseTo(0.15);
  });

  it("does not produce duplicate current-frame samples", () => {
    expect(getOnionSkinTimes(clip({ loop: true }), 0.5, 2)).toEqual({ previous: null, next: null });
    expect(getOnionSkinTimes(clip(), 1, 0)).toEqual({ previous: null, next: null });
  });
});
