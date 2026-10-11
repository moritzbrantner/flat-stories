import { describe, expect, it } from "vitest";
import type { Point } from "./model";
import { createObject } from "./objectFactory";
import {
  createPenPathObject,
  createPenSession,
  PEN_CLOSE_RADIUS,
  PEN_DRAG_THRESHOLD,
  penSessionToPath,
  reducePenSession,
  type PenEvent,
  type PenOptions,
  type PenSession,
} from "./penTool";
import { pathToSvg } from "./vectorPath";

// Acceptance for issue #3 pen-style path creation: the pure, deterministic pen session seam.
// The session maps pointer/keyboard events (already converted to scene coordinates) to the
// nodes being drawn and, once finished, to an ordinary canonical VectorPath.

const noSnap: PenOptions = { snapStep: null };
const grid: PenOptions = { snapStep: 10 };

function run(events: PenEvent[], options: PenOptions = noSnap, start: PenSession = createPenSession()) {
  return events.reduce((session, event) => reducePenSession(session, event, options), start);
}

const down = (x: number, y: number): PenEvent => ({ type: "pointerdown", point: { x, y } });
const move = (x: number, y: number): PenEvent => ({ type: "pointermove", point: { x, y } });
const up = (x: number, y: number): PenEvent => ({ type: "pointerup", point: { x, y } });
const key = (name: "Enter" | "Escape" | "Backspace"): PenEvent => ({ type: "key", key: name });

/** A press-and-release without movement: the pen's "click". */
const click = (x: number, y: number): PenEvent[] => [down(x, y), up(x, y)];
/** Press at `from`, drag through the midpoint to `to`, release at `to`. */
const drag = (from: Point, to: Point): PenEvent[] => [
  down(from.x, from.y),
  move((from.x + to.x) / 2, (from.y + to.y) / 2),
  move(to.x, to.y),
  up(to.x, to.y),
];

describe("pen session constants", () => {
  it("uses a small scene-unit close radius and drag threshold", () => {
    expect(PEN_CLOSE_RADIUS).toBe(8);
    expect(PEN_DRAG_THRESHOLD).toBe(3);
  });
});

describe("createPenSession", () => {
  it("starts an empty, open drawing session", () => {
    const session = createPenSession();
    expect(session.status).toBe("drawing");
    expect(session.nodes).toEqual([]);
    expect(session.closed).toBe(false);
    expect(penSessionToPath(session, "pen")).toBeNull();
  });
});

describe("reducePenSession: adding nodes", () => {
  it("adds a corner node (no handles) at the pointer on click", () => {
    const session = run(click(120, 80));
    expect(session.status).toBe("drawing");
    expect(session.nodes).toEqual([{ point: { x: 120, y: 80 } }]);
    expect(session.nodes[0].inHandle).toBeUndefined();
    expect(session.nodes[0].outHandle).toBeUndefined();
  });

  it("appends nodes in click order", () => {
    const session = run([...click(10, 10), ...click(50, 10), ...click(30, 40)]);
    expect(session.nodes.map((node) => node.point)).toEqual([{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 30, y: 40 }]);
  });

  it("press-and-drag adds a smooth node whose out handle follows the drag and whose in handle mirrors it", () => {
    const session = run(drag({ x: 100, y: 100 }, { x: 140, y: 120 }));
    expect(session.nodes).toEqual([
      { point: { x: 100, y: 100 }, outHandle: { x: 140, y: 120 }, inHandle: { x: 60, y: 80 } },
    ]);
  });

  it("updates the handles live while the pointer is still pressed", () => {
    const pressed = run([down(100, 100), move(130, 100)]);
    expect(pressed.nodes[0]).toEqual({ point: { x: 100, y: 100 }, outHandle: { x: 130, y: 100 }, inHandle: { x: 70, y: 100 } });
    const further = reducePenSession(pressed, move(100, 150), noSnap);
    expect(further.nodes[0]).toEqual({ point: { x: 100, y: 100 }, outHandle: { x: 100, y: 150 }, inHandle: { x: 100, y: 50 } });
  });

  it("uses the pointerup position as the final handle even without a preceding move", () => {
    const session = run([down(100, 100), up(110, 90)]);
    expect(session.nodes[0]).toEqual({ point: { x: 100, y: 100 }, outHandle: { x: 110, y: 90 }, inHandle: { x: 90, y: 110 } });
  });

  it("treats movement below the drag threshold as a click (corner node)", () => {
    const session = run([down(100, 100), move(101, 101), up(101, 101)]);
    expect(Math.hypot(1, 1)).toBeLessThan(PEN_DRAG_THRESHOLD);
    expect(session.nodes).toEqual([{ point: { x: 100, y: 100 } }]);
  });

  it("returns to a corner node when the drag comes back inside the threshold", () => {
    const session = run([down(100, 100), move(140, 100), move(101, 100), up(101, 100)]);
    expect(session.nodes).toEqual([{ point: { x: 100, y: 100 } }]);
  });

  it("ignores pointer moves while no button is pressed", () => {
    const before = run(click(100, 100));
    const after = reducePenSession(before, move(200, 200), noSnap);
    expect(after.nodes).toEqual(before.nodes);
  });

  it("does not mutate the previous session (pure reducer)", () => {
    const first = run(click(10, 10));
    const snapshot = structuredClone(first);
    reducePenSession(first, down(50, 50), noSnap);
    reducePenSession(first, key("Backspace"), noSnap);
    expect(first).toEqual(snapshot);
  });
});

