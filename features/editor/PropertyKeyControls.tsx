"use client";

import { useState } from "react";
import type { AnimationTrack, CharacterRig, Easing, EditorObject, NodeAnimationProperty } from "./model";

type PropertyKeyControlsProps = {
  selectedNode: EditorObject | null;
  rig?: CharacterRig;
  clipSelected: boolean;
  currentTime: number;
  onKey: (
    target: AnimationTrack["target"],
    property: AnimationTrack["property"],
    value: number,
    easing: Easing,
  ) => void;
};

const nodeProperties: NodeAnimationProperty[] = [
  "transform.x",
  "transform.y",
  "transform.rotation",
  "transform.scaleX",
  "transform.scaleY",
  "opacity",
];
const easingOptions: Easing[] = ["linear", "ease-in", "ease-out", "ease-in-out"];

function nodePropertyValue(node: EditorObject, property: NodeAnimationProperty) {
  switch (property) {
    case "transform.x": return node.transform.x;
    case "transform.y": return node.transform.y;
    case "transform.rotation": return node.transform.rotation;
    case "transform.scaleX": return node.transform.scaleX;
    case "transform.scaleY": return node.transform.scaleY;
    case "opacity": return node.opacity;
  }
}

export function PropertyKeyControls({ selectedNode, rig, clipSelected, currentTime, onKey }: PropertyKeyControlsProps) {
  const [targetKey, setTargetKey] = useState("");
  const [property, setProperty] = useState<AnimationTrack["property"]>("transform.x");

  const targets = [
    ...(selectedNode ? [{ key: `node:${selectedNode.id}`, label: `Selected node: ${selectedNode.name}` }] : []),
    ...(rig?.bones.map((bone) => ({ key: `bone:${bone.id}`, label: `Bone: ${bone.name}` })) ?? []),
  ];
  const activeTargetKey = targets.some((target) => target.key === targetKey) ? targetKey : (targets[0]?.key ?? "");
  const isNode = activeTargetKey.startsWith("node:");
  const activeProperty: AnimationTrack["property"] = isNode
    ? (nodeProperties.includes(property as NodeAnimationProperty) ? property : "transform.x")
    : "rotation";
  const targetId = activeTargetKey.slice(activeTargetKey.indexOf(":") + 1);
  const sourceValue = isNode && selectedNode && selectedNode.id === targetId
    ? nodePropertyValue(selectedNode, activeProperty as NodeAnimationProperty)
    : rig?.bones.find((bone) => bone.id === targetId)?.rotation ?? 0;

  return <fieldset className="timeline-property-key" disabled={!clipSelected || !activeTargetKey}>
    <select aria-label="Property target" value={activeTargetKey} onChange={(event) => {
      setTargetKey(event.target.value);
      setProperty(event.target.value.startsWith("node:") ? "transform.x" : "rotation");
    }}>
      {targets.length === 0 ? <option value="">No keyable target</option> : targets.map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}
    </select>
    <select aria-label="Property" value={activeProperty} disabled={!isNode} onChange={(event) => setProperty(event.target.value as NodeAnimationProperty)}>
      {isNode ? nodeProperties.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>) : <option value="rotation">rotation</option>}
    </select>
    <PropertyValueEditor key={`${activeTargetKey}:${activeProperty}:${currentTime}:${sourceValue}`}
      value={sourceValue}
      onKey={(value, easing) => onKey(
        { kind: isNode ? "node" : "bone", id: targetId },
        activeProperty,
        value,
        easing,
      )} />
  </fieldset>;
}

function PropertyValueEditor({ value: initialValue, onKey }: { value: number; onKey: (value: number, easing: Easing) => void }) {
  const [value, setValue] = useState(initialValue);
  const [easing, setEasing] = useState<Easing>("ease-in-out");

  return <>
    <label>Value<input aria-label="Property value" type="number" step={0.01} value={value} onChange={(event) => setValue(Number(event.target.value))} /></label>
    <label>Easing<select aria-label="Property easing" value={easing} onChange={(event) => setEasing(event.target.value as Easing)}>
      {easingOptions.map((option) => <option key={option} value={option}>{option}</option>)}
    </select></label>
    <button type="button" onClick={() => onKey(value, easing)}>Key property</button>
  </>;
}
