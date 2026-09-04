"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { PathAnchor, Point, VectorPath } from "./model";

type HandleName = "inHandle" | "outHandle";
type DragTarget = { anchorId: string; part: "anchor" | HandleName; pointerId: number };

type PathEditorOverlayProps = {
  path: VectorPath;
  onMoveAnchor: (anchorId: string, point: Point) => void;
  onMoveHandle: (anchorId: string, handle: HandleName, point: Point) => void;
  onToggleHandles: (anchorId: string) => void;
};

function pointFromPointer(event: ReactPointerEvent<SVGElement>, group: SVGGElement | null): Point | null {
  const svg = group?.ownerSVGElement;
  const matrix = group?.getScreenCTM();
  if (!svg || !matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

export function PathEditorOverlay({ path, onMoveAnchor, onMoveHandle, onToggleHandles }: PathEditorOverlayProps) {
  const groupRef = useRef<SVGGElement | null>(null);
  const dragRef = useRef<DragTarget | null>(null);

  function beginDrag(event: ReactPointerEvent<SVGElement>, anchorId: string, part: DragTarget["part"]) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { anchorId, part, pointerId: event.pointerId };
  }

  function moveDrag(event: ReactPointerEvent<SVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const point = pointFromPointer(event, groupRef.current);
    if (!point) return;
    if (drag.part === "anchor") onMoveAnchor(drag.anchorId, point);
    else onMoveHandle(drag.anchorId, drag.part, point);
  }

  function endDrag(event: ReactPointerEvent<SVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dragRef.current = null;
  }

  function moveAnchorFromKeyboard(event: ReactKeyboardEvent<SVGCircleElement>, anchor: PathAnchor) {
    const amount = event.shiftKey ? 10 : 1;
    const delta = event.key === "ArrowLeft" ? { x: -amount, y: 0 }
      : event.key === "ArrowRight" ? { x: amount, y: 0 }
      : event.key === "ArrowUp" ? { x: 0, y: -amount }
      : event.key === "ArrowDown" ? { x: 0, y: amount }
      : null;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    onMoveAnchor(anchor.id, { x: anchor.point.x + delta.x, y: anchor.point.y + delta.y });
  }

  return <g ref={groupRef} className="path-editor" data-testid="path-editor">
    {path.anchors.map((anchor) => <g key={anchor.id}>
      {anchor.inHandle ? <>
        <line className="path-handle-line" x1={anchor.point.x} y1={anchor.point.y} x2={anchor.inHandle.x} y2={anchor.inHandle.y} />
        <circle className="path-handle" cx={anchor.inHandle.x} cy={anchor.inHandle.y} r={5}
          onPointerDown={(event) => beginDrag(event, anchor.id, "inHandle")} onPointerMove={moveDrag} onPointerUp={endDrag} />
      </> : null}
      {anchor.outHandle ? <>
        <line className="path-handle-line" x1={anchor.point.x} y1={anchor.point.y} x2={anchor.outHandle.x} y2={anchor.outHandle.y} />
        <circle className="path-handle" cx={anchor.outHandle.x} cy={anchor.outHandle.y} r={5}
          onPointerDown={(event) => beginDrag(event, anchor.id, "outHandle")} onPointerMove={moveDrag} onPointerUp={endDrag} />
      </> : null}
      <circle className="path-anchor" cx={anchor.point.x} cy={anchor.point.y} r={7} role="button" tabIndex={0}
        aria-label={`Path anchor ${anchor.id}`} title="Drag to move; double-click to toggle Bézier handles"
        onPointerDown={(event) => beginDrag(event, anchor.id, "anchor")} onPointerMove={moveDrag} onPointerUp={endDrag}
        onDoubleClick={(event) => { event.stopPropagation(); onToggleHandles(anchor.id); }}
        onKeyDown={(event) => moveAnchorFromKeyboard(event, anchor)} />
    </g>)}
  </g>;
}
