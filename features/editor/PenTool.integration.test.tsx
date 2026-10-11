import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { fixtureDocument } from "./fixture";
import type { EditorDocument, PathObject } from "./model";
import { createObject } from "./objectFactory";
import { flattenObjects } from "./sceneGraph";

// Acceptance for issue #3 pen-style path creation, driven on the rendered Editor.
//
// jsdom has no layout, PointerEvent, SVG matrices or pointer capture. The stubs below make the
// artboard's screen-to-scene mapping the identity (client coordinates == scene coordinates)
// for both DOM conversion routes an implementation may use: `getScreenCTM().inverse()` with
// `createSVGPoint().matrixTransform()` (as PathEditorOverlay does) or the artboard
// `getBoundingClientRect()` scaled by the SVG's width/height.

const downloads = vi.hoisted(() => [] as unknown[]);
vi.mock("@moenarch/editor-core/browser", async (importOriginal) => {
  const original = await importOriginal<typeof import("@moenarch/editor-core/browser")>();
  return {
    ...original,
    downloadEditorJson: (value: unknown) => {
      downloads.push(structuredClone(value));
    },
  };
});

vi.setConfig({ testTimeout: 30_000 });

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number; inverse(): Matrix; multiply(other: Matrix): Matrix };

function identityMatrix(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => identityMatrix(), multiply: (other) => other };
}

const stubbed: { target: object; key: string }[] = [];

function stub(target: object, key: string, value: unknown) {
  if (Object.prototype.hasOwnProperty.call(target, key)) return;
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
  stubbed.push({ target, key });
}

beforeEach(() => {
  downloads.length = 0;
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? "mouse";
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    stub(window, "PointerEvent", PointerEventPolyfill);
  }
  stub(SVGElement.prototype, "getScreenCTM", () => identityMatrix());
  stub(SVGSVGElement.prototype, "createSVGPoint", () => ({
    x: 0,
    y: 0,
    matrixTransform(this: { x: number; y: number }, matrix: Matrix) {
      return { x: matrix.a * this.x + matrix.c * this.y + matrix.e, y: matrix.b * this.x + matrix.d * this.y + matrix.f };
    },
  }));
  stub(SVGSVGElement.prototype, "getBoundingClientRect", function (this: SVGSVGElement) {
    const width = Number(this.getAttribute("width") ?? 0);
    const height = Number(this.getAttribute("height") ?? 0);
    return { x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) };
  });
  stub(Element.prototype, "setPointerCapture", () => {});
  stub(Element.prototype, "releasePointerCapture", () => {});
  stub(Element.prototype, "hasPointerCapture", () => false);
});

afterEach(() => {
  for (const { target, key } of stubbed.splice(0)) delete (target as Record<string, unknown>)[key];
  vi.restoreAllMocks();
});

const toolbar = () => within(screen.getByRole("complementary", { name: "Drawing tools" }));
const inspector = () => within(screen.getByRole("complementary", { name: "Inspector" }));
const penButton = () => toolbar().getByRole("button", { name: "Pen" });
const layerCount = () => screen.getAllByRole("treeitem").length;
const fixtureLayerCount = flattenObjects(fixtureDocument.objects).length;

function blur() {
  (document.activeElement as HTMLElement | null)?.blur();
}

function renderEditor() {
  const user = userEvent.setup();
  const view = render(<Editor initialDocument={fixtureDocument} />);
  return { user, ...view };
}

/**
 * Pen input lands on whatever artwork is under the pointer. In the fixture that is the locked
 * full-artboard "Warm background" rectangle, so pen pointer events are dispatched on it and
 * must reach the pen (and must not select/drag the object underneath).
 */
function canvasTarget(container: HTMLElement): Element {
  const target = container.querySelector('svg.artboard [data-node-id="background"] rect');
  if (!target) throw new Error("Artboard background rectangle not rendered.");
  return target;
}

const pointer = (x: number, y: number, buttons: number) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons });

function penClick(container: HTMLElement, x: number, y: number) {
  const target = canvasTarget(container);
  fireEvent.pointerDown(target, pointer(x, y, 1));
  fireEvent.pointerUp(target, pointer(x, y, 0));
}

function penDrag(container: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  const target = canvasTarget(container);
  fireEvent.pointerDown(target, pointer(from.x, from.y, 1));
  fireEvent.pointerMove(target, pointer((from.x + to.x) / 2, (from.y + to.y) / 2, 1));
  fireEvent.pointerMove(target, pointer(to.x, to.y, 1));
  fireEvent.pointerUp(target, pointer(to.x, to.y, 0));
}

