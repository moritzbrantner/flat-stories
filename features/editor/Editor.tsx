"use client";

import { useMemo, useRef, useState } from "react";
import { browserEditorEngine } from "./engine";
import type { EditorDocument, EditorObject, Point } from "./model";
import { createObject, type CreatableObjectKind } from "./objectFactory";

type EditorProps = { initialDocument: EditorDocument };
type Viewport = Point & { zoom: number };

const tools: { kind: CreatableObjectKind; label: string }[] = [
  { kind: "rectangle", label: "Rectangle" }, { kind: "circle", label: "Circle" },
  { kind: "path", label: "Path" }, { kind: "text", label: "Text" },
];

export function Editor({ initialDocument }: EditorProps) {
  const prepared = useMemo(() => browserEditorEngine.prepareDocument(initialDocument), [initialDocument]);
  const [document, setDocument] = useState(prepared);
  const [selectedId, setSelectedId] = useState<string | null>(prepared.objects.at(-1)?.id ?? null);
  const [viewport, setViewport] = useState<Viewport>({ x: 70, y: 50, zoom: 0.85 });
  const dragStart = useRef<{ pointer: Point; viewport: Point } | null>(null);
  const idCounter = useRef(0);
  const selected = document.objects.find((object) => object.id === selectedId) ?? null;

  function addObject(kind: CreatableObjectKind) {
    const object = createObject(kind, `${kind}-${++idCounter.current}`);
    setDocument((current) => ({ ...current, objects: [...current.objects, object] }));
    setSelectedId(object.id);
  }

  function updateSelected(patch: Partial<EditorObject>) {
    setDocument((current) => ({ ...current, objects: current.objects.map((object) => object.id === selectedId ? { ...object, ...patch } as EditorObject : object) }));
  }

  return <main className="editor-shell">
    <header className="topbar"><div><strong>Flat Stories</strong><span>{document.name}</span></div><output>{Math.round(viewport.zoom * 100)}%</output></header>
    <aside className="toolbar" aria-label="Drawing tools">
      {tools.map((tool) => <button key={tool.kind} type="button" onClick={() => addObject(tool.kind)}><span aria-hidden>{tool.label[0]}</span>{tool.label}</button>)}
    </aside>
    <section className="canvas-region" aria-label="Canvas workspace"
      onWheel={(event) => { event.preventDefault(); setViewport((current) => ({ ...current, zoom: Math.min(3, Math.max(0.2, current.zoom * (event.deltaY > 0 ? 0.9 : 1.1))) })); }}
      onPointerDown={(event) => { if (event.target === event.currentTarget) { event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = { pointer: { x: event.clientX, y: event.clientY }, viewport }; } }}
      onPointerMove={(event) => { const start = dragStart.current; if (start) setViewport((current) => ({ ...current, x: start.viewport.x + event.clientX - start.pointer.x, y: start.viewport.y + event.clientY - start.pointer.y })); }}
      onPointerUp={() => { dragStart.current = null; }}>
      <svg className="artboard" aria-label={document.name} width={document.width} height={document.height} viewBox={`0 0 ${document.width} ${document.height}`} style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
        {document.objects.map((object) => <ObjectView key={object.id} object={object} selected={object.id === selectedId} onSelect={() => setSelectedId(object.id)} />)}
      </svg>
    </section>
    <aside className="inspector">
      <section><h2>Properties</h2>{selected ? <Properties object={selected} onChange={updateSelected} /> : <p>Select an object.</p>}</section>
      <section><h2>Layers</h2><ol className="layers">{[...document.objects].reverse().map((object) => <li key={object.id}><button type="button" aria-pressed={object.id === selectedId} onClick={() => setSelectedId(object.id)}><span>{object.kind}</span>{object.name}</button></li>)}</ol></section>
    </aside>
  </main>;
}

function ObjectView({ object, selected, onSelect }: { object: EditorObject; selected: boolean; onSelect: () => void }) {
  const common = { fill: object.fill, onPointerDown: (event: React.PointerEvent) => { event.stopPropagation(); onSelect(); }, className: selected ? "selected-object" : undefined };
  switch (object.kind) {
    case "rectangle": return <rect {...common} x={object.x} y={object.y} width={object.width} height={object.height} />;
    case "circle": return <circle {...common} cx={object.cx} cy={object.cy} r={object.radius} />;
    case "path": return <path {...common} d={object.d} />;
    case "text": return <text {...common} x={object.x} y={object.y} fontSize={object.fontSize} fontWeight="700">{object.value}</text>;
  }
}

function Properties({ object, onChange }: { object: EditorObject; onChange: (patch: Partial<EditorObject>) => void }) {
  return <div className="properties">
    <label>Name<input value={object.name} onChange={(event) => onChange({ name: event.target.value })} /></label>
    <label>Fill<input type="color" value={object.fill} onChange={(event) => onChange({ fill: event.target.value })} /></label>
    {object.kind === "text" && <label>Text<input value={object.value} onChange={(event) => onChange({ value: event.target.value } as Partial<EditorObject>)} /></label>}
    {object.kind === "rectangle" && <label>Width<input type="number" value={object.width} onChange={(event) => onChange({ width: Number(event.target.value) } as Partial<EditorObject>)} /></label>}
    {object.kind === "circle" && <label>Radius<input type="number" value={object.radius} onChange={(event) => onChange({ radius: Number(event.target.value) } as Partial<EditorObject>)} /></label>}
    {object.kind === "path" && <label>Path<input value={object.d} onChange={(event) => onChange({ d: event.target.value } as Partial<EditorObject>)} /></label>}
  </div>;
}
