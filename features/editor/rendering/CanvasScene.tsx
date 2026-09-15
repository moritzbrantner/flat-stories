"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { DrawableObject, EditorDocument, PathObject, Point, TextObject } from "../model";
import { CanvasStateCache } from "./canvasState";
import { hitTestRenderFrame, type ComplexShapeHitTester } from "./hitTest";
import { createPreparedPathCache } from "./pathPreparation";
import {
  buildRenderComposition,
  type RenderComposition,
  type RenderCompositionLayerKind,
} from "./renderComposition";
import type { RenderFrame, RenderItem } from "./renderFrame";
import { loadBrowserWasmTransformKernel, referenceTransformKernel, type TransformKernel } from "./transformKernel";

export type CanvasSceneUnderlay = {
  kind: Exclude<RenderCompositionLayerKind, "current">;
  document: EditorDocument;
  opacity: number;
};

type CanvasSceneProps = {
  document: EditorDocument;
  kernel?: TransformKernel;
  className?: string;
  style?: CSSProperties;
  selectedIds?: readonly string[];
  underlays?: readonly CanvasSceneUnderlay[];
  background?: string | null;
  onBackendChange?: (backend: TransformKernel["name"]) => void;
  onNodePointerDown?: (id: string, event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onEmptyPointerDown?: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onRenderFailure?: (error: Error) => void;
};

const pathCache = createPreparedPathCache((source) => new Path2D(source));

function pathFor(object: PathObject): Path2D {
  return pathCache.get(object.path);
}

function fillAndStroke(context: CanvasRenderingContext2D, object: DrawableObject) {
  if (object.fill !== "none") context.fill();
  if (object.stroke && object.stroke !== "none") context.stroke();
}

function drawDrawable(context: CanvasRenderingContext2D, state: CanvasStateCache, object: DrawableObject) {
  state.applyDrawable(object);
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
      if (object.fill !== "none") context.fillText(object.value, object.x, object.y);
      if (object.stroke && object.stroke !== "none") context.strokeText(object.value, object.x, object.y);
      break;
    }
  }
}

function drawSelection(
  context: CanvasRenderingContext2D,
  state: CanvasStateCache,
  object: DrawableObject,
  stroke: string,
) {
  state.applySelection(stroke, object);
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
      context.strokeText(object.value, object.x, object.y);
      break;
  }
}

function drawItem(
  context: CanvasRenderingContext2D,
  state: CanvasStateCache,
  item: RenderItem,
  layerOpacity: number,
  selected: boolean,
  selectionStroke: string,
) {
  const [a, b, c, d, e, f] = item.matrix;
  context.setTransform(a, b, c, d, e, f);
  state.setGlobalAlpha(item.opacity * layerOpacity);
  drawDrawable(context, state, item.object);
  if (selected) {
    state.setGlobalAlpha(1);
    drawSelection(context, state, item.object, selectionStroke);
  }
}

function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number, background: string | null) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.clearRect(0, 0, width, height);
  if (background !== null) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }
  return context;
}

export function drawCompositionToCanvas(
  canvas: HTMLCanvasElement,
  composition: RenderComposition,
  selectedIds: readonly string[] = [],
  background: string | null = "#ffffff",
) {
  const context = prepareCanvas(canvas, composition.width, composition.height, background);
  const state = new CanvasStateCache(context);
  const selection = new Set(selectedIds);
  const selectionStroke = selection.size > 0
    ? getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#7c9cff"
    : "#7c9cff";

  for (const layer of composition.layers) {
    const allowSelection = layer.kind === "current";
    for (const item of layer.frame.items) {
      drawItem(context, state, item, layer.opacity, allowSelection && selection.has(item.id), selectionStroke);
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  return composition.hitTestFrame;
}

export function drawDocumentToCanvas(
  canvas: HTMLCanvasElement,
  document: EditorDocument,
  kernel: TransformKernel,
  selectedIds: readonly string[] = [],
  background: string | null = "#ffffff",
) {
  const composition = buildRenderComposition([
    { kind: "current", document, opacity: 1, hitTestable: true },
  ], kernel);
  return drawCompositionToCanvas(canvas, composition, selectedIds, background);
}

function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point | null {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

function applyHitTestStroke(context: CanvasRenderingContext2D, object: DrawableObject) {
  if (!object.stroke || object.stroke === "none") return;
  context.lineWidth = object.strokeWidth ?? 1;
  context.lineCap = object.strokeLinecap ?? "butt";
  context.lineJoin = object.strokeLinejoin ?? "miter";
  context.setLineDash([]);
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
      applyHitTestStroke(context, object);
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
  underlays = [],
  background = "#ffffff",
  onBackendChange,
  onNodePointerDown,
  onEmptyPointerDown,
  onRenderFailure,
}: CanvasSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef(document);
  const selectedIdsRef = useRef(selectedIds);
  const underlaysRef = useRef(underlays);
  const backgroundRef = useRef(background);
  const frameRef = useRef<RenderFrame | null>(null);
  const kernelRef = useRef<TransformKernel>(kernel ?? referenceTransformKernel);

  useEffect(() => {
    documentRef.current = document;
    selectedIdsRef.current = selectedIds;
    underlaysRef.current = underlays;
    backgroundRef.current = background;
  }, [background, document, selectedIds, underlays]);

  const draw = useCallback((activeKernel: TransformKernel) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const composition = buildRenderComposition([
        ...underlaysRef.current.map((layer) => ({
          kind: layer.kind,
          document: layer.document,
          opacity: layer.opacity,
          hitTestable: false,
        })),
        { kind: "current" as const, document: documentRef.current, opacity: 1, hitTestable: true },
      ], activeKernel);
      frameRef.current = drawCompositionToCanvas(
        canvas,
        composition,
        selectedIdsRef.current,
        backgroundRef.current,
      );
    } catch (error) {
      frameRef.current = null;
      onRenderFailure?.(asError(error));
    }
  }, [onRenderFailure]);

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
  }, [draw, kernel, onBackendChange]);

  useEffect(() => {
    draw(kernel ?? kernelRef.current);
  }, [background, document, draw, kernel, selectedIds, underlays]);

  return <canvas
    ref={canvasRef}
    className={className}
    aria-label={`${document.name} Canvas renderer`}
    data-renderer="canvas2d"
    data-composition-layer-count={underlays.length + 1}
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