async function activatePen(user: UserEvent) {
  await user.click(penButton());
  expect(penButton()).toHaveAttribute("aria-pressed", "true");
  // Focus leaves the toolbar button when the user moves on to the canvas, so Enter/Escape
  // below cannot activate the button itself.
  blur();
}

async function savedDocument(user: UserEvent): Promise<EditorDocument> {
  const before = downloads.length;
  await user.click(screen.getByRole("button", { name: "Save project" }));
  expect(downloads).toHaveLength(before + 1);
  blur();
  return (downloads.at(-1) as { document: EditorDocument }).document;
}

function newPath(before: EditorDocument, after: EditorDocument): PathObject {
  expect(after.objects).toHaveLength(before.objects.length + 1);
  // Inserted where new objects normally go: appended at the root, on top of existing artwork.
  expect(after.objects.slice(0, -1)).toEqual(before.objects);
  const created = after.objects.at(-1)!;
  expect(created.kind).toBe("path");
  return created as PathObject;
}

function drawTriangle(container: HTMLElement) {
  penClick(container, 103, 97); // snaps to (100, 100) with the default 10-unit grid
  penClick(container, 200, 100);
  penClick(container, 150, 200);
  penClick(container, 102, 101); // within the close radius of the first node
}

describe("pen tool toggle", () => {
  it("is a toolbar toggle button named Pen that exposes its P shortcut", async () => {
    const { user } = renderEditor();
    expect(penButton()).toHaveAttribute("aria-pressed", "false");
    expect((penButton().getAttribute("aria-keyshortcuts") ?? "").toLowerCase().split(/\s+/)).toContain("p");
    await user.click(penButton());
    expect(penButton()).toHaveAttribute("aria-pressed", "true");
    await user.click(penButton());
    expect(penButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles with P but not with modified P or while typing in an editable field", async () => {
    const { user } = renderEditor();
    blur();
    await user.keyboard("p");
    expect(penButton()).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("p");
    expect(penButton()).toHaveAttribute("aria-pressed", "false");

    await user.keyboard("{Control>}p{/Control}");
    expect(penButton()).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("{Meta>}p{/Meta}");
    expect(penButton()).toHaveAttribute("aria-pressed", "false");

    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "p");
    expect(penButton()).toHaveAttribute("aria-pressed", "false");
    expect(name).toHaveValue("p");
  });

  it("does not draw while the pen is inactive", async () => {
    const { user, container } = renderEditor();
    const before = await savedDocument(user);
    penClick(container, 100, 100);
    penClick(container, 200, 100);
    await user.keyboard("{Enter}");
    expect(screen.queryByTestId("pen-preview")).not.toBeInTheDocument();
    expect(await savedDocument(user)).toEqual(before);
  });
});

