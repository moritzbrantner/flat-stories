import { describe, expect, it } from "vitest";
import { captureCharacterPose } from "./poses";
import { fixtureDocument } from "./fixture";
import { keyframePose, removeKeyframeAtTime, upsertNumberKeyframe } from "./animationAuthoring";

describe("animation authoring", () => {
  it("upserts keyframes deterministically by time", () => {
    const keyframes = upsertNumberKeyframe([
      { time: 1, value: 10 },
      { time: 0, value: 0 },
    ], { time: 1, value: 20, easing: "ease-out" });

    expect(keyframes).toEqual([
      { time: 0, value: 0 },
      { time: 1, value: 20, easing: "ease-out" },
    ]);
  });

  it("turns a named pose into stable bone and node tracks", () => {
    const pose = captureCharacterPose(fixtureDocument, "neutral", "Neutral");
    const clip = keyframePose({ id: "pose-test", name: "Pose test", duration: 2, loop: false, tracks: [] }, pose, 0.5);

    const headTrack = clip.tracks.find((track) => track.id === "bone:head:rotation");
    expect(headTrack?.keyframes).toEqual([{ time: 0.5, value: 0, easing: "ease-in-out" }]);

    const headX = clip.tracks.find((track) => track.id === "node:head-art:transform.x");
    expect(headX?.keyframes[0].time).toBe(0.5);
    expect(headX?.keyframes[0].value).toBe(34);
  });

  it("reuses the same track when keyframing the pose at another time", () => {
    const pose = captureCharacterPose(fixtureDocument, "neutral", "Neutral");
    const empty = { id: "pose-test", name: "Pose test", duration: 2, loop: false, tracks: [] };
    const once = keyframePose(empty, pose, 0);
    const twice = keyframePose(once, pose, 1);
    const headTracks = twice.tracks.filter((track) => track.id === "bone:head:rotation");

    expect(headTracks).toHaveLength(1);
    expect(headTracks[0].keyframes.map((keyframe) => keyframe.time)).toEqual([0, 1]);
  });

  it("removes empty tracks after deleting a timeline keyframe", () => {
    const pose = captureCharacterPose(fixtureDocument, "neutral", "Neutral");
    const clip = keyframePose({ id: "pose-test", name: "Pose test", duration: 2, loop: false, tracks: [] }, pose, 0.5);
    expect(removeKeyframeAtTime(clip, 0.5).tracks).toEqual([]);
  });
});
