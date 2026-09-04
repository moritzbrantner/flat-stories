"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { sampleAnimation } from "./animation";
import { browserEditorEngine } from "./engine";
import type { CharacterRig, EditorDocument, EditorObject, GroupObject, Point, Transform } from "./model";
import { createObject, type CreatableObjectKind } from "./objectFactory";
import {
  findObject,
  flattenObjects,
  groupRootObjects,
  objectTransformToSvg,
  patchObject,
  patchObjectTransform,
  ungroupRootObject,
} from "./sceneGraph";
import {
  boneWorldTransformToSvg,
  getBoneWorldPose,
  resetRigPose,
  solveRigConstraint,
  updateConstraintTarget,
} from "./rig";
import { pathToSvg } from "./vectorPath";

type EditorProps = { initialDocument: EditorDocument };
type Viewport = Point & { zoom: number };
type DragState = { id: string; pointer: Point; transform: Transform; basisRotation: number };

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

export function Editor({ initialDocument }: EditorProps) {
  const prepared = useMemo(() => browserEditorEngine.prepareDocument(initialDocument), [initialDocument]);
  const [document, setDocument] = useState(prepared);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => prepared.objects.at(-1)?.id ? [prepared.objects.at(-1)!.id] : []);
  const [viewport, setViewport] = useState<Viewport>({ x: 70, y: 50, zoom: 0.85 });
  const [showRig, setShowRig] = useState(Boolean(prepared.rig));
  const [clipId, setClipId] = useState<string | null>(prepared.animations[0]?.id ?? null);
  const [currentTime, setCurrentTime] = useState(0);
  const panStart = useRef<{ pointer: Point; viewport: Point } | null>(null);
  const objectDrag = useRef<DragState | null>(null);
  const idCounter = useRef(0);

  const flatObjects = useMemo(() => flattenObjects(document.objects), [document.objects]);
  const selectedId = selectedIds.at(-1) ?? null;
  const selected = selectedId ? findObject(document.objects, selectedId) : null;
  const selectedClip = document.animations.find((clip) => clip.id === clipId) ?? null;
  const displayDocument = useMemo(() => sampleAnimation(document, clipId, currentTime), [document, clipId, currentTime]);
  const rootIds = useMemo(() => new Set(document.objects.map((object) => object.id)), [document.objects]);
  const canGroup = selectedIds.length > 1 && selectedIds.every((id) => rootIds.has(id));
  const canUngroup = selectedIds.length === 1 && rootIds.has(selectedIds[0]) && selected?.kind === "group";

  function nextId(prefix: string) {
    let id: string;
    do id = `${prefix}-${++idCounter.current}`;
    while (findObject(document.objects, id));
    return id;
  }

  function selectNode(id: string, additive = false) {
    setSelectedIds((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id];
    });
  }

  function addObject(kind: CreatableObjectKind) {
    const object = createObject(kind, nextId(kind));
    setDocument((current) => ({ ...current, objects: [...current.objects, object] }));
    setSelectedIds([object.id]);
  }

  function updateSelected(patch: Partial<EditorObject>) {
    if (!selectedId) return;
    setDocument((current) => patchObject(current, selectedId, patch));
  }

  function updateSelectedTransform(patch: Partial<Transform>) {
    if (!selectedId) return;
    setDocument((current) => patchObjectTransform(current, selectedId, patch));
  }

  function groupSelection() {
    if (!canGroup) return;
    const id = nextId("group");
    setDocument((current) => groupRootObjects(current, selectedIds, id));
    setSelectedIds([id]);
  }

  function ungroupSelection() {
    if (!canUngroup || !selectedId || selected?.kind !== "group") return;
    const childIds = selected.children.map((child) => child.id);
    setDocument((current) => ungroupRootObject(current, selectedId));
    setSelectedIds(childIds);
  }

  function updateRig(update: (rig: CharacterRig) => CharacterRig) {
    setDocument((current) => current.rig ? { ...current, rig: update(current.rig) } : current);
  }

  function startObjectDrag(event: ReactPointerEvent<SVGElement>, object: EditorObject) {
    event.stopPropagation();
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      selectNode(object.id, true);
      return;
    }
    selectNode(object.id);
    if (object.locked) return;
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
    setDocument((current) => patchObjectTransform(current, drag.id, {
      x: drag.transform.x + localDelta.x,
      y: drag.transform.y + localDelta.y,
    }));
  }

  function endObjectDrag(event: ReactPointerEvent<SVGElement>) {
    if (!objectDrag.current) return;
    event.stopPropagation();
    objectDrag.current = null;
  }

  return <main className="editor-shell">
    <header className="topbar">
      <div><strong>Flat Stories</strong><span>{document.name}</span></div>
      <div className="topbar-actions">
        <button type="button" aria-pressed={showRig} onClick={() => setShowRig((current) => !current)}>Rig</button>
        <output>{Math.round(viewport.zoom * 100)}%</output>
      </div>
    </header>

    <aside className="toolbar" aria-label="Drawing tools">
      {tools.map((tool) => <button key={tool.kind} type="button" onClick={() => addObject(tool.kind)}>
        <span aria-hidden>{tool.label[0]}</span>{tool.label}
      </button>)}
      <hr />
      <button type="button" disabled={!canGroup} onClick={groupSelection}><span aria-hidden>G</span>Group</button>
      <button type="button" disabled={!canUngroup} onClick={ungroupSelection}><span aria-hidden>U</span>Ungroup</button>
    </aside>

    <section className="canvas-region" aria-label="Canvas workspace"
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
      <svg className="artboard" aria-label={document.name} width={document.width} height={document.height}
        viewBox={`0 0 ${document.width} ${document.height}`}
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
        onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedIds([]); }}>
        {displayDocument.objects.map((object) => <ObjectView
          key={object.id}
          object={object}
          rig={displayDocument.rig}
          selectedIds={selectedIds}
          inheritedSelection={false}
          onPointerDown={startObjectDrag}
          onPointerMove={moveObjectDrag}
          onPointerUp={endObjectDrag}
        />)}
        {showRig && displayDocument.rig ? <RigOverlay rig={displayDocument.rig} /> : null}
      </svg>
    </section>

    <aside className="inspector" aria-label="Inspector">
      <section>
        <h2>Properties</h2>
        {selected ? <Properties object={selected} onChange={updateSelected} onTransformChange={updateSelectedTransform} /> : <p>Select an object.</p>}
      </section>
      <section>
        <h2>Layers</h2>
        <ol className="layers">{flatObjects.map(({ node, depth }) => <li key={node.id}>
          <button type="button" aria-pressed={selectedIds.includes(node.id)} style={{ paddingLeft: 8 + depth * 14 }}
            onClick={(event) => selectNode(node.id, event.shiftKey || event.metaKey || event.ctrlKey)}>
            <span>{node.kind}</span>{node.name}
          </button>
        </li>)}</ol>
      </section>
      {document.rig ? <RigPanel rig={document.rig} onChange={updateRig} /> : null}
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
        <output>{currentTime.toFixed(2)}s{selectedClip ? ` / ${selectedClip.duration.toFixed(2)}s` : ""}</output>
      </div>
      <input aria-label="Timeline time" type="range" min={0} max={selectedClip?.duration ?? 0} step={0.01}
        disabled={!selectedClip} value={Math.min(currentTime, selectedClip?.duration ?? 0)}
        onChange={(event) => setCurrentTime(Number(event.target.value))} />
      <div className="track-list">
        {selectedClip?.tracks.map((track) => <span key={track.id}>{track.target.kind}:{track.target.id} · {track.property}</span>) ?? <span>No animation selected.</span>}
      </div>
    </footer>
  </main>;
}