describe("pen path creation", () => {
  it("draws a closed triangle by clicks into one new, selected path object", async () => {
    const { user, container } = renderEditor();
    const before = await savedDocument(user);
    await user.keyboard("p");
    expect(penButton()).toHaveAttribute("aria-pressed", "true");

    penClick(container, 103, 97);
    penClick(container, 200, 100);
    penClick(container, 150, 200);
    // In progress: previewed on the canvas, but not part of the document or its history.
    expect(screen.getByTestId("pen-preview")).toBeInTheDocument();
    expect(layerCount()).toBe(fixtureLayerCount);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    // The pen does not select (or drag) the artwork under the pointer.
    expect(inspector().getByRole("button", { name: "rectangle Warm background" })).toHaveAttribute("aria-pressed", "false");

    penClick(container, 102, 101);
    expect(screen.queryByTestId("pen-preview")).not.toBeInTheDocument();
    expect(layerCount()).toBe(fixtureLayerCount + 1);

    // Selected afterwards and editable with the existing node tools.
    expect(inspector().getByRole("button", { name: "path Path" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Path point count")).toHaveTextContent("3");
    expect(screen.getAllByRole("button", { name: /Path anchor/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Open path" })).toBeInTheDocument();

    const created = newPath(before, await savedDocument(user));
    const factory = createObject("path", created.id);
    expect(created.name).toBe(factory.name);
    expect(created.fill).toBe(factory.fill);
    expect(created.opacity).toBe(1);
    expect(created.visible).toBe(true);
    expect(created.locked).toBe(false);
    expect(created.path.closed).toBe(true);
    expect(created.path.anchors.map((anchor) => anchor.point)).toEqual([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 200 }]);
    for (const anchor of created.path.anchors) {
      expect(anchor.inHandle).toBeUndefined();
      expect(anchor.outHandle).toBeUndefined();
    }
    expect(new Set(created.path.anchors.map((anchor) => anchor.id)).size).toBe(3);
  });

  it("draws an open path with a dragged smooth node and finishes it with Enter", async () => {
    const { user, container } = renderEditor();
    const before = await savedDocument(user);
    await activatePen(user);

    penDrag(container, { x: 300, y: 300 }, { x: 340, y: 320 });
    penClick(container, 400, 300);
    await user.keyboard("{Enter}");

    expect(screen.queryByTestId("pen-preview")).not.toBeInTheDocument();
    expect(inspector().getByRole("button", { name: "path Path" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Path point count")).toHaveTextContent("2");
    const created = newPath(before, await savedDocument(user));
    expect(created.path.closed).toBe(false);
    expect(created.path.anchors).toHaveLength(2);
    expect(created.path.anchors[0]).toMatchObject({ point: { x: 300, y: 300 }, outHandle: { x: 340, y: 320 }, inHandle: { x: 260, y: 280 } });
    expect(created.path.anchors[1].point).toEqual({ x: 400, y: 300 });
    expect(created.path.anchors[1].inHandle).toBeUndefined();
    expect(created.path.anchors[1].outHandle).toBeUndefined();
  });

  it("removes the last node with Backspace while drawing", async () => {
    const { user, container } = renderEditor();
    const before = await savedDocument(user);
    await activatePen(user);
    penClick(container, 100, 100);
    penClick(container, 200, 100);
    penClick(container, 150, 200);
    await user.keyboard("{Backspace}");
    await user.keyboard("{Enter}");
    const created = newPath(before, await savedDocument(user));
    expect(created.path.closed).toBe(false);
    expect(created.path.anchors.map((anchor) => anchor.point)).toEqual([{ x: 100, y: 100 }, { x: 200, y: 100 }]);
  });

  it("cancels the in-progress path with Escape and starts fresh afterwards", async () => {
    const { user, container } = renderEditor();
    const before = await savedDocument(user);
    await activatePen(user);
    penClick(container, 100, 100);
    penClick(container, 200, 100);
    expect(screen.getByTestId("pen-preview")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("pen-preview")).not.toBeInTheDocument();
    expect(layerCount()).toBe(fixtureLayerCount);
    expect(await savedDocument(user)).toEqual(before);

    penClick(container, 500, 100);
    penClick(container, 600, 100);
    await user.keyboard("{Enter}");
    const created = newPath(before, await savedDocument(user));
    expect(created.path.anchors.map((anchor) => anchor.point)).toEqual([{ x: 500, y: 100 }, { x: 600, y: 100 }]);
  });

  it("creates nothing when finishing with too few nodes", async () => {
    const { user, container } = renderEditor();
    const before = await savedDocument(user);
    await activatePen(user);
    penClick(container, 100, 100);
    await user.keyboard("{Enter}");
    expect(screen.queryByTestId("pen-preview")).not.toBeInTheDocument();
    expect(layerCount()).toBe(fixtureLayerCount);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(await savedDocument(user)).toEqual(before);
  });

  it("undoes the whole created path in one step and redoes it", async () => {
    const { user, container } = renderEditor();
    const before = await savedDocument(user);
    await activatePen(user);
    drawTriangle(container);
    const after = await savedDocument(user);
    newPath(before, after);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    blur();
    expect(await savedDocument(user)).toEqual(before);
    expect(screen.queryByRole("button", { name: "path Path" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Redo" }));
    blur();
    expect(await savedDocument(user)).toEqual(after);
    expect(inspector().getByRole("button", { name: "path Path" })).toBeInTheDocument();
  });

  it("exports the created path to SVG like other paths", async () => {
    const { user, container } = renderEditor();
    const before = await savedDocument(user);
    await activatePen(user);
    drawTriangle(container);
    const created = newPath(before, await savedDocument(user));

    const blobs: Blob[] = [];
    stub(URL, "revokeObjectURL", () => {});
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      blobs.push(blob as Blob);
      return "blob:pen-test";
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Export SVG" }));
    expect(blobs).toHaveLength(1);
    const svg = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blobs[0]);
    });
    expect(svg).toContain(`<g id="${created.id}"`);
    expect(svg).toContain(`<path d="M100 100 L200 100 L150 200 Z" fill="${createObject("path", created.id).fill}"/>`);
  });
});
