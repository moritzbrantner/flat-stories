import type { AnimationClip } from "./model";

export type PlaybackAdvance = {
  time: number;
  finished: boolean;
};

export function advancePlaybackTime(
  clip: AnimationClip,
  currentTime: number,
  deltaSeconds: number,
): PlaybackAdvance {
  if (clip.duration <= 0) return { time: 0, finished: true };
  const start = Math.max(0, Math.min(clip.duration, currentTime));
  const delta = Math.max(0, deltaSeconds);
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
