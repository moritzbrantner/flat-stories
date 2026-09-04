"use client";

import { useState } from "react";
import type { CharacterExpression, CharacterPose } from "./model";

type CharacterPresetPanelProps = {
  poses: readonly CharacterPose[];
  expressions: readonly CharacterExpression[];
  disabled: boolean;
  canCapturePose: boolean;
  selectedCount: number;
  onCapturePose: (name: string) => void;
  onApplyPose: (id: string) => void;
  onCaptureExpression: (name: string) => void;
  onApplyExpression: (id: string) => void;
};

export function CharacterPresetPanel({
  poses,
  expressions,
  disabled,
  canCapturePose,
  selectedCount,
  onCapturePose,
  onApplyPose,
  onCaptureExpression,
  onApplyExpression,
}: CharacterPresetPanelProps) {
  const [poseName, setPoseName] = useState("");
  const [expressionName, setExpressionName] = useState("");

  function capturePose() {
    const name = poseName.trim();
    if (!name || !canCapturePose) return;
    onCapturePose(name);
    setPoseName("");
  }

  function captureExpression() {
    const name = expressionName.trim();
    if (!name || selectedCount === 0) return;
    onCaptureExpression(name);
    setExpressionName("");
  }

  return <section aria-label="Character presets">
    <h2>Character</h2>
    <fieldset className="properties" disabled={disabled}>
      <strong>Poses</strong>
      <label>Pose name<input value={poseName} placeholder="Wave" onChange={(event) => setPoseName(event.target.value)} /></label>
      <button type="button" disabled={!canCapturePose || poseName.trim().length === 0} onClick={capturePose}>Save pose</button>
      <div className="bone-list">
        {poses.length > 0 ? poses.map((pose) => <span key={pose.id}>
          {pose.name}<button type="button" aria-label={`Apply pose ${pose.name}`} onClick={() => onApplyPose(pose.id)}>Apply</button>
        </span>) : <small>No saved poses.</small>}
      </div>

      <strong>Expressions</strong>
      <small>Expressions capture visibility, opacity, and transforms for the selected layers only.</small>
      <label>Expression name<input value={expressionName} placeholder="Blink" onChange={(event) => setExpressionName(event.target.value)} /></label>
      <button type="button" disabled={selectedCount === 0 || expressionName.trim().length === 0} onClick={captureExpression}>Save expression</button>
      <div className="bone-list">
        {expressions.length > 0 ? expressions.map((expression) => <span key={expression.id}>
          {expression.name}<button type="button" aria-label={`Apply expression ${expression.name}`} onClick={() => onApplyExpression(expression.id)}>Apply</button>
        </span>) : <small>No saved expressions.</small>}
      </div>
    </fieldset>
  </section>;
}
