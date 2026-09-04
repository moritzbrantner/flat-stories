"use client";

import { useState } from "react";
import type { AnimationClip, Easing, NumberKeyframe } from "./model";

type KeyframeInspectorProps = {
  clip: AnimationClip | null;
  onUpdate: (trackId: string, keyframeTime: number, patch: Partial<NumberKeyframe>) => void;
  onDelete: (trackId: string, keyframeTime: number) => void;
};

const easingOptions: Easing[] = ["linear", "ease-in", "ease-out", "ease-in-out"];

export function KeyframeInspector({ clip, onUpdate, onDelete }: KeyframeInspectorProps) {
  const [trackId, setTrackId] = useState("");
  const [keyframeTime, setKeyframeTime] = useState("");
  const selectedTrack = clip?.tracks.find((track) => track.id === trackId) ?? clip?.tracks[0] ?? null;
  const selectedKeyframe = selectedTrack?.keyframes.find((keyframe) => keyframe.time === Number(keyframeTime))
    ?? selectedTrack?.keyframes[0]
    ?? null;

  if (!clip) return null;

  return <div className="timeline-keyframe-inspector" aria-label="Keyframe inspector">
    <select aria-label="Keyframe track" disabled={clip.tracks.length === 0} value={selectedTrack?.id ?? ""}
      onChange={(event) => { setTrackId(event.target.value); setKeyframeTime(""); }}>
      {clip.tracks.length === 0 ? <option value="">No tracks</option> : clip.tracks.map((track) => <option key={track.id} value={track.id}>
        {track.target.kind}:{track.target.id} · {track.property}
      </option>)}
    </select>
    <select aria-label="Keyframe" disabled={!selectedTrack || selectedTrack.keyframes.length === 0} value={selectedKeyframe ? String(selectedKeyframe.time) : ""}
      onChange={(event) => setKeyframeTime(event.target.value)}>
      {selectedTrack?.keyframes.map((keyframe) => <option key={keyframe.time} value={keyframe.time}>
        {keyframe.time.toFixed(2)}s · {keyframe.value}
      </option>)}
    </select>
    {selectedTrack && selectedKeyframe ? <KeyframeEditor key={`${selectedTrack.id}:${selectedKeyframe.time}`}
      clipDuration={clip.duration}
      keyframe={selectedKeyframe}
      onApply={(patch) => {
        const nextTime = Math.max(0, Math.min(clip.duration, patch.time ?? selectedKeyframe.time));
        onUpdate(selectedTrack.id, selectedKeyframe.time, patch);
        setTrackId(selectedTrack.id);
        setKeyframeTime(String(nextTime));
      }}
      onDelete={() => {
        onDelete(selectedTrack.id, selectedKeyframe.time);
        setKeyframeTime("");
      }} /> : <small>No keyframe selected.</small>}
  </div>;
}

function KeyframeEditor({ clipDuration, keyframe, onApply, onDelete }: {
  clipDuration: number;
  keyframe: NumberKeyframe;
  onApply: (patch: Partial<NumberKeyframe>) => void;
  onDelete: () => void;
}) {
  const [time, setTime] = useState(keyframe.time);
  const [value, setValue] = useState(keyframe.value);
  const [easing, setEasing] = useState<Easing>(keyframe.easing ?? "linear");

  return <fieldset className="timeline-keyframe-fields">
    <label>Key time<input aria-label="Key time" type="number" min={0} max={clipDuration} step={0.01} value={time}
      onChange={(event) => setTime(Number(event.target.value))} /></label>
    <label>Key value<input aria-label="Key value" type="number" step={0.01} value={value}
      onChange={(event) => setValue(Number(event.target.value))} /></label>
    <label>Easing<select aria-label="Key easing" value={easing} onChange={(event) => setEasing(event.target.value as Easing)}>
      {easingOptions.map((option) => <option key={option} value={option}>{option}</option>)}
    </select></label>
    <button type="button" onClick={() => onApply({ time, value, easing })}>Apply keyframe</button>
    <button type="button" onClick={onDelete}>Delete keyframe</button>
  </fieldset>;
}
