"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { drawableBounds, resizeBoundsFromHandle, resizeDrawable, type ResizeHandle } from "./geometry";
import type { DrawableObject, Point } from "./model";

const ROTATE_OFFSET = 28;

type ResizeDrag = {
  kind: "resize";
  pointerId: number;
  handle: ResizeHandle;
  object: DrawableObject;
  inverse: DOMMatrix;
};

type RotateDrag = {
  kind: "rotate";
  pointerId: number;
  startRotation: number;
  startAngle: number;
  center: Point;
};

type DragState = ResizeDrag | RotateDrag;

type TransformOverlayProps = {
  object: DrawableObject;
  onGeometryChange: (object: DrawableObject) => void;
  onRotationChange: (rotation: number) => void;
};

function localPoint(event: ReactPointerEvent<SVGElement>, inverse: DOMMatrix, svg: SVGSVGElement | null): Point | null {
  if (!svg) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(inverse);
  return { x: local.x, y: local.y };
}

function screenPoint(point: Point, matrix: DOMMatrix): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function pointerAngle(event: { clientX: number; clientY: number }, center: Point) {
  return Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180 / Math.PI;
}

function snapRotation(rotation: number, enabled: boolean) {
  return enabled ? Math.round(rotation / 15) * 15 : rotation;
}

export function TransformOverlay({ object, onGeometryChange, onRotationChange }: TransformOverlayProps) {
  const groupRef = useRef<SVGGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const bounds = drawableBounds(object);
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const topCenter = { x: bounds.x + bounds.width / 2, y: bounds.y };

  function beginResize(event: ReactPointerEvent<SVGElement>, handle: ResizeHandle) {
    event.stopPropagation();
    const matrix = groupRef.current?.getScreenCTM();
    if (!matrix) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind: "resize", pointerId: event.pointerId, handle, object, inverse: matrix.inverse() };
  }

  function beginRotate(event: ReactPointerEvent<SVGElement>) {
    event.stopPropagation();
    const matrix = groupRef.current?.getScreenCTM();
    if (!matrix) return;
    const pivot = screenPoint({ x: object.transform.pivotX, y: object.transform.pivotY }, matrix);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: "rotate",
      pointerId: event.pointerId,
      startRotation: object.transform.rotation,
      startAngle: pointerAngle(event, pivot),
      center: pivot,
    };
  }

  function moveDrag(event: ReactPointerEvent<SVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (drag.kind === "resize") {
      const point = localPoint(event, drag.inverse, groupRef.current?.ownerSVGElement ?? null);
      if (!point) return;
      const target = resizeBoundsFromHandle(drawableBounds(drag.object), drag.handle, point);
      onGeometryChange(resizeDrawable(drag.object, target));
      return;
    }
    const rotation = drag.startRotation + pointerAngle(event, drag.center) - drag.startAngle;
    onRotationChange(snapRotation(rotation, event.shiftKey));
  }

  function endDrag(event: ReactPointerEvent<SVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    dragRef.current = null;
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<SVGRectElement>, handle: ResizeHandle) {
    const amount = event.shiftKey ? 10 : 1;
    const delta = event.key === "ArrowLeft" ? { x: -amount, y: 0 }
      : event.key === "ArrowRight" ? { x: amount, y: 0 }
      : event.key === "ArrowUp" ? { x: 0, y: -amount }
      : event.key === "ArrowDown" ? { x: 0, y: amount }
      : null;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    const handlePoint = handle === "nw" ? { x: bounds.x, y: bounds.y }
      : handle === "ne" ? { x: right, y: bounds.y }
      : handle === "se" ? { x: right, y: bottom }
      : { x: bounds.x, y: bottom };
    const target = resizeBoundsFromHandle(bounds, handle, { x: handlePoint.x + delta.x, y: handlePoint.y + delta.y });
    onGeometryChange(resizeDrawable(object, target));
  }

  function rotateWithKeyboard(event: ReactKeyboardEvent<SVGCircleElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const amount = event.shiftKey ? 15 : 1;
    onRotationChange(object.transform.rotation + (event.key === "ArrowLeft" ? -amount : amount));
  }

  const handles: { id: ResizeHandle; x: number; y: number }[] = [
    { id: "nw", x: bounds.x, y: bounds.y },
    { id: "ne", x: right, y: bounds.y },
    { id: "se", x: right, y: bottom },
    { id: "sw", x: bounds.x, y: bottom },
  ];

  return <g ref={groupRef} className="transform-overlay" data-testid="transform-overlay">
    <rect className="selection-box" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} />
    <line className="rotation-stem" x1={topCenter.x} y1={topCenter.y} x2={topCenter.x} y2={topCenter.y - ROTATE_OFFSET} />
    <circle className="rotation-handle" cx={topCenter.x} cy={topCenter.y - ROTATE_OFFSET} r={6} role="button" tabIndex={0} aria-label="Rotate selection"
      onPointerDown={beginRotate} onPointerMove={moveDrag} onPointerUp={endDrag} onKeyDown={rotateWithKeyboard} />
    {handles.map((handle) => <rect key={handle.id} className="resize-handle" x={handle.x - 5} y={handle.y - 5} width={10} height={10}
      role="button" tabIndex={0} aria-label={`Resize ${handle.id.toUpperCase()}`}
      onPointerDown={(event) => beginResize(event, handle.id)} onPointerMove={moveDrag} onPointerUp={endDrag}
      onKeyDown={(event) => resizeWithKeyboard(event, handle.id)} />)}
    <circle className="pivot-marker" cx={object.transform.pivotX} cy={object.transform.pivotY} r={3} />
  </g>;
}
