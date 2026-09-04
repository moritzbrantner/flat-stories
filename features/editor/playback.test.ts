import { describe, expect, it } from "vitest";
import type { AnimationClip } from "./model";
import { advancePlaybackTime } from "./playback";

const clip = (overrides: Partial<AnimationClip> = {}): AnimationClip => ({
  id: "clip",
  name: "Clip",
  duration: 2,
  loop: false,
  tracks: [],
  ...overrides,
});

describe("playback", () => {
  it("advances a non-looping clip and stops at its duration", () => {
    expect(advancePlaybackTime(clip(), 0.5, 0.25)).toEqual({ time: 0.75, finished: false });
    expect(advancePlaybackTime(clip(), 1.8, 0.5)).toEqual({ time: 2, finished: true });
  });

  it("wraps looping clips without marking playback finished", () => {
    const advanced = advancePlaybackTime(clip({ loop: true }), 1.8, 0.5);
    expect(advanced.time).toBeCloseTo(0.3);
    expect(advanced.finished).toBe(false);
  });

  it("ignores negative time deltas and handles empty clips", () => {
    expect(advancePlaybackTime(clip(), 0.5, -1)).toEqual({ time: 0.5, finished: false });
    expect(advancePlaybackTime(clip({ duration: 0 }), 10, 1)).toEqual({ time: 0, finished: true });
  });
});
