"use client";

import type { AnimationClip } from "./model";

type PlaybackControlsProps = {
  clip: AnimationClip | null;
  playing: boolean;
  onToggle: () => void;
  onRestart: () => void;
};

export function PlaybackControls({ clip, playing, onToggle, onRestart }: PlaybackControlsProps) {
  return <div className="timeline-playback" aria-label="Playback controls">
    <button type="button" disabled={!clip || clip.duration <= 0} aria-pressed={playing} onClick={onToggle}>
      {playing ? "Pause" : "Play"}
    </button>
    <button type="button" disabled={!clip} onClick={onRestart}>Restart</button>
    <span>{clip ? (clip.loop ? "Loop" : "Once") : "No clip"}</span>
  </div>;
}