describe("reducePenSession: grid snapping", () => {
  it("snaps node positions to the grid when a snap step is given", () => {
    const session = run([...click(103, 96), ...click(147, 151)], grid);
    expect(session.nodes.map((node) => node.point)).toEqual([{ x: 100, y: 100 }, { x: 150, y: 150 }]);
  });

  it("does not snap without a snap step", () => {
    const session = run(click(103, 96), noSnap);
    expect(session.nodes[0].point).toEqual({ x: 103, y: 96 });
  });

  it("snaps the dragged out handle too and mirrors the snapped handle", () => {
    const session = run(drag({ x: 103, y: 96 }, { x: 124, y: 87 }), grid);
    expect(session.nodes).toEqual([
      { point: { x: 100, y: 100 }, outHandle: { x: 120, y: 90 }, inHandle: { x: 80, y: 110 } },
    ]);
  });

  it("keeps a corner node when the snapped handle lands on the node itself", () => {
    // Raw drag distance exceeds the threshold, but the handle snaps back onto the node.
    const session = run(drag({ x: 100, y: 100 }, { x: 104, y: 100 }), grid);
    expect(session.nodes).toEqual([{ point: { x: 100, y: 100 } }]);
  });
});

describe("reducePenSession: closing on the first node", () => {
  const triangle = [...click(100, 100), ...click(200, 100), ...click(150, 200)];

  it("closes and finishes when the first node is clicked and the path has at least 3 nodes", () => {
    const session = run([...triangle, ...click(100, 100)]);
    expect(session.status).toBe("finished");
    expect(session.closed).toBe(true);
    expect(session.nodes.map((node) => node.point)).toEqual([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 200 }]);
  });

  it("closes when the press is within the close radius of the first node", () => {
    const session = run([...triangle, ...click(105, 100)]);
    expect(5).toBeLessThanOrEqual(PEN_CLOSE_RADIUS);
    expect(session.status).toBe("finished");
    expect(session.closed).toBe(true);
    expect(session.nodes).toHaveLength(3);
  });

  it("adds an ordinary node when the press is outside the close radius", () => {
    const session = run([...triangle, ...click(100, 112)]);
    expect(12).toBeGreaterThan(PEN_CLOSE_RADIUS);
    expect(session.status).toBe("drawing");
    expect(session.closed).toBe(false);
    expect(session.nodes).toHaveLength(4);
    expect(session.nodes[3].point).toEqual({ x: 100, y: 112 });
  });

  it("closes with snapping enabled when the raw press is near the first node", () => {
    const session = run([...click(100, 100), ...click(200, 100), ...click(150, 200), ...click(103, 98)], grid);
    expect(session.status).toBe("finished");
    expect(session.closed).toBe(true);
    expect(session.nodes).toHaveLength(3);
  });

  it("ignores further pointer and key events once finished", () => {
    const finished = run([...triangle, ...click(100, 100)]);
    const after = run([...click(300, 300), key("Backspace"), key("Escape"), key("Enter")], noSnap, finished);
    expect(after.status).toBe("finished");
    expect(after.closed).toBe(true);
    expect(after.nodes).toEqual(finished.nodes);
  });
});

