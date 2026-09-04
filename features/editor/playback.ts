import type { AnimationClip } from "./model";

export type PlaybackAdvance = {
  time: number;
  finished: boolean;
};

export type PlaybackRange = {
  start: number;
  end: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizePlaybackRange(clip: AnimationClip, range: PlaybackRange): PlaybackRange {
  const start = clamp(range.start, 0, clip.duration);
  const end = clamp(range.end, 0, clip.duration);
  return start <= end ? { start, end } : { start: end, end: start };
}

export function advancePlaybackTime(
  clip: AnimationClip,
  currentTime: number,
  deltaSeconds: number,
  previewRange?: PlaybackRange,
): PlaybackAdvance {
  if (clip.duration <= 0) return { time: 0, finished: true };
  const delta = Math.max(0, deltaSeconds);

  if (previewRange) {
    const range = normalizePlaybackRange(clip, previewRange);
    const length = range.end - range.start;
    if (length <= 0) return { time: range.start, finished: true };
    const start = currentTime < range.start || currentTime >= range.end
      ? range.start
      : currentTime;
    const advanced = start - range.start + delta;
    return {
      time: range.start + (advanced % length),
      finished: false,
    };
  }

  const start = clamp(currentTime, 0, clip.duration);
  const advanced = start + delta;
  if (clip.loop) {
    return {
      time: ((advanced % clip.duration) + clip.duration) % clip.duration,
      finished: false,
    };
  }

  return {
    time: Math.min(clip.duration, advanced),
    finished: advanced >= clip.duration,
  };
}
