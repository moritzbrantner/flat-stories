import type { PathAnchor, Point, VectorPath } from "./model";

export type Bounds = { x: number; y: number; width: number; height: number };

const EPSILON = 1e-12;

function formatNumber(value: number) {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function segmentToSvg(from: PathAnchor, to: PathAnchor) {
  if (!from.outHandle && !to.inHandle) return `L${formatNumber(to.point.x)} ${formatNumber(to.point.y)}`;
  const first = from.outHandle ?? from.point;
  const second = to.inHandle ?? to.point;
  return `C${formatNumber(first.x)} ${formatNumber(first.y)} ${formatNumber(second.x)} ${formatNumber(second.y)} ${formatNumber(to.point.x)} ${formatNumber(to.point.y)}`;
}

export function pathToSvg(path: VectorPath): string {
  const first = path.anchors[0];
  if (!first) return "";
  const commands = [`M${formatNumber(first.point.x)} ${formatNumber(first.point.y)}`];
  for (let index = 1; index < path.anchors.length; index += 1) {
    commands.push(segmentToSvg(path.anchors[index - 1], path.anchors[index]));
  }
  if (path.closed && path.anchors.length > 1) {
    const last = path.anchors.at(-1)!;
    if (last.outHandle || first.inHandle) commands.push(segmentToSvg(last, first));
    commands.push("Z");
  }
  return commands.join(" ");
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, time: number) {
  const inverse = 1 - time;
  return inverse ** 3 * p0 + 3 * inverse ** 2 * time * p1 + 3 * inverse * time ** 2 * p2 + time ** 3 * p3;
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number) {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 6 * (p0 - 2 * p1 + p2);
  const c = 3 * (p1 - p0);
  if (Math.abs(a) < EPSILON) {
    if (Math.abs(b) < EPSILON) return [];
    const root = -c / b;
    return root > 0 && root < 1 ? [root] : [];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const sqrt = Math.sqrt(discriminant);
  const roots = [(-b + sqrt) / (2 * a), (-b - sqrt) / (2 * a)];
  return roots.filter((root, index) => root > 0 && root < 1 && (index === 0 || Math.abs(root - roots[0]) > EPSILON));
}

function includePoint(point: Point, values: { xs: number[]; ys: number[] }) {
  values.xs.push(point.x);
  values.ys.push(point.y);
}

function includeSegment(from: PathAnchor, to: PathAnchor, values: { xs: number[]; ys: number[] }) {
  const first = from.outHandle ?? from.point;
  const second = to.inHandle ?? to.point;
  includePoint(from.point, values);
  includePoint(to.point, values);
  if (!from.outHandle && !to.inHandle) return;
  for (const time of cubicExtrema(from.point.x, first.x, second.x, to.point.x)) {
    values.xs.push(cubicAt(from.point.x, first.x, second.x, to.point.x, time));
  }
  for (const time of cubicExtrema(from.point.y, first.y, second.y, to.point.y)) {
    values.ys.push(cubicAt(from.point.y, first.y, second.y, to.point.y, time));
  }
}

export function pathBounds(path: VectorPath): Bounds | null {
  if (path.anchors.length === 0) return null;
  const values = { xs: [] as number[], ys: [] as number[] };
  if (path.anchors.length === 1) includePoint(path.anchors[0].point, values);
  for (let index = 1; index < path.anchors.length; index += 1) {
    includeSegment(path.anchors[index - 1], path.anchors[index], values);
  }
  if (path.closed && path.anchors.length > 1) includeSegment(path.anchors.at(-1)!, path.anchors[0], values);
  const minX = Math.min(...values.xs);
  const maxX = Math.max(...values.xs);
  const minY = Math.min(...values.ys);
  const maxY = Math.max(...values.ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function movePathAnchor(path: VectorPath, anchorId: string, point: Point): VectorPath {
  let changed = false;
  const anchors = path.anchors.map((anchor) => {
    if (anchor.id !== anchorId) return anchor;
    const dx = point.x - anchor.point.x;
    const dy = point.y - anchor.point.y;
    if (dx === 0 && dy === 0) return anchor;
    changed = true;
    return {
      ...anchor,
      point,
      inHandle: anchor.inHandle ? { x: anchor.inHandle.x + dx, y: anchor.inHandle.y + dy } : undefined,
      outHandle: anchor.outHandle ? { x: anchor.outHandle.x + dx, y: anchor.outHandle.y + dy } : undefined,
    };
  });
  return changed ? { ...path, anchors } : path;
}

export function updatePathHandle(path: VectorPath, anchorId: string, handle: "inHandle" | "outHandle", point: Point | undefined): VectorPath {
  let changed = false;
  const anchors = path.anchors.map((anchor) => {
    if (anchor.id !== anchorId) return anchor;
    const current = anchor[handle];
    if (current?.x === point?.x && current?.y === point?.y) return anchor;
    changed = true;
    return { ...anchor, [handle]: point };
  });
  return changed ? { ...path, anchors } : path;
}

export function togglePathHandles(path: VectorPath, anchorId: string, radius = 32): VectorPath {
  let changed = false;
  const anchors = path.anchors.map((anchor) => {
    if (anchor.id !== anchorId) return anchor;
    changed = true;
    if (anchor.inHandle || anchor.outHandle) return { ...anchor, inHandle: undefined, outHandle: undefined };
    return {
      ...anchor,
      inHandle: { x: anchor.point.x - radius, y: anchor.point.y },
      outHandle: { x: anchor.point.x + radius, y: anchor.point.y },
    };
  });
  return changed ? { ...path, anchors } : path;
}

export function appendPathAnchor(path: VectorPath, anchor: PathAnchor): VectorPath {
  if (path.anchors.some((candidate) => candidate.id === anchor.id)) return path;
  return { ...path, anchors: [...path.anchors, anchor] };
}

export function mirrorPath(path: VectorPath, axis: "horizontal" | "vertical"): VectorPath {
  const bounds = pathBounds(path);
  if (!bounds) return path;
  const center = axis === "horizontal" ? bounds.x + bounds.width / 2 : bounds.y + bounds.height / 2;
  const mirrorPoint = (point: Point | undefined) => {
    if (!point) return undefined;
    return axis === "horizontal"
      ? { x: center * 2 - point.x, y: point.y }
      : { x: point.x, y: center * 2 - point.y };
  };
  return {
    ...path,
    anchors: path.anchors.map((anchor) => ({
      ...anchor,
      point: mirrorPoint(anchor.point)!,
      inHandle: mirrorPoint(anchor.inHandle),
      outHandle: mirrorPoint(anchor.outHandle),
    })),
  };
}
