"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isEditorEditableTarget, matchesEditorHotkey } from "@moenarch/editor-core/hotkeys";
import { sampleAnimation } from "./animation";
import { keyframePose, keyframeProperty, removeKeyframeAtTime, removeTrackKeyframe, updateTrackKeyframe } from "./animationAuthoring";
import { CharacterPresetPanel } from "./CharacterPresetPanel";
import { useFlatStoriesEditorRuntime } from "./editorRuntime";
import { LayerTreePanel } from "./LayerTreePanel";
import { browserEditorEngine } from "./engine";
import { KeyframeInspector } from "./KeyframeInspector";
import { alignObjects, canArrangeSelection, distributeObjects, type Alignment, type Distribution } from "./layout";
import type { AnimationTrack, CharacterRig, DrawableObject, Easing, EditorDocument, EditorObject, GroupObject, NumberKeyframe, Point, StrokeLinecap, StrokeLinejoin, Transform, VectorPath } from "./model";
import { createObject, type CreatableObjectKind } from "./objectFactory";
import { getOnionSkinTimes } from "./onionSkin";
import { OnionSkinControls } from "./OnionSkinControls";
import { PathEditorOverlay } from "./PathEditorOverlay";
import { createPenPathObject, createPenSession, penSessionToPath, reducePenSession, type PenEvent, type PenSession } from "./penTool";
import { PenPreview } from "./PenPreview";
import { PlaybackControls } from "./PlaybackControls";
import { applyCharacterPose, applyExpression, captureCharacterPose, captureExpression, upsertExpression, upsertPose } from "./poses";
import { ProjectControls } from "./ProjectControls";
import { PropertyKeyControls } from "./PropertyKeyControls";
import { AnimationCanvasPreview } from "./rendering/AnimationCanvasPreview";
import {
  duplicateSiblingObjects,
  findObject,
  groupRootObjects,
  objectTransformToSvg,
  patchObject,
  patchObjectTransform,
  reorderObject,
  ungroupRootObject,
  type LayerDirection,
} from "./sceneGraph";
import {
  boneWorldTransformToSvg,
  getBoneWorldPose,
  resetRigPose,
  solveRigConstraint,
  updateConstraintTarget,
} from "./rig";
import { snapValue } from "./snapping";
import { SvgExportButton } from "./SvgExportButton";
import { TimelinePoseControls } from "./TimelinePoseControls";
import { TransformOverlay } from "./TransformOverlay";
import { appendPathAnchor, mirrorPath, movePathAnchor, pathToSvg, togglePathHandles, updatePathHandle } from "./vectorPath";

type EditorProps = { initialDocument: EditorDocument };
type DocumentUpdate = EditorDocument | ((document: EditorDocument) => EditorDocument);
type Viewport = Point & { zoom: number };
type DragState = { id: string; pointer: Point; transform: Transform; basisRotation: number };
type PathHandle = "inHandle" | "outHandle";
type PreviewRenderer = "canvas" | "svg";
type PreviewBackend = "typescript" | "rust-wasm";

type OnionSkinFrame = {
  kind: "previous" | "next";
  time: number;
  document: EditorDocument;
};

const GRID_STEP = 10;
const PEN_HOTKEY = "P";
const PEN_KEYS = new Set(["Enter", "Escape", "Backspace"]);
const tools: { kind: CreatableObjectKind; label: string }[] = [
  { kind: "rectangle", label: "Rectangle" },
  { kind: "circle", label: "Circle" },
  { kind: "path", label: "Path" },
  { kind: "text", label: "Text" },
];

function rotateVector(point: Point, rotation: number): Point {
  const angle = rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}


/** Layer/layout command shortcuts (issue #3); each runs the same command as its button. */
const LAYOUT_SHORTCUTS = {
  duplicate: "Mod+D",
  forward: "Mod+]",
  backward: "Mod+[",
  alignLeft: "Alt+Shift+ArrowLeft",
  alignRight: "Alt+Shift+ArrowRight",
  alignTop: "Alt+Shift+ArrowUp",
  alignBottom: "Alt+Shift+ArrowDown",
  alignCenterX: "Shift+H",
  alignCenterY: "Shift+V",
  distributeHorizontal: "Mod+Shift+ArrowRight",
  distributeVertical: "Mod+Shift+ArrowDown",
} as const;

type LayoutShortcut = keyof typeof LAYOUT_SHORTCUTS;

/** Scene coordinates of a pointer event on the artboard (same mapping as PathEditorOverlay). */
function artboardPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const scene = point.matrixTransform(matrix.inverse());
  return { x: scene.x, y: scene.y };
}

/** `aria-keyshortcuts` and title for a button whose command has a layout shortcut. */
function shortcutProps(command: LayoutShortcut, label: string) {
  const hotkey = LAYOUT_SHORTCUTS[command];
  const aria = hotkey.startsWith("Mod+")
    ? `${hotkey.replace("Mod+", "Control+")} ${hotkey.replace("Mod+", "Meta+")}`
    : hotkey;
  return { "aria-keyshortcuts": aria, title: `${label} (${hotkey.replace("Mod+", "Ctrl+")})` };
}

