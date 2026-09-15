"use client";

import type { EditorDocument, Point } from "../model";
import { getBoneWorldPose } from "../rig";
import { CanvasScene, type CanvasSceneUnderlay } from "./CanvasScene";
import type { TransformKernel } from "./transformKernel";

type PreviewViewport = Point & { zoom: number };

type AnimationCanvasPreviewProps = {
  document: EditorDocument;
  selectedIds: readonly string[];
  viewport: PreviewViewport;
  showRig: boolean;
  onionSkins?: readonly CanvasSceneUnderlay[];
  onSelectionChange: (id: string | null, additive: boolean) => void;
  onBackendChange?: (backend: TransformKernel["name"]) => void;
  onRenderFailure?: (error: Error) => void;
};

export function AnimationCanvasPreview({
  document,
  selectedIds,
  viewport,
  showRig,
  onionSkins = [],
  onSelectionChange,
  onBackendChange,
  onRenderFailure,
}: AnimationCanvasPreviewProps) {
  const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

  return <>
    <CanvasScene
      className="artboard preview-canvas"
      document={document}
      selectedIds={selectedIds}
      underlays={onionSkins}
      style={{ transform }}
      onBackendChange={onBackendChange}
      onRenderFailure={onRenderFailure}
      onNodePointerDown={(id, event) => onSelectionChange(id, event.shiftKey || event.metaKey || event.ctrlKey)}
      onEmptyPointerDown={() => onSelectionChange(null, false)}
    />
    {showRig && document.rig ? <svg
      className="artboard preview-rig-overlay"
      aria-hidden="true"
      width={document.width}
      height={document.height}
      viewBox={`0 0 ${document.width} ${document.height}`}
      style={{ transform }}
    >
      <g className="rig-overlay">
        {document.rig.bones.map((bone) => {
          const pose = getBoneWorldPose(document.rig!, bone.id);
          return pose ? <g key={bone.id}>
            <line x1={pose.origin.x} y1={pose.origin.y} x2={pose.end.x} y2={pose.end.y} />
            <circle cx={pose.origin.x} cy={pose.origin.y} r={5} />
          </g> : null;
        })}
        {document.rig.constraints.filter((constraint) => constraint.enabled).map((constraint) => <g key={constraint.id} className="ik-target">
          <circle cx={constraint.target.x} cy={constraint.target.y} r={9} />
          <path d={`M${constraint.target.x - 13} ${constraint.target.y}H${constraint.target.x + 13}M${constraint.target.x} ${constraint.target.y - 13}V${constraint.target.y + 13}`} />
        </g>)}
      </g>
    </svg> : null}
  </>;
}
