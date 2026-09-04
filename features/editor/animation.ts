import type {
  AnimationClip,
  BoneAnimationTrack,
  EditorDocument,
  Easing,
  NodeAnimationProperty,
  NodeAnimationTrack,
  NumberKeyframe,
} from "./model";
import { patchObject, patchObjectTransform } from "./sceneGraph";

const TIME_PRECISION = 1_000_000_000;

function ease(progress: number, easing: Easing | undefined) {
  switch (easing) {
    case "ease-in": return progress * progress;
    case "ease-out": return 1 - (1 - progress) * (1 - progress);
    case "ease-in-out": return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    default: return progress;
  }
}

export function sampleKeyframes(keyframes: readonly NumberKeyframe[], time: number): number | undefined {
  if (keyframes.length === 0) return undefined;
  const ordered = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= ordered[0].time) return ordered[0].value;
  const last = ordered.at(-1)!;
  if (time >= last.time) return last.value;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const start = ordered[index];
    const end = ordered[index + 1];
    if (time < start.time || time > end.time) continue;
    const duration = end.time - start.time;
    if (duration <= 0) return end.value;
    const progress = ease((time - start.time) / duration, start.easing);
    return start.value + (end.value - start.value) * progress;
  }
  return last.value;
}

function quantizeTime(time: number) {
  return Math.round(time * TIME_PRECISION) / TIME_PRECISION;
}

function normalizedClipTime(clip: AnimationClip, time: number) {
  if (clip.duration <= 0) return 0;
  if (!clip.loop) return quantizeTime(Math.max(0, Math.min(clip.duration, time)));
  const looped = ((time % clip.duration) + clip.duration) % clip.duration;
  return quantizeTime(looped);
}

function applyNodeTrack(document: EditorDocument, track: NodeAnimationTrack, value: number): EditorDocument {
  const property: NodeAnimationProperty = track.property;
  switch (property) {
    case "transform.x": return patchObjectTransform(document, track.target.id, { x: value });
    case "transform.y": return patchObjectTransform(document, track.target.id, { y: value });
    case "transform.rotation": return patchObjectTransform(document, track.target.id, { rotation: value });
    case "transform.scaleX": return patchObjectTransform(document, track.target.id, { scaleX: value });
    case "transform.scaleY": return patchObjectTransform(document, track.target.id, { scaleY: value });
    case "opacity": return patchObject(document, track.target.id, { opacity: value });
  }
}

function applyBoneTrack(document: EditorDocument, track: BoneAnimationTrack, value: number): EditorDocument {
  if (!document.rig) return document;
  let changed = false;
  const bones = document.rig.bones.map((bone) => {
    if (bone.id !== track.target.id || bone.rotation === value) return bone;
    changed = true;
    return { ...bone, rotation: value };
  });
  return changed ? { ...document, rig: { ...document.rig, bones } } : document;
}

export function sampleAnimation(document: EditorDocument, clipId: string | null, time: number): EditorDocument {
  if (!clipId) return document;
  const clip = document.animations.find((candidate) => candidate.id === clipId);
  if (!clip) return document;
  const sampleTime = normalizedClipTime(clip, time);
  let sampled = document;
  for (const track of clip.tracks) {
    const value = sampleKeyframes(track.keyframes, sampleTime);
    if (value === undefined) continue;
    if (track.target.kind === "node") sampled = applyNodeTrack(sampled, track as NodeAnimationTrack, value);
    else sampled = applyBoneTrack(sampled, track as BoneAnimationTrack, value);
  }
  return sampled;
}
