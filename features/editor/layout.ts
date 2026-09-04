import { drawableBounds } from "./geometry";
import type { EditorDocument, EditorObject, Point, Transform } from "./model";
import { findObject, findParentId, patchObjectTransform, siblingObjects } from "./sceneGraph";
import type { Bounds } from "./vectorPath";

export type Alignment = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";
export type Distribution = "horizontal" | "vertical";

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function transformMatrix(transform: Transform): Matrix {
  const radians = transform.rotation * Math.PI / 180;
  const rotationScale: Matrix = {
    a: Math.cos(radians) * transform.scaleX,
    b: Math.sin(radians) * transform.scaleX,
    c: -Math.sin(radians) * transform.scaleY,
    d: Math.cos(radians) * transform.scaleY,
    e: 0,
    f: 0,
  };
  const toPivot: Matrix = { a: 1, b: 0, c: 0, d: 1, e: transform.pivotX, f: transform.pivotY };
  const fromPivot: Matrix = { a: 1, b: 0, c: 0, d: 1, e: -transform.pivotX, f: -transform.pivotY };
  const translation: Matrix = { a: 1, b: 0, c: 0, d: 1, e: transform.x, f: transform.y };
  return multiply(translation, multiply(toPivot, multiply(rotationScale, fromPivot)));
}

function applyMatrix(point: Point, matrix: Matrix): Point {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
}

function transformBounds(bounds: Bounds, matrix: Matrix): Bounds {
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => applyMatrix(point, matrix));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function unionBounds(bounds: readonly Bounds[]): Bounds | null {
  if (bounds.length === 0) return null;
  const x = Math.min(...bounds.map((item) => item.x));
  const y = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x, y, width: right - x, height: bottom - y };
}

export function objectBoundsInParent(object: EditorObject): Bounds | null {
  if (object.boneId) return null;
  let local: Bounds | null;
  if (object.kind === "group") {
    local = unionBounds(object.children.map(objectBoundsInParent).filter((bounds): bounds is Bounds => bounds !== null));
  } else {
    local = drawableBounds(object);
  }
  return local ? transformBounds(local, transformMatrix(object.transform)) : null;
}

function selectedEntries(document: EditorDocument, ids: readonly string[]) {
  const siblings = siblingObjects(document, ids);
  if (!siblings || ids.length < 2) return null;
  const selected = new Set(ids);
  const entries = siblings
    .filter((node) => selected.has(node.id))
    .map((node) => ({ node, bounds: objectBoundsInParent(node) }))
    .filter((entry): entry is { node: EditorObject; bounds: Bounds } => entry.bounds !== null && !entry.node.locked);
  return entries.length === selected.size ? entries : null;
}

export function canArrangeSelection(document: EditorDocument, ids: readonly string[]) {
  return selectedEntries(document, ids) !== null;
}

export function alignObjects(document: EditorDocument, ids: readonly string[], alignment: Alignment): EditorDocument {
  const entries = selectedEntries(document, ids);
  if (!entries) return document;
  const selection = unionBounds(entries.map((entry) => entry.bounds))!;
  const target = alignment === "left" ? selection.x
    : alignment === "center-x" ? selection.x + selection.width / 2
    : alignment === "right" ? selection.x + selection.width
    : alignment === "top" ? selection.y
    : alignment === "center-y" ? selection.y + selection.height / 2
    : selection.y + selection.height;
  let next = document;
  for (const { node, bounds } of entries) {
    const current = alignment === "left" ? bounds.x
      : alignment === "center-x" ? bounds.x + bounds.width / 2
      : alignment === "right" ? bounds.x + bounds.width
      : alignment === "top" ? bounds.y
      : alignment === "center-y" ? bounds.y + bounds.height / 2
      : bounds.y + bounds.height;
    const horizontal = alignment === "left" || alignment === "center-x" || alignment === "right";
    next = patchObjectTransform(next, node.id, horizontal
      ? { x: node.transform.x + target - current }
      : { y: node.transform.y + target - current });
  }
  return next;
}

export function distributeObjects(document: EditorDocument, ids: readonly string[], distribution: Distribution): EditorDocument {
  const entries = selectedEntries(document, ids);
  if (!entries || entries.length < 3) return document;
  const center = (bounds: Bounds) => distribution === "horizontal"
    ? bounds.x + bounds.width / 2
    : bounds.y + bounds.height / 2;
  const ordered = [...entries].sort((a, b) => center(a.bounds) - center(b.bounds));
  const first = center(ordered[0].bounds);
  const last = center(ordered.at(-1)!.bounds);
  const step = (last - first) / (ordered.length - 1);
  let next = document;
  for (let index = 1; index < ordered.length - 1; index += 1) {
    const { node, bounds } = ordered[index];
    const delta = first + step * index - center(bounds);
    next = patchObjectTransform(next, node.id, distribution === "horizontal"
      ? { x: node.transform.x + delta }
      : { y: node.transform.y + delta });
  }
  return next;
}

export function selectionParentId(document: EditorDocument, ids: readonly string[]): string | null | undefined {
  if (ids.length === 0) return undefined;
  const first = findParentId(document.objects, ids[0]);
  return ids.every((id) => findParentId(document.objects, id) === first) ? first : undefined;
}

export function selectedObjects(document: EditorDocument, ids: readonly string[]): EditorObject[] {
  return ids.map((id) => findObject(document.objects, id)).filter((node): node is EditorObject => node !== null);
}
