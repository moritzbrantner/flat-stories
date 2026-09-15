"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { DrawableObject, EditorDocument, PathObject } from "../model";
import { pathToSvg } from "../vectorPath";
import { buildRenderFrame } from "./renderFrame";
import { loadBrowserWasmTransformKernel, referenceTransformKernel, type TransformKernel } from "./transformKernel";

type CanvasSceneProps = {
  document: EditorDocument;
  kernel?: TransformKernel;
  className?: string;
  style?: CSSProperties;
  onBackendChange?: (backend: TransformKernel["name"]) => void;
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
  if (object.fill !== "none") context.fillStyle = object.fill;
  if (object.stroke && object.stroke !== "none") context.strokeStyle = object.stroke;
}

function fillAndStroke(context: CanvasRenderingContext2D, object: DrawableObject) {
  if (object.fill !== "none") context.fill();
  if (object.stroke && object.stroke !== "none") context.stroke();
}

export function drawDocumentToCanvas(canvas: HTMLCanvasElement, document: EditorDocument, kernel: TransformKernel) {
  if (canvas.width !== document.width) canvas.width = document.width;
  if (canvas.height !== document.height) canvas.height = document.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.clearRect(0, 0, document.width, document.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, document.width, document.height);

  const frame = buildRenderFrame(document, kernel);
  for (const item of frame.items) {
    const [a, b, c, d, e, f] = item.matrix;
    context.setTransform(a, b, c, d, e, f);
    context.globalAlpha = item.opacity;
    const object = item.object;
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
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  return frame;
}

export function CanvasScene({ document, kernel, className, style, onBackendChange }: CanvasSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef(document);
  const kernelRef = useRef<TransformKernel>(kernel ?? referenceTransformKernel);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    if (kernel) {
      kernelRef.current = kernel;
      onBackendChange?.(kernel.name);
      return;
    }
    let active = true;
    loadBrowserWasmTransformKernel().then((loaded) => {
      if (!active) return;
      kernelRef.current = loaded;
      onBackendChange?.(loaded.name);
      if (canvasRef.current) drawDocumentToCanvas(canvasRef.current, documentRef.current, loaded);
    }).catch(() => {
      if (!active) return;
      kernelRef.current = referenceTransformKernel;
      onBackendChange?.("typescript");
      if (canvasRef.current) drawDocumentToCanvas(canvasRef.current, documentRef.current, referenceTransformKernel);
    });
    return () => { active = false; };
  }, [kernel, onBackendChange]);

  useEffect(() => {
    if (canvasRef.current) drawDocumentToCanvas(canvasRef.current, document, kernel ?? kernelRef.current);
  }, [document, kernel]);

  return <canvas
    ref={canvasRef}
    className={className}
    aria-label={`${document.name} Canvas renderer`}
    data-renderer="canvas2d"
    width={document.width}
    height={document.height}
    style={style}
  />;
}
