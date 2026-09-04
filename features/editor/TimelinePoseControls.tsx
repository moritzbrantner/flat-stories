"use client";

import { useState } from "react";
import type { CharacterPose } from "./model";

type TimelinePoseControlsProps = {
  poses: readonly CharacterPose[];
  clipSelected: boolean;
  onKeyPose: (poseId: string) => void;
  onRemoveKeysAtTime: () => void;
};

export function TimelinePoseControls({ poses, clipSelected, onKeyPose, onRemoveKeysAtTime }: TimelinePoseControlsProps) {
  const [poseId, setPoseId] = useState("");
  const selectedPoseId = poses.some((pose) => pose.id === poseId) ? poseId : "";

  return <div className="timeline-authoring" aria-label="Pose keyframing">
    <select aria-label="Keyframe pose" disabled={!clipSelected || poses.length === 0} value={selectedPoseId}
      onChange={(event) => setPoseId(event.target.value)}>
      <option value="">Choose pose</option>
      {poses.map((pose) => <option key={pose.id} value={pose.id}>{pose.name}</option>)}
    </select>
    <button type="button" disabled={!clipSelected || selectedPoseId.length === 0}
      onClick={() => onKeyPose(selectedPoseId)}>Key pose</button>
    <button type="button" disabled={!clipSelected} onClick={onRemoveKeysAtTime}>Remove keys at time</button>
  </div>;
}
