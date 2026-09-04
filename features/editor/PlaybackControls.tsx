"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationClip } from "./model";
import { advancePlaybackTime } from "./playback";

type PlaybackControlsProps = {
  clip: AnimationClip | null;
  currentTime: number;
  onTimeChange: (time: number) => void;
};

export function PlaybackControls({ clip, currentTime, onTimeChange }: PlaybackControlsProps) {
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(currentTime);

  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!playing || !clip) return;
    let frameId = 0;
    let previousTimestamp: number | null = null;

    const tick = (timestamp: number) => {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp;
        frameId = requestAnimationFrame(tick);
        return;
      }

      const deltaSeconds = (timestamp - previousTimestamp) / 1000;
      previousTimestamp = timestamp;
      const advanced = advancePlaybackTime(clip, timeRef.current, deltaSeconds);
      timeRef.current = advanced.time;
      onTimeChange(advanced.time);

      if (advanced.finished) {
        setPlaying(false);
        return;
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [clip, onTimeChange, playing]);

  function togglePlayback() {
    if (!clip || clip.duration <= 0) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (!clip.loop && currentTime >= clip.duration) {
      timeRef.current = 0;
      onTimeChange(0);
    }
    setPlaying(true);
  }

  function restart() {
    setPlaying(false);
    timeRef.current = 0;
    onTimeChange(0);
  }

  return <div className="timeline-playback" aria-label="Playback controls">
    <button type="button" disabled={!clip || clip.duration <= 0} aria-pressed={playing} onClick={togglePlayback}>
      {playing ? "Pause" : "Play"}
    </button>
    <button type="button" disabled={!clip} onClick={restart}>Restart</button>
    <span>{clip ? (clip.loop ? "Loop" : "Once") : "No clip"}</span>
  </div>;
}
