import { describe, expect, it } from "vitest";
import { captureCharacterPose } from "./poses";
import { fixtureDocument } from "./fixture";
import {
  keyframePose,
  keyframeProperty,
  removeKeyframeAtTime,
  removeTrackKeyframe,
  updateTrackKeyframe,
  upsertNumberKeyframe,
} from "./animationAuthoring";

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

  it("keys one node property into a stable track", () => {
    const clip = keyframeProperty(
      { id: "single", name: "Single", duration: 2, loop: false, tracks: [] },
      { kind: "node", id: "caption" },
      "opacity",
      0.4,
      0.5,
      "linear",
    );

    expect(clip.tracks).toEqual([{
      id: "node:caption:opacity",
      target: { kind: "node", id: "caption" },
      property: "opacity",
      keyframes: [{ time: 0.5, value: 0.4, easing: "linear" }],
    }]);
  });

  it("reuses an existing logical track and preserves its authored ID", () => {
    const clip = keyframeProperty(
      fixtureDocument.animations[0],
      { kind: "bone", id: "head" },
      "rotation",
      12,
      0.25,
    );
    const matching = clip.tracks.filter((track) => track.target.kind === "bone" && track.target.id === "head" && track.property === "rotation");

    expect(matching).toHaveLength(1);
    expect(matching[0].id).toBe("head-sway");
    expect(matching[0].keyframes.find((keyframe) => keyframe.time === 0.25)).toEqual({ time: 0.25, value: 12, easing: "ease-in-out" });
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

  it("updates and moves one keyframe while preserving deterministic ordering", () => {
    const clip = fixtureDocument.animations[0];
    const updated = updateTrackKeyframe(clip, "head-sway", 0.5, { time: 0.75, value: -12, easing: "ease-out" });
    const track = updated.tracks.find((candidate) => candidate.id === "head-sway")!;

    expect(track.keyframes.map((keyframe) => keyframe.time)).toEqual([0, 0.75, 1, 1.5, 2]);
    expect(track.keyframes.find((keyframe) => keyframe.time === 0.75)).toEqual({ time: 0.75, value: -12, easing: "ease-out" });
  });

  it("clamps moved keyframes to the clip range and replaces collisions", () => {
    const clip = fixtureDocument.animations[0];
    const updated = updateTrackKeyframe(clip, "head-sway", 0.5, { time: 5, value: 99 });
    const track = updated.tracks.find((candidate) => candidate.id === "head-sway")!;

    expect(track.keyframes.at(-1)).toMatchObject({ time: 2, value: 99 });
    expect(track.keyframes.filter((keyframe) => keyframe.time === 2)).toHaveLength(1);
  });

  it("removes a single keyframe and drops its track when it becomes empty", () => {
    const clip = { id: "one", name: "One", duration: 1, loop: false, tracks: [
      { id: "bone:head:rotation", target: { kind: "bone" as const, id: "head" }, property: "rotation" as const, keyframes: [{ time: 0, value: 0 }] },
    ] };
    expect(removeTrackKeyframe(clip, "bone:head:rotation", 0).tracks).toEqual([]);
  });

  it("removes empty tracks after deleting a timeline keyframe", () => {
    const pose = captureCharacterPose(fixtureDocument, "neutral", "Neutral");
    const clip = keyframePose({ id: "pose-test", name: "Pose test", duration: 2, loop: false, tracks: [] }, pose, 0.5);
    expect(removeKeyframeAtTime(clip, 0.5).tracks).toEqual([]);
  });
});