export function Editor({ initialDocument }: EditorProps) {
  const prepared = useMemo(() => browserEditorEngine.prepareDocument(initialDocument), [initialDocument]);
  const initialSelection = useMemo(() => prepared.objects.at(-1)?.id ? [prepared.objects.at(-1)!.id] : [], [prepared]);
  const {
    canRedo,
    canUndo,
    commit,
    document,
    endInteraction,
    redo,
    resetDocument,
    undo,
  } = useFlatStoriesEditorRuntime(prepared);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection);
  const [viewport, setViewport] = useState<Viewport>({ x: 70, y: 50, zoom: 0.85 });
  const [showRig, setShowRig] = useState(Boolean(prepared.rig));
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [clipId, setClipId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(false);
  const [onionSkinOffset, setOnionSkinOffset] = useState(0.1);
  const [previewRenderer, setPreviewRenderer] = useState<PreviewRenderer>("canvas");
  const [previewBackend, setPreviewBackend] = useState<PreviewBackend>("typescript");
  const [canvasPreviewFailed, setCanvasPreviewFailed] = useState(false);
  const panStart = useRef<{ pointer: Point; viewport: Point } | null>(null);
  const objectDrag = useRef<DragState | null>(null);
  const idCounter = useRef(0);
  const [penActive, setPenActive] = useState(false);
  const [penSession, setPenSession] = useState<PenSession>(createPenSession);
  const [penPointer, setPenPointer] = useState<Point | null>(null);
  const penSessionRef = useRef(penSession);

  function setDocument(update: DocumentUpdate) {
    commit(update, { id: "edit-document", label: "Edit document" });
  }

  const selectedId = selectedIds.at(-1) ?? null;
  const selected = selectedId ? findObject(document.objects, selectedId) : null;
  const selectedClip = document.animations.find((clip) => clip.id === clipId) ?? null;
  const displayDocument = useMemo(() => sampleAnimation(document, clipId, currentTime), [document, clipId, currentTime]);
  const displaySelected = selectedId ? findObject(displayDocument.objects, selectedId) : null;
  const onionSkinFrames = useMemo<OnionSkinFrame[]>(() => {
    if (!onionSkinEnabled || !selectedClip || !clipId) return [];
    const times = getOnionSkinTimes(selectedClip, currentTime, onionSkinOffset);
    const frames: OnionSkinFrame[] = [];
    if (times.previous !== null) frames.push({ kind: "previous", time: times.previous, document: sampleAnimation(document, clipId, times.previous) });
    if (times.next !== null) frames.push({ kind: "next", time: times.next, document: sampleAnimation(document, clipId, times.next) });
    return frames;
  }, [clipId, currentTime, document, onionSkinEnabled, onionSkinOffset, selectedClip]);
  const canvasOnionSkins = useMemo(() => onionSkinFrames.map((frame) => ({
    kind: frame.kind === "previous" ? "onion-previous" as const : "onion-next" as const,
    document: frame.document,
    opacity: frame.kind === "previous" ? 0.18 : 0.12,
  })), [onionSkinFrames]);
  const rootIds = useMemo(() => new Set(document.objects.map((object) => object.id)), [document.objects]);
  const canGroup = selectedIds.length > 1 && selectedIds.every((id) => rootIds.has(id));
  const canUngroup = selectedIds.length === 1 && rootIds.has(selectedIds[0]) && selected?.kind === "group";
  const editingEnabled = clipId === null;
  const useCanvasPreview = !editingEnabled && previewRenderer === "canvas" && !canvasPreviewFailed;
  const canArrange = editingEnabled && canArrangeSelection(document, selectedIds);
  const previewStatus = useCanvasPreview
    ? `Canvas · ${previewBackend === "rust-wasm" ? "Rust/WASM" : "TypeScript"}${onionSkinFrames.length > 0 ? ` · onion ${onionSkinFrames.length}` : ""}`
    : previewRenderer === "canvas" && canvasPreviewFailed
      ? "SVG reference · Canvas unavailable"
      : "SVG reference";

  const handlePreviewSelection = useCallback((id: string | null, additive: boolean) => {
    if (!id) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
    });
  }, []);

  const handlePreviewBackendChange = useCallback((backend: PreviewBackend) => {
    setPreviewBackend(backend);
  }, []);

  const handlePreviewFailure = useCallback(() => {
    setCanvasPreviewFailed(true);
  }, []);

  // Shortcuts call the latest command closures (they guard exactly like the buttons).
  const layoutCommandRef = useRef<(command: LayoutShortcut) => void>(() => {});
  useLayoutEffect(() => {
    layoutCommandRef.current = (command) => {
    switch (command) {
      case "duplicate": return duplicateSelection();
      case "forward": return reorderSelection("forward");
      case "backward": return reorderSelection("backward");
      case "alignLeft": return alignSelection("left");
      case "alignRight": return alignSelection("right");
      case "alignTop": return alignSelection("top");
      case "alignBottom": return alignSelection("bottom");
      case "alignCenterX": return alignSelection("center-x");
      case "alignCenterY": return alignSelection("center-y");
      case "distributeHorizontal": return distributeSelection("horizontal");
      case "distributeVertical": return distributeSelection("vertical");
    }
  };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditorEditableTarget(event.target)) return;
      if (penKeyRef.current(event)) return;
      if (matchesEditorHotkey(event, "Mod+Shift+z")) {
        event.preventDefault();
        redo();
        setSelectedIds([]);
      } else if (matchesEditorHotkey(event, "Mod+z")) {
        event.preventDefault();
        undo();
        setSelectedIds([]);
      } else if (!event.defaultPrevented) {
        const command = (Object.keys(LAYOUT_SHORTCUTS) as LayoutShortcut[]).find((candidate) =>
          matchesEditorHotkey(event, LAYOUT_SHORTCUTS[candidate]));
        // The layer tree owns arrow keys (navigation/selection) while it has focus; running a
        // layout command there would act on a selection the same keystroke just changed.
        const fromLayerTree = event.target instanceof Element && event.target.closest('[role="tree"]') !== null;
        if (command && !(fromLayerTree && LAYOUT_SHORTCUTS[command].includes("Arrow"))) {
          event.preventDefault();
          layoutCommandRef.current(command);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  // Pen tool: the session is the pure penTool state machine; only a finished path is committed.
  const penEnabled = penActive && editingEnabled;

  function resetPen(session = createPenSession()) {
    penSessionRef.current = session;
    setPenSession(session);
    setPenPointer(null);
  }

  function togglePen() {
    if (!editingEnabled && !penActive) return;
    resetPen();
    setPenActive((current) => !current);
  }

  function dispatchPen(event: PenEvent) {
    const next = reducePenSession(penSessionRef.current, event, { snapStep: snapToGrid ? GRID_STEP : null });
    if (next === penSessionRef.current) return;
    if (next.status === "drawing") {
      penSessionRef.current = next;
      setPenSession(next);
      return;
    }
    resetPen();
    if (next.status !== "finished") return;
    const id = nextId("path");
    const path = penSessionToPath(next, id);
    if (!path) return;
    const object = createPenPathObject(id, path);
    commit((current) => ({ ...current, objects: [...current.objects, object] }), {
      id: "add-object",
      label: "Add path",
    });
    setSelectedIds([object.id]);
  }

  // Leaving editing (animation preview) discards an unfinished pen path.
  useEffect(() => {
    if (!editingEnabled && penSessionRef.current.nodes.length > 0) resetPen();
  }, [editingEnabled]);

  function penPointerEvent(event: ReactPointerEvent<SVGSVGElement>, type: "pointerdown" | "pointermove" | "pointerup") {
    if (!penEnabled) return;
    // Capture phase on the artboard: the pen owns the press, so artwork underneath is neither
    // selected nor dragged.
    event.stopPropagation();
    if (type === "pointerdown") {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    const point = artboardPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    if (type === "pointermove") setPenPointer(point);
    dispatchPen({ type, point });
  }

  // A cancelled press (touch gesture, lost capture) never sends pointerup; keep the node as drawn
  // so later button-less moves cannot keep reshaping it.
  function releasePenPress() {
    const session = penSessionRef.current;
    if (!session.press) return;
    const next = { ...session, press: null };
    penSessionRef.current = next;
    setPenSession(next);
  }

  const penKeyRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  useLayoutEffect(() => {
    penKeyRef.current = (event) => {
      if (matchesEditorHotkey(event, PEN_HOTKEY)) {
        event.preventDefault();
        togglePen();
        return true;
      }
      if (!penEnabled || !PEN_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
      // Focused controls keep their own Enter/Escape/Backspace behaviour.
      if (event.target instanceof Element && event.target.closest("button, a[href], [role='button'], [role='tree']")) return false;
      event.preventDefault();
      // Escape with nothing drawn leaves the pen tool.
      if (event.key === "Escape" && penSessionRef.current.nodes.length === 0) {
        setPenActive(false);
        resetPen();
        return true;
      }
      dispatchPen({ type: "key", key: event.key as "Enter" | "Escape" | "Backspace" });
      return true;
    };
  });

  function loadProject(nextDocument: EditorDocument) {
    resetDocument(browserEditorEngine.prepareDocument(nextDocument));
    setSelectedIds([]);
    setClipId(null);
    setCurrentTime(0);
    setOnionSkinEnabled(false);
    setOnionSkinOffset(0.1);
    setCanvasPreviewFailed(false);
    panStart.current = null;
    objectDrag.current = null;
    idCounter.current = 0;
    resetPen();
  }

  function nextId(prefix: string, existingIds: readonly string[] = []) {
    let id: string;
    do id = `${prefix}-${++idCounter.current}`;
    while (findObject(document.objects, id) || existingIds.includes(id));
    return id;
  }

  function selectNode(id: string, additive = false) {
    setSelectedIds((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
    });
  }

  function addObject(kind: CreatableObjectKind) {
    if (!editingEnabled) return;
    const object = createObject(kind, nextId(kind));
    commit((current) => ({ ...current, objects: [...current.objects, object] }), {
      id: "add-object",
      label: `Add ${kind}`,
    });
    setSelectedIds([object.id]);
  }

  function updateSelected(patch: Partial<EditorObject>) {
    if (!selectedId || !editingEnabled) return;
    setDocument((current) => patchObject(current, selectedId, patch));
  }

  function updateSelectedTransform(patch: Partial<Transform>) {
    if (!selectedId || !editingEnabled) return;
    setDocument((current) => patchObjectTransform(current, selectedId, patch));
  }

  function replaceDrawable(id: string, drawable: DrawableObject) {
    if (!editingEnabled) return;
    setDocument((current) => patchObject(current, id, drawable as Partial<EditorObject>));
  }

  function updatePath(pathId: string, update: (path: VectorPath) => VectorPath) {
    if (!editingEnabled) return;
    setDocument((current) => {
      const object = findObject(current.objects, pathId);
      if (!object || object.kind !== "path" || object.locked) return current;
      const path = update(object.path);
      return path === object.path ? current : patchObject(current, pathId, { path } as Partial<EditorObject>);
    });
  }

  function addPathPoint(pathId: string) {
    const anchorId = `${pathId}-anchor-${++idCounter.current}`;
    updatePath(pathId, (path) => {
      const last = path.anchors.at(-1)?.point ?? { x: 100, y: 100 };
      return appendPathAnchor(path, { id: anchorId, point: { x: last.x + 48, y: last.y } });
    });
  }

  function groupSelection() {
    if (!canGroup || !editingEnabled) return;
    const id = nextId("group");
    commit((current) => groupRootObjects(current, selectedIds, id), {
      id: "group-objects",
      label: "Group objects",
    });
    setSelectedIds([id]);
  }

  function ungroupSelection() {
    if (!canUngroup || !selectedId || selected?.kind !== "group" || !editingEnabled) return;
    const childIds = selected.children.map((child) => child.id);
    commit((current) => ungroupRootObject(current, selectedId), {
      id: "ungroup-objects",
      label: "Ungroup objects",
    });
    setSelectedIds(childIds);
  }

  function duplicateSelection() {
    if (!editingEnabled || selectedIds.length === 0) return;
    const result = duplicateSiblingObjects(document, selectedIds, (kind) => nextId(kind));
    if (result.duplicatedIds.length === 0) return;
    commit(result.document, {
      id: "duplicate-objects",
      label: "Duplicate objects",
    });
    setSelectedIds(result.duplicatedIds);
  }

  function reorderSelection(direction: LayerDirection) {
    if (!editingEnabled || !selectedId || selectedIds.length !== 1) return;
    setDocument((current) => reorderObject(current, selectedId, direction));
  }

  function alignSelection(alignment: Alignment) {
    if (!canArrange) return;
    setDocument((current) => alignObjects(current, selectedIds, alignment));
  }

  function distributeSelection(distribution: Distribution) {
    if (!canArrange || selectedIds.length < 3) return;
    setDocument((current) => distributeObjects(current, selectedIds, distribution));
  }

  function updateRig(update: (rig: CharacterRig) => CharacterRig) {
    if (!editingEnabled) return;
    setDocument((current) => current.rig ? { ...current, rig: update(current.rig) } : current);
  }

  function savePose(name: string) {
    if (!editingEnabled || !document.rig) return;
    const id = nextId("pose", (document.poses ?? []).map((pose) => pose.id));
    setDocument((current) => upsertPose(current, captureCharacterPose(current, id, name)));
  }

  function applySavedPose(id: string) {
    if (!editingEnabled) return;
    setDocument((current) => {
      const pose = (current.poses ?? []).find((candidate) => candidate.id === id);
      return pose ? applyCharacterPose(current, pose) : current;
    });
  }

  function saveExpression(name: string) {
    if (!editingEnabled || selectedIds.length === 0) return;
    const id = nextId("expression", (document.expressions ?? []).map((expression) => expression.id));
    setDocument((current) => upsertExpression(current, captureExpression(current, id, name, selectedIds)));
  }

  function applySavedExpression(id: string) {
    if (!editingEnabled) return;
    setDocument((current) => {
      const expression = (current.expressions ?? []).find((candidate) => candidate.id === id);
      return expression ? applyExpression(current, expression) : current;
    });
  }

  function keyPoseAtCurrentTime(poseId: string) {
    if (!clipId) return;
    setDocument((current) => {
      const pose = (current.poses ?? []).find((candidate) => candidate.id === poseId);
      if (!pose) return current;
      return {
        ...current,
        animations: current.animations.map((clip) => clip.id === clipId ? keyframePose(clip, pose, currentTime) : clip),
      };
    });
  }

  function keyPropertyAtCurrentTime(
    target: AnimationTrack["target"],
    property: AnimationTrack["property"],
    value: number,
    easing: Easing,
  ) {
    if (!clipId) return;
    setDocument((current) => ({
      ...current,
      animations: current.animations.map((clip) => clip.id === clipId
        ? keyframeProperty(clip, target, property, value, currentTime, easing)
        : clip),
    }));
  }

  function removeKeysAtCurrentTime() {
    if (!clipId) return;
    setDocument((current) => ({
      ...current,
      animations: current.animations.map((clip) => clip.id === clipId ? removeKeyframeAtTime(clip, currentTime) : clip),
    }));
  }

  function updateSelectedKeyframe(trackId: string, keyframeTime: number, patch: Partial<NumberKeyframe>) {
    if (!clipId) return;
    setDocument((current) => ({
      ...current,
      animations: current.animations.map((clip) => clip.id === clipId ? updateTrackKeyframe(clip, trackId, keyframeTime, patch) : clip),
    }));
  }

  function deleteSelectedKeyframe(trackId: string, keyframeTime: number) {
    if (!clipId) return;
    setDocument((current) => ({
      ...current,
      animations: current.animations.map((clip) => clip.id === clipId ? removeTrackKeyframe(clip, trackId, keyframeTime) : clip),
    }));
  }

  function startObjectDrag(event: ReactPointerEvent<SVGElement>, object: EditorObject) {
    event.stopPropagation();
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      selectNode(object.id, true);
      return;
    }
    selectNode(object.id);
    if (object.locked || !editingEnabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const basisRotation = object.boneId && displayDocument.rig
      ? (getBoneWorldPose(displayDocument.rig, object.boneId)?.rotation ?? 0)
      : 0;
    objectDrag.current = {
      id: object.id,
      pointer: { x: event.clientX, y: event.clientY },
      transform: object.transform,
      basisRotation,
    };
  }

  function moveObjectDrag(event: ReactPointerEvent<SVGElement>) {
    const drag = objectDrag.current;
    if (!drag) return;
    event.stopPropagation();
    const worldDelta = {
      x: (event.clientX - drag.pointer.x) / viewport.zoom,
      y: (event.clientY - drag.pointer.y) / viewport.zoom,
    };
    const localDelta = rotateVector(worldDelta, -drag.basisRotation);
    const x = drag.transform.x + localDelta.x;
    const y = drag.transform.y + localDelta.y;
    commit((current) => patchObjectTransform(current, drag.id, {
      x: snapToGrid ? snapValue(x, GRID_STEP) : x,
      y: snapToGrid ? snapValue(y, GRID_STEP) : y,
    }), {
      id: "move-object",
      label: "Move object",
      mergeKey: `move:${drag.id}`,
      interaction: true,
    });
  }

  function endObjectDrag(event: ReactPointerEvent<SVGElement>) {
    if (!objectDrag.current) return;
    event.stopPropagation();
    objectDrag.current = null;
    endInteraction();
  }

  return <main className="editor-shell">
    <header className="topbar">
      <div><strong>Flat Stories</strong><span>{document.name}</span></div>
      <div className="topbar-actions">
        <button type="button" aria-pressed={snapToGrid} onClick={() => setSnapToGrid((current) => !current)}>Snap 10</button>
        <button type="button" aria-pressed={showRig} onClick={() => setShowRig((current) => !current)}>Rig</button>
        {!editingEnabled ? <button type="button" aria-label="Preview renderer" onClick={() => {
          if (previewRenderer === "canvas") setPreviewRenderer("svg");
          else {
            setCanvasPreviewFailed(false);
            setPreviewRenderer("canvas");
          }
        }}>{previewRenderer === "canvas" ? "Preview Canvas" : "Preview SVG"}</button> : null}
        <button type="button" disabled={!canUndo} onClick={() => { undo(); setSelectedIds([]); }}>Undo</button>
        <button type="button" disabled={!canRedo} onClick={() => { redo(); setSelectedIds([]); }}>Redo</button>
        <ProjectControls document={document} onLoad={loadProject} />
        <SvgExportButton document={displayDocument} />
        <output>{Math.round(viewport.zoom * 100)}%</output>
      </div>
    </header>

    <aside className="toolbar" aria-label="Drawing tools">
      {tools.map((tool) => <button key={tool.kind} type="button" disabled={!editingEnabled} onClick={() => addObject(tool.kind)}>
        <span aria-hidden>{tool.label[0]}</span>{tool.label}</button>)}
      <button type="button" disabled={!editingEnabled} aria-pressed={penEnabled} aria-keyshortcuts="P" title="Pen (P)"
        onClick={togglePen}><span aria-hidden>✒</span>Pen</button>
      <hr />
      <button type="button" disabled={!canGroup || !editingEnabled} onClick={groupSelection}><span aria-hidden>G</span>Group</button>
      <button type="button" disabled={!canUngroup || !editingEnabled} onClick={ungroupSelection}><span aria-hidden>U</span>Ungroup</button>
      <button type="button" disabled={!editingEnabled || selectedIds.length === 0} onClick={duplicateSelection} {...shortcutProps("duplicate", "Duplicate")}><span aria-hidden>D</span>Duplicate</button>
    </aside>

    <section className="canvas-region" aria-label="Canvas workspace"
      data-preview-renderer={editingEnabled ? "svg-editing" : useCanvasPreview ? "canvas" : "svg"}
      onWheel={(event) => {
        event.preventDefault();
        setViewport((current) => ({ ...current, zoom: Math.min(3, Math.max(0.2, current.zoom * (event.deltaY > 0 ? 0.9 : 1.1))) }));
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.setPointerCapture(event.pointerId);
          panStart.current = { pointer: { x: event.clientX, y: event.clientY }, viewport };
        }
      }}
      onPointerMove={(event) => {
        const start = panStart.current;
        if (start) setViewport((current) => ({ ...current, x: start.viewport.x + event.clientX - start.pointer.x, y: start.viewport.y + event.clientY - start.pointer.y }));
      }}
      onPointerUp={() => { panStart.current = null; }}>
      {useCanvasPreview ? <AnimationCanvasPreview
        document={displayDocument}
        selectedIds={selectedIds}
        viewport={viewport}
        showRig={showRig}
        onionSkins={canvasOnionSkins}
        onSelectionChange={handlePreviewSelection}
        onBackendChange={handlePreviewBackendChange}
        onRenderFailure={handlePreviewFailure}
      /> : <svg className={penEnabled ? "artboard pen-active" : "artboard"} aria-label={document.name} width={document.width} height={document.height}
        viewBox={`0 0 ${document.width} ${document.height}`}
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
        onPointerDownCapture={(event) => penPointerEvent(event, "pointerdown")}
        onPointerMoveCapture={(event) => penPointerEvent(event, "pointermove")}
        onPointerUpCapture={(event) => penPointerEvent(event, "pointerup")}
        onPointerLeave={() => setPenPointer(null)}
        onPointerCancelCapture={releasePenPress}
        onLostPointerCapture={releasePenPress}
        onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedIds([]); }}>
        {onionSkinFrames.map((frame) => <g key={`${frame.kind}:${frame.time}`} data-onion-skin={frame.kind} data-sample-time={frame.time}
          aria-hidden="true" pointerEvents="none" opacity={frame.kind === "previous" ? 0.18 : 0.12}>
          {frame.document.objects.map((object) => <ObjectView
            key={object.id}
            object={object}
            rig={frame.document.rig}
            selectedIds={[]}
            inheritedSelection={false}
            editingEnabled={false}
            onPointerDown={startObjectDrag}
            onPointerMove={moveObjectDrag}
            onPointerUp={endObjectDrag}
            onDrawableChange={replaceDrawable}
            onRotationChange={(id, rotation) => setDocument((current) => patchObjectTransform(current, id, { rotation }))}
            onPathAnchorMove={(pathId, anchorId, point) => updatePath(pathId, (path) => movePathAnchor(path, anchorId, point))}
            onPathHandleMove={(pathId, anchorId, handle, point) => updatePath(pathId, (path) => updatePathHandle(path, anchorId, handle, point))}
            onPathToggleHandles={(pathId, anchorId) => updatePath(pathId, (path) => togglePathHandles(path, anchorId))}
          />)}
        </g>)}
        {displayDocument.objects.map((object) => <ObjectView
          key={object.id}
          object={object}
          rig={displayDocument.rig}
          selectedIds={selectedIds}
          inheritedSelection={false}
          editingEnabled={editingEnabled}
          onPointerDown={startObjectDrag}
          onPointerMove={moveObjectDrag}
          onPointerUp={endObjectDrag}
          onDrawableChange={replaceDrawable}
          onRotationChange={(id, rotation) => setDocument((current) => patchObjectTransform(current, id, { rotation }))}
          onPathAnchorMove={(pathId, anchorId, point) => updatePath(pathId, (path) => movePathAnchor(path, anchorId, point))}
          onPathHandleMove={(pathId, anchorId, handle, point) => updatePath(pathId, (path) => updatePathHandle(path, anchorId, handle, point))}
          onPathToggleHandles={(pathId, anchorId) => updatePath(pathId, (path) => togglePathHandles(path, anchorId))}
        />)}
        {showRig && displayDocument.rig ? <RigOverlay rig={displayDocument.rig} /> : null}
        {penEnabled && penSession.nodes.length > 0 ? <PenPreview session={penSession} pointer={penPointer} /> : null}
      </svg>}
    </section>

    <aside className="inspector" aria-label="Inspector">
      <section>
        <h2>Properties</h2>
        {!editingEnabled ? <p className="preview-note">Animation preview is read-only. Choose Rest pose to edit artwork or rig geometry.</p> : null}
        {selected ? <Properties object={selected} disabled={!editingEnabled} onChange={updateSelected} onTransformChange={updateSelectedTransform}
          onPathAddPoint={() => addPathPoint(selected.id)}
          onPathToggleClosed={() => updatePath(selected.id, (path) => ({ ...path, closed: !path.closed }))}
          onPathMirror={(axis) => updatePath(selected.id, (path) => mirrorPath(path, axis))} /> : <p>Select an object.</p>}
      </section>
      <section>
        <h2>Arrange</h2>
        <div className="arrange-actions">
          <button type="button" disabled={!editingEnabled || selectedIds.length === 0} onClick={duplicateSelection} {...shortcutProps("duplicate", "Duplicate")}>Duplicate</button>
          <button type="button" disabled={!editingEnabled || selectedIds.length !== 1} onClick={() => reorderSelection("backward")} {...shortcutProps("backward", "Send backward")}>Backward</button>
          <button type="button" disabled={!editingEnabled || selectedIds.length !== 1} onClick={() => reorderSelection("forward")} {...shortcutProps("forward", "Bring forward")}>Forward</button>
          <button type="button" disabled={!editingEnabled || selectedIds.length !== 1} onClick={() => reorderSelection("back")}>To back</button>
          <button type="button" disabled={!editingEnabled || selectedIds.length !== 1} onClick={() => reorderSelection("front")}>To front</button>
        </div>
        <div className="arrange-actions compact">
          <button type="button" disabled={!canArrange} onClick={() => alignSelection("left")} {...shortcutProps("alignLeft", "Align left")}>Align L</button>
          <button type="button" disabled={!canArrange} onClick={() => alignSelection("center-x")} {...shortcutProps("alignCenterX", "Align horizontal centers")}>Align H</button>
          <button type="button" disabled={!canArrange} onClick={() => alignSelection("right")} {...shortcutProps("alignRight", "Align right")}>Align R</button>
          <button type="button" disabled={!canArrange} onClick={() => alignSelection("top")} {...shortcutProps("alignTop", "Align top")}>Align T</button>
          <button type="button" disabled={!canArrange} onClick={() => alignSelection("center-y")} {...shortcutProps("alignCenterY", "Align vertical centers")}>Align V</button>
          <button type="button" disabled={!canArrange} onClick={() => alignSelection("bottom")} {...shortcutProps("alignBottom", "Align bottom")}>Align B</button>
          <button type="button" disabled={!canArrange || selectedIds.length < 3} onClick={() => distributeSelection("horizontal")} {...shortcutProps("distributeHorizontal", "Distribute horizontally")}>Dist H</button>
          <button type="button" disabled={!canArrange || selectedIds.length < 3} onClick={() => distributeSelection("vertical")} {...shortcutProps("distributeVertical", "Distribute vertically")}>Dist V</button>
        </div>
      </section>
      <section>
        <h2>Layers</h2>
        <LayerTreePanel document={document} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      </section>
      <CharacterPresetPanel
        poses={document.poses ?? []}
        expressions={document.expressions ?? []}
        disabled={!editingEnabled}
        canCapturePose={Boolean(document.rig)}
        selectedCount={selectedIds.length}
        onCapturePose={savePose}
        onApplyPose={applySavedPose}
        onCaptureExpression={saveExpression}
        onApplyExpression={applySavedExpression}
      />
      {document.rig ? <RigPanel rig={document.rig} disabled={!editingEnabled} onChange={updateRig} /> : null}
    </aside>

    <footer className="timeline" aria-label="Animation timeline">
      <div className="timeline-header">
        <strong>Animation</strong>
        <select aria-label="Animation clip" value={clipId ?? ""} onChange={(event) => {
          setClipId(event.target.value || null);
          setCurrentTime(0);
        }}>
          <option value="">Rest pose</option>
          {document.animations.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
        </select>
        <output>{currentTime.toFixed(2)}s{selectedClip ? ` / ${selectedClip.duration.toFixed(2)}s · ${previewStatus}` : ""}</output>
      </div>
      <PlaybackControls key={selectedClip?.id ?? "rest"} clip={selectedClip} currentTime={currentTime} onTimeChange={setCurrentTime} />
      <OnionSkinControls enabled={onionSkinEnabled} offsetSeconds={onionSkinOffset} clipSelected={Boolean(selectedClip)}
        onEnabledChange={setOnionSkinEnabled} onOffsetChange={setOnionSkinOffset} />
      <TimelinePoseControls poses={document.poses ?? []} clipSelected={Boolean(selectedClip)}
        onKeyPose={keyPoseAtCurrentTime} onRemoveKeysAtTime={removeKeysAtCurrentTime} />
      <PropertyKeyControls selectedNode={displaySelected} rig={displayDocument.rig} clipSelected={Boolean(selectedClip)} currentTime={currentTime}
        onKey={keyPropertyAtCurrentTime} />
      <KeyframeInspector clip={selectedClip} onUpdate={updateSelectedKeyframe} onDelete={deleteSelectedKeyframe} />
      <input aria-label="Timeline time" type="range" min={0} max={selectedClip?.duration ?? 0} step={0.01}
        disabled={!selectedClip} value={Math.min(currentTime, selectedClip?.duration ?? 0)}
        onChange={(event) => setCurrentTime(Number(event.target.value))} />
      <div className="track-list">
        {selectedClip?.tracks.map((track) => <span key={track.id}>{track.target.kind}:{track.target.id} · {track.property}</span>) ?? <span>No animation selected.</span>}
      </div>
    </footer>
  </main>;
}

function ObjectView({ object, rig, selectedIds, inheritedSelection, editingEnabled, onPointerDown, onPointerMove, onPointerUp,
  onDrawableChange, onRotationChange, onPathAnchorMove, onPathHandleMove, onPathToggleHandles }: {
  object: EditorObject;
  rig?: CharacterRig;
  selectedIds: readonly string[];
  inheritedSelection: boolean;
  editingEnabled: boolean;
  onPointerDown: (event: ReactPointerEvent<SVGElement>, object: EditorObject) => void;
  onPointerMove: (event: ReactPointerEvent<SVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGElement>) => void;
  onDrawableChange: (id: string, object: DrawableObject) => void;
  onRotationChange: (id: string, rotation: number) => void;
  onPathAnchorMove: (pathId: string, anchorId: string, point: Point) => void;
  onPathHandleMove: (pathId: string, anchorId: string, handle: PathHandle, point: Point) => void;
  onPathToggleHandles: (pathId: string, anchorId: string) => void;
}) {
  if (!object.visible) return null;
  const exactSelected = selectedIds.includes(object.id);
  const selected = inheritedSelection || exactSelected;
  const nodeTransform = objectTransformToSvg(object.transform);
  const boneTransform = object.boneId && rig ? boneWorldTransformToSvg(rig, object.boneId) : undefined;
  const interaction = {
    onPointerDown: (event: ReactPointerEvent<SVGElement>) => onPointerDown(event, object),
    onPointerMove,
    onPointerUp,
  };

  const content = object.kind === "group"
    ? <g transform={nodeTransform} opacity={object.opacity} data-node-id={object.id}>
        {object.children.map((child) => <ObjectView key={child.id} object={child} rig={rig} selectedIds={selectedIds}
          inheritedSelection={selected} editingEnabled={editingEnabled} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onDrawableChange={onDrawableChange} onRotationChange={onRotationChange}
          onPathAnchorMove={onPathAnchorMove} onPathHandleMove={onPathHandleMove} onPathToggleHandles={onPathToggleHandles} />)}
      </g>
    : <g transform={nodeTransform} opacity={object.opacity} data-node-id={object.id}>
        <DrawableView object={object} selected={selected} interaction={interaction} />
        {exactSelected && !object.locked && editingEnabled ? <TransformOverlay object={object}
          onGeometryChange={(next) => onDrawableChange(object.id, next)}
          onRotationChange={(rotation) => onRotationChange(object.id, rotation)} /> : null}
        {object.kind === "path" && exactSelected && !object.locked && editingEnabled ? <PathEditorOverlay path={object.path}
          onMoveAnchor={(anchorId, point) => onPathAnchorMove(object.id, anchorId, point)}
          onMoveHandle={(anchorId, handle, point) => onPathHandleMove(object.id, anchorId, handle, point)}
          onToggleHandles={(anchorId) => onPathToggleHandles(object.id, anchorId)} /> : null}
      </g>;

  return boneTransform ? <g transform={boneTransform}>{content}</g> : content;
}

function DrawableView({ object, selected, interaction }: {
  object: Exclude<EditorObject, GroupObject>;
  selected: boolean;
  interaction: {
    onPointerDown: (event: ReactPointerEvent<SVGElement>) => void;
    onPointerMove: (event: ReactPointerEvent<SVGElement>) => void;
    onPointerUp: (event: ReactPointerEvent<SVGElement>) => void;
  };
}) {
  const common = {
    fill: object.fill,
    stroke: object.stroke,
    strokeWidth: object.strokeWidth,
    strokeLinecap: object.strokeLinecap,
    strokeLinejoin: object.strokeLinejoin,
    className: selected ? "selected-object" : undefined,
    ...interaction,
  };
  switch (object.kind) {
    case "rectangle": return <rect {...common} x={object.x} y={object.y} width={object.width} height={object.height} rx={object.cornerRadius} />;
    case "circle": return <circle {...common} cx={object.cx} cy={object.cy} r={object.radius} />;
    case "path": return <path {...common} d={pathToSvg(object.path)} />;
    case "text": return <text {...common} x={object.x} y={object.y} fontSize={object.fontSize} fontWeight="700">{object.value}</text>;
  }
}

function Properties({ object, disabled, onChange, onTransformChange, onPathAddPoint, onPathToggleClosed, onPathMirror }: {
  object: EditorObject;
  disabled: boolean;
  onChange: (patch: Partial<EditorObject>) => void;
  onTransformChange: (patch: Partial<Transform>) => void;
  onPathAddPoint: () => void;
  onPathToggleClosed: () => void;
  onPathMirror: (axis: "horizontal" | "vertical") => void;
}) {
  return <fieldset className="properties" disabled={disabled}>
    <label>Name<input value={object.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <NumberField label="X" value={object.transform.x} onChange={(value) => onTransformChange({ x: value })} />
    <NumberField label="Y" value={object.transform.y} onChange={(value) => onTransformChange({ y: value })} />
    <NumberField label="Rotate" value={object.transform.rotation} onChange={(value) => onTransformChange({ rotation: value })} />
    <NumberField label="Pivot X" value={object.transform.pivotX} onChange={(value) => onTransformChange({ pivotX: value })} />
    <NumberField label="Pivot Y" value={object.transform.pivotY} onChange={(value) => onTransformChange({ pivotY: value })} />
    <NumberField label="Scale X" value={object.transform.scaleX} step={0.05} onChange={(value) => onTransformChange({ scaleX: value })} />
    <NumberField label="Scale Y" value={object.transform.scaleY} step={0.05} onChange={(value) => onTransformChange({ scaleY: value })} />
    <NumberField label="Opacity" value={object.opacity} step={0.05} min={0} max={1} onChange={(value) => onChange({ opacity: value })} />
    <label>Visible<input type="checkbox" checked={object.visible} onChange={(event) => onChange({ visible: event.target.checked })} /></label>
    <label>Locked<input type="checkbox" checked={object.locked} onChange={(event) => onChange({ locked: event.target.checked })} /></label>
    {object.kind !== "group" ? <>
      <label>Fill<input type="color" value={object.fill === "none" ? "#000000" : object.fill} onChange={(event) => onChange({ fill: event.target.value } as Partial<EditorObject>)} /></label>
      <label>Stroke<input value={object.stroke ?? ""} placeholder="none" onChange={(event) => onChange({ stroke: event.target.value || undefined } as Partial<EditorObject>)} /></label>
      <NumberField label="Stroke W" value={object.strokeWidth ?? 1} min={0} step={0.5} onChange={(value) => onChange({ strokeWidth: value } as Partial<EditorObject>)} />
      <label>Line cap<select value={object.strokeLinecap ?? "butt"} onChange={(event) => onChange({ strokeLinecap: event.target.value as StrokeLinecap } as Partial<EditorObject>)}><option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option></select></label>
      <label>Line join<select value={object.strokeLinejoin ?? "miter"} onChange={(event) => onChange({ strokeLinejoin: event.target.value as StrokeLinejoin } as Partial<EditorObject>)}><option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option></select></label>
    </> : null}
    {object.kind === "text" ? <>
      <label>Text<input value={object.value} onChange={(event) => onChange({ value: event.target.value } as Partial<EditorObject>)} /></label>
      <NumberField label="Font" value={object.fontSize} min={1} onChange={(value) => onChange({ fontSize: value } as Partial<EditorObject>)} />
    </> : null}
    {object.kind === "rectangle" ? <>
      <NumberField label="Width" value={object.width} min={1} onChange={(value) => onChange({ width: value } as Partial<EditorObject>)} />
      <NumberField label="Height" value={object.height} min={1} onChange={(value) => onChange({ height: value } as Partial<EditorObject>)} />
      <NumberField label="Radius" value={object.cornerRadius} min={0} onChange={(value) => onChange({ cornerRadius: value } as Partial<EditorObject>)} />
    </> : null}
    {object.kind === "circle" ? <NumberField label="Radius" value={object.radius} min={1} onChange={(value) => onChange({ radius: value } as Partial<EditorObject>)} /> : null}
    {object.kind === "path" ? <div className="path-actions">
      <label>Points<output aria-label="Path point count">{object.path.anchors.length}</output></label>
      <div><button type="button" onClick={onPathAddPoint}>Add point</button><button type="button" onClick={onPathToggleClosed}>{object.path.closed ? "Open path" : "Close path"}</button></div>
      <div><button type="button" onClick={() => onPathMirror("horizontal")}>Flip H</button><button type="button" onClick={() => onPathMirror("vertical")}>Flip V</button></div>
      <small>Drag anchors and Bézier handles on canvas. Double-click an anchor to add or remove handles.</small>
    </div> : null}
  </fieldset>;
}

function NumberField({ label, value, onChange, min, max, step = 1 }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return <label>{label}<input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step}
    onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function RigPanel({ rig, disabled, onChange }: { rig: CharacterRig; disabled: boolean; onChange: (update: (rig: CharacterRig) => CharacterRig) => void }) {
  return <section>
    <div className="section-heading"><h2>Rig</h2><button type="button" disabled={disabled} onClick={() => onChange(resetRigPose)}>Reset pose</button></div>
    <div className="bone-list">{rig.bones.map((bone) => <span key={bone.id}>{bone.name}<output>{bone.rotation.toFixed(1)}°</output></span>)}</div>
    <fieldset className="constraints" disabled={disabled}>{rig.constraints.map((constraint) => <article key={constraint.id}>
      <strong>{constraint.name}</strong>
      <NumberField label="Target X" value={constraint.target.x} onChange={(x) => onChange((current) => updateConstraintTarget(current, constraint.id, { x }))} />
      <NumberField label="Target Y" value={constraint.target.y} onChange={(y) => onChange((current) => updateConstraintTarget(current, constraint.id, { y }))} />
      <button type="button" onClick={() => onChange((current) => solveRigConstraint(current, constraint.id))}>Solve IK</button>
    </article>)}</fieldset>
  </section>;
}

function RigOverlay({ rig }: { rig: CharacterRig }) {
  return <g className="rig-overlay" aria-hidden="true">
    {rig.bones.map((bone) => {
      const pose = getBoneWorldPose(rig, bone.id);
      return pose ? <g key={bone.id}>
        <line x1={pose.origin.x} y1={pose.origin.y} x2={pose.end.x} y2={pose.end.y} />
        <circle cx={pose.origin.x} cy={pose.origin.y} r={5} />
      </g> : null;
    })}
    {rig.constraints.filter((constraint) => constraint.enabled).map((constraint) => <g key={constraint.id} className="ik-target">
      <circle cx={constraint.target.x} cy={constraint.target.y} r={9} />
      <path d={`M${constraint.target.x - 13} ${constraint.target.y}H${constraint.target.x + 13}M${constraint.target.x} ${constraint.target.y - 13}V${constraint.target.y + 13}`} />
    </g>)}
  </g>;
}
