import type { Point } from "./model";

export function snapValue(value: number, step: number) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const snapped = Math.round(value / step) * step;
  return Object.is(snapped, -0) ? 0 : snapped;
}

export function snapPoint(point: Point, step: number): Point {
  return { x: snapValue(point.x, step), y: snapValue(point.y, step) };
}
