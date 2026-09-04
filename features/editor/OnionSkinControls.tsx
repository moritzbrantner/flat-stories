"use client";

import { useState } from "react";

type OnionSkinControlsProps = {
  enabled: boolean;
  offsetSeconds: number;
  clipSelected: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onOffsetChange: (offsetSeconds: number) => void;
};

export function OnionSkinControls({ enabled, offsetSeconds, clipSelected, onEnabledChange, onOffsetChange }: OnionSkinControlsProps) {
  const [offsetText, setOffsetText] = useState(String(offsetSeconds));

  function commitOffset() {
    const parsed = Number(offsetText);
    const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : offsetSeconds;
    setOffsetText(String(normalized));
    onOffsetChange(normalized);
  }

  return <div className="timeline-onion-skin" aria-label="Onion skin controls">
    <label>Onion skin<input aria-label="Onion skin" type="checkbox" disabled={!clipSelected} checked={enabled}
      onChange={(event) => onEnabledChange(event.target.checked)} /></label>
    <label>Offset<input aria-label="Onion skin offset" type="number" min={0.01} step={0.01} disabled={!clipSelected || !enabled}
      value={offsetText} onChange={(event) => setOffsetText(event.target.value)} onBlur={commitOffset} /></label>
    <span>{enabled && clipSelected ? `±${offsetSeconds.toFixed(2)}s` : "Off"}</span>
  </div>;
}
