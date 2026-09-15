import type { PathObject, Point, RectangleObject, TextObject } from "../model";
import type { RenderFrame, RenderItem, RenderMatrix } from "./renderFrame";

export type ComplexShapeHitTester = {
  pathContains: (object: PathObject, point: Point) => boolean;
  textContains: (object: TextObject, point: Point) => boolean;
};

function roundedRectangleContains(object: RectangleObject, point: Point, inset = 0) {
  const x = object.x + inset;
  const y = object.y + inset;
  const width = object.width - inset * 2;
  const height = object.height - inset * 2;
  if (width <= 0 || height <= 0 || point.x < x || point.x > x + width || point.y < y || point.y > y + height) return false;

  const radius = Math.max(0, Math.min(object.cornerRadius - inset, width / 2, height / 2));
  if (radius === 0 || (point.x >= x + radius && point.x <= x + width - radius) || (point.y >= y + radius && point.y <= y + height - radius)) return true;

  const cornerX = point.x < x + radius ? x + radius : x + width - radius;
  const cornerY = point.y < y + radius ? y + radius : y + height - radius;
  const dx = point.x - cornerX;
  const dy = point.y - cornerY;
  return dx * dx + dy * dy <= radius * radius;
}

function rectangleContains(item: RenderItem, point: Point) {
  if (item.object.kind !== "rectangle") return false;
  const object = item.object;
  if (object.fill !== "none" && roundedRectangleContains(object, point)) return true;
  if (!object.stroke || object.stroke === "none" || (object.strokeWidth ?? 1) <= 0) return false;

  const halfStroke = (object.strokeWidth ?? 1) / 2;
  const outer: RectangleObject = {
    ...object,
    x: object.x - halfStroke,
    y: object.y - halfStroke,
    width: object.width + halfStroke * 2,
    height: object.height + halfStroke * 2,
    cornerRadius: object.cornerRadius + halfStroke,
  };
  return roundedRectangleContains(outer, point) && !roundedRectangleContains(object, point, halfStroke);
}

function circleContains(item: RenderItem, point: Point) {
  if (item.object.kind !== "circle") return false;
  const object = item.object;
  const dx = point.x - object.cx;
  const dy = point.y - object.cy;
  const distance = Math.hypot(dx, dy);
  if (object.fill !== "none" && distance <= object.radius) return true;
  if (!object.stroke || object.stroke === "none") return false;
  const halfStroke = (object.strokeWidth ?? 1) / 2;
  return distance >= Math.max(0, object.radius - halfStroke) && distance <= object.radius + halfStroke;
}

export function inverseTransformPoint(matrix: RenderMatrix, point: Point): Point | null {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null;
  const x = point.x - e;
  const y = point.y - f;
  return {
    x: (d * x - c * y) / determinant,
    y: (-b * x + a * y) / determinant,
  };
}

export function renderItemContainsPoint(item: RenderItem, worldPoint: Point, complex?: ComplexShapeHitTester) {
  const localPoint = inverseTransformPoint(item.matrix, worldPoint);
  if (!localPoint) return false;
  if (rectangleContains(item, localPoint) || circleContains(item, localPoint)) return true;
  if (item.object.kind === "path") return complex?.pathContains(item.object, localPoint) ?? false;
  if (item.object.kind === "text") return complex?.textContains(item.object, localPoint) ?? false;
  return false;
}

export function hitTestRenderFrame(frame: RenderFrame, point: Point, complex?: ComplexShapeHitTester): string | null {
  for (let index = frame.items.length - 1; index >= 0; index -= 1) {
    const item = frame.items[index];
    if (renderItemContainsPoint(item, point, complex)) return item.id;
  }
  return null;
}
