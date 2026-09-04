import type { Point } from "./model";

export type PenHandles = { inHandle: Point; outHandle: Point };

export function symmetricPenHandles(origin: Point, pointer: Point, threshold = 3): PenHandles | null {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  if (Math.hypot(dx, dy) < threshold) return null;
  return {
    inHandle: { x: origin.x - dx, y: origin.y - dy },
    outHandle: { x: origin.x + dx, y: origin.y + dy },
  };
}
