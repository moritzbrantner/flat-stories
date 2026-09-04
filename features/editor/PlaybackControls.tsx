"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationClip } from "./model";
import { advancePlaybackTime, type PlaybackRange } from "./playback";

type PlaybackControlsProps = {
  clip: AnimationClip | null;
  currentTime: number;
  onTimeChange: (time: number) => void;
};

export function PlaybackControls({ clip, currentTime, onTimeChange }: PlaybackControlsProps) {
  const [playing, setPlaying] = useState(false);
  const [previewRangeEnabled, setPreviewRangeEnabled] = useState(false);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(clip?.duration ?? 0);
  const timeRef = useRef(currentTime);
  const validPreviewRange = !previewRangeEnabled || rangeEnd > rangeStart;

  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!playing || !clip) return;
    let frameId = 0;
    let previousTimestamp: number | null = null;
    const previewRange: PlaybackRange | undefined = previewRangeEnabled
      ? { start: rangeStart, end: rangeEnd }
      : undefined;

    const tick = (timestamp: number) => {
      if (previousTimestamp === null) {
        previousTimestamp = timestamp;
        frameId = requestAnimationFrame(tick);
        return;
      }

      const deltaSeconds = (timestamp - previousTimestamp) / 1000;
      previousTimestamp = timestamp;
      const advanced = advancePlaybackTime(clip, timeRef.current, deltaSeconds, previewRange);
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
  }, [clip, onTimeChange, playing, previewRangeEnabled, rangeEnd, rangeStart]);

  function togglePlayback() {
    if (!clip || clip.duration <= 0 || !validPreviewRange) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (previewRangeEnabled && (currentTime < rangeStart || currentTime >= rangeEnd)) {
      timeRef.current = rangeStart;
      onTimeChange(rangeStart);
    } else if (!previewRangeEnabled && !clip.loop && currentTime >= clip.duration) {
      timeRef.current = 0;
      onTimeChange(0);
    }
    setPlaying(true);
  }

  function restart() {
    setPlaying(false);
    const restartTime = previewRangeEnabled && validPreviewRange ? rangeStart : 0;
    timeRef.current = restartTime;
    onTimeChange(restartTime);
  }

  function updateRangeStart(value: number) {
    if (!clip) return;
    setRangeStart(Math.max(0, Math.min(rangeEnd, Math.min(clip.duration, value))));
  }

  function updateRangeEnd(value: number) {
    if (!clip) return;
    setRangeEnd(Math.min(clip.duration, Math.max(rangeStart, Math.max(0, value))));
  }

  return <div className="timeline-playback" aria-label="Playback controls">
    <button type="button" disabled={!clip || clip.duration <= 0 || !validPreviewRange} aria-pressed={playing} onClick={togglePlayback}>
      {playing ? "Pause" : "Play"}
    </button>
    <button type="button" disabled={!clip} onClick={restart}>Restart</button>
    <span>{clip ? (clip.loop ? "Loop" : "Once") : "No clip"}</span>
    <label>Preview range<input aria-label="Loop preview range" type="checkbox" disabled={!clip}
      checked={previewRangeEnabled} onChange={(event) => {
        setPlaying(false);
        setPreviewRangeEnabled(event.target.checked);
      }} /></label>
    <label>Start<input aria-label="Preview range start" type="number" min={0} max={rangeEnd} step={0.01}
      disabled={!clip || !previewRangeEnabled} value={rangeStart} onChange={(event) => updateRangeStart(Number(event.target.value))} /></label>
    <label>End<input aria-label="Preview range end" type="number" min={rangeStart} max={clip?.duration ?? 0} step={0.01}
      disabled={!clip || !previewRangeEnabled} value={rangeEnd} onChange={(event) => updateRangeEnd(Number(event.target.value))} /></label>
  </div>;
}
