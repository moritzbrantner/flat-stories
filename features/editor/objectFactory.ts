import { createIdentityTransform, type DrawableObject, type VectorPath } from "./model";

export type CreatableObjectKind = DrawableObject["kind"];

function common(id: string, kind: CreatableObjectKind) {
  return {
    id,
    name: `${kind[0].toUpperCase()}${kind.slice(1)}`,
    fill: "#2563eb",
    transform: createIdentityTransform(),
    opacity: 1,
    visible: true,
    locked: false,
  };
}

function trianglePath(id: string): VectorPath {
  return {
    closed: true,
    anchors: [
      { id: `${id}-a1`, point: { x: 280, y: 330 } },
      { id: `${id}-a2`, point: { x: 400, y: 180 } },
      { id: `${id}-a3`, point: { x: 520, y: 330 } },
    ],
  };
}

export function createObject(kind: CreatableObjectKind, id: string): DrawableObject {
  const base = common(id, kind);
  switch (kind) {
    case "rectangle": return { ...base, kind, x: 250, y: 190, width: 160, height: 100, cornerRadius: 18 };
    case "circle": return { ...base, kind, cx: 400, cy: 260, radius: 70 };
    case "path": return { ...base, kind, path: trianglePath(id) };
    case "text": return { ...base, kind, x: 300, y: 260, value: "New text", fontSize: 36 };
  }
}
