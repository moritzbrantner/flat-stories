"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { DrawableObject, EditorDocument, PathObject, Point, TextObject } from "../model";
import { pathToSvg } from "../vectorPath";
import { hitTestRenderFrame, type ComplexShapeHitTester } from "./hitTest";
import { buildRenderFrame, type RenderFrame, type RenderItem } from "./renderFrame";
import { loadBrowserWasmTransformKernel, referenceTransformKernel, type TransformKernel } from "./transformKernel";

type CanvasSceneProps = {
  document: EditorDocument;
  kernel?: TransformKernel;
  className?: string;
  style?: CSSProperties;
  selectedIds?: readonly string[];
  background?: string | null;
  onBackendChange?: (backend: TransformKernel["name"]) => void;
  onNodePointerDown?: (id: string, event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onEmptyPointerDown?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onRenderFailure?: (error: Error) => void;
};

const pathCache = new Map<string, { source: string; path: Path2D }>();

function pathFor(object: PathObject): Path2D {
  const source = pathToSvg(object.path);
  const cached = pathCache.get(object.id);
  if (cached?.source === source) return cached.path;
  const path = new Path2D(source);
  pathCache.set(object.id, { source, path });
  return path;
}

function applyPaint(context: CanvasRenderingContext2D, object: DrawableObject) {
  context.lineWidth = object.strokeWidth ?? 1;
  context.lineCap = object.strokeLinecap ?? "butt";
  context.lineJoin = object.strokeLinejoin ?? "miter";
  context.setLineDash([]);
  if (object.fill !== "none") context.fillStyle = object.fill;
  if (object.stroke && object.stroke !== "none") context.strokeStyle = object.stroke;
}

function fillAndStroke(context: CanvasRenderingContext2D, object: DrawableObject) {
  if (object.fill !== "none") context.fill();
  if (object.stroke && object.stroke !== "none") context.stroke();
}

function drawDrawable(context: CanvasRenderingContext2D, object: DrawableObject) {
  applyPaint(context, object);
  switch (object.kind) {
    case "rectangle": {
      context.beginPath();
      if (object.cornerRadius > 0) context.roundRect(object.x, object.y, object.width, object.height, object.cornerRadius);
      else context.rect(object.x, object.y, object.width, object.height);
      fillAndStroke(context, object);
      break;
    }
    case "circle": {
      context.beginPath();
      context.arc(object.cx, object.cy, object.radius, 0, Math.PI * 2);
      fillAndStroke(context, object);
      break;
    }
    case "path": {
      const path = pathFor(object);
      if (object.fill !== "none") context.fill(path);
      if (object.stroke && object.stroke !== "none") context.stroke(path);
      break;
    }
    case "text": {
      context.font = `700 ${object.fontSize}px system-ui, sans-serif`;
      context.textBaseline = "alphabetic";
      if (object.fill !== "none") context.fillText(object.value, object.x, object.y);
      if (object.stroke && object.stroke !== "none") context.strokeText(object.value, object.x, object.y);
      break;
    }
  }
}

function drawSelection(context: CanvasRenderingContext2D, object: DrawableObject, stroke: string) {
  context.strokeStyle = stroke;
  context.lineWidth = 4;
  context.setLineDash([7, 5]);
  context.lineCap = "butt";
  context.lineJoin = "round";
  switch (object.kind) {
    case "rectangle":
      context.beginPath();
      if (object.cornerRadius > 0) context.roundRect(object.x, object.y, object.width, object.height, object.cornerRadius);
      else context.rect(object.x, object.y, object.width, object.height);
      context.stroke();
      break;
    case "circle":
      context.beginPath();
      context.arc(object.cx, object.cy, object.radius, 0, Math.PI * 2);
      context.stroke();
      break;
    case "path":
      context.stroke(pathFor(object));
      break;
    case "text":
      context.font = `700 ${object.fontSize}px system-ui, sans-serif`;
      context.textBaseline = "alphabetic";
      context.strokeText(object.value, object.x, object.y);
      break;
  }
  context.setLineDash([]);
}

function drawItem(context: CanvasRenderingContext2D, item: RenderItem, selected: boolean, selectionStroke: string) {
  const [a, b, c, d, e, f] = item.matrix;
  context.save();
  context.setTransform(a, b, c, d, e, f);
  context.globalAlpha = item.opacity;
  drawDrawable(context, item.object);
  if (selected) {
    context.globalAlpha = 1;
    drawSelection(context, item.object, selectionStroke);
  }
  context.restore();
}

export function drawDocumentToCanvas(
  canvas: HTMLCanvasElement,
  document: EditorDocument,
  kernel: TransformKernel,
  selectedIds: readonly string[] = [],
  background: string | null = "#ffffff",
) {
  if (canvas.width !== document.width) canvas.width = document.width;
  if (canvas.height !== document.height) canvas.height = document.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.clearRect(0, 0, document.width, document.height);
  if (background !== null) {
    context.fillStyle = background;
    context.fillRect(0, 0, document.width, document.height);
  }

  const frame = buildRenderFrame(document, kernel);
  const selection = new Set(selectedIds);
  const selectionStroke = selection.size > 0
    ? getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#7c9cff"
    : "#7c9cff";
  for (const item of frame.items) drawItem(context, item, selection.has(item.id), selectionStroke);

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  return frame;
}

function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point | null {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

function textContains(context: CanvasRenderingContext2D, object: TextObject, point: Point) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.font = `700 ${object.fontSize}px system-ui, sans-serif`;
  context.textBaseline = "alphabetic";
  const metrics = context.measureText(object.value);
  const left = object.x - (metrics.actualBoundingBoxLeft || 0);
  const right = object.x + (metrics.actualBoundingBoxRight || metrics.width);
  const top = object.y - (metrics.actualBoundingBoxAscent || object.fontSize);
  const bottom = object.y + (metrics.actualBoundingBoxDescent || object.fontSize * 0.25);
  context.restore();
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function complexHitTester(context: CanvasRenderingContext2D): ComplexShapeHitTester {
  return {
    pathContains: (object, point) => {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      applyPaint(context, object);
      const path = pathFor(object);
      const fillHit = object.fill !== "none" && context.isPointInPath(path, point.x, point.y);
      const strokeHit = Boolean(object.stroke && object.stroke !== "none") && context.isPointInStroke(path, point.x, point.y);
      context.restore();
      return fillHit || strokeHit;
    },
    textContains: (object, point) => textContains(context, object, point),
  };
}

export function hitTestCanvasFrame(canvas: HTMLCanvasElement, frame: RenderFrame, point: Point) {
  const context = canvas.getContext("2d");
  if (!context) return null;
  return hitTestRenderFrame(frame, point, complexHitTester(context));
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

export function CanvasScene({
  document,
  kernel,
  className,
  style,
  selectedIds = [],
  background = "#ffffff",
  onBackendChange,
  onNodePointerDown,
  onEmptyPointerDown,
  onRenderFailure,
}: CanvasSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef(document);
  const selectedIdsRef = useRef(selectedIds);
  const backgroundRef = useRef(background);
  const frameRef = useRef<RenderFrame | null>(null);
  const kernelRef = useRef<TransformKernel>(kernel ?? referenceTransformKernel);

  useEffect(() => {
    documentRef.current = document;
    selectedIdsRef.current = selectedIds;
    backgroundRef.current = background;
  }, [background, document, selectedIds]);

  function draw(activeKernel: TransformKernel) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      frameRef.current = drawDocumentToCanvas(
        canvas,
        documentRef.current,
        activeKernel,
        selectedIdsRef.current,
        backgroundRef.current,
      );
    } catch (error) {
      frameRef.current = null;
      onRenderFailure?.(asError(error));
    }
  }

  useEffect(() => {
    if (kernel) {
      kernelRef.current = kernel;
      onBackendChange?.(kernel.name);
      draw(kernel);
      return;
    }
    let active = true;
    loadBrowserWasmTransformKernel().then((loaded) => {
      if (!active) return;
      kernelRef.current = loaded;
      onBackendChange?.(loaded.name);
      draw(loaded);
    }).catch(() => {
      if (!active) return;
      kernelRef.current = referenceTransformKernel;
      onBackendChange?.("typescript");
      draw(referenceTransformKernel);
    });
    return () => { active = false; };
  }, [kernel, onBackendChange, onRenderFailure]);

  useEffect(() => {
    draw(kernel ?? kernelRef.current);
  }, [background, document, kernel, selectedIds]);

  return <canvas
    ref={canvasRef}
    className={className}
    aria-label={`${document.name} Canvas renderer`}
    data-renderer="canvas2d"
    data-selected-node-count={selectedIds.length}
    width={document.width}
    height={document.height}
    style={style}
    onPointerDown={(event) => {
      if (!canvasRef.current || !frameRef.current) return;
      const point = canvasPoint(event, canvasRef.current);
      if (!point) return;
      const id = hitTestCanvasFrame(canvasRef.current, frameRef.current, point);
      if (id) onNodePointerDown?.(id, event);
      else onEmptyPointerDown?.(event);
    }}
  />;
}
