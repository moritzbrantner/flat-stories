import type {
  AnimationClip,
  AnimationTrack,
  CharacterPose,
  Easing,
  NodeAnimationProperty,
  NumberKeyframe,
  Transform,
} from "./model";

const NODE_PROPERTIES: readonly [NodeAnimationProperty, keyof Transform][] = [
  ["transform.x", "x"],
  ["transform.y", "y"],
  ["transform.rotation", "rotation"],
  ["transform.scaleX", "scaleX"],
  ["transform.scaleY", "scaleY"],
];

export function upsertNumberKeyframe(
  keyframes: readonly NumberKeyframe[],
  keyframe: NumberKeyframe,
): NumberKeyframe[] {
  const withoutSameTime = keyframes.filter((candidate) => candidate.time !== keyframe.time);
  return [...withoutSameTime, keyframe].sort((left, right) => left.time - right.time);
}

function trackId(targetKind: "node" | "bone", targetId: string, property: string) {
  return `${targetKind}:${targetId}:${property}`;
}

function upsertTrackKeyframe(
  tracks: readonly AnimationTrack[],
  target: AnimationTrack["target"],
  property: AnimationTrack["property"],
  keyframe: NumberKeyframe,
): AnimationTrack[] {
  const id = trackId(target.kind, target.id, property);
  const existing = tracks.find((track) => track.id === id);
  if (!existing) {
    const next = { id, target, property, keyframes: [keyframe] } as AnimationTrack;
    return [...tracks, next];
  }
  return tracks.map((track) => track.id === id
    ? { ...track, keyframes: upsertNumberKeyframe(track.keyframes, keyframe) } as AnimationTrack
    : track);
}

export function keyframePose(
  clip: AnimationClip,
  pose: CharacterPose,
  time: number,
  easing: Easing = "ease-in-out",
): AnimationClip {
  let tracks = clip.tracks;
  const keyframe = (value: number): NumberKeyframe => ({ time, value, easing });

  for (const [boneId, rotation] of Object.entries(pose.boneRotations)) {
    tracks = upsertTrackKeyframe(tracks, { kind: "bone", id: boneId }, "rotation", keyframe(rotation));
  }

  for (const [nodeId, transform] of Object.entries(pose.nodeTransforms)) {
    for (const [property, transformKey] of NODE_PROPERTIES) {
      tracks = upsertTrackKeyframe(tracks, { kind: "node", id: nodeId }, property, keyframe(transform[transformKey]));
    }
  }

  return { ...clip, tracks };
}

export function removeKeyframeAtTime(clip: AnimationClip, time: number): AnimationClip {
  const tracks = clip.tracks
    .map((track) => ({ ...track, keyframes: track.keyframes.filter((keyframe) => keyframe.time !== time) } as AnimationTrack))
    .filter((track) => track.keyframes.length > 0);
  return { ...clip, tracks };
}
