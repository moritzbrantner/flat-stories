"use client";

import type { Point } from "./model";
import { penSessionPreviewPath, type PenSession } from "./penTool";
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
    {last && pointer && !session.press ? <line className="pen-preview-rubber-band" x1={last.point.x} y1={last.point.y} x2={pointer.x} y2={pointer.y} /> : null}
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
