import type { DrawableObject, Point, VectorPath } from "./model";
import { pathBounds, type Bounds } from "./vectorPath";

export type ResizeHandle = "nw" | "ne" | "se" | "sw";

export function drawableBounds(object: DrawableObject): Bounds {
  switch (object.kind) {
    case "rectangle": return { x: object.x, y: object.y, width: object.width, height: object.height };
    case "circle": return { x: object.cx - object.radius, y: object.cy - object.radius, width: object.radius * 2, height: object.radius * 2 };
    case "path": return pathBounds(object.path) ?? { x: 0, y: 0, width: 0, height: 0 };
    case "text": {
      const width = Math.max(object.fontSize * 0.6, object.value.length * object.fontSize * 0.58);
      return { x: object.x, y: object.y - object.fontSize, width, height: object.fontSize * 1.2 };
    }
  }
}

export function resizeBoundsFromHandle(bounds: Bounds, handle: ResizeHandle, point: Point, minimum = 1): Bounds {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const left = handle === "nw" || handle === "sw" ? Math.min(point.x, right - minimum) : bounds.x;
  const top = handle === "nw" || handle === "ne" ? Math.min(point.y, bottom - minimum) : bounds.y;
  const nextRight = handle === "ne" || handle === "se" ? Math.max(point.x, bounds.x + minimum) : right;
  const nextBottom = handle === "sw" || handle === "se" ? Math.max(point.y, bounds.y + minimum) : bottom;
  return { x: left, y: top, width: nextRight - left, height: nextBottom - top };
}

function mapCoordinate(value: number, sourceStart: number, sourceLength: number, targetStart: number, targetLength: number) {
  if (Math.abs(sourceLength) < 1e-9) return targetStart + targetLength / 2;
  return targetStart + ((value - sourceStart) / sourceLength) * targetLength;
}

function mapPoint(point: Point | undefined, source: Bounds, target: Bounds): Point | undefined {
  if (!point) return undefined;
  return {
    x: mapCoordinate(point.x, source.x, source.width, target.x, target.width),
    y: mapCoordinate(point.y, source.y, source.height, target.y, target.height),
  };
}

export function resizeVectorPath(path: VectorPath, source: Bounds, target: Bounds): VectorPath {
  return {
    ...path,
    anchors: path.anchors.map((anchor) => ({
      ...anchor,
      point: mapPoint(anchor.point, source, target)!,
      inHandle: mapPoint(anchor.inHandle, source, target),
      outHandle: mapPoint(anchor.outHandle, source, target),
    })),
  };
}

export function resizeDrawable(object: DrawableObject, target: Bounds): DrawableObject {
  const source = drawableBounds(object);
  switch (object.kind) {
    case "rectangle": return { ...object, x: target.x, y: target.y, width: target.width, height: target.height };
    case "circle": {
      const diameter = Math.max(1, Math.min(target.width, target.height));
      return { ...object, cx: target.x + target.width / 2, cy: target.y + target.height / 2, radius: diameter / 2 };
    }
    case "path": return { ...object, path: resizeVectorPath(object.path, source, target) };
    case "text": {
      const ratio = source.height <= 0 ? 1 : target.height / source.height;
      const fontSize = Math.max(1, object.fontSize * ratio);
      return { ...object, x: target.x, y: target.y + fontSize, fontSize };
    }
  }
}