function ObjectView({ object, rig, selectedIds, inheritedSelection, onPointerDown, onPointerMove, onPointerUp }: {
  object: EditorObject;
  rig?: CharacterRig;
  selectedIds: readonly string[];
  inheritedSelection: boolean;
  onPointerDown: (event: ReactPointerEvent<SVGElement>, object: EditorObject) => void;
  onPointerMove: (event: ReactPointerEvent<SVGElement>) => void;
  onPointerUp: (event: ReactPointerEvent<SVGElement>) => void;
}) {
  if (!object.visible) return null;
  const selected = inheritedSelection || selectedIds.includes(object.id);
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
          inheritedSelection={selected} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />)}
      </g>
    : <g transform={nodeTransform} opacity={object.opacity} data-node-id={object.id}>
        <DrawableView object={object} selected={selected} interaction={interaction} />
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

function Properties({ object, onChange, onTransformChange }: {
  object: EditorObject;
  onChange: (patch: Partial<EditorObject>) => void;
  onTransformChange: (patch: Partial<Transform>) => void;
}) {
  return <div className="properties">
    <label>Name<input value={object.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <NumberField label="X" value={object.transform.x} onChange={(value) => onTransformChange({ x: value })} />
    <NumberField label="Y" value={object.transform.y} onChange={(value) => onTransformChange({ y: value })} />
    <NumberField label="Rotate" value={object.transform.rotation} onChange={(value) => onTransformChange({ rotation: value })} />
    <NumberField label="Scale X" value={object.transform.scaleX} step={0.05} onChange={(value) => onTransformChange({ scaleX: value })} />
    <NumberField label="Scale Y" value={object.transform.scaleY} step={0.05} onChange={(value) => onTransformChange({ scaleY: value })} />
    <NumberField label="Opacity" value={object.opacity} step={0.05} min={0} max={1} onChange={(value) => onChange({ opacity: value })} />
    <label>Visible<input type="checkbox" checked={object.visible} onChange={(event) => onChange({ visible: event.target.checked })} /></label>
    <label>Locked<input type="checkbox" checked={object.locked} onChange={(event) => onChange({ locked: event.target.checked })} /></label>
    {object.kind !== "group" ? <>
      <label>Fill<input type="color" value={object.fill === "none" ? "#000000" : object.fill} onChange={(event) => onChange({ fill: event.target.value } as Partial<EditorObject>)} /></label>
      <label>Stroke<input value={object.stroke ?? ""} placeholder="none" onChange={(event) => onChange({ stroke: event.target.value || undefined } as Partial<EditorObject>)} /></label>
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
    {object.kind === "path" ? <label>Points<output>{object.path.anchors.length}</output></label> : null}
  </div>;
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

function RigPanel({ rig, onChange }: { rig: CharacterRig; onChange: (update: (rig: CharacterRig) => CharacterRig) => void }) {
  return <section>
    <div className="section-heading"><h2>Rig</h2><button type="button" onClick={() => onChange(resetRigPose)}>Reset pose</button></div>
    <div className="bone-list">{rig.bones.map((bone) => <span key={bone.id}>{bone.name}<output>{bone.rotation.toFixed(1)}°</output></span>)}</div>
    <div className="constraints">{rig.constraints.map((constraint) => <article key={constraint.id}>
      <strong>{constraint.name}</strong>
      <NumberField label="Target X" value={constraint.target.x} onChange={(x) => onChange((current) => updateConstraintTarget(current, constraint.id, { x }))} />
      <NumberField label="Target Y" value={constraint.target.y} onChange={(y) => onChange((current) => updateConstraintTarget(current, constraint.id, { y }))} />
      <button type="button" onClick={() => onChange((current) => solveRigConstraint(current, constraint.id))}>Solve IK</button>
    </article>)}</div>
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