describe("reducePenSession: keyboard", () => {
  it("Enter finishes an open path with at least 2 nodes", () => {
    const session = run([...click(10, 10), ...click(60, 10), key("Enter")]);
    expect(session.status).toBe("finished");
    expect(session.closed).toBe(false);
    expect(session.nodes).toHaveLength(2);
  });

  it("Enter with fewer than 2 nodes ends the session without a path", () => {
    for (const events of [[key("Enter")], [...click(10, 10), key("Enter")]]) {
      const session = run(events);
      expect(session.status).toBe("cancelled");
      expect(penSessionToPath(session, "pen")).toBeNull();
    }
  });

  it("Escape cancels the in-progress path", () => {
    const session = run([...click(10, 10), ...click(60, 10), ...click(30, 50), key("Escape")]);
    expect(session.status).toBe("cancelled");
    expect(penSessionToPath(session, "pen")).toBeNull();
  });

  it("Backspace removes the last node while drawing", () => {
    const session = run([...click(10, 10), ...drag({ x: 60, y: 10 }, { x: 80, y: 10 }), ...click(30, 50), key("Backspace")]);
    expect(session.status).toBe("drawing");
    expect(session.nodes).toEqual([
      { point: { x: 10, y: 10 } },
      { point: { x: 60, y: 10 }, outHandle: { x: 80, y: 10 }, inHandle: { x: 40, y: 10 } },
    ]);
    const empty = run([key("Backspace"), key("Backspace")], noSnap, run(click(1, 1)));
    expect(empty.status).toBe("drawing");
    expect(empty.nodes).toEqual([]);
  });

  it("counts only the remaining nodes after Backspace when closing", () => {
    // 3 nodes -> Backspace -> 2 nodes -> re-add the third -> clicking the first node closes a 3-node path.
    const session = run([...click(100, 100), ...click(200, 100), ...click(150, 200), key("Backspace"), ...click(150, 200), ...click(100, 100)]);
    expect(session.status).toBe("finished");
    expect(session.closed).toBe(true);
    expect(session.nodes.map((node) => node.point)).toEqual([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 200 }]);
  });
});

describe("penSessionToPath", () => {
  it("returns null while drawing", () => {
    expect(penSessionToPath(run([...click(10, 10), ...click(60, 10)]), "pen")).toBeNull();
  });

  it("returns a closed canonical VectorPath with deterministic anchor ids", () => {
    const session = run([...click(100, 100), ...click(200, 100), ...click(150, 200), ...click(100, 100)]);
    const path = penSessionToPath(session, "path-7");
    expect(path).toEqual({
      closed: true,
      anchors: [
        { id: "path-7-a1", point: { x: 100, y: 100 } },
        { id: "path-7-a2", point: { x: 200, y: 100 } },
        { id: "path-7-a3", point: { x: 150, y: 200 } },
      ],
    });
    expect(pathToSvg(path!)).toBe("M100 100 L200 100 L150 200 Z");
  });

  it("returns an open path that keeps smooth-node handles", () => {
    const session = run([...drag({ x: 300, y: 300 }, { x: 340, y: 320 }), ...click(400, 300), key("Enter")]);
    const path = penSessionToPath(session, "p");
    expect(path).toEqual({
      closed: false,
      anchors: [
        { id: "p-a1", point: { x: 300, y: 300 }, outHandle: { x: 340, y: 320 }, inHandle: { x: 260, y: 280 } },
        { id: "p-a2", point: { x: 400, y: 300 } },
      ],
    });
    expect(pathToSvg(path!)).toBe("M300 300 C340 320 400 300 400 300");
  });
});

describe("createPenPathObject", () => {
  it("creates an ordinary path object with objectFactory paint defaults and a centered pivot", () => {
    const path = penSessionToPath(run([...click(100, 100), ...click(200, 100), ...click(150, 200), ...click(100, 100)]), "path-3")!;
    const object = createPenPathObject("path-3", path);
    const factoryPath = createObject("path", "path-3");
    expect(object).toEqual({
      ...factoryPath,
      path,
      transform: { ...factoryPath.transform, pivotX: 150, pivotY: 150 },
    });
    expect(object.kind).toBe("path");
    expect(object.name).toBe("Path");
    expect(object.fill).toBe(factoryPath.fill);
    expect(object.path).toBe(path);
  });
});
