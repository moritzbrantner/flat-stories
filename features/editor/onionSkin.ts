import type { AnimationClip } from "./model";

export type OnionSkinTimes = {
  previous: number | null;
  next: number | null;
};

function wrap(time: number, duration: number) {
  return ((time % duration) + duration) % duration;
}

export function getOnionSkinTimes(
  clip: AnimationClip,
  currentTime: number,
  offsetSeconds: number,
): OnionSkinTimes {
  if (clip.duration <= 0 || offsetSeconds <= 0) return { previous: null, next: null };
  const offset = Math.min(clip.duration, offsetSeconds);
  const current = clip.loop
    ? wrap(currentTime, clip.duration)
    : Math.max(0, Math.min(clip.duration, currentTime));

  if (clip.loop) {
    const previous = wrap(current - offset, clip.duration);
    const next = wrap(current + offset, clip.duration);
    return {
      previous: previous === current ? null : previous,
      next: next === current ? null : next,
    };
  }

  return {
    previous: current - offset >= 0 ? current - offset : null,
    next: current + offset <= clip.duration ? current + offset : null,
  };
}
