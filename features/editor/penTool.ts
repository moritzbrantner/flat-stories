import type { PathObject, Point, VectorPath } from "./model";
import { createObject } from "./objectFactory";
import { snapPoint } from "./snapping";
import { pathBounds } from "./vectorPath";

/** Scene-unit distance from the first node within which a press closes the path. */
export const PEN_CLOSE_RADIUS = 8;
/** Scene-unit pointer travel below which a press stays a click (corner node). */
export const PEN_DRAG_THRESHOLD = 3;

/** A node being drawn; corner nodes have no handles, smooth nodes have mirrored handles. */
export type PenNode = { point: Point; inHandle?: Point; outHandle?: Point };

export type PenSession = {
  status: "drawing" | "finished" | "cancelled";
  nodes: PenNode[];
  closed: boolean;
  /** The raw press position while the pointer is down on the newest node. */
  press: Point | null;
};

/** Pointer events carry scene coordinates (already mapped from the screen). */
export type PenEvent =
  | { type: "pointerdown" | "pointermove" | "pointerup"; point: Point }
  | { type: "key"; key: "Enter" | "Escape" | "Backspace" };

export type PenOptions = { snapStep: number | null };

export function createPenSession(): PenSession {
  return { status: "drawing", nodes: [], closed: false, press: null };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function snap(point: Point, options: PenOptions): Point {
  return options.snapStep ? snapPoint(point, options.snapStep) : { x: point.x, y: point.y };
}

/** Corner or smooth node for a press at `press` that is currently at `pointer`. */
function dragNode(node: PenNode, press: Point, pointer: Point, options: PenOptions): PenNode {
  const corner = { point: node.point };
  if (distance(press, pointer) < PEN_DRAG_THRESHOLD) return corner;
  const outHandle = snap(pointer, options);
  if (outHandle.x === node.point.x && outHandle.y === node.point.y) return corner;
  const inHandle = { x: 2 * node.point.x - outHandle.x, y: 2 * node.point.y - outHandle.y };
  return { point: node.point, outHandle, inHandle };
}

function replaceLast(session: PenSession, node: PenNode): PenNode[] {
  return [...session.nodes.slice(0, -1), node];
}

/** Pure pen state machine: returns a new session, never mutates `session`. */
export function reducePenSession(session: PenSession, event: PenEvent, options: PenOptions): PenSession {
  if (session.status !== "drawing") return session;

  if (event.type === "key") {
    switch (event.key) {
      case "Escape": return { ...session, status: "cancelled", press: null };
      case "Enter": return session.nodes.length >= 2
        ? { ...session, status: "finished", closed: false, press: null }
        : { ...session, status: "cancelled", press: null };
      case "Backspace": return { ...session, nodes: session.nodes.slice(0, -1), press: null };
    }
  }

  if (event.type === "pointerdown") {
    const first = session.nodes[0];
    if (first && session.nodes.length >= 3 && distance(event.point, first.point) <= PEN_CLOSE_RADIUS) {
      return { ...session, status: "finished", closed: true, press: null };
    }
    return { ...session, nodes: [...session.nodes, { point: snap(event.point, options) }], press: { ...event.point } };
  }

  const press = session.press;
  const last = session.nodes.at(-1);
  if (!press || !last) return session;
  const node = dragNode(last, press, event.point, options);
  return { ...session, nodes: replaceLast(session, node), press: event.type === "pointerup" ? null : press };
}

/** The canonical path for a finished session, or null while drawing / when cancelled. */
export function penSessionToPath(session: PenSession, idPrefix: string): VectorPath | null {
  if (session.status !== "finished" || session.nodes.length < (session.closed ? 3 : 2)) return null;
  return {
    closed: session.closed,
    anchors: session.nodes.map((node, index) => ({
      id: `${idPrefix}-a${index + 1}`,
      point: { ...node.point },
      ...(node.inHandle ? { inHandle: { ...node.inHandle } } : {}),
      ...(node.outHandle ? { outHandle: { ...node.outHandle } } : {}),
    })),
  };
}

/** An ordinary path object (objectFactory defaults) for a pen path, pivoting on its bounds centre. */
export function createPenPathObject(id: string, path: VectorPath): PathObject {
  const base = createObject("path", id) as PathObject;
  const bounds = pathBounds(path);
  const pivot = bounds
    ? { pivotX: bounds.x + bounds.width / 2, pivotY: bounds.y + bounds.height / 2 }
    : { pivotX: base.transform.pivotX, pivotY: base.transform.pivotY };
  return { ...base, path, transform: { ...base.transform, ...pivot } };
}

/** The in-progress nodes as an open path for previewing. */
export function penSessionPreviewPath(session: PenSession): VectorPath {
  return {
    closed: false,
    anchors: session.nodes.map((node, index) => ({ id: `pen-preview-a${index + 1}`, ...node })),
  };
}
