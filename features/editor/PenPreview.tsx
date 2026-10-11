"use client";

import type { Point } from "./model";
import { PEN_CLOSE_RADIUS, penSessionPreviewPath, type PenNode, type PenSession } from "./penTool";
import { pathToSvg } from "./vectorPath";

/**
 * Non-interactive preview of an in-progress pen path, styled like PathEditorOverlay
 * (anchors, handles and handle lines) plus a rubber-band segment to the pointer.
 */
export function PenPreview({ session, pointer }: { session: PenSession; pointer: Point | null }) {
  const path = penSessionPreviewPath(session);
  const last = session.nodes.at(-1);
  const first = session.nodes[0];
  return <g className="pen-preview path-editor" data-testid="pen-preview" aria-hidden="true" pointerEvents="none">
    <path className="pen-preview-path" d={pathToSvg(path)} />
    {last && pointer && !session.press ? <path className="pen-preview-rubber-band" d={rubberBand(session, last, pointer)} /> : null}
    {session.nodes.map((node, index) => <g key={index}>
      {node.inHandle ? <>
        <line className="path-handle-line" x1={node.point.x} y1={node.point.y} x2={node.inHandle.x} y2={node.inHandle.y} />
        <circle className="path-handle" cx={node.inHandle.x} cy={node.inHandle.y} r={5} />
      </> : null}
      {node.outHandle ? <>
        <line className="path-handle-line" x1={node.point.x} y1={node.point.y} x2={node.outHandle.x} y2={node.outHandle.y} />
        <circle className="path-handle" cx={node.outHandle.x} cy={node.outHandle.y} r={5} />
      </> : null}
      <circle className={node === first && session.nodes.length >= 3 ? "path-anchor pen-close-target" : "path-anchor"}
        cx={node.point.x} cy={node.point.y} r={7} />
    </g>)}
  </g>;
}

// The segment a click at `pointer` would add. Near the first node (with 3+ nodes) the click closes
// the path, so the segment ends at that node and uses its incoming handle; otherwise it ends at a
// new corner node (whose incoming control point is its own position).
function rubberBand(session: PenSession, last: PenNode, pointer: Point) {
  const first = session.nodes[0];
  const closes =
    session.nodes.length >= 3 &&
    first !== undefined &&
    Math.hypot(pointer.x - first.point.x, pointer.y - first.point.y) <= PEN_CLOSE_RADIUS;
  const end = closes ? first.point : pointer;
  const endControl = closes ? (first.inHandle ?? first.point) : pointer;
  const start = `M${last.point.x} ${last.point.y}`;
  if (!last.outHandle && endControl === end) return `${start} L${end.x} ${end.y}`;
  const startControl = last.outHandle ?? last.point;
  return `${start} C${startControl.x} ${startControl.y} ${endControl.x} ${endControl.y} ${end.x} ${end.y}`;
}
