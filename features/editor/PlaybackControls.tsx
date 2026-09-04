"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationClip } from "./model";
import { advancePlaybackTime, type PlaybackRange } from "./playback";

type PlaybackControlsProps = {
  clip: AnimationClip | null;
  currentTime: number;
  onTimeChange: (time: number) => void;
};

function parseNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function PlaybackControls({ clip, currentTime, onTimeChange }: PlaybackControlsProps) {
  const [playing, setPlaying] = useState(false);
  const [previewRangeEnabled, setPreviewRangeEnabled] = useState(false);
  const [rangeStartText, setRangeStartText] = useState("0");
  const [rangeEndText, setRangeEndText] = useState(String(clip?.duration ?? 0));
  const timeRef = useRef(currentTime);
  const rangeStart = parseNumber(rangeStartText);
  const rangeEnd = parseNumber(rangeEndText);
  const validPreviewRange = !previewRangeEnabled || Boolean(
    clip
    && rangeStart !== null
    && rangeEnd !== null
    && rangeStart >= 0
    && rangeEnd <= clip.duration
    && rangeEnd > rangeStart,
  );

  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!playing || !clip) return;
    let frameId = 0;
    let previousTimestamp: number | null = null;
    const previewRange: PlaybackRange | undefined = previewRangeEnabled && rangeStart !== null && rangeEnd !== null
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
    if (previewRangeEnabled && rangeStart !== null && rangeEnd !== null && (currentTime < rangeStart || currentTime >= rangeEnd)) {
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
    const restartTime = previewRangeEnabled && validPreviewRange && rangeStart !== null ? rangeStart : 0;
    timeRef.current = restartTime;
    onTimeChange(restartTime);
  }

  function commitRangeStart() {
    if (!clip) return;
    const parsed = parseNumber(rangeStartText);
    const currentEnd = parseNumber(rangeEndText) ?? clip.duration;
    const normalized = Math.max(0, Math.min(currentEnd, Math.min(clip.duration, parsed ?? 0)));
    setRangeStartText(String(normalized));
  }

  function commitRangeEnd() {
    if (!clip) return;
    const parsed = parseNumber(rangeEndText);
    const currentStart = parseNumber(rangeStartText) ?? 0;
    const normalized = Math.min(clip.duration, Math.max(currentStart, Math.max(0, parsed ?? clip.duration)));
    setRangeEndText(String(normalized));
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
    <label>Start<input aria-label="Preview range start" type="number" min={0} max={rangeEnd ?? clip?.duration ?? 0} step={0.01}
      disabled={!clip || !previewRangeEnabled} value={rangeStartText} onChange={(event) => {
        setPlaying(false);
        setRangeStartText(event.target.value);
      }} onBlur={commitRangeStart} /></label>
    <label>End<input aria-label="Preview range end" type="number" min={rangeStart ?? 0} max={clip?.duration ?? 0} step={0.01}
      disabled={!clip || !previewRangeEnabled} value={rangeEndText} onChange={(event) => {
        setPlaying(false);
        setRangeEndText(event.target.value);
      }} onBlur={commitRangeEnd} /></label>
  </div>;
}
